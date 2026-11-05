import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  DEFAULT_HEALTH_NOTIFICATION_SETTINGS,
  mergeHealthIssues,
  normalizeHealthNotificationSettings,
  recordHealthIssueOpened,
  recordHealthIssueResolved,
  isHealthIssueEmailEnabled
} from './healthNotificationUtils.mjs';
import { getSmtpTransportConfig } from './healthEmailTransport.mjs';
import { getDimensionSettings } from './dimensionMonitoring.mjs';
import { isHealthCheckEnabled, isIssueIgnored } from './dimensionStandards.mjs';
import {
  formatHealthAlertBatchEmail,
  formatHealthResolvedBatchEmail,
  formatDailyDigestEmail,
  formatTestEmail
} from './healthEmailTemplates.mjs';
import { getCollectionName } from './firestoreCollections.mjs';

const LOCAL_FILE = path.join(process.cwd(), 'config', 'healthNotifications.json');
const getFirestoreCollection = () => getCollectionName('appConfig');
const FIRESTORE_DOCUMENT = 'healthNotifications';
const ALERT_RETRY_MS = 5 * 60 * 1000;
const NOTIFICATION_TIME_ZONE = 'Asia/Dubai';

function getBatchWindowMs(settings) {
  return Math.max(0, Number(settings.notificationBatchWindowMinutes) || 0) * 60 * 1000;
}

function getNotificationDate(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NOTIFICATION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(timestamp);
  const dateParts = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function hasFirebaseAdminCredentials() {
  return Boolean(
    (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

function isFirestoreQuotaBreakerTripped() {
  const until = globalThis[Symbol.for('tahaluf.firestoreQuotaBreaker')] || 0;
  return Date.now() < until;
}

function tripFirestoreQuotaBreaker(durationMs = 5 * 60 * 1000) {
  globalThis[Symbol.for('tahaluf.firestoreQuotaBreaker')] = Date.now() + durationMs;
}

function isPersistentStoreEnabled() {
  if (isFirestoreQuotaBreakerTripped()) return false;
  if (process.env.VERCEL === '1') return true;
  if (process.env.NODE_ENV === 'test') return false;
  return hasFirebaseAdminCredentials();
}

function getDefaultState() {
  return {
    settings: DEFAULT_HEALTH_NOTIFICATION_SETTINGS,
    activeIssues: {},
    pendingAlerts: {},
    pendingResolutions: {},
    pendingAlertBatchAt: null,
    pendingResolutionBatchAt: null,
    history: [],
    lastDigestDate: null
  };
}

function readLocalState() {
  if (!fs.existsSync(LOCAL_FILE)) return getDefaultState();
  const saved = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  return {
    ...getDefaultState(),
    ...saved,
    settings: normalizeHealthNotificationSettings(saved.settings)
  };
}

function writeLocalState(state) {
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function getAdminDb() {
  const { getFirebaseAdmin } = await import('./firebaseAdmin.js');
  return getFirebaseAdmin().adminDb;
}

async function getFirestoreDocument() {
  const adminDb = await getAdminDb();
  return adminDb.collection(getFirestoreCollection()).doc(FIRESTORE_DOCUMENT);
}

export async function getHealthNotificationState() {
  if (!isPersistentStoreEnabled()) return readLocalState();

  try {
    const docRef = await getFirestoreDocument();
    const snapshot = await docRef.get();
    const saved = snapshot.exists ? snapshot.data() : getDefaultState();
    return {
      ...getDefaultState(),
      ...saved,
      settings: normalizeHealthNotificationSettings(saved.settings)
    };
  } catch (error) {
    if (error?.code === 8 || error?.details?.includes('Quota exceeded')) {
      console.warn('[HEALTH NOTIFICATIONS] Firestore quota exceeded, falling back to local state');
      return readLocalState();
    }
    throw error;
  }
}

export async function saveHealthNotificationSettings(settings) {
  const normalized = normalizeHealthNotificationSettings(settings);
  const updatedAt = new Date().toISOString();

  if (!isPersistentStoreEnabled()) {
    const state = readLocalState();
    writeLocalState({ ...state, settings: normalized, updatedAt });
    return normalized;
  }

  try {
    const docRef = await getFirestoreDocument();
    await docRef.set({ settings: normalized, updatedAt }, { merge: true });
  } catch (error) {
    if (error?.code === 8 || error?.details?.includes('Quota exceeded')) {
      console.warn('[HEALTH NOTIFICATIONS] Firestore quota exceeded on save, falling back to local state');
    } else {
      throw error;
    }
  }

  try {
    const state = readLocalState();
    writeLocalState({ ...state, settings: normalized, updatedAt });
  } catch {}
  return normalized;
}

async function claimImmediateAlert(issue, notificationEnabled, alertDelayMinutes = 5, maxAlertsPerIssuePerDay = 1) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const notificationDate = getNotificationDate(now);
  const dailyLimit = Number(maxAlertsPerIssuePerDay) || 1;
  const delayMs = Math.max(0, Number(alertDelayMinutes) || 0) * 60 * 1000;

  const queue = (state, store) => {
    const before = structuredClone(state);
    state.pendingAlerts ||= {};
    const previous = state.activeIssues[issue.key];
    const firstSeenAt = previous?.firstSeenAt || nowIso;
    const dailyAlertCount = previous?.dailyAlertDate === notificationDate ? (previous.dailyAlertCount || 0) : 0;
    const next = {
      signature: issue.signature,
      issue,
      firstSeenAt,
      historyId: recordHealthIssueOpened(state, issue, previous, nowIso),
      notifiedAt: previous?.notifiedAt || previous?.lastSentAt || null,
      lastSentAt: previous?.signature === issue.signature ? previous.lastSentAt : null,
      dailyAlertDate: notificationDate,
      dailyAlertCount
    };

    const hasExceededDelay = (now - Date.parse(firstSeenAt)) >= delayMs;
    const alreadyPending = Boolean(state.pendingAlerts[issue.key]);
    const retryReady = !next.lastSentAt || now - Date.parse(next.lastSentAt) >= ALERT_RETRY_MS;
    const shouldQueue = notificationEnabled
      && !alreadyPending
      && dailyAlertCount < dailyLimit
      && retryReady
      && hasExceededDelay;

    state.activeIssues[issue.key] = next;
    if (shouldQueue) {
      state.pendingAlerts[issue.key] = {
        issue,
        historyId: next.historyId,
        firstSeenAt,
        queuedAt: nowIso,
        lastAttemptAt: null,
        lastError: null
      };
      state.pendingAlertBatchAt = nowIso;
    } else if (alreadyPending) {
      state.pendingAlerts[issue.key].issue = issue;
      state.pendingAlerts[issue.key].historyId = next.historyId;
      state.pendingAlerts[issue.key].firstSeenAt = firstSeenAt;
    }
    if (!isDeepStrictEqual(before, state)) store(state);
    return shouldQueue;
  };

  if (!isPersistentStoreEnabled()) {
    const state = readLocalState();
    return queue(state, writeLocalState);
  }

  const docRef = await getFirestoreDocument();
  return (await getAdminDb()).runTransaction(async transaction => {
    const snapshot = await transaction.get(docRef);
    const state = { ...getDefaultState(), ...(snapshot.exists ? snapshot.data() : {}) };
    state.activeIssues = state.activeIssues || {};
    return queue(state, next => transaction.set(docRef, next));
  });
}

async function updateHealthState(update) {
  if (!isPersistentStoreEnabled()) {
    const state = readLocalState();
    const before = structuredClone(state);
    const result = update(state);
    if (!isDeepStrictEqual(before, state)) writeLocalState(state);
    return result;
  }
  const docRef = await getFirestoreDocument();
  return (await getAdminDb()).runTransaction(async transaction => {
    const snapshot = await transaction.get(docRef);
    const state = { ...getDefaultState(), ...(snapshot.exists ? snapshot.data() : {}) };
    const before = structuredClone(state);
    const result = update(state);
    if (!isDeepStrictEqual(before, state)) {
      transaction.set(docRef, state);
      try { writeLocalState(state); } catch {}
    }
    return result;
  });
}

function queueResolution(state, item, resolvedAt) {
  if (!(item.notifiedAt || item.lastSentAt)) return;
  state.pendingResolutions ||= {};
  const id = item.historyId || `${item.issue.key}@${item.firstSeenAt}`;
  if (!state.pendingResolutions[id]) {
    state.pendingResolutions[id] = { issue: item.issue, resolvedAt, queuedAt: new Date().toISOString(), lastAttemptAt: null, lastError: null };
    state.pendingResolutionBatchAt = state.pendingResolutions[id].queuedAt;
  }
  const history = state.history?.find(entry => entry.id === id);
  if (history) history.resolutionEmailStatus = 'pending';
}

async function clearResolvedIssues(activeKeys) {
  await resolveHealthIssues(key => !activeKeys.has(key));
}

async function clearResolvedSource(sourceKey) {
  await resolveHealthIssues(key => key === sourceKey);
}

async function resolveHealthIssues(isResolved, sendPending = true) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const checkSettings = await getDimensionSettings();
  const { entries, settings } = await updateHealthState(state => {
    for (const [key, item] of Object.entries(state.activeIssues || {})) {
      if (!isHealthCheckEnabled(item.issue, checkSettings)) {
        const resolution = isIssueIgnored(item.issue, checkSettings) ? 'ignored' : 'checks-disabled';
        recordHealthIssueResolved(state, item.historyId, nowIso, resolution);
        delete state.pendingAlerts?.[key];
        delete state.activeIssues[key];
        continue;
      }
      if (!isResolved(key)) continue;
      recordHealthIssueResolved(state, item.historyId, nowIso);
      queueResolution(state, item, nowIso);
      delete state.pendingAlerts?.[key];
      delete state.activeIssues[key];
    }
    if (!Object.keys(state.pendingAlerts || {}).length) state.pendingAlertBatchAt = null;
    const settings = normalizeHealthNotificationSettings(state.settings);
    const entries = [];
    for (const [id, entry] of Object.entries(state.pendingResolutions || {})) {
      if (isHealthCheckEnabled(entry.issue, checkSettings)) continue;
      const history = state.history?.find(item => item.id === id);
      if (history) {
        history.resolutionEmailStatus = 'checks-disabled';
        history.resolutionEmailError = null;
      }
      delete state.pendingResolutions[id];
    }
    const pending = state.pendingResolutions || {};
    const resolutionBatchAt = Date.parse(state.pendingResolutionBatchAt || Object.values(pending).at(-1)?.queuedAt || 0);
    const batchReady = now - resolutionBatchAt >= getBatchWindowMs(settings);
    if (sendPending && batchReady && settings.emailEnabled && settings.sendResolutionEmail && settings.emailRecipients.length) {
      for (const [id, entry] of Object.entries(pending)) {
        if (!isHealthIssueEmailEnabled(entry.issue, settings)) continue;
        if (entry.lastAttemptAt && now - Date.parse(entry.lastAttemptAt) < ALERT_RETRY_MS) continue;
        entry.lastAttemptAt = nowIso;
        entries.push({ id, ...entry });
      }
    }
    if (!Object.keys(pending).length) state.pendingResolutionBatchAt = null;
    return { entries, settings };
  });
  if (!entries.length) return;

  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  const uniqueEntries = mergeHealthIssues([], entries.map(entry => ({
    ...entry.issue,
    observedAt: entry.resolvedAt,
    notificationEntryId: entry.id
  }))).map(issue => entriesById.get(issue.notificationEntryId));
  let deliveryError = null;
  try {
    const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tahaluf-dashboard.vercel.app';
    const { subject, text, html } = formatHealthResolvedBatchEmail(uniqueEntries, dashboardUrl);
    const result = await sendEmail(settings.emailRecipients, subject, text, html);
    if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept all resolution email recipients.');
    if (settings.webhookEnabled && settings.webhookUrl) {
      for (const entry of uniqueEntries) sendWebhookNotification(entry.issue, 'resolved', settings).catch(() => {});
    }
  } catch (error) {
    deliveryError = error.message || String(error);
    console.error(`[HEALTH ALERT] Resolution email failed for ${entries.length} issue(s):`, error);
  }
  await updateHealthState(state => {
    const sentAt = new Date().toISOString();
    for (const entry of entries) {
      const pendingEntry = state.pendingResolutions?.[entry.id];
      if (!pendingEntry || pendingEntry.lastAttemptAt !== entry.lastAttemptAt) continue;
      const history = state.history?.find(item => item.id === entry.id);
      if (deliveryError) {
        pendingEntry.lastError = deliveryError;
        if (history) {
          history.resolutionEmailStatus = 'failed';
          history.resolutionEmailError = deliveryError;
        }
      } else {
        delete state.pendingResolutions[entry.id];
        if (history) {
          history.resolutionEmailStatus = 'accepted';
          history.resolutionEmailSentAt = sentAt;
          history.resolutionEmailError = null;
        }
      }
    }
    if (!Object.keys(state.pendingResolutions || {}).length) state.pendingResolutionBatchAt = null;
  });
}

async function markImmediateAlertsSent(claims) {
  const resolvedDuringSend = await updateHealthState(state => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    let hasResolved = false;
    for (const claim of claims) {
      const { issue, historyId, firstSeenAt } = claim;
      const current = state.activeIssues?.[issue.key];
      if (current?.firstSeenAt === firstSeenAt) {
        current.notifiedAt = nowIso;
        if (current.signature === issue.signature) current.lastSentAt = nowIso;
        const notificationDate = getNotificationDate(now);
        current.dailyAlertCount = current.dailyAlertDate === notificationDate ? (current.dailyAlertCount || 0) + 1 : 1;
        current.dailyAlertDate = notificationDate;
      }
      if (state.pendingAlerts?.[issue.key]?.firstSeenAt === firstSeenAt &&
        state.pendingAlerts[issue.key]?.historyId === historyId) {
        delete state.pendingAlerts[issue.key];
      }
      const history = state.history?.find(entry => entry.id === historyId);
      if (history) {
        history.alertEmailSentAt = nowIso;
        if (history.resolution === 'resolved') {
          queueResolution(state, { issue, historyId, notifiedAt: nowIso }, history.resolvedAt);
          hasResolved = true;
        }
      }
    }
    if (!Object.keys(state.pendingAlerts || {}).length) state.pendingAlertBatchAt = null;
    return hasResolved;
  });
  if (resolvedDuringSend) await resolveHealthIssues(() => false);
}

async function flushPendingAlerts() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const claims = await updateHealthState(state => {
    const settings = normalizeHealthNotificationSettings(state.settings);
    state.pendingAlerts ||= {};
    const entries = Object.entries(state.pendingAlerts);
    const notificationDate = getNotificationDate(now);
    const dailyLimit = settings.maxAlertsPerIssuePerDay;
    for (const [key, pending] of entries) {
      const active = state.activeIssues?.[key];
      if (!active || active.firstSeenAt !== pending.firstSeenAt) {
        delete state.pendingAlerts[key];
      } else if (active.dailyAlertDate === notificationDate && (active.dailyAlertCount || 0) >= dailyLimit) {
        delete state.pendingAlerts[key];
      } else if (!settings.emailEnabled || !['immediate', 'immediate_and_daily'].includes(settings.frequency) ||
        !settings.emailRecipients.length || !isHealthIssueEmailEnabled(pending.issue, settings)) {
        delete state.pendingAlerts[key];
      }
    }
    const pending = Object.values(state.pendingAlerts);
    if (!pending.length) {
      state.pendingAlertBatchAt = null;
      return [];
    }
    const batchAt = Date.parse(state.pendingAlertBatchAt || pending.at(-1)?.queuedAt || 0);
    if (now - batchAt < getBatchWindowMs(settings)) return [];

    const ready = [];
    for (const [key, entry] of Object.entries(state.pendingAlerts)) {
      if (entry.lastAttemptAt && now - Date.parse(entry.lastAttemptAt) < ALERT_RETRY_MS) continue;
      const active = state.activeIssues?.[key];
      if (!active || active.firstSeenAt !== entry.firstSeenAt) continue;
      entry.lastAttemptAt = nowIso;
      ready.push({ key, issue: entry.issue, historyId: entry.historyId, firstSeenAt: entry.firstSeenAt, lastAttemptAt: nowIso });
    }
    return ready;
  });
  if (!claims.length) return 0;

  const uniqueIssues = mergeHealthIssues(claims.map(claim => claim.issue));
  let deliveryError = null;
  try {
    const settings = (await getHealthNotificationState()).settings;
    const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tahaluf-dashboard.vercel.app';
    const { subject, text, html } = formatHealthAlertBatchEmail(uniqueIssues, dashboardUrl);
    const result = await sendEmail(settings.emailRecipients, subject, text, html);
    if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept all health notification recipients.');
    if (settings.webhookEnabled && settings.webhookUrl) {
      for (const issue of uniqueIssues) sendWebhookNotification(issue, 'alert', settings).catch(() => {});
    }
    await markImmediateAlertsSent(claims);
  } catch (error) {
    deliveryError = error.message || String(error);
    console.error(`[HEALTH ALERT] Email failed for ${claims.length} issue(s):`, error);
  }
  if (deliveryError) {
    await updateHealthState(state => {
      for (const claim of claims) {
        const pending = state.pendingAlerts?.[claim.key];
        if (pending?.lastAttemptAt === claim.lastAttemptAt) pending.lastError = deliveryError;
      }
    });
    throw new Error(deliveryError);
  }
  return claims.length;
}

async function sendEmail(recipients, subject, text, html) {
  const from = process.env.HEALTH_ALERT_FROM;
  if (!from) throw new Error('Email notifications require HEALTH_ALERT_FROM to be configured.');
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    ...getSmtpTransportConfig(),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });

  try {
    const result = await transporter.sendMail({
      from,
      to: recipients,
      subject,
      text,
      ...(html ? { html } : {})
    });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept all health notification recipients.');
    const { observeApiUsage } = await import('./apiUsage.mjs');
    await observeApiUsage('smtp', result.accepted?.length || 0, 'recipients');
    return result;
  } finally {
    transporter.close();
  }
}

export async function sendWebhookNotification(issue, eventType = 'alert', settings = null) {
  const currentSettings = settings || (await getHealthNotificationState()).settings;
  if (!currentSettings.webhookEnabled || !currentSettings.webhookUrl) return false;

  const url = currentSettings.webhookUrl;
  const platform = currentSettings.webhookPlatform || 'slack';
  let payload = {};

  const isAlert = eventType === 'alert';
  const title = isAlert
    ? `🚨 Tahaluf Health Alert: ${issue.eventName}`
    : `✅ Tahaluf Health Resolved: ${issue.eventName}`;
  const details = issue.message || `Category: ${issue.category || 'feed'} | Status: ${issue.status}`;

  if (platform === 'slack') {
    payload = {
      text: `${title}\n${details}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: title, emoji: true }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Event:*\n${issue.eventName}` },
            { type: "mrkdwn", text: `*Category:*\n${issue.category || 'feed'}` },
            { type: "mrkdwn", text: `*Status:*\n${issue.status}` },
            { type: "mrkdwn", text: `*Detected:*\n${new Date().toLocaleTimeString()}` }
          ]
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Details:*\n${details}` }
        }
      ]
    };
  } else if (platform === 'teams') {
    payload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: isAlert ? "E11D48" : "10B981",
      summary: title,
      sections: [{
        activityTitle: title,
        activitySubtitle: `Category: ${issue.category || 'feed'} • Status: ${issue.status}`,
        text: details
      }]
    };
  } else {
    payload = {
      eventType,
      timestamp: new Date().toISOString(),
      issue
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000)
    });
    return res.ok;
  } catch (err) {
    console.warn('[HEALTH WEBHOOK] Webhook delivery failed:', err?.message || err);
    return false;
  }
}

export async function sendTestWebhook(webhookUrl, platform = 'slack') {
  if (!webhookUrl) throw new Error('A webhook URL is required.');
  return sendWebhookNotification({
    eventName: 'Test Connection (Tahaluf)',
    category: 'system',
    status: 'webhook-verified',
    message: 'Webhook integration successfully established and verified.'
  }, 'alert', {
    webhookEnabled: true,
    webhookUrl,
    webhookPlatform: platform
  });
}

export async function sendAdminNotificationEmail(recipients, subject, text) {
  const result = await sendEmail(recipients, subject, text);
  if (!result.accepted?.length || result.rejected?.length) {
    throw new Error('The SMTP server did not accept all quota notification recipients.');
  }
  return result;
}

export async function sendTestHealthEmail(recipient) {
  const state = await getHealthNotificationState();
  const recipients = recipient
    ? normalizeHealthNotificationSettings({ emailRecipients: [recipient] }).emailRecipients
    : state.settings.emailRecipients;
  if (recipients.length === 0) throw new Error('Add at least one email recipient before sending a test.');

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tahaluf-dashboard.vercel.app';
  const { subject, text, html } = formatTestEmail(dashboardUrl);
  return sendEmail(recipients, subject, text, html);
}

export async function observeHealthIssues(issues) {
  let queued = 0;
  issues = mergeHealthIssues(issues);
  const { settings } = await getHealthNotificationState();
  for (const issue of issues) {
    if (await observeIssue(issue, settings)) queued += 1;
  }
  await clearResolvedIssues(new Set(issues.map(issue => issue.key)));
  await flushPendingAlerts();
  return { attempted: queued };
}

export async function observeHealthSource(sourceKey, issue) {
  if (!issue) {
    await clearResolvedSource(sourceKey);
    return false;
  }
  const { settings } = await getHealthNotificationState();
  const queued = await observeIssue(issue, settings);
  await resolveHealthIssues(() => false);
  await flushPendingAlerts();
  return queued;
}

export async function observeHealthSourceIssues(sourceKey, issues) {
  issues = mergeHealthIssues(issues);
  const { settings } = await getHealthNotificationState();
  const results = await Promise.allSettled(issues.map(issue => observeIssue(issue, settings)));
  const keys = new Set(issues.map(issue => issue.key));
  await resolveHealthIssues(key => (key === sourceKey || key === `${sourceKey}:metrics` || key === `${sourceKey}:dimensions` || key.startsWith(`${sourceKey}:activity:`)) && !keys.has(key));
  await flushPendingAlerts();
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}

async function observeIssue(issue, settings) {
  if (!isHealthCheckEnabled(issue, await getDimensionSettings())) return false;
  const issueWithSignature = issue
    ? { ...issue, signature: issue.status }
    : null;

  const shouldQueue = issueWithSignature
    ? await claimImmediateAlert(
      issueWithSignature,
      settings.emailEnabled && isHealthIssueEmailEnabled(issueWithSignature, settings) && ['immediate', 'immediate_and_daily'].includes(settings.frequency),
      settings.alertDelayMinutes,
      settings.maxAlertsPerIssuePerDay
    )
    : false;
  return shouldQueue;
}

export async function sendDailyHealthDigest(issues) {
  issues = mergeHealthIssues(issues);
  const state = await getHealthNotificationState();
  const settings = state.settings;
  const checkSettings = await getDimensionSettings();
  issues = issues.filter(issue => isHealthCheckEnabled(issue, checkSettings) && isHealthIssueEmailEnabled(issue, settings));
  if (!settings.emailEnabled || !['daily', 'immediate_and_daily'].includes(settings.frequency)) {
    return { sent: false, reason: 'disabled' };
  }

  const today = getNotificationDate();
  if (state.lastDigestDate === today) return { sent: false, reason: 'already-sent' };
  if (issues.length === 0) {
    return { sent: false, reason: 'no-active-issues' };
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tahaluf-dashboard.vercel.app';
  const { subject, text, html } = formatDailyDigestEmail(issues, dashboardUrl);
  await sendEmail(settings.emailRecipients, subject, text, html);
  await setLastDigestDate(today);
  return { sent: true, issueCount: issues.length };
}

export async function reconcileDisabledHealthChecks() {
  await resolveHealthIssues(() => false, false);
}

export async function markIssueIgnoredInHistory({
  issueKey,
  eventId = null,
  eventName = null,
  kind = 'Actuals',
  status = 'ignored',
  message = '',
  category = 'feed',
  dimensionFindings = null,
  author = 'Admin',
  reason = 'Ignored by administrator'
}) {
  const nowIso = new Date().toISOString();
  const cleanAuthor = String(author || 'Admin').trim();
  const cleanReason = String(reason || 'Ignored by administrator').trim();

  return updateHealthState(state => {
    state.history = Array.isArray(state.history) ? state.history : [];
    const matchesIssue = (key, issue) => {
      if (key === issueKey) return true;
      const relatedKey = key?.startsWith(`${issueKey}:`) || issueKey.startsWith(`${key}:`);
      const matchingType = (!category || issue?.category === category) &&
        (!status || issue?.status === status);
      return (relatedKey && matchingType) ||
        Boolean(eventId && issue?.eventId === eventId && matchingType);
    };
    if (state.activeIssues) {
      for (const [k, v] of Object.entries(state.activeIssues)) {
        if (matchesIssue(k, v.issue)) {
          delete state.activeIssues[k];
        }
      }
    }
    if (state.pendingResolutions) {
      for (const [k, v] of Object.entries(state.pendingResolutions)) {
        if (matchesIssue(k, v.issue)) {
          delete state.pendingResolutions[k];
        }
      }
    }

    let found = false;
    for (const entry of state.history) {
      const match = matchesIssue(entry.key, entry);

      if (match && !entry.resolvedAt) {
        entry.resolvedAt = nowIso;
        entry.resolution = 'ignored';
        entry.resolvedBy = cleanAuthor;
        entry.notes = cleanReason;
        entry.resolutionEmailStatus = 'checks-disabled';
        found = true;
      }
    }
    if (!found) {
      state.history.push({
        id: `${issueKey}@${nowIso}`,
        key: issueKey,
        eventId: eventId || null,
        eventName: eventName || issueKey,
        kind: kind || 'Actuals',
        status: status || 'ignored',
        message: message || cleanReason,
        category: category || 'feed',
        ...(dimensionFindings ? { dimensionFindings } : {}),
        openedAt: nowIso,
        resolvedAt: nowIso,
        resolution: 'ignored',
        resolvedBy: cleanAuthor,
        notes: cleanReason
      });
      if (state.history.length > 200) {
        state.history = state.history.slice(-200);
      }
    }
    return state;
  });
}

export async function markIssueUnignoredInHistory({ issueKey, author = 'Admin' }) {
  const nowIso = new Date().toISOString();
  return updateHealthState(state => {
    state.history = Array.isArray(state.history) ? state.history : [];
    for (const entry of state.history) {
      if (entry.key === issueKey && entry.resolution === 'ignored') {
        entry.resolvedAt = null;
        entry.resolution = null;
        entry.notes = `Restored by ${author} on ${nowIso}`;
      }
    }
    return state;
  });
}

async function setLastDigestDate(date) {
  if (!isPersistentStoreEnabled()) {
    const state = readLocalState();
    writeLocalState({ ...state, lastDigestDate: date });
    return;
  }

  const docRef = await getFirestoreDocument();
  await docRef.set({ lastDigestDate: date }, { merge: true });
}
