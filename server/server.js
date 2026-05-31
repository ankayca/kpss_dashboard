/* ============================================================
   KPSS Çalışma Paneli — minimal storage API.

   Zero-dependency Node HTTP server. Stores each user's study
   data in a single JSON file on disk (the Raspberry Pi), so the
   data lives on the server instead of the browser's IndexedDB.

   No auth: there are two hardcoded users (see USERS). The client
   simply picks which one it is. Data is namespaced per user.

   Run:  node server/server.js
   Env:  PORT          (default 8090)
         KPSS_DATA_DIR (default ./server/data)
   ============================================================ */
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8090;
const DATA_DIR = process.env.KPSS_DATA_DIR
  ? path.resolve(process.env.KPSS_DATA_DIR)
  : path.join(__dirname, "data");

/** The only accounts that exist. No password, no auth. */
const USERS = ["ahmet", "kubisko"];
const COLLECTIONS = ["books", "sessions", "trials", "subjectTrials", "reviews"];

function emptyDoc() {
  const doc = { meta: {} };
  for (const c of COLLECTIONS) doc[c] = {};
  return doc;
}

/* ---- per-user persistence (in-memory cache + atomic disk writes) ---- */

const cache = new Map(); // user -> doc
const writeQueues = new Map(); // user -> Promise chain (serialize writes per user)

function fileFor(user) {
  return path.join(DATA_DIR, `${user}.json`);
}

async function loadDoc(user) {
  if (cache.has(user)) return cache.get(user);
  let doc;
  try {
    const raw = await fs.readFile(fileFor(user), "utf8");
    const parsed = JSON.parse(raw);
    doc = { ...emptyDoc(), ...parsed };
    if (!doc.meta || typeof doc.meta !== "object") doc.meta = {};
    for (const c of COLLECTIONS) {
      if (!doc[c] || typeof doc[c] !== "object") doc[c] = {};
    }
  } catch (_) {
    doc = emptyDoc();
  }
  cache.set(user, doc);
  return doc;
}

/** Persist a user's doc atomically (write temp file, then rename). */
function saveDoc(user) {
  const prev = writeQueues.get(user) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const doc = cache.get(user);
      if (!doc) return;
      await fs.mkdir(DATA_DIR, { recursive: true });
      const file = fileFor(user);
      const tmp = `${file}.tmp-${process.pid}`;
      await fs.writeFile(tmp, JSON.stringify(doc), "utf8");
      await fs.rename(tmp, file);
    });
  writeQueues.set(user, next);
  return next;
}

/* ------------------------------ HTTP ------------------------------ */

function send(res, status, body) {
  const json = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    // /api/health
    if (parts[0] === "api" && parts[1] === "health" && req.method === "GET") {
      return send(res, 200, { ok: true, users: USERS });
    }

    // Everything else: /api/u/:user/...
    if (parts[0] !== "api" || parts[1] !== "u") return send(res, 404, { error: "not found" });

    const user = parts[2];
    if (!USERS.includes(user)) return send(res, 404, { error: "unknown user" });

    const doc = await loadDoc(user);

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
          await saveDoc(user);
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
          await saveDoc(user);
          return send(res, 200, { ok: true });
        }
        if (req.method === "DELETE") {
          delete store[id];
          await saveDoc(user);
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
        await saveDoc(user);
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
