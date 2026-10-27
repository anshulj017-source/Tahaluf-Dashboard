export const ALLOWED_ALERT_DELAYS = [0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30];

export const DEFAULT_HEALTH_NOTIFICATION_SETTINGS = {
  dashboardEnabled: true,
  emailEnabled: true,
  emailRecipients: ['mohammad.jhone@omc.com'],
  frequency: 'immediate_and_daily',
  alertDelayMinutes: 5,
  sendResolutionEmail: true,
  metricEmailEnabled: true,
  dimensionEmailEnabled: true
};

export function normalizeHealthNotificationSettings(settings = {}) {
  const frequencyOptions = ['immediate', 'daily', 'immediate_and_daily'];
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

  return {
    dashboardEnabled: settings.dashboardEnabled !== false,
    emailEnabled: settings.emailEnabled !== false,
    emailRecipients: recipients,
    frequency: frequencyOptions.includes(settings.frequency)
      ? settings.frequency
      : DEFAULT_HEALTH_NOTIFICATION_SETTINGS.frequency,
    alertDelayMinutes: delayMinutes,
    sendResolutionEmail: settings.sendResolutionEmail !== false,
    metricEmailEnabled: settings.metricEmailEnabled !== false,
    dimensionEmailEnabled: settings.dimensionEmailEnabled !== false
  };
}

export function isHealthIssueEmailEnabled(issue, settings) {
  if (issue.category === 'metrics' || issue.status === 'metric-discrepancy') return settings.metricEmailEnabled !== false;
  if (issue.category === 'dimensions' || issue.status === 'dimension-discrepancy' || issue.status === 'dimension-unavailable') return settings.dimensionEmailEnabled !== false;
  return true;
}

export function getHealthIssues(sheetHealth = []) {
  return sheetHealth.flatMap(source => {
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
    const dimensions = source.dimensionHealth;
    if (source.kind === 'Actuals' && dimensions && dimensions.status !== 'disabled') {
      const unavailable = dimensions.status !== 'checked';
      if (unavailable || dimensions.findings?.length || dimensions.stale) {
        const findings = dimensions.findings || [];
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
    return issues;
  });
}

export const MAX_HEALTH_HISTORY = 200;

export function recordHealthIssueResolved(state, historyId, nowIso, reason = 'resolved') {
  if (!historyId || !Array.isArray(state.history)) return;
  const entry = state.history.find(item => item.id === historyId);
  if (entry && !entry.resolvedAt) {
    entry.resolvedAt = nowIso;
    entry.resolution = reason;
  }
}

export function recordHealthIssueOpened(state, issue, previous, nowIso) {
  state.history = Array.isArray(state.history) ? state.history : [];
  if (previous?.historyId && previous.signature === issue.signature) return previous.historyId;
  if (previous?.historyId) recordHealthIssueResolved(state, previous.historyId, nowIso, 'status-changed');

  const id = `${issue.key}@${nowIso}`;
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
