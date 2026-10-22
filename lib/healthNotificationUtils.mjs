export const DEFAULT_HEALTH_NOTIFICATION_SETTINGS = {
  dashboardEnabled: true,
  emailEnabled: true,
  emailRecipients: ['mohammad.jhone@omc.com'],
  frequency: 'immediate_and_daily'
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

  return {
    dashboardEnabled: settings.dashboardEnabled !== false,
    emailEnabled: settings.emailEnabled !== false,
    emailRecipients: recipients,
    frequency: frequencyOptions.includes(settings.frequency)
      ? settings.frequency
      : DEFAULT_HEALTH_NOTIFICATION_SETTINGS.frequency
  };
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

    if (source.kind === 'Actuals' && source.eventDataStatus === 'missing') {
      status ||= 'missing-data';
      messages.push('No rows tagged for this event were found in the actuals sheet.');
    }

    return status
      ? [{
          key: `${source.eventId}:${source.kind}`,
          eventId: source.eventId,
          eventName: source.eventName,
          kind: source.kind,
          status,
          message: messages.join(' ')
        }]
      : [];
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
    openedAt: nowIso,
    resolvedAt: null,
    resolution: null
  });
  if (state.history.length > MAX_HEALTH_HISTORY) {
    state.history = state.history.slice(-MAX_HEALTH_HISTORY);
  }
  return id;
}
