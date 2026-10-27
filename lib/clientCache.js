// Browser IndexedDB cache helper for instant (<50ms) dashboard initialization
const DB_NAME = 'tahaluf_cache_db';
const DB_VERSION = 1;
const STORE_NAME = 'dashboard_store';
const CACHE_KEY = 'latest_dashboard_payload';

function openCacheDb() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return resolve(null);
    }
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getClientDashboardCache() {
  try {
    const db = await openCacheDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(CACHE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function setClientDashboardCache(payload) {
  try {
    const db = await openCacheDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        ...payload,
        cachedAt: Date.now()
      }, CACHE_KEY);
    } catch {}
  } catch {}
}
