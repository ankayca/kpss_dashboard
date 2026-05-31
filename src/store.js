/* ============================================================
   STORAGE LAYER — IndexedDB.
   Swapping to a cloud backend means re-implementing only this
   module's interface (open / all / put / del / clear / getMeta /
   setMeta). The layer above stays async and untouched.
   ============================================================ */

const DB_NAME = "kpss_db";
const VERSION = 3;
export const COLLECTIONS = ["books", "sessions", "trials", "subjectTrials", "reviews"];

let idb = null;
let ready = null;

function attachHandlers(db) {
  idb = db;
  idb.onversionchange = () => {
    db.close();
    idb = null;
    ready = null;
  };
  idb.onclose = () => {
    idb = null;
    ready = null;
  };
}

export function open() {
  if (ready) return ready;
  if (typeof indexedDB === "undefined" || !indexedDB) {
    ready = Promise.reject(new Error("IndexedDB desteklenmiyor"));
    return ready;
  }
  ready = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = (e) => {
      const db = e.target.result;
      COLLECTIONS.forEach((c) => {
        if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: "id" });
      });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    r.onblocked = () => rej(new Error("Veritabanı başka sekmede açık. Diğer sekmeleri kapatın."));
    r.onsuccess = (e) => {
      attachHandlers(e.target.result);
      res();
    };
    r.onerror = () => {
      ready = null;
      rej(r.error || new Error("Veritabanı açılamadı"));
    };
  });
  return ready;
}

function requireDb() {
  if (!idb) throw new Error("Veritabanı hazır değil");
  return idb;
}

const req = (r) =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error("Veritabanı işlemi başarısız"));
  });

async function tx(names, mode, fn) {
  await open();
  const db = requireDb();
  const stores = Array.isArray(names) ? names : [names];
  return new Promise((res, rej) => {
    const t = db.transaction(stores, mode);
    t.onerror = () => rej(t.error || new Error("İşlem iptal edildi"));
    t.onabort = () => rej(t.error || new Error("İşlem iptal edildi"));
    Promise.resolve(fn(stores.map((n) => t.objectStore(n))))
      .then(res)
      .catch(rej);
  });
}

export const Store = {
  open,
  COLLECTIONS,
  get ready() {
    return !!idb;
  },
  all: (c) => tx(c, "readonly", ([os]) => req(os.getAll())),
  put: (c, obj) => {
    if (!obj || !obj.id) return Promise.reject(new Error("Geçersiz kayıt: id gerekli"));
    return tx(c, "readwrite", ([os]) => req(os.put(obj)));
  },
  del: (c, id) => {
    if (!id) return Promise.reject(new Error("Silinecek id gerekli"));
    return tx(c, "readwrite", ([os]) => req(os.delete(id)));
  },
  clear: (c) => tx(c, "readwrite", ([os]) => req(os.clear())),
  getMeta: (k) =>
    tx("meta", "readonly", ([os]) => req(os.get(k)).then((r) => (r ? r.value : undefined))),
  setMeta: (k, value) => tx("meta", "readwrite", ([os]) => req(os.put({ key: k, value })))
};
