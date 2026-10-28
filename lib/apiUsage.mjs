import { readAdminSetting, updateAdminSetting } from './adminSettingsStore.mjs';
import { waitUntil } from '@vercel/functions';
import { AsyncLocalStorage } from 'node:async_hooks';
import { collectQuotaAlerts, getQuotaAlertPreferences } from './quotaAlertRules.mjs';

export const API_SERVICES = [
  { id: 'analytics', name: 'Dashboard Analytics API', unit: 'requests', coverage: 'Tracking submissions and admin analytics requests.' },
  { id: 'ga4', name: 'Google Analytics / GA4', unit: 'tokens', coverage: 'Not directly connected. GA4 data currently arrives through sheets; provider token quotas and billing are unavailable.' },
  { id: 'vercel', name: 'Vercel', unit: 'invocations', coverage: 'Instrumented analytics, quota, TikTok and sheet-fetch handler executions on Vercel only; excludes sheet cache hits, other handlers, edge hits, bandwidth, compute duration and other deployments.' },
  { id: 'firestore', name: 'Cloud Firestore', unit: 'document operations', coverage: 'Partial application observations: instrumented sheet-cache, analytics, connectivity probes and successful usage-storage transactions (including their read retries). Excludes other clients, uninstrumented settings/auth/config operations, failed monitoring transactions, indexes, listeners and provider billing adjustments.' },
  { id: 'sheets', name: 'Google Sheets CSV Feeds', unit: 'fetches', coverage: 'Outbound CSV fetch attempts, including retries. Published CSV feeds do not expose Google Sheets API quota counters.' },
  { id: 'smtp', name: 'SMTP Notifications', unit: 'accepted recipients', coverage: 'Recipients accepted by the configured SMTP server; not delivery or provider-wide usage.' },
  { id: 'firebase-auth', name: 'Firebase Authentication', unit: 'verifications', coverage: 'Admin ID-token verification attempts only, not monthly active users or provider-wide usage.' },
  { id: 'tiktok', name: 'TikTok API', unit: 'requests', coverage: 'Outbound TikTok creative and OAuth request attempts only.' },
];

const EMPTY_USAGE = { startedAt: null, days: {} };
export const EMPTY_BUDGETS = { services: {}, policy: { lowQuotaMode: false }, updatedAt: null };
const FIRESTORE_DAILY_FIELDS = { reads: 'dailyReadLimit', writes: 'dailyWriteLimit', deletes: 'dailyDeleteLimit' };
const FIRESTORE_FREE_LIMITS = { dailyReadLimit: 50000, dailyWriteLimit: 20000, dailyDeleteLimit: 20000 };
const QUOTA_NOTES = {
  analytics: 'Internal endpoint: no separate provider allowance. Requests also consume hosting and database resources. An optional allowance is an internal target.',
  ga4: 'Not directly connected. Data arrives through Sheets; GA4 token limits cannot be compared with these observations.',
  vercel: 'Vercel Hobby reference: 1,000,000 function invocations/month. Assumed free tier, not a verified account plan. Partial invocation counts only; CPU, memory, bandwidth and other limits are not measured. UTC calendar months may differ from your billing period.',
  firestore: 'Firestore free-tier references: 50,000 reads, 20,000 writes and 20,000 deletes/day. Editable below. Storage (1 GiB) and outbound transfer (10 GiB/month) are not measured. UTC observations do not match the Pacific quota reset.',
  sheets: 'Published CSV feeds: the Sheets API quota of 300 reads/minute/project does not apply to this counter. No published monthly CSV allowance is configured; an optional allowance is an internal target.',
  smtp: 'Sending limits depend on your email provider and plan. Configure an allowance in accepted recipients, not messages; daily provider limits cannot be represented as a monthly allowance.',
  'firebase-auth': 'Token verification attempts are not active users or sign-ins. Authentication user quotas cannot be applied to this counter; an optional allowance is an internal target.',
  tiktok: 'Limits depend on the endpoint and approved app. A monthly request target does not measure endpoint rate limits.'
};

function serviceSettings(id, saved = {}) {
  const defaults = id === 'vercel' ? { monthlyAllowance: 1000000 } : id === 'firestore' ? FIRESTORE_FREE_LIMITS : {};
  return { ...saved, ...Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, saved[key] ?? value])) };
}
const DAY_MS = 86400000;

export function addUsage(state, service, count, now = new Date(), metric = 'requests') {
  if (!API_SERVICES.some(item => item.id === service) || !Number.isFinite(count) || count < 0) {
    throw new Error('Invalid API usage sample.');
  }
  const day = now.toISOString().slice(0, 10);
  const next = structuredClone(state || {});
  next.startedAt ||= now.toISOString();
  next.days ||= {};
  next.days[day] ||= {};
  const sample = next.days[day][service] ||= { count: 0, metrics: {} };
  sample.count += count;
  sample.metrics[metric] = (sample.metrics[metric] || 0) + count;
  const cutoff = new Date(now.getTime() - 92 * DAY_MS).toISOString().slice(0, 10);
  next.days = Object.fromEntries(Object.entries(next.days).filter(([date]) => date >= cutoff));
  return next;
}

const telemetryHealth = globalThis[Symbol.for('tahaluf.usageHealth')] ||= { lastError: null, failedSamples: 0 };

export function createUsageRecorder(persist, register, onError) {
  let samples = [];
  let draining = null;
  return (service, count = 1, metric = 'requests', observedAt = new Date()) => {
    samples.push({ service, count, metric, observedAt });
    if (!draining) {
      // Combine concurrent observations without a timer or an unregistered delayed flush.
      draining = Promise.resolve().then(async () => {
        try {
          while (samples.length) {
            const batch = samples;
            samples = [];
            try {
              await persist(state => batch.reduce((next, sample) =>
                addUsage(next, sample.service, sample.count, sample.observedAt, sample.metric), state), batch);
            } catch (error) {
              onError(error, batch.length);
            }
          }
        } finally {
          draining = null;
        }
      });
    }
    register(draining);
  };
}

export function includeUsageStorageOverhead(state, reads, now = new Date()) {
  return addUsage(addUsage(state, 'firestore', reads, now, 'reads'), 'firestore', 1, now, 'writes');
}

const recordUsage = globalThis[Symbol.for('tahaluf.usageRecorder')] ||= createUsageRecorder(
  async (_update, batch) => {
    const budgets = await readAdminSetting('apiBudgets', EMPTY_BUDGETS);
    const enabled = getMonitoredServices(budgets);
    const selected = batch.filter(sample => enabled.includes(sample.service));
    if (!selected.length) return;
    let attempts = 0;
    const saved = await updateAdminSetting('apiUsage', EMPTY_USAGE, state => {
      attempts++;
      const next = selected.reduce((current, sample) =>
        addUsage(current, sample.service, sample.count, sample.observedAt, sample.metric), state);
      return process.env.VERCEL === '1' && enabled.includes('firestore') ? includeUsageStorageOverhead(next, attempts) : next;
    });
    if (saved) {
      const report = summarizeApiUsage(saved, budgets);
      report.services = report.services.filter(service => enabled.includes(service.id));
      await checkQuotaAlerts(report);
    }
  },
  waitUntil,
  (error, failedSamples) => {
    console.error('[API USAGE] Unable to persist usage batch:', error);
    telemetryHealth.lastError = error.message;
    telemetryHealth.failedSamples += failedSamples;
  }
);

// A scope spans awaits, not a timer: nested handlers share one flush, even on errors.
export function createUsageScope(record, register = waitUntil) {
  const storage = new AsyncLocalStorage();
  const observe = (service, count = 1, metric = 'requests') => {
    const scope = storage.getStore();
    if (!scope || scope.closed) return record(service, count, metric);
    const observedAt = new Date();
    const key = JSON.stringify([observedAt.toISOString().slice(0, 10), service, metric]);
    const sample = scope.samples.get(key);
    if (sample) sample.count += count;
    else scope.samples.set(key, { service, count, metric, observedAt });
  };
  const wrap = handler => function (...args) {
    if (storage.getStore() && !storage.getStore().closed) return handler.apply(this, args);
    const scope = { samples: new Map(), closed: false };
    const lifetime = storage.run(scope, async () => {
      try {
        return await handler.apply(this, args);
      } finally {
        scope.closed = true;
        for (const sample of scope.samples.values()) record(sample.service, sample.count, sample.metric, sample.observedAt);
        scope.samples.clear();
      }
    });
    register(lifetime.then(() => {}, () => {}));
    return lifetime;
  };
  return { observe, wrap };
}

const usageScope = createUsageScope(recordUsage);
export const withUsageScope = usageScope.wrap;

export function observeApiUsage(service, count = 1, metric = 'requests') {
  usageScope.observe(service, count, metric);
}

export function observeApiRequest(service) {
  if (service) observeApiUsage(service);
  if (process.env.VERCEL === '1') observeApiUsage('vercel');
}

export function validateBudgets(services) {
  if (!services || typeof services !== 'object' || Array.isArray(services)) throw new Error('Expected service budgets.');
  const normalized = {};
  for (const [id, settings] of Object.entries(services)) {
    if (!API_SERVICES.some(service => service.id === id) || !settings || typeof settings !== 'object') {
      throw new Error(`Invalid service: ${id}`);
    }
    normalized[id] = {};
    for (const key of ['ratePerThousand', 'monthlyBudget', 'monthlyAllowance', 'baseMonthlyCost',
      ...(id === 'firestore' ? Object.values(FIRESTORE_DAILY_FIELDS) : [])]) {
      const value = settings[key];
      if (value !== null && value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        throw new Error(`${id}: ${key} must be a non-negative number or null.`);
      }
      normalized[id][key] = value ?? null;
    }
  }
  return normalized;
}

export function normalizeUsagePolicy(policy) {
  return { lowQuotaMode: policy?.lowQuotaMode === true };
}

export function getMonitoredServices(settings) {
  return settings?.monitoredServices ?? API_SERVICES.map(service => service.id);
}

export function updateMonitoredServices(state, services, now = new Date()) {
  if (!Array.isArray(services) || services.some(id => !API_SERVICES.some(service => service.id === id))
    || new Set(services).size !== services.length) {
    throw new Error('Select unique, known API services.');
  }
  return { ...state, monitoredServices: [...services], updatedAt: now.toISOString() };
}

export async function readMonitoringSettings() {
  return readAdminSetting('apiBudgets', EMPTY_BUDGETS);
}

export function updateUsagePolicy(state, lowQuotaMode, now = new Date()) {
  if (typeof lowQuotaMode !== 'boolean') throw new Error('lowQuotaMode must be a boolean.');
  return { ...state, policy: { ...state.policy, lowQuotaMode }, updatedAt: now.toISOString() };
}

export function updateUsageBudgets(state, services, now = new Date()) {
  return { ...state, services: validateBudgets(services), updatedAt: now.toISOString() };
}

export async function readPublicUsagePolicy() {
  return normalizeUsagePolicy((await readAdminSetting('apiBudgets', EMPTY_BUDGETS)).policy);
}

export function summarizeFirestoreDaily(state, completedDays, now = new Date(), settings = {}) {
  const firstDay = state.startedAt?.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const elapsed = (now.getTime() - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
  const resolved = serviceSettings('firestore', settings);
  const limits = Object.fromEntries(Object.entries(FIRESTORE_DAILY_FIELDS).map(([metric, key]) => [metric, resolved[key]]));
  const history = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) - (13 - index) * DAY_MS).toISOString().slice(0, 10);
    const covered = Boolean(firstDay && date >= firstDay);
    return { date, ...Object.fromEntries(Object.keys(limits).map(metric => [metric, covered ? state.days[date]?.firestore?.metrics?.[metric] || 0 : null])) };
  });
  const metrics = Object.entries(limits).map(([metric, referenceDailyLimit]) => {
    const observed = firstDay ? state.days[today]?.firestore?.metrics?.[metric] || 0 : null;
    const average = completedDays.length ? completedDays.reduce((sum, date) => sum + (state.days[date]?.firestore?.metrics?.[metric] || 0), 0) / completedDays.length : null;
    const projected = observed === null || average === null ? null : Math.max(observed, average, elapsed >= 1 / 24 ? observed / elapsed : 0);
    const percent = observed === null || referenceDailyLimit <= 0 ? null : observed / referenceDailyLimit * 100;
    const forecastPercent = projected === null || referenceDailyLimit <= 0 ? null : projected / referenceDailyLimit * 100;
    return {
      metric, today: observed, averageDaily: average, projectedToday: projected, referenceDailyLimit,
      percent, forecastPercent,
      warning: Math.max(percent, forecastPercent || 0) >= 90 ? 'critical' : Math.max(percent, forecastPercent || 0) >= 70 ? 'warning' : null
    };
  });
  return {
    history, metrics, sampleDays: completedDays.length,
    referenceOnly: true,
    resetNotice: 'UTC daily observation buckets — NOT Firestore’s America/Los_Angeles (Pacific) daily quota reset. Editable reference thresholds default to the free tier; not verified account limits or remaining quota.',
    forecastMethod: 'Requires completed collection-day history (excludes start day and today). Higher of observed today, recent daily mean, and current UTC-day pace after one hour. Traffic-driven estimates, not provider quota verification.'
  };
}

export function summarizeApiUsage(state, budgets = EMPTY_BUDGETS, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const remainingDays = daysInMonth - now.getUTCDate();
  // Exclude the first, partial collection day and today's incomplete day from forecasts.
  const firstDay = state.startedAt?.slice(0, 10);
  const completedDays = [];
  for (let offset = 1; offset <= 7; offset++) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - offset * DAY_MS).toISOString().slice(0, 10);
    if (firstDay && date > firstDay) completedDays.push(date);
  }
  const services = API_SERVICES.map(service => {
    const settings = serviceSettings(service.id, budgets.services?.[service.id]);
    const connected = service.id !== 'ga4' && (service.id !== 'vercel' || process.env.VERCEL === '1');
    const days = state?.days || {};
    const monthSamples = Object.entries(days).filter(([date]) => date.startsWith(month));
    const monthUsage = connected ? monthSamples.reduce((sum, [, samples]) => sum + (samples[service.id]?.count || 0), 0) : null;
    const todayUsage = connected ? days[today]?.[service.id]?.count || 0 : null;
    const average = connected && completedDays.length
      ? completedDays.reduce((sum, date) => sum + (days[date]?.[service.id]?.count || 0), 0) / completedDays.length
      : null;
    const projectedUsage = average === null ? null : monthUsage + Math.max(0, average - todayUsage) + average * remainingDays;
    const estimate = usage => usage === null || settings.ratePerThousand == null
      ? null
      : (settings.baseMonthlyCost || 0) + Math.max(0, usage - (settings.monthlyAllowance || 0)) * settings.ratePerThousand / 1000;
    const estimatedSpend = estimate(monthUsage);
    const projectedSpend = estimate(projectedUsage);
    const metrics = {};
    monthSamples.forEach(([, samples]) => Object.entries(samples[service.id]?.metrics || {}).forEach(([key, value]) => {
      metrics[key] = (metrics[key] || 0) + value;
    }));
    return {
      ...service, quotaNote: QUOTA_NOTES[service.id], connected, settings, todayUsage, monthUsage, metrics,
      averageDailyUsage: average, projectedUsage, estimatedSpend, projectedSpend,
      actualSpend: null,
      actualSpendSource: 'Provider billing is not connected.',
      quotaPercent: monthUsage !== null && settings.monthlyAllowance > 0 ? monthUsage / settings.monthlyAllowance * 100 : null,
      budgetPercent: estimatedSpend !== null && settings.monthlyBudget > 0 ? estimatedSpend / settings.monthlyBudget * 100 : null,
      forecastOverBudget: projectedSpend !== null && settings.monthlyBudget > 0 ? projectedSpend > settings.monthlyBudget : null,
      history: Array.from({ length: 14 }, (_, index) => {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (13 - index) * DAY_MS).toISOString().slice(0, 10);
        return { date, count: connected && firstDay && date >= firstDay ? state.days[date]?.[service.id]?.count || 0 : null };
      })
    };
  });
  return {
    services, startedAt: state.startedAt, month, currency: 'USD',
    policy: normalizeUsagePolicy(budgets.policy),
    alertThresholds: getQuotaAlertPreferences(budgets.alertThresholds, API_SERVICES),
    firestoreDaily: summarizeFirestoreDaily(state, completedDays, now, budgets.services?.firestore),
    collectionNotice: 'History persists in existing apiUsage storage for 93 UTC days. Collection and warnings run with application traffic; no autonomous daily monitoring without a configured scheduler. Missing traffic is not proof of zero provider usage.',
    forecastSampleDays: completedDays.length,
    forecastMethod: 'Mean of up to 7 completed UTC collection days, excluding collection start day. Remaining usage today plus remaining calendar days. No backfill before monitoring started.',
    ...telemetryHealth
  };
}

export async function getApiUsageReport() {
  const budgets = await readMonitoringSettings();
  const enabled = getMonitoredServices(budgets);
  if (enabled.length && process.env.VERCEL === '1') observeApiUsage('firestore', 1, 'reads');
  const usage = enabled.length ? await readAdminSetting('apiUsage', EMPTY_USAGE) : EMPTY_USAGE;
  const report = summarizeApiUsage(usage, budgets);
  const result = {
    ...report,
    monitoredServices: enabled,
    availableServices: report.services.map(({ id, name, settings }) => ({ id, name, settings })),
    services: report.services.filter(service => enabled.includes(service.id))
  };
  result.alerts = collectQuotaAlerts(result);
  result.alertDelivery = structuredClone(globalThis[Symbol.for('tahaluf.quotaAlertDelivery')] || {
    status: 'not-checked', lastCheckedAt: null, lastError: null
  });
  if (result.alerts.length) waitUntil(checkQuotaAlerts(result));
  return result;
}

async function checkQuotaAlerts(report) {
  const alerts = collectQuotaAlerts(report);
  if (!alerts.length) return;
  try {
    const { dispatchQuotaAlerts } = await import('./quotaAlerts.mjs');
    await dispatchQuotaAlerts(alerts);
  } catch (error) {
    globalThis[Symbol.for('tahaluf.quotaAlertDelivery')] = {
      status: 'error', lastCheckedAt: new Date().toISOString(), lastError: error.message
    };
    console.error('[QUOTA ALERT] Could not evaluate notifications:', error);
  }
}
