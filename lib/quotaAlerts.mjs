import { randomUUID } from 'node:crypto';
import { updateAdminSetting } from './adminSettingsStore.mjs';
import { getHealthNotificationState, sendAdminNotificationEmail } from './healthNotifications.mjs';
import { getSmtpTransportConfig } from './healthEmailTransport.mjs';

const RETRY_MS = 5 * 60 * 1000;
const DEFAULT_STATE = { deliveries: {} };
export const quotaAlertDelivery = globalThis[Symbol.for('tahaluf.quotaAlertDelivery')] ||= {
  status: 'not-checked', lastCheckedAt: null, lastError: null
};

export function createQuotaAlertDispatcher({ update, notificationSettings, send, smtpReady, now = Date.now, status = quotaAlertDelivery }) {
  const recent = new Map();
  let running = Promise.resolve();
  const dispatch = async alerts => {
    const time = now();
    for (const [key, expiresAt] of recent) if (expiresAt <= time) recent.delete(key);
    const candidates = alerts.filter(alert => !recent.has(alert.key));
    if (!candidates.length) return;
    for (const alert of candidates) recent.set(alert.key, time + RETRY_MS);
    status.lastCheckedAt = new Date(time).toISOString();
    try {
      const { settings } = await notificationSettings();
      if (!settings.emailEnabled || !settings.emailRecipients.length) {
        status.status = settings.emailEnabled ? 'no-recipients' : 'email-disabled';
        status.lastError = null;
        return;
      }
      smtpReady();
      const owner = randomUUID();
      // The claim is persisted before SMTP, and re-evaluated on transaction retries.
      const claimed = await update(state => {
        const next = structuredClone(state);
        next.deliveries ||= {};
        for (const [key, entry] of Object.entries(next.deliveries)) {
          if (Date.parse(entry.updatedAt) < time - 35 * 86400000) delete next.deliveries[key];
        }
        for (const alert of candidates) {
          const previous = next.deliveries[alert.key];
          if (previous?.sentAt || (previous?.retryAt > time)) continue;
          next.deliveries[alert.key] = { owner, retryAt: time + RETRY_MS, updatedAt: new Date(time).toISOString() };
        }
        return next;
      });
      const due = candidates.filter(alert => claimed.deliveries[alert.key]?.owner === owner);
      if (!due.length) {
        status.status = 'already-notified-or-in-flight';
        return;
      }
      const text = [
        'Tahaluf API usage threshold notification',
        ...due.map(alert => alert.message),
        '',
        'Partial application observations and estimates, NOT verified provider quota or billing.',
        'Firestore daily references use UTC days, not the Pacific quota-reset window.',
        'Verify actual usage in the provider console. Monitoring runs with application traffic, not a scheduler.',
        'Open Admin > API & Quotas Hub in the dashboard to review.'
      ].join('\n');
      try {
        await send(settings.emailRecipients, 'Tahaluf: API usage threshold warning', text);
      } catch (error) {
        // Retain the claim until the retry deadline to avoid mail storms on SMTP failure.
        await update(state => {
          const next = structuredClone(state);
          for (const alert of due) {
            if (next.deliveries[alert.key]?.owner === owner) next.deliveries[alert.key].lastError = error.message;
          }
          return next;
        });
        throw error;
      }
      await update(state => {
        const next = structuredClone(state);
        for (const alert of due) {
          if (next.deliveries[alert.key]?.owner === owner) {
            next.deliveries[alert.key].sentAt = new Date(now()).toISOString();
          }
        }
        return next;
      });
      status.status = 'sent';
      status.lastError = null;
    } catch (error) {
      status.status = 'error';
      status.lastError = error.message;
      console.error('[QUOTA ALERT] Notification failed:', error);
    }
  };
  return alerts => {
    const next = running.then(() => dispatch(alerts));
    running = next.catch(error => {
      console.error('[QUOTA ALERT] Dispatcher failed:', error);
    });
    return next;
  };
}

export const dispatchQuotaAlerts = createQuotaAlertDispatcher({
  update: update => updateAdminSetting('quotaAlerts', DEFAULT_STATE, update, { skipUnchanged: true }),
  notificationSettings: getHealthNotificationState,
  send: sendAdminNotificationEmail,
  smtpReady: () => {
    getSmtpTransportConfig();
    if (!process.env.HEALTH_ALERT_FROM) throw new Error('Email notifications require HEALTH_ALERT_FROM to be configured.');
  }
});
