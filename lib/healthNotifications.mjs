import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  DEFAULT_HEALTH_NOTIFICATION_SETTINGS,
  normalizeHealthNotificationSettings,
  recordHealthIssueOpened,
  recordHealthIssueResolved,
  isHealthIssueEmailEnabled
} from './healthNotificationUtils.mjs';
import { getSmtpTransportConfig } from './healthEmailTransport.mjs';
import { getDimensionSettings } from './dimensionMonitoring.mjs';
import { isHealthCheckEnabled } from './dimensionStandards.mjs';
import {
  formatHealthAlertEmail,
  formatHealthResolvedEmail,
  formatDailyDigestEmail,
  formatTestEmail
} from './healthEmailTemplates.mjs';

const LOCAL_FILE = path.join(process.cwd(), 'config', 'healthNotifications.json');
const FIRESTORE_COLLECTION = 'appConfig';
const FIRESTORE_DOCUMENT = 'healthNotifications';
const ALERT_RETRY_MS = 5 * 60 * 1000;

function isPersistentStoreEnabled() {
  return process.env.VERCEL === '1';
}

function getDefaultState() {
  return {
    settings: DEFAULT_HEALTH_NOTIFICATION_SETTINGS,
    activeIssues: {},
    pendingResolutions: {},
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
  return adminDb.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOCUMENT);
}

export async function getHealthNotificationState() {
  if (!isPersistentStoreEnabled()) return readLocalState();

  const docRef = await getFirestoreDocument();
  const snapshot = await docRef.get();
  const saved = snapshot.exists ? snapshot.data() : getDefaultState();
  return {
    ...getDefaultState(),
    ...saved,
    settings: normalizeHealthNotificationSettings(saved.settings)
  };
}

export async function saveHealthNotificationSettings(settings) {
  const normalized = normalizeHealthNotificationSettings(settings);
  const updatedAt = new Date().toISOString();

  if (!isPersistentStoreEnabled()) {
    const state = readLocalState();
    writeLocalState({ ...state, settings: normalized, updatedAt });
    return normalized;
  }

  const docRef = await getFirestoreDocument();
  await docRef.set({ settings: normalized, updatedAt }, { merge: true });
  return normalized;
}

async function claimImmediateAlert(issue, notificationEnabled, alertDelayMinutes = 5) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const delayMs = Math.max(0, Number(alertDelayMinutes) || 0) * 60 * 1000;

  const shouldSend = (state, store) => {
    const before = structuredClone(state);
    const previous = state.activeIssues[issue.key];
    const firstSeenAt = previous?.firstSeenAt || nowIso;
    const next = {
      signature: issue.signature,
      issue,
      firstSeenAt,
      historyId: recordHealthIssueOpened(state, issue, previous, nowIso),
      lastAttemptAt: previous?.signature === issue.signature ? previous.lastAttemptAt : null,
      notifiedAt: previous?.notifiedAt || previous?.lastSentAt || null,
      lastSentAt: previous?.signature === issue.signature ? previous.lastSentAt : null
    };

    const hasExceededDelay = (now - Date.parse(firstSeenAt)) >= delayMs;
    const due = notificationEnabled
      && !next.lastSentAt
      && hasExceededDelay
      && (!next.lastAttemptAt || now - Date.parse(next.lastAttemptAt) >= ALERT_RETRY_MS);

    if (due) next.lastAttemptAt = nowIso;
    state.activeIssues[issue.key] = next;
    if (!isDeepStrictEqual(before, state)) store(state);
    return due ? { historyId: next.historyId, firstSeenAt } : null;
  };

  if (!isPersistentStoreEnabled()) {
    const state = readLocalState();
    return shouldSend(state, writeLocalState);
  }

  const docRef = await getFirestoreDocument();
  return (await getAdminDb()).runTransaction(async transaction => {
    const snapshot = await transaction.get(docRef);
    const state = { ...getDefaultState(), ...(snapshot.exists ? snapshot.data() : {}) };
    const before = structuredClone(state);
    state.activeIssues = state.activeIssues || {};
    const previous = state.activeIssues[issue.key];
    const firstSeenAt = previous?.firstSeenAt || nowIso;
    const next = {
      signature: issue.signature,
      issue,
      firstSeenAt,
      historyId: recordHealthIssueOpened(state, issue, previous, nowIso),
      lastAttemptAt: previous?.signature === issue.signature ? previous.lastAttemptAt : null,
      notifiedAt: previous?.notifiedAt || previous?.lastSentAt || null,
      lastSentAt: previous?.signature === issue.signature ? previous.lastSentAt : null
    };

    const hasExceededDelay = (now - Date.parse(firstSeenAt)) >= delayMs;
    const due = notificationEnabled
      && !next.lastSentAt
      && hasExceededDelay
      && (!next.lastAttemptAt || now - Date.parse(next.lastAttemptAt) >= ALERT_RETRY_MS);

    if (due) next.lastAttemptAt = nowIso;
    state.activeIssues[issue.key] = next;
    if (!isDeepStrictEqual(before, state)) transaction.set(docRef, state);
    return due ? { historyId: next.historyId, firstSeenAt } : null;
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
    if (!isDeepStrictEqual(before, state)) transaction.set(docRef, state);
    return result;
  });
}

function queueResolution(state, item, resolvedAt) {
  if (!(item.notifiedAt || item.lastSentAt)) return;
  state.pendingResolutions ||= {};
  const id = item.historyId || `${item.issue.key}@${item.firstSeenAt}`;
  state.pendingResolutions[id] ||= { issue: item.issue, resolvedAt, lastAttemptAt: null, lastError: null };
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
        recordHealthIssueResolved(state, item.historyId, nowIso, 'checks-disabled');
        delete state.activeIssues[key];
        continue;
      }
      if (!isResolved(key)) continue;
      recordHealthIssueResolved(state, item.historyId, nowIso);
      queueResolution(state, item, nowIso);
      delete state.activeIssues[key];
    }
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
    if (sendPending && settings.emailEnabled && settings.sendResolutionEmail && settings.emailRecipients.length) {
      for (const [id, entry] of Object.entries(state.pendingResolutions || {})) {
        if (!isHealthIssueEmailEnabled(entry.issue, settings)) continue;
        if (entry.lastAttemptAt && now - Date.parse(entry.lastAttemptAt) < ALERT_RETRY_MS) continue;
        entry.lastAttemptAt = nowIso;
        entries.push({ id, ...entry });
      }
    }
    return { entries, settings };
  });
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tahaluf-dashboard.vercel.app';
  for (const entry of entries) {
    let deliveryError = null;
    try {
      const { subject, text, html } = formatHealthResolvedEmail(entry.issue, entry.resolvedAt, dashboardUrl);
      const result = await sendEmail(settings.emailRecipients, subject, text, html);
      if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept all resolution email recipients.');
    } catch (error) {
      deliveryError = error.message || String(error);
      console.error(`[HEALTH ALERT] Resolution email failed for ${entry.issue?.eventName}:`, error);
    }
    await updateHealthState(state => {
      const pending = state.pendingResolutions?.[entry.id];
      if (!pending || pending.lastAttemptAt !== entry.lastAttemptAt) return;
      const history = state.history?.find(item => item.id === entry.id);
      if (deliveryError) {
        pending.lastError = deliveryError;
        if (history) {
          history.resolutionEmailStatus = 'failed';
          history.resolutionEmailError = deliveryError;
        }
      } else {
        delete state.pendingResolutions[entry.id];
        if (history) {
          history.resolutionEmailStatus = 'accepted';
          history.resolutionEmailSentAt = new Date().toISOString();
          history.resolutionEmailError = null;
        }
      }
    });
  }
}

async function markImmediateAlertSent(issue, claim) {
  const resolvedDuringSend = await updateHealthState(state => {
    const nowIso = new Date().toISOString();
    const current = state.activeIssues?.[issue.key];
    if (current?.firstSeenAt === claim.firstSeenAt) {
      current.notifiedAt = nowIso;
      if (current.signature === issue.signature) current.lastSentAt = nowIso;
    }
    const history = state.history?.find(entry => entry.id === claim.historyId);
    if (history) {
      history.alertEmailSentAt = nowIso;
      if (history.resolution === 'resolved') {
        queueResolution(state, { issue, historyId: claim.historyId, notifiedAt: nowIso }, history.resolvedAt);
        return true;
      }
    }
    return false;
  });
  if (resolvedDuringSend) await resolveHealthIssues(() => false);
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
  let attempted = 0;
  for (const issue of issues) {
    if (await observeHealthSource(issue.key, issue)) attempted += 1;
  }
  await clearResolvedIssues(new Set(issues.map(issue => issue.key)));
  return { attempted };
}

export async function observeHealthSource(sourceKey, issue) {
  if (!issue) {
    await clearResolvedSource(sourceKey);
    return false;
  }
  const { settings } = await getHealthNotificationState();
  return observeIssue(issue, settings);
}

export async function observeHealthSourceIssues(sourceKey, issues) {
  const { settings } = await getHealthNotificationState();
  const results = await Promise.allSettled(issues.map(issue => observeIssue(issue, settings)));
  const keys = new Set(issues.map(issue => issue.key));
  await resolveHealthIssues(key => (key === sourceKey || key === `${sourceKey}:metrics` || key === `${sourceKey}:dimensions`) && !keys.has(key));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}

async function observeIssue(issue, settings) {
  if (!isHealthCheckEnabled(issue, await getDimensionSettings())) return false;
  const issueWithSignature = issue
    ? { ...issue, signature: issue.status }
    : null;

  const shouldSend = issueWithSignature
    ? await claimImmediateAlert(
      issueWithSignature,
      settings.emailEnabled && isHealthIssueEmailEnabled(issueWithSignature, settings) && ['immediate', 'immediate_and_daily'].includes(settings.frequency),
      settings.alertDelayMinutes
    )
    : false;

  if (!shouldSend || !settings.emailEnabled || !['immediate', 'immediate_and_daily'].includes(settings.frequency)) {
    return false;
  }

  try {
    const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tahaluf-dashboard.vercel.app';
    const { subject, text, html } = formatHealthAlertEmail(issueWithSignature, dashboardUrl);
    await sendEmail(settings.emailRecipients, subject, text, html);
    await markImmediateAlertSent(issueWithSignature, shouldSend);
    return true;
  } catch (error) {
    console.error(`[HEALTH ALERT] Email failed for ${issue.eventName} ${issue.kind}:`, error);
    throw error;
  }
}

export async function sendDailyHealthDigest(issues) {
  const state = await getHealthNotificationState();
  const settings = state.settings;
  const checkSettings = await getDimensionSettings();
  issues = issues.filter(issue => isHealthCheckEnabled(issue, checkSettings) && isHealthIssueEmailEnabled(issue, settings));
  if (!settings.emailEnabled || !['daily', 'immediate_and_daily'].includes(settings.frequency)) {
    return { sent: false, reason: 'disabled' };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (state.lastDigestDate === today) return { sent: false, reason: 'already-sent' };
  if (issues.length === 0) {
    await setLastDigestDate(today);
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

async function setLastDigestDate(date) {
  if (!isPersistentStoreEnabled()) {
    const state = readLocalState();
    writeLocalState({ ...state, lastDigestDate: date });
    return;
  }

  const docRef = await getFirestoreDocument();
  await docRef.set({ lastDigestDate: date }, { merge: true });
}
