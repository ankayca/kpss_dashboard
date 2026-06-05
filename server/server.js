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
