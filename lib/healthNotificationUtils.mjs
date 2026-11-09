import { isBlankValueIgnored, isIssueIgnored } from './dimensionStandards.mjs';

export const ALLOWED_ALERT_DELAYS = [0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30];
export const ALLOWED_DAILY_ALERT_LIMITS = [1, 2, 3, 5, 10];
export const ALLOWED_NOTIFICATION_BATCH_WINDOWS = [0, 5, 10];

export const DEFAULT_HEALTH_NOTIFICATION_SETTINGS = {
  dashboardEnabled: true,
  emailEnabled: true,
  emailRecipients: ['mohammad.jhone@omc.com'],
  frequency: 'daily_with_critical',
  alertDelayMinutes: 5,
  maxAlertsPerIssuePerDay: 1,
  notificationBatchWindowMinutes: 10,
  sendResolutionEmail: true,
  metricEmailEnabled: true,
  dimensionEmailEnabled: true,
  activityEmailEnabled: true,
  webhookEnabled: false,
  webhookUrl: '',
  webhookPlatform: 'slack'
};

export function normalizeHealthNotificationSettings(settings = {}) {
  const frequencyOptions = ['immediate', 'daily', 'daily_with_critical'];
  const savedFrequency = settings.frequency === 'immediate_and_daily'
    ? 'daily_with_critical'
    : settings.frequency;
  const recipients = Array.isArray(settings.emailRecipients)
    ? [...new Set(settings.emailRecipients.map(email => String(email).trim().toLowerCase()).filter(Boolean))]
    : DEFAULT_HEALTH_NOTIFICATION_SETTINGS.emailRecipients;
  const invalidEmail = recipients.find(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

  if (invalidEmail) {
    throw new Error(`Invalid notification email address: ${invalidEmail}`);
  }

  const delayMinutes = ALLOWED_ALERT_DELAYS.includes(Number(settings.alertDelayMinutes))
    ? Number(settings.alertDelayMinutes)
    : DEFAULT_HEALTH_NOTIFICATION_SETTINGS.alertDelayMinutes;
  const maxAlertsPerIssuePerDay = ALLOWED_DAILY_ALERT_LIMITS.includes(Number(settings.maxAlertsPerIssuePerDay))
    ? Number(settings.maxAlertsPerIssuePerDay)
    : DEFAULT_HEALTH_NOTIFICATION_SETTINGS.maxAlertsPerIssuePerDay;
  const notificationBatchWindowMinutes = ALLOWED_NOTIFICATION_BATCH_WINDOWS.includes(Number(settings.notificationBatchWindowMinutes))
    ? Number(settings.notificationBatchWindowMinutes)
    : DEFAULT_HEALTH_NOTIFICATION_SETTINGS.notificationBatchWindowMinutes;

  return {
    dashboardEnabled: settings.dashboardEnabled !== false,
    emailEnabled: settings.emailEnabled !== false,
    emailRecipients: recipients,
    frequency: frequencyOptions.includes(savedFrequency)
      ? savedFrequency
      : DEFAULT_HEALTH_NOTIFICATION_SETTINGS.frequency,
    alertDelayMinutes: delayMinutes,
    maxAlertsPerIssuePerDay,
    notificationBatchWindowMinutes,
    sendResolutionEmail: settings.sendResolutionEmail !== false,
    metricEmailEnabled: settings.metricEmailEnabled !== false,
    dimensionEmailEnabled: settings.dimensionEmailEnabled !== false,
    activityEmailEnabled: settings.activityEmailEnabled !== false,
    webhookEnabled: Boolean(settings.webhookEnabled),
    webhookUrl: typeof settings.webhookUrl === 'string' ? settings.webhookUrl.trim() : '',
    webhookPlatform: ['slack', 'teams', 'generic'].includes(settings.webhookPlatform)
      ? settings.webhookPlatform
      : 'slack'
  };
}

export function isMajorHealthIssue(issue) {
  return issue.severity === 'critical' ||
    ['activity-halt', 'missing-data', 'unavailable', 'storage-error'].includes(issue.status);
}

export function isHealthIssueEmailEnabled(issue, settings) {
  if (issue.category === 'metrics' || issue.status === 'metric-discrepancy') return settings.metricEmailEnabled !== false;
  if (issue.category === 'dimensions' || issue.status === 'dimension-discrepancy' || issue.status === 'dimension-unavailable') return settings.dimensionEmailEnabled !== false;
  if (issue.category === 'activity' || issue.category === 'pacing' || ['activity-halt', 'spend-cliff', 'campaign-paused'].includes(issue.status)) return settings.activityEmailEnabled !== false;
  return true;
}

export function getVisibleEventActivityStatuses(events = [], eventStatuses = {}) {
  const eventById = new Map(events.map(event => [event.id, event]));
  return Object.entries(eventStatuses || {})
    .filter(([, activity]) => ['paused', 'ended'].includes(activity?.status))
    .flatMap(([eventId, activity]) => {
      const event = eventById.get(eventId);
      if (!event || event.status === 'admin_only' || event.visibility === 'admin_only') return [];
      return [{
        eventId,
        eventName: event.name || event.sourceName || eventId,
        status: activity.status
      }];
    })
    .sort((left, right) => left.eventName.localeCompare(right.eventName));
}

function getHealthIssueIdentity(issue) {
  const event = String(issue.eventId || issue.eventName || issue.key || '').trim().toLowerCase();
  const category = String(issue.category || issue.status || 'health').trim().toLowerCase();
  return `${event}:${category}`;
}

function getHealthIssueTimestamp(issue) {
  const value = issue.observedAt || issue.lastDataDate || issue.updatedAt ||
    issue.detectedAt || issue.openedAt || issue.anomalyDetails?.date;
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function mergeHealthIssues(detectedIssues = [], persistedIssues = []) {
  const merged = new Map();
  const addLatest = issue => {
    const identity = getHealthIssueIdentity(issue);
    const current = merged.get(identity);
    if (!current) {
      merged.set(identity, issue);
      return;
    }
    const candidateTime = getHealthIssueTimestamp(issue);
    const currentTime = getHealthIssueTimestamp(current);
    if ((candidateTime !== null && (currentTime === null || candidateTime >= currentTime)) ||
      (candidateTime === null && currentTime === null)) {
      merged.set(identity, issue);
    }
  };

  for (const issue of detectedIssues) addLatest(issue);
  const detectedIdentities = new Set(merged.keys());
  for (const issue of persistedIssues) {
    if (!detectedIdentities.has(getHealthIssueIdentity(issue))) addLatest(issue);
  }
  return [...merged.values()];
}

export function getHealthIssues(sheetHealth = [], dimensionSettings = null) {
  const issues = sheetHealth.flatMap(source => {
    const messages = [];
    const state = source.state || 'unknown';
    let status = null;

    if (['stale', 'unavailable', 'storage-error'].includes(state)) {
      status = state;
      messages.push(source.lastError || ({
        stale: 'The sheet is serving saved data after a failed refresh.',
        unavailable: 'The sheet could not be fetched and no saved snapshot is available.',
        'storage-error': 'The new sheet data could not be stored safely.'
      }[state]));
    }

    if (source.kind === 'Actuals' && (source.eventDataStatus === 'missing' || (source.eventRows !== undefined && source.eventRows === 0 && source.eventDataStatus !== 'present'))) {
      status ||= 'missing-data';
      messages.push(
        (source.totalRows ?? 0) === 0 || !source.hasCachedData
          ? 'No event rows available. Sheet data has not been retrieved or contains 0 rows.'
          : 'No rows tagged for this event were found in the actuals sheet.'
      );
    }

    if (source.monitoringEnabled === false) return [];
    const issues = status && source.sheetChecksEnabled !== false ? [{
      key: `${source.eventId}:${source.kind}`, eventId: source.eventId, eventName: source.eventName,
      kind: source.kind, status, message: messages.join(' '), category: 'feed'
    }] : [];
    if (source.metricChecksEnabled !== false && source.metricDiscrepancies && source.metricDiscrepancies.length > 0) {
      const discList = source.metricDiscrepancies;
      const count = discList.length;
      const sample = discList.slice(0, 2).map(d => `${d.channel} ${d.metric} dropped from ${d.previousValue} to ${d.currentValue} (-${d.dropPercent}%)`).join('; ');
      issues.push({
        key: `${source.eventId}:${source.kind}:metrics`, eventId: source.eventId, eventName: source.eventName,
        kind: source.kind, status: 'metric-discrepancy', category: 'metrics',
        message: `${count} metric discrepancy detected in last 24h: ${sample}${count > 2 ? ` (+${count - 2} more)` : ''}.`,
        discrepancies: discList
      });
    }
    if (source.activityChecksEnabled !== false && source.activityAnomalies && source.activityAnomalies.length > 0) {
      source.activityAnomalies.forEach(anomaly => {
        const eventName = anomaly.eventName || source.eventName || source.eventId;
        issues.push({
          key: `${source.eventId}:${source.kind}:activity:${eventName}:${anomaly.type || anomaly.id || 'activity'}`,
          eventId: source.eventId,
          eventName,
          kind: source.kind,
          status: anomaly.type,
          category: 'activity',
          severity: anomaly.severity || (anomaly.type === 'activity-halt' ? 'critical' : 'warning'),
          message: anomaly.message,
          anomalyDetails: anomaly
        });
      });
    }
    const dimensions = source.dimensionHealth;
    if (source.kind === 'Actuals' && dimensions && dimensions.status !== 'disabled') {
      const unavailable = dimensions.status !== 'checked';
      const rawFindings = dimensions.findings || [];
      const findings = rawFindings.filter(finding => {
        if (finding.type === 'blank' && dimensionSettings) {
          const targetEv = finding.eventName || source.eventName || source.eventId;
          return !isBlankValueIgnored(finding.dimension, targetEv, { ...dimensionSettings, eventId: source.eventId });
        }
        return true;
      });

      if (unavailable || dimensions.stale || findings.length > 0) {
        issues.push({
          key: `${source.eventId}:${source.kind}:dimensions`, eventId: source.eventId, eventName: source.eventName,
          kind: source.kind, category: 'dimensions',
          status: unavailable || dimensions.stale ? 'dimension-unavailable' : 'dimension-discrepancy',
          message: [
            unavailable ? `Dimension validation unavailable: ${dimensions.error || 'refresh the source'}.` : '',
            dimensions.stale ? `Using stale standards: ${dimensions.error || 'standards refresh required'}.` : '',
            ...findings.slice(0, 12).map(finding => `${finding.label}: ${finding.type}, ${finding.count} rows${finding.values.length ? ` (${finding.values.join(', ')})` : ''}; sample CSV records ${finding.sampleRows.join(', ')}`),
            findings.length > 12 ? `${findings.length} findings in total; review Health Monitor for full details.` : ''
          ].filter(Boolean).join(' '),
          dimensionFindings: findings.slice(0, 33)
        });
      }
    }
    return issues
      .filter(issue => !isIssueIgnored(issue, dimensionSettings))
      .map(issue => {
        const observedAt = source.lastDataDate || source.lastUpdatedAt || source.checkedAt;
        return observedAt ? { ...issue, observedAt } : issue;
      });
  });
  return mergeHealthIssues(issues);
}

export const MAX_HEALTH_HISTORY = 200;

export function recordHealthIssueResolved(state, historyId, nowIso, reason = 'resolved', author = null, notes = null) {
  if (!historyId || !Array.isArray(state.history)) return;
  const entry = state.history.find(item => item.id === historyId);
  if (entry && !entry.resolvedAt) {
    entry.resolvedAt = nowIso;
    entry.resolution = reason;
    if (author) entry.resolvedBy = author;
    if (notes) entry.notes = notes;
  }
}

export function recordHealthIssueOpened(state, issue, previous, nowIso) {
  state.history = Array.isArray(state.history) ? state.history : [];
  if (previous?.historyId && previous.signature === issue.signature) return previous.historyId;
  if (previous?.historyId) recordHealthIssueResolved(state, previous.historyId, nowIso, 'status-changed');

  const baseId = `${issue.key}@${nowIso}`;
  let id = baseId;
  let suffix = 1;
  while (state.history.some(entry => entry.id === id)) id = `${baseId}#${suffix++}`;
  state.history.push({
    id,
    key: issue.key,
    eventName: issue.eventName,
    kind: issue.kind,
    status: issue.status,
    message: issue.message,
    category: issue.category || 'feed',
    ...(issue.dimensionFindings ? { dimensionFindings: issue.dimensionFindings } : {}),
    openedAt: nowIso,
    resolvedAt: null,
    resolution: null
  });
  if (state.history.length > MAX_HEALTH_HISTORY) {
    state.history = state.history.slice(-MAX_HEALTH_HISTORY);
  }
  return id;
}
