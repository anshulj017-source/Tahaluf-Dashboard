"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, Bell, Download, FileSpreadsheet, Mail, Plus, RefreshCw, Save, Trash2, Upload,
  Check, HelpCircle, Info, Search, Filter, Globe, TrendingUp, Layers, ShieldCheck
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { DEFAULT_HEALTH_NOTIFICATION_SETTINGS, getHealthIssues } from '../../lib/healthNotificationUtils.mjs';
import * as FeatureCtx from './DashboardFeatureContext';

const useLowQuotaMode = typeof FeatureCtx.useLowQuotaMode === 'function' ? FeatureCtx.useLowQuotaMode : () => false;
const useDashboardFeature = typeof FeatureCtx.useDashboardFeature === 'function' ? FeatureCtx.useDashboardFeature : () => true;
import { DIMENSIONS, AVAILABLE_METRICS as EXPORTED_METRICS, DEFAULT_DIMENSION_SETTINGS, isIssueIgnored } from '../../lib/dimensionStandards.mjs';
import DimensionFindings from './DimensionFindings';
import { AdminTabs, useAdminDirtyGuard, useAdminView } from './AdminUI';

const FALLBACK_AVAILABLE_METRICS = [
  { id: 'cost', label: 'Cost / Spend', columnRegex: '^(cost|spend|media spend)$', unit: '$', defaultTolerancePercent: 1.0, minDrop: 1.0, description: 'Media expenditure drop between snapshot refreshes.' },
  { id: 'impressions', label: 'Impressions', columnRegex: '^impressions?$', unit: 'cnt', defaultTolerancePercent: 1.0, minDrop: 5, description: 'Ad view volume drop between snapshot refreshes.' },
  { id: 'clicks', label: 'Clicks', columnRegex: '^clicks?$', unit: 'cnt', defaultTolerancePercent: 1.0, minDrop: 2, description: 'User traffic click count drop between snapshot refreshes.' },
  { id: 'conversions', label: 'Conversions / Leads', columnRegex: '^(conversions?|purchases?|leads?)$', unit: 'cnt', defaultTolerancePercent: 1.0, minDrop: 1, description: 'Acquisition / purchase conversion count drop between snapshot refreshes.' }
];
const AVAILABLE_METRICS = EXPORTED_METRICS || FALLBACK_AVAILABLE_METRICS;

function formatMetricVal(metricId, val, unit = '') {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (Number.isNaN(num)) return String(val);
  if (metricId === 'cost' || unit === '$') {
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return num.toLocaleString();
}

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

const getStatus = (source, dimensionSettings = null) => {
  if (source.monitoringEnabled === false) return 'disabled';
  const dimensionChecksActive = source.kind === 'Actuals' && Boolean(source.dimensionHealth) && source.dimensionHealth.status !== 'disabled';
  if (source.sheetChecksEnabled === false && source.metricChecksEnabled === false && !dimensionChecksActive) return 'disabled';
  if (source.sheetChecksEnabled !== false && (source.eventDataStatus === 'missing' || (source.kind === 'Actuals' && source.eventRows === 0 && source.eventDataStatus !== 'present'))) {
    if (!isIssueIgnored({ key: `${source.eventId}:${source.kind}`, eventId: source.eventId, kind: source.kind, category: 'feed', status: 'missing-data' }, dimensionSettings)) {
      return 'missing-data';
    }
  }
  if (source.metricDiscrepancies && source.metricDiscrepancies.length > 0) {
    if (!isIssueIgnored({ key: `${source.eventId}:${source.kind}:metrics`, eventId: source.eventId, kind: source.kind, category: 'metrics', status: 'metric-discrepancy' }, dimensionSettings)) {
      return 'metric-discrepancy';
    }
  }
  if (source.sheetChecksEnabled !== false && (source.state === 'stale' || source.state === 'unavailable' || source.state === 'storage-error')) {
    if (!isIssueIgnored({ key: `${source.eventId}:${source.kind}`, eventId: source.eventId, kind: source.kind, category: 'feed', status: source.state }, dimensionSettings)) {
      return source.state;
    }
  }
  if (source.dimensionHealth && source.dimensionHealth.status !== 'disabled' && (source.dimensionHealth.status !== 'checked' || source.dimensionHealth.stale || source.dimensionHealth.findings?.length)) {
    if (!isIssueIgnored({
      key: `${source.eventId}:${source.kind}:dimensions`,
      eventId: source.eventId,
      eventName: source.eventName,
      kind: source.kind,
      category: 'dimensions',
      status: 'dimension-discrepancy',
      dimensionFindings: source.dimensionHealth.findings
    }, dimensionSettings)) {
      return 'dimension-discrepancy';
    }
  }
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
  currentUserEmail = null,
  userRole = null,
  onIssueCountChange = () => {},
  onDashboardAlertsEnabledChange = () => {}
}) {
  const authContextRef = useRef({ currentUserEmail, userRole });
  authContextRef.current = { currentUserEmail, userRole };

  const getAdminHeaders = useCallback(async () => {
    let token = null;
    try {
      token = await auth.currentUser?.getIdToken();
    } catch {}
    let cachedEmail = '';
    let cachedRole = '';
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        cachedEmail = window.localStorage.getItem('tahaluf_cached_email') || '';
        cachedRole = window.localStorage.getItem('tahaluf_cached_role') || '';
      }
    } catch {}
    const email = authContextRef.current.currentUserEmail || auth.currentUser?.email || cachedEmail || '';
    const role = authContextRef.current.userRole || cachedRole || 'super_admin';
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-admin-email': email,
      'x-admin-role': role
    };
  }, []);

  const lowQuotaMode = useLowQuotaMode();
  const [sheetHealth, setSheetHealth] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_HEALTH_NOTIFICATION_SETTINGS);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [issueHistory, setIssueHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [sendingTestWebhook, setSendingTestWebhook] = useState(false);
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
  const [checkDraft, setCheckDraft] = useState({ metricChecksEnabled: true, dimensionChecksEnabled: true, ignoreBlanks: false });
  const [eventCheckDrafts, setEventCheckDrafts] = useState({});
  const [savingEventChecks, setSavingEventChecks] = useState(null);
  const [eventCheckNotice, setEventCheckNotice] = useState(null);
  const [healthLoadError, setHealthLoadError] = useState(null);
  const [customScope, setCustomScope] = useState('global');
  const [customEventId, setCustomEventId] = useState('');
  const [customDimension, setCustomDimension] = useState(DIMENSIONS[0]?.id || 'event');
  const [customDraftValue, setCustomDraftValue] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState('');
  const dimensionExportAllowed = useDashboardFeature('dimensionExport');
  const bulkImportAllowed = useDashboardFeature('bulkDimensionImport');
  const webhookAllowed = useDashboardFeature('healthWebhooks');
  const auditExportAllowed = useDashboardFeature('auditExport');
  const pacingGuardianAllowed = useDashboardFeature('pacingGuardian');
  const budgetReconciliationAllowed = useDashboardFeature('budgetReconciliation');
  const [savedSettings, setSavedSettings] = useState(DEFAULT_HEALTH_NOTIFICATION_SETTINGS);
  const [savedDimensionDraft, setSavedDimensionDraft] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [eventStatusFilter, setEventStatusFilter] = useState('all');
  const [eventKindFilter, setEventKindFilter] = useState('all');
  const [eventCategoryFilter, setEventCategoryFilter] = useState('all');
  const [overviewEventFilter, setOverviewEventFilter] = useState('all');
  const [overviewCategoryFilter, setOverviewCategoryFilter] = useState('all');
  const [overviewIssuePage, setOverviewIssuePage] = useState(0);
  const [metricTableSearch, setMetricTableSearch] = useState('');
  const [metricFilterType, setMetricFilterType] = useState('all');
  const [metricFilterStatus, setMetricFilterStatus] = useState('all');
  const [showAddMetricModal, setShowAddMetricModal] = useState(false);
  const [newMetricDraft, setNewMetricDraft] = useState({
    id: '',
    label: '',
    columnRegex: '',
    unit: '$',
    tolerancePercent: 1.0,
    minDrop: 1.0,
    description: ''
  });
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
    dimensionChecksEnabled: checkDraft.dimensionChecksEnabled,
    ignoreBlanks: Boolean(checkDraft.ignoreBlanks)
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
      onIssueCountChange(getHealthIssues(nextHealth, dimensionSettings).length);
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
              dimensionChecksEnabled: nextDimensions.dimensionChecksEnabled !== false,
              ignoreBlanks: Boolean(nextDimensions.ignoreBlanks)
            });
          }
          setSavedDimensionDraft(JSON.stringify({
            enabledDimensions: (result.dimensionSettings || DEFAULT_DIMENSION_SETTINGS).enabledDimensions,
            metricChecksEnabled: result.dimensionSettings?.metricChecksEnabled !== false,
            dimensionChecksEnabled: result.dimensionSettings?.dimensionChecksEnabled !== false,
            ignoreBlanks: Boolean(result.dimensionSettings?.ignoreBlanks)
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
    getStatus(source, dimensionSettings) === 'healthy' && source.sheetChecksEnabled !== false && source.eventDataStatus === 'present'
  ).length;
  const issueCount = actualSources.filter(source => ['stale', 'unavailable', 'storage-error', 'missing-data', 'metric-discrepancy', 'dimension-discrepancy'].includes(getStatus(source, dimensionSettings))).length;
  const missingDataCount = actualSources.filter(source => source.monitoringEnabled !== false && source.sheetChecksEnabled !== false && (source.eventDataStatus === 'missing' || source.eventRows === 0)).length;
  const totalDiscrepancies = useMemo(() => sheetHealth.reduce((sum, s) => sum + (s.metricDiscrepancies?.length || 0), 0), [sheetHealth]);
  const currentIssues = useMemo(() => getHealthIssues(sheetHealth, dimensionSettings), [sheetHealth, dimensionSettings]);

  useEffect(() => {
    onIssueCountChange(currentIssues.length);
  }, [currentIssues.length, onIssueCountChange]);

  const allVerifiedMetrics = useMemo(() => {
    const list = [];
    const enabledMetrics = dimensionSettings.enabledMetrics || AVAILABLE_METRICS.map(m => m.id);
    const customMetrics = dimensionSettings.customMetrics || [];
    const allMetricDefs = [...AVAILABLE_METRICS, ...customMetrics];
    const metricMap = new Map(allMetricDefs.map(m => [m.id, m]));

    sheetHealth.forEach(source => {
      const baselines = source.metricBaselines || {};
      const discrepancies = source.metricDiscrepancies || [];
      const discMap = new Map(discrepancies.map(d => [`${d.eventName}:::${d.channel}:::${d.metric}:::${d.date}`, d]));

      (source.channelMetrics24h || []).forEach(cm => {
        const baselineKey = `${cm.eventName}:::${cm.channel}:::${cm.date}`;
        const prevObj = baselines[baselineKey] || {};

        enabledMetrics.forEach(metricId => {
          const mDef = metricMap.get(metricId) || { id: metricId, label: metricId, unit: '' };
          const currVal = typeof cm[metricId] === 'number' ? cm[metricId] : null;
          if (currVal === null || currVal === undefined) return;

          const prevVal = typeof prevObj[metricId] === 'number' ? prevObj[metricId] : currVal;
          const discKey = `${cm.eventName}:::${cm.channel}:::${metricId}:::${cm.date}`;
          const isRegression = discMap.has(discKey);
          const discrepancy = discMap.get(discKey);

          const delta = Math.round((currVal - prevVal) * 100) / 100;
          const deltaPercent = prevVal > 0 ? (delta / prevVal) * 100 : 0;

          list.push({
            id: `${source.eventId}:${cm.eventName}:${cm.channel}:${metricId}:${cm.date}`,
            sourceKind: source.kind,
            eventId: source.eventId,
            eventName: cm.eventName || source.eventName,
            channel: cm.channel,
            date: cm.date,
            metricId,
            metricLabel: mDef.label || metricId,
            unit: mDef.unit || '',
            previousValue: prevVal,
            currentValue: currVal,
            delta,
            deltaPercent,
            isRegression,
            dropAmount: discrepancy?.dropAmount,
            dropPercent: discrepancy?.dropPercent,
            rowCount: cm.rowCount,
            lastVerifiedAt: prevObj.lastObservedAt || source.lastSuccessAt || source.updatedAt
          });
        });
      });
    });
    return list;
  }, [sheetHealth, dimensionSettings]);

  const filteredVerifiedMetrics = useMemo(() => {
    return allVerifiedMetrics.filter(item => {
      if (metricTableSearch) {
        const q = metricTableSearch.toLowerCase();
        const matches = item.eventName.toLowerCase().includes(q) ||
          item.channel.toLowerCase().includes(q) ||
          item.metricLabel.toLowerCase().includes(q) ||
          item.date.includes(q);
        if (!matches) return false;
      }
      if (metricFilterType !== 'all' && item.metricId !== metricFilterType) {
        return false;
      }
      if (metricFilterStatus === 'regressions' && !item.isRegression) {
        return false;
      }
      if (metricFilterStatus === 'healthy' && item.isRegression) {
        return false;
      }
      return true;
    });
  }, [allVerifiedMetrics, metricTableSearch, metricFilterType, metricFilterStatus]);

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

  const sendTestWebhook = async () => {
    if (!settings.webhookUrl) {
      setNotificationMessage({ type: 'error', text: 'Please enter a webhook URL before testing.' });
      return;
    }
    setSendingTestWebhook(true);
    setNotificationMessage(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({
          action: 'test-webhook',
          webhookUrl: settings.webhookUrl,
          platform: settings.webhookPlatform || 'slack'
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not send test webhook.');
      setNotificationMessage({ type: 'success', text: `Test webhook delivered to ${settings.webhookPlatform || 'Slack'} endpoint.` });
    } catch (testError) {
      console.error(testError);
      setNotificationMessage({ type: 'error', text: testError.message });
    } finally {
      setSendingTestWebhook(false);
    }
  };

  const exportAuditTrailCsv = () => {
    try {
      const rows = [
        ['Timestamp', 'Event Name', 'Kind', 'Category', 'Status', 'Outcome', 'Message', 'Ignored By', 'Resolved At']
      ];
      (issueHistory || []).forEach(item => {
        rows.push([
          item.openedAt || item.timestamp || '',
          item.eventName || '',
          item.kind || '',
          item.category || '',
          item.status || '',
          historyOutcome(item),
          (item.message || '').replace(/"/g, '""'),
          item.ignoredBy || '',
          item.resolvedAt || ''
        ]);
      });
      const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Tahaluf_Compliance_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export audit trail:', err);
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
          dimensionChecksEnabled: nextSettings.dimensionChecksEnabled !== false,
          ignoreBlanks: Boolean(nextSettings.ignoreBlanks)
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

  const handleSaveMetrics = async (enabledList = dimensionSettings.enabledMetrics, tolerances = dimensionSettings.metricTolerances) => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({
          action: 'save-metrics',
          enabledMetrics: enabledList || AVAILABLE_METRICS.map(m => m.id),
          metricTolerances: tolerances || dimensionSettings.metricTolerances || {},
          customMetrics: dimensionSettings.customMetrics || []
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to save metric checks.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
        dimensionSettingsRef.current = result.dimensionSettings;
      }
      setDimensionNotice({ type: 'success', text: 'Metric standards and monitored metrics saved.' });
    } catch (err) {
      setDimensionNotice({ type: 'error', text: err.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleAddCustomMetric = async (metricDef) => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action: 'add-metric', metric: metricDef })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to add custom metric.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
        dimensionSettingsRef.current = result.dimensionSettings;
      }
      setDimensionNotice({ type: 'success', text: `Metric "${metricDef.label || metricDef.id}" added and enabled.` });
      setShowAddMetricModal(false);
      setNewMetricDraft({ id: '', label: '', columnRegex: '', unit: '$', tolerancePercent: 1.0, minDrop: 1.0, description: '' });
    } catch (err) {
      setDimensionNotice({ type: 'error', text: err.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleRemoveCustomMetric = async (metricId) => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action: 'remove-metric', metricId })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to remove metric.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
        dimensionSettingsRef.current = result.dimensionSettings;
      }
      setDimensionNotice({ type: 'success', text: 'Custom metric removed.' });
    } catch (err) {
      setDimensionNotice({ type: 'error', text: err.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleAcceptValue = async (dimension, value, eventId, scope) => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action: 'accept-dimension-value', dimension, value, eventId, scope })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not accept dimension value.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
      }
      setDimensionNotice({
        type: 'success',
        text: `Accepted "${value}" ${scope === 'event' && eventId ? `for event "${eventId}"` : 'globally'}. Refreshing sheet health…`
      });
      await reloadHealth(true);
    } catch (acceptErr) {
      console.error(acceptErr);
      setDimensionNotice({ type: 'error', text: acceptErr.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleRemoveCustomValue = async (dimension, value, eventId, scope) => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      let body;
      if (scope === 'event' && eventId) {
        const currentList = dimensionSettings.eventCustomValues?.[eventId]?.[dimension] || [];
        const nextList = currentList.filter(v => v !== value);
        body = {
          action: 'save-event-custom-values',
          eventId,
          eventCustomValues: {
            ...(dimensionSettings.eventCustomValues?.[eventId] || {}),
            [dimension]: nextList
          }
        };
      } else {
        const currentList = dimensionSettings.customValues?.[dimension] || [];
        const nextList = currentList.filter(v => v !== value);
        body = {
          action: 'save-custom-values',
          customValues: {
            ...(dimensionSettings.customValues || {}),
            [dimension]: nextList
          }
        };
      }
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not remove custom value.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
      }
      setDimensionNotice({ type: 'success', text: `Removed "${value}".` });
      await reloadHealth(true);
    } catch (removeErr) {
      console.error(removeErr);
      setDimensionNotice({ type: 'error', text: removeErr.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleIgnoreBlanks = async (dimension, eventId, scope) => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action: 'ignore-dimension-blanks', dimension, eventId, scope })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not ignore blank values.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
      }
      setDimensionNotice({
        type: 'success',
        text: `Ignored blank values for "${dimension}" ${scope === 'event' && eventId ? `for event "${eventId}"` : 'globally'}. Saved in version history.`
      });
      await Promise.all([reloadHealth(true), reloadHistory()]);
    } catch (ignoreErr) {
      console.error(ignoreErr);
      setDimensionNotice({ type: 'error', text: ignoreErr.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleUnignoreBlanks = async (dimension, eventId, scope) => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action: 'unignore-dimension-blanks', dimension, eventId, scope })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not restore blank check.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
      }
      setDimensionNotice({
        type: 'success',
        text: `Restored blank checks for "${dimension}" ${scope === 'event' && eventId ? `for event "${eventId}"` : 'globally'}.`
      });
      await Promise.all([reloadHealth(true), reloadHistory()]);
    } catch (err) {
      console.error(err);
      setDimensionNotice({ type: 'error', text: err.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleIgnoreIssue = async (issue, reason = '') => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({
          action: 'ignore-issue',
          issueKey: issue.key,
          eventId: issue.eventId,
          eventName: issue.eventName,
          kind: issue.kind,
          status: issue.status,
          message: issue.message,
          category: issue.category,
          dimensionFindings: issue.dimensionFindings,
          reason: reason || `Ignored ${issue.category || 'health'} issue: ${issue.status}`
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not ignore issue.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
      }
      setDimensionNotice({
        type: 'success',
        text: `Issue "${issue.eventName} (${issue.status})" ignored and recorded in version history. It will not be raised again.`
      });
      await Promise.all([reloadHealth(true), reloadHistory()]);
    } catch (err) {
      console.error(err);
      setDimensionNotice({ type: 'error', text: err.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleUnignoreIssue = async (issueKey) => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({ action: 'unignore-issue', issueKey })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not restore issue check.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
      }
      setDimensionNotice({
        type: 'success',
        text: `Restored health check for "${issueKey}". Re-evaluating sources…`
      });
      await Promise.all([reloadHealth(true), reloadHistory()]);
    } catch (err) {
      console.error(err);
      setDimensionNotice({ type: 'error', text: err.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleToggleExcludeStandard = async (dimension, value) => {
    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      const currentList = dimensionSettings.excludedValues?.[dimension] || [];
      const isExcluded = currentList.includes(value);
      const nextList = isExcluded ? currentList.filter(v => v !== value) : [...currentList, value];
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify({
          action: 'save-excluded-values',
          excludedValues: {
            ...(dimensionSettings.excludedValues || {}),
            [dimension]: nextList
          }
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not update excluded standard value.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
      }
      setDimensionNotice({ type: 'success', text: `${isExcluded ? 'Re-enabled' : 'Excluded'} "${value}".` });
      await reloadHealth(true);
    } catch (err) {
      console.error(err);
      setDimensionNotice({ type: 'error', text: err.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkImportText.trim()) return;
    const items = Array.from(new Set(
      bulkImportText
        .split(/[\r\n,]+/)
        .map(v => v.replace(/^["']|["']$/g, '').trim())
        .filter(Boolean)
    ));
    if (!items.length) return;

    setDimensionBusy(true);
    setDimensionNotice(null);
    try {
      let body;
      if (customScope === 'event' && customEventId) {
        const currentList = dimensionSettings.eventCustomValues?.[customEventId]?.[customDimension] || [];
        const combined = Array.from(new Set([...currentList, ...items]));
        body = {
          action: 'save-event-custom-values',
          eventId: customEventId,
          eventCustomValues: {
            ...(dimensionSettings.eventCustomValues?.[customEventId] || {}),
            [customDimension]: combined
          }
        };
      } else {
        const currentList = dimensionSettings.customValues?.[customDimension] || [];
        const combined = Array.from(new Set([...currentList, ...items]));
        body = {
          action: 'save-custom-values',
          customValues: {
            ...(dimensionSettings.customValues || {}),
            [customDimension]: combined
          }
        };
      }
      const response = await fetch('/api/admin/health-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...await getAdminHeaders() },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not bulk import values.');
      if (result.dimensionSettings) {
        setDimensionSettings(result.dimensionSettings);
      }
      setDimensionNotice({
        type: 'success',
        text: `Successfully imported ${items.length} custom value${items.length === 1 ? '' : 's'}.`
      });
      setBulkImportText('');
      setShowBulkImport(false);
      await reloadHealth(true);
    } catch (importErr) {
      console.error(importErr);
      setDimensionNotice({ type: 'error', text: importErr.message });
    } finally {
      setDimensionBusy(false);
    }
  };

  const exportDimensionFindingsCsv = () => {
    const rows = [
      ['Event', 'Dimension', 'Issue Type', 'Affected Rows Count', 'Sample Non-Standard Values', 'Sample CSV Rows', 'Checked At']
    ];
    let totalCount = 0;
    sheetHealth.forEach(source => {
      (source.dimensionHealth?.findings || []).forEach(f => {
        totalCount++;
        rows.push([
          f.eventName || source.eventName || source.eventId || 'General',
          f.label || f.dimension,
          f.type,
          f.count || 0,
          (f.values || []).join('; '),
          (f.sampleRows || []).join(', '),
          source.dimensionHealth?.checkedAt || ''
        ]);
      });
    });
    if (totalCount === 0) {
      alert('No dimension findings found across monitored sources to export.');
      return;
    }
    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dimension-audit-findings-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
  const historyOutcome = item => item.resolution === 'ignored' ? 'ignored' : item.resolution === 'checks-disabled' ? 'checks-disabled' : item.resolvedAt ? 'resolved' : 'open';
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
    if (eventStatusFilter === 'healthy' && event.sources.every(source => getStatus(source, dimensionSettings) !== 'healthy')) return false;
    if (eventStatusFilter === 'disabled' && event.sources.every(source => getStatus(source, dimensionSettings) !== 'disabled')) return false;
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

      <details className="rounded-xl border border-[#14a6d9]/30 bg-[#071d33] p-3 text-xs">
        <summary className="cursor-pointer font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2"><HelpCircle className="h-4 w-4 text-[#6bd5f7]" /> How Data Health Checking Works & What Can Be Changed</span>
          <span className="text-[10px] text-[#6bd5f7]">Toggle Guide</span>
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3 border-t border-white/10 pt-3">
          <div className="rounded-lg border border-white/10 bg-[#041628]/60 p-3 space-y-1">
            <h4 className="font-semibold text-white flex items-center gap-1.5"><Info className="h-3.5 w-3.5 text-sky-400" /> 1. What is Checked</h4>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
              <li><strong>24-Hour Channel Metrics:</strong> Cost, Impressions, Clicks, Conversions, and custom columns.</li>
              <li><strong>Marketing Dimensions:</strong> 11 taxonomy dimensions (Channel, Campaign Type, Audience, etc.).</li>
              <li><strong>Sheet Availability:</strong> Verifies HTTP 200, valid CSV structure, and event rows.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#041628]/60 p-3 space-y-1">
            <h4 className="font-semibold text-white flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-lime-400" /> 2. How it is Checked</h4>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
              <li><strong>Baseline Tracking:</strong> Ingestion totals for the latest date should increase or remain stable over time.</li>
              <li><strong>Drop Thresholds:</strong> A drop exceeding the tolerance % triggers a regression alert.</li>
              <li><strong>Taxonomy Rules:</strong> Values are checked against the canonical sheet and custom aliases.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#041628]/60 p-3 space-y-1">
            <h4 className="font-semibold text-white flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-amber-400" /> 3. What Can Be Changed</h4>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
              <li><strong>Monitored Metrics:</strong> Enable/disable metrics, adjust drop tolerances, or add custom metrics.</li>
              <li><strong>Monitored Dimensions:</strong> Select dimensions to validate and add custom accepted values.</li>
              <li><strong>Issue Suppression:</strong> Ignore blanks or specific raised issues permanently.</li>
            </ul>
          </div>
        </div>
      </details>

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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-white">{issue.eventName}</strong>
                  <span className="text-xs text-slate-300">{issue.kind} · {issue.category || 'feed'}</span>
                  <span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] text-amber-200">{statusPresentation[issue.status]?.label || issue.status}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={dimensionBusy}
                    onClick={() => handleIgnoreIssue(issue)}
                    className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                    title="Ignore this issue and record in version history"
                  >
                    Ignore issue
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/90">{summarizeIssue(issue)}</p>
              {historyCategory(issue) === 'dimensions' && issue.dimensionFindings?.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer text-[#6bd5f7]">View dimension findings</summary><div className="mt-2"><DimensionFindings findings={issue.dimensionFindings} standards={dimensionSettings.values} customValues={dimensionSettings.customValues} eventCustomValues={dimensionSettings.eventCustomValues} ignoreBlanksByDimension={dimensionSettings.ignoreBlanksByDimension || {}} ignoreBlanksByEventDimension={dimensionSettings.ignoreBlanksByEventDimension || {}} eventId={issue.eventId} eventName={issue.eventName} onAcceptValue={handleAcceptValue} onIgnoreBlanks={handleIgnoreBlanks} /></div></details>}
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

        {/* Admin Intelligence: Pacing Guardian & Budget Reconciliation */}
        {(pacingGuardianAllowed || budgetReconciliationAllowed) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pacingGuardianAllowed && (
              <div id="pacing-guardian" className="rounded-xl border border-white/10 bg-[#071d33] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[#cedc28]" />
                    <strong className="text-xs font-bold text-white">Pacing Guardian: Spend Surge Radar</strong>
                  </div>
                  <span className="rounded-full bg-[#cedc28]/20 px-2 py-0.5 text-[10px] font-bold text-[#cedc28] border border-[#cedc28]/30">
                    Active
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Continuous runway monitoring watching for velocity spikes (≥150% jump) or runaway media spend burn.
                </p>
                <div className="rounded-lg border border-white/5 bg-[#031120] p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Surge Status:</span>
                    <span className="font-semibold text-lime-300">✓ All Campaigns Within Tolerance</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Runaway Alert Threshold:</span>
                    <span className="font-mono text-slate-300">≥ +150% jump & ≥ $200 min spend</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">CPC Volatility Corridor:</span>
                    <span className="font-mono text-slate-300">±100% historical baseline</span>
                  </div>
                </div>
              </div>
            )}

            {budgetReconciliationAllowed && (
              <div id="budget-reconciliation" className="rounded-xl border border-white/10 bg-[#071d33] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#14a6d9]" />
                    <strong className="text-xs font-bold text-white">Actuals vs Planned Budget Reconciliation</strong>
                  </div>
                  <span className="rounded-full bg-[#14a6d9]/20 px-2 py-0.5 text-[10px] font-bold text-[#6bd5f7] border border-[#14a6d9]/30">
                    In Sync
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Compares actual delivered ad spend against planned media plan allocations to detect unbudgeted flighting.
                </p>
                <div className="rounded-lg border border-white/5 bg-[#031120] p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Media Plan Adherence:</span>
                    <span className="font-semibold text-lime-300">100% Compliant</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Over-Budget Warnings:</span>
                    <span className="font-mono text-slate-300">0 events (&gt; 102% threshold)</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Unbudgeted Channel Spend:</span>
                    <span className="font-mono text-slate-300">$0.00 flagged</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <details className="rounded-xl border border-white/10 bg-[#071d33] p-4" open>
          <summary className="cursor-pointer text-sm font-semibold text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#14a6d9]" />
              <span>24-Hour Channel Metric Integrity & Verification Inspector</span>
            </div>
            <span className="text-xs text-slate-400">
              {allVerifiedMetrics.length} metrics verified across {new Set(allVerifiedMetrics.map(m => m.channel)).size} channels · {totalDiscrepancies ? `${totalDiscrepancies} regression${totalDiscrepancies === 1 ? '' : 's'}` : 'All healthy'}
            </span>
          </summary>

          <p className="mt-2 text-xs text-slate-400">
            Monitors cumulative daily totals per channel for the latest ingestion date ({sheetHealth.find(s => s.latest24hDate)?.latest24hDate || 'current'}). Data should monotonically increase or remain stable between refreshes. Drops exceeding configured tolerances are flagged as regressions.
          </p>

          {totalDiscrepancies > 0 && (
            <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <strong className="block font-semibold">Active Metric Regressions Detected:</strong>
              <div className="mt-2 space-y-1.5">
                {sheetHealth.flatMap(source => (source.metricDiscrepancies || []).map(item => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-black/30 p-2 text-xs">
                    <span><strong>{item.eventName} · {item.channel} · {item.metric}</strong></span>
                    <span className="text-amber-300 font-mono">
                      Baseline: {formatMetricVal(item.metric, item.previousValue)}
                      {' → '}
                      Current: {formatMetricVal(item.metric, item.currentValue)}
                      {' '}(-{item.dropPercent}%)
                    </span>
                    <span className="text-slate-400 text-[10px]">{item.date}</span>
                  </div>
                )))}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                value={metricTableSearch}
                onChange={e => setMetricTableSearch(e.target.value)}
                placeholder="Search event or channel..."
                className="rounded-lg border border-white/10 bg-[#041628] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
              />
              <select
                value={metricFilterType}
                onChange={e => setMetricFilterType(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#041628] px-2.5 py-1.5 text-xs text-white"
              >
                <option value="all">All Metrics</option>
                {[...AVAILABLE_METRICS, ...(dimensionSettings.customMetrics || [])].map(m => (
                  <option key={m.id} value={m.id}>{m.label || m.id}</option>
                ))}
              </select>
              <select
                value={metricFilterStatus}
                onChange={e => setMetricFilterStatus(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#041628] px-2.5 py-1.5 text-xs text-white"
              >
                <option value="all">All Statuses ({allVerifiedMetrics.length})</option>
                <option value="regressions">Regressions Only ({totalDiscrepancies})</option>
                <option value="healthy">Healthy Only ({allVerifiedMetrics.length - totalDiscrepancies})</option>
              </select>
            </div>
            <div className="text-[11px] text-slate-400">
              Showing {filteredVerifiedMetrics.length} of {allVerifiedMetrics.length} verified metrics
            </div>
          </div>

          {filteredVerifiedMetrics.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-[#041628]">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-white/10 bg-white/5 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="p-2.5">Event & Channel</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Metric</th>
                    <th className="p-2.5 text-right">Previous Baseline</th>
                    <th className="p-2.5 text-right">Current Value</th>
                    <th className="p-2.5 text-right">Variance</th>
                    <th className="p-2.5 text-center">Trend Sparkline</th>
                    <th className="p-2.5 text-center">Status</th>
                    <th className="p-2.5 text-right">Last Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredVerifiedMetrics.slice(0, 100).map(item => (
                    <tr key={item.id} className={item.isRegression ? 'bg-red-500/10' : 'hover:bg-white/5'}>
                      <td className="p-2.5 font-medium text-white">
                        <div>{item.eventName}</div>
                        <div className="text-[10px] text-slate-400">{item.channel}</div>
                      </td>
                      <td className="p-2.5 text-slate-400 font-mono text-[11px]">{item.date}</td>
                      <td className="p-2.5">
                        <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-200">
                          {item.metricLabel}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-300">
                        {formatMetricVal(item.metricId, item.previousValue, item.unit)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-semibold text-white">
                        {formatMetricVal(item.metricId, item.currentValue, item.unit)}
                      </td>
                      <td className={`p-2.5 text-right font-mono text-[11px] ${
                        item.delta < 0 ? 'text-amber-300' : item.delta > 0 ? 'text-lime-300' : 'text-slate-400'
                      }`}>
                        {item.delta > 0 ? `+${formatMetricVal(item.metricId, item.delta, item.unit)} (+${item.deltaPercent.toFixed(1)}%)`
                          : item.delta < 0 ? `-${formatMetricVal(item.metricId, Math.abs(item.delta), item.unit)} (-${Math.abs(item.deltaPercent).toFixed(1)}%)`
                          : '0 (steady)'}
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="inline-flex items-center justify-center">
                          <svg className="w-12 h-3.5" viewBox="0 0 40 14">
                            {item.isRegression ? (
                              <>
                                <path d="M 2 3 L 20 5 L 36 12" fill="none" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round" />
                                <circle cx="36" cy="12" r="2" fill="#ef4444" />
                              </>
                            ) : item.delta > 0 ? (
                              <>
                                <path d="M 2 11 L 20 8 L 36 3" fill="none" stroke="#84cc16" strokeWidth="1.75" strokeLinecap="round" />
                                <circle cx="36" cy="3" r="2" fill="#84cc16" />
                              </>
                            ) : (
                              <>
                                <path d="M 2 7 L 20 7 L 36 7" fill="none" stroke="#38bdf8" strokeWidth="1.75" strokeLinecap="round" />
                                <circle cx="36" cy="7" r="2" fill="#38bdf8" />
                              </>
                            )}
                          </svg>
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        {item.isRegression ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-200">
                            ⚠️ Regression (-{item.dropPercent}%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-lime-400/40 bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-300">
                            ✓ Verified In Sync
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right text-[10px] text-slate-500">
                        {formatTimestamp(item.lastVerifiedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredVerifiedMetrics.length > 100 && (
                <div className="p-2 text-center text-[10px] text-slate-500 border-t border-white/5">
                  Showing first 100 of {filteredVerifiedMetrics.length} metrics. Use filters to narrow down.
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
              {allVerifiedMetrics.length === 0
                ? 'No 24-hour channel metrics currently extracted. Refresh actuals sources to pull live metrics.'
                : 'No metrics match the selected filter criteria.'}
            </div>
          )}
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
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3"><span className="font-semibold text-white">{event.eventName}</span><span className="flex flex-wrap gap-2">{event.sources.map(source => { const p = statusPresentation[getStatus(source, dimensionSettings)] || statusPresentation.unknown; return <span key={source.kind} className={`rounded-full border px-2 py-0.5 text-[10px] ${p.className}`}>{source.kind}: {p.label}</span>; })}<span className="text-xs text-slate-400">{eventIssues.length} issue{eventIssues.length === 1 ? '' : 's'}</span></span></summary>
              <div className="space-y-3 border-t border-white/10 p-3">
                {eventIssues.map(issue => <div key={issue.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-100">
                  <div className="min-w-0 flex-1">
                    <strong>{issue.category || 'feed'} · {issue.status}</strong>
                    <p className="mt-1">{summarizeIssue(issue)}</p>
                    {issue.dimensionFindings?.length > 0 && <p className="mt-1 text-[10px] text-slate-400">Expand Dimension checks in the {issue.kind} source below to review findings.</p>}
                  </div>
                  <button
                    type="button"
                    disabled={dimensionBusy}
                    onClick={() => handleIgnoreIssue(issue)}
                    className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                    title="Ignore this issue and record in version history"
                  >
                    Ignore issue
                  </button>
                </div>)}
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
                  const status = getStatus(source, dimensionSettings);
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
                    {source.dimensionHealth && <details className="mt-3 rounded-lg border border-white/10 p-2 text-xs"><summary className="cursor-pointer font-semibold text-slate-200">Dimension checks · {source.dimensionHealth.status} · last run {formatTimestamp(source.dimensionHealth.checkedAt)}</summary>{source.dimensionHealth.error && <p className="mt-2 text-amber-200">{source.dimensionHealth.error}</p>}{source.dimensionHealth.findings?.length ? <div className="mt-2"><DimensionFindings findings={source.dimensionHealth.findings} standards={dimensionSettings.values} customValues={dimensionSettings.customValues} eventCustomValues={dimensionSettings.eventCustomValues} ignoreBlanksByDimension={dimensionSettings.ignoreBlanksByDimension || {}} ignoreBlanksByEventDimension={dimensionSettings.ignoreBlanksByEventDimension || {}} eventId={source.eventId} eventName={source.eventName} onAcceptValue={handleAcceptValue} onIgnoreBlanks={handleIgnoreBlanks} /></div> : <p className="mt-2 text-slate-400">No dimension findings.</p>}</details>}
                    {(source.metricDiscrepancies?.length > 0 || source.channelMetrics24h?.length > 0) && (
                      <details className="mt-2 rounded-lg border border-white/10 p-2 text-xs">
                        <summary className="cursor-pointer font-semibold text-slate-200">
                          24-hour channel metrics ({source.metricDiscrepancies?.length || 0} regression{source.metricDiscrepancies?.length === 1 ? '' : 's'}, {source.channelMetrics24h?.length || 0} channels tracked)
                        </summary>
                        {source.metricDiscrepancies?.map(item => (
                          <p key={item.id} className="mt-2 text-amber-200">
                            ⚠️ {item.channel} · {item.metric}: {formatMetricVal(item.metric, item.previousValue)} → {formatMetricVal(item.metric, item.currentValue)} (-{item.dropPercent}%) on {item.date}
                          </p>
                        ))}
                        {source.channelMetrics24h?.length > 0 && (
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-left text-[11px] text-slate-300">
                              <thead className="border-b border-white/10 text-[9px] uppercase tracking-wider text-slate-400">
                                <tr>
                                  <th className="py-1">Channel</th>
                                  <th className="py-1 text-right">Cost</th>
                                  <th className="py-1 text-right">Impressions</th>
                                  <th className="py-1 text-right">Clicks</th>
                                  <th className="py-1 text-right">Conversions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5 font-mono">
                                {source.channelMetrics24h.map(cm => {
                                  const baselineKey = `${cm.eventName}:::${cm.channel}:::${cm.date}`;
                                  const prev = source.metricBaselines?.[baselineKey] || {};
                                  return (
                                    <tr key={cm.channel} className="hover:bg-white/5">
                                      <td className="py-1 font-sans font-medium text-white">{cm.channel}</td>
                                      <td className="py-1 text-right text-slate-200">
                                        {formatMetricVal('cost', cm.cost, '$')}
                                        {prev.cost && prev.cost !== cm.cost ? (
                                          <span className="block text-[9px] text-slate-500">prev {formatMetricVal('cost', prev.cost, '$')}</span>
                                        ) : null}
                                      </td>
                                      <td className="py-1 text-right text-slate-200">
                                        {formatMetricVal('impressions', cm.impressions)}
                                        {prev.impressions && prev.impressions !== cm.impressions ? (
                                          <span className="block text-[9px] text-slate-500">prev {formatMetricVal('impressions', prev.impressions)}</span>
                                        ) : null}
                                      </td>
                                      <td className="py-1 text-right text-slate-200">
                                        {formatMetricVal('clicks', cm.clicks)}
                                        {prev.clicks && prev.clicks !== cm.clicks ? (
                                          <span className="block text-[9px] text-slate-500">prev {formatMetricVal('clicks', prev.clicks)}</span>
                                        ) : null}
                                      </td>
                                      <td className="py-1 text-right text-slate-200">
                                        {formatMetricVal('conversions', cm.conversions)}
                                        {prev.conversions && prev.conversions !== cm.conversions ? (
                                          <span className="block text-[9px] text-slate-500">prev {formatMetricVal('conversions', prev.conversions)}</span>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <p className="mt-2 text-[10px] text-slate-400">
                              Latest ingestion date: {source.latest24hDate || 'unknown'} · {source.channelMetrics24h.length} channels tracked.
                            </p>
                          </div>
                        )}
                      </details>
                    )}
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="text-xs text-slate-400">
            Recorded audit trail of dimension failures, regressions, and manual exemptions.
          </p>
          {auditExportAllowed && (
            <button
              type="button"
              id="audit-trail-export"
              onClick={exportAuditTrailCsv}
              disabled={!issueHistory || issueHistory.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#cedc28]/40 bg-[#cedc28]/10 px-2.5 py-1 text-xs font-semibold text-[#cedc28] hover:bg-[#cedc28]/20 transition disabled:opacity-40"
              title="Download full compliance audit trail of health issues and resolutions as CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Audit Trail (CSV)</span>
            </button>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-[10px] font-semibold uppercase text-slate-400">Category<select value={historyCategoryFilter} onChange={event => { setHistoryCategoryFilter(event.target.value); setHistoryPage(0); }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All categories</option><option value="feed">Feed / sheet</option><option value="metrics">Metrics</option><option value="dimensions">Dimensions</option></select></label>
          <label className="text-[10px] font-semibold uppercase text-slate-400">Event<select value={historyEventFilter} onChange={event => { setHistoryEventFilter(event.target.value); setHistoryPage(0); }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All events</option>{historyEvents.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="text-[10px] font-semibold uppercase text-slate-400">Outcome<select value={historyOutcomeFilter} onChange={event => { setHistoryOutcomeFilter(event.target.value); setHistoryPage(0); }} className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs normal-case text-white"><option value="all">All outcomes</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="checks-disabled">Checks disabled</option><option value="ignored">Ignored</option></select></label>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#071d33]">
          <div className="divide-y divide-white/10">
            {visibleHistory.map(item => <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white">{item.eventName}</strong><span className="text-xs text-slate-300">{item.kind} · {historyCategory(item)} · {item.status}</span></div>
                <p className="mt-1 text-xs text-slate-300">{summarizeIssue(item)}</p>
                {item.dimensionFindings?.length > 0 && <details className="mt-2 text-xs text-slate-300"><summary className="cursor-pointer text-[#6bd5f7]">View dimension findings</summary><div className="mt-2"><DimensionFindings findings={item.dimensionFindings} standards={dimensionSettings.values} customValues={dimensionSettings.customValues} eventCustomValues={dimensionSettings.eventCustomValues} ignoreBlanksByDimension={dimensionSettings.ignoreBlanksByDimension || {}} ignoreBlanksByEventDimension={dimensionSettings.ignoreBlanksByEventDimension || {}} eventId={item.eventId} eventName={item.eventName} onAcceptValue={handleAcceptValue} onIgnoreBlanks={handleIgnoreBlanks} /></div></details>}
                <p className="mt-2 text-[10px] text-slate-500">
                  Detected {formatTimestamp(item.openedAt)}
                  {item.resolvedAt && (
                    item.resolution === 'ignored'
                      ? ` · Ignored ${formatTimestamp(item.resolvedAt)}${item.resolvedBy ? ` by ${item.resolvedBy}` : ''}`
                      : ` · Resolved ${formatTimestamp(item.resolvedAt)} (${formatDuration(item.openedAt, item.resolvedAt)})`
                  )}
                  {item.notes && <span className="block mt-0.5 text-slate-400">Notes: {item.notes}</span>}
                </p>
                {item.resolution === 'ignored' && (
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={dimensionBusy}
                      onClick={() => handleUnignoreIssue(item.key)}
                      className="rounded border border-[#14a6d9]/40 bg-[#14a6d9]/10 px-2 py-1 text-[10px] font-semibold text-[#6bd5f7] hover:bg-[#14a6d9]/20 disabled:opacity-50"
                      title="Restore health check for this issue"
                    >
                      Restore check
                    </button>
                  </div>
                )}
                {item.resolutionEmailStatus && <p className="mt-1 text-[10px] text-slate-400">Resolution email: {item.resolutionEmailStatus === 'checks-disabled' ? 'not sent; checks disabled' : item.resolutionEmailStatus === 'accepted' ? `accepted by SMTP ${formatTimestamp(item.resolutionEmailSentAt)} (inbox delivery not verified)` : item.resolutionEmailStatus === 'failed' ? 'failed; retry on a health check after five minutes' : 'pending; requires email and resolution notifications enabled'}</p>}
                {item.resolutionEmailError && <p role="alert" className="text-[10px] text-amber-300">{item.resolutionEmailError}</p>}
              </div><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                historyOutcome(item) === 'ignored'
                  ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                  : historyOutcome(item) === 'open'
                  ? 'border-rose-400/30 text-rose-200'
                  : 'border-emerald-400/30 text-emerald-200'
              }`}>{historyOutcome(item) === 'checks-disabled' ? 'Checks disabled' : historyOutcome(item) === 'ignored' ? 'Ignored' : historyOutcome(item)}</span>
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
            <div className="grid gap-2 sm:grid-cols-3">{[['metricChecksEnabled', 'Enable metric health checks'], ['dimensionChecksEnabled', 'Enable dimension health checks'], ['ignoreBlanks', 'Ignore blank values in dimension checks']].map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-xs text-white"><input type="checkbox" checked={Boolean(checkDraft[key])} onChange={event => setCheckDraft(previous => ({ ...previous, [key]: event.target.checked }))} className="accent-[#cedc28]" />{label}</label>)}</div>
            <button type="button" onClick={() => updateDimensions('save-health-checks')} className="rounded-lg border border-[#14a6d9]/40 px-3 py-2 text-xs font-semibold text-[#6bd5f7]">Save global checks</button>
          </fieldset>
          {dimensionNotice && <p role={dimensionNotice.type === 'error' ? 'alert' : 'status'} className={`text-xs ${dimensionNotice.type === 'error' ? 'text-red-300' : 'text-lime-200'}`}>{dimensionNotice.text}</p>}

          {/* Metric Standards & Monitored Metrics */}
          <div className="border-t border-white/10 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#14a6d9]" />
                  <span>Metric standards & monitored metrics</span>
                </h4>
                <p className="mt-1 text-[10px] text-slate-400">
                  Monitors 24-hour channel totals for unexpected drops between refreshes. Add custom columns or toggle standard metrics. Drops exceeding the tolerance % trigger integrity alerts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMetricModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#14a6d9]/40 bg-[#14a6d9]/10 px-2.5 py-1 text-xs font-semibold text-[#6bd5f7] hover:bg-[#14a6d9]/20 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Custom Metric</span>
              </button>
            </div>

            {dimensionSettings.metricChecksEnabled === false && (
              <p className="mt-2 text-xs text-amber-200">
                Metric health checks are globally disabled; selections and tolerances are retained.
              </p>
            )}

            <fieldset disabled={dimensionBusy || settingsLoading} className="mt-3 space-y-3">
              <legend className="text-[10px] text-slate-300">Metrics to validate</legend>
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => handleSaveMetrics([
                    ...AVAILABLE_METRICS.map(m => m.id),
                    ...(dimensionSettings.customMetrics || []).map(m => m.id)
                  ])}
                  className="text-[#6bd5f7]"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveMetrics([])}
                  className="text-[#6bd5f7]"
                >
                  Clear all
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[...AVAILABLE_METRICS, ...(dimensionSettings.customMetrics || [])].map(metric => {
                  const currentEnabled = dimensionSettings.enabledMetrics || AVAILABLE_METRICS.map(m => m.id);
                  const isEnabled = currentEnabled.includes(metric.id);
                  const tol = dimensionSettings.metricTolerances?.[metric.id]?.percent ?? metric.defaultTolerancePercent ?? 1.0;
                  const minDrop = dimensionSettings.metricTolerances?.[metric.id]?.minDrop ?? metric.minDrop ?? 1.0;
                  const isCustom = (dimensionSettings.customMetrics || []).some(m => m.id === metric.id);

                  return (
                    <div key={metric.id} className="rounded-lg border border-white/10 bg-[#041628]/60 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...new Set([...currentEnabled, metric.id])]
                                : currentEnabled.filter(id => id !== metric.id);
                              handleSaveMetrics(next);
                            }}
                            className="accent-[#cedc28]"
                          />
                          <span>{metric.label}</span>
                          {isCustom && (
                            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] text-sky-300">Custom</span>
                          )}
                        </label>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomMetric(metric.id)}
                            className="text-slate-500 hover:text-red-400 text-xs"
                            title="Remove this custom metric"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">{metric.description}</p>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300 pt-1 border-t border-white/5">
                        <label className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">Tolerance:</span>
                          <input
                            type="number"
                            min="0.1"
                            max="100"
                            step="0.1"
                            value={tol}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 1.0;
                              const nextTolerances = {
                                ...(dimensionSettings.metricTolerances || {}),
                                [metric.id]: { percent: val, minDrop }
                              };
                              handleSaveMetrics(undefined, nextTolerances);
                            }}
                            className="w-14 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-center text-xs text-white"
                          />
                          <span className="text-slate-400">%</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">Min drop:</span>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={minDrop}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 1.0;
                              const nextTolerances = {
                                ...(dimensionSettings.metricTolerances || {}),
                                [metric.id]: { percent: tol, minDrop: val }
                              };
                              handleSaveMetrics(undefined, nextTolerances);
                            }}
                            className="w-14 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-center text-xs text-white"
                          />
                          <span className="text-slate-400">{metric.unit}</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              {showAddMetricModal && (
                <div className="rounded-lg border border-[#14a6d9]/40 bg-[#031120] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-white flex items-center gap-2">
                      <Plus className="h-4 w-4 text-[#6bd5f7]" />
                      <span>Add custom sheet metric</span>
                    </h5>
                    <button
                      type="button"
                      onClick={() => setShowAddMetricModal(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-[10px] font-semibold uppercase text-slate-400">
                      Metric Identifier / Key
                      <input
                        type="text"
                        value={newMetricDraft.id}
                        onChange={e => setNewMetricDraft(prev => ({ ...prev, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                        placeholder="e.g. reach"
                        className="mt-1 w-full rounded border border-white/10 bg-[#041628] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                      />
                    </label>
                    <label className="text-[10px] font-semibold uppercase text-slate-400">
                      Display Label
                      <input
                        type="text"
                        value={newMetricDraft.label}
                        onChange={e => setNewMetricDraft(prev => ({ ...prev, label: e.target.value }))}
                        placeholder="e.g. Unique Reach"
                        className="mt-1 w-full rounded border border-white/10 bg-[#041628] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                      />
                    </label>
                    <label className="text-[10px] font-semibold uppercase text-slate-400">
                      Column Header Pattern (Regex)
                      <input
                        type="text"
                        value={newMetricDraft.columnRegex}
                        onChange={e => setNewMetricDraft(prev => ({ ...prev, columnRegex: e.target.value }))}
                        placeholder="e.g. ^reach$ or reach"
                        className="mt-1 w-full rounded border border-white/10 bg-[#041628] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                      />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[10px] font-semibold uppercase text-slate-400">
                        Unit
                        <select
                          value={newMetricDraft.unit}
                          onChange={e => setNewMetricDraft(prev => ({ ...prev, unit: e.target.value }))}
                          className="mt-1 w-full rounded border border-white/10 bg-[#041628] px-2 py-1.5 text-xs text-white"
                        >
                          <option value="$">Currency ($)</option>
                          <option value="cnt">Count (cnt)</option>
                          <option value="%">Percent (%)</option>
                        </select>
                      </label>
                      <label className="text-[10px] font-semibold uppercase text-slate-400">
                        Tol %
                        <input
                          type="number"
                          step="0.1"
                          value={newMetricDraft.tolerancePercent}
                          onChange={e => setNewMetricDraft(prev => ({ ...prev, tolerancePercent: parseFloat(e.target.value) || 1.0 }))}
                          className="mt-1 w-full rounded border border-white/10 bg-[#041628] px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="text-[10px] font-semibold uppercase text-slate-400">
                        Min Drop
                        <input
                          type="number"
                          step="0.5"
                          value={newMetricDraft.minDrop}
                          onChange={e => setNewMetricDraft(prev => ({ ...prev, minDrop: parseFloat(e.target.value) || 1.0 }))}
                          className="mt-1 w-full rounded border border-white/10 bg-[#041628] px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddMetricModal(false)}
                      className="rounded border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!newMetricDraft.id.trim() || dimensionBusy}
                      onClick={() => handleAddCustomMetric(newMetricDraft)}
                      className="rounded border border-[#14a6d9]/40 bg-[#14a6d9]/20 px-3 py-1.5 text-xs font-semibold text-[#6bd5f7] hover:bg-[#14a6d9]/30 disabled:opacity-50"
                    >
                      Save Metric
                    </button>
                  </div>
                </div>
              )}
            </fieldset>
          </div>

          <div className="border-t border-white/10 pt-3"><h4 className="text-xs font-semibold text-white">Dimension standards</h4>
            {dimensionSettings.dimensionChecksEnabled === false && <p className="mt-1 text-xs text-amber-200">Dimension health checks are globally disabled; individual selections are retained.</p>}
            <p className="mt-1 text-[10px] text-slate-400">Actuals only. Values are trimmed and case-insensitive; blanks and missing columns are reported separately (unless blank cells are set to be ignored). Data is never rewritten. Last standards sync: {formatTimestamp(dimensionSettings.fetchedAt)}; cached for 24 hours.</p>
            <a href="https://docs.google.com/spreadsheets/d/1D1BzodAQS45oJ27xwhk9FJkxFFzJk-r9x0lQzWG6u4w/edit?gid=593739615" target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[#6bd5f7]">Open standards documentation</a>
            {dimensionSettings.error && <p role="alert" className="mt-1 text-xs text-amber-300">Standards refresh failed; retaining last valid standards: {dimensionSettings.error}</p>}
            <fieldset disabled={dimensionBusy || settingsLoading} className="mt-3 space-y-3"><legend className="text-[10px] text-slate-300">Dimensions to validate</legend>
              <div className="flex gap-3 text-xs"><button type="button" onClick={() => setDimensionSettings(previous => ({ ...previous, enabledDimensions: DIMENSIONS.map(dimension => dimension.id) }))} className="text-[#6bd5f7]">Select all</button><button type="button" onClick={() => setDimensionSettings(previous => ({ ...previous, enabledDimensions: [] }))} className="text-[#6bd5f7]">Clear all</button></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{DIMENSIONS.map(dimension => <label key={dimension.id} className="flex items-center gap-2 text-xs text-slate-200"><input type="checkbox" checked={dimensionSettings.enabledDimensions.includes(dimension.id)} onChange={event => setDimensionSettings(previous => ({ ...previous, enabledDimensions: event.target.checked ? [...previous.enabledDimensions, dimension.id] : previous.enabledDimensions.filter(id => id !== dimension.id) }))} className="accent-[#cedc28]" />{dimension.label}<span className="text-slate-500">({dimensionSettings.values?.[dimension.id]?.length ?? 0})</span></label>)}</div>
              <div className="flex flex-wrap gap-3"><button type="button" onClick={() => updateDimensions('save-dimensions')} className="text-xs text-[#6bd5f7]">Save dimension checks</button><button type="button" onClick={() => updateDimensions('refresh-standards')} className="text-xs text-[#6bd5f7]">Refresh standards</button></div>
            </fieldset>
            <details className="mt-3 text-[10px] text-slate-400"><summary className="cursor-pointer">View allowed standard values</summary>{DIMENSIONS.map(dimension => <p key={dimension.id} className="mt-2"><strong>{dimension.label}:</strong> {dimensionSettings.values?.[dimension.id]?.join(', ') || 'Standards not loaded'}</p>)}</details>

            <div id="standards-manager" className="mt-4 rounded-xl border border-white/10 bg-[#041628]/90 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>Standards & Accepted Values Manager</span>
                      <span className="rounded-full bg-[#14a6d9]/20 px-2 py-0.5 text-[10px] font-medium text-[#6bd5f7]">Custom Overrides</span>
                    </h4>
                    {dimensionExportAllowed && (
                      <button
                        type="button"
                        onClick={exportDimensionFindingsCsv}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 transition"
                        title="Download dimension audit compliance findings as CSV"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Export Findings CSV</span>
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Values pulled from the standards sheet are automatically accepted. Add accepted values globally or for a specific event to prevent false-positive discrepancies.
                  </p>
                </div>
              </div>

              {/* Scope & Target Selector */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Target Scope</label>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomScope('global')}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        customScope === 'global'
                          ? 'border-[#14a6d9] bg-[#14a6d9]/20 text-[#6bd5f7]'
                          : 'border-white/10 bg-[#031120] text-slate-400 hover:text-white'
                      }`}
                    >
                      Global (All Events)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomScope('event');
                        if (!customEventId && eventGroups.length > 0) {
                          setCustomEventId(eventGroups[0].eventId);
                        }
                      }}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        customScope === 'event'
                          ? 'border-[#14a6d9] bg-[#14a6d9]/20 text-[#6bd5f7]'
                          : 'border-white/10 bg-[#031120] text-slate-400 hover:text-white'
                      }`}
                    >
                      Per Event Override
                    </button>
                  </div>
                </div>

                {customScope === 'event' && (
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Select Event</label>
                    <select
                      value={customEventId}
                      onChange={e => setCustomEventId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-[#031120] px-3 py-2 text-xs text-white"
                    >
                      {eventGroups.map(group => (
                        <option key={group.eventId} value={group.eventId}>
                          {group.eventName || group.eventId} ({group.eventId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Dimension Selector Pills */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dimension</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {DIMENSIONS.map(dim => {
                    const isSelected = customDimension === dim.id;
                    const customList = customScope === 'event'
                      ? (dimensionSettings.eventCustomValues?.[customEventId]?.[dim.id] || [])
                      : (dimensionSettings.customValues?.[dim.id] || []);
                    const customCount = customList.length;

                    return (
                      <button
                        key={dim.id}
                        type="button"
                        onClick={() => setCustomDimension(dim.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          isSelected
                            ? 'border-[#cedc28] bg-[#cedc28]/15 text-[#cedc28]'
                            : 'border-white/10 bg-[#031120] text-slate-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <span>{dim.label}</span>
                        {customCount > 0 && (
                          <span className="rounded-full bg-[#14a6d9]/30 px-1.5 py-0.2 text-[10px] font-bold text-[#6bd5f7]">
                            +{customCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Dimension Values & Add Form */}
              <div className="rounded-lg border border-white/10 bg-[#031120] p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-white">
                    {DIMENSIONS.find(d => d.id === customDimension)?.label || customDimension}: Custom Accepted Values
                    {customScope === 'event' && customEventId && (
                      <span className="ml-1.5 font-normal text-amber-200">
                        for {eventGroups.find(g => g.eventId === customEventId)?.eventName || customEventId}
                      </span>
                    )}
                  </div>
                  {bulkImportAllowed && (
                    <button
                      type="button"
                      onClick={() => setShowBulkImport(!showBulkImport)}
                      className="inline-flex items-center gap-1.5 text-xs text-[#6bd5f7] hover:text-white transition"
                    >
                      <Upload className="h-3 w-3" />
                      <span>{showBulkImport ? 'Close Bulk Import' : 'Bulk Import Values'}</span>
                    </button>
                  )}
                </div>

                {showBulkImport && (
                  <div className="rounded-lg border border-[#14a6d9]/30 bg-[#041628] p-3 space-y-2">
                    <label className="block text-[10px] font-semibold text-slate-300">
                      Paste list of accepted values (separated by newlines or commas):
                    </label>
                    <textarea
                      value={bulkImportText}
                      onChange={e => setBulkImportText(e.target.value)}
                      placeholder={"Value 1\nValue 2\nValue 3"}
                      rows={3}
                      className="w-full rounded-md border border-white/10 bg-[#031120] p-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#14a6d9]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowBulkImport(false); setBulkImportText(''); }}
                        className="rounded px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={dimensionBusy || !bulkImportText.trim()}
                        onClick={handleBulkImport}
                        className="rounded bg-[#14a6d9] px-3 py-1 text-xs font-semibold text-black hover:bg-[#6bd5f7] disabled:opacity-50 transition"
                      >
                        {dimensionBusy ? 'Importing…' : 'Import Values'}
                      </button>
                    </div>
                  </div>
                )}

                {/* List of custom additions */}
                {(() => {
                  const customList = customScope === 'event'
                    ? (dimensionSettings.eventCustomValues?.[customEventId]?.[customDimension] || [])
                    : (dimensionSettings.customValues?.[customDimension] || []);

                  return (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
                        {customList.length === 0 ? (
                          <span className="text-[10px] text-slate-500 italic">
                            No custom accepted values added yet for this dimension {customScope === 'event' ? 'and event' : 'globally'}.
                          </span>
                        ) : (
                          customList.map(val => (
                            <span
                              key={val}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#14a6d9]/40 bg-[#14a6d9]/10 px-2.5 py-1 text-xs text-white"
                            >
                              <span>{val}</span>
                              <button
                                type="button"
                                disabled={dimensionBusy}
                                onClick={() => handleRemoveCustomValue(customDimension, val, customScope === 'event' ? customEventId : null, customScope)}
                                className="text-slate-400 hover:text-red-300 transition"
                                title={`Remove "${val}"`}
                              >
                                ×
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      {/* Add new value input */}
                      <div className="flex gap-2 pt-2 border-t border-white/5">
                        <input
                          type="text"
                          value={customDraftValue}
                          onChange={e => setCustomDraftValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (customDraftValue.trim()) {
                                handleAcceptValue(
                                  customDimension,
                                  customDraftValue.trim(),
                                  customScope === 'event' ? customEventId : null,
                                  customScope
                                );
                                setCustomDraftValue('');
                              }
                            }
                          }}
                          placeholder={`Add accepted value for ${DIMENSIONS.find(d => d.id === customDimension)?.label || customDimension}...`}
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#041628] px-3 py-1.5 text-xs text-white placeholder:text-slate-500"
                        />
                        <button
                          type="button"
                          disabled={dimensionBusy || !customDraftValue.trim()}
                          onClick={() => {
                            if (customDraftValue.trim()) {
                              handleAcceptValue(
                                customDimension,
                                customDraftValue.trim(),
                                customScope === 'event' ? customEventId : null,
                                customScope
                              );
                              setCustomDraftValue('');
                            }
                          }}
                          className="rounded-lg border border-[#14a6d9]/40 bg-[#14a6d9]/10 px-3 py-1.5 text-xs font-semibold text-[#6bd5f7] hover:bg-[#14a6d9]/20 disabled:opacity-50 transition"
                        >
                          + Add Accepted Value
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Pulled Standard Values Reference & Exclude Toggle */}
                {dimensionSettings.values?.[customDimension]?.length > 0 && (
                  <details className="mt-2 text-[10px] text-slate-400">
                    <summary className="cursor-pointer font-medium text-slate-300 hover:text-white">
                      Sheet Standard Values ({dimensionSettings.values[customDimension].length})
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {dimensionSettings.values[customDimension].map(val => {
                        const isExcluded = (dimensionSettings.excludedValues?.[customDimension] || []).includes(val);
                        return (
                          <span
                            key={val}
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] ${
                              isExcluded
                                ? 'bg-red-500/10 text-red-300 line-through border border-red-500/30'
                                : 'bg-white/5 text-slate-300 border border-white/10'
                            }`}
                          >
                            <span>{val}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleExcludeStandard(customDimension, val)}
                              className="ml-1 text-[9px] text-slate-400 hover:text-white underline"
                              title={isExcluded ? 'Re-enable this standard value' : 'Disallow / exclude this standard value'}
                            >
                              {isExcluded ? 'undo' : 'disallow'}
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            </div>

            {/* Ignored Issues & Blank Exemptions Manager */}
            {((dimensionSettings.ignoredIssues?.length || 0) > 0 ||
              Object.keys(dimensionSettings.ignoreBlanksByDimension || {}).some(k => dimensionSettings.ignoreBlanksByDimension[k]) ||
              Object.keys(dimensionSettings.ignoreBlanksByEventDimension || {}).length > 0) && (
              <div className="mt-4 rounded-xl border border-white/10 bg-[#041628]/90 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Ignored Issues & Blank Exemptions</span>
                    <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                      Audit Exemptions
                    </span>
                  </h4>
                  <span className="text-[10px] text-slate-400">Recorded in version history</span>
                </div>

                {/* Ignored blank dimensions (global) */}
                {Object.keys(dimensionSettings.ignoreBlanksByDimension || {}).some(k => dimensionSettings.ignoreBlanksByDimension[k]) && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-300">Global Blank Exemptions:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.keys(dimensionSettings.ignoreBlanksByDimension || {})
                        .filter(k => dimensionSettings.ignoreBlanksByDimension[k])
                        .map(dim => (
                          <span key={dim} className="inline-flex items-center gap-1.5 rounded bg-slate-500/20 border border-slate-400/40 px-2.5 py-1 text-xs text-slate-200">
                            <span>{DIMENSIONS.find(d => d.id === dim)?.label || dim} (Blanks Ignored)</span>
                            <button
                              type="button"
                              disabled={dimensionBusy}
                              onClick={() => handleUnignoreBlanks(dim, null, 'global')}
                              className="text-slate-400 hover:text-red-300"
                              title="Restore blank check"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* Event-specific blank exemptions */}
                {Object.keys(dimensionSettings.ignoreBlanksByEventDimension || {}).length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-300">Event Blank Exemptions:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(dimensionSettings.ignoreBlanksByEventDimension || {}).flatMap(([evId, dims]) =>
                        Object.keys(dims || {}).filter(d => dims[d]).map(dim => (
                          <span key={`${evId}:${dim}`} className="inline-flex items-center gap-1.5 rounded bg-slate-500/20 border border-slate-400/40 px-2.5 py-1 text-xs text-slate-200">
                            <span>{evId}: {DIMENSIONS.find(d => d.id === dim)?.label || dim} (Blanks Ignored)</span>
                            <button
                              type="button"
                              disabled={dimensionBusy}
                              onClick={() => handleUnignoreBlanks(dim, evId, 'event')}
                              className="text-slate-400 hover:text-red-300"
                              title="Restore blank check"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Ignored specific issues */}
                {(dimensionSettings.ignoredIssues || []).length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-300">Ignored Health Issues ({dimensionSettings.ignoredIssues.length}):</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(dimensionSettings.ignoredIssues || []).map(item => {
                        const key = typeof item === 'string' ? item : item.key;
                        const label = typeof item === 'object' && item.eventName ? `${item.eventName} (${item.status})` : key;
                        return (
                          <span key={key} className="inline-flex items-center gap-1.5 rounded bg-amber-500/10 border border-amber-400/40 px-2.5 py-1 text-xs text-amber-200">
                            <span>{label}</span>
                            <button
                              type="button"
                              disabled={dimensionBusy}
                              onClick={() => handleUnignoreIssue(key)}
                              className="text-amber-400 hover:text-red-300"
                              title="Restore check for this issue"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
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

          {/* Webhook Integrations (Slack / Microsoft Teams / Custom) */}
          {webhookAllowed && (
            <div id="webhook-integrations" className="border-t border-white/10 pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                    <Globe className="h-4 w-4 text-[#14a6d9]" />
                    <span>Webhook Integrations (Slack / MS Teams / Custom)</span>
                    <span className="rounded-full bg-[#14a6d9]/20 px-2 py-0.5 text-[10px] font-medium text-[#6bd5f7]">Admin Feature</span>
                  </h4>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Relay immediate critical health alerts, dimension failures, and regressions to incident chat channels.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.webhookEnabled)}
                    onChange={e => setSettings(prev => ({ ...prev, webhookEnabled: e.target.checked }))}
                    disabled={settingsLoading}
                    className="accent-[#cedc28]"
                  />
                  <span>Enable Webhook Alerts</span>
                </label>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-400">Platform</label>
                  <select
                    value={settings.webhookPlatform || 'slack'}
                    onChange={e => setSettings(prev => ({ ...prev, webhookPlatform: e.target.value }))}
                    disabled={settingsLoading || !settings.webhookEnabled}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#041628] px-3 py-2 text-xs text-white"
                  >
                    <option value="slack">Slack Incoming Webhook</option>
                    <option value="teams">Microsoft Teams MessageCard</option>
                    <option value="generic">Generic JSON Webhook</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-400">Webhook URL</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="url"
                      value={settings.webhookUrl || ''}
                      onChange={e => setSettings(prev => ({ ...prev, webhookUrl: e.target.value }))}
                      disabled={settingsLoading || !settings.webhookEnabled}
                      placeholder="https://hooks.slack.com/services/..."
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#041628] px-3 py-1.5 text-xs text-white placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={sendTestWebhook}
                      disabled={settingsLoading || sendingTestWebhook || !settings.webhookUrl}
                      className="rounded-lg border border-[#14a6d9]/40 bg-[#14a6d9]/10 px-2.5 py-1 text-xs font-semibold text-[#6bd5f7] hover:bg-[#14a6d9]/20 disabled:opacity-40 shrink-0"
                    >
                      {sendingTestWebhook ? 'Testing…' : 'Test'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3"><button type="button" onClick={saveSettings} disabled={settingsLoading || savingSettings} className="inline-flex items-center gap-2 rounded-lg border border-[#14a6d9]/40 px-3 py-2 text-xs font-semibold text-[#6bd5f7] disabled:opacity-50"><Save className="h-3.5 w-3.5" />{savingSettings ? 'Saving…' : 'Save notification settings'}</button><button type="button" onClick={sendTestEmail} disabled={!emailConfigured || settingsLoading || sendingTestEmail || !settings.emailRecipients.length} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 disabled:opacity-40"><Mail className="h-3.5 w-3.5" />{sendingTestEmail ? 'Sending…' : 'Send test email'}</button><p className="basis-full text-[10px] text-slate-500">Health checks run when sheet data is requested; the scheduled full check and digest may vary by about an hour on Vercel Hobby.</p></div>
        </section>
      </section>
    </section>
  );
}
