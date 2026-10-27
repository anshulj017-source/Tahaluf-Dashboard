import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  DASHBOARD_FEATURES, DEFAULT_FEATURE_CONFIG, FEATURE_MODES,
  isFeatureEnabled, validateFeatureModes
} from '../lib/dashboardFeatures.mjs';
import {
  API_SERVICES, EMPTY_BUDGETS, addUsage, summarizeApiUsage, validateBudgets, observeApiUsage, createUsageRecorder
} from '../lib/apiUsage.mjs';
import { readAdminSetting, updateAdminSetting } from '../lib/adminSettingsStore.mjs';

const require = createRequire(import.meta.url);

async function loadInstrumentedModule(relativePath, overrides = {}, globals = {}) {
  const file = new URL(relativePath, import.meta.url);
  const source = await fs.readFile(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: sandboxModule, exports: sandboxModule.exports,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    process, console, structuredClone, URL, setTimeout, clearTimeout, ...globals
  }, { filename: file.pathname });
  return sandboxModule.exports;
}

function fakeClock() {
  let now = Date.parse('2026-10-27T00:00:00Z');
  return {
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    advance(milliseconds) { now += milliseconds; }
  };
}

test('settings cache reduces 100 concurrent and warm reads to one read and expires at 60 seconds', async () => {
  const clock = fakeClock();
  let reads = 0;
  let value = { revision: 1, modes: { tv: 'public' } };
  let failRead = false;
  let failWrite = false;
  const ref = {
    async get() {
      reads++;
      if (failRead) throw new Error('unavailable');
      return { exists: true, data: () => structuredClone(value) };
    }
  };
  const db = {
    collection: () => ({ doc: () => ref }),
    async runTransaction(update) {
      if (failWrite) throw new Error('write rejected');
      return update({
        get: () => ref.get(),
        set: (_, next) => { value = structuredClone(next); }
      });
    }
  };
  const settings = await loadInstrumentedModule('../lib/adminSettingsStore.mjs', {
    './firebaseAdmin.js': { getFirebaseAdmin: () => ({ adminDb: db }) }
  }, { Date: clock.Date, process: { env: { VERCEL: '1' }, cwd: () => process.cwd() } });
  const results = await Promise.all(Array.from({ length: 100 }, () => settings.readAdminSetting('dashboardFeatures', {})));
  assert.equal(reads, 1);
  results[0].modes.tv = 'disabled';
  assert.equal((await settings.readAdminSetting('dashboardFeatures', {})).modes.tv, 'public');
  clock.advance(59_999);
  await settings.readAdminSetting('dashboardFeatures', {});
  assert.equal(reads, 1);
  value.revision = 2;
  clock.advance(1);
  assert.equal((await settings.readAdminSetting('dashboardFeatures', {})).revision, 2);
  assert.equal(reads, 2);
  await settings.updateAdminSetting('dashboardFeatures', {}, state => ({ ...state, revision: 3 }));
  assert.equal((await settings.readAdminSetting('dashboardFeatures', {})).revision, 3);
  assert.equal(reads, 4, 'save reads authoritative data and next read reloads');
  failWrite = true;
  await assert.rejects(settings.updateAdminSetting('dashboardFeatures', {}, state => state), /write rejected/);
  await settings.readAdminSetting('dashboardFeatures', {});
  assert.equal(reads, 5, 'failed saves also invalidate cache');
  clock.advance(60_000);
  failRead = true;
  await assert.rejects(settings.readAdminSetting('dashboardFeatures', {}), /unavailable/);
  failRead = false;
  await settings.readAdminSetting('dashboardFeatures', {});
  assert.equal(reads, 7, 'failed reads can be retried immediately');
  await settings.readAdminSetting('apiUsage', {});
  await settings.readAdminSetting('apiUsage', {});
  assert.equal(reads, 9, 'usage reads are never cached');
  await settings.readAdminSetting('apiBudgets', {});
  await settings.readAdminSetting('apiBudgets', {});
  assert.equal(reads, 10, 'budget reads use the cache');
});

test('a settings read in flight during a save cannot repopulate stale cached data', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let reads = 0;
  let value = { revision: 1 };
  const db = {
    collection: () => ({ doc: () => ({
      async get() {
        reads++;
        const snapshotValue = structuredClone(value);
        if (reads === 1) await gate;
        return { exists: true, data: () => snapshotValue };
      }
    }) }),
    async runTransaction(update) {
      return update({
        get: async () => ({ exists: true, data: () => structuredClone(value) }),
        set: (_, next) => { value = next; }
      });
    }
  };
  const settings = await loadInstrumentedModule('../lib/adminSettingsStore.mjs', {
    './firebaseAdmin.js': { getFirebaseAdmin: () => ({ adminDb: db }) }
  }, { process: { env: { VERCEL: '1' }, cwd: () => process.cwd() } });
  const oldRead = settings.readAdminSetting('dashboardFeatures', {});
  await new Promise(resolve => setImmediate(resolve));
  await settings.updateAdminSetting('dashboardFeatures', {}, () => ({ revision: 2 }));
  release();
  assert.equal((await oldRead).revision, 1);
  assert.equal((await settings.readAdminSetting('dashboardFeatures', {})).revision, 2);
  assert.equal(reads, 2);
});

test('two-minute heartbeats send 30 requests per hour and preserve accumulated dwell plus exit flush', async () => {
  const clock = fakeClock();
  const timers = [];
  const events = {};
  const requests = [];
  const document = { visibilityState: 'visible', addEventListener: (name, callback) => { events[name] = callback; } };
  const tracker = await loadInstrumentedModule('../lib/analyticsTracker.js', {}, {
    Date: clock.Date, document,
    window: {
      innerWidth: 1440, innerHeight: 900,
      sessionStorage: { getItem: () => 'test-session' },
      addEventListener: (name, callback) => { events[name] = callback; }
    },
    navigator: { userAgent: 'test' },
    fetch: async (_, options) => { requests.push(JSON.parse(options.body)); },
    setInterval: (callback, delay) => { timers.push({ callback, delay }); }
  });
  tracker.trackActivity({ eventType: 'tab_view', tab: 'summary', immediate: true });
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 120_000);
  for (let index = 0; index < 30; index++) {
    clock.advance(timers[0].delay);
    timers[0].callback();
  }
  const heartbeats = requests.filter(request => request.eventType === 'heartbeat_dwell');
  assert.equal(heartbeats.length, 30);
  assert.equal(Math.floor(3_600_000 / 25_000), 144, 'previous cadence generated 144 heartbeats/hour');
  assert.equal(heartbeats.reduce((sum, request) => sum + request.dwellTimeSec, 0), 3600);
  clock.advance(15_000);
  events.pagehide();
  assert.equal(requests.at(-1).eventType, 'tab_dwell');
  assert.equal(requests.at(-1).dwellTimeSec, 15);
  events.beforeunload();
  assert.equal(requests.filter(request => request.eventType === 'tab_dwell').length, 1, 'lifecycle events do not duplicate the flushed interval');
  const before = requests.length;
  document.visibilityState = 'hidden';
  clock.advance(120_000);
  timers[0].callback();
  assert.equal(requests.length, before, 'hidden documents send no periodic heartbeat');
  document.visibilityState = 'visible';
  events.visibilitychange();
  clock.advance(10_000);
  tracker.trackActivity({ eventType: 'tab_view', tab: 'campaign', immediate: true });
  const switchDwell = requests.filter(request => request.eventType === 'tab_dwell').at(-1);
  assert.equal(switchDwell.tab, 'summary');
  assert.equal(switchDwell.dwellTimeSec, 10);
});

test('Analytics panel polls 120 times/hour, skips hidden documents and clears its timer', async () => {
  const source = await fs.readFile(new URL('../app/components/AnalyticsAdmin.jsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('AnalyticsAdmin.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let effect;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'useEffect'
      && node.arguments[0]?.getText(parsed).includes('setInterval')) effect = node.arguments[0].getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(effect, 'test executes the actual polling effect from the component');
  let fetches = 0;
  let callback;
  let cadence;
  let cleared;
  const document = { visibilityState: 'visible' };
  const cleanup = vm.runInNewContext(`(${effect})()`, {
    document,
    lowQuotaMode: false,
    fetchAnalytics: () => { fetches++; },
    setInterval: (fn, delay) => { callback = fn; cadence = delay; return 123; },
    clearInterval: id => { cleared = id; }
  });
  assert.equal(fetches, 1, 'initial load remains immediate');
  assert.equal(cadence, 30_000);
  for (let elapsed = cadence; elapsed <= 3_600_000; elapsed += cadence) callback();
  assert.equal(fetches, 121, '120 periodic fetches plus initial load');
  assert.equal(3_600_000 / 6000, 600, 'previous cadence produced 600 periodic fetches/hour');
  document.visibilityState = 'hidden';
  callback();
  assert.equal(fetches, 121);
  cleanup();
  assert.equal(cleared, 123);
  fetches = 0;
  const lowModeCleanup = vm.runInNewContext(`(${effect})()`, {
    lowQuotaMode: true,
    fetchAnalytics: () => { fetches++; },
    setInterval: () => { assert.fail('low-quota mode must not schedule polling'); }
  });
  assert.equal(fetches, 1, 'low-quota mode preserves initial/filter loads');
  assert.equal(lowModeCleanup, undefined);
});

test('visible tabs share one dwell owner and hand over after hiding', async () => {
  const clock = fakeClock();
  let held = false;
  const locks = {
    async request(_, options, callback) {
      assert.equal(options.ifAvailable, true);
      if (held) return callback(null);
      held = true;
      try { await callback({ name: 'test-lock' }); } finally { held = false; }
    }
  };
  const makeTab = async () => {
    const requests = [];
    const events = {};
    let tick;
    const document = { visibilityState: 'visible', addEventListener: (key, fn) => { events[key] = fn; } };
    const window = {
      sessionStorage: { getItem: () => 'test' },
      addEventListener: (key, fn) => { events[key] = fn; }
    };
    const tracker = await loadInstrumentedModule('../lib/analyticsTracker.js', {}, {
      Date: clock.Date, document, window, navigator: { locks, userAgent: 'test' },
      fetch: async (_, options) => { requests.push(JSON.parse(options.body)); },
      setInterval: fn => { tick = fn; }
    });
    tracker.trackActivity({ eventType: 'tab_view', immediate: true });
    return { requests, events, document, window, tick: () => tick() };
  };
  const first = await makeTab();
  const second = await makeTab();
  clock.advance(120_000);
  first.tick();
  second.tick();
  assert.equal(first.requests.filter(item => item.eventType === 'heartbeat_dwell').length, 1);
  assert.equal(second.requests.filter(item => item.eventType === 'heartbeat_dwell').length, 0);
  first.document.visibilityState = 'hidden';
  first.events.visibilitychange();
  await new Promise(resolve => setImmediate(resolve));
  second.tick();
  clock.advance(120_000);
  second.tick();
  assert.equal(second.requests.filter(item => item.eventType === 'heartbeat_dwell').length, 1);
  second.window.__tahaluf_low_quota_mode = true;
  clock.advance(120_000);
  second.tick();
  assert.equal(second.requests.filter(item => item.eventType === 'heartbeat_dwell').length, 1);
  second.events.pagehide();
  assert.equal(second.requests.at(-1).eventType, 'tab_dwell', 'low mode preserves exit flush');
  await new Promise(resolve => setImmediate(resolve));
});

test('tracking retries reuse the event identifier after a server rejection', async () => {
  let original;
  let retry;
  let errors = 0;
  const tracker = await loadInstrumentedModule('../lib/analyticsTracker.js', {}, {
    window: {}, Blob,
    console: { error: () => { errors++; } },
    fetch: async (_, options) => {
      original = options.body;
      return { ok: false, status: 503 };
    },
    navigator: { sendBeacon: (_, body) => { retry = body; return true; } }
  });
  tracker.dispatchBeacon({ eventType: 'page_view' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await retry.text(), original);
  assert.ok(JSON.parse(original).eventId);
  assert.equal(errors, 1, 'server rejections are not silently treated as success');
});

test('tracking route forwards the client event identifier to persistence', async () => {
  let event;
  const route = await loadInstrumentedModule('../app/api/analytics/track/route.js', {
    '../../../../lib/analyticsService.mjs': {
      recordAnalyticsEvent: async payload => { event = payload; return { success: true }; }
    },
    '../../../../lib/apiUsage.mjs': {
      observeApiRequest: () => {},
      withUsageScope: handler => handler
    }
  });
  const response = await route.POST(new Request('http://localhost/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: 'retry-safe-event', eventType: 'tab_view', tab: 'overview' })
  }));
  assert.equal(response.status, 200);
  assert.equal(event.eventId, 'retry-safe-event');
  assert.equal(event.tab, 'summary');
});

test('routine health inspection does not hydrate missing sheets or load configuration history', async () => {
  let healthReads = 0;
  const route = await loadInstrumentedModule('../app/api/admin/events/route.js', {
    d3: {},
    '../../../../lib/eventsConfig': {
      getEventsConfig: async () => ({ events: [{ id: 'one', name: 'One', gid: '1' }] }),
      getEventsHistory: () => { assert.fail('routine health must not load version history'); },
      DEFAULT_EVENTS: []
    },
    '../../../../lib/sheetCache.mjs': {
      getSheetCacheKey: () => 'key',
      getSheetCacheHealth: async (_, options) => {
        healthReads++;
        assert.equal(options.maxAgeMs, 60_000);
        return { key: { state: 'unknown', hasCachedData: false, rowCount: 0 } };
      },
      storeSheetSnapshot: () => { assert.fail('routine inspection must not repair or write snapshots'); }
    },
    '../../sheets/route': {},
    '../../../../lib/apiUsage.mjs': { withUsageScope: handler => handler }
  }, {
    process: { env: { COMBINED_COUNTRY_CSV_URL: 'https://example.test/sheet' } },
    fetch: () => { assert.fail('routine inspection must not fetch sheet CSVs'); }
  });
  const response = await route.GET(new Request('http://localhost/api/admin/events?inspectOnly=true'));
  assert.equal(response.status, 200);
  assert.equal(healthReads, 1);
  const result = await response.json();
  assert.equal(result.sheetHealth[0].hasCachedData, false);
  assert.equal(result.sheetHealth[0].eventDataStatus, 'missing');
});

test('health inspections reuse metadata for 60 seconds while explicit checks bypass the cache', async () => {
  const clock = fakeClock();
  let reads = 0;
  const db = {
    collection: () => ({ doc: key => key }),
    async getAll(...refs) {
      reads += refs.length;
      return refs.map(() => ({ exists: true, data: () => ({ state: 'healthy', rowCount: 10 }) }));
    }
  };
  const cache = await loadInstrumentedModule('../lib/sheetCache.mjs', {
    d3: {},
    './metricIntegrity.mjs': {},
    './quotaService.mjs': {},
    './apiUsage.mjs': { observeApiUsage: () => {} },
    './firebaseAdmin.js': { getFirebaseAdmin: () => ({ adminDb: db }) }
  }, { Date: clock.Date, process: { env: { VERCEL: '1' } } });
  const first = await cache.getSheetCacheHealth(['a', 'a', 'b'], { maxAgeMs: 60_000 });
  first.a.rowCount = 0;
  assert.equal((await cache.getSheetCacheHealth(['b', 'a'], { maxAgeMs: 60_000 })).a.rowCount, 10);
  assert.equal(reads, 2, 'deduplicated metadata is fetched once');
  clock.advance(60_000);
  await cache.getSheetCacheHealth(['a', 'b'], { maxAgeMs: 60_000 });
  assert.equal(reads, 4);
  await cache.getSheetCacheHealth(['a', 'b']);
  assert.equal(reads, 6, 'explicit checks bypass cache');
});

test('public settings expose only the low-quota boolean, not private budget values', async () => {
  const route = await loadInstrumentedModule('../app/api/features/route.js', {
    '../../../lib/adminSettingsStore.mjs': {
      readAdminSetting: async key => key === 'apiBudgets'
        ? { policy: { lowQuotaMode: true }, services: { privateBudget: 123 } }
        : DEFAULT_FEATURE_CONFIG
    },
    '../../../lib/dashboardFeatures.mjs': { DEFAULT_FEATURE_CONFIG }
  });
  const response = await route.GET();
  const json = await response.json();
  assert.deepEqual(json.policy, { lowQuotaMode: true });
  assert.equal(JSON.stringify(json).includes('privateBudget'), false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('Health Monitor skips inactive polling and pauses automatic work in low-quota mode', async () => {
  const source = await fs.readFile(new URL('../app/components/DataHealthAdmin.jsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('DataHealthAdmin.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let effect;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'useEffect'
      && node.arguments[0]?.getText(parsed).includes('setInterval')) effect = node.arguments[0].getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(effect);
  let health = 0;
  let history = 0;
  let tick;
  let cleared = false;
  const document = { visibilityState: 'visible' };
  const globals = {
    active: false, lowQuotaMode: false, document,
    reloadHealth: () => { health++; }, reloadHistory: () => { history++; },
    window: {
      setInterval: fn => { tick = fn; return 123; },
      clearInterval: id => { assert.equal(id, 123); cleared = true; }
    }
  };
  vm.runInNewContext(`(${effect})()`, globals);
  assert.equal(health, 0);
  assert.equal(tick, undefined);
  vm.runInNewContext(`(${effect})()`, { ...globals, active: true, lowQuotaMode: true });
  assert.equal(health, 1);
  assert.equal(tick, undefined);
  const cleanup = vm.runInNewContext(`(${effect})()`, { ...globals, active: true });
  assert.equal(health, 2);
  tick();
  assert.equal(health, 3);
  assert.equal(history, 1);
  document.visibilityState = 'hidden';
  tick();
  assert.equal(health, 3);
  assert.equal(history, 1);
  cleanup();
  assert.equal(cleared, true);
});

for (const feature of DASHBOARD_FEATURES) {
  for (const mode of FEATURE_MODES) {
    for (const role of ['admin', 'standard', 'non-finance']) {
      test(`${feature.id}: ${mode}, ${role}, normal and viewer preview`, () => {
        const config = structuredClone(DEFAULT_FEATURE_CONFIG);
        config.modes[feature.id] = mode;
        const permitted = mode === 'public' || (mode === 'admin_only' && role === 'admin');
        assert.equal(isFeatureEnabled(config, feature.id, role), permitted && (!feature.adminOnly || role === 'admin'));
        assert.equal(isFeatureEnabled(config, feature.id, role, true), mode === 'public' && !feature.adminOnly);
      });

    }
  }
}

test('concurrent usage observations persist in one transaction without losing counts', async () => {
  let state = { startedAt: null, days: {} };
  let writes = 0;
  const pending = [];
  const record = createUsageRecorder(async update => {
    writes++;
    state = update(state);
  }, promise => pending.push(promise), error => { throw error; });
  for (let index = 0; index < 100; index++) record('firestore', 2, 'reads');
  await Promise.all(pending);
  assert.equal(writes, 1);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(state.days[today].firestore.count, 200);
  assert.equal(state.days[today].firestore.metrics.reads, 200);
});

test('usage observations arriving during persistence are serialized into the next batch', async () => {
  let state = { startedAt: null, days: {} };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const pending = [];
  let writes = 0;
  let activeWrites = 0;
  const record = createUsageRecorder(async update => {
    activeWrites++;
    assert.equal(activeWrites, 1);
    writes++;
    if (writes === 1) await gate;
    state = update(state);
    activeWrites--;
  }, promise => pending.push(promise), error => { throw error; });
  record('sheets');
  await Promise.resolve();
  for (let index = 0; index < 50; index++) record('sheets');
  release();
  await Promise.all(pending);
  assert.equal(writes, 2);
  assert.equal(Object.values(state.days)[0].sheets.count, 51);
  record('sheets');
  await Promise.all(pending);
  assert.equal(writes, 3);
  assert.equal(Object.values(state.days)[0].sheets.count, 52);
});

test('failed usage batches report every affected sample and later batches still persist', async () => {
  let writes = 0;
  let failedSamples = 0;
  const pending = [];
  const record = createUsageRecorder(async update => {
    writes++;
    if (writes === 1) throw new Error('quota exceeded');
    update({ startedAt: null, days: {} });
  }, promise => pending.push(promise), (error, count) => {
    assert.equal(error.message, 'quota exceeded');
    failedSamples += count;
  });
  record('sheets');
  record('sheets');
  await Promise.all(pending);
  assert.equal(failedSamples, 2);
  record('sheets');
  await Promise.all(pending);
  assert.equal(writes, 2);
});

test('default configuration preserves existing views and protects admin-only health monitoring', () => {
  assert.equal(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'summary'), true);
  assert.equal(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'webtraffic', 'admin'), false);
  assert.equal(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'healthBanner', 'standard'), false);
  assert.equal(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'unknown', 'admin'), false);
  assert.equal(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'admin', 'standard'), false);
  assert.equal(new Set(DASHBOARD_FEATURES.map(feature => feature.id)).size, DASHBOARD_FEATURES.length);
});

test('TV auto-cycle obeys its parent visibility', () => {
  const config = { modes: { ...DEFAULT_FEATURE_CONFIG.modes, tv: 'admin_only' } };
  assert.equal(isFeatureEnabled(config, 'tvAutoCycle', 'standard'), false);
  assert.equal(isFeatureEnabled(config, 'tvAutoCycle', 'admin'), true);
  config.modes.tv = 'disabled';
  assert.equal(isFeatureEnabled(config, 'tvAutoCycle', 'admin'), false);
});

test('feature input rejects unknown modes, unknown features and viewer lockout', () => {
  for (const modes of [null, [], { tv: 'yes' }, { admin: 'public' }, { healthBanner: 'public' }]) {
    assert.throws(() => validateFeatureModes(modes));
  }
  const modes = Object.fromEntries(DASHBOARD_FEATURES.map(feature => [feature.id, 'disabled']));
  assert.throws(() => validateFeatureModes(modes), /at least one dashboard view/);
  modes.summary = 'admin_only';
  assert.throws(() => validateFeatureModes(modes), /at least one dashboard view/);
  modes.summary = 'public';
  assert.equal(validateFeatureModes(modes).summary, 'public');
  assert.equal(validateFeatureModes({ tv: 'disabled' }).campaign, 'public');
});

test('usage samples accumulate per UTC day and metric without mutating input', () => {
  const empty = { startedAt: null, days: {} };
  const first = addUsage(empty, 'firestore', 2, new Date('2026-10-01T22:00:00Z'), 'reads');
  const second = addUsage(first, 'firestore', 3, new Date('2026-10-01T23:59:59Z'), 'writes');
  const third = addUsage(second, 'firestore', 1, new Date('2026-10-02T00:00:00Z'), 'reads');
  assert.deepEqual(empty.days, {});
  assert.equal(third.days['2026-10-01'].firestore.count, 5);
  assert.deepEqual(third.days['2026-10-01'].firestore.metrics, { reads: 2, writes: 3 });
  assert.equal(third.days['2026-10-02'].firestore.count, 1);
  assert.equal(third.startedAt, '2026-10-01T22:00:00.000Z');
  for (const value of [-1, NaN, Infinity]) assert.throws(() => addUsage(empty, 'sheets', value));
  assert.throws(() => addUsage(empty, 'unknown', 1));
});

test('daily history is bounded and keeps recent observations', () => {
  const old = addUsage({ startedAt: null, days: {} }, 'analytics', 100, new Date('2026-01-01'));
  const current = addUsage(old, 'analytics', 2, new Date('2026-10-27'));
  assert.equal(current.days['2026-01-01'], undefined);
  assert.equal(current.days['2026-10-27'].analytics.count, 2);
});

test('forecasts exclude partial collection day and current day; include zero-traffic completed days', () => {
  let state = addUsage({ startedAt: null, days: {} }, 'analytics', 999, new Date('2026-10-01T12:00Z'));
  state = addUsage(state, 'analytics', 200, new Date('2026-10-02'));
  state = addUsage(state, 'analytics', 50, new Date('2026-10-04T06:00Z'));
  const budgets = { services: { analytics: { ratePerThousand: 2, monthlyAllowance: 1000, baseMonthlyCost: 5, monthlyBudget: 10 } } };
  const report = summarizeApiUsage(state, budgets, new Date('2026-10-04T12:00Z'));
  const service = report.services.find(service => service.id === 'analytics');
  assert.equal(report.forecastSampleDays, 2);
  assert.equal(service.averageDailyUsage, 100);
  assert.equal(service.monthUsage, 1249);
  assert.equal(service.projectedUsage, 1249 + 50 + 27 * 100);
  assert.equal(service.estimatedSpend, 5 + 249 * 2 / 1000);
  assert.equal(service.projectedSpend, 5 + (3999 - 1000) * 2 / 1000);
  assert.equal(service.forecastOverBudget, true);
  assert.equal(service.actualSpend, null);
});

test('zero rates are valid; missing rates and insufficient history remain unavailable', () => {
  const state = addUsage({ startedAt: null, days: {} }, 'analytics', 100, new Date('2026-10-27'));
  const report = summarizeApiUsage(state, EMPTY_BUDGETS, new Date('2026-10-27T12:00Z'));
  const analytics = report.services.find(service => service.id === 'analytics');
  assert.equal(analytics.projectedUsage, null);
  assert.equal(analytics.estimatedSpend, null);
  assert.equal(analytics.history.filter(point => point.count === null).length, 13);
  assert.equal(report.services.find(service => service.id === 'ga4').monthUsage, null);
  const zero = summarizeApiUsage(state, { services: { analytics: { ratePerThousand: 0 } } }, new Date('2026-10-27'));
  assert.equal(zero.services[0].estimatedSpend, 0);
});

test('forecasts handle UTC month rollover and leap-year February', () => {
  let state = addUsage({ startedAt: null, days: {} }, 'analytics', 9, new Date('2024-01-30'));
  state = addUsage(state, 'analytics', 100, new Date('2024-01-31'));
  state = addUsage(state, 'analytics', 20, new Date('2024-02-01'));
  const service = summarizeApiUsage(state, EMPTY_BUDGETS, new Date('2024-02-01T01:00Z')).services[0];
  assert.equal(service.monthUsage, 20);
  assert.equal(service.projectedUsage, 2900);
  const end = summarizeApiUsage(state, EMPTY_BUDGETS, new Date('2024-02-29T23:00Z')).services[0];
  assert.equal(end.projectedUsage, 20);
});

test('current-day spikes are never forecast below measured month usage', () => {
  let state = addUsage({ startedAt: null, days: {} }, 'analytics', 1, new Date('2026-10-01'));
  state = addUsage(state, 'analytics', 10, new Date('2026-10-02'));
  state = addUsage(state, 'analytics', 5000, new Date('2026-10-03'));
  const service = summarizeApiUsage(state, EMPTY_BUDGETS, new Date('2026-10-03')).services[0];
  assert.ok(service.projectedUsage >= service.monthUsage);
});

test('budget validation covers all services and rejects negative, string and non-finite settings', () => {
  const services = Object.fromEntries(API_SERVICES.map(service => [service.id, { ratePerThousand: 0, monthlyBudget: 100 }]));
  const parsed = validateBudgets(services);
  assert.equal(Object.keys(parsed).length, API_SERVICES.length);
  assert.equal(parsed.vercel.ratePerThousand, 0);
  assert.equal(parsed.vercel.monthlyAllowance, null);
  for (const value of [-1, Infinity, NaN, '12', false]) {
    assert.throws(() => validateBudgets({ vercel: { monthlyBudget: value } }));
  }
  for (const value of [null, [], { fake: {} }, { analytics: null }]) assert.throws(() => validateBudgets(value));
});

test('local settings persist, serialize concurrent updates and propagate corruption/errors', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tahaluf-admin-tests-'));
  const original = process.cwd();
  const vercel = process.env.VERCEL;
  delete process.env.VERCEL;
  process.chdir(directory);
  try {
    const defaults = { revision: 0 };
    assert.deepEqual(await readAdminSetting('dashboardFeatures', defaults), defaults);
    await Promise.all(Array.from({ length: 10 }, () => updateAdminSetting('dashboardFeatures', defaults, state => ({ revision: state.revision + 1 }))));
    assert.equal((await readAdminSetting('dashboardFeatures', defaults)).revision, 10);
    await fs.writeFile(path.join(directory, 'config', 'apiBudgets.json'), '{broken');
    await assert.rejects(readAdminSetting('apiBudgets', {}), SyntaxError);
    await assert.rejects(readAdminSetting('../escape', {}), /Unknown settings key/);
  } finally {
    process.chdir(original);
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
    await fs.rm(directory, { recursive: true });
  }
});

test('usage persistence runs after the response path and is registered with the Vercel request lifetime', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tahaluf-usage-tests-'));
  const original = process.cwd();
  const vercel = process.env.VERCEL;
  const contextKey = Symbol.for('@vercel/request-context');
  const originalContext = globalThis[contextKey];
  const pending = [];
  globalThis[contextKey] = { get: () => ({ waitUntil: promise => pending.push(promise) }) };
  delete process.env.VERCEL;
  process.chdir(directory);
  try {
    const result = observeApiUsage('sheets', 2);
    assert.equal(result, undefined, 'callers do not await database persistence');
    observeApiUsage('firestore', 3, 'reads');
    assert.equal(pending.length, 2, 'every observation has a registered background task');
    await Promise.all(pending);
    const persisted = await readAdminSetting('apiUsage', {});
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(persisted.days[today].sheets.count, 2);
    assert.equal(persisted.days[today].firestore.metrics.reads, 3);
  } finally {
    await Promise.all(pending);
    process.chdir(original);
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
    if (originalContext === undefined) delete globalThis[contextKey];
    else globalThis[contextKey] = originalContext;
    await fs.rm(directory, { recursive: true });
  }
});

test('health observations skip unchanged writes while preserving issue opening and resolution', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tahaluf-health-tests-'));
  const original = process.cwd();
  const vercel = process.env.VERCEL;
  delete process.env.VERCEL;
  process.chdir(directory);
  const file = path.join(directory, 'config', 'healthNotifications.json');
  try {
    await fs.mkdir(path.dirname(file));
    await fs.writeFile(file, JSON.stringify({
      settings: { emailEnabled: false },
      activeIssues: {}, history: [], lastDigestDate: null
    }));
    const health = await import(`../lib/healthNotifications.mjs?quota-test=${Date.now()}`);
    const stamp = new Date('2000-01-01T00:00:00Z');
    await fs.utimes(file, stamp, stamp);
    await health.observeHealthSource('event:Actuals', null);
    await health.observeHealthIssues([]);
    assert.equal((await fs.stat(file)).mtimeMs, stamp.getTime(), 'healthy observations perform no writes');
    const issue = { key: 'event:Actuals', eventName: 'Event', kind: 'Actuals', status: 'unavailable', message: 'Unavailable' };
    await health.observeHealthSource(issue.key, issue);
    let state = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(state.history.length, 1);
    assert.ok(state.activeIssues[issue.key]);
    await fs.utimes(file, stamp, stamp);
    await health.observeHealthSource(issue.key, issue);
    assert.equal((await fs.stat(file)).mtimeMs, stamp.getTime(), 'identical issues do not rewrite state');
    await health.observeHealthSource(issue.key, null);
    state = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(state.activeIssues[issue.key], undefined);
    assert.ok(state.history[0].resolvedAt);
    await fs.utimes(file, stamp, stamp);
    await health.observeHealthSource(issue.key, null);
    assert.equal((await fs.stat(file)).mtimeMs, stamp.getTime(), 'repeated resolution does not rewrite state');
  } finally {
    process.chdir(original);
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
    await fs.rm(directory, { recursive: true });
  }
});
