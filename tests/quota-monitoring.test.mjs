import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as quotaAlertRules from '../lib/quotaAlertRules.mjs';
import { createQuotaAlertDispatcher } from '../lib/quotaAlerts.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  API_SERVICES, EMPTY_BUDGETS, addUsage, createUsageRecorder, createUsageScope,
  includeUsageStorageOverhead, normalizeUsagePolicy, summarizeApiUsage,
  updateUsageBudgets, updateUsagePolicy, getMonitoredServices, updateMonitoredServices
} from '../lib/apiUsage.mjs';

const require = createRequire(import.meta.url);
const empty = () => ({ startedAt: null, days: {} });

test('free-tier defaults fill missing references without guessing limits for other APIs', () => {
  const report = summarizeApiUsage(empty());
  assert.equal(report.services.find(service => service.id === 'vercel').settings.monthlyAllowance, 1000000);
  assert.deepEqual(report.firestoreDaily.metrics.map(metric => metric.referenceDailyLimit), [50000, 20000, 20000]);
  for (const service of report.services) {
    assert.ok(service.quotaNote);
    if (service.id !== 'vercel') assert.equal(service.settings.monthlyAllowance, undefined);
  }
  assert.equal(EMPTY_BUDGETS.services.vercel, undefined, 'defaults require no settings write');
  const saved = { services: { vercel: { monthlyAllowance: null }, firestore: { dailyReadLimit: null } } };
  const legacy = summarizeApiUsage(empty(), saved);
  assert.equal(legacy.services.find(service => service.id === 'vercel').settings.monthlyAllowance, 1000000);
  assert.equal(legacy.firestoreDaily.metrics[0].referenceDailyLimit, 50000);
});

test('Vercel free reference triggers exact markers and honors saved overrides and zero', async () => {
  const usage = await load('../lib/apiUsage.mjs', {
    './adminSettingsStore.mjs': {},
    './quotaAlertRules.mjs': quotaAlertRules
  }, { process: { env: { VERCEL: '1' } } });
  const now = new Date('2026-10-27T12:00:00Z');
  for (const [count, markers] of [[699999, []], [700000, [70]], [899999, [70]], [900000, [70, 90]]]) {
    const state = addUsage(empty(), 'vercel', count, now, 'requests');
    const report = usage.summarizeApiUsage(state, EMPTY_BUDGETS, now);
    const thresholds = quotaAlertRules.collectQuotaAlerts(report, now).filter(alert => alert.service === 'vercel').map(alert => alert.threshold);
    assert.deepEqual(thresholds, markers);
  }
  const state = addUsage(empty(), 'vercel', 900000, now, 'requests');
  for (const allowance of [2000000, 0]) {
    const report = usage.summarizeApiUsage(state, { services: { vercel: { monthlyAllowance: allowance } } }, now);
    assert.equal(report.services.find(service => service.id === 'vercel').settings.monthlyAllowance, allowance);
    assert.equal(quotaAlertRules.collectQuotaAlerts(report, now).filter(alert => alert.service === 'vercel').length, 0);
  }
  assert.equal(summarizeApiUsage(state, EMPTY_BUDGETS, now).services.find(service => service.id === 'vercel').quotaPercent, null, 'local requests are not hosting usage');
});

test('saved daily references drive Firestore percentages and markers, with zero disabling a reference', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const state = addUsage(empty(), 'firestore', 70, now, 'reads');
  const saved = updateUsageBudgets(EMPTY_BUDGETS, {
    firestore: { dailyReadLimit: 100, dailyWriteLimit: 200, dailyDeleteLimit: 300 },
    vercel: { monthlyAllowance: 2000000 }
  });
  const report = summarizeApiUsage(state, saved, now);
  assert.equal(report.firestoreDaily.metrics[0].percent, 70);
  assert.deepEqual(report.firestoreDaily.metrics.map(metric => metric.referenceDailyLimit), [100, 200, 300]);
  assert.equal(quotaAlertRules.collectQuotaAlerts(report, now).filter(alert => alert.metric === 'daily-reads').length, 1);
  saved.services.firestore.dailyReadLimit = 0;
  const disabled = summarizeApiUsage(state, saved, now);
  assert.equal(disabled.firestoreDaily.metrics[0].percent, null);
  assert.equal(disabled.firestoreDaily.metrics[0].forecastPercent, null);
  assert.equal(quotaAlertRules.collectQuotaAlerts(disabled, now).filter(alert => alert.metric === 'daily-reads').length, 0);
  for (const key of ['dailyReadLimit', 'dailyWriteLimit', 'dailyDeleteLimit']) {
    for (const value of [-1, Infinity, NaN, '50000']) {
      assert.throws(() => updateUsageBudgets(EMPTY_BUDGETS, { firestore: { [key]: value } }), /non-negative number/);
    }
  }
});

function alertReport(percent = 70) {
  return {
    month: '2026-10',
    services: [{
      id: 'sheets', name: 'Sheets', quotaPercent: percent, budgetPercent: null,
      settings: { monthlyAllowance: 100 }, projectedUsage: null
    }]
  };
}

function alertHarness(options = {}) {
  let state = { deliveries: {} };
  let writes = 0;
  const sent = [];
  let time = Date.parse('2026-10-27T12:00:00Z');
  const status = {};
  const dependencies = {
    update: async update => {
      const next = update(structuredClone(state));
      if (JSON.stringify(next) !== JSON.stringify(state)) writes++;
      state = next;
      return structuredClone(state);
    },
    notificationSettings: async () => ({ settings: { emailEnabled: true, emailRecipients: ['admin@example.test'] } }),
    smtpReady: () => {},
    send: async (...mail) => { sent.push(mail); },
    now: () => time,
    status,
    ...options
  };
  return {
    dispatch: createQuotaAlertDispatcher(dependencies),
    dependencies, sent, status,
    state: () => state, writes: () => writes,
    advance: milliseconds => { time += milliseconds; }
  };
}

test('all eight APIs default to independent enabled 70% and 90% markers', () => {
  const preferences = quotaAlertRules.getQuotaAlertPreferences({}, API_SERVICES);
  assert.equal(Object.keys(preferences).length, 8);
  for (const service of API_SERVICES) assert.deepEqual(preferences[service.id], { 70: true, 90: true });
  const current = { services: { sheets: { monthlyAllowance: 100 } }, policy: { lowQuotaMode: true }, monitoredServices: ['sheets'] };
  const next = quotaAlertRules.updateQuotaAlertPreferences(current, { sheets: { 70: false } }, API_SERVICES);
  assert.deepEqual(next.alertThresholds.sheets, { 70: false, 90: true });
  assert.deepEqual(next.services, current.services);
  assert.deepEqual(next.monitoredServices, current.monitoredServices);
  assert.deepEqual(next.policy, current.policy);
  for (const invalid of [null, [], { bad: {} }, { sheets: [] }, { sheets: { 80: true } }, { sheets: { 70: 'false' } }]) {
    assert.throws(() => quotaAlertRules.updateQuotaAlertPreferences(current, invalid, API_SERVICES));
  }
});

test('quota markers honor exact boundaries, independent disablement and missing limits', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const collect = quotaAlertRules.collectQuotaAlerts;
  assert.equal(collect(alertReport(69.999), now).length, 0);
  assert.deepEqual(collect(alertReport(70), now).map(alert => alert.threshold), [70]);
  assert.deepEqual(collect(alertReport(89.999), now).map(alert => alert.threshold), [70]);
  assert.deepEqual(collect(alertReport(90), now).map(alert => alert.threshold), [70, 90]);
  const disabled = { ...alertReport(100), alertThresholds: { sheets: { 70: false, 90: true } } };
  assert.deepEqual(collect(disabled, now).map(alert => alert.threshold), [90]);
  disabled.alertThresholds.sheets[90] = false;
  assert.equal(collect(disabled, now).length, 0);
  assert.equal(collect(alertReport(null), now).length, 0);
  assert.equal(collect({ ...alertReport(), services: [] }, now).length, 0);
});

test('forecasts and spend budgets trigger markers with explicit estimated scope', () => {
  const report = alertReport(20);
  report.services[0].projectedUsage = 95;
  report.services[0].settings.monthlyBudget = 10;
  report.services[0].budgetPercent = 75;
  report.services[0].projectedSpend = 9.5;
  const alerts = quotaAlertRules.collectQuotaAlerts(report);
  assert.equal(alerts.length, 4);
  assert.ok(alerts.some(alert => alert.message.includes('forecast 95.0%')));
  assert.ok(alerts.some(alert => alert.metric === 'monthly-budget'));
  assert.ok(alerts.every(alert => alert.period === '2026-10'));
});

test('Firestore reference markers use UTC day scopes separately from monthly thresholds', () => {
  const report = {
    month: '2026-10', services: [{ id: 'firestore', name: 'Firestore', settings: {} }],
    firestoreDaily: { metrics: [{ metric: 'writes', percent: 91, forecastPercent: null }] }
  };
  const first = quotaAlertRules.collectQuotaAlerts(report, new Date('2026-10-27T23:59:59Z'));
  const second = quotaAlertRules.collectQuotaAlerts(report, new Date('2026-10-28T00:00:00Z'));
  assert.equal(first.length, 2);
  assert.notEqual(first[0].key, second[0].key);
  assert.ok(first[0].message.includes('UTC-day writes reference'));
});

test('both reached markers share one email and repeat checks do not rewrite delivery state', async () => {
  const harness = alertHarness();
  const alerts = quotaAlertRules.collectQuotaAlerts(alertReport(95));
  await Promise.all([harness.dispatch(alerts), harness.dispatch(alerts)]);
  assert.equal(harness.sent.length, 1);
  assert.equal(harness.writes(), 2, 'one claim and one completion');
  assert.deepEqual(harness.sent[0][0], ['admin@example.test']);
  assert.ok(harness.sent[0][2].includes('70% marker'));
  assert.ok(harness.sent[0][2].includes('90% marker'));
  assert.ok(harness.sent[0][2].includes('NOT verified'));
  harness.advance(5 * 60_000);
  await harness.dispatch(alerts);
  assert.equal(harness.sent.length, 1);
  assert.equal(harness.writes(), 2, 'sent markers do not cause repeated writes');
  assert.ok(Object.values(harness.state().deliveries).every(entry => entry.sentAt));
});

test('a later 90% breach sends once after a previously delivered 70% warning', async () => {
  const harness = alertHarness();
  await harness.dispatch(quotaAlertRules.collectQuotaAlerts(alertReport(70)));
  await harness.dispatch(quotaAlertRules.collectQuotaAlerts(alertReport(90)));
  assert.equal(harness.sent.length, 2);
  assert.ok(harness.sent[1][2].includes('90% marker'));
  assert.equal(harness.sent[1][2].includes('70% marker'), false);
});

test('cross-instance claims prevent concurrent duplicate emails and survive a new dispatcher', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const harness = alertHarness();
  const sender = harness.dependencies.send;
  harness.dependencies.send = async (...mail) => { await sender(...mail); await gate; };
  const first = createQuotaAlertDispatcher(harness.dependencies);
  const second = createQuotaAlertDispatcher({ ...harness.dependencies, status: {} });
  const alerts = quotaAlertRules.collectQuotaAlerts(alertReport(70));
  const pending = first(alerts);
  await new Promise(resolve => setImmediate(resolve));
  await second(alerts);
  assert.equal(harness.sent.length, 1);
  release();
  await pending;
  const restarted = createQuotaAlertDispatcher({ ...harness.dependencies, status: {} });
  await restarted(alerts);
  assert.equal(harness.sent.length, 1);
});

test('failed SMTP attempts are reported, backed off and retried on later checks', async t => {
  t.mock.method(console, 'error', () => {});
  let failed = true;
  let attempts = 0;
  const harness = alertHarness({ send: async () => { attempts++; if (failed) throw new Error('SMTP unavailable'); } });
  const alerts = quotaAlertRules.collectQuotaAlerts(alertReport(70));
  await harness.dispatch(alerts);
  assert.equal(harness.status.status, 'error');
  assert.match(harness.status.lastError, /SMTP unavailable/);
  assert.equal(Object.values(harness.state().deliveries)[0].sentAt, undefined);
  await harness.dispatch(alerts);
  assert.equal(attempts, 1);
  failed = false;
  harness.advance(5 * 60_000);
  await harness.dispatch(alerts);
  assert.equal(attempts, 2);
  assert.equal(harness.status.status, 'sent');
  assert.equal(harness.status.lastError, null);
});

test('disabled email, no recipients, and missing SMTP never claim or send notifications', async t => {
  t.mock.method(console, 'error', () => {});
  for (const [options, expected] of [
    [{ notificationSettings: async () => ({ settings: { emailEnabled: false, emailRecipients: ['a@example.test'] } }) }, 'email-disabled'],
    [{ notificationSettings: async () => ({ settings: { emailEnabled: true, emailRecipients: [] } }) }, 'no-recipients'],
    [{ smtpReady: () => { throw new Error('SMTP not configured'); } }, 'error']
  ]) {
    const harness = alertHarness(options);
    await harness.dispatch(quotaAlertRules.collectQuotaAlerts(alertReport(90)));
    assert.equal(harness.sent.length, 0);
    assert.equal(harness.writes(), 0);
    assert.equal(harness.status.status, expected);
  }
});

test('below-threshold work does not read settings or persist notification state', async () => {
  const harness = alertHarness({ notificationSettings: () => { assert.fail('No settings read below threshold'); } });
  await harness.dispatch([]);
  assert.equal(harness.writes(), 0);
  assert.equal(harness.sent.length, 0);
});

test('all APIs render default-checked 70% and 90% alert selections with clear delivery limitations', async () => {
  const component = await load('../app/components/ApiUsageAnalytics.jsx', {
    '../../lib/firebase': { auth: {} },
    './AdminUI': await load('../app/components/AdminUI.jsx')
  });
  const report = summarizeApiUsage(empty());
  report.availableServices = report.services;
  report.monitoredServices = report.services.map(service => service.id);
  const html = renderToStaticMarkup(React.createElement(component.default, { report }));
  for (const service of API_SERVICES) {
    for (const threshold of [70, 90]) {
      const label = `${service.name} ${threshold}% alerts`.replace(/&/g, '&amp;');
      assert.ok(html.includes(`aria-label="${label}" checked=""`), label);
    }
  }
  assert.ok(html.includes('Save alert selections'));
  assert.ok(html.includes('Limit not configured'));
  assert.ok(html.includes('1,000,000 function invocations/month'));
  assert.ok(html.includes('Monthly allowance / target'));
  assert.ok(html.includes('300 reads/minute/project does not apply'));
  assert.ok(html.includes('Change them with Configure rates'));
  assert.ok(html.includes('not a scheduler'));
});

test('alert preference saves require admin access and reject invalid values without changing other settings', async () => {
  let admin = false;
  let writes = 0;
  let saved = { services: { sheets: { monthlyAllowance: 100 } }, policy: { lowQuotaMode: true }, monitoredServices: ['sheets'] };
  const route = await load('../app/api/admin/quotas/route.js', {
    '../../../../lib/requireAdminRequest.js': { isAdminRequest: async () => admin },
    '../../../../lib/quotaService.mjs': {},
    '../../../../lib/apiUsage.mjs': { API_SERVICES, EMPTY_BUDGETS, withUsageScope: handler => handler },
    '../../../../lib/adminSettingsStore.mjs': {
      updateAdminSetting: async (_, defaults, update) => { writes++; saved = update(saved); return saved; }
    }
  });
  const request = selections => ({ json: async () => ({ action: 'save-alert-thresholds', alertThresholds: selections }) });
  assert.equal((await route.POST(request({ sheets: { 70: false } }))).status, 401);
  admin = true;
  assert.equal((await route.POST(request({ sheets: { 90: 'true' } }))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await route.POST(request({ sheets: { 70: false } }))).status, 200);
  assert.equal(writes, 1);
  assert.deepEqual(saved.alertThresholds.sheets, { 70: false, 90: true });
  assert.equal(saved.services.sheets.monthlyAllowance, 100);
  assert.equal(saved.policy.lowQuotaMode, true);
  assert.deepEqual(saved.monitoredServices, ['sheets']);
});

test('unchanged quota email claims skip actual Firestore writes', async () => {
  let writes = 0;
  const store = await load('../lib/adminSettingsStore.mjs', {
    './firebaseAdmin.js': {
      getFirebaseAdmin: () => ({ adminDb: {
        collection: () => ({ doc: () => ({}) }),
        runTransaction: update => update({
          get: async () => ({ exists: true, data: () => ({ deliveries: { sent: { sentAt: '2026-10-27' } } }) }),
          set: () => { writes++; }
        })
      } })
    }
  }, { process: { env: { VERCEL: '1' }, cwd: () => process.cwd() } });
  await store.updateAdminSetting('quotaAlerts', {}, state => structuredClone(state), { skipUnchanged: true });
  assert.equal(writes, 0);
  await store.updateAdminSetting('quotaAlerts', {}, state => ({ ...state, updatedAt: 'now' }), { skipUnchanged: true });
  assert.equal(writes, 1);
});

test('recorded application traffic evaluates saved thresholds without opening the admin page', async () => {
  const pending = [];
  const delivered = [];
  let state = addUsage(empty(), 'sheets', 69);
  const usage = await load('../lib/apiUsage.mjs', {
    '@vercel/functions': { waitUntil: task => pending.push(task) },
    './quotaAlerts.mjs': { dispatchQuotaAlerts: async alerts => { delivered.push(alerts); } },
    './adminSettingsStore.mjs': {
      readAdminSetting: async () => ({
        monitoredServices: ['sheets'], services: { sheets: { monthlyAllowance: 100 } },
        alertThresholds: { sheets: { 70: true, 90: false } }
      }),
      updateAdminSetting: async (_, defaults, update) => { state = update(state); return state; }
    }
  }, { process: { env: {} } });
  usage.observeApiUsage('sheets', 1);
  await Promise.all(pending);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].length, 1);
  assert.equal(delivered[0][0].threshold, 70);
});

test('API report and email checks share selections and exclude inactive API threshold breaches', async () => {
  const pending = [];
  const delivered = [];
  const state = addUsage(addUsage(empty(), 'sheets', 95), 'tiktok', 500);
  const usage = await load('../lib/apiUsage.mjs', {
    '@vercel/functions': { waitUntil: task => pending.push(task) },
    './quotaAlerts.mjs': { dispatchQuotaAlerts: async alerts => { delivered.push(alerts); } },
    './adminSettingsStore.mjs': {
      readAdminSetting: async key => key === 'apiUsage' ? state : {
        monitoredServices: ['sheets'],
        services: { sheets: { monthlyAllowance: 100 }, tiktok: { monthlyAllowance: 100 } },
        alertThresholds: { sheets: { 70: false, 90: true } }
      }
    }
  }, { process: { env: {} } });
  const report = await usage.getApiUsageReport();
  await Promise.all(pending);
  assert.equal(report.alerts.length, 1);
  assert.equal(report.alerts[0].service, 'sheets');
  assert.equal(report.alerts[0].threshold, 90);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0][0].key, report.alerts[0].key);
});

async function load(relativePath, overrides, globals = {}) {
  overrides = {
    './quotaAlertRules.mjs': quotaAlertRules,
    '../../../../lib/quotaAlertRules.mjs': quotaAlertRules,
    ...overrides
  };
  const file = new URL(relativePath, import.meta.url);
  const source = await fs.readFile(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React }
  }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: sandboxModule, exports: sandboxModule.exports,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    process, console, structuredClone, ...globals
  }, { filename: file.pathname });
  return sandboxModule.exports;
}

test('monitoring selection defaults compatibly and preserves budgets, policy and empty selections', () => {
  assert.deepEqual(getMonitoredServices({}), API_SERVICES.map(service => service.id));
  const state = { services: { sheets: { monthlyBudget: 10 } }, policy: { lowQuotaMode: true } };
  const next = updateMonitoredServices(state, ['sheets']);
  assert.deepEqual(next.services, state.services);
  assert.deepEqual(next.policy, state.policy);
  assert.deepEqual(getMonitoredServices(updateMonitoredServices(next, [])), []);
  assert.deepEqual(updateUsageBudgets(next, {}).monitoredServices, ['sheets']);
  assert.deepEqual(updateUsagePolicy(next, false).monitoredServices, ['sheets']);
  for (const invalid of [null, {}, ['unknown'], ['sheets', 'sheets'], [1]]) {
    assert.throws(() => updateMonitoredServices(state, invalid), /known API/);
  }
});

test('disabled samples produce zero usage writes and enabled samples alone are retained', async () => {
  let state = empty();
  let transactions = 0;
  let selected = [];
  const pending = [];
  const usage = await load('../lib/apiUsage.mjs', {
    '@vercel/functions': { waitUntil: task => pending.push(task) },
    './adminSettingsStore.mjs': {
      readAdminSetting: async () => ({ monitoredServices: selected }),
      updateAdminSetting: async (_, defaults, update) => { transactions++; state = update(state); }
    }
  }, { process: { env: { VERCEL: '1' } } });
  usage.observeApiUsage('tiktok', 50);
  await Promise.all(pending);
  assert.equal(transactions, 0);
  selected = ['sheets'];
  await usage.withUsageScope(async () => {
    usage.observeApiUsage('sheets', 2);
    usage.observeApiUsage('tiktok', 100);
    usage.observeApiUsage('firestore', 100, 'reads');
  })();
  await Promise.all(pending);
  assert.equal(transactions, 1);
  const day = state.days[new Date().toISOString().slice(0, 10)];
  assert.equal(day.sheets.count, 2);
  assert.equal(day.tiktok, undefined);
  assert.equal(day.firestore, undefined, 'disabled Firestore counters include no storage overhead');
});

test('usage reports keep all selectors and budgets while excluding disabled cards and skipping all-off reads', async () => {
  const reads = [];
  let selected = ['sheets'];
  const usage = await load('../lib/apiUsage.mjs', {
    './adminSettingsStore.mjs': {
      readAdminSetting: async key => {
        reads.push(key);
        return key === 'apiBudgets'
          ? { services: { tiktok: { monthlyBudget: 99 } }, monitoredServices: selected }
          : empty();
      }
    }
  }, { process: { env: {} } });
  const report = await usage.getApiUsageReport();
  assert.deepEqual(Array.from(report.services, service => service.id), ['sheets']);
  assert.equal(report.availableServices.length, API_SERVICES.length);
  assert.equal(report.availableServices.find(service => service.id === 'tiktok').settings.monthlyBudget, 99);
  selected = [];
  reads.length = 0;
  assert.equal((await usage.getApiUsageReport()).services.length, 0);
  assert.deepEqual(reads, ['apiBudgets']);
});

test('analysis with no APIs selected performs no provider probes and returns no service cards', async () => {
  const quota = await load('../lib/quotaService.mjs', {
    './healthEmailTransport.mjs': { getSmtpTransportConfig: () => { assert.fail('SMTP must not be checked'); } },
    './apiUsage.mjs': {
      getMonitoredServices: () => [],
      readMonitoringSettings: async () => ({ monitoredServices: [] }),
      getApiUsageReport: async () => ({ services: [], policy: {} })
    },
    './firebaseAdmin.js': { getFirebaseAdmin: () => { assert.fail('Firestore must not be probed'); } }
  }, { fetch: () => { assert.fail('No outbound probe permitted'); } });
  const result = await quota.analyzeConnectedApis();
  assert.equal(result.services.length, 0);
  assert.equal(result.summary.totalServices, 0);
  assert.equal(result.overallHealth, 'unknown');
});

test('a Sheets-only selection probes Sheets once and omits Firestore, SMTP and other API cards', async () => {
  let probes = 0;
  const quota = await load('../lib/quotaService.mjs', {
    './healthEmailTransport.mjs': { getSmtpTransportConfig: () => { assert.fail('SMTP must not be checked'); } },
    './apiUsage.mjs': {
      getMonitoredServices: () => ['sheets'],
      readMonitoringSettings: async () => ({ monitoredServices: ['sheets'] }),
      observeApiUsage: service => { assert.equal(service, 'sheets'); },
      getApiUsageReport: async () => ({
        services: [{ id: 'sheets', settings: {}, monthUsage: 5, unit: 'fetches', quotaPercent: null }],
        policy: {}
      })
    },
    './firebaseAdmin.js': { getFirebaseAdmin: () => { assert.fail('Firestore must not be probed'); } }
  }, {
    AbortSignal,
    process: { env: { COMBINED_COUNTRY_CSV_URL: 'https://example.test/sheet' } },
    fetch: async (_, options) => { probes++; assert.equal(options.method, 'HEAD'); return { ok: true, status: 200 }; }
  });
  const result = await quota.analyzeConnectedApis();
  assert.equal(probes, 1);
  assert.deepEqual(Array.from(result.services, service => service.id), ['sheets']);
  assert.equal(result.summary.totalServices, 1);
});

test('API selection saves require admin access, validate IDs, and disabled manual pings never run', async () => {
  let admin = false;
  let writes = 0;
  let saved = { monitoredServices: ['sheets'], services: {}, policy: { lowQuotaMode: true } };
  const route = await load('../app/api/admin/quotas/route.js', {
    '../../../../lib/requireAdminRequest.js': { isAdminRequest: async () => admin },
    '../../../../lib/quotaService.mjs': { pingService: () => { assert.fail('Disabled service must not be probed'); } },
    '../../../../lib/apiUsage.mjs': {
      EMPTY_BUDGETS, updateMonitoredServices, getMonitoredServices,
      readMonitoringSettings: async () => saved,
      withUsageScope: handler => handler
    },
    '../../../../lib/adminSettingsStore.mjs': {
      updateAdminSetting: async (_, defaults, update) => { writes++; saved = update(saved); return saved; }
    }
  });
  const request = body => ({ json: async () => body });
  assert.equal((await route.POST(request({ action: 'save-monitored-services', services: [] }))).status, 401);
  admin = true;
  assert.equal((await route.POST(request({ action: 'save-monitored-services', services: ['bad'] }))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await route.POST(request({ action: 'ping', service: 'firestore' }))).status, 400);
  assert.equal((await route.POST(request({ action: 'save-monitored-services', services: [] }))).status, 200);
  assert.equal(writes, 1);
  assert.equal(saved.policy.lowQuotaMode, true);
  const all = await (await route.POST(request({ action: 'ping', service: 'all' }))).json();
  assert.deepEqual(all.results, {});
});

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
      readAdminSetting: async () => EMPTY_BUDGETS,
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
  for (const key of ['dailyReadLimit', 'dailyWriteLimit', 'dailyDeleteLimit']) {
    assert.equal((await route.POST(request({ action: 'save-budgets', services: { firestore: { [key]: -1 } } }))).status, 400);
  }
  await route.POST(request({ action: 'save-budgets', services: { firestore: { monthlyBudget: 30, dailyReadLimit: 80000, dailyWriteLimit: 0, dailyDeleteLimit: 30000 }, vercel: { monthlyAllowance: 2000000 } } }));
  assert.equal(state.policy.lowQuotaMode, true);
  assert.equal(state.services.firestore.monthlyBudget, 30);
  assert.equal(state.services.firestore.dailyReadLimit, 80000);
  assert.equal(state.services.firestore.dailyWriteLimit, 0);
  assert.equal(state.services.firestore.dailyDeleteLimit, 30000);
  assert.equal(summarizeApiUsage(empty(), state).services.find(service => service.id === 'vercel').settings.monthlyAllowance, 2000000);
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
  assert.match(source, /<ApiUsageAnalytics view=\{view\} report=\{data\?\.usage\}/);
  assert.doesNotMatch(source, /All endpoints within quota|All Optimal/);
});
