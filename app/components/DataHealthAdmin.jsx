"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, Bell, Mail, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { DEFAULT_HEALTH_NOTIFICATION_SETTINGS, getHealthIssues } from '../../lib/healthNotificationUtils.mjs';

const getAdminHeaders = async () => {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatTimestamp = (value) => value
  ? new Date(value).toLocaleString()
  : 'Never';

const formatDuration = (from, to) => {
  const minutes = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const getSuggestedFix = (issue = '') => {
  const message = issue.toLowerCase();
  if (message.includes('formula error') || message.includes('#ref!') || message.includes('#value!') || message.includes('#error!')) {
    return 'Repair the spreadsheet formula error, then refresh this sheet.';
  }
  if (message.includes('html') || message.includes('login')) {
    return 'Publish the sheet as CSV and verify its sharing permissions.';
  }
  if (message.includes('http status 404')) {
    return 'Verify the configured sheet GID and confirm the tab still exists.';
  }
  if (message.includes('http status 401') || message.includes('http status 403')) {
    return 'Check that the published sheet is accessible to the dashboard.';
  }
  if (message.includes('cache storage')) {
    return 'Check Firebase Admin credentials and Firestore read/write access.';
  }
  if (message.includes('not configured')) {
    return 'Configure COMBINED_COUNTRY_CSV_URL in the environment settings.';
  }
  if (message.includes('empty') || message.includes('incomplete')) {
    return 'Check that the published tab contains rows, then refresh this sheet.';
  }
  if (!issue) return '';
  return 'Check Google Sheets availability and the configured tab, then refresh this sheet.';
};

const getStatus = (source) => {
  if (source.eventDataStatus === 'missing') return 'missing-data';
  if (source.state === 'stale' || source.state === 'unavailable' || source.state === 'storage-error') {
    return source.state;
  }
  return source.state || 'unknown';
};

const statusPresentation = {
  healthy: { label: 'Healthy', className: 'text-lime-300 border-lime-400/30 bg-lime-500/10' },
  stale: { label: 'Serving saved data', className: 'text-amber-300 border-amber-400/30 bg-amber-500/10' },
  unavailable: { label: 'Unavailable', className: 'text-red-300 border-red-400/30 bg-red-500/10' },
  'storage-error': { label: 'Storage issue', className: 'text-red-300 border-red-400/30 bg-red-500/10' },
  'missing-data': { label: 'No event rows', className: 'text-red-300 border-red-400/30 bg-red-500/10' },
  unknown: { label: 'Not checked', className: 'text-gray-300 border-gray-500/30 bg-gray-500/10' }
};

export default function DataHealthAdmin({
  active = true,
  onIssueCountChange = () => {},
  onDashboardAlertsEnabledChange = () => {}
}) {
  const [sheetHealth, setSheetHealth] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_HEALTH_NOTIFICATION_SETTINGS);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [issueHistory, setIssueHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState('');
  const [notificationMessage, setNotificationMessage] = useState(null);
  const [refreshingSheet, setRefreshingSheet] = useState(null);
  const [refreshProgress, setRefreshProgress] = useState(null);
  const [refreshSummary, setRefreshSummary] = useState(null);
  const [error, setError] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  const reloadHealth = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await fetch('/api/admin/events');
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not load sheet health.');
      }
      const nextHealth = result.sheetHealth || [];
      setSheetHealth(nextHealth);
      onIssueCountChange(getHealthIssues(nextHealth).length);
      setLastCheckedAt(new Date().toISOString());
    } catch (loadError) {
      console.error(loadError);
      if (!silent) setError(loadError.message || 'Could not load sheet health.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onIssueCountChange]);

  const reloadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/health-notifications', { headers: await getAdminHeaders() });
      const result = await response.json();
      if (response.ok && result.success) setIssueHistory(result.history || []);
    } catch (historyError) {
      console.error(historyError);
    }
  }, []);

  useEffect(() => {
    reloadHealth();
    const intervalId = window.setInterval(() => { reloadHealth(true); reloadHistory(); }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [reloadHealth, reloadHistory]);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      setSettingsLoading(true);
      try {
        const response = await fetch('/api/admin/health-notifications', {
          headers: await getAdminHeaders()
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Could not load notification settings.');
        }
        if (!cancelled) {
          setSettings(result.settings);
          setEmailConfigured(result.emailConfigured);
          setIssueHistory(result.history || []);
          onDashboardAlertsEnabledChange(result.settings.dashboardEnabled);
        }
      } catch (settingsError) {
        console.error(settingsError);
        if (!cancelled) setNotificationMessage({ type: 'error', text: settingsError.message });
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };
    loadSettings();
    return () => { cancelled = true; };
  }, [onDashboardAlertsEnabledChange]);

  const eventGroups = useMemo(() => {
    const groups = new Map();
    sheetHealth.forEach(source => {
      if (!groups.has(source.eventId)) {
        groups.set(source.eventId, { eventId: source.eventId, eventName: source.eventName, sources: [] });
      }
      groups.get(source.eventId).sources.push(source);
    });
    return [...groups.values()];
  }, [sheetHealth]);

  const actualSources = sheetHealth.filter(source => source.kind === 'Actuals');
  const healthyCount = actualSources.filter(source =>
    getStatus(source) === 'healthy' && source.eventDataStatus === 'present'
  ).length;
  const issueCount = actualSources.filter(source => ['stale', 'unavailable', 'storage-error', 'missing-data'].includes(getStatus(source))).length;
  const missingDataCount = actualSources.filter(source => source.eventDataStatus === 'missing').length;
  const currentIssues = useMemo(() => getHealthIssues(sheetHealth), [sheetHealth]);

  const refreshAllHealth = async () => {
    if (sheetHealth.length === 0) {
      await reloadHealth();
      return;
    }

    const sources = [...sheetHealth];
    const failures = [];
    setError(null);
    setRefreshSummary(null);
    setRefreshProgress({ completed: 0, total: sources.length });

    for (let offset = 0; offset < sources.length; offset += 3) {
      const batch = sources.slice(offset, offset + 3);
      const results = await Promise.all(batch.map(async source => {
        try {
          const response = await fetch('/api/admin/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'refresh-sheet',
              eventId: source.eventId,
              kind: source.kind
            })
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Refresh failed.');
          }
          return null;
        } catch (refreshError) {
          return `${source.eventName} ${source.kind}: ${refreshError.message}`;
        }
      }));

      failures.push(...results.filter(Boolean));
      setRefreshProgress({ completed: offset + batch.length, total: sources.length });
    }

    await reloadHealth();
    setRefreshProgress(null);
    setRefreshSummary(failures.length
      ? {
          type: 'error',
          text: `Checked ${sources.length} sheet sources. ${failures.length} failed; saved data remains available where a previous snapshot exists. ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '; see source details below.' : ''}`
        }
      : {
          type: 'success',
          text: `Health refresh complete. Checked all ${sources.length} sheet sources against Google Sheets.`
        });
  };

  const refreshSheet = async (source) => {
    const refreshKey = `${source.eventId}:${source.kind}`;
    setRefreshingSheet(refreshKey);
    setError(null);
    setRefreshSummary(null);
    try {
      const response = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh-sheet',
          eventId: source.eventId,
          kind: source.kind
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        if (result.sheetHealth) {
          setSheetHealth(previous => previous.map(item =>
            item.eventId === source.eventId && item.kind === source.kind
              ? result.sheetHealth
              : item
          ));
        }
        throw new Error(result.error || 'Refresh failed; the previous saved snapshot was kept.');
      }
      await reloadHealth();
    } catch (refreshError) {
      console.error(refreshError);
      setError(`${source.eventName} ${source.kind.toLowerCase()} refresh failed: ${refreshError.message}`);
      await reloadHealth();
    } finally {
      setRefreshingSheet(null);
    }
  };

  const addRecipient = () => {
    const email = recipientDraft.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNotificationMessage({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (settings.emailRecipients.includes(email)) {
      setNotificationMessage({ type: 'error', text: 'That recipient is already on the list.' });
      return;
    }
    setSettings(previous => ({ ...previous, emailRecipients: [...previous.emailRecipients, email] }));
    setRecipientDraft('');
    setNotificationMessage(null);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    setNotificationMessage(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action: 'save', settings })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not save notification settings.');
      setSettings(result.settings);
      setEmailConfigured(result.emailConfigured);
      onDashboardAlertsEnabledChange(result.settings.dashboardEnabled);
      setNotificationMessage({ type: 'success', text: 'Notification settings saved.' });
    } catch (saveError) {
      console.error(saveError);
      setNotificationMessage({ type: 'error', text: saveError.message });
    } finally {
      setSavingSettings(false);
    }
  };

  const sendTestEmail = async () => {
    setSendingTestEmail(true);
    setNotificationMessage(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action: 'test-email' })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not send test email.');
      setNotificationMessage({ type: 'success', text: 'Test email sent to the configured recipients.' });
    } catch (testError) {
      console.error(testError);
      setNotificationMessage({ type: 'error', text: testError.message });
    } finally {
      setSendingTestEmail(false);
    }
  };

  return (
    <section className={`space-y-5 ${active ? '' : 'hidden'}`}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-wide uppercase flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#14a6d9]" />
            Data Health Monitor
          </h2>
          <p className="text-[#14a6d9] text-xs font-medium mt-1">
            Checks sheet availability, event-tagged rows, and the date range of actual data.
          </p>
          {lastCheckedAt && (
            <p className="text-[10px] text-gray-500 mt-1">Checked {formatTimestamp(lastCheckedAt)}</p>
          )}
        </div>
        <button
          onClick={refreshAllHealth}
          disabled={loading || Boolean(refreshingSheet) || Boolean(refreshProgress)}
          className="px-3.5 py-2 rounded-xl border border-[#14a6d9]/40 text-[#14a6d9] hover:text-white disabled:opacity-50 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshProgress ? 'animate-spin' : ''}`} />
          {refreshProgress
            ? `Checking ${refreshProgress.completed}/${refreshProgress.total}`
            : 'Refresh all sources'}
        </button>
      </div>

      {refreshProgress && (
        <div className="p-3 bg-[#14a6d9]/10 border border-[#14a6d9]/30 text-[#a6e3f5] rounded-xl text-xs" role="status">
          Fetching the latest data from Google Sheets for {refreshProgress.total} sources. Checked {refreshProgress.completed} of {refreshProgress.total}; this may take a moment.
        </div>
      )}

      {refreshSummary && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            refreshSummary.type === 'error'
              ? 'bg-amber-500/10 border-amber-400/40 text-amber-200'
              : 'bg-lime-500/10 border-lime-400/30 text-lime-200'
          }`}
          role="status"
        >
          {refreshSummary.text}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Events monitored', value: actualSources.length, className: 'text-white' },
          { label: 'Healthy with event data', value: healthyCount, className: 'text-lime-300' },
          { label: 'Issues to review', value: issueCount, className: issueCount ? 'text-amber-300' : 'text-white' },
          { label: 'Missing event rows', value: missingDataCount, className: missingDataCount ? 'text-red-300' : 'text-white' }
        ].map(stat => (
          <div key={stat.label} className="card-surface p-3.5 rounded-2xl border border-white/5">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</div>
            <div className={`text-2xl font-black mt-1 ${stat.className}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {settings.dashboardEnabled && currentIssues.length > 0 && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
            <Bell className="w-4 h-4" />
            {currentIssues.length} active data health issue{currentIssues.length === 1 ? '' : 's'}
          </div>
          <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
            {currentIssues.slice(0, 5).map(issue => (
              <li key={`${issue.key}:${issue.status}`}>{issue.eventName} {issue.kind}: {issue.message}</li>
            ))}
            {currentIssues.length > 5 && <li>And {currentIssues.length - 5} more. See the event checks below.</li>}
          </ul>
        </div>
      )}

      <section className="card-surface rounded-2xl border border-[#14a6d9]/20 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#14a6d9]" />
              Health Notifications
            </h3>
            <p className="text-[10px] text-gray-400 mt-1">
              Choose dashboard alerts and who receives SMTP email notifications.
            </p>
          </div>
          {emailConfigured && (
            <span className="px-2 py-1 rounded-full border border-lime-400/30 bg-lime-500/10 text-lime-300 text-[9px] font-bold uppercase">
              Email provider connected
            </span>
          )}
        </div>

        {!emailConfigured && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-[10px] text-amber-200">
            Email is not configured yet. Add <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, and <code>HEALTH_ALERT_FROM</code> to the local and deployment environment.
          </div>
        )}

        {notificationMessage && (
          <div className={`rounded-xl border p-3 text-xs ${
            notificationMessage.type === 'error'
              ? 'border-red-500/40 bg-red-500/10 text-red-300'
              : 'border-lime-400/30 bg-lime-500/10 text-lime-200'
          }`}>
            {notificationMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/5 bg-[#041628]/40 p-3 text-xs text-gray-200">
            <input
              type="checkbox"
              checked={settings.dashboardEnabled}
              onChange={event => {
                const dashboardEnabled = event.target.checked;
                setSettings(previous => ({ ...previous, dashboardEnabled }));
                onDashboardAlertsEnabledChange(dashboardEnabled);
              }}
              disabled={settingsLoading}
              className="accent-[#cedc28]"
            />
            Show in-dashboard alerts to admins
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/5 bg-[#041628]/40 p-3 text-xs text-gray-200">
            <input
              type="checkbox"
              checked={settings.emailEnabled}
              onChange={event => setSettings(previous => ({ ...previous, emailEnabled: event.target.checked }))}
              disabled={settingsLoading}
              className="accent-[#cedc28]"
            />
            Send email notifications
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="health-email-frequency" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Email frequency
            </label>
            <select
              id="health-email-frequency"
              value={settings.frequency}
              onChange={event => setSettings(previous => ({ ...previous, frequency: event.target.value }))}
              disabled={settingsLoading || !settings.emailEnabled}
              className="w-full rounded-xl border border-white/10 bg-[#041628] px-3 py-2 text-xs text-white"
            >
              <option value="immediate">Immediate when detected</option>
              <option value="daily">Daily digest</option>
              <option value="immediate_and_daily">Immediate + daily digest</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email recipients</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={recipientDraft}
                onChange={event => setRecipientDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addRecipient();
                  }
                }}
                placeholder="admin@example.com"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#041628] px-3 py-2 text-xs text-white placeholder:text-gray-600"
              />
              <button
                onClick={addRecipient}
                className="rounded-xl border border-[#14a6d9]/40 px-3 text-[#14a6d9] hover:text-white"
                aria-label="Add email recipient"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.emailRecipients.map(email => (
                <span key={email} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-gray-200">
                  {email}
                  <button
                    onClick={() => setSettings(previous => ({
                      ...previous,
                      emailRecipients: previous.emailRecipients.filter(recipient => recipient !== email)
                    }))}
                    aria-label={`Remove ${email}`}
                    className="text-gray-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {settings.emailRecipients.length === 0 && (
                <span className="text-[10px] text-gray-500">No email recipients selected.</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
          <button
            onClick={saveSettings}
            disabled={settingsLoading || savingSettings}
            className="rounded-xl bg-[#14a6d9]/15 border border-[#14a6d9]/40 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-[#14a6d9] hover:text-white disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-3.5 h-3.5" />
            {savingSettings ? 'Saving...' : 'Save notification settings'}
          </button>
          <button
            onClick={sendTestEmail}
            disabled={!emailConfigured || settingsLoading || sendingTestEmail || settings.emailRecipients.length === 0}
            className="rounded-xl border border-white/10 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-300 hover:text-white disabled:opacity-40 flex items-center gap-2"
          >
            <Mail className="w-3.5 h-3.5" />
            {sendingTestEmail ? 'Sending...' : 'Send test email'}
          </button>
          <p className="basis-full text-[10px] text-gray-500">
            The dashboard checks for issues while sheet data is requested. A scheduled full check and digest run daily; on Vercel Hobby, timing may vary by up to about an hour.
          </p>
        </div>
      </section>

      <div className="card-surface rounded-2xl border border-[#14a6d9]/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest">Issue History</h3>
          <p className="text-[10px] text-gray-400 mt-1">
            When each issue was detected and when it was resolved. Recorded from now on; the latest 200 are kept.
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-700/30">
          {issueHistory.map(item => (
            <div key={item.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-bold text-white">{item.eventName} <span className="font-medium text-gray-400">— {item.kind} — {item.status}</span></p>
                <p className="text-[11px] text-gray-400">{item.message}</p>
                <p className="text-[10px] text-gray-500">
                  Detected {formatTimestamp(item.openedAt)}
                  {item.resolvedAt && ` · Resolved ${formatTimestamp(item.resolvedAt)} (after ${formatDuration(item.openedAt, item.resolvedAt)})`}
                </p>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${item.resolvedAt ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10' : 'text-rose-300 border-rose-400/30 bg-rose-500/10'}`}>
                {item.resolvedAt ? 'Resolved' : 'Open'}
              </span>
            </div>
          ))}
          {issueHistory.length === 0 && (
            <div className="p-5 text-center text-xs text-gray-400">No issues have been recorded yet.</div>
          )}
        </div>
      </div>

      <div className="card-surface rounded-2xl border border-[#14a6d9]/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest">Event Data Checks</h3>
          <p className="text-[10px] text-gray-400 mt-1">
            Actuals health verifies matching event-name rows. Date coverage is based on those matching rows.
          </p>
        </div>
        <div className="divide-y divide-gray-700/30">
          {eventGroups.map(event => (
            <article key={event.eventId} className="p-4 space-y-3">
              <h4 className="text-sm font-bold text-white">{event.eventName}</h4>
              {event.sources.map(source => {
                const status = getStatus(source);
                const presentation = statusPresentation[status] || statusPresentation.unknown;
                const isRefreshing = refreshingSheet === `${source.eventId}:${source.kind}`;
                return (
                  <div key={`${source.eventId}:${source.kind}`} className="rounded-xl border border-white/5 bg-[#041628]/50 p-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-xs font-bold text-gray-200">{source.kind}</span>
                          <span className="text-[10px] font-mono text-gray-500">{source.gid ? `GID ${source.gid}` : 'Root sheet'}</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase ${presentation.className}`}>
                            {presentation.label}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400">
                          Last successful fetch: <span className="text-gray-200">{formatTimestamp(source.lastSuccessAt)}</span>
                          {source.lastFailureAt && <> · Last failure: <span className="text-amber-200">{formatTimestamp(source.lastFailureAt)}</span></>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400">
                          <span>Rows in sheet: <strong className="text-gray-200">{(source.totalRows ?? source.rowCount ?? 0).toLocaleString()}</strong></span>
                          {source.kind === 'Actuals' && (
                            <span>Matching event rows: <strong className={source.eventDataStatus === 'present' ? 'text-lime-300' : source.eventDataStatus === 'missing' ? 'text-red-300' : 'text-amber-300'}>{(source.eventRows || 0).toLocaleString()}</strong></span>
                          )}
                          <span>
                            Data date range: <strong className="text-gray-200">
                              {source.firstDataDate || source.lastDataDate
                                ? `${source.firstDataDate || 'Unknown'} – ${source.lastDataDate || 'Unknown'}`
                                : 'No dated rows'}
                            </strong>
                          </span>
                          {source.kind === 'Actuals' && source.eventDataStatus === 'unverified' && (
                            <span className="text-amber-300">This sheet has no event-name column; event-specific data could not be verified.</span>
                          )}
                        </div>
                        {source.lastError && (
                          <div className="text-[10px] pt-1">
                            <div className="text-red-300">{source.lastError}</div>
                            <div className="text-[#14a6d9] mt-0.5">Suggested fix: {getSuggestedFix(source.lastError)}</div>
                          </div>
                        )}
                        {source.kind === 'Actuals' && source.eventDataStatus === 'missing' && (
                          <div className="text-[10px] text-[#14a6d9]">
                            Suggested fix: Check that this tab contains rows tagged with this event name and that its GID is correct.
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => refreshSheet(source)}
                        disabled={Boolean(refreshingSheet)}
                        className="shrink-0 px-3 py-2 rounded-lg border border-[#14a6d9]/40 text-[#14a6d9] hover:text-white disabled:opacity-50 text-[10px] font-bold flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                        {isRefreshing ? 'Checking...' : 'Refresh sheet'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </article>
          ))}
          {!loading && eventGroups.length === 0 && (
            <div className="p-6 text-center text-xs text-gray-400">No configured event sheets are available to monitor.</div>
          )}
        </div>
      </div>
    </section>
  );
}
