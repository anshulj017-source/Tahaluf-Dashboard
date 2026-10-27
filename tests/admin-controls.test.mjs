import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DASHBOARD_FEATURES, DEFAULT_FEATURE_CONFIG, FEATURE_MODES,
  isFeatureEnabled, validateFeatureModes
} from '../lib/dashboardFeatures.mjs';
import {
  API_SERVICES, EMPTY_BUDGETS, addUsage, summarizeApiUsage, validateBudgets
} from '../lib/apiUsage.mjs';
import { readAdminSetting, updateAdminSetting } from '../lib/adminSettingsStore.mjs';

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
