import { readAdminSetting, updateAdminSetting } from './adminSettingsStore.mjs';

export const API_SERVICES = [
  { id: 'analytics', name: 'Dashboard Analytics API', unit: 'requests', coverage: 'Tracking submissions and admin analytics requests.' },
  { id: 'ga4', name: 'Google Analytics / GA4', unit: 'tokens', coverage: 'Not directly connected. GA4 data currently arrives through sheets; provider token quotas and billing are unavailable.' },
  { id: 'vercel', name: 'Vercel', unit: 'invocations', coverage: 'Instrumented analytics, quota, TikTok and sheet-fetch handler executions on Vercel only; excludes sheet cache hits, other handlers, edge hits, bandwidth, compute duration and other deployments.' },
  { id: 'firestore', name: 'Cloud Firestore', unit: 'document operations', coverage: 'Observed sheet-cache and analytics reads/writes only; excludes other clients and monitoring storage overhead. Reads and writes are also broken out below.' },
  { id: 'sheets', name: 'Google Sheets CSV Feeds', unit: 'fetches', coverage: 'Outbound CSV fetch attempts, including retries. Published CSV feeds do not expose Google Sheets API quota counters.' },
  { id: 'smtp', name: 'SMTP Notifications', unit: 'accepted recipients', coverage: 'Recipients accepted by the configured SMTP server; not delivery or provider-wide usage.' },
  { id: 'firebase-auth', name: 'Firebase Authentication', unit: 'verifications', coverage: 'Admin ID-token verification attempts only, not monthly active users or provider-wide usage.' },
  { id: 'tiktok', name: 'TikTok API', unit: 'requests', coverage: 'Outbound TikTok creative and OAuth request attempts only.' },
];

const EMPTY_USAGE = { startedAt: null, days: {} };
export const EMPTY_BUDGETS = { services: {}, updatedAt: null };
const DAY_MS = 86400000;

export function addUsage(state, service, count, now = new Date(), metric = 'requests') {
  if (!API_SERVICES.some(item => item.id === service) || !Number.isFinite(count) || count < 0) {
    throw new Error('Invalid API usage sample.');
  }
  const day = now.toISOString().slice(0, 10);
  const next = structuredClone(state);
  next.startedAt ||= now.toISOString();
  next.days[day] ||= {};
  const sample = next.days[day][service] ||= { count: 0, metrics: {} };
  sample.count += count;
  sample.metrics[metric] = (sample.metrics[metric] || 0) + count;
  const cutoff = new Date(now.getTime() - 92 * DAY_MS).toISOString().slice(0, 10);
  next.days = Object.fromEntries(Object.entries(next.days).filter(([date]) => date >= cutoff));
  return next;
}

export async function observeApiUsage(service, count = 1, metric = 'requests') {
  try {
    await updateAdminSetting('apiUsage', EMPTY_USAGE, state => addUsage(state, service, count, new Date(), metric));
  } catch (error) {
    // Monitoring must not take down sheets, authentication or analytics.
    console.error(`[API USAGE] Unable to persist ${service} sample:`, error);
    telemetryHealth.lastError = error.message;
    telemetryHealth.failedSamples += 1;
  }
}

const telemetryHealth = globalThis[Symbol.for('tahaluf.usageHealth')] ||= { lastError: null, failedSamples: 0 };

export async function observeApiRequest(service) {
  if (service) await observeApiUsage(service);
  if (process.env.VERCEL === '1') await observeApiUsage('vercel');
}

export function validateBudgets(services) {
  if (!services || typeof services !== 'object' || Array.isArray(services)) throw new Error('Expected service budgets.');
  const normalized = {};
  for (const [id, settings] of Object.entries(services)) {
    if (!API_SERVICES.some(service => service.id === id) || !settings || typeof settings !== 'object') {
      throw new Error(`Invalid service: ${id}`);
    }
    normalized[id] = {};
    for (const key of ['ratePerThousand', 'monthlyBudget', 'monthlyAllowance', 'baseMonthlyCost']) {
      const value = settings[key];
      if (value !== null && value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        throw new Error(`${id}: ${key} must be a non-negative number or null.`);
      }
      normalized[id][key] = value ?? null;
    }
  }
  return normalized;
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
    const settings = budgets.services[service.id] || {};
    const connected = service.id !== 'ga4' && (service.id !== 'vercel' || process.env.VERCEL === '1');
    const monthSamples = Object.entries(state.days).filter(([date]) => date.startsWith(month));
    const monthUsage = connected ? monthSamples.reduce((sum, [, samples]) => sum + (samples[service.id]?.count || 0), 0) : null;
    const todayUsage = connected ? state.days[today]?.[service.id]?.count || 0 : null;
    const average = connected && completedDays.length
      ? completedDays.reduce((sum, date) => sum + (state.days[date]?.[service.id]?.count || 0), 0) / completedDays.length
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
      ...service, connected, settings, todayUsage, monthUsage, metrics,
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
    forecastSampleDays: completedDays.length,
    forecastMethod: 'Mean of up to 7 completed UTC collection days, excluding collection start day. Remaining usage today plus remaining calendar days. No backfill before monitoring started.',
    ...telemetryHealth
  };
}

export async function getApiUsageReport() {
  const [usage, budgets] = await Promise.all([
    readAdminSetting('apiUsage', EMPTY_USAGE),
    readAdminSetting('apiBudgets', EMPTY_BUDGETS)
  ]);
  return summarizeApiUsage(usage, budgets);
}
