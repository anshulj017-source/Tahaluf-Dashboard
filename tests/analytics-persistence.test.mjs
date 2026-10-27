import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnalyticsRecorder,
  getStore,
  getAnalyticsSummary,
  hydrateAnalyticsStore,
  persistAnalyticsAction,
  persistAnalyticsBatch,
  resetPersistedAnalytics,
  resetAnalyticsData,
} from '../lib/analyticsService.mjs';

test('new in-memory analytics and missing sections never start with demonstration measurements', async () => {
  delete globalThis[Symbol.for('tahaluf.analyticsStore')];
  const store = getStore();
  assert.equal(store.overview.totalViews, 0);
  assert.equal(store.overview.totalSessions, 0);
  assert.equal(store.overview.avgSessionDurationSec, 0);
  assert.deepEqual(store.users, {});
  assert.deepEqual(store.recentActivity, []);
  delete store.deviceFootprint;
  delete store.dwellTimes;
  assert.deepEqual(getStore().deviceFootprint.screenResolutions, {});
  assert.deepEqual(getStore().dwellTimes, {});
  const summary = await getAnalyticsSummary('today', { userRoleFilter: 'all', timeZone: 'UTC' });
  assert.equal(summary.kpis.totalViews, 0);
  assert.equal(summary.kpis.totalSessions, 0);
  assert.equal(summary.kpis.topCountry, null);
});

function createMemoryFirestore() {
  const documents = new Map();
  let transactionTail = Promise.resolve();
  let retriesNextTransaction = 0;
  const operations = { reads: 0, writes: 0, writesByCollection: {} };

  function snapshot(ref) {
    const stored = documents.get(`${ref.collectionName}/${ref.id}`);
    return {
      id: ref.id,
      exists: stored !== undefined,
      data: () => stored === undefined ? undefined : structuredClone(stored),
    };
  }

  const db = {
    collection(collectionName) {
      return {
        doc(id) {
          const ref = { collectionName, id };
          ref.get = async () => {
            operations.reads++;
            return snapshot(ref);
          };
          return ref;
        },
        async get() {
          const prefix = `${collectionName}/`;
          const docs = [...documents.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, data]) => ({
              id: key.slice(prefix.length),
              ref: { collectionName, id: key.slice(prefix.length) },
              data: () => structuredClone(data),
            }));
          operations.reads += Math.max(1, docs.length);
          return { docs, size: docs.length };
        },
      };
    },
    async runTransaction(callback) {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise(resolve => { release = resolve; });
      await previous;
      try {
        let writes;
        let result;
        for (let attempt = 0; attempt <= retriesNextTransaction; attempt++) {
          writes = [];
          const transaction = {
            get: async ref => {
              operations.reads++;
              return snapshot(ref);
            },
            set: (ref, value, options = {}) => writes.push({ ref, value, merge: options.merge }),
          };
          result = await callback(transaction);
        }
        retriesNextTransaction = 0;
        for (const { ref, value, merge } of writes) {
          const key = `${ref.collectionName}/${ref.id}`;
          documents.set(key, merge ? { ...documents.get(key), ...structuredClone(value) } : structuredClone(value));
          operations.writes++;
          operations.writesByCollection[ref.collectionName] =
            (operations.writesByCollection[ref.collectionName] || 0) + 1;
        }
        return result;
      } finally {
        release();
      }
    },
    batch() {
      const deletes = [];
      return {
        delete: ref => deletes.push(ref),
        async commit() {
          for (const ref of deletes) {
            documents.delete(`${ref.collectionName}/${ref.id}`);
            operations.writes++;
            operations.writesByCollection[ref.collectionName] =
              (operations.writesByCollection[ref.collectionName] || 0) + 1;
          }
        },
      };
    },
    read(collectionName, id) {
      const value = documents.get(`${collectionName}/${id}`);
      return value === undefined ? undefined : structuredClone(value);
    },
    seed(collectionName, id, value) {
      documents.set(`${collectionName}/${id}`, structuredClone(value));
    },
    retryNextTransaction(count = 1) {
      retriesNextTransaction = count;
    },
    count(collectionName) {
      const prefix = `${collectionName}/`;
      return [...documents.keys()].filter(key => key.startsWith(prefix)).length;
    },
    operations,
  };
  return db;
}

function event(activityId, userEmail = 'analyst@example.com', eventId = activityId) {
  return {
    activityId,
    payload: {
      eventId,
      eventType: 'page_view',
      userEmail,
      userRole: 'standard',
      tab: 'summary',
      isNewSession: true,
      timestamp: '2026-10-27T09:00:00.000Z',
      geo: { country: 'SA', city: 'Riyadh' },
    },
  };
}

test('same-turn events are retained and drained in bounded request-lifetime batches', async () => {
  const persisted = [];
  const registered = [];
  const recorder = createAnalyticsRecorder(
    async batch => {
      persisted.push(batch.map(item => item.activityId));
    },
    promise => registered.push(promise),
    () => assert.fail('unexpected persistence error'),
    100,
  );

  for (let index = 0; index < 237; index++) recorder.enqueue({ activityId: `event-${index}` });
  await recorder.flush();

  assert.equal(registered.length, 1, 'one waitUntil promise covers the drain');
  assert.deepEqual(persisted.map(batch => batch.length), [100, 100, 37]);
  assert.deepEqual(persisted.flat(), Array.from({ length: 237 }, (_, index) => `event-${index}`));
});

test('transient batches retry immediately and permanent failures are reported without blocking later batches', async () => {
  let attempts = 0;
  const failed = [];
  const recorder = createAnalyticsRecorder(
    async batch => {
      attempts++;
      if (batch[0].activityId === 'transient' && attempts === 1) throw new Error('temporary');
      if (batch[0].activityId === 'permanent') throw new Error('unavailable');
    },
    () => {},
    (error, batch) => failed.push({ message: error.message, ids: batch.map(item => item.activityId) }),
    1,
  );

  recorder.enqueue({ activityId: 'transient' });
  recorder.enqueue({ activityId: 'permanent' });
  recorder.enqueue({ activityId: 'later' });
  await recorder.flush();

  assert.equal(attempts, 5);
  assert.deepEqual(failed, [{ message: 'unavailable', ids: ['permanent'] }]);
});

test('concurrent transactions add events and deduplicate within a bounded recent-ID window', async () => {
  const db = createMemoryFirestore();
  const usageSamples = [];
  const observeUsage = (...sample) => usageSamples.push(sample);
  const first = event('act-1', 'analyst@example.com', 'client-1');
  const second = event('act-2', 'analyst@example.com', 'client-2');

  await Promise.all([
    persistAnalyticsBatch(db, [first, first], observeUsage),
    persistAnalyticsBatch(db, [second], observeUsage),
  ]);
  const beforeRetry = db.read('analytics_summary', 'overview');
  assert.equal(beforeRetry.overview.totalViews, 2);
  assert.equal(beforeRetry.overview.totalSessions, 2);
  assert.equal(db.read('analytics_users', 'analyst@example.com').totalEvents, 2);
  assert.equal(db.count('analytics_events'), 0, 'event receipts are not written to a separate collection');
  assert.deepEqual(beforeRetry.recentEventIds, ['act-1', 'act-2']);
  assert.equal(db.operations.reads, 4, 'both event batches count summary and user reads');

  await persistAnalyticsBatch(db, [first], observeUsage);
  const afterRetry = db.read('analytics_summary', 'overview');
  assert.equal(afterRetry.overview.totalViews, 2, 'retry with the same event ID does not increment twice');
  assert.equal(afterRetry.recentActivity.length, 2, 'the retry does not append another activity item');
  assert.equal(db.operations.writes, 4, 'two event batches write only summary and user documents');
  assert.equal(db.operations.writesByCollection.analytics_summary, 2);
  assert.equal(db.operations.writesByCollection.analytics_users, 2);
  assert.equal(db.operations.reads, 5, 'duplicate-only batches still count their summary read');
  assert.deepEqual(usageSamples, [
    ['firestore', 2, 'reads'], ['firestore', 2, 'writes'],
    ['firestore', 2, 'reads'], ['firestore', 2, 'writes'],
    ['firestore', 1, 'reads'],
  ]);
});

test('Firestore transaction retries are included in observed read operations', async () => {
  const db = createMemoryFirestore();
  const usageSamples = [];
  db.retryNextTransaction(2);

  await persistAnalyticsBatch(
    db,
    [event('act-retry', 'retry@example.com', 'retry-client')],
    (...sample) => usageSamples.push(sample),
  );

  assert.equal(db.operations.reads, 6, '3 transaction attempts each read summary and user');
  assert.equal(db.operations.writes, 2, 'only the successful transaction commits writes');
  assert.deepEqual(usageSamples, [['firestore', 6, 'reads'], ['firestore', 2, 'writes']]);
});

test('an isolated user event writes no per-event receipt document', async () => {
  const db = createMemoryFirestore();
  const usageSamples = [];

  await persistAnalyticsBatch(
    db,
    [event('act-isolated', 'one@example.com', 'single-client-id')],
    (...sample) => usageSamples.push(sample),
  );

  assert.equal(db.operations.writes, 2);
  assert.deepEqual(db.operations.writesByCollection, { analytics_summary: 1, analytics_users: 1 });
  assert.equal(db.read('analytics_summary', 'overview').recentEventIds.length, 1);
  assert.deepEqual(usageSamples, [
    ['firestore', 2, 'reads'],
    ['firestore', 2, 'writes'],
  ], 'reported reads and writes match actual Firestore operations');
});

test('one transaction batches multiple events from the same user into one summary and one user write', async () => {
  const db = createMemoryFirestore();
  const usageSamples = [];
  const events = Array.from({ length: 3 }, (_, index) =>
    event(`act-batch-${index}`, 'batch@example.com', `batch-client-${index}`));

  await persistAnalyticsBatch(db, events, (...sample) => usageSamples.push(sample));

  assert.equal(db.operations.reads, 2, 'one summary and one user read');
  assert.equal(db.operations.writes, 2, 'one summary and one user write for three events');
  assert.deepEqual(db.operations.writesByCollection, { analytics_summary: 1, analytics_users: 1 });
  assert.equal(db.read('analytics_users', 'batch@example.com').totalEvents, 3);
  assert.deepEqual(usageSamples, [['firestore', 2, 'reads'], ['firestore', 2, 'writes']]);
});

test('dedupe history is bounded to the most recent 500 event IDs', async () => {
  const db = createMemoryFirestore();
  const events = Array.from({ length: 100 }, (_, index) =>
    event(`act-${index}`, 'anonymous', `client-${index}`));

  for (let offset = 0; offset < events.length; offset += 10) {
    await persistAnalyticsBatch(db, events.slice(offset, offset + 10), () => {});
  }
  const persisted = db.read('analytics_summary', 'overview');
  persisted.recentEventIds = Array.from({ length: 500 }, (_, index) => `old-${index}`);
  db.seed('analytics_summary', 'overview', persisted);

  await persistAnalyticsBatch(db, [event('act-new', 'anonymous', 'new-client')], () => {});

  const ids = db.read('analytics_summary', 'overview').recentEventIds;
  assert.equal(ids.length, 500);
  assert.equal(ids[0], 'old-1', 'the oldest event ID is removed when the bound is exceeded');
  assert.equal(ids.at(-1), 'act-new');
});

test('events older than the bounded dedupe horizon may be accepted again', async () => {
  const db = createMemoryFirestore();
  const original = event('act-original', 'anonymous', 'client-original');

  await persistAnalyticsBatch(db, [original], () => {});
  const summary = db.read('analytics_summary', 'overview');
  summary.recentEventIds = Array.from({ length: 500 }, (_, index) => `later-${index}`);
  db.seed('analytics_summary', 'overview', summary);
  await persistAnalyticsBatch(db, [original], () => {});

  assert.equal(db.read('analytics_summary', 'overview').overview.totalViews, 2);
});

test('summary hydration reads the shared persisted overview and user profiles', async () => {
  await resetAnalyticsData();
  const db = createMemoryFirestore();
  await persistAnalyticsBatch(db, [event('act-hydrate', 'shared@example.com', 'hydrate-1')], () => {});

  await hydrateAnalyticsStore(db, () => {});

  assert.equal(getStore().overview.totalViews, 1);
  assert.equal(getStore().users['shared@example.com'].totalEvents, 1);
  assert.equal(getStore().recentActivity[0].id, 'act-hydrate');
  await resetAnalyticsData();
});

test('a fresh empty Firestore summary starts with zero measured counts', async () => {
  const db = createMemoryFirestore();
  const samples = [];

  assert.equal(await hydrateAnalyticsStore(db, (...sample) => samples.push(sample)), false);

  assert.equal(getStore().overview.totalViews, 0);
  assert.equal(getStore().overview.totalSessions, 0);
  assert.deepEqual(samples, [['firestore', 2, 'reads']], 'an absent summary and empty users query each cost one read');
});

test('action state and audit history persist transactionally and survive hydration', async () => {
  const db = createMemoryFirestore();
  const samples = [];
  const action = [
    'smart_default_b2b',
    'admin@example.com',
    true,
    'test action',
    '2026-10-27T09:00:00.000Z',
    'history-test',
    'activity-test',
  ];

  const persisted = await persistAnalyticsAction(db, action, (...sample) => samples.push(sample));
  assert.equal(persisted.store.appliedActions.smart_default_b2b.status, 'active');
  assert.equal(persisted.historyEntry.previousStatus, 'pending');
  assert.equal(db.operations.reads, 1);
  assert.equal(db.operations.writes, 1);
  assert.deepEqual(samples, [['firestore', 1, 'reads'], ['firestore', 1, 'writes']]);

  await hydrateAnalyticsStore(db, () => {});
  assert.equal(getStore().appliedActions.smart_default_b2b.status, 'active');
  assert.equal(getStore().actionsHistory[0].historyId, 'history-test');
  assert.equal(getStore().recentActivity[0].id, 'activity-test');
});

test('reset counts query reads, user deletions, and summary write accurately', async () => {
  const db = createMemoryFirestore();
  const samples = [];
  db.seed('analytics_users', 'one@example.com', { email: 'one@example.com' });
  db.seed('analytics_users', 'two@example.com', { email: 'two@example.com' });
  db.seed('analytics_summary', 'overview', { recentEventIds: ['old-event'] });

  await resetPersistedAnalytics(db, {
    overview: { totalViews: 0 },
    tabUsage: {},
    dwellTimes: {},
    featureInteractions: {},
    deviceFootprint: {},
    performanceTelemetry: {},
    userJourneys: {},
    geo: {},
    filters: {},
    appliedActions: {},
    actionsHistory: [],
    recentActivity: [],
  }, (...sample) => samples.push(sample));

  assert.deepEqual(samples, [
    ['firestore', 2, 'reads'],
    ['firestore', 2, 'writes'],
    ['firestore', 1, 'writes'],
  ]);
  assert.equal(db.operations.writes, 3);
  assert.equal(db.operations.writesByCollection.analytics_users, 2);
  assert.equal(db.operations.writesByCollection.analytics_summary, 1);
  assert.equal(db.count('analytics_users'), 0);
});

test('analytics summary exposes persistence mode and outstanding failure state', async () => {
  const { getAnalyticsSummary, analyticsPersistenceHealth } = await import('../lib/analyticsService.mjs');
  const prior = { ...analyticsPersistenceHealth };
  analyticsPersistenceHealth.mode = 'memory-only';
  analyticsPersistenceHealth.lastError = 'persist failed';
  analyticsPersistenceHealth.failedEvents = 3;

  try {
    const summary = await getAnalyticsSummary();
    assert.deepEqual(summary.persistence, {
      mode: 'memory-only',
      lastError: 'persist failed',
      failedEvents: 3,
    });
  } finally {
    Object.assign(analyticsPersistenceHealth, prior);
  }
});
