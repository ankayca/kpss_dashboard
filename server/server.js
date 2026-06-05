/* ============================================================
   KPSS Çalışma Paneli — minimal storage + auth API.

   Zero-dependency Node HTTP server. Stores each user's study
   data in a single JSON file on disk (the Raspberry Pi), so the
   data lives on the server instead of the browser's IndexedDB.

   Auth: real accounts (email/password + Google Sign-In). Accounts
   live in users.json, sessions in sessions.json. Passwords are
   hashed with the built-in crypto.scrypt (no dependencies). Google
   ID tokens are verified against Google's tokeninfo endpoint.

   Run:  node server/server.js
   Env:  PORT             (default 8090)
         KPSS_DATA_DIR    (default ./server/data)
         GOOGLE_CLIENT_ID (default: the dashboard's client id)
         GEMINI_API_KEY   (optional; enables POST /api/classify — photo→topic AI)
         GEMINI_MODEL     (default gemini-2.5-flash-lite)
   ============================================================ */
import http from "node:http";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8090;
const DATA_DIR = process.env.KPSS_DATA_DIR
  ? path.resolve(process.env.KPSS_DATA_DIR)
  : path.join(__dirname, "data");

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "265612832039-robfjtm3on0ietmkdoon6ihuu4nrdp74.apps.googleusercontent.com";

/* ---- AI topic classification (Gemini) ----
   Reads a photographed deneme page + the wrong question numbers and
   maps each to a {section, topic} from the user's profile taxonomy.
   The API key is server-side only (never shipped to the browser). */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const CLASSIFY_TIMEOUT_MS = 45_000;
const MAX_CLASSIFY_IMAGES = 6;
const MAX_CLASSIFY_WRONG = 60;

/* Tiny in-memory cache so identical re-submits (retries, the same published
   deneme page) reuse the model answer instead of re-billing the API. */
const CLASSIFY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CLASSIFY_CACHE_MAX = 200;
const classifyCache = new Map(); // key -> { results, model, exp }

function classifyCacheGet(key) {
  const e = classifyCache.get(key);
  if (!e) return null;
  if (e.exp < Date.now()) {
    classifyCache.delete(key);
    return null;
  }
  return e;
}
function classifyCacheSet(key, val) {
  if (classifyCache.size >= CLASSIFY_CACHE_MAX) {
    classifyCache.delete(classifyCache.keys().next().value);
  }
  classifyCache.set(key, { ...val, exp: Date.now() + CLASSIFY_CACHE_TTL_MS });
}

/** Exam profiles a new account may pick from (mirrors src/config.js). */
const PROFILE_IDS = ["kpssLisans", "agsOkulOncesi"];

const COLLECTIONS = ["books", "sessions", "trials", "subjectTrials", "reviews"];

const SESSION_COOKIE = "kpss_sid";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function emptyDoc() {
  const doc = { meta: {} };
  for (const c of COLLECTIONS) doc[c] = {};
  return doc;
}

/* ---- per-user persistence (in-memory cache + atomic disk writes) ---- */

const cache = new Map(); // userId -> doc
const writeQueues = new Map(); // userId -> Promise chain (serialize writes per user)

function fileFor(userId) {
  return path.join(DATA_DIR, `${userId}.json`);
}

async function loadDoc(userId) {
  if (cache.has(userId)) return cache.get(userId);
  let doc;
  try {
    const raw = await fs.readFile(fileFor(userId), "utf8");
    const parsed = JSON.parse(raw);
    doc = { ...emptyDoc(), ...parsed };
    if (!doc.meta || typeof doc.meta !== "object") doc.meta = {};
    for (const c of COLLECTIONS) {
      if (!doc[c] || typeof doc[c] !== "object") doc[c] = {};
    }
  } catch (_) {
    doc = emptyDoc();
  }
  cache.set(userId, doc);
  return doc;
}

/** Persist a user's doc atomically (write temp file, then rename). */
function saveDoc(userId) {
  const prev = writeQueues.get(userId) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const doc = cache.get(userId);
      if (!doc) return;
      await fs.mkdir(DATA_DIR, { recursive: true });
      const file = fileFor(userId);
      const tmp = `${file}.tmp-${process.pid}`;
      await fs.writeFile(tmp, JSON.stringify(doc), "utf8");
      await fs.rename(tmp, file);
    });
  writeQueues.set(userId, next);
  return next;
}

/* ---- accounts + sessions (single JSON files, atomic writes) ---- */

const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

let users = null; // id -> account record
let sessions = null; // token -> { userId, exp }

async function loadJsonFile(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

let authWriteQueue = Promise.resolve();
function saveAuthFile(file, obj) {
  authWriteQueue = authWriteQueue
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${file}.tmp-${process.pid}`;
      await fs.writeFile(tmp, JSON.stringify(obj), "utf8");
      await fs.rename(tmp, file);
    });
  return authWriteQueue;
}

async function ensureAuthLoaded() {
  if (users === null) users = await loadJsonFile(USERS_FILE, {});
  if (sessions === null) sessions = await loadJsonFile(SESSIONS_FILE, {});
}

const saveUsers = () => saveAuthFile(USERS_FILE, users);
const saveSessions = () => saveAuthFile(SESSIONS_FILE, sessions);

function findUserByEmail(email) {
  const norm = String(email || "").trim().toLowerCase();
  return Object.values(users).find((u) => u.email === norm) || null;
}

function findUserByGoogleSub(sub) {
  return Object.values(users).find((u) => u.googleSub === sub) || null;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, profileId: u.profileId || null };
}

/* ---- password hashing (scrypt) ---- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { passwordSalt: salt, passwordHash: hash };
}

function verifyPassword(password, salt, expectedHex) {
  if (!salt || !expectedHex) return false;
  const hash = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(hash, expected);
}

/* ---- sessions ---- */

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { userId, exp: Date.now() + SESSION_TTL_MS };
  saveSessions();
  return token;
}

function sessionUser(token) {
  if (!token) return null;
  const s = sessions[token];
  if (!s) return null;
  if (s.exp && s.exp < Date.now()) {
    delete sessions[token];
    saveSessions();
    return null;
  }
  return users[s.userId] || null;
}

function destroySession(token) {
  if (token && sessions[token]) {
    delete sessions[token];
    saveSessions();
  }
}

/* ---- Google ID token verification ---- */

async function verifyGoogleToken(credential) {
  if (!credential) throw new Error("Google kimliği eksik");
  let res;
  try {
    res = await fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential)
    );
  } catch (_) {
    throw new Error("Google doğrulama servisine ulaşılamadı");
  }
  if (!res.ok) throw new Error("Google kimliği doğrulanamadı");
  const info = await res.json();
  if (info.aud !== GOOGLE_CLIENT_ID) throw new Error("Google istemci kimliği uyuşmuyor");
  if (info.iss !== "accounts.google.com" && info.iss !== "https://accounts.google.com") {
    throw new Error("Geçersiz Google sağlayıcısı");
  }
  if (info.exp && Number(info.exp) * 1000 < Date.now()) {
    throw new Error("Google kimliğinin süresi dolmuş");
  }
  return {
    sub: info.sub,
    email: String(info.email || "").trim().toLowerCase(),
    name: info.name || info.email || "Google Kullanıcısı",
    emailVerified: info.email_verified === "true" || info.email_verified === true
  };
}

/* ---- AI topic classification (Gemini REST via global fetch) ---- */

/** Turkish-aware label normalization for matching model output to the taxonomy. */
function normLabel(s) {
  return String(s == null ? "" : s)
    .toLocaleLowerCase("tr")
    .replace(/[-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build the text instruction sent alongside the page image(s). */
function buildClassifyPrompt(sections, wrong) {
  const taxonomy = sections
    .map((s) => `- ${s.key} (${s.label}): ${s.topics.join(" | ")}`)
    .join("\n");
  const wrongList = wrong.length ? wrong.join(", ") : "(fotoğraftaki tüm sorular)";
  return [
    "Bir KPSS deneme sınavı sayfasının fotoğrafı veriliyor (Türkçe).",
    "Görseldeki el yazıları, işaretlemeler ve filigranları yok say; yalnızca basılı soru metnini kullan.",
    "Aşağıdaki ders/konu listesinden YALNIZCA verilen değerleri kullanarak, belirtilen yanlış soru numaralarının her biri için dersi (section anahtarı) ve konuyu eşle.",
    "",
    "Ders / Konu listesi:",
    taxonomy,
    "",
    "Eşlenecek yanlış soru numaraları: " + wrongList,
    "",
    "Kurallar:",
    "- section değeri yukarıdaki anahtarlardan biri olmalı.",
    "- topic değeri o dersin konu listesindeki ifadelerden BİRİYLE birebir aynı olmalı.",
    "- Emin değilsen en olası konuyu seç ve confidence değerini düşür (0-1 arası).",
    "- Yalnızca JSON dizi döndür."
  ].join("\n");
}

async function callGemini(parts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(GEMINI_URL(GEMINI_MODEL), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                questionNo: { type: "INTEGER" },
                section: { type: "STRING" },
                topic: { type: "STRING" },
                confidence: { type: "NUMBER" }
              },
              required: ["questionNo", "section", "topic"]
            }
          }
        }
      })
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j && j.error && j.error.message ? j.error.message : "";
    } catch (_) {
      /* ignore */
    }
    throw new Error(`Gemini hatası (${res.status})${detail ? ": " + detail : ""}`);
  }
  const data = await res.json();
  const cand = data && data.candidates && data.candidates[0];
  const text =
    cand && cand.content && Array.isArray(cand.content.parts)
      ? cand.content.parts.map((p) => p.text || "").join("")
      : "";
  if (!text) throw new Error("Gemini boş yanıt döndü");
  return JSON.parse(text);
}

/** Validate model output against the allowed taxonomy; drop anything off-list. */
function sanitizeResults(raw, sections) {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map();
  sections.forEach((s) =>
    byKey.set(s.key, { label: s.label, norm: new Map(s.topics.map((t) => [normLabel(t), t])) })
  );
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const sec = byKey.get(String(item.section || ""));
    if (!sec) continue;
    const topic = sec.norm.get(normLabel(item.topic));
    if (!topic) continue;
    const questionNo = parseInt(item.questionNo, 10);
    let confidence = Number(item.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    out.push({
      questionNo: Number.isFinite(questionNo) ? questionNo : null,
      section: String(item.section),
      sectionLabel: sec.label,
      topic,
      confidence: Math.min(1, Math.max(0, confidence))
    });
  }
  return out;
}

async function handleClassify(req, res) {
  if (!GEMINI_API_KEY) {
    return send(res, 503, { error: "AI yapılandırılmamış (sunucuda GEMINI_API_KEY tanımlı değil)" });
  }
  const body = (await readBody(req)) || {};
  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_CLASSIFY_IMAGES) : [];
  const wrong = Array.isArray(body.wrong)
    ? [
        ...new Set(
          body.wrong.map((n) => parseInt(n, 10)).filter((n) => Number.isInteger(n) && n > 0)
        )
      ].slice(0, MAX_CLASSIFY_WRONG)
    : [];
  const sections = (Array.isArray(body.sections) ? body.sections : [])
    .map((s) => ({
      key: String((s && s.key) || ""),
      label: String((s && s.label) || ""),
      topics: Array.isArray(s && s.topics) ? s.topics.map((t) => String(t)).filter(Boolean) : []
    }))
    .filter((s) => s.key && s.topics.length);

  if (!images.length) return send(res, 400, { error: "En az bir görsel gerekli" });
  if (!sections.length) return send(res, 400, { error: "Konu listesi gerekli" });

  const imageParts = [];
  for (const img of images) {
    const mime = String((img && img.mime) || "image/jpeg");
    const data = String((img && img.data) || "");
    if (data && /^image\/(jpe?g|png|webp)$/.test(mime)) {
      imageParts.push({ inline_data: { mime_type: mime, data } });
    }
  }
  if (!imageParts.length) return send(res, 400, { error: "Geçerli görsel bulunamadı" });

  const cacheKey = crypto
    .createHash("sha256")
    .update(JSON.stringify({ m: GEMINI_MODEL, wrong, sections, imgs: imageParts.map((p) => p.inline_data.data) }))
    .digest("hex");
  const cached = classifyCacheGet(cacheKey);
  if (cached) return send(res, 200, { results: cached.results, model: cached.model, cached: true });

  const parts = [{ text: buildClassifyPrompt(sections, wrong) }, ...imageParts];
  let raw;
  try {
    raw = await callGemini(parts);
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    return send(res, aborted ? 504 : 502, {
      error: aborted ? "AI yanıtı zaman aşımına uğradı" : (e && e.message) || "AI çağrısı başarısız"
    });
  }
  const results = sanitizeResults(raw, sections);
  classifyCacheSet(cacheKey, { results, model: GEMINI_MODEL });
  return send(res, 200, { results, model: GEMINI_MODEL });
}

/* ------------------------------ HTTP helpers ------------------------------ */

function send(res, status, body, extraHeaders) {
  const json = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(extraHeaders || {})
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooBig) return reject(new Error("payload too large"));
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function sessionCookie(token, maxAgeSec) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join("; ");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------ auth routes ------------------------------ */

async function handleRegister(req, res) {
  const body = (await readBody(req)) || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  const profileId = String(body.profileId || "");

  if (!EMAIL_RE.test(email)) return send(res, 400, { error: "Geçerli bir e-posta girin" });
  if (password.length < 6) return send(res, 400, { error: "Şifre en az 6 karakter olmalı" });
  if (!name) return send(res, 400, { error: "İsim gerekli" });
  if (!PROFILE_IDS.includes(profileId)) return send(res, 400, { error: "Geçersiz sınav profili" });
  if (findUserByEmail(email)) return send(res, 409, { error: "Bu e-posta zaten kayıtlı" });

  const id = crypto.randomUUID();
  const { passwordSalt, passwordHash } = hashPassword(password);
  users[id] = {
    id,
    email,
    name,
    passwordSalt,
    passwordHash,
    googleSub: null,
    profileId,
    createdAt: new Date().toISOString()
  };
  await saveUsers();

  const token = createSession(id);
  return send(res, 200, { user: publicUser(users[id]) }, {
    "Set-Cookie": sessionCookie(token, SESSION_TTL_MS / 1000)
  });
}

async function handleLogin(req, res) {
  const body = (await readBody(req)) || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const user = findUserByEmail(email);
  if (!user || !user.passwordHash) {
    return send(res, 401, { error: "E-posta veya şifre hatalı" });
  }
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return send(res, 401, { error: "E-posta veya şifre hatalı" });
  }

  const token = createSession(user.id);
  return send(res, 200, { user: publicUser(user) }, {
    "Set-Cookie": sessionCookie(token, SESSION_TTL_MS / 1000)
  });
}

async function handleGoogle(req, res) {
  const body = (await readBody(req)) || {};
  let claims;
  try {
    claims = await verifyGoogleToken(body.credential);
  } catch (e) {
    return send(res, 401, { error: e && e.message ? e.message : "Google girişi başarısız" });
  }

  let user = findUserByGoogleSub(claims.sub) || (claims.email && findUserByEmail(claims.email));
  if (user) {
    if (!user.googleSub) {
      user.googleSub = claims.sub;
      await saveUsers();
    }
  } else {
    const id = crypto.randomUUID();
    users[id] = {
      id,
      email: claims.email,
      name: claims.name,
      passwordSalt: null,
      passwordHash: null,
      googleSub: claims.sub,
      profileId: null,
      createdAt: new Date().toISOString()
    };
    await saveUsers();
    user = users[id];
  }

  const token = createSession(user.id);
  return send(
    res,
    200,
    { user: publicUser(user), needsProfile: !user.profileId },
    { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS / 1000) }
  );
}

async function handleSetProfile(req, res, user) {
  const body = (await readBody(req)) || {};
  const profileId = String(body.profileId || "");
  if (!PROFILE_IDS.includes(profileId)) return send(res, 400, { error: "Geçersiz sınav profili" });
  user.profileId = profileId;
  await saveUsers();
  return send(res, 200, { user: publicUser(user) });
}

/* ------------------------------ server ------------------------------ */

const server = http.createServer(async (req, res) => {
  try {
    await ensureAuthLoaded();
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];

    // /api/health  (public)
    if (parts[0] === "api" && parts[1] === "health" && req.method === "GET") {
      return send(res, 200, { ok: true });
    }

    if (parts[0] !== "api") return send(res, 404, { error: "not found" });

    /* ---------------- auth endpoints ---------------- */
    if (parts[1] === "auth") {
      const action = parts[2];
      if (action === "register" && req.method === "POST") return handleRegister(req, res);
      if (action === "login" && req.method === "POST") return handleLogin(req, res);
      if (action === "google" && req.method === "POST") return handleGoogle(req, res);

      if (action === "me" && req.method === "GET") {
        const user = sessionUser(token);
        if (!user) return send(res, 401, { error: "Oturum yok" });
        return send(res, 200, { user: publicUser(user) });
      }

      if (action === "profile" && req.method === "POST") {
        const user = sessionUser(token);
        if (!user) return send(res, 401, { error: "Oturum yok" });
        return handleSetProfile(req, res, user);
      }

      if (action === "logout" && req.method === "POST") {
        destroySession(token);
        return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
      }

      return send(res, 404, { error: "not found" });
    }

    /* ---------------- AI topic classification (session-gated) ---------------- */
    if (parts[1] === "classify" && parts.length === 2 && req.method === "POST") {
      const user = sessionUser(token);
      if (!user) return send(res, 401, { error: "Oturum gerekli" });
      return handleClassify(req, res);
    }

    /* ---------------- data endpoints (session-gated) ---------------- */
    if (parts[1] !== "u") return send(res, 404, { error: "not found" });

    const authUser = sessionUser(token);
    if (!authUser) return send(res, 401, { error: "Oturum gerekli" });
    if (!authUser.profileId) return send(res, 403, { error: "Sınav profili seçilmedi" });

    // The :user path segment is ignored; data is always scoped to the
    // authenticated account so one user can never read another's data.
    const userId = authUser.id;
    const doc = await loadDoc(userId);

    // GET /api/u/:user/data  -> whole document as arrays + meta
    if (parts[3] === "data" && parts.length === 4 && req.method === "GET") {
      const out = { meta: doc.meta };
      for (const c of COLLECTIONS) out[c] = Object.values(doc[c]);
      return send(res, 200, out);
    }

    // /api/u/:user/col/:collection[/:id]
    if (parts[3] === "col") {
      const collection = parts[4];
      if (!COLLECTIONS.includes(collection)) return send(res, 404, { error: "unknown collection" });
      const store = doc[collection];

      if (parts.length === 5) {
        if (req.method === "GET") return send(res, 200, Object.values(store));
        if (req.method === "DELETE") {
          doc[collection] = {};
          await saveDoc(userId);
          return send(res, 200, { ok: true });
        }
      }

      if (parts.length === 6) {
        const id = parts[5];
        if (req.method === "PUT") {
          const obj = await readBody(req);
          if (!obj || typeof obj !== "object" || obj.id !== id) {
            return send(res, 400, { error: "id mismatch" });
          }
          store[id] = obj;
          await saveDoc(userId);
          return send(res, 200, { ok: true });
        }
        if (req.method === "DELETE") {
          delete store[id];
          await saveDoc(userId);
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 405, { error: "method not allowed" });
    }

    // /api/u/:user/meta/:key
    if (parts[3] === "meta" && parts.length === 5) {
      const key = parts[4];
      if (req.method === "GET") return send(res, 200, { value: doc.meta[key] });
      if (req.method === "PUT") {
        const body = await readBody(req);
        doc.meta[key] = body ? body.value : undefined;
        await saveDoc(userId);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: "method not allowed" });
    }

    return send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 400, { error: e && e.message ? e.message : "bad request" });
  }
});

server.listen(PORT, () => {
  console.log(`[kpss-api] listening on :${PORT} — data dir: ${DATA_DIR}`);
});
