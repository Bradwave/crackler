// Crackler: IndexedDB backend for sessions.js (browser only). Resolves to null where IndexedDB is unavailable.
import { META, VIDEO } from "./sessions.js";

const NAME = "crackler";

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("noidb"));
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(META);
      r.result.createObjectStore(VIDEO);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("blocked"));
  });
}

async function idbBackend() {
  let db;
  try {
    db = await open();
  } catch {
    return null;
  }
  // one request in its own transaction; a write resolves when the transaction has completed
  const run = (store, mode, fn) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let out;
      const req = fn(tx.objectStore(store));
      req.onsuccess = () => (out = req.result);
      tx.oncomplete = () => resolve(out);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("idb"));
    });
  return {
    get: (s, k) => run(s, "readonly", (o) => o.get(k)),
    put: (s, k, v) => run(s, "readwrite", (o) => o.put(v, k)),
    del: (s, k) => run(s, "readwrite", (o) => o.delete(k)),
    all: (s) => run(s, "readonly", (o) => o.getAll()),
  };
}

export { idbBackend };
