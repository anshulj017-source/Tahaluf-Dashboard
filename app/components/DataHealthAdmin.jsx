"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, Bell, Mail, Plus, RefreshCw, Save, Trash2
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { DEFAULT_HEALTH_NOTIFICATION_SETTINGS, getHealthIssues } from '../../lib/healthNotificationUtils.mjs';
import { useLowQuotaMode } from './DashboardFeatureContext';
import { DIMENSIONS, DEFAULT_DIMENSION_SETTINGS } from '../../lib/dimensionStandards.mjs';
import DimensionFindings from './DimensionFindings';
import { AdminTabs, useAdminDirtyGuard, useAdminView } from './AdminUI';

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

const summarizeIssue = (issue) => {
  if (issue.dimensionFindings?.length) {
    const count = issue.dimensionFindings.length;
    return `${count} dimension finding${count === 1 ? '' : 's'} to review.`;
  }
  return issue.message || 'No detail recorded.';
};

const getStatus = (source) => {
  if (source.monitoringEnabled === false) return 'disabled';
  const dimensionChecksActive = source.kind === 'Actuals' && Boolean(source.dimensionHealth) && source.dimensionHealth.status !== 'disabled';
  if (source.sheetChecksEnabled === false && source.metricChecksEnabled === false && !dimensionChecksActive) return 'disabled';
  if (source.sheetChecksEnabled !== false && (source.eventDataStatus === 'missing' || (source.kind === 'Actuals' && source.eventRows === 0 && source.eventDataStatus !== 'present'))) {
    return 'missing-data';
  }
  if (source.metricDiscrepancies && source.metricDiscrepancies.length > 0) return 'metric-discrepancy';
  if (source.sheetChecksEnabled !== false && (source.state === 'stale' || source.state === 'unavailable' || source.state === 'storage-error')) {
    return source.state;
  }
  if (source.dimensionHealth && source.dimensionHealth.status !== 'disabled' && (source.dimensionHealth.status !== 'checked' || source.dimensionHealth.stale || source.dimensionHealth.findings?.length)) return 'dimension-discrepancy';
  return source.state || 'unknown';
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
  'dimension-unavailable': { label: 'Dimension Check Unavailable', className: 'text-amber-300 border-amber-400/40 bg-amber-500/10' },
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
  const [healthLoadError, setHealthLoadError] = useState(null);
  const [savedSettings, setSavedSettings] = useState(DEFAULT_HEALTH_NOTIFICATION_SETTINGS);
  const [savedDimensionDraft, setSavedDimensionDraft] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [eventStatusFilter, setEventStatusFilter] = useState('all');
  const [eventKindFilter, setEventKindFilter] = useState('all');
  const [eventCategoryFilter, setEventCategoryFilter] = useState('all');
  const [overviewEventFilter, setOverviewEventFilter] = useState('all');
  const [overviewCategoryFilter, setOverviewCategoryFilter] = useState('all');
  const [overviewIssuePage, setOverviewIssuePage] = useState(0);
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('all');
  const [historyEventFilter, setHistoryEventFilter] = useState('all');
  const [historyOutcomeFilter, setHistoryOutcomeFilter] = useState('all');
  const [historyPage, setHistoryPage] = useState(0);
  const [view, setView] = useAdminView('healthView', 'overview', ['overview', 'events', 'history', 'settings']);
  const settingsLoaded = useRef(false);
  const settingsRequestVersion = useRef(0);
  const latestDrafts = useRef(null);
  latestDrafts.current = {
    settings, dimensionSettings, checkDraft,
    onDashboardAlertsEnabledChange
  };

  const dimensionDraftKey = JSON.stringify({
    enabledDimensions: dimensionSettings.enabledDimensions,
    metricChecksEnabled: checkDraft.metricChecksEnabled,
    dimensionChecksEnabled: checkDraft.dimensionChecksEnabled
  });
  const settingsDirty = !settingsLoading && (JSON.stringify(settings) !== JSON.stringify(savedSettings) || Boolean(recipientDraft.trim()));
  const dimensionSettingsDirty = !settingsLoading && dimensionDraftKey !== savedDimensionDraft;
  const eventChecksDirty = Object.keys(eventCheckDrafts).length > 0;
  useAdminDirtyGuard('health-notifications', settingsDirty);
  useAdminDirtyGuard('health-standards', dimensionSettingsDirty);
  useAdminDirtyGuard('health-event-checks', eventChecksDirty);

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
      setHealthLoadError(null);
    } catch (loadError) {
      console.error(loadError);
      setHealthLoadError(loadError.message || 'Could not load sheet health.');
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
    if (!active || settingsLoaded.current) return;
    let cancelled = false;
    const requestVersion = ++settingsRequestVersion.current;
    const initialDrafts = latestDrafts.current;
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
        if (!cancelled && requestVersion === settingsRequestVersion.current) {
          settingsLoaded.current = true;
          const currentDrafts = latestDrafts.current;
          const nextDimensions = result.dimensionSettings || DEFAULT_DIMENSION_SETTINGS;
          if (JSON.stringify(currentDrafts.settings) === JSON.stringify(initialDrafts.settings)) {
            setSettings(result.settings);
            currentDrafts.onDashboardAlertsEnabledChange(result.settings.dashboardEnabled);
          }
          setSavedSettings(result.settings);
          setEmailConfigured(result.emailConfigured);
          setIssueHistory(result.history || []);
          setDimensionSettings(previous => ({
            ...nextDimensions,
            enabledDimensions: JSON.stringify(currentDrafts.dimensionSettings.enabledDimensions) === JSON.stringify(initialDrafts.dimensionSettings.enabledDimensions)
              ? nextDimensions.enabledDimensions
              : previous.enabledDimensions
          }));
          if (JSON.stringify(currentDrafts.checkDraft) === JSON.stringify(initialDrafts.checkDraft)) {
            setCheckDraft({
              metricChecksEnabled: nextDimensions.metricChecksEnabled !== false,
              dimensionChecksEnabled: nextDimensions.dimensionChecksEnabled !== false
            });
          }
          setSavedDimensionDraft(JSON.stringify({
            enabledDimensions: (result.dimensionSettings || DEFAULT_DIMENSION_SETTINGS).enabledDimensions,
            metricChecksEnabled: result.dimensionSettings?.metricChecksEnabled !== false,
            dimensionChecksEnabled: result.dimensionSettings?.dimensionChecksEnabled !== false
          }));
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
  }, [active]);

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
    getStatus(source) === 'healthy' && source.sheetChecksEnabled !== false && source.eventDataStatus === 'present'
  ).length;
  const issueCount = actualSources.filter(source => ['stale', 'unavailable', 'storage-error', 'missing-data', 'metric-discrepancy', 'dimension-discrepancy'].includes(getStatus(source))).length;
  const missingDataCount = actualSources.filter(source => source.monitoringEnabled !== false && source.sheetChecksEnabled !== false && (source.eventDataStatus === 'missing' || source.eventRows === 0)).length;
  const totalDiscrepancies = useMemo(() => sheetHealth.reduce((sum, s) => sum + (s.metricDiscrepancies?.length || 0), 0), [sheetHealth]);
  const currentIssues = useMemo(() => getHealthIssues(sheetHealth), [sheetHealth]);

  const refreshSources = async (sources, description) => {
    if (sources.length === 0) {
      await reloadHealth();
      return;
    }

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
          text: `Checked ${sources.length} ${description}. ${failures.length} failed; saved data remains available where a previous snapshot exists. ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '; see source details below.' : ''}`
        }
      : {
          type: 'success',
          text: `Refresh complete. Checked ${sources.length} ${description} against Google Sheets.`
        });
  };

  const refreshAllHealth = () => refreshSources([...sheetHealth], 'sheet sources');
  const refreshAffectedSources = () => {
    const affectedKeys = new Set(currentIssues.map(issue => `${issue.eventId}:${issue.kind}`));
    const affected = sheetHealth.filter(source => affectedKeys.has(`${source.eventId}:${source.kind}`));
    return refreshSources(affected, 'affected sources');
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
      setRefreshSummary({
        type: 'error',
        text: `${source.eventName} ${source.kind} refresh failed. Saved data is retained where available; the health state below may be stale. ${refreshError.message}`
      });
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
      setSavedSettings(result.settings);
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
      if (result.dimensionSettings) {
        if (action === 'refresh-standards') {
          setDimensionSettings(previous => ({
            ...result.dimensionSettings,
            enabledDimensions: previous.enabledDimensions,
            metricChecksEnabled: previous.metricChecksEnabled,
            dimensionChecksEnabled: previous.dimensionChecksEnabled
          }));
        } else {
          setDimensionSettings(result.dimensionSettings);
        }
      }
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not update dimension standards.');
      const nextSettings = result.dimensionSettings || dimensionSettings;
      if (action !== 'refresh-standards') {
        const nextCheckDraft = {
          metricChecksEnabled: nextSettings.metricChecksEnabled !== false,
          dimensionChecksEnabled: nextSettings.dimensionChecksEnabled !== false
        };
        setCheckDraft(nextCheckDraft);
        setSavedDimensionDraft(JSON.stringify({
          enabledDimensions: nextSettings.enabledDimensions,
          ...nextCheckDraft
        }));
      }
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

  const historyCategory = item => item.category || (item.dimensionFindings?.length || String(item.status || '').includes('dimension') ? 'dimensions' : String(item.status || '').includes('metric') ? 'metrics' : 'feed');
  const overviewEvents = [...new Set(currentIssues.map(issue => issue.eventName).filter(Boolean))].sort();
  const filteredOverviewIssues = currentIssues.filter(issue =>
    (overviewEventFilter === 'all' || issue.eventName === overviewEventFilter) &&
    (overviewCategoryFilter === 'all' || historyCategory(issue) === overviewCategoryFilter)
  );
  const overviewPageSize = 5;
  const overviewPageCount = Math.max(1, Math.ceil(filteredOverviewIssues.length / overviewPageSize));
  const visibleOverviewPage = Math.min(overviewIssuePage, overviewPageCount - 1);
  const visibleOverviewIssues = filteredOverviewIssues.slice(visibleOverviewPage * overviewPageSize, (visibleOverviewPage + 1) * overviewPageSize);
  const historyOutcome = item => item.resolution === 'checks-disabled' ? 'checks-disabled' : item.resolvedAt ? 'resolved' : 'open';
  const historyEvents = [...new Set(issueHistory.map(item => item.eventName).filter(Boolean))].sort();
  const filteredHistory = issueHistory.filter(item =>
    (historyCategoryFilter === 'all' || historyCategory(item) === historyCategoryFilter) &&
    (historyEventFilter === 'all' || item.eventName === historyEventFilter) &&
    (historyOutcomeFilter === 'all' || historyOutcome(item) === historyOutcomeFilter)
  );
  const historyPageSize = 20;
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const visibleHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const visibleHistory = filteredHistory.slice(visibleHistoryPage * historyPageSize, (visibleHistoryPage + 1) * historyPageSize);
  const filteredEvents = eventGroups.filter(event => {
    const query = eventSearch.trim().toLowerCase();
    if (query && !event.eventName.toLowerCase().includes(query) && !event.eventId.toLowerCase().includes(query)) return false;
    if (eventKindFilter !== 'all' && !event.sources.some(source => source.kind === eventKindFilter)) return false;
    const issues = currentIssues.filter(issue => issue.eventId === event.eventId);
    if (eventStatusFilter === 'issues' && issues.length === 0) return false;
    if (eventStatusFilter === 'healthy' && event.sources.every(source => getStatus(source) !== 'healthy')) return false;
    if (eventStatusFilter === 'disabled' && event.sources.every(source => getStatus(source) !== 'disabled')) return false;
    if (eventCategoryFilter !== 'all' && !issues.some(issue => issue.category === eventCategoryFilter)) return false;
    return true;
  });
  const refreshBusy = loading || Boolean(refreshingSheet) || Boolean(refreshProgress);
  const sectionClass = (id) => `space-y-4 ${view === id ? '' : 'hidden'}`;
  const eventCheckReason = (event, key) => {
    const draft = eventCheckDrafts[event.eventId] || dimensionSettings.eventChecks?.[event.eventId] || {};
    if (key !== 'monitoringEnabled' && (draft.monitoringEnabled === false || event.sources.every(source => source.monitoringEnabled === false))) return 'Event monitoring is disabled.';
    if (key === 'sheetChecksEnabled' && (draft.sheetChecksEnabled === false || event.sources.every(source => source.sheetChecksEnabled === false))) return 'Sheet availability and event-row checks are disabled for this event.';
    if (key === 'metricChecksEnabled') {
      if (dimensionSettings.metricChecksEnabled === false) return 'Metric checks are globally disabled.';
      if (draft.metricChecksEnabled === false || event.sources.every(source => source.metricChecksEnabled === false)) return 'Metric checks are disabled for this event.';
    }
    if (key === 'dimensionChecksEnabled') {
      if (dimensionSettings.dimensionChecksEnabled === false) return 'Dimension checks are globally disabled.';
      if (draft.dimensionChecksEnabled === false || event.sources.find(source => source.kind === 'Actuals')?.dimensionHealth?.status === 'disabled') return 'Dimension checks are disabled for this event.';
    }
    return '';
  };

  return (
    <section className={`space-y-4 ${active ? '' : 'hidden'}`}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white"><Activity className="h-5 w-5 text-[#14a6d9]" />Health Monitor</h2>
          <p className="mt-0.5 text-xs text-slate-400">Sheet availability, event data, metric integrity, standards, and notification controls.</p>
          <p className="mt-1 text-[10px] text-slate-500">Last checked: {formatTimestamp(lastCheckedAt)} · automatic check every 60 seconds while visible{lowQuotaMode ? ' (paused in low-quota mode)' : ''}</p>
        </div>
        <button type="button" onClick={refreshAllHealth} disabled={refreshBusy} className="inline-flex items-center gap-2 self-start rounded-lg border border-[#14a6d9]/40 px-3 py-2 text-xs font-semibold text-[#6bd5f7] hover:bg-[#14a6d9]/10 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading || refreshProgress ? 'animate-spin' : ''}`} />
          {refreshProgress ? `Refreshing ${refreshProgress.completed}/${refreshProgress.total}` : 'Refresh all sources'}
        </button>
      </header>

      <AdminTabs label="Health monitor sections" tabs={[
        { id: 'overview', label: 'Overview' }, { id: 'events', label: 'Events' },
        { id: 'history', label: 'Issue History' }, { id: 'settings', label: 'Settings' }
      ]} value={view} onChange={setView} />

      {healthLoadError && <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
        <strong>Latest health check failed.</strong> {healthLoadError} {sheetHealth.length ? 'Previously loaded health data remains displayed and may be stale.' : 'No health data is available yet; retry when the service is available.'}
      </div>}
      {refreshProgress && <div role="status" className="rounded-lg border border-[#14a6d9]/30 bg-[#14a6d9]/10 p-3 text-xs text-sky-100">Checking {refreshProgress.completed} of {refreshProgress.total} sheet sources against Google Sheets.</div>}
      {refreshSummary && <div role="status" className={`rounded-lg border p-3 text-xs ${refreshSummary.type === 'error' ? 'border-amber-400/40 bg-amber-500/10 text-amber-100' : 'border-lime-400/30 bg-lime-500/10 text-lime-100'}`}>{refreshSummary.text}</div>}
      {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      <section aria-label="Health overview" className={sectionClass('overview')}>
        <div className="rounded-xl border border-amber-400/30 bg-[#071d33] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Bell className="h-4 w-4 text-amber-300" />{currentIssues.length} active issue{currentIssues.length === 1 ? '' : 's'} to review</h3>
              <p className="mt-1 text-[11px] text-slate-400">Refreshing rechecks affected sheets; issues clear only when the health check verifies recovery.</p>
            </div>
            <button type="button" onClick={refreshAffectedSources} disabled={!currentIssues.length || refreshBusy} className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/10 disabled:opacity-50">Refresh affected sources</button>
          </div>
          {currentIssues.length ? <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-semibold uppercase text-slate-400">Event<select value={overviewEventFilter} onChange={event => { setOverviewEventFilter(event.target.value); setOverviewIssuePage(0); }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All events</option>{overviewEvents.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
              <label className="text-[10px] font-semibold uppercase text-slate-400">Issue category<select value={overviewCategoryFilter} onChange={event => { setOverviewCategoryFilter(event.target.value); setOverviewIssuePage(0); }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All categories</option><option value="feed">Feed / sheet</option><option value="metrics">Metrics</option><option value="dimensions">Dimensions</option></select></label>
            </div>
            <ul className="mt-3 space-y-2">
            {visibleOverviewIssues.map(issue => <li key={issue.key} className="rounded-lg border border-white/10 bg-[#031120]/70 p-3">
              <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white">{issue.eventName}</strong><span className="text-xs text-slate-300">{issue.kind} · {issue.category || 'feed'}</span><span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] text-amber-200">{statusPresentation[issue.status]?.label || issue.status}</span></div>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/90">{summarizeIssue(issue)}</p>
              {historyCategory(issue) === 'dimensions' && issue.dimensionFindings?.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer text-[#6bd5f7]">View dimension findings</summary><div className="mt-2"><DimensionFindings findings={issue.dimensionFindings} standards={dimensionSettings.values} /></div></details>}
            </li>)}
            </ul>
            <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
              <span>{filteredOverviewIssues.length ? `${visibleOverviewPage * overviewPageSize + 1}–${Math.min((visibleOverviewPage + 1) * overviewPageSize, filteredOverviewIssues.length)} of ${filteredOverviewIssues.length} issues` : 'No issues match these filters.'}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOverviewIssuePage(page => Math.max(0, page - 1))} disabled={visibleOverviewPage === 0} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Previous issues</button>
                <button type="button" onClick={() => setOverviewIssuePage(page => Math.min(overviewPageCount - 1, page + 1))} disabled={visibleOverviewPage >= overviewPageCount - 1} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Next issues</button>
              </div>
            </div>
          </> : <p className="mt-3 text-xs text-lime-200">No active issues detected.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: 'Events monitored', value: actualSources.length, color: 'text-white' },
            { label: 'Healthy Actuals', value: healthyCount, color: 'text-lime-300' },
            { label: 'Events needing review', value: issueCount, color: issueCount ? 'text-amber-300' : 'text-white' },
            { label: 'Missing event rows', value: missingDataCount, color: missingDataCount ? 'text-red-300' : 'text-white' },
            { label: 'Metric regressions', value: totalDiscrepancies, color: totalDiscrepancies ? 'text-red-300' : 'text-lime-300' }
          ].map(stat => <div key={stat.label} className="rounded-xl border border-white/10 bg-[#071d33] p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{stat.label}</div><div className={`mt-1 text-2xl font-bold ${stat.color}`}>{stat.value}</div></div>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#071d33] p-3 text-xs">
          <span className="text-slate-300">Dashboard notifications are {settings.dashboardEnabled ? 'enabled' : 'disabled'}; this overview remains available to admins.</span>
          <button type="button" onClick={() => setView('events')} className="text-[#6bd5f7] hover:text-white">Review event sources →</button>
        </div>
        <details className="rounded-xl border border-white/10 bg-[#071d33] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-white">24-hour channel metric integrity</summary>
          <p className="mt-2 text-xs text-slate-400">Monitors Cost, Impressions, Clicks, and Conversions per channel for unexpected drops between refreshes.</p>
          {totalDiscrepancies ? <div className="mt-3 space-y-2">{sheetHealth.flatMap(source => (source.metricDiscrepancies || []).map(item => <div key={item.id} className="rounded-lg border border-amber-400/20 bg-black/20 p-2 text-xs text-slate-200"><strong>{item.eventName} · {item.channel} · {item.metric}</strong><span className="ml-2 text-amber-200">{item.previousValue} → {item.currentValue} (-{item.dropPercent}%)</span><span className="ml-2 text-slate-400">{item.date}</span></div>))}</div> : <p className="mt-2 text-xs text-lime-200">No metric regressions currently detected.</p>}
        </details>
      </section>

      <section aria-label="Event health and controls" className={sectionClass('events')}>
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-[10px] font-semibold uppercase text-slate-400">Search events<input value={eventSearch} onChange={event => setEventSearch(event.target.value)} placeholder="Search name or ID" className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white placeholder:text-slate-500" /></label>
          <label className="text-[10px] font-semibold uppercase text-slate-400">Source kind<select value={eventKindFilter} onChange={event => setEventKindFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All sources</option><option value="Actuals">Actuals</option><option value="Planned">Planned</option></select></label>
          <label className="text-[10px] font-semibold uppercase text-slate-400">Health status<select value={eventStatusFilter} onChange={event => setEventStatusFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All statuses</option><option value="issues">Has active issue</option><option value="healthy">Healthy</option><option value="disabled">Checks disabled</option></select></label>
          <label className="text-[10px] font-semibold uppercase text-slate-400">Issue category<select value={eventCategoryFilter} onChange={event => setEventCategoryFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All categories</option><option value="feed">Feed / sheet</option><option value="metrics">Metrics</option><option value="dimensions">Dimensions</option></select></label>
        </div>
        <p className="text-[11px] text-slate-400">{filteredEvents.length} of {eventGroups.length} events · Actuals and Planned are shown separately. Event controls affect both sources; disabled checks do not stop dashboard data loading.</p>
        <div className="space-y-3">
          {filteredEvents.map(event => {
            const eventIssues = currentIssues.filter(issue => issue.eventId === event.eventId);
            const drafts = eventCheckDrafts[event.eventId] || dimensionSettings.eventChecks?.[event.eventId] || {};
            const selectedChecks = { monitoringEnabled: true, sheetChecksEnabled: true, metricChecksEnabled: true, dimensionChecksEnabled: true, ...drafts };
            return <details key={event.eventId} className="rounded-xl border border-white/10 bg-[#071d33]" open={filteredEvents.length === 1}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3"><span className="font-semibold text-white">{event.eventName}</span><span className="flex flex-wrap gap-2">{event.sources.map(source => { const p = statusPresentation[getStatus(source)] || statusPresentation.unknown; return <span key={source.kind} className={`rounded-full border px-2 py-0.5 text-[10px] ${p.className}`}>{source.kind}: {p.label}</span>; })}<span className="text-xs text-slate-400">{eventIssues.length} issue{eventIssues.length === 1 ? '' : 's'}</span></span></summary>
              <div className="space-y-3 border-t border-white/10 p-3">
                {eventIssues.map(issue => <div key={issue.key} className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-100"><strong>{issue.category || 'feed'} · {issue.status}</strong><p className="mt-1">{summarizeIssue(issue)}</p>{issue.dimensionFindings?.length > 0 && <p className="mt-1 text-[10px] text-slate-400">Expand Dimension checks in the {issue.kind} source below to review findings.</p>}</div>)}
                <fieldset disabled={settingsLoading || savingEventChecks !== null} className="rounded-lg border border-white/10 bg-[#031120]/60 p-3">
                  <legend className="px-1 text-xs font-semibold text-white">Event monitoring controls</legend>
                  <p className="mb-3 text-[10px] text-slate-400">Applies to this event’s Actuals and Planned sheets. Global category switches take precedence.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['monitoringEnabled', 'Monitor this event'], ['sheetChecksEnabled', 'Sheet availability and event rows'],
                      ['metricChecksEnabled', 'Metric checks'], ['dimensionChecksEnabled', 'Dimension checks (Actuals)']
                    ].map(([key, label]) => {
                      const reason = eventCheckReason(event, key);
                      return <label key={key} className="flex items-start gap-2 text-xs text-slate-200">
                        <input type="checkbox" aria-label={`${event.eventName}: ${label}`} checked={selectedChecks[key] !== false} disabled={key !== 'monitoringEnabled' && selectedChecks.monitoringEnabled === false} onChange={change => setEventCheckDrafts(previous => ({ ...previous, [event.eventId]: { monitoringEnabled: true, sheetChecksEnabled: true, metricChecksEnabled: true, dimensionChecksEnabled: true, ...selectedChecks, [key]: change.target.checked } }))} className="mt-0.5 accent-[#cedc28]" />
                        <span>{label}{reason && <span className="mt-0.5 block text-[10px] text-amber-200">Effective status: {reason}</span>}</span>
                      </label>;
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={() => saveEventChecks(event.eventId, selectedChecks)} className="rounded-lg border border-[#14a6d9]/40 px-3 py-2 text-xs font-semibold text-[#6bd5f7] disabled:opacity-50">{savingEventChecks === event.eventId ? 'Saving…' : `Save ${event.eventName} checks`}</button>{eventCheckNotice?.eventId === event.eventId && <span role={eventCheckNotice.error ? 'alert' : 'status'} className={`text-xs ${eventCheckNotice.error ? 'text-red-300' : 'text-lime-300'}`}>{eventCheckNotice.text}</span>}</div>
                </fieldset>
                {event.sources.map(source => {
                  const status = getStatus(source);
                  const presentation = statusPresentation[status] || statusPresentation.unknown;
                  const isRefreshing = refreshingSheet === `${source.eventId}:${source.kind}`;
                  const disabledReasons = [];
                  if (source.monitoringEnabled === false) disabledReasons.push('Event monitoring is disabled.');
                  else {
                    if (source.sheetChecksEnabled === false) disabledReasons.push('Sheet availability and event-row checks are disabled for this event.');
                    if (source.metricChecksEnabled === false) disabledReasons.push(dimensionSettings.metricChecksEnabled === false ? 'Metric checks are globally disabled.' : 'Metric checks are disabled for this event.');
                    if (source.kind === 'Actuals' && source.dimensionHealth?.status === 'disabled') disabledReasons.push(dimensionSettings.dimensionChecksEnabled === false ? 'Dimension checks are globally disabled.' : 'Dimension checks are disabled for this event.');
                  }
                  return <article key={`${source.eventId}:${source.kind}`} className="rounded-lg border border-white/10 bg-[#041628]/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white">{source.kind}</strong><span className="font-mono text-[10px] text-slate-500">{source.gid ? `GID ${source.gid}` : 'Root sheet'}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] ${presentation.className}`}>{presentation.label}</span></div><button type="button" onClick={() => refreshSheet(source)} disabled={Boolean(refreshingSheet) || Boolean(refreshProgress)} className="rounded-lg border border-[#14a6d9]/40 px-3 py-1.5 text-[10px] font-semibold text-[#6bd5f7] disabled:opacity-50">{isRefreshing ? 'Refreshing…' : 'Refresh source'}</button></div>
                    {source.state === 'stale' && <p className="mt-2 text-[10px] text-amber-200">Latest refresh failed; serving the saved snapshot. {source.lastError || ''}</p>}
                    {source.state === 'unavailable' && <p className="mt-2 text-[10px] text-red-200">Source unavailable; no current successful refresh. {source.lastError || ''}</p>}
                    {disabledReasons.length > 0 && <p className="mt-2 text-[10px] text-amber-200">Disabled checks: {disabledReasons.join(' ')} Data loading is unaffected.</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400"><span>Last success: {formatTimestamp(source.lastSuccessAt)}</span>{source.lastFailureAt && <span className="text-amber-200">Last failure: {formatTimestamp(source.lastFailureAt)}{source.lastError ? ` · ${source.lastError}` : ''}</span>}<span>Rows: {(source.totalRows ?? source.rowCount ?? 0).toLocaleString()}</span>{source.kind === 'Actuals' && <span>Matching event rows: {(source.eventRows || 0).toLocaleString()} {source.eventDataStatus === 'unverified' ? '(event column not available)' : ''}</span>}<span>Date range: {source.firstDataDate || source.lastDataDate ? `${source.firstDataDate || 'Unknown'} – ${source.lastDataDate || 'Unknown'}` : 'No dated rows'}</span></div>
                    {source.dimensionHealth && <details className="mt-3 rounded-lg border border-white/10 p-2 text-xs"><summary className="cursor-pointer font-semibold text-slate-200">Dimension checks · {source.dimensionHealth.status} · last run {formatTimestamp(source.dimensionHealth.checkedAt)}</summary>{source.dimensionHealth.error && <p className="mt-2 text-amber-200">{source.dimensionHealth.error}</p>}{source.dimensionHealth.findings?.length ? <div className="mt-2"><DimensionFindings findings={source.dimensionHealth.findings} standards={dimensionSettings.values} /></div> : <p className="mt-2 text-slate-400">No dimension findings.</p>}</details>}
                    {(source.metricDiscrepancies?.length > 0 || source.channelMetrics24h?.length > 0) && <details className="mt-2 rounded-lg border border-white/10 p-2 text-xs"><summary className="cursor-pointer font-semibold text-slate-200">24-hour channel metrics ({source.metricDiscrepancies?.length || 0} regression{source.metricDiscrepancies?.length === 1 ? '' : 's'})</summary>{source.metricDiscrepancies?.map(item => <p key={item.id} className="mt-2 text-amber-200">{item.channel} · {item.metric}: {item.previousValue} → {item.currentValue} (-{item.dropPercent}%) on {item.date}</p>)}{source.channelMetrics24h?.length > 0 && <p className="mt-2 text-slate-400">{source.channelMetrics24h.length} channel metrics available · latest date {source.latest24hDate || 'unknown'}.</p>}</details>}
                  </article>;
                })}
              </div>
            </details>;
          })}
          {!loading && filteredEvents.length === 0 && <div className="rounded-xl border border-white/10 p-5 text-center text-xs text-slate-400">No events match these filters.</div>}
          {loading && !sheetHealth.length && <div className="rounded-xl border border-white/10 p-5 text-center text-xs text-slate-400">Loading health data…</div>}
        </div>
      </section>

      <section aria-label="Issue history" className={sectionClass('history')}>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-[10px] font-semibold uppercase text-slate-400">Category<select value={historyCategoryFilter} onChange={event => { setHistoryCategoryFilter(event.target.value); setHistoryPage(0); }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All categories</option><option value="feed">Feed / sheet</option><option value="metrics">Metrics</option><option value="dimensions">Dimensions</option></select></label>
          <label className="text-[10px] font-semibold uppercase text-slate-400">Event<select value={historyEventFilter} onChange={event => { setHistoryEventFilter(event.target.value); setHistoryPage(0); }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All events</option>{historyEvents.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="text-[10px] font-semibold uppercase text-slate-400">Outcome<select value={historyOutcomeFilter} onChange={event => { setHistoryOutcomeFilter(event.target.value); setHistoryPage(0); }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All outcomes</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="checks-disabled">Checks disabled</option></select></label>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#071d33]">
          <div className="divide-y divide-white/10">
            {visibleHistory.map(item => <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white">{item.eventName}</strong><span className="text-xs text-slate-300">{item.kind} · {historyCategory(item)} · {item.status}</span></div>
                <p className="mt-1 text-xs text-slate-300">{summarizeIssue(item)}</p>
                {item.dimensionFindings?.length > 0 && <details className="mt-2 text-xs text-slate-300"><summary className="cursor-pointer text-[#6bd5f7]">View dimension findings</summary><div className="mt-2"><DimensionFindings findings={item.dimensionFindings} standards={dimensionSettings.values} /></div></details>}
                <p className="mt-2 text-[10px] text-slate-500">Detected {formatTimestamp(item.openedAt)}{item.resolvedAt && ` · Resolved ${formatTimestamp(item.resolvedAt)} (${formatDuration(item.openedAt, item.resolvedAt)})`}</p>
                {item.resolutionEmailStatus && <p className="mt-1 text-[10px] text-slate-400">Resolution email: {item.resolutionEmailStatus === 'checks-disabled' ? 'not sent; checks disabled' : item.resolutionEmailStatus === 'accepted' ? `accepted by SMTP ${formatTimestamp(item.resolutionEmailSentAt)} (inbox delivery not verified)` : item.resolutionEmailStatus === 'failed' ? 'failed; retry on a health check after five minutes' : 'pending; requires email and resolution notifications enabled'}</p>}
                {item.resolutionEmailError && <p role="alert" className="text-[10px] text-amber-300">{item.resolutionEmailError}</p>}
              </div><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${historyOutcome(item) === 'open' ? 'border-rose-400/30 text-rose-200' : 'border-emerald-400/30 text-emerald-200'}`}>{historyOutcome(item) === 'checks-disabled' ? 'Checks disabled' : historyOutcome(item)}</span>
            </article>)}
            {visibleHistory.length === 0 && <p className="p-6 text-center text-xs text-slate-400">No issue history matches these filters.</p>}
          </div>
          <div className="flex items-center justify-between border-t border-white/10 p-3 text-xs text-slate-400"><span>{filteredHistory.length ? `${visibleHistoryPage * historyPageSize + 1}–${Math.min((visibleHistoryPage + 1) * historyPageSize, filteredHistory.length)} of ${filteredHistory.length}` : '0 entries'} · latest 200 retained</span><div className="flex gap-2"><button type="button" onClick={() => setHistoryPage(page => Math.max(0, Math.min(historyPageCount - 1, page - 1)))} disabled={visibleHistoryPage === 0} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Previous</button><button type="button" onClick={() => setHistoryPage(page => Math.min(historyPageCount - 1, page + 1))} disabled={visibleHistoryPage >= historyPageCount - 1} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Next</button></div></div>
        </div>
      </section>

      <section aria-label="Health monitor settings" className={sectionClass('settings')}>
        <section className="space-y-3 rounded-xl border border-white/10 bg-[#071d33] p-4">
          <div><h3 className="text-sm font-bold text-white">Global checks and standards</h3><p className="mt-1 text-xs text-slate-400">Category switches take precedence over event settings. Disabling checks stops validation and related alerts, not data loading. Sheet availability checks continue unless disabled per event.</p></div>
          <fieldset disabled={dimensionBusy || settingsLoading} className="space-y-3"><legend className="sr-only">Global health checks</legend>
            <div className="grid gap-2 sm:grid-cols-2">{[['metricChecksEnabled', 'Enable metric health checks'], ['dimensionChecksEnabled', 'Enable dimension health checks']].map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-xs text-white"><input type="checkbox" checked={checkDraft[key]} onChange={event => setCheckDraft(previous => ({ ...previous, [key]: event.target.checked }))} className="accent-[#cedc28]" />{label}</label>)}</div>
            <button type="button" onClick={() => updateDimensions('save-health-checks')} className="rounded-lg border border-[#14a6d9]/40 px-3 py-2 text-xs font-semibold text-[#6bd5f7]">Save global checks</button>
          </fieldset>
          {dimensionNotice && <p role={dimensionNotice.type === 'error' ? 'alert' : 'status'} className={`text-xs ${dimensionNotice.type === 'error' ? 'text-red-300' : 'text-lime-200'}`}>{dimensionNotice.text}</p>}
          <div className="border-t border-white/10 pt-3"><h4 className="text-xs font-semibold text-white">Dimension standards</h4>
            {dimensionSettings.dimensionChecksEnabled === false && <p className="mt-1 text-xs text-amber-200">Dimension health checks are globally disabled; individual selections are retained.</p>}
            <p className="mt-1 text-[10px] text-slate-400">Actuals only. Values are trimmed and case-insensitive; blanks and missing columns are reported separately. Data is never rewritten. Last standards sync: {formatTimestamp(dimensionSettings.fetchedAt)}; cached for 24 hours.</p>
            <a href="https://docs.google.com/spreadsheets/d/1D1BzodAQS45oJ27xwhk9FJkxFFzJk-r9x0lQzWG6u4w/edit?gid=593739615" target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[#6bd5f7]">Open standards documentation</a>
            {dimensionSettings.error && <p role="alert" className="mt-1 text-xs text-amber-300">Standards refresh failed; retaining last valid standards: {dimensionSettings.error}</p>}
            <fieldset disabled={dimensionBusy || settingsLoading} className="mt-3 space-y-3"><legend className="text-[10px] text-slate-300">Dimensions to validate</legend>
              <div className="flex gap-3 text-xs"><button type="button" onClick={() => setDimensionSettings(previous => ({ ...previous, enabledDimensions: DIMENSIONS.map(dimension => dimension.id) }))} className="text-[#6bd5f7]">Select all</button><button type="button" onClick={() => setDimensionSettings(previous => ({ ...previous, enabledDimensions: [] }))} className="text-[#6bd5f7]">Clear all</button></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{DIMENSIONS.map(dimension => <label key={dimension.id} className="flex items-center gap-2 text-xs text-slate-200"><input type="checkbox" checked={dimensionSettings.enabledDimensions.includes(dimension.id)} onChange={event => setDimensionSettings(previous => ({ ...previous, enabledDimensions: event.target.checked ? [...previous.enabledDimensions, dimension.id] : previous.enabledDimensions.filter(id => id !== dimension.id) }))} className="accent-[#cedc28]" />{dimension.label}<span className="text-slate-500">({dimensionSettings.values?.[dimension.id]?.length ?? 0})</span></label>)}</div>
              <div className="flex flex-wrap gap-3"><button type="button" onClick={() => updateDimensions('save-dimensions')} className="text-xs text-[#6bd5f7]">Save dimension checks</button><button type="button" onClick={() => updateDimensions('refresh-standards')} className="text-xs text-[#6bd5f7]">Refresh standards</button></div>
            </fieldset>
            <details className="mt-3 text-[10px] text-slate-400"><summary className="cursor-pointer">View allowed standard values</summary>{DIMENSIONS.map(dimension => <p key={dimension.id} className="mt-2"><strong>{dimension.label}:</strong> {dimensionSettings.values?.[dimension.id]?.join(', ') || 'Standards not loaded'}</p>)}</details>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-white/10 bg-[#071d33] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-bold text-white">Notifications and email</h3><p className="mt-1 text-xs text-slate-400">Choose admin dashboard alerts, category email preferences, schedule, and recipients.</p></div><span className={`rounded-full border px-2 py-1 text-[10px] ${emailConfigured ? 'border-lime-400/30 text-lime-200' : 'border-amber-400/30 text-amber-200'}`}>{emailConfigured ? 'Email provider connected' : 'Email provider not configured'}</span></div>
          {!emailConfigured && <p className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-2 text-[10px] text-amber-100">Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and HEALTH_ALERT_FROM in the environment to enable email.</p>}
          {notificationMessage && <p role={notificationMessage.type === 'error' ? 'alert' : 'status'} className={`text-xs ${notificationMessage.type === 'error' ? 'text-red-300' : 'text-lime-200'}`}>{notificationMessage.text}</p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-xs text-slate-200"><input type="checkbox" checked={settings.dashboardEnabled} onChange={event => { const dashboardEnabled = event.target.checked; setSettings(previous => ({ ...previous, dashboardEnabled })); onDashboardAlertsEnabledChange(dashboardEnabled); }} disabled={settingsLoading} className="accent-[#cedc28]" />Show in-dashboard alerts to admins</label>
            <label className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-xs text-slate-200"><input type="checkbox" checked={settings.emailEnabled} onChange={event => setSettings(previous => ({ ...previous, emailEnabled: event.target.checked }))} disabled={settingsLoading} className="accent-[#cedc28]" />Send email notifications</label>
            <label className="flex items-start gap-2 rounded-lg border border-white/10 p-3 text-xs text-slate-200"><input type="checkbox" checked={settings.sendResolutionEmail !== false} onChange={event => setSettings(previous => ({ ...previous, sendResolutionEmail: event.target.checked }))} disabled={settingsLoading || !settings.emailEnabled} className="mt-0.5 accent-[#cedc28]" /><span>Send resolution email<span className="mt-1 block text-[10px] text-slate-400">Only when an issue alert was previously dispatched.</span></span></label>
            {[[ 'metricEmailEnabled', 'Email metric issues' ], [ 'dimensionEmailEnabled', 'Email dimension issues' ]].map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-xs text-slate-200"><input type="checkbox" checked={settings[key] !== false} disabled={settingsLoading || !settings.emailEnabled} onChange={event => setSettings(previous => ({ ...previous, [key]: event.target.checked }))} className="accent-[#cedc28]" />{label}</label>)}
            <label className="text-[10px] font-semibold uppercase text-slate-400">Email frequency<select value={settings.frequency} onChange={event => setSettings(previous => ({ ...previous, frequency: event.target.value }))} disabled={settingsLoading || !settings.emailEnabled} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="immediate">Immediate when detected</option><option value="daily">Daily digest</option><option value="immediate_and_daily">Immediate + daily digest</option></select></label>
            <label className="text-[10px] font-semibold uppercase text-slate-400">Alert delay<select value={settings.alertDelayMinutes ?? 5} onChange={event => setSettings(previous => ({ ...previous, alertDelayMinutes: Number(event.target.value) }))} disabled={settingsLoading || !settings.emailEnabled || settings.frequency === 'daily'} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white">{[0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30].map(minutes => <option key={minutes} value={minutes}>{minutes === 0 ? 'Immediate (0 min)' : `After ${minutes} minute${minutes === 1 ? '' : 's'}${minutes === 5 ? ' (default)' : ''}`}</option>)}</select></label>
          </div>
          <div className="border-t border-white/10 pt-3"><label className="text-[10px] font-semibold uppercase text-slate-400">Email recipients</label><div className="mt-1 flex gap-2"><input type="email" value={recipientDraft} onChange={event => setRecipientDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addRecipient(); } }} placeholder="admin@example.com" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs text-white" /><button type="button" onClick={addRecipient} aria-label="Add email recipient" className="rounded-lg border border-[#14a6d9]/40 px-3 text-[#6bd5f7]"><Plus className="h-4 w-4" /></button></div><div className="mt-2 flex flex-wrap gap-2">{settings.emailRecipients.map(email => <span key={email} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-200">{email}<button type="button" onClick={() => setSettings(previous => ({ ...previous, emailRecipients: previous.emailRecipients.filter(recipient => recipient !== email) }))} aria-label={`Remove ${email}`} className="text-slate-400 hover:text-red-300"><Trash2 className="h-3 w-3" /></button></span>)}{!settings.emailRecipients.length && <span className="text-[10px] text-slate-500">No recipients selected.</span>}</div></div>
          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3"><button type="button" onClick={saveSettings} disabled={settingsLoading || savingSettings} className="inline-flex items-center gap-2 rounded-lg border border-[#14a6d9]/40 px-3 py-2 text-xs font-semibold text-[#6bd5f7] disabled:opacity-50"><Save className="h-3.5 w-3.5" />{savingSettings ? 'Saving…' : 'Save notification settings'}</button><button type="button" onClick={sendTestEmail} disabled={!emailConfigured || settingsLoading || sendingTestEmail || !settings.emailRecipients.length} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 disabled:opacity-40"><Mail className="h-3.5 w-3.5" />{sendingTestEmail ? 'Sending…' : 'Send test email'}</button><p className="basis-full text-[10px] text-slate-500">Health checks run when sheet data is requested; the scheduled full check and digest may vary by about an hour on Vercel Hobby.</p></div>
        </section>
      </section>
    </section>
  );
}
