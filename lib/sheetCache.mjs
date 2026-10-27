import { createHash } from 'node:crypto';
import { csvParse } from 'd3';
import { extractChannelMetrics24h, checkMetricDiscrepancies } from './metricIntegrity.mjs';
import { getCircuitBreakerState, recordQuotaUsage, recordQuotaError } from './quotaService.mjs';

const FIRESTORE_COLLECTION = 'sheetCache';
const CHUNK_SIZE_BYTES = 600 * 1024;
const MAX_FIRESTORE_BATCH_BYTES = 8 * 1024 * 1024;
const FIRESTORE_DOCUMENT_OVERHEAD_BYTES = 1024;
const sharedCache = globalThis[Symbol.for('tahaluf.sheetCache')] ||= {
  snapshots: new Map(),
  health: new Map()
};
const { snapshots: memorySnapshots, health: memoryHealth } = sharedCache;

export function getSheetCacheKey(url) {
  return createHash('sha256').update(String(url)).digest('hex');
}

function parseSheetDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : null;
}

export function summarizeSheetData(text) {
  const rows = csvParse(text);
  const eventColumn = rows.columns.find(column => /^event name db$/i.test(column))
    || rows.columns.find(column => /event name/i.test(column));
  const dateColumn = rows.columns.find(column => /^date$/i.test(column))
    || rows.columns.find(column => /\bdate\b/i.test(column));
  const eventBreakdown = {};
  const allDates = [];

  rows.forEach(row => {
    const eventName = (eventColumn ? row[eventColumn] : '').trim();
    const date = parseSheetDate(dateColumn ? (row[dateColumn] || '').trim() : '');
    if (date) allDates.push(date);
    if (!eventName) return;

    const eventStats = eventBreakdown[eventName] || { rows: 0, firstDate: null, lastDate: null };
    eventStats.rows += 1;
    if (date && (!eventStats.firstDate || date < eventStats.firstDate)) eventStats.firstDate = date;
    if (date && (!eventStats.lastDate || date > eventStats.lastDate)) eventStats.lastDate = date;
    eventBreakdown[eventName] = eventStats;
  });

  const { latestDate: latest24hDate, channelMetrics: channelMetrics24h } = extractChannelMetrics24h(rows);

  return {
    rowCount: rows.length,
    eventColumn: eventColumn || null,
    dateColumn: dateColumn || null,
    firstDate: allDates.length ? allDates.sort()[0] : null,
    lastDate: allDates.length ? allDates.sort().at(-1) : null,
    eventBreakdown,
    latest24hDate,
    channelMetrics24h
  };
}

function isPersistentCacheEnabled() {
  return process.env.VERCEL === '1';
}

function getCacheDocument(adminDb, cacheKey) {
  return adminDb.collection(FIRESTORE_COLLECTION).doc(cacheKey);
}

async function getAdminDb() {
  const { getFirebaseAdmin } = await import('./firebaseAdmin.js');
  return getFirebaseAdmin().adminDb;
}

function decodeSnapshot(snapshot) {
  const chunks = [...snapshot.docs]
    .map(doc => ({ index: doc.data().index, content: doc.data().content }))
    .sort((a, b) => a.index - b.index);
  if (chunks.some((chunk, index) => chunk.index !== index)) {
    throw new Error('Cached sheet snapshot is incomplete');
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk.content, 'base64'))).toString('utf8');
}

export async function writeSnapshotChunks(adminDb, snapshotRef, bytes) {
  let batch = adminDb.batch();
  let batchBytes = 0;

  const commitBatch = async () => {
    await batch.commit();
    batch = adminDb.batch();
    batchBytes = 0;
  };

  for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK_SIZE_BYTES, index++) {
    const content = bytes.subarray(offset, offset + CHUNK_SIZE_BYTES).toString('base64');
    const estimatedWriteBytes = Buffer.byteLength(content) + FIRESTORE_DOCUMENT_OVERHEAD_BYTES;
    if (batchBytes > 0 && batchBytes + estimatedWriteBytes > MAX_FIRESTORE_BATCH_BYTES) {
      await commitBatch();
    }

    batch.set(snapshotRef.collection('chunks').doc(String(index)), { index, content });
    batchBytes += estimatedWriteBytes;
  }

  await commitBatch();
}

function getMostRecentHealth(memoryStatus, persistedStatus) {
  if (!memoryStatus) return persistedStatus;
  if (!persistedStatus) return memoryStatus;
  return Date.parse(memoryStatus.updatedAt || '') > Date.parse(persistedStatus.updatedAt || '')
    ? memoryStatus
    : persistedStatus;
}

export async function getSheetSnapshot(cacheKey) {
  const existingMemory = memorySnapshots.get(cacheKey);
  if (existingMemory?.data) {
    return existingMemory;
  }
  if (!isPersistentCacheEnabled()) {
    return existingMemory || null;
  }

  try {
    const adminDb = await getAdminDb();
    const cacheRef = getCacheDocument(adminDb, cacheKey);
    const cacheDoc = await cacheRef.get();
    const metadata = cacheDoc.exists ? cacheDoc.data() : null;
    const health = getMostRecentHealth(memoryHealth.get(cacheKey), metadata);
    if (!metadata?.activeSnapshotId) {
      return health ? { data: null, fetchedAt: null, health } : null;
    }

    const chunksSnapshot = await cacheRef
      .collection('snapshots')
      .doc(metadata.activeSnapshotId)
      .collection('chunks')
      .get();
    const data = decodeSnapshot(chunksSnapshot);
    const snapshot = {
      data,
      fetchedAt: metadata.lastSuccessAt || null,
      health
    };
    memorySnapshots.set(cacheKey, snapshot);
    return snapshot;
  } catch (error) {
    console.warn('[SHEET CACHE] Persistent snapshot load failed, using memory fallback:', error?.message || error);
    return memorySnapshots.get(cacheKey) || null;
  }
}

export async function storeSheetSnapshot(cacheKey, data, dataSummary = summarizeSheetData(data)) {
  const fetchedAt = new Date().toISOString();
  const memorySnapshot = { data, fetchedAt, health: null };

  const prevBaselines = memoryHealth.get(cacheKey)?.metricBaselines || {};
  const { discrepancies, updatedBaselines } = checkMetricDiscrepancies(
    dataSummary.channelMetrics24h || [],
    prevBaselines
  );

  const fallbackHealth = {
    state: 'healthy',
    lastSuccessAt: fetchedAt,
    lastFailureAt: memoryHealth.get(cacheKey)?.lastFailureAt || null,
    lastError: null,
    updatedAt: fetchedAt,
    bytes: Buffer.byteLength(data),
    hasCachedData: true,
    ...dataSummary,
    metricBaselines: updatedBaselines,
    metricDiscrepancies: discrepancies
  };

  memoryHealth.set(cacheKey, fallbackHealth);
  memorySnapshots.set(cacheKey, { ...memorySnapshot, health: fallbackHealth });

  if (!isPersistentCacheEnabled() || getCircuitBreakerState()?.forceMemoryCache) {
    return fallbackHealth;
  }

  try {
    const adminDb = await getAdminDb();
    const cacheRef = getCacheDocument(adminDb, cacheKey);
    const snapshotId = createHash('sha256').update(data).digest('hex');
    const snapshotRef = cacheRef.collection('snapshots').doc(snapshotId);
    const bytes = Buffer.from(data, 'utf8');
    const existingCache = await cacheRef.get();
    if (!existingCache.exists || existingCache.data().activeSnapshotId !== snapshotId) {
      await writeSnapshotChunks(adminDb, snapshotRef, bytes);
    }

    const { previousSnapshotId, obsoleteSnapshotId, health } = await adminDb.runTransaction(async transaction => {
      const current = await transaction.get(cacheRef);
      const currentData = current.exists ? current.data() : {};
      const previousId = currentData.activeSnapshotId === snapshotId
        ? currentData.previousSnapshotId || null
        : currentData.activeSnapshotId || null;
      const obsoleteId = currentData.activeSnapshotId === snapshotId
        ? null
        : currentData.previousSnapshotId || null;
      const previousError = currentData.lastError;
      const prevPersistentBaselines = currentData.metricBaselines || memoryHealth.get(cacheKey)?.metricBaselines || {};
      const { discrepancies: persistentDiscrepancies, updatedBaselines: nextBaselines } = checkMetricDiscrepancies(
        dataSummary.channelMetrics24h || [],
        prevPersistentBaselines
      );
      const nextHealth = {
        activeSnapshotId: snapshotId,
        previousSnapshotId: previousId,
        lastSuccessAt: fetchedAt,
        lastFailureAt: currentData.lastFailureAt || null,
        lastError: null,
        lastErrorResolvedAt: previousError ? fetchedAt : currentData.lastErrorResolvedAt || null,
        updatedAt: fetchedAt,
        bytes: bytes.length,
        hasCachedData: true,
        state: 'healthy',
        ...dataSummary,
        metricBaselines: nextBaselines,
        metricDiscrepancies: persistentDiscrepancies
      };
      transaction.set(cacheRef, nextHealth);
      return { previousSnapshotId: previousId, obsoleteSnapshotId: obsoleteId, health: nextHealth };
    });

    memoryHealth.set(cacheKey, health);
    memorySnapshots.set(cacheKey, { ...memorySnapshot, health });

    if (obsoleteSnapshotId && obsoleteSnapshotId !== snapshotId && obsoleteSnapshotId !== previousSnapshotId) {
      try {
        const obsoleteRef = cacheRef.collection('snapshots').doc(obsoleteSnapshotId);
        const obsoleteChunks = await obsoleteRef.collection('chunks').get();
        const cleanup = adminDb.batch();
        obsoleteChunks.docs.forEach(doc => cleanup.delete(doc.ref));
        cleanup.delete(obsoleteRef);
        await cleanup.commit();
      } catch (error) {
        console.warn('Could not clean up obsolete sheet cache snapshot:', error);
      }
    }

    return health;
  } catch (error) {
    recordQuotaError('firestore', error?.message || error);
    console.warn('[SHEET CACHE] Firestore persistence failed (quota/network), returning memory health:', error?.message || error);
    return fallbackHealth;
  }
}

export async function recordSheetFailure(cacheKey, error, stateOverride) {
  const message = String(error);
  const failedAt = new Date().toISOString();
  const snapshot = memorySnapshots.get(cacheKey);
  const health = {
    ...(memoryHealth.get(cacheKey) || snapshot?.health || {}),
    state: stateOverride || (snapshot?.data ? 'stale' : 'unavailable'),
    lastFailureAt: failedAt,
    lastError: message,
    updatedAt: failedAt,
    hasCachedData: Boolean(snapshot?.data),
    bytes: snapshot?.data ? Buffer.byteLength(snapshot.data) : 0
  };

  memoryHealth.set(cacheKey, health);

  if (isPersistentCacheEnabled()) {
    const adminDb = await getAdminDb();
    await getCacheDocument(adminDb, cacheKey).set({
      ...health,
      lastSuccessAt: snapshot?.fetchedAt || health.lastSuccessAt || null
    }, { merge: true });
  }
  return health;
}

export async function getSheetCacheHealth(cacheKeys) {
  if (!isPersistentCacheEnabled()) {
    return Object.fromEntries(cacheKeys.map(cacheKey => [
      cacheKey,
      memoryHealth.get(cacheKey) || {
        state: 'unknown',
        hasCachedData: Boolean(memorySnapshots.get(cacheKey)?.data),
        bytes: memorySnapshots.get(cacheKey)?.data
          ? Buffer.byteLength(memorySnapshots.get(cacheKey).data)
          : 0,
        lastSuccessAt: memorySnapshots.get(cacheKey)?.fetchedAt || null,
        lastFailureAt: null,
        lastError: null
      }
    ]));
  }

  try {
    const adminDb = await getAdminDb();
    const refs = cacheKeys.map(cacheKey => getCacheDocument(adminDb, cacheKey));
    const docs = refs.length ? await adminDb.getAll(...refs) : [];
    return Object.fromEntries(docs.map((doc, index) => [
      cacheKeys[index],
      getMostRecentHealth(
        memoryHealth.get(cacheKeys[index]),
        doc.exists ? doc.data() : {
          state: 'unknown',
          hasCachedData: false,
          bytes: 0,
          lastSuccessAt: null,
          lastFailureAt: null,
          lastError: null
        }
      )
    ]));
  } catch (error) {
    console.warn('[SHEET CACHE] Could not fetch persistent sheet health, using memory health:', error?.message || error);
    return Object.fromEntries(cacheKeys.map(cacheKey => [
      cacheKey,
      memoryHealth.get(cacheKey) || {
        state: 'unknown',
        hasCachedData: Boolean(memorySnapshots.get(cacheKey)?.data),
        bytes: memorySnapshots.get(cacheKey)?.data
          ? Buffer.byteLength(memorySnapshots.get(cacheKey).data)
          : 0,
        lastSuccessAt: memorySnapshots.get(cacheKey)?.fetchedAt || null,
        lastFailureAt: null,
        lastError: null
      }
    ]));
  }
}
