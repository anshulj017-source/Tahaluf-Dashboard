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

export async function readAdminSetting(key, defaults) {
  const file = configPath(key);
  if (process.env.VERCEL === '1') {
    const load = async () => {
      const { getFirebaseAdmin } = await import('./firebaseAdmin.js');
      const snapshot = await getFirebaseAdmin().adminDb.collection('appConfig').doc(key).get();
      return snapshot.exists ? snapshot.data() : structuredClone(defaults);
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
  if (process.env.VERCEL === '1') {
    const { getFirebaseAdmin } = await import('./firebaseAdmin.js');
    const { adminDb } = getFirebaseAdmin();
    const ref = adminDb.collection('appConfig').doc(key);
    readCache.delete(key);
    try {
      return await adminDb.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists ? snapshot.data() : structuredClone(defaults);
        const next = update(current);
        if (!skipUnchanged || !isDeepStrictEqual(current, next)) transaction.set(ref, next);
        return next;
      });
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
