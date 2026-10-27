import fs from 'node:fs/promises';
import path from 'node:path';

const queues = globalThis[Symbol.for('tahaluf.settingsQueues')] ||= new Map();
const allowedKeys = new Set(['dashboardFeatures', 'apiUsage', 'apiBudgets']);

function configPath(key) {
  if (!allowedKeys.has(key)) throw new Error('Unknown settings key');
  return path.join(process.cwd(), 'config', `${key}.json`);
}

export async function readAdminSetting(key, defaults) {
  const file = configPath(key);
  if (process.env.VERCEL === '1') {
    const { getFirebaseAdmin } = await import('./firebaseAdmin.js');
    const snapshot = await getFirebaseAdmin().adminDb.collection('appConfig').doc(key).get();
    return snapshot.exists ? snapshot.data() : structuredClone(defaults);
  }
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(defaults);
    throw error;
  }
}

export async function updateAdminSetting(key, defaults, update) {
  const file = configPath(key);
  if (process.env.VERCEL === '1') {
    const { getFirebaseAdmin } = await import('./firebaseAdmin.js');
    const { adminDb } = getFirebaseAdmin();
    const ref = adminDb.collection('appConfig').doc(key);
    return adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const next = update(snapshot.exists ? snapshot.data() : structuredClone(defaults));
      transaction.set(ref, next);
      return next;
    });
  }
  const previous = queues.get(key) || Promise.resolve();
  const pending = previous.then(async () => {
    const next = update(await readAdminSetting(key, defaults));
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
