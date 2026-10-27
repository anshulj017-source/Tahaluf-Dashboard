"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  Activity, AlertCircle, AlertTriangle, Bell, Mail, Plus, RefreshCw, Save, Trash2,
  CheckCircle2, TrendingUp, TrendingDown, Info, ShieldCheck, Clock, Zap, Check
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { DEFAULT_HEALTH_NOTIFICATION_SETTINGS, getHealthIssues } from '../../lib/healthNotificationUtils.mjs';
import { useLowQuotaMode } from './DashboardFeatureContext';
import { DIMENSIONS, DEFAULT_DIMENSION_SETTINGS } from '../../lib/dimensionStandards.mjs';
import DimensionFindings from './DimensionFindings';

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
  if (source.monitoringEnabled === false) return 'disabled';
  if (source.sheetChecksEnabled !== false && (source.eventDataStatus === 'missing' || (source.kind === 'Actuals' && source.eventRows === 0 && source.eventDataStatus !== 'present'))) {
    return 'missing-data';
  }
  if (source.metricDiscrepancies && source.metricDiscrepancies.length > 0) return 'metric-discrepancy';
  if (source.sheetChecksEnabled !== false && (source.state === 'stale' || source.state === 'unavailable' || source.state === 'storage-error')) {
    return source.state;
  }
  if (source.dimensionHealth && source.dimensionHealth.status !== 'disabled' && (source.dimensionHealth.status !== 'checked' || source.dimensionHealth.stale || source.dimensionHealth.findings?.length)) return 'dimension-discrepancy';
  return source.sheetChecksEnabled === false ? 'disabled' : source.state || 'unknown';
};

const statusPresentation = {
  disabled: { label: 'Checks disabled', className: 'text-gray-300 border-gray-500/30 bg-gray-500/10' },
  healthy: { label: 'Healthy', className: 'text-lime-300 border-lime-400/30 bg-lime-500/10' },
  stale: { label: 'Serving saved data', className: 'text-amber-300 border-amber-400/30 bg-amber-500/10' },
  unavailable: { label: 'Unavailable', className: 'text-red-300 border-red-400/30 bg-red-500/10' },
  'storage-error': { label: 'Storage issue', className: 'text-red-300 border-red-400/30 bg-red-500/10' },
  'missing-data': { label: 'No event rows', className: 'text-red-300 border-red-400/30 bg-red-500/10' },
  'metric-discrepancy': { label: 'Metric Discrepancy', className: 'text-amber-300 border-amber-400/40 bg-amber-500/10' },
  'dimension-discrepancy': { label: 'Dimension Check', className: 'text-amber-300 border-amber-400/40 bg-amber-500/10' },
  unknown: { label: 'Not checked', className: 'text-gray-300 border-gray-500/30 bg-gray-500/10' }
};

export default function DataHealthAdmin({
  active = true,
  onIssueCountChange = () => {},
  onDashboardAlertsEnabledChange = () => {}
}) {
  const lowQuotaMode = useLowQuotaMode();
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
  const [dimensionSettings, setDimensionSettings] = useState(DEFAULT_DIMENSION_SETTINGS);
  const [dimensionBusy, setDimensionBusy] = useState(false);
  const [dimensionNotice, setDimensionNotice] = useState(null);
  const [checkDraft, setCheckDraft] = useState({ metricChecksEnabled: true, dimensionChecksEnabled: true });
  const [eventCheckDrafts, setEventCheckDrafts] = useState({});
  const [savingEventChecks, setSavingEventChecks] = useState(null);
  const [eventCheckNotice, setEventCheckNotice] = useState(null);

  const reloadHealth = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await fetch('/api/admin/events?inspectOnly=true');
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
    if (!active) return;
    reloadHealth();
    if (lowQuotaMode) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      reloadHealth(true);
      reloadHistory();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [active, reloadHealth, reloadHistory, lowQuotaMode]);

  useEffect(() => {
    if (!active) return;
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
          setDimensionSettings(result.dimensionSettings || DEFAULT_DIMENSION_SETTINGS);
          setCheckDraft({
            metricChecksEnabled: result.dimensionSettings?.metricChecksEnabled !== false,
            dimensionChecksEnabled: result.dimensionSettings?.dimensionChecksEnabled !== false
          });
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
  }, [active, onDashboardAlertsEnabledChange]);

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
  const issueCount = actualSources.filter(source => ['stale', 'unavailable', 'storage-error', 'missing-data', 'metric-discrepancy', 'dimension-discrepancy'].includes(getStatus(source))).length;
  const missingDataCount = actualSources.filter(source => source.monitoringEnabled !== false && source.sheetChecksEnabled !== false && (source.eventDataStatus === 'missing' || source.eventRows === 0)).length;
  const totalDiscrepancies = useMemo(() => sheetHealth.reduce((sum, s) => sum + (s.metricDiscrepancies?.length || 0), 0), [sheetHealth]);
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

  const updateDimensions = async action => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action, enabledDimensions: dimensionSettings.enabledDimensions, ...checkDraft })
      });
      const result = await response.json();
      if (result.dimensionSettings) setDimensionSettings(result.dimensionSettings);
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not update dimension standards.');
      if (action === 'save-health-checks') {
        await Promise.all([reloadHealth(), reloadHistory()]);
        setDimensionNotice({ type: 'success', text: 'Global checks saved. Disabled categories stop checks, dashboard issues and emails; their history is retained as checks disabled, not recovered. Other instances may take up to 60 seconds to update. Refresh sheets after re-enabling to get fresh results.' });
      } else {
        setDimensionNotice({ type: 'success', text: 'Saved. Refresh Actuals sheets to apply these standards and selections. Other instances may take up to 60 seconds to receive changes.' });
      }
    } catch (dimensionError) {
      console.error(dimensionError);
      setDimensionNotice({ type: 'error', text: dimensionError.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const saveEventChecks = async (eventId, checks) => {
    setSavingEventChecks(eventId);
    setEventCheckNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action: 'save-event-checks', eventId, checks })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not save event monitoring.');
      setDimensionSettings(result.dimensionSettings);
      setEventCheckDrafts(previous => { const next = { ...previous }; delete next[eventId]; return next; });
      await Promise.all([reloadHealth(), reloadHistory()]);
      setEventCheckNotice({ eventId, error: false, text: 'Event monitoring saved. Disabled checks stop alerts and emails, not dashboard data. Refresh sheets after re-enabling. Other instances may take up to 60 seconds to update.' });
    } catch (saveError) {
      console.error(saveError);
      setEventCheckNotice({ eventId, error: true, text: saveError.message });
    } finally {
      setSavingEventChecks(null);
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Events monitored', value: actualSources.length, className: 'text-white' },
          { label: 'Healthy with event data', value: healthyCount, className: 'text-lime-300' },
          { label: 'Issues to review', value: issueCount, className: issueCount ? 'text-amber-300' : 'text-white' },
          { label: 'Missing event rows', value: missingDataCount, className: missingDataCount ? 'text-red-300' : 'text-white' },
          { label: '24h Metric Regressions', value: totalDiscrepancies, className: totalDiscrepancies ? 'text-red-400 font-extrabold' : 'text-lime-300' }
        ].map(stat => (
          <div key={stat.label} className="card-surface p-3.5 rounded-2xl border border-white/5">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</div>
            <div className={`text-2xl font-black mt-1 ${stat.className}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {settings.dashboardEnabled && currentIssues.length > 0 && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
                <Bell className="w-4 h-4 text-amber-400" />
                {currentIssues.length} active data health issue{currentIssues.length === 1 ? '' : 's'}
              </div>
              <ul className="mt-3 space-y-3 text-sm text-amber-100/90">
                {currentIssues.slice(0, 5).map(issue => (
                  <li key={`${issue.key}:${issue.status}`} className="rounded-lg border border-amber-300/20 bg-[#031120]/60 p-3">
                    <p className="font-bold text-white">{issue.eventName} <span className="font-normal text-slate-300">{issue.kind} / {issue.category || 'feed'}</span></p>
                    <p className="mt-1 leading-relaxed">{issue.category === 'dimensions' && issue.dimensionFindings?.length
                      ? `${issue.dimensionFindings.length} dimension findings. Expand the details or see Event Data Checks below.`
                      : issue.message}</p>
                    {issue.dimensionFindings?.length > 0 && <details className="mt-2">
                      <summary className="cursor-pointer py-1 font-semibold text-[#6bd5f7]">View dimension findings</summary>
                      <div className="mt-3"><DimensionFindings findings={issue.dimensionFindings} standards={dimensionSettings.values} /></div>
                    </details>}
                  </li>
                ))}
                {currentIssues.length > 5 && <li>And {currentIssues.length - 5} more. See the event checks below.</li>}
              </ul>
            </div>
            <button
              onClick={refreshAllHealth}
              disabled={loading || Boolean(refreshingSheet) || Boolean(refreshProgress)}
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs font-bold uppercase tracking-wider flex items-center gap-2 shrink-0 self-start sm:self-auto transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              Auto-Resolve All Issues
            </button>
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <span>Show in-dashboard alerts to admins</span>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/5 bg-[#041628]/40 p-3 text-xs text-gray-200">
            <input
              type="checkbox"
              checked={settings.emailEnabled}
              onChange={event => setSettings(previous => ({ ...previous, emailEnabled: event.target.checked }))}
              disabled={settingsLoading}
              className="accent-[#cedc28]"
            />
            <span>Send email notifications</span>
          </label>
          <label className="flex flex-col gap-1 rounded-xl border border-white/5 bg-[#041628]/40 p-3 text-xs text-gray-200">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.sendResolutionEmail !== false}
                onChange={event => setSettings(previous => ({ ...previous, sendResolutionEmail: event.target.checked }))}
                disabled={settingsLoading || !settings.emailEnabled}
                className="accent-[#cedc28]"
              />
              <span className="font-semibold text-lime-300">Send resolution email</span>
            </div>
            <span className="text-[10px] text-gray-400 pl-5 leading-tight">
              Only sent if an issue alert was previously dispatched. If resolved before the delay threshold, neither email is sent. Failed resolution emails retry on a subsequent sheet health check after five minutes.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-gray-200">
          {[['metricEmailEnabled', 'Email metric issues'], ['dimensionEmailEnabled', 'Email dimension issues']].map(([key, label]) => <label key={key} className="flex items-center gap-2">
            <input type="checkbox" checked={settings[key] !== false} disabled={settingsLoading || !settings.emailEnabled}
              onChange={event => setSettings(previous => ({ ...previous, [key]: event.target.checked }))} className="accent-[#cedc28]" />
            {label}
          </label>)}
          <p className="text-[10px] text-gray-400 w-full">These selections control immediate, daily digest and resolution emails for each category. Dashboard issues remain visible. Use Save notification settings to apply.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
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
            <p className="text-[10px] text-gray-500">
              When to dispatch alert emails.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="health-alert-delay" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Alert Delay (Grace Period)
            </label>
            <select
              id="health-alert-delay"
              value={settings.alertDelayMinutes ?? 5}
              onChange={event => setSettings(previous => ({ ...previous, alertDelayMinutes: Number(event.target.value) }))}
              disabled={settingsLoading || !settings.emailEnabled || settings.frequency === 'daily'}
              className="w-full rounded-xl border border-white/10 bg-[#041628] px-3 py-2 text-xs text-white"
            >
              <option value={0}>Immediate (0 min)</option>
              <option value={1}>After 1 minute</option>
              <option value={2}>After 2 minutes</option>
              <option value={3}>After 3 minutes</option>
              <option value={4}>After 4 minutes</option>
              <option value={5}>After 5 minutes (Default / Recommended)</option>
              <option value={10}>After 10 minutes</option>
              <option value={15}>After 15 minutes</option>
              <option value={20}>After 20 minutes</option>
              <option value={25}>After 25 minutes</option>
              <option value={30}>After 30 minutes</option>
            </select>
            <p className="text-[10px] text-gray-500">
              Wait time before sending alert. If self-healed within this window, no email is sent.
            </p>
          </div>

          <div className="space-y-1.5">
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

      <div className="card-surface rounded-2xl border border-[#14a6d9]/20 p-4 space-y-3">
        <h3 className="text-sm font-bold text-white">Global Health Checks</h3>
        <p className="text-sm leading-relaxed text-slate-300">Turn off an entire category here. This stops validation, dashboard alerts and category emails. Sheet availability checks continue. Individual dimensions and email-only preferences are retained.</p>
        <fieldset disabled={dimensionBusy || settingsLoading} className="space-y-3">
          <legend className="sr-only">Global health check categories</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[['metricChecksEnabled', 'Enable metric health checks'], ['dimensionChecksEnabled', 'Enable dimension health checks']].map(([key, label]) => <label key={key} className="flex items-center gap-3 rounded-xl border border-white/15 bg-[#071d33] p-4 text-sm font-bold text-white">
              <input type="checkbox" checked={checkDraft[key]} onChange={event => setCheckDraft(previous => ({ ...previous, [key]: event.target.checked }))} className="h-4 w-4 accent-[#cedc28]" />
              {label}
            </label>)}
          </div>
          <button type="button" onClick={() => updateDimensions('save-health-checks')} className="rounded-lg border border-[#14a6d9]/40 px-4 py-2 text-sm font-semibold text-[#6bd5f7]">Save global checks</button>
        </fieldset>
        {dimensionNotice && <p role="status" className={`text-sm leading-relaxed ${dimensionNotice.type === 'error' ? 'text-red-300' : 'text-lime-300'}`}>{dimensionNotice.text}</p>}
      </div>

      <div className="card-surface rounded-2xl border border-[#14a6d9]/20 p-4 space-y-3">
        <h3 className="text-sm font-bold text-white">Dimension Standards</h3>
        {dimensionSettings.dimensionChecksEnabled === false && <p className="text-sm text-amber-200">Dimension health checks are globally disabled. Your individual dimension selections are retained.</p>}
        <p className="text-xs text-gray-400">Actuals only, all non-empty records. Values must match the documentation after trimming whitespace and ignoring case. Blanks and missing columns are separate issues; data is never rewritten. Row samples are CSV record numbers, including the header.</p>
        <a href="https://docs.google.com/spreadsheets/d/1D1BzodAQS45oJ27xwhk9FJkxFFzJk-r9x0lQzWG6u4w/edit?gid=593739615" target="_blank" rel="noreferrer" className="text-xs text-[#14a6d9]">Open standards documentation</a>
        <p className="text-[10px] text-gray-400">Last standards sync: {formatTimestamp(dimensionSettings.fetchedAt)}. Cached for 24 hours; failed refreshes retain the last valid standards and show a warning. Selection changes take effect on the next sheet refresh.</p>
        {dimensionSettings.error && <p role="alert" className="text-xs text-amber-300">{dimensionSettings.error}</p>}
        <fieldset disabled={dimensionBusy || settingsLoading} className="space-y-3">
          <legend className="text-xs text-gray-300">Dimensions to validate</legend>
          <div className="flex gap-3 text-xs text-[#14a6d9]">
            <button type="button" onClick={() => setDimensionSettings(previous => ({ ...previous, enabledDimensions: DIMENSIONS.map(dimension => dimension.id) }))}>Select all dimensions</button>
            <button type="button" onClick={() => setDimensionSettings(previous => ({ ...previous, enabledDimensions: [] }))}>Clear all dimensions</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {DIMENSIONS.map(dimension => <label key={dimension.id} className="flex gap-2 items-center text-xs text-gray-200">
              <input type="checkbox" checked={dimensionSettings.enabledDimensions.includes(dimension.id)} onChange={event => setDimensionSettings(previous => ({
                ...previous, enabledDimensions: event.target.checked ? [...previous.enabledDimensions, dimension.id] : previous.enabledDimensions.filter(id => id !== dimension.id)
              }))} className="accent-[#cedc28]" />
              {dimension.label}
              <span className="text-gray-500">({dimensionSettings.values?.[dimension.id]?.length ?? 0} standards)</span>
            </label>)}
          </div>
          <div className="flex gap-3 text-xs text-[#14a6d9]">
            <button type="button" onClick={() => updateDimensions('save-dimensions')}>Save dimension checks</button>
            <button type="button" onClick={() => updateDimensions('refresh-standards')}>Refresh standards</button>
          </div>
        </fieldset>
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer">View allowed standard values</summary>
          {DIMENSIONS.map(dimension => <p key={dimension.id} className="mt-2"><strong>{dimension.label}:</strong> {dimensionSettings.values?.[dimension.id]?.join(', ') || 'Standards not loaded'}</p>)}
        </details>
      </div>

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
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs font-bold text-white">{item.eventName} <span className="font-medium text-gray-400">— {item.kind} — {item.status}</span></p>
                <details className="text-sm text-slate-300">
                  <summary className="cursor-pointer py-1 font-semibold text-[#6bd5f7]">View issue details</summary>
                  <div className="mt-2">
                    {item.dimensionFindings?.length
                      ? <DimensionFindings findings={item.dimensionFindings} />
                      : <p className="break-words leading-relaxed">{item.message}</p>}
                  </div>
                </details>
                <p className="text-[10px] text-gray-500">
                  Detected {formatTimestamp(item.openedAt)}
                  {item.resolvedAt && ` · Resolved ${formatTimestamp(item.resolvedAt)} (after ${formatDuration(item.openedAt, item.resolvedAt)})`}
                </p>
                {item.resolutionEmailStatus && <p className="text-[10px] text-gray-400">
                  Resolution email: {item.resolutionEmailStatus === 'checks-disabled' ? 'not sent; checks disabled' : item.resolutionEmailStatus === 'accepted' ? `accepted by SMTP ${formatTimestamp(item.resolutionEmailSentAt)} (inbox delivery not verified)` : item.resolutionEmailStatus === 'failed' ? 'failed; retry on a health check after five minutes' : 'pending; requires email and resolution notifications enabled'}
                </p>}
                {item.resolutionEmailError && <p role="alert" className="text-[10px] text-amber-300">{item.resolutionEmailError}</p>}
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${item.resolvedAt ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10' : 'text-rose-300 border-rose-400/30 bg-rose-500/10'}`}>
                {item.resolution === 'checks-disabled' ? 'Checks disabled' : item.resolvedAt ? 'Resolved' : 'Open'}
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
              <h4 className="text-base font-bold text-white">{event.eventName}</h4>
              <fieldset disabled={settingsLoading || savingEventChecks !== null} className="rounded-xl border border-white/15 bg-[#071d33] p-4 space-y-3">
                <legend className="px-1 text-sm font-bold text-white">{event.eventName} monitoring controls</legend>
                <p className="text-xs leading-relaxed text-slate-300">Applies to this event&apos;s Actuals and Planned sheets. Global category switches take precedence. Disabling monitoring does not stop data loading or change shared-sheet monitoring for other events.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[['monitoringEnabled', 'Monitor this event'], ['sheetChecksEnabled', 'Sheet availability and event rows'], ['metricChecksEnabled', 'Metric checks'], ['dimensionChecksEnabled', 'Dimension checks (Actuals)']].map(([key, label]) => {
                    const draft = eventCheckDrafts[event.eventId] || dimensionSettings.eventChecks?.[event.eventId] || {};
                    return <label key={key} className="flex items-center gap-2 text-sm text-white">
                      <input type="checkbox" aria-label={`${event.eventName}: ${label}`} checked={draft[key] !== false}
                        disabled={key !== 'monitoringEnabled' && draft.monitoringEnabled === false}
                        onChange={change => setEventCheckDrafts(previous => ({
                          ...previous, [event.eventId]: {
                            monitoringEnabled: true, sheetChecksEnabled: true, metricChecksEnabled: true, dimensionChecksEnabled: true,
                            ...draft, [key]: change.target.checked
                          }
                        }))} className="h-4 w-4 accent-[#cedc28]" />
                      {label}
                    </label>;
                  })}
                </div>
                <button type="button" onClick={() => saveEventChecks(event.eventId, {
                  monitoringEnabled: true, sheetChecksEnabled: true, metricChecksEnabled: true, dimensionChecksEnabled: true,
                  ...(eventCheckDrafts[event.eventId] || dimensionSettings.eventChecks?.[event.eventId])
                })} className="rounded-lg border border-[#14a6d9]/40 px-3 py-2 text-sm font-semibold text-[#6bd5f7]">
                  {savingEventChecks === event.eventId ? 'Saving...' : `Save ${event.eventName} checks`}
                </button>
                {eventCheckNotice?.eventId === event.eventId && <p role="status" className={`text-sm ${eventCheckNotice.error ? 'text-red-300' : 'text-lime-300'}`}>{eventCheckNotice.text}</p>}
              </fieldset>
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
                        {source.metricChecksEnabled === false && <p className="text-sm text-slate-300">Metric health checks are globally disabled.</p>}
                        {source.dimensionHealth && <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-[#031120]/70 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-white">Dimension checks</h4>
                            <span className="rounded-full border border-white/20 px-2 py-1 text-xs font-semibold text-slate-200">{source.dimensionHealth.status}</span>
                          </div>
                          <p className="text-xs leading-relaxed text-slate-300">Checked {formatTimestamp(source.dimensionHealth.checkedAt)}. Standards synced {formatTimestamp(source.dimensionHealth.standardsFetchedAt)}.</p>
                          {(source.dimensionHealth.error || source.dimensionHealth.stale) && <p role="alert" className="rounded-lg border border-amber-300/30 p-3 text-sm leading-relaxed text-amber-200">{source.dimensionHealth.error || 'Standards are stale; refresh standards.'}</p>}
                          <DimensionFindings findings={source.dimensionHealth.findings} standards={dimensionSettings.values} />
                        </div>}
                        {source.monitoringEnabled === false && <p className="text-sm text-slate-300">Health monitoring is disabled for this event. Data ingestion remains active.</p>}
                        {source.sheetChecksEnabled === false && source.monitoringEnabled !== false && <p className="text-sm text-slate-300">Sheet availability and event-row checks are disabled for this event.</p>}
                        {source.sheetChecksEnabled !== false && source.lastError && (
                          <div className="text-[10px] pt-1">
                            <div className="text-red-300">{source.lastError}</div>
                            <div className="text-[#14a6d9] mt-0.5">Suggested fix: {getSuggestedFix(source.lastError)}</div>
                          </div>
                        )}
                        {source.sheetChecksEnabled !== false && source.kind === 'Actuals' && source.eventDataStatus === 'missing' && (
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

      {/* 24-HOUR CHANNEL METRIC INTEGRITY (MONOTONICITY) CHECKS */}
      <div className="card-surface rounded-2xl border border-[#14a6d9]/25 overflow-hidden">
        <div className="px-4 py-3.5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#031120]/60">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#14a6d9]" />
              <span>24-Hour Channel Metric Integrity Checks</span>
            </h3>
            <p className="text-[10px] text-gray-400 mt-1">
              Monitors the top 4 metrics (Cost, Impressions, Clicks, Conversions) per channel for the latest 24h ingestion period. Alerts if values unexpectedly drop between refreshes.
            </p>
          </div>
          {totalDiscrepancies === 0 ? (
            <span className="px-2.5 py-1 rounded-full border border-lime-400/30 bg-lime-500/10 text-lime-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
              <CheckCircle2 className="w-3 h-3" />
              <span>All Channels Monotonic</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>{totalDiscrepancies} Discrepancy Alert{totalDiscrepancies > 1 ? 's' : ''}</span>
            </span>
          )}
        </div>

        {/* If any discrepancies are detected, show top callout banner */}
        {totalDiscrepancies > 0 && (
          <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-200 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Regression Discrepancies Detected in Latest 24h Data Feed:</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sheetHealth.flatMap(s => (s.metricDiscrepancies || []).map(d => (
                <div key={d.id} className="p-2.5 rounded-xl bg-black/40 border border-amber-500/30 text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{d.eventName} · {d.channel}</span>
                    <span className="font-mono text-amber-400 font-bold uppercase">{d.metric}</span>
                  </div>
                  <div className="text-gray-300 flex items-center gap-2">
                    <span className="line-through text-gray-500">
                      {d.metric === 'cost' ? `$${d.previousValue.toFixed(2)}` : d.previousValue.toLocaleString()}
                    </span>
                    <span className="text-amber-300 font-bold">
                      → {d.metric === 'cost' ? `$${d.currentValue.toFixed(2)}` : d.currentValue.toLocaleString()}
                    </span>
                    <span className="text-red-400 font-mono text-[10px]">(-{d.dropPercent}%)</span>
                  </div>
                  <div className="text-[9px] text-gray-500">
                    Latest Period Date: {d.date} · Detected: {new Date(d.detectedAt).toLocaleTimeString()}
                  </div>
                </div>
              )))}
            </div>
          </div>
        )}

        {/* Channel Metrics Grid per Event */}
        <div className="divide-y divide-gray-700/30">
          {eventGroups.map(event => {
            const actualSource = event.sources.find(s => s.kind === 'Actuals');
            const channelMetrics = actualSource?.channelMetrics24h || [];
            const discrepancies = actualSource?.metricDiscrepancies || [];
            const latestDate = actualSource?.latest24hDate || 'Latest 24h';

            if (channelMetrics.length === 0) {
              return (
                <div key={event.eventId} className="p-4 flex items-center justify-between text-xs text-gray-500">
                  <span className="font-bold text-gray-400">{event.eventName}</span>
                  <span>No 24h channel breakdown available in actuals feed.</span>
                </div>
              );
            }

            return (
              <article key={event.eventId} className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">{event.eventName}</h4>
                    <span className="text-[10px] text-gray-400 bg-[#041628] px-2 py-0.5 rounded border border-gray-700 font-mono">
                      Feed Date: {latestDate}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {channelMetrics.length} Active Channel{channelMetrics.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-700/40 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        <th className="py-2 px-3">Channel</th>
                        <th className="py-2 px-3 text-right">Cost (Spend)</th>
                        <th className="py-2 px-3 text-right">Impressions</th>
                        <th className="py-2 px-3 text-right">Clicks</th>
                        <th className="py-2 px-3 text-right">Conversions</th>
                        <th className="py-2 px-3 text-right">24h Integrity Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/40 font-mono">
                      {channelMetrics.map(ch => {
                        const costDisc = discrepancies.find(d => d.channel === ch.channel && d.metric === 'cost');
                        const impDisc = discrepancies.find(d => d.channel === ch.channel && d.metric === 'impressions');
                        const clickDisc = discrepancies.find(d => d.channel === ch.channel && d.metric === 'clicks');
                        const convDisc = discrepancies.find(d => d.channel === ch.channel && d.metric === 'conversions');
                        const hasAnyDisc = Boolean(costDisc || impDisc || clickDisc || convDisc);

                        return (
                          <tr key={ch.channel} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 px-3 font-sans font-bold text-gray-200 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#14a6d9]" />
                              <span>{ch.channel}</span>
                            </td>
                            <td className={`py-2.5 px-3 text-right ${costDisc ? 'text-red-400 font-bold bg-red-500/10' : 'text-gray-200'}`}>
                              ${ch.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {costDisc && <span className="text-[9px] block text-red-300">(-${costDisc.dropAmount})</span>}
                            </td>
                            <td className={`py-2.5 px-3 text-right ${impDisc ? 'text-red-400 font-bold bg-red-500/10' : 'text-gray-200'}`}>
                              {ch.impressions.toLocaleString()}
                              {impDisc && <span className="text-[9px] block text-red-300">(-{impDisc.dropAmount.toLocaleString()})</span>}
                            </td>
                            <td className={`py-2.5 px-3 text-right ${clickDisc ? 'text-red-400 font-bold bg-red-500/10' : 'text-gray-200'}`}>
                              {ch.clicks.toLocaleString()}
                              {clickDisc && <span className="text-[9px] block text-red-300">(-{clickDisc.dropAmount})</span>}
                            </td>
                            <td className={`py-2.5 px-3 text-right ${convDisc ? 'text-red-400 font-bold bg-red-500/10' : 'text-gray-200'}`}>
                              {ch.conversions.toLocaleString()}
                              {convDisc && <span className="text-[9px] block text-red-300">(-{convDisc.dropAmount})</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right font-sans">
                              {hasAnyDisc ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md">
                                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                                  <span>Regression Drop</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-lime-300 bg-lime-500/10 border border-lime-500/30 px-2 py-0.5 rounded-md">
                                  <Check className="w-3 h-3 text-lime-400" />
                                  <span>Monotonic</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* AUTOMATED HEALTH MONITORING & RESOLUTION PROTOCOL INFO CARD */}
      <div className="card-surface rounded-2xl border border-[#14a6d9]/30 p-5 bg-[#041628]/70 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#14a6d9]/15 border border-[#14a6d9]/30 text-[#14a6d9]">
              <ShieldCheck className="w-5 h-5 text-[#cedc28]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Automated Health Monitoring &amp; Self-Healing Protocol</span>
              </h3>
              <p className="text-[11px] text-[#14a6d9] mt-0.5">
                How issues are detected, automatically rechecked, throttled, and resolved with zero downtime.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full border border-[#cedc28]/40 bg-[#cedc28]/10 text-[#cedc28] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 self-start sm:self-auto shrink-0">
            <Zap className="w-3 h-3" />
            <span>Active Self-Healing</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Pillar 1 */}
          <div className="p-3.5 rounded-xl bg-[#031120] border border-gray-700/50 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>1. Instant In-Flight Retry</span>
            </div>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              If Google Sheets returns temporary <code className="text-[#14a6d9]">Loading...</code> or formula calculation errors (<code className="text-red-300">#REF!</code>, <code className="text-red-300">#N/A</code>), the proxy immediately retries once with a <strong>1-second backoff delay</strong> before declaring an issue.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="p-3.5 rounded-xl bg-[#031120] border border-gray-700/50 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#14a6d9]">
              <Activity className="w-4 h-4 text-[#14a6d9]" />
              <span>2. Continuous Live Polling</span>
            </div>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              Rechecks every <strong>60 seconds</strong> while the dashboard or admin panel is open, plus on every <strong>5-minute cache TTL window</strong> during normal user traffic. Never polls in rapid loops.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="p-3.5 rounded-xl bg-[#031120] border border-gray-700/50 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-lime-300">
              <CheckCircle2 className="w-4 h-4 text-lime-400" />
              <span>3. 100% Auto-Resolution</span>
            </div>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              The instant Google Sheets recovers and serves clean rows, the system <strong>automatically removes active issues</strong>, logs a <code className="text-lime-300">resolvedAt</code> audit timestamp, and hides the warning banner.
            </p>
          </div>

          {/* Pillar 4 */}
          <div className="p-3.5 rounded-xl bg-[#031120] border border-gray-700/50 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#cedc28]">
              <ShieldCheck className="w-4 h-4 text-[#cedc28]" />
              <span>4. Zero Quota Risk</span>
            </div>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              Immediate emails are throttled with a <strong>5-minute cooldown</strong> to avoid inbox flooding. Requests are cached in server memory (<code className="text-gray-400">&lt;1% Google quota</code>) so Google Sheets is never spammed.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
