import fs from 'node:fs';
import path from 'node:path';
import { getFirebaseAdmin } from './firebaseAdmin.js';
import {
  DEFAULT_HEALTH_NOTIFICATION_SETTINGS,
  normalizeHealthNotificationSettings,
  recordHealthIssueOpened,
  recordHealthIssueResolved
} from './healthNotificationUtils.mjs';
import { getSmtpTransportConfig } from './healthEmailTransport.mjs';
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

async function getFirestoreDocument() {
  const { adminDb } = getFirebaseAdmin();
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
    const previous = state.activeIssues[issue.key];
    const firstSeenAt = previous?.firstSeenAt || nowIso;
    const next = {
      signature: issue.signature,
      issue,
      firstSeenAt,
      historyId: recordHealthIssueOpened(state, issue, previous, nowIso),
      lastAttemptAt: previous?.signature === issue.signature ? previous.lastAttemptAt : null,
      lastSentAt: previous?.signature === issue.signature ? previous.lastSentAt : null
    };

    const hasExceededDelay = (now - Date.parse(firstSeenAt)) >= delayMs;
    const due = notificationEnabled
      && !next.lastSentAt
      && hasExceededDelay
      && (!next.lastAttemptAt || now - Date.parse(next.lastAttemptAt) >= ALERT_RETRY_MS);

    if (due) next.lastAttemptAt = nowIso;
    state.activeIssues[issue.key] = next;
    store(state);
    return due;
  };

  if (!isPersistentStoreEnabled()) {
    const state = readLocalState();
    return shouldSend(state, writeLocalState);
  }

  const docRef = await getFirestoreDocument();
  return getFirebaseAdmin().adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(docRef);
    const state = { ...getDefaultState(), ...(snapshot.exists ? snapshot.data() : {}) };
    state.activeIssues = state.activeIssues || {};
    const previous = state.activeIssues[issue.key];
    const firstSeenAt = previous?.firstSeenAt || nowIso;
    const next = {
      signature: issue.signature,
      issue,
      firstSeenAt,
      historyId: recordHealthIssueOpened(state, issue, previous, nowIso),
      lastAttemptAt: previous?.signature === issue.signature ? previous.lastAttemptAt : null,
      lastSentAt: previous?.signature === issue.signature ? previous.lastSentAt : null
    };

    const hasExceededDelay = (now - Date.parse(firstSeenAt)) >= delayMs;
    const due = notificationEnabled
      && !next.lastSentAt
      && hasExceededDelay
      && (!next.lastAttemptAt || now - Date.parse(next.lastAttemptAt) >= ALERT_RETRY_MS);

    if (due) next.lastAttemptAt = nowIso;
    state.activeIssues[issue.key] = next;
    transaction.set(docRef, state);
    return due;
  });
}

async function notifyResolvedIssues(resolvedEntries = [], settings) {
  if (!settings.emailEnabled || !settings.sendResolutionEmail || resolvedEntries.length === 0) {
    return;
  }
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tahaluf-dashboard.vercel.app';
  for (const entry of resolvedEntries) {
    // Only send resolution email if an alert email was previously dispatched
    if (!entry.lastSentAt) continue;
    try {
      const { subject, text, html } = formatHealthResolvedEmail(entry.issue, entry.resolvedAt, dashboardUrl);
      await sendEmail(settings.emailRecipients, subject, text, html);
    } catch (err) {
      console.error(`[HEALTH ALERT] Resolution email failed for ${entry.issue?.eventName}:`, err);
    }
  }
}

async function clearResolvedIssues(activeKeys) {
  let resolvedToNotify = [];
  let currentSettings = DEFAULT_HEALTH_NOTIFICATION_SETTINGS;

  const clear = state => {
    state.activeIssues = state.activeIssues || {};
    currentSettings = state.settings || DEFAULT_HEALTH_NOTIFICATION_SETTINGS;
    const nowIso = new Date().toISOString();
    Object.keys(state.activeIssues).forEach(key => {
      if (!activeKeys.has(key)) {
        const item = state.activeIssues[key];
        recordHealthIssueResolved(state, item?.historyId, nowIso);
        if (item?.lastSentAt) {
          resolvedToNotify.push({ ...item, resolvedAt: nowIso });
        }
        delete state.activeIssues[key];
      }
    });
    return state;
  };

  if (!isPersistentStoreEnabled()) {
    if (fs.existsSync(LOCAL_FILE)) {
      const state = clear(readLocalState());
      writeLocalState(state);
    }
  } else {
    const docRef = await getFirestoreDocument();
    await getFirebaseAdmin().adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists && activeKeys.size === 0) return;
      const state = clear({ ...getDefaultState(), ...(snapshot.exists ? snapshot.data() : {}) });
      transaction.set(docRef, state);
    });
  }

  if (resolvedToNotify.length > 0) {
    await notifyResolvedIssues(resolvedToNotify, currentSettings);
  }
}

async function clearResolvedSource(sourceKey) {
  let resolvedToNotify = [];
  let currentSettings = DEFAULT_HEALTH_NOTIFICATION_SETTINGS;

  const clear = state => {
    state.activeIssues = state.activeIssues || {};
    currentSettings = state.settings || DEFAULT_HEALTH_NOTIFICATION_SETTINGS;
    const nowIso = new Date().toISOString();
    const item = state.activeIssues[sourceKey];
    if (item) {
      recordHealthIssueResolved(state, item.historyId, nowIso);
      if (item.lastSentAt) {
        resolvedToNotify.push({ ...item, resolvedAt: nowIso });
      }
      delete state.activeIssues[sourceKey];
    }
    return state;
  };

  if (!isPersistentStoreEnabled()) {
    if (fs.existsSync(LOCAL_FILE)) {
      const state = clear(readLocalState());
      writeLocalState(state);
    }
  } else {
    const docRef = await getFirestoreDocument();
    await getFirebaseAdmin().adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists) return;
      const state = clear({ ...getDefaultState(), ...(snapshot.exists ? snapshot.data() : {}) });
      transaction.set(docRef, state);
    });
  }

  if (resolvedToNotify.length > 0) {
    await notifyResolvedIssues(resolvedToNotify, currentSettings);
  }
}

async function markImmediateAlertSent(issue) {
  const update = state => {
    const current = state.activeIssues?.[issue.key];
    if (current?.signature === issue.signature) {
      current.lastSentAt = new Date().toISOString();
    }
    return state;
  };

  if (!isPersistentStoreEnabled()) {
    writeLocalState(update(readLocalState()));
    return;
  }

  const docRef = await getFirestoreDocument();
  await getFirebaseAdmin().adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(docRef);
    const state = update({ ...getDefaultState(), ...(snapshot.exists ? snapshot.data() : {}) });
    transaction.set(docRef, state);
  });
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
    return await transporter.sendMail({
      from,
      to: recipients,
      subject,
      text,
      ...(html ? { html } : {})
    });
  } finally {
    transporter.close();
  }
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
  const state = await getHealthNotificationState();
  const settings = state.settings;
  if (!issue) {
    await clearResolvedSource(sourceKey);
    return false;
  }
  const issueWithSignature = issue
    ? { ...issue, signature: issue.status }
    : null;

  const shouldSend = issueWithSignature
    ? await claimImmediateAlert(
      issueWithSignature,
      settings.emailEnabled && ['immediate', 'immediate_and_daily'].includes(settings.frequency),
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
    await markImmediateAlertSent(issueWithSignature);
    return true;
  } catch (error) {
    console.error(`[HEALTH ALERT] Email failed for ${issue.eventName} ${issue.kind}:`, error);
    throw error;
  }
}

export async function sendDailyHealthDigest(issues) {
  const state = await getHealthNotificationState();
  const settings = state.settings;
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

async function setLastDigestDate(date) {
  if (!isPersistentStoreEnabled()) {
    const state = readLocalState();
    writeLocalState({ ...state, lastDigestDate: date });
    return;
  }

  const docRef = await getFirestoreDocument();
  await docRef.set({ lastDigestDate: date }, { merge: true });
}
