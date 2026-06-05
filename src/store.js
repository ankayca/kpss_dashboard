/* ============================================================
   STORAGE LAYER — server-backed (the Raspberry Pi), per user.

   Talks to the minimal JSON API in /server/server.js. Data lives
   on the server, not in the browser. This module keeps the exact
   same async interface the rest of the app already used for
   IndexedDB (open / all / put / del / clear / getMeta / setMeta),
   plus setUser() to namespace requests per account.
   ============================================================ */

const API_BASE = "/api";
export const COLLECTIONS = ["books", "sessions", "trials", "subjectTrials", "reviews"];

let currentUser = "ahmet";
let online = false;

/** Namespace all subsequent requests to a given account. */
export function setUser(user) {
  currentUser = user;
}

function base() {
  return `${API_BASE}/u/${encodeURIComponent(currentUser)}`;
}

async function api(pathSuffix, options = {}) {
  let res;
  try {
    res = await fetch(base() + pathSuffix, {
      credentials: "include",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options
    });
  } catch (e) {
    throw new Error("Sunucuya ulaşılamadı (Raspberry Pi çalışıyor mu?)");
  }
  if (!res.ok) {
    let msg = `Sunucu hatası (${res.status})`;
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch (_) {
      /* ignore */
    }
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

export async function open() {
  let res;
  try {
    res = await fetch(`${API_BASE}/health`, { credentials: "include" });
  } catch (e) {
    online = false;
    throw new Error("Sunucuya ulaşılamadı (Raspberry Pi çalışıyor mu?)");
  }
  if (!res.ok) {
    online = false;
    throw new Error("Veri sunucusu yanıt vermedi");
  }
  online = true;
}

export const Store = {
  open,
  setUser,
  COLLECTIONS,
  get ready() {
    return online;
  },
  get user() {
    return currentUser;
  },
  all: (c) => api(`/col/${encodeURIComponent(c)}`),
  put: (c, obj) => {
    if (!obj || !obj.id) return Promise.reject(new Error("Geçersiz kayıt: id gerekli"));
    return api(`/col/${encodeURIComponent(c)}/${encodeURIComponent(obj.id)}`, {
      method: "PUT",
      body: JSON.stringify(obj)
    });
  },
  del: (c, id) => {
    if (!id) return Promise.reject(new Error("Silinecek id gerekli"));
    return api(`/col/${encodeURIComponent(c)}/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  clear: (c) => api(`/col/${encodeURIComponent(c)}`, { method: "DELETE" }),
  getMeta: (k) =>
    api(`/meta/${encodeURIComponent(k)}`).then((r) => (r ? r.value : undefined)),
  setMeta: (k, value) =>
    api(`/meta/${encodeURIComponent(k)}`, { method: "PUT", body: JSON.stringify({ value }) })
};
