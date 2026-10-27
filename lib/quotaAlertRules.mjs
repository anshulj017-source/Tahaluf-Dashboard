export const QUOTA_ALERT_THRESHOLDS = [70, 90];

export function getQuotaAlertPreferences(preferences = {}, services) {
  return Object.fromEntries(services.map(service => [service.id,
    Object.fromEntries(QUOTA_ALERT_THRESHOLDS.map(threshold => [threshold, preferences[service.id]?.[threshold] !== false]))
  ]));
}

export function updateQuotaAlertPreferences(state, preferences, services, now = new Date()) {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw new Error('Expected API alert selections.');
  }
  for (const [id, selections] of Object.entries(preferences)) {
    if (!services.some(service => service.id === id) || !selections || typeof selections !== 'object'
      || Array.isArray(selections) || Object.entries(selections).some(([threshold, enabled]) =>
        !QUOTA_ALERT_THRESHOLDS.includes(Number(threshold)) || !['70', '90'].includes(threshold) || typeof enabled !== 'boolean')) {
      throw new Error(`Invalid alert selection: ${id}`);
    }
  }
  return {
    ...state,
    alertThresholds: getQuotaAlertPreferences(preferences, services),
    updatedAt: now.toISOString()
  };
}

export function collectQuotaAlerts(report, now = new Date()) {
  const alerts = [];
  for (const service of report.services) {
    const measures = [
      { id: 'monthly-allowance', label: 'configured monthly allowance', percent: service.quotaPercent,
        forecast: service.settings.monthlyAllowance > 0 && service.projectedUsage != null
          ? service.projectedUsage / service.settings.monthlyAllowance * 100 : null, period: report.month },
      { id: 'monthly-budget', label: 'configured monthly spend budget', percent: service.budgetPercent,
        forecast: service.settings.monthlyBudget > 0 && service.projectedSpend != null
          ? service.projectedSpend / service.settings.monthlyBudget * 100 : null, period: report.month }
    ];
    if (service.id === 'firestore') {
      for (const metric of report.firestoreDaily?.metrics || []) {
        measures.push({
          id: `daily-${metric.metric}`, label: `UTC-day ${metric.metric} reference`,
          percent: metric.percent, forecast: metric.forecastPercent, period: now.toISOString().slice(0, 10)
        });
      }
    }
    for (const threshold of QUOTA_ALERT_THRESHOLDS) {
      if (report.alertThresholds?.[service.id]?.[threshold] === false) continue;
      for (const measure of measures) {
        if (![measure.percent, measure.forecast].some(value => Number.isFinite(value) && value >= threshold)) continue;
        const observed = Number.isFinite(measure.percent) && measure.percent >= threshold;
        alerts.push({
          key: `${service.id}:${measure.id}:${measure.period}:${threshold}`,
          service: service.id, name: service.name, threshold, metric: measure.id, period: measure.period,
          message: `${service.name}: ${threshold}% marker reached for ${measure.label} (${observed ? 'observed' : 'forecast'} ${(observed ? measure.percent : measure.forecast).toFixed(1)}%).`
        });
      }
    }
  }
  return alerts;
}
