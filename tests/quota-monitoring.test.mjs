import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  EMPTY_BUDGETS, addUsage, createUsageRecorder, createUsageScope,
  includeUsageStorageOverhead, normalizeUsagePolicy, summarizeApiUsage,
  updateUsageBudgets, updateUsagePolicy
} from '../lib/apiUsage.mjs';

const require = createRequire(import.meta.url);
const empty = () => ({ startedAt: null, days: {} });

async function load(relativePath, overrides, globals = {}) {
  const file = new URL(relativePath, import.meta.url);
  const source = await fs.readFile(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: sandboxModule, exports: sandboxModule.exports,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    process, console, structuredClone, ...globals
  }, { filename: file.pathname });
  return sandboxModule.exports;
}

function collector() {
  let state = empty();
  let writes = 0;
  const pending = [];
  const recorder = createUsageRecorder(async update => {
    writes++;
    state = update(state);
  }, task => pending.push(task), error => { throw error; });
  const scope = createUsageScope(recorder, task => pending.push(task));
  return { ...scope, pending, state: () => state, writes: () => writes };
}

test('100 awaited observations in one response persist once without sampling', async () => {
  const usage = collector();
  const handler = usage.wrap(async () => {
    for (let index = 0; index < 100; index++) {
      usage.observe('firestore', 2, 'reads');
      await Promise.resolve();
    }
    usage.observe('smtp', 1, 'acceptedRecipients');
    return 'response';
  });
  assert.equal(await handler(), 'response');
  await Promise.all(usage.pending);
  assert.equal(usage.writes(), 1);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(usage.state().days[today].firestore.metrics.reads, 200);
  assert.equal(usage.state().days[today].smtp.count, 1);
});

test('request scope reduces real persistence writes versus observations separated by awaits', async () => {
  let baselineWrites = 0;
  const baselinePending = [];
  const baseline = createUsageRecorder(async update => {
    baselineWrites++;
    update(empty());
  }, task => baselinePending.push(task), error => { throw error; });
  for (let index = 0; index < 100; index++) {
    baseline('firestore', 1, 'reads');
    await Promise.all(baselinePending);
  }
  const usage = collector();
  await usage.wrap(async () => {
    for (let index = 0; index < 100; index++) {
      usage.observe('firestore', 1, 'reads');
      await Promise.resolve();
    }
  })();
  await Promise.all(usage.pending);
  assert.equal(baselineWrites, 100);
  assert.equal(usage.writes(), 1);
  assert.equal(usage.state().days[new Date().toISOString().slice(0, 10)].firestore.metrics.reads, 100);
});

test('nested scopes preserve handler this/arguments and flush only at outer completion', async () => {
  const usage = collector();
  const inner = usage.wrap(async function (count) {
    usage.observe('firestore', count, 'writes');
    await Promise.resolve();
    return this.name;
  });
  const outer = usage.wrap(async () => {
    assert.equal(await inner.call({ name: 'nested' }, 7), 'nested');
    assert.equal(usage.writes(), 0);
    usage.observe('firestore', 2, 'deletes');
  });
  await outer();
  await Promise.all(usage.pending);
  assert.equal(usage.writes(), 1);
  const metrics = usage.state().days[new Date().toISOString().slice(0, 10)].firestore.metrics;
  assert.deepEqual(metrics, { writes: 7, deletes: 2 });
});

test('exceptions flush all important observations and propagate the original error', async () => {
  const usage = collector();
  const failure = new Error('handler failed');
  await assert.rejects(usage.wrap(async () => {
    usage.observe('smtp', 5);
    await Promise.resolve();
    throw failure;
  })(), error => error === failure);
  await Promise.all(usage.pending);
  assert.equal(usage.writes(), 1);
  assert.equal(usage.state().days[new Date().toISOString().slice(0, 10)].smtp.count, 5);
});

test('concurrent request scopes and observations outside a scope retain every count', async () => {
  const usage = collector();
  const handler = usage.wrap(async count => {
    usage.observe('analytics', count);
    await Promise.resolve();
    usage.observe('analytics', count);
  });
  await Promise.all([handler(3), handler(7)]);
  usage.observe('analytics', 11);
  await Promise.all(usage.pending);
  assert.equal(usage.state().days[new Date().toISOString().slice(0, 10)].analytics.count, 31);
});

test('background continuations after response use the recorder instead of a closed buffer', async () => {
  const usage = collector();
  let release;
  let continuation;
  const gate = new Promise(resolve => { release = resolve; });
  await usage.wrap(async () => {
    usage.observe('analytics', 1);
    continuation = gate.then(() => usage.observe('analytics', 2));
  })();
  await Promise.all(usage.pending);
  release();
  await continuation;
  await Promise.all(usage.pending);
  assert.equal(usage.state().days[new Date().toISOString().slice(0, 10)].analytics.count, 3);
});

test('monitoring overhead adds transaction reads including retries and one write without recursion', () => {
  const date = new Date('2026-10-27T12:00Z');
  const state = includeUsageStorageOverhead(addUsage(empty(), 'sheets', 2, date), 3, date);
  assert.equal(state.days['2026-10-27'].sheets.count, 2);
  assert.deepEqual(state.days['2026-10-27'].firestore, { count: 4, metrics: { reads: 3, writes: 1 } });
});

test('production scoped recorder counts its committed storage overhead and retry reads exactly once', async () => {
  let state = empty();
  let transactions = 0;
  const pending = [];
  const usage = await load('../lib/apiUsage.mjs', {
    '@vercel/functions': { waitUntil: task => pending.push(task) },
    './adminSettingsStore.mjs': {
      updateAdminSetting: async (key, defaults, update) => {
        assert.equal(key, 'apiUsage');
        transactions++;
        update(state); // Simulate one aborted transaction attempt.
        state = update(state);
      }
    }
  }, { process: { env: { VERCEL: '1' } } });
  await usage.withUsageScope(async () => {
    for (let index = 0; index < 5; index++) {
      usage.observeApiUsage('firestore', 2, 'reads');
      await Promise.resolve();
    }
  })();
  await Promise.all(pending);
  assert.equal(transactions, 1);
  assert.deepEqual(state.days[new Date().toISOString().slice(0, 10)].firestore.metrics, { reads: 12, writes: 1 });
});

test('a request crossing UTC midnight keeps each observation in its original daily bucket', async () => {
  let now = Date.parse('2026-10-26T23:59:59Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const usage = await load('../lib/apiUsage.mjs', { './adminSettingsStore.mjs': {} }, { Date: Clock });
  const samples = [];
  const pending = [];
  const scope = usage.createUsageScope((...sample) => samples.push(sample), task => pending.push(task));
  await scope.wrap(async () => {
    scope.observe('firestore', 1, 'reads');
    await Promise.resolve();
    now += 2000;
    scope.observe('firestore', 2, 'reads');
  })();
  await Promise.all(pending);
  const state = samples.reduce((state, [service, count, metric, date]) => addUsage(state, service, count, date, metric), empty());
  assert.equal(state.days['2026-10-26'].firestore.metrics.reads, 1);
  assert.equal(state.days['2026-10-27'].firestore.metrics.reads, 2);
});

test('UTC daily buckets retain 93 days and expose individual operation trends after reload', () => {
  let state = empty();
  for (let index = 0; index < 100; index++) {
    const date = new Date(Date.UTC(2026, 6, 20 + index, 12));
    for (const [metric, count] of [['reads', 10], ['writes', 2], ['deletes', 1]]) {
      state = addUsage(state, 'firestore', count, date, metric);
    }
  }
  assert.equal(Object.keys(state.days).length, 93);
  const report = summarizeApiUsage(JSON.parse(JSON.stringify(state)), EMPTY_BUDGETS, new Date('2026-10-27T12:00Z'));
  assert.equal(report.firestoreDaily.history.length, 14);
  assert.deepEqual(report.firestoreDaily.history.at(-1), { date: '2026-10-27', reads: 10, writes: 2, deletes: 1 });
  assert.match(report.firestoreDaily.resetNotice, /UTC.*NOT.*Pacific/);
  assert.match(report.collectionNotice, /traffic.*no autonomous daily monitoring/);
});

test('UTC bucketing does not treat the Pacific date as the observation day', () => {
  const state = addUsage(empty(), 'firestore', 2, new Date('2026-10-26T23:30:00-07:00'), 'reads');
  assert.equal(state.days['2026-10-27'].firestore.metrics.reads, 2);
  assert.equal(state.days['2026-10-26'], undefined);
});

test('daily metric forecasts exclude partial start/current day and preserve zero-traffic days', () => {
  let state = addUsage(empty(), 'firestore', 999, new Date('2026-10-01T12:00Z'), 'reads');
  state = addUsage(state, 'firestore', 200, new Date('2026-10-02T12:00Z'), 'reads');
  state = addUsage(state, 'firestore', 50, new Date('2026-10-04T12:00Z'), 'reads');
  const daily = summarizeApiUsage(state, EMPTY_BUDGETS, new Date('2026-10-04T12:00Z')).firestoreDaily;
  assert.equal(daily.sampleDays, 2);
  assert.equal(daily.metrics[0].averageDaily, 100);
  assert.equal(daily.metrics[0].projectedToday, 100);
  assert.equal(daily.history.find(day => day.date === '2026-10-03').reads, 0);
  assert.equal(daily.history[0].reads, null);
});

test('threshold warnings use partial reference daily limits and pace, not verified account quota', () => {
  let state = addUsage(empty(), 'firestore', 0, new Date('2026-10-25T12:00Z'), 'reads');
  state = addUsage(state, 'firestore', 35000, new Date('2026-10-27T12:00Z'), 'reads');
  state = addUsage(state, 'firestore', 14000, new Date('2026-10-27T12:00Z'), 'writes');
  state = addUsage(state, 'firestore', 18000, new Date('2026-10-27T12:00Z'), 'deletes');
  const daily = summarizeApiUsage(state, EMPTY_BUDGETS, new Date('2026-10-27T23:59Z')).firestoreDaily;
  assert.equal(daily.referenceOnly, true);
  assert.deepEqual(daily.metrics.map(metric => metric.warning), ['warning', 'warning', 'critical']);
  const pace = summarizeApiUsage(state, EMPTY_BUDGETS, new Date('2026-10-27T12:00Z')).firestoreDaily.metrics[0];
  assert.equal(pace.projectedToday, 70000);
  assert.equal(pace.warning, 'critical');
});

test('unobserved history and early first-day forecasts remain unavailable', () => {
  const report = summarizeApiUsage(empty(), EMPTY_BUDGETS, new Date('2026-10-27T12:00Z'));
  assert.equal(report.firestoreDaily.metrics[0].today, null);
  assert.equal(report.firestoreDaily.metrics[0].projectedToday, null);
  const state = addUsage(empty(), 'firestore', 10, new Date('2026-10-27T00:01Z'), 'reads');
  const daily = summarizeApiUsage(state, EMPTY_BUDGETS, new Date('2026-10-27T00:30Z')).firestoreDaily;
  assert.equal(daily.metrics[0].projectedToday, null);
  assert.equal(summarizeApiUsage(state, EMPTY_BUDGETS, new Date('2026-10-27T12:00Z')).firestoreDaily.metrics[0].projectedToday, null);
});

test('policy defaults false, requires strict booleans and survives budget saves without clobbering', () => {
  assert.deepEqual(normalizeUsagePolicy(), { lowQuotaMode: false });
  assert.deepEqual(normalizeUsagePolicy({ lowQuotaMode: 'true' }), { lowQuotaMode: false });
  for (const value of [undefined, null, 0, 1, 'true', {}, []]) {
    assert.throws(() => updateUsagePolicy(EMPTY_BUDGETS, value), /must be a boolean/);
  }
  let state = { services: { firestore: { monthlyBudget: 10 } }, policy: { futureFlag: true }, extra: 'preserved' };
  state = updateUsagePolicy(state, true);
  assert.equal(state.services.firestore.monthlyBudget, 10);
  state = updateUsageBudgets(state, { firestore: { monthlyBudget: 20 } });
  assert.deepEqual(state.policy, { lowQuotaMode: true, futureFlag: true });
  assert.equal(state.extra, 'preserved');
  assert.equal(summarizeApiUsage(empty(), state).policy.lowQuotaMode, true);
});

test('admin save-policy endpoint rejects unauthorized and malformed values, preserves budgets', async () => {
  let authorized = false;
  let state = { services: { firestore: { monthlyBudget: 10 } }, policy: { lowQuotaMode: false } };
  let writes = 0;
  const usage = await import('../lib/apiUsage.mjs');
  const route = await load('../app/api/admin/quotas/route.js', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '../../../../lib/requireAdminRequest.js': { isAdminRequest: async () => authorized },
    '../../../../lib/quotaService.mjs': {},
    '../../../../lib/apiUsage.mjs': { ...usage, withUsageScope: handler => handler },
    '../../../../lib/adminSettingsStore.mjs': { updateAdminSetting: async (key, defaults, update) => {
      assert.equal(key, 'apiBudgets');
      writes++;
      state = update(state);
      return state;
    } }
  });
  const request = body => ({ json: async () => body });
  assert.equal((await route.POST(request({ action: 'save-policy', lowQuotaMode: true }))).status, 401);
  assert.equal(writes, 0);
  authorized = true;
  for (const value of [null, 1, 'false', undefined]) {
    assert.equal((await route.POST(request({ action: 'save-policy', lowQuotaMode: value }))).status, 400);
  }
  assert.equal(writes, 0);
  const result = await route.POST(request({ action: 'save-policy', lowQuotaMode: true }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).policy.lowQuotaMode, true);
  assert.equal(state.services.firestore.monthlyBudget, 10);
  await route.POST(request({ action: 'save-budgets', services: { firestore: { monthlyBudget: 30 } } }));
  assert.equal(state.policy.lowQuotaMode, true);
  assert.equal(state.services.firestore.monthlyBudget, 30);
});

test('public policy reuses persistent apiBudgets across service reloads', async () => {
  const stored = { policy: { lowQuotaMode: true }, services: {} };
  const overrides = {
    './adminSettingsStore.mjs': { readAdminSetting: async key => {
      assert.equal(key, 'apiBudgets');
      return structuredClone(stored);
    } }
  };
  const first = await load('../lib/apiUsage.mjs', overrides);
  assert.equal((await first.readPublicUsagePolicy()).lowQuotaMode, true);
  const reloaded = await load('../lib/apiUsage.mjs', overrides);
  assert.equal((await reloaded.readPublicUsagePolicy()).lowQuotaMode, true);
});

test('low-quota mode preserves initial quota loads and access to policy controls', async () => {
  const source = await fs.readFile(new URL('../app/components/ApiQuotasAdmin.jsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('ApiQuotasAdmin.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const effects = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect') effects.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  const loadEffect = effects.find(node => node.arguments[0]?.getText(file).includes('fetchQuotas()'));
  assert.ok(loadEffect, 'initial load effect exists');
  const body = loadEffect.arguments[0].getText(file);
  assert.match(body, /if \(active\)/);
  assert.doesNotMatch(body, /lowQuotaMode/);
  assert.doesNotMatch(loadEffect.arguments[1].getText(file), /lowQuotaMode/);
  assert.match(source, /<ApiUsageAnalytics report=\{data\?\.usage\}/);
  assert.doesNotMatch(source, /All endpoints within quota|All Optimal/);
});
