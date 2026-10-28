import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const queues = globalThis[Symbol.for('tahaluf.settingsQueues')] ||= new Map();
const allowedKeys = new Set(['dashboardFeatures', 'apiUsage', 'apiBudgets', 'quotaAlerts', 'dimensionStandards']);
const cachedKeys = new Set(['dashboardFeatures', 'apiBudgets', 'dimensionStandards']);
const readCache = globalThis[Symbol.for('tahaluf.settingsReadCache')] ||= new Map();
const READ_CACHE_TTL_MS = 60_000;

function configPath(key) {
  if (!allowedKeys.has(key)) throw new Error('Unknown settings key');
  return path.join(process.cwd(), 'config', `${key}.json`);
}

function hasFirebaseAdminCredentials() {
  return Boolean(
    (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

function isFirestoreConfigured() {
  if (process.env.VERCEL === '1') return true;
  if (process.env.NODE_ENV === 'test') return false;
  return hasFirebaseAdminCredentials();
}

export async function readAdminSetting(key, defaults) {
  const file = configPath(key);
  if (isFirestoreConfigured()) {
    const load = async () => {
      const { getFirebaseAdmin } = await import('./firebaseAdmin.js');
      const snapshot = await getFirebaseAdmin().adminDb.collection('appConfig').doc(key).get();
      if (snapshot.exists) {
        const data = snapshot.data();
        try {
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(file, JSON.stringify(data, null, 2));
        } catch {}
        return data;
      }
      return structuredClone(defaults);
    };
    if (!cachedKeys.has(key)) return load();
    const cached = readCache.get(key);
    if (cached && (cached.expiresAt > Date.now() || cached.loading)) {
      return structuredClone(await cached.promise);
    }
    const entry = { loading: true, expiresAt: 0, promise: null };
    entry.promise = load().then(value => {
      entry.loading = false;
      entry.expiresAt = Date.now() + READ_CACHE_TTL_MS;
      return value;
    }).catch(error => {
      if (readCache.get(key) === entry) readCache.delete(key);
      throw error;
    });
    readCache.set(key, entry);
    return structuredClone(await entry.promise);
  }
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(defaults);
    throw error;
  }
}

export async function updateAdminSetting(key, defaults, update, { skipUnchanged = false } = {}) {
  const file = configPath(key);
  if (isFirestoreConfigured()) {
    const { getFirebaseAdmin } = await import('./firebaseAdmin.js');
    const { adminDb } = getFirebaseAdmin();
    const ref = adminDb.collection('appConfig').doc(key);
    readCache.delete(key);
    try {
      const next = await adminDb.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists ? snapshot.data() : structuredClone(defaults);
        const updated = update(current);
        if (!skipUnchanged || !isDeepStrictEqual(current, updated)) transaction.set(ref, updated);
        return updated;
      });
      try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(next, null, 2));
      } catch {}
      return next;
    } finally {
      readCache.delete(key);
    }
  }
  const previous = queues.get(key) || Promise.resolve();
  const pending = previous.then(async () => {
    const current = await readAdminSetting(key, defaults);
    const next = update(current);
    if (skipUnchanged && isDeepStrictEqual(current, next)) return next;
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(next, null, 2));
    await fs.rename(temporary, file);
    return next;
  });
  // Keep the queue usable after a failed write; the caller still receives the rejection.
  queues.set(key, pending.catch(error => console.error(`[SETTINGS] ${key} write failed:`, error)));
  return pending;
}
