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
import * as healthUtils from '../lib/healthNotificationUtils.mjs';
import * as dimensionRules from '../lib/dimensionStandards.mjs';
import * as d3 from 'd3';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as healthTemplates from '../lib/healthEmailTemplates.mjs';
import { summarizeSheetData, storeSheetSnapshot, getSheetCacheHealth } from '../lib/sheetCache.mjs';

const require = createRequire(import.meta.url);

async function loadInstrumentedModule(relativePath, overrides = {}, globals = {}) {
  const file = new URL(relativePath, import.meta.url);
  const source = await fs.readFile(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React }
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tahaluf-settings-test1-'));
  try {
    const settings = await loadInstrumentedModule('../lib/adminSettingsStore.mjs', {
      './firebaseAdmin.js': { getFirebaseAdmin: () => ({ adminDb: db }) }
    }, { Date: clock.Date, process: { env: { VERCEL: '1' }, cwd: () => tempDir } });
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
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tahaluf-settings-test2-'));
  try {
    const settings = await loadInstrumentedModule('../lib/adminSettingsStore.mjs', {
      './firebaseAdmin.js': { getFirebaseAdmin: () => ({ adminDb: db }) }
    }, { process: { env: { VERCEL: '1' }, cwd: () => tempDir } });
    const oldRead = settings.readAdminSetting('dashboardFeatures', {});
    await new Promise(resolve => setImmediate(resolve));
    await settings.updateAdminSetting('dashboardFeatures', {}, () => ({ revision: 2 }));
    release();
    assert.equal((await oldRead).revision, 1);
    assert.equal((await settings.readAdminSetting('dashboardFeatures', {})).revision, 2);
    assert.equal(reads, 2);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
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
    active: true,
    requestId: { current: 0 },
    setIsRefreshing() {},
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
    active: true,
    requestId: { current: 0 },
    setIsRefreshing() {},
    clearInterval() {},
    lowQuotaMode: true,
    fetchAnalytics: () => { fetches++; },
    setInterval: () => { assert.fail('low-quota mode must not schedule polling'); }
  });
  assert.equal(fetches, 1, 'low-quota mode preserves initial/filter loads');
  assert.equal(typeof lowModeCleanup, 'function', 'low-quota mode still invalidates outstanding requests on cleanup');
  lowModeCleanup();
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
    '../../../../lib/dimensionMonitoring.mjs': { getDimensionSettings: async () => ({}) },
    '../../../../lib/dimensionStandards.mjs': dimensionRules,
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

test('audit enhancements features default to admin_only and obey permissions', async () => {
  const { extractChannelMetrics24h, checkMetricDiscrepancies } = await import('../lib/metricIntegrity.mjs');
  
  const newFeatureIds = ['quickJump', 'dimensionExport', 'bulkDimensionImport', 'tvCustomization', 'budgetSimulator', 'channelQuadrant', 'launchForecaster', 'creativeFatigue'];
  for (const id of newFeatureIds) {
    const feature = DASHBOARD_FEATURES.find(f => f.id === id);
    assert.ok(feature, `Feature ${id} is registered in DASHBOARD_FEATURES`);
    assert.equal(feature.defaultMode, 'admin_only', `Feature ${id} defaults to admin_only`);
    assert.equal(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, id, 'standard'), false, `Standard user cannot access ${id} by default`);
    assert.equal(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, id, 'admin'), true, `Admin user can access ${id} by default`);
    assert.equal(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, id, 'admin', true), false, `Simulator preview hides ${id} for standard persona`);
  }

  // tvCustomization requires parent tv feature
  const tvDisabledConfig = { modes: { ...DEFAULT_FEATURE_CONFIG.modes, tv: 'disabled', tvCustomization: 'admin_only' } };
  assert.equal(isFeatureEnabled(tvDisabledConfig, 'tvCustomization', 'admin'), false, 'tvCustomization is disabled if tv is disabled');

  // Verify partial-day metric integrity filtering
  const csvWithToday = [
    'Event Name DB,Channel,Date,Cost,Impressions,Clicks,Conversions',
    'SMLC 26,Google Ads,2026-10-27,200,5000,120,15',
    'SMLC 26,Google Ads,2026-10-28,50,1000,20,3'
  ].join('\n');

  // Extract with excludePartialCurrentDay: true when today is 2026-10-28
  const resFiltered = extractChannelMetrics24h(csvWithToday, '', { excludePartialCurrentDay: true, currentDay: '2026-10-28' });
  assert.equal(resFiltered.latestDate, '2026-10-27', 'Excludes partial current day and picks latest complete date');

  // Check discrepancies with filterPartialCurrentDay: true
  const baseline = {
    'SMLC 26:::Google Ads:::2026-10-28': { cost: 100, impressions: 2000, clicks: 40, conversions: 5 }
  };
  const current = [
    { eventName: 'SMLC 26', channel: 'Google Ads', date: '2026-10-28', cost: 50, impressions: 1000, clicks: 20, conversions: 3 }
  ];
  const discFiltered = checkMetricDiscrepancies(current, baseline, { filterPartialCurrentDay: true, currentDay: '2026-10-28' });
  assert.equal(discFiltered.discrepancies.length, 0, 'Ignores partial current-day drops when filterPartialCurrentDay is enabled');

  const discUnfiltered = checkMetricDiscrepancies(current, baseline, { filterPartialCurrentDay: false, currentDay: '2026-10-28' });
  assert.ok(discUnfiltered.discrepancies.length > 0, 'Flags regression drop when filterPartialCurrentDay is false');
  assert.equal(discUnfiltered.discrepancies[0].isPartialDay, true, 'Marks discrepancy with isPartialDay context flag');
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

async function resolutionHarness(persistent = true) {
  const clock = fakeClock();
  let state = {
    settings: { ...healthUtils.DEFAULT_HEALTH_NOTIFICATION_SETTINGS, alertDelayMinutes: 0, emailRecipients: ['admin@example.test'] },
    activeIssues: {}, history: [], lastDigestDate: null
  };
  let writes = 0;
  let failure = false;
  let rejected = false;
  let beforeSend = null;
  const sent = [];
  const errors = [];
  let checkSettings = { metricChecksEnabled: true, dimensionChecksEnabled: true };
  const ref = {
    get: async () => ({ exists: true, data: () => structuredClone(state) }),
    set: async patch => { state = { ...state, ...structuredClone(patch) }; writes++; }
  };
  let transaction = Promise.resolve();
  const db = {
    collection: () => ({ doc: () => ref }),
    runTransaction: update => {
      const result = transaction.then(() => update({
        get: ref.get,
        set: (_, next) => { state = structuredClone(next); writes++; }
      }));
      transaction = result;
      return result;
    }
  };
  const overrides = {
    'node:fs': {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(state),
      writeFileSync: (_, json) => { state = JSON.parse(json); writes++; }
    },
    'node:util': { isDeepStrictEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right) },
    './healthNotificationUtils.mjs': healthUtils,
    './dimensionMonitoring.mjs': { getDimensionSettings: async () => checkSettings },
    './dimensionStandards.mjs': dimensionRules,
    './healthEmailTransport.mjs': { getSmtpTransportConfig: () => ({ host: 'smtp.example.test' }) },
    './healthEmailTemplates.mjs': {
      formatHealthAlertEmail: () => ({ subject: 'Issue', text: 'Issue' }),
      formatHealthResolvedEmail: () => ({ subject: 'Resolved', text: 'Resolved' }),
      formatDailyDigestEmail: () => ({ subject: 'Digest', text: 'Digest' })
    },
    './firebaseAdmin.js': { getFirebaseAdmin: () => ({ adminDb: db }) },
    './apiUsage.mjs': { observeApiUsage: () => {} },
    nodemailer: { createTransport: () => ({
      close() {},
      sendMail: async mail => {
        sent.push(mail);
        if (beforeSend) await beforeSend(mail);
        if (failure) throw new Error('SMTP temporarily unavailable');
        return { accepted: rejected ? [] : ['admin@example.test'], rejected: rejected ? ['admin@example.test'] : [] };
      }
    }) }
  };
  const reload = () => loadInstrumentedModule('../lib/healthNotifications.mjs', overrides, {
    Date: clock.Date,
    process: { env: { VERCEL: persistent ? '1' : '0', HEALTH_ALERT_FROM: 'sender@example.test' }, cwd: () => '/test' },
    console: { error: (...args) => errors.push(args) }
  });
  return {
    health: await reload(), reload, clock, sent, errors, state: () => state, writes: () => writes,
    fail: value => { failure = value; }, reject: value => { rejected = value; },
    beforeSend: hook => { beforeSend = hook; },
    checks: next => { checkSettings = { ...checkSettings, ...next }; }
  };
}

const recoveryIssue = { key: 'gsts:Actuals', eventName: 'GSTS 26', kind: 'Actuals', status: 'unavailable', message: 'Unavailable' };

test('resolution failure persists after recovery and retries after five minutes across instances', async () => {
  for (const persistent of [false, true]) {
    const harness = await resolutionHarness(persistent);
    await harness.health.observeHealthSource(recoveryIssue.key, recoveryIssue);
    harness.fail(true);
    await harness.health.observeHealthSource(recoveryIssue.key, null);
    assert.equal(harness.sent.length, 2);
    assert.equal(harness.state().activeIssues[recoveryIssue.key], undefined);
    assert.equal(Object.keys(harness.state().pendingResolutions).length, 1);
    assert.equal(harness.state().history[0].resolutionEmailStatus, 'failed');
    assert.match(harness.state().history[0].resolutionEmailError, /SMTP temporarily unavailable/);
    assert.equal(harness.errors.length, 1);
    const writes = harness.writes();
    const reloaded = await harness.reload();
    await reloaded.observeHealthSource(recoveryIssue.key, null);
    assert.equal(harness.sent.length, 2);
    assert.equal(harness.writes(), writes, 'cooldown checks do not rewrite state');
    harness.fail(false);
    harness.clock.advance(5 * 60_000);
    await Promise.all([harness.health.observeHealthIssues([]), reloaded.observeHealthIssues([])]);
    assert.equal(harness.sent.length, 3, 'one retry across concurrent instances');
    assert.equal(Object.keys(harness.state().pendingResolutions).length, 0);
    assert.equal(harness.state().history[0].resolutionEmailStatus, 'accepted');
    assert.equal(harness.state().history[0].resolutionEmailError, null);
    assert.ok(harness.state().history[0].resolutionEmailSentAt);
    await reloaded.observeHealthSource(recoveryIssue.key, null);
    assert.equal(harness.sent.length, 3, 'successful recovery is not sent again');
  }
});

test('status changes retain eligibility when the replacement alert fails before recovery', async () => {
  const harness = await resolutionHarness();
  await harness.health.observeHealthSource(recoveryIssue.key, recoveryIssue);
  harness.clock.advance(1000);
  harness.fail(true);
  await assert.rejects(harness.health.observeHealthSource(recoveryIssue.key, { ...recoveryIssue, status: 'missing-data' }), /SMTP temporarily unavailable/);
  assert.equal(harness.state().activeIssues[recoveryIssue.key].lastSentAt, null);
  assert.ok(harness.state().activeIssues[recoveryIssue.key].notifiedAt);
  harness.fail(false);
  await harness.health.observeHealthSource(recoveryIssue.key, null);
  assert.equal(harness.sent.at(-1).subject, 'Resolved');
  assert.equal(harness.state().history.at(-1).resolutionEmailStatus, 'accepted');
});

test('recovery during an in-flight issue alert queues its resolution after SMTP accepts', async () => {
  const harness = await resolutionHarness();
  harness.beforeSend(async mail => {
    if (mail.subject === 'Issue') await harness.health.observeHealthSource(recoveryIssue.key, null);
  });
  await harness.health.observeHealthSource(recoveryIssue.key, recoveryIssue);
  assert.equal(harness.sent.length, 2);
  assert.equal(harness.sent[1].subject, 'Resolved');
  assert.equal(harness.state().history[0].resolutionEmailStatus, 'accepted');
});

test('SMTP rejection does not count as a sent health alert or completed resolution', async () => {
  const harness = await resolutionHarness();
  harness.reject(true);
  await assert.rejects(harness.health.observeHealthSource(recoveryIssue.key, recoveryIssue), /SMTP did not accept/);
  assert.equal(harness.state().activeIssues[recoveryIssue.key].lastSentAt, null);
  await harness.health.observeHealthSource(recoveryIssue.key, null);
  assert.equal(harness.sent.length, 1, 'no resolution for an alert that was not accepted');
  const retry = await resolutionHarness();
  await retry.health.observeHealthSource(recoveryIssue.key, recoveryIssue);
  retry.reject(true);
  await retry.health.observeHealthSource(recoveryIssue.key, null);
  assert.equal(retry.state().history[0].resolutionEmailStatus, 'failed');
  assert.equal(Object.keys(retry.state().pendingResolutions).length, 1);
});

test('resolution settings and alert grace period prevent unwanted recovery emails', async () => {
  for (const setting of ['emailEnabled', 'sendResolutionEmail']) {
    const harness = await resolutionHarness();
    await harness.health.observeHealthSource(recoveryIssue.key, recoveryIssue);
    await harness.health.saveHealthNotificationSettings({ ...harness.state().settings, [setting]: false });
    await harness.health.observeHealthSource(recoveryIssue.key, null);
    assert.equal(harness.sent.length, 1);
    assert.equal(Object.keys(harness.state().pendingResolutions).length, 1);
    await harness.health.saveHealthNotificationSettings({ ...harness.state().settings, [setting]: true });
    await harness.health.observeHealthSource(recoveryIssue.key, null);
    assert.equal(harness.sent.length, 2);
  }
  const harness = await resolutionHarness();
  await harness.health.saveHealthNotificationSettings({ ...harness.state().settings, alertDelayMinutes: 5 });
  await harness.health.observeHealthSource(recoveryIssue.key, recoveryIssue);
  await harness.health.observeHealthSource(recoveryIssue.key, null);
  assert.equal(harness.sent.length, 0);
  assert.equal(Object.keys(harness.state().pendingResolutions).length, 0);
});

const standardsCsv = () => d3.csvFormat([Object.fromEntries(dimensionRules.DIMENSIONS.map(dimension => [
  dimension.label, dimension.id === 'event' ? 'GSTS 2026' : `${dimension.id} standard`
]))]);
const dimensionContext = enabledDimensions => ({
  values: dimensionRules.parseDimensionStandards(standardsCsv()),
  enabledDimensions: enabledDimensions || dimensionRules.DEFAULT_DIMENSION_SETTINGS.enabledDimensions,
  fetchedAt: '2026-10-27T00:00:00.000Z'
});
const validDimensionRow = () => Object.fromEntries(dimensionRules.DIMENSIONS.map(dimension => [
  dimension.headers[0], dimension.id === 'event' ? 'GSTS 2026' : `${dimension.id} standard`
]));
const dimensionSource = validation => ({
  eventId: 'gsts', eventName: 'GSTS 26', kind: 'Actuals', state: 'healthy', eventDataStatus: 'present',
  dimensionHealth: dimensionRules.dimensionHealthForSource({ eventName: 'GSTS 26', kind: 'Actuals' }, validation)
});

test('standards parser treats columns as independent lists and rejects missing or empty standards', () => {
  const parsed = dimensionRules.parseDimensionStandards(standardsCsv());
  assert.equal(Object.keys(parsed).length, 11);
  assert.deepEqual(parsed.event, ['GSTS 2026']);
  const rows = d3.csvParse(standardsCsv());
  rows.push({ EVENT: 'SAIF 2026', Language: 'Another language' });
  const extended = dimensionRules.parseDimensionStandards(d3.csvFormat(rows));
  assert.deepEqual(extended.event, ['GSTS 2026', 'SAIF 2026']);
  assert.equal(extended.strategy.length, 1, 'blank standards cells are not allowed values');
  assert.throws(() => dimensionRules.parseDimensionStandards('EVENT\nGSTS 2026'), /column missing/);
  rows[0].Strategy = '';
  assert.throws(() => dimensionRules.parseDimensionStandards(d3.csvFormat(rows)), /empty or too large/);
  for (const invalid of [null, {}, ['no-such-dimension'], ['event', 'event']]) {
    assert.throws(() => dimensionRules.validateDimensionSelection(invalid));
  }
  assert.deepEqual(dimensionRules.validateDimensionSelection([]), []);
});

test('all eleven dimensions validate raw values with exact normalization and preferred headers', () => {
  const row = validDimensionRow();
  for (const key of Object.keys(row)) row[key] = ` ${row[key].toUpperCase()} `;
  row.EVENT = 'ignored lower-priority header';
  const result = dimensionRules.checkDimensionRows(d3.csvFormat([row]), dimensionContext());
  assert.equal(result.status, 'checked');
  assert.equal(result.groups[0].findings.length, 0);
  assert.equal(result.columns.event, 'Event Name DB');
  assert.equal(dimensionSource(result).dimensionHealth.findings.length, 0);
  row['Event Name DB'] = 'GSTS 26';
  row.Channel = 'channel_standard';
  const invalid = dimensionRules.checkDimensionRows(d3.csvFormat([row]), dimensionContext());
  assert.equal(invalid.groups[0].findings.length, 2, 'no fuzzy matching, punctuation rewriting or implicit standard aliases');
  assert.equal(dimensionSource(invalid).dimensionHealth.findings.length, 2, 'display year alias attributes to correct event without accepting invalid value');
});

test('blanks, non-standard values and missing columns have separate counts and bounded record samples', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    ...validDimensionRow(), Channel: index < 5 ? '' : `Unknown${index}`, 'Language DB': ''
  }));
  for (const row of rows) {
    delete row['Strategy DB'];
    delete row['Language DB'];
    row.Language = '';
  }
  const result = dimensionRules.checkDimensionRows(d3.csvFormat(rows), dimensionContext());
  const findings = result.groups[0].findings;
  assert.equal(findings.find(finding => finding.dimension === 'strategy').type, 'missing-column');
  assert.equal(findings.find(finding => finding.dimension === 'strategy').count, 10);
  assert.equal(findings.find(finding => finding.dimension === 'language').type, 'blank');
  assert.equal(findings.find(finding => finding.dimension === 'channel' && finding.type === 'blank').count, 5);
  const invalid = findings.find(finding => finding.dimension === 'channel' && finding.type === 'non-standard');
  assert.equal(invalid.count, 5);
  assert.deepEqual(invalid.sampleRows, [7, 8, 9]);
  assert.equal(invalid.values.length, 3);
  const selected = dimensionRules.checkDimensionRows(d3.csvFormat(rows), dimensionContext(['event']));
  assert.equal(selected.groups[0].findings.length, 0, 'deselected columns do not generate findings');
  assert.equal(dimensionRules.checkDimensionRows('', { enabledDimensions: [] }).status, 'disabled');
  assert.equal(dimensionRules.checkDimensionRows('', { enabledDimensions: ['event'] }).status, 'unavailable');
});

test('findings stay event-scoped, invalid unmapped event names remain visible and Planned is excluded', () => {
  const rows = [
    { ...validDimensionRow(), Channel: 'bad' },
    { ...validDimensionRow(), 'Event Name DB': 'SAIF 2026', Channel: 'channel standard' },
    { ...validDimensionRow(), 'Event Name DB': 'typo-event' }
  ];
  const context = dimensionContext();
  context.values.event.push('SAIF 2026');
  const validation = dimensionRules.checkDimensionRows(d3.csvFormat(rows), context);
  const source = dimensionSource(validation);
  assert.equal(source.dimensionHealth.findings.filter(finding => finding.dimension === 'channel').length, 1);
  assert.equal(source.dimensionHealth.findings.find(finding => finding.sheetWide).values[0], 'typo-event');
  const saif = dimensionRules.dimensionHealthForSource({ eventName: 'SAIF 26', kind: 'Actuals' }, validation);
  assert.equal(saif.findings.filter(finding => finding.dimension === 'channel').length, 0);
  assert.equal(dimensionRules.dimensionHealthForSource({ kind: 'Planned' }, validation), null);
  const overflow = dimensionRules.checkDimensionRows(d3.csvFormat(Array.from({ length: 31 }, (_, i) => ({
    ...validDimensionRow(), 'Event Name DB': `event${i}`
  }))), context);
  assert.equal(overflow.status, 'unavailable');
  assert.match(overflow.error, /Too many event groups/);
  const large = dimensionRules.checkDimensionRows(d3.csvFormat(Array.from({ length: 90 }, (_, i) => Object.fromEntries(
    dimensionRules.DIMENSIONS.map(dimension => [
      dimension.headers[0], dimension.id === 'event' ? `event${Math.floor(i / 3)}` : `${i}${'\u754c'.repeat(200)}`
    ])
  ))), context);
  assert.equal(large.status, 'unavailable');
  assert.match(large.error, /256 KiB/);
});

test('global custom accepted values, event-specific overrides, and excluded values in dimension checking', () => {
  const baseRow = validDimensionRow();
  const rows = [
    { ...baseRow, 'Event Name DB': 'GSTS 2026', Channel: 'Custom Channel', Market: 'APAC' },
    { ...baseRow, 'Event Name DB': 'SAIF 2026', Channel: 'Custom Channel', Market: 'APAC' }
  ];
  const context = dimensionContext();
  context.values.event.push('SAIF 2026');

  // 1. Without overrides: both rows have 'Channel: non-standard'
  const unconfigured = dimensionRules.checkDimensionRows(d3.csvFormat(rows), context);
  assert.equal(unconfigured.groups[0].findings.filter(f => f.dimension === 'channel').length, 1);
  assert.equal(unconfigured.groups[1].findings.filter(f => f.dimension === 'channel').length, 1);

  // 2. With event override for GSTS 2026: GSTS accepts 'Custom Channel', SAIF still flags it
  context.eventCustomValues = {
    'gsts-26': { channel: ['Custom Channel'] }
  };
  context.events = [{ id: 'gsts-26', name: 'GSTS 2026' }, { id: 'saif-26', name: 'SAIF 2026' }];
  const eventOverridden = dimensionRules.checkDimensionRows(d3.csvFormat(rows), context);
  const gstsFindings = eventOverridden.groups.find(g => g.eventName === 'GSTS 2026').findings;
  const saifFindings = eventOverridden.groups.find(g => g.eventName === 'SAIF 2026').findings;
  assert.equal(gstsFindings.filter(f => f.dimension === 'channel').length, 0, 'GSTS accepts custom channel');
  assert.equal(saifFindings.filter(f => f.dimension === 'channel').length, 1, 'SAIF still flags custom channel');

  // 3. With global custom addition: both events accept 'Custom Channel'
  delete context.eventCustomValues;
  context.customValues = { channel: ['Custom Channel'] };
  const globalOverridden = dimensionRules.checkDimensionRows(d3.csvFormat(rows), context);
  assert.equal(globalOverridden.groups[0].findings.filter(f => f.dimension === 'channel').length, 0);
  assert.equal(globalOverridden.groups[1].findings.filter(f => f.dimension === 'channel').length, 0);

  // 4. With excluded standard value: 'market standard' was standard, now excluded
  context.excludedValues = { market: ['market standard'] };
  const excluded = dimensionRules.checkDimensionRows(d3.csvFormat(rows), context);
  assert.equal(excluded.groups[0].findings.filter(f => f.dimension === 'market').length, 1);
});

test('dimensionMonitoring manages custom values, per-event overrides, and 1-click accepts', async () => {
  let state = {
    ...dimensionRules.DEFAULT_DIMENSION_SETTINGS,
    values: dimensionContext().values
  };
  const monitor = await loadInstrumentedModule('../lib/dimensionMonitoring.mjs', {
    './adminSettingsStore.mjs': {
      readAdminSetting: async () => state,
      updateAdminSetting: async (key, fallback, update) => {
        state = update(state);
        return state;
      }
    },
    './dimensionStandards.mjs': dimensionRules
  });

  // Save global custom values
  await monitor.saveCustomValues({ channel: ['TikTok Ads', 'Twitch'] });
  assert.deepEqual([...state.customValues.channel], ['TikTok Ads', 'Twitch']);

  // Save event-specific custom values
  await monitor.saveEventCustomValues('gsts-26', { campaignType: ['Special Transit'] });
  assert.deepEqual([...state.eventCustomValues['gsts-26'].campaignType], ['Special Transit']);

  // 1-click accept globally
  await monitor.acceptDimensionValue({ dimension: 'market', value: 'MENA-Special', scope: 'global' });
  assert.ok(state.customValues.market.includes('MENA-Special'));

  // 1-click accept for event
  await monitor.acceptDimensionValue({ dimension: 'market', value: 'Riyadh Metro', eventId: 'gsts-26', scope: 'event' });
  assert.ok(state.eventCustomValues['gsts-26'].market.includes('Riyadh Metro'));

  // Save excluded values
  await monitor.saveExcludedValues({ channel: ['Display'] });
  assert.deepEqual([...state.excludedValues.channel], ['Display']);

  // Validation rejects invalid dimension or empty string
  await assert.rejects(monitor.acceptDimensionValue({ dimension: 'invalid', value: 'test' }));
  await assert.rejects(monitor.acceptDimensionValue({ dimension: 'channel', value: '' }));
});

test('feed, metric and dimension issues remain separate and missing or stale standards never pass', () => {
  const validation = dimensionRules.checkDimensionRows(d3.csvFormat([{ ...validDimensionRow(), Channel: 'bad' }]), dimensionContext());
  const source = {
    ...dimensionSource(validation), state: 'stale', lastError: 'Timeout',
    metricDiscrepancies: [{ channel: 'X', metric: 'clicks', previousValue: 20, currentValue: 10, dropPercent: 50 }]
  };
  const issues = healthUtils.getHealthIssues([source]);
  assert.deepEqual(issues.map(issue => issue.key), ['gsts:Actuals', 'gsts:Actuals:metrics', 'gsts:Actuals:dimensions']);
  assert.deepEqual(issues.map(issue => issue.category), ['feed', 'metrics', 'dimensions']);
  assert.match(issues[2].message, /Channel: non-standard, 1 rows/);
  const unavailable = healthUtils.getHealthIssues([dimensionSource(null)]);
  assert.equal(unavailable[0].status, 'dimension-unavailable');
  const stale = healthUtils.getHealthIssues([dimensionSource({ ...validation, stale: true, error: 'Network failed' })]);
  assert.equal(stale[0].status, 'dimension-unavailable');
  assert.match(stale[0].message, /stale standards: Network failed/);
});

test('dimension settings cache standards for a day, coalesces fetches and retains valid values on failure', async () => {
  const clock = fakeClock();
  let state = structuredClone(dimensionRules.DEFAULT_DIMENSION_SETTINGS);
  let fetches = 0;
  let writes = 0;
  let fail = false;
  const errors = [];
  const monitor = await loadInstrumentedModule('../lib/dimensionMonitoring.mjs', {
    './adminSettingsStore.mjs': {
      readAdminSetting: async () => structuredClone(state),
      updateAdminSetting: async (_, defaults, update) => { state = update(state); writes++; return structuredClone(state); }
    },
    './dimensionStandards.mjs': dimensionRules
  }, {
    Date: clock.Date, AbortSignal,
    fetch: async url => {
      fetches++;
      assert.equal(url, dimensionRules.STANDARDS_URL);
      if (fail) throw new Error('Standards unavailable');
      return { ok: true, text: async () => standardsCsv() };
    },
    console: { error: (...args) => errors.push(args) }
  });
  await Promise.all(Array.from({ length: 100 }, () => monitor.loadDimensionStandards()));
  assert.equal(fetches, 1);
  assert.equal(writes, 1);
  await monitor.summarizeDimensions(d3.csvFormat([validDimensionRow()]));
  assert.equal(fetches, 1);
  assert.equal(writes, 1, 'warm validation does not write settings');
  clock.advance(24 * 60 * 60_000);
  fail = true;
  const stale = await monitor.loadDimensionStandards();
  assert.equal(stale.stale, true);
  assert.ok(stale.values.event);
  assert.match(stale.error, /Standards unavailable/);
  await monitor.loadDimensionStandards();
  assert.equal(fetches, 2, 'failed refresh has five-minute backoff');
  assert.equal(errors.length, 1);
  fail = false;
  await monitor.loadDimensionStandards(true);
  assert.equal(fetches, 3);
  assert.equal(state.error, null);
  await monitor.saveDimensionSelection([]);
  const disabled = await monitor.summarizeDimensions('');
  assert.equal(disabled.status, 'disabled');
  assert.equal(fetches, 3, 'all-off validation does not fetch standards');
  assert.ok(state.values.event, 'selection save retains standards');
  await assert.rejects(monitor.saveDimensionSelection(['invalid']));
});

test('new category email preferences default enabled and filter immediate, digest and resolution sends', async () => {
  assert.equal(healthUtils.normalizeHealthNotificationSettings({}).metricEmailEnabled, true);
  assert.equal(healthUtils.normalizeHealthNotificationSettings({}).dimensionEmailEnabled, true);
  for (const [category, setting] of [['metrics', 'metricEmailEnabled'], ['dimensions', 'dimensionEmailEnabled']]) {
    const harness = await resolutionHarness();
    const issue = { ...recoveryIssue, key: `${recoveryIssue.key}:${category}`, category };
    await harness.health.saveHealthNotificationSettings({ ...harness.state().settings, [setting]: false });
    await harness.health.observeHealthSource(issue.key, issue);
    assert.equal(harness.sent.length, 0);
    assert.ok(harness.state().activeIssues[issue.key], 'dashboard issue remains tracked');
    const digest = await harness.health.sendDailyHealthDigest([issue]);
    assert.equal(digest.sent, false);
    await harness.health.saveHealthNotificationSettings({ ...harness.state().settings, [setting]: true });
    await harness.health.observeHealthSource(issue.key, issue);
    assert.equal(harness.sent.length, 1);
    await harness.health.saveHealthNotificationSettings({ ...harness.state().settings, [setting]: false });
    await harness.health.observeHealthSource(issue.key, null);
    assert.equal(harness.sent.length, 1, 'category-off recovery stays pending without sending');
    await harness.health.saveHealthNotificationSettings({ ...harness.state().settings, [setting]: true });
    await harness.health.observeHealthSource(issue.key, null);
    assert.equal(harness.sent.length, 2);
  }
});

test('source-scoped observations resolve only recovered categories, even when another send fails', async () => {
  const harness = await resolutionHarness();
  const metrics = { ...recoveryIssue, key: `${recoveryIssue.key}:metrics`, category: 'metrics' };
  const dimensions = { ...recoveryIssue, key: `${recoveryIssue.key}:dimensions`, category: 'dimensions' };
  await harness.health.observeHealthSourceIssues(recoveryIssue.key, [metrics, dimensions]);
  assert.equal(harness.sent.length, 2);
  await harness.health.observeHealthSourceIssues(recoveryIssue.key, [dimensions]);
  assert.equal(harness.sent.length, 3);
  assert.ok(harness.state().activeIssues[dimensions.key]);
  assert.equal(harness.state().activeIssues[metrics.key], undefined);
  assert.equal(harness.state().history.filter(item => item.resolvedAt).length, 1);
  const other = { ...recoveryIssue, key: 'other:Actuals' };
  await harness.health.observeHealthSource(other.key, other);
  await harness.health.observeHealthSourceIssues(recoveryIssue.key, []);
  assert.ok(harness.state().activeIssues[other.key], 'other events are not resolved');
  const failing = await resolutionHarness();
  failing.beforeSend(async () => { if (failing.sent.length === 1) throw new Error('one category failed'); });
  await assert.rejects(failing.health.observeHealthSourceIssues(recoveryIssue.key, [metrics, dimensions]), /one category failed/);
  assert.equal(failing.sent.length, 2, 'one failed send must not suppress the other category');
});

test('dimension alert templates escape raw values and identify the category without claiming full recovery', () => {
  const issue = {
    ...recoveryIssue, category: 'dimensions', status: 'dimension-discrepancy',
    message: 'Language: non-standard <script>alert(1)</script>',
    dimensionFindings: [{ label: 'Language', type: 'non-standard', count: 2, values: ['<script>'], sampleRows: [2, 3] }]
  };
  const alert = healthTemplates.formatHealthAlertEmail(issue);
  assert.ok(alert.subject.includes('[dimensions]'));
  assert.ok(alert.html.includes('Dimension Standards Check'));
  assert.ok(alert.html.includes('&lt;script&gt;'));
  assert.ok(!alert.html.includes('<script>'));
  assert.ok(alert.text.includes('CSV records 2, 3'));
  const resolved = healthTemplates.formatHealthResolvedEmail(issue, new Date().toISOString());
  assert.ok(resolved.html.includes('Other issue categories may still require attention'));
});

test('Health Monitor renders all selected dimensions and independent enabled category email checkboxes', async () => {
  const adminUI = await loadInstrumentedModule('../app/components/AdminUI.jsx');
  adminUI.useAdminView = () => ['settings', () => {}];
  adminUI.useAdminDirtyGuard = () => {};
  const component = await loadInstrumentedModule('../app/components/DataHealthAdmin.jsx', {
    './AdminUI': adminUI,
    '../../lib/firebase': { auth: {} },
    '../../lib/healthNotificationUtils.mjs': healthUtils,
    './DashboardFeatureContext': { useLowQuotaMode: () => false },
    '../../lib/dimensionStandards.mjs': dimensionRules,
    './DimensionFindings': (await loadInstrumentedModule('../app/components/DimensionFindings.jsx')).default
  });
  const html = renderToStaticMarkup(React.createElement(component.default));
  assert.ok(html.includes('Dimension standards'));
  assert.ok(html.includes('Email metric issues'));
  assert.ok(html.includes('Email dimension issues'));
  assert.ok(html.includes('Save dimension checks'));
  assert.ok(html.includes('Refresh standards'));
  assert.ok(html.includes('Actuals only'));
  for (const dimension of dimensionRules.DIMENSIONS) assert.ok(html.includes(dimension.label), dimension.id);
  assert.ok(html.includes('Enable metric health checks'));
  assert.ok(html.includes('Enable dimension health checks'));
  assert.ok(html.includes('Save global checks'));
  assert.equal((html.match(/checked=""/g) || []).length, 18, '11 dimensions, two global checks and five email/dashboard controls default checked');
});

test('dimension settings endpoints enforce admin auth and validate selections without touching email settings', async () => {
  let authorized = false;
  let writes = 0;
  const route = await loadInstrumentedModule('../app/api/admin/health-notifications/route.js', {
    '../../../../lib/eventsConfig.js': {},
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '../../../../lib/healthNotifications.mjs': {},
    '../../../../lib/healthNotificationUtils.mjs': healthUtils,
    '../../../../lib/requireAdminRequest.js': { isAdminRequest: async () => authorized },
    '../events/route.js': {},
    '../../../../lib/healthEmailTransport.mjs': {},
    '../../../../lib/dimensionMonitoring.mjs': {
      saveDimensionSelection: async ids => { const enabledDimensions = dimensionRules.validateDimensionSelection(ids); writes++; return { enabledDimensions }; },
      loadDimensionStandards: async () => { writes++; return { error: 'Google unavailable' }; },
      saveCustomValues: async customValues => { writes++; return { customValues }; },
      saveEventCustomValues: async (eventId, eventCustomValues) => { writes++; return { eventCustomValues: { [eventId]: eventCustomValues } }; },
      saveExcludedValues: async excludedValues => { writes++; return { excludedValues }; },
      acceptDimensionValue: async ({ dimension, value, eventId, scope }) => { writes++; return { accepted: { dimension, value, eventId, scope } }; }
    }
  }, { Response });
  const request = body => ({ json: async () => body });
  assert.equal((await route.POST(request({ action: 'save-dimensions', enabledDimensions: [] }))).status, 401);
  assert.equal((await route.POST(request({ action: 'refresh-standards' }))).status, 401);
  assert.equal((await route.POST(request({ action: 'accept-dimension-value', dimension: 'channel', value: 'TikTok' }))).status, 401);
  assert.equal(writes, 0);
  authorized = true;
  assert.equal((await route.POST(request({ action: 'save-dimensions', enabledDimensions: ['bad'] }))).status, 400);
  assert.equal(writes, 0);
  const saved = await route.POST(request({ action: 'save-dimensions', enabledDimensions: ['language'] }));
  assert.deepEqual((await saved.json()).dimensionSettings.enabledDimensions, ['language']);
  assert.equal((await route.POST(request({ action: 'refresh-standards' }))).status, 502);
  const accepted = await route.POST(request({ action: 'accept-dimension-value', dimension: 'channel', value: 'TikTok', scope: 'global' }));
  assert.equal(accepted.status, 200);
  assert.deepEqual((await accepted.json()).dimensionSettings.accepted, { dimension: 'channel', value: 'TikTok', scope: 'global' });
  const eventAccepted = await route.POST(request({ action: 'accept-dimension-value', dimension: 'market', value: 'Riyadh', eventId: 'gsts-26', scope: 'event' }));
  assert.equal(eventAccepted.status, 200);
  assert.deepEqual((await eventAccepted.json()).dimensionSettings.accepted, { dimension: 'market', value: 'Riyadh', eventId: 'gsts-26', scope: 'event' });
});

test('sheet refresh validates Actuals once, stores findings and forwards all categories without rechecking cache hits or Planned', async () => {
  const csv = d3.csvFormat([{ ...validDimensionRow(), Channel: 'bad' }]);
  const validation = dimensionRules.checkDimensionRows(csv, dimensionContext());
  let scans = 0;
  let fetches = 0;
  const stored = [];
  const observed = [];
  const route = await loadInstrumentedModule('../app/api/sheets/route.js', {
    'next/server': { NextResponse: Response },
    '../../../lib/sheetCache.mjs': {
      getSheetCacheKey: url => url,
      getSheetSnapshot: async () => null,
      summarizeSheetData: () => ({ rowCount: 1, eventColumn: 'Event Name DB', eventBreakdown: { 'GSTS 2026': { rows: 1 } } }),
      storeSheetSnapshot: async (_, text, summary) => {
        stored.push(summary);
        return { ...summary, state: 'healthy', hasCachedData: true, metricDiscrepancies: [{ channel: 'X', metric: 'clicks', previousValue: 20, currentValue: 10, dropPercent: 50 }] };
      }
    },
    '../../../lib/eventsConfig.js': { getEventsConfig: async () => ({ events: [{ id: 'gsts', name: 'GSTS 26', sourceName: 'GSTS', gid: '1', plannedGid: '2' }] }) },
    '../../../lib/healthNotifications.mjs': { observeHealthSourceIssues: async (key, issues) => observed.push({ key, issues }) },
    '../../../lib/healthNotificationUtils.mjs': healthUtils,
    '../../../lib/apiUsage.mjs': { observeApiRequest: () => {}, observeApiUsage: () => {}, withUsageScope: handler => handler },
    '../../../lib/dimensionMonitoring.mjs': { getDimensionSettings: async () => ({}), summarizeDimensions: async text => { scans++; assert.equal(text, csv); return validation; } },
    '../../../lib/dimensionStandards.mjs': dimensionRules
  }, {
    Response, Request, AbortController,
    process: { env: { COMBINED_COUNTRY_CSV_URL: 'https://example.test?csv=1' } },
    fetch: async () => { fetches++; return new Response(csv); }
  });
  const request = gid => new Request(`http://localhost/api/sheets?type=combined&gid=${gid}`);
  assert.equal((await route.GET(request('1'))).status, 200);
  assert.equal(scans, 1);
  assert.equal(stored[0].dimensionValidation, validation);
  assert.deepEqual(Array.from(observed[0].issues, issue => issue.category), ['metrics', 'dimensions']);
  await route.GET(request('1'));
  assert.equal(scans, 1);
  assert.equal(fetches, 1, 'warm cache hit adds no fetches or validation');
  await route.GET(request('2'));
  assert.equal(scans, 1, 'Planned does not scan dimensions');
  assert.equal(stored[1].dimensionValidation, undefined);
  assert.ok(observed.at(-1).issues.every(issue => issue.category !== 'dimensions'));
});

test('global switches filter cached category findings without hiding sheet availability issues', () => {
  const validation = dimensionRules.checkDimensionRows(d3.csvFormat([{ ...validDimensionRow(), Channel: 'bad' }]), dimensionContext());
  const source = {
    ...dimensionSource(validation), state: 'stale',
    metricDiscrepancies: [{ channel: 'X', metric: 'clicks', previousValue: 20, currentValue: 10, dropPercent: 50 }]
  };
  const both = dimensionRules.applyHealthCheckSettings(source, {});
  assert.equal(healthUtils.getHealthIssues([both]).length, 3);
  const metricsOff = dimensionRules.applyHealthCheckSettings(source, { metricChecksEnabled: false });
  assert.deepEqual(healthUtils.getHealthIssues([metricsOff]).map(issue => issue.category), ['feed', 'dimensions']);
  const dimensionsOff = dimensionRules.applyHealthCheckSettings(source, { dimensionChecksEnabled: false });
  assert.deepEqual(healthUtils.getHealthIssues([dimensionsOff]).map(issue => issue.category), ['feed', 'metrics']);
  assert.equal(dimensionsOff.dimensionHealth.status, 'disabled');
  const disabled = dimensionRules.applyHealthCheckSettings(source, { metricChecksEnabled: false, dimensionChecksEnabled: false });
  assert.deepEqual(healthUtils.getHealthIssues([disabled]).map(issue => issue.category), ['feed']);
  assert.equal(source.dimensionHealth.status, 'checked', 'filtering leaves stored findings intact');
});

test('global check settings require booleans, preserve dimension selections and skip standards fetching when off', async () => {
  let state = { ...dimensionRules.DEFAULT_DIMENSION_SETTINGS, enabledDimensions: ['channel'], values: dimensionContext().values };
  let writes = 0;
  const monitor = await loadInstrumentedModule('../lib/dimensionMonitoring.mjs', {
    './adminSettingsStore.mjs': {
      readAdminSetting: async () => structuredClone(state),
      updateAdminSetting: async (_, defaults, update) => { state = update(state); writes++; return state; }
    },
    './dimensionStandards.mjs': dimensionRules
  }, { fetch: () => { assert.fail('Globally disabled dimensions must not fetch standards'); } });
  for (const invalid of [null, {}, { metricChecksEnabled: 'false', dimensionChecksEnabled: true }]) {
    await assert.rejects(monitor.saveHealthCheckSettings(invalid), /must be booleans/);
  }
  assert.equal(writes, 0);
  await monitor.saveHealthCheckSettings({ metricChecksEnabled: true, dimensionChecksEnabled: false });
  assert.deepEqual(state.enabledDimensions, ['channel']);
  assert.ok(state.values.event);
  assert.equal((await monitor.summarizeDimensions('')).status, 'disabled');
  await monitor.saveDimensionSelection(['language']);
  assert.equal(state.dimensionChecksEnabled, false, 'individual selection does not re-enable global checks');
});

test('disabling checks retires active issues and queued recoveries without sending misleading resolution emails', async () => {
  for (const [category, flag] of [['metrics', 'metricChecksEnabled'], ['dimensions', 'dimensionChecksEnabled']]) {
    const harness = await resolutionHarness();
    const issue = { ...recoveryIssue, key: `${recoveryIssue.key}:${category}`, category };
    await harness.health.observeHealthSource(issue.key, issue);
    const feed = { ...recoveryIssue, key: 'other:Actuals', category: 'feed' };
    await harness.health.observeHealthSource(feed.key, feed);
    assert.equal(harness.sent.length, 2);
    harness.checks({ [flag]: false });
    await harness.health.reconcileDisabledHealthChecks();
    assert.equal(harness.state().history[0].resolution, 'checks-disabled');
    assert.equal(harness.state().activeIssues[issue.key], undefined);
    assert.ok(harness.state().activeIssues[feed.key], 'feed checks continue');
    await harness.health.observeHealthSource(issue.key, issue);
    assert.equal(harness.state().activeIssues[issue.key], undefined);
    assert.equal(harness.sent.length, 2, 'no issue or recovery email when category checks are disabled');
    assert.equal((await harness.health.sendDailyHealthDigest([issue])).sent, false);
    const pending = await resolutionHarness();
    await pending.health.observeHealthSource(issue.key, issue);
    pending.fail(true);
    await pending.health.observeHealthSource(issue.key, null);
    assert.equal(Object.keys(pending.state().pendingResolutions).length, 1);
    pending.checks({ [flag]: false });
    await pending.health.reconcileDisabledHealthChecks();
    assert.equal(Object.keys(pending.state().pendingResolutions).length, 0);
    assert.equal(pending.state().history[0].resolutionEmailStatus, 'checks-disabled');
    pending.checks({ [flag]: true });
    pending.fail(false);
    pending.clock.advance(5 * 60_000);
    await pending.health.observeHealthSource(issue.key, null);
    assert.equal(pending.sent.length, 2, 're-enabling cannot replay a cancelled recovery');
  }
});

test('metric global disable skips aggregation and resets baselines before re-enabling', async () => {
  const csv = 'Event Name DB,Date,Channel,Clicks\nGSTS 2026,2026-10-27,Search,100';
  const key = `global-metric-test-${Date.now()}`;
  const originalVercel = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const enabled = summarizeSheetData(csv);
    assert.equal(enabled.channelMetrics24h.length, 1);
    await storeSheetSnapshot(key, csv, enabled);
    const disabled = summarizeSheetData(csv, { metricChecksEnabled: false });
    assert.deepEqual(disabled.channelMetrics24h, []);
    assert.equal(disabled.latest24hDate, null);
    assert.equal(disabled.rowCount, 1, 'source row health is still computed');
    await storeSheetSnapshot(key, csv, disabled);
    const health = (await getSheetCacheHealth([key]))[key];
    assert.deepEqual(health.metricBaselines, {});
    assert.deepEqual(health.metricDiscrepancies, []);
    const smaller = csv.replace(',100', ',10');
    const resumed = await storeSheetSnapshot(key, smaller, summarizeSheetData(smaller));
    assert.deepEqual(resumed.metricDiscrepancies, [], 'first refreshed snapshot becomes the new baseline');
  } finally {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  }
});

test('dimension cards group readable findings and hide record details behind accessible disclosures', async () => {
  const component = await loadInstrumentedModule('../app/components/DimensionFindings.jsx');
  const findings = [
    { dimension: 'channel', label: 'Channel', type: 'blank', count: 25, values: [], sampleRows: [2, 4] },
    { dimension: 'channel', label: 'Channel', type: 'non-standard', count: 3, values: ['<unknown>'], sampleRows: [6] },
    { dimension: 'language', label: 'Language', type: 'missing-column', count: 28, values: [], sampleRows: [2] }
  ];
  const html = renderToStaticMarkup(React.createElement(component.default, { findings, standards: { channel: ['Search', 'LinkedIn'] } }));
  assert.ok(html.includes('2 dimensions need attention'));
  assert.equal((html.match(/aria-label="Channel findings"/g) || []).length, 1);
  assert.ok(html.includes('25 records'));
  assert.ok(html.includes('Non-standard value'));
  assert.ok(html.includes('Missing column'));
  assert.ok(html.includes('&lt;unknown&gt;'));
  assert.ok(html.includes('<details'));
  assert.ok(html.includes('View sample records'));
  assert.ok(html.includes('View allowed values'));
  assert.ok(html.includes('text-sm'));
});

test('global check endpoint enforces auth, validates input and reconciles disabled history', async () => {
  let authorized = false;
  let writes = 0;
  let reconciles = 0;
  const route = await loadInstrumentedModule('../app/api/admin/health-notifications/route.js', {
    '../../../../lib/eventsConfig.js': {},
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '../../../../lib/healthNotifications.mjs': { reconcileDisabledHealthChecks: async () => { reconciles++; } },
    '../../../../lib/healthNotificationUtils.mjs': healthUtils,
    '../../../../lib/requireAdminRequest.js': { isAdminRequest: async () => authorized },
    '../events/route.js': {},
    '../../../../lib/healthEmailTransport.mjs': {},
    '../../../../lib/dimensionMonitoring.mjs': {
      saveHealthCheckSettings: async body => {
        if (typeof body.metricChecksEnabled !== 'boolean' || typeof body.dimensionChecksEnabled !== 'boolean') throw new Error('Invalid check selections');
        writes++;
        return { metricChecksEnabled: body.metricChecksEnabled, dimensionChecksEnabled: body.dimensionChecksEnabled };
      }
    }
  });
  const request = body => ({ json: async () => ({ action: 'save-health-checks', ...body }) });
  assert.equal((await route.POST(request({ metricChecksEnabled: false, dimensionChecksEnabled: false }))).status, 401);
  assert.equal(writes, 0);
  authorized = true;
  assert.equal((await route.POST(request({ metricChecksEnabled: 'false', dimensionChecksEnabled: false }))).status, 400);
  assert.equal(writes, 0);
  assert.equal(reconciles, 0);
  const saved = await route.POST(request({ metricChecksEnabled: false, dimensionChecksEnabled: true }));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).dimensionSettings.metricChecksEnabled, false);
  assert.equal(reconciles, 1);
});

test('per-event master and category switches preserve other events and global precedence', () => {
  const settings = { eventChecks: { gsts: { monitoringEnabled: false }, saif: { sheetChecksEnabled: false, dimensionChecksEnabled: false } } };
  const issue = { eventId: 'gsts', category: 'feed' };
  for (const category of ['feed', 'metrics', 'dimensions']) {
    assert.equal(dimensionRules.isHealthCheckEnabled({ ...issue, category }, settings), false);
    assert.equal(dimensionRules.isHealthCheckEnabled({ eventId: 'other', category }, settings), true);
  }
  assert.equal(dimensionRules.isHealthCheckEnabled({ eventId: 'saif', category: 'feed' }, settings), false);
  assert.equal(dimensionRules.isHealthCheckEnabled({ eventId: 'saif', category: 'metrics' }, settings), true);
  assert.equal(dimensionRules.isHealthCheckEnabled({ eventId: 'saif', category: 'dimensions' }, settings), false);
  assert.equal(dimensionRules.isHealthCheckEnabled({ eventId: 'saif', category: 'metrics' }, { ...settings, metricChecksEnabled: false }), false);
  const source = { eventId: 'gsts', kind: 'Actuals', state: 'stale', eventDataStatus: 'missing', metricDiscrepancies: [{}], dimensionHealth: { status: 'unavailable' } };
  assert.deepEqual(healthUtils.getHealthIssues([dimensionRules.applyHealthCheckSettings(source, settings)]), []);
  assert.equal(source.state, 'stale', 'monitoring does not modify ingestion or stored source health');
});

test('per-event checks persist independently with strict validation and retained selections', async () => {
  let state = { ...dimensionRules.DEFAULT_DIMENSION_SETTINGS, eventChecks: { other: { monitoringEnabled: false } } };
  let writes = 0;
  const monitor = await loadInstrumentedModule('../lib/dimensionMonitoring.mjs', {
    './adminSettingsStore.mjs': {
      readAdminSetting: async () => state,
      updateAdminSetting: async (_, defaults, update) => { state = update(state); writes++; return state; }
    },
    './dimensionStandards.mjs': dimensionRules
  });
  const checks = { monitoringEnabled: false, sheetChecksEnabled: true, metricChecksEnabled: false, dimensionChecksEnabled: true };
  for (const [id, input] of [['', checks], ['__proto__', checks], ['gsts', {}], ['gsts', { ...checks, sheetChecksEnabled: 'false' }]]) {
    await assert.rejects(monitor.saveEventHealthChecks(id, input));
  }
  assert.equal(writes, 0);
  await monitor.saveEventHealthChecks('gsts', checks);
  assert.equal(state.eventChecks.other.monitoringEnabled, false);
  assert.equal(state.eventChecks.gsts.metricChecksEnabled, false);
  await monitor.saveHealthCheckSettings({ metricChecksEnabled: false, dimensionChecksEnabled: true });
  assert.deepEqual(structuredClone(state.eventChecks.gsts), checks);
  await monitor.saveEventHealthChecks('gsts', { ...checks, monitoringEnabled: true });
  assert.equal(state.eventChecks.gsts.sheetChecksEnabled, true);
  assert.equal(state.eventChecks.gsts.metricChecksEnabled, false);
});

test('disabling event sheet checks retires only that event feed issue without false recovery mail', async () => {
  const harness = await resolutionHarness();
  const issue = { ...recoveryIssue, eventId: 'gsts', category: 'feed' };
  const other = { ...recoveryIssue, key: 'other:Actuals', eventId: 'other', category: 'feed' };
  await harness.health.observeHealthSource(issue.key, issue);
  await harness.health.observeHealthSource(other.key, other);
  harness.checks({ eventChecks: { gsts: { sheetChecksEnabled: false } } });
  await harness.health.reconcileDisabledHealthChecks();
  assert.equal(harness.state().history[0].resolution, 'checks-disabled');
  assert.ok(harness.state().activeIssues[other.key]);
  assert.equal(harness.sent.length, 2);
  assert.equal((await harness.health.sendDailyHealthDigest([issue])).sent, false);
});

test('event monitoring endpoint rejects unauthorized and unknown events before persisting', async () => {
  let authorized = false;
  let writes = 0;
  let reconciles = 0;
  const route = await loadInstrumentedModule('../app/api/admin/health-notifications/route.js', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '../../../../lib/eventsConfig.js': { getEventsConfig: async () => ({ events: [{ id: 'gsts' }] }) },
    '../../../../lib/healthNotifications.mjs': { reconcileDisabledHealthChecks: async () => { reconciles++; } },
    '../../../../lib/healthNotificationUtils.mjs': healthUtils,
    '../../../../lib/requireAdminRequest.js': { isAdminRequest: async () => authorized },
    '../events/route.js': {},
    '../../../../lib/healthEmailTransport.mjs': {},
    '../../../../lib/dimensionMonitoring.mjs': { saveEventHealthChecks: async (id, checks) => { writes++; return { eventChecks: { [id]: checks } }; } }
  });
  const request = eventId => ({ json: async () => ({ action: 'save-event-checks', eventId, checks: { monitoringEnabled: false } }) });
  assert.equal((await route.POST(request('gsts'))).status, 401);
  authorized = true;
  assert.equal((await route.POST(request('unknown'))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await route.POST(request('gsts'))).status, 200);
  assert.equal(writes, 1);
  assert.equal(reconciles, 1);
});
