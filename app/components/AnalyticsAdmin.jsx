"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Users, Eye, Compass, Globe, Filter, Activity, RefreshCw, 
  Search, TrendingUp, Sparkles, CheckCircle2, Clock,
  Shield, Laptop, MapPin, Zap, AlertTriangle,
  ArrowRight, Settings, Download, Monitor, Sliders,
  Gauge, Cpu, AlertCircle, PlayCircle,
  RotateCcw, ShieldCheck, History
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useLowQuotaMode } from './DashboardFeatureContext';
import { AdminTabs, useAdminView, useAdminDirtyGuard } from './AdminUI';

const ANALYTICS_VIEWS = ['overview', 'users', 'activity', 'performance', 'recommendations', 'optimizations'];
const ANALYTICS_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'activity', label: 'Activity' },
  { id: 'performance', label: 'Performance' },
  { id: 'recommendations', label: 'Recommendations' },
];

export default function AnalyticsAdmin({ currentUserEmail = 'admin@tahaluf.com', active = true }) {
  const lowQuotaMode = useLowQuotaMode();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('all');
  const [subView, setSubView] = useAdminView('analyticsView', 'overview', ANALYTICS_VIEWS);
  const [findingCategory, setFindingCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [sortField, setSortField] = useState('lastActive');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [userFilter, setUserFilter] = useState('non_admin'); // 'non_admin' (default) | 'all' | 'admin_only'
  const [selectedUserEmail, setSelectedUserEmail] = useState('');
  const [activityLimit, setActivityLimit] = useState(25); // 10 | 25 | 50 | 100
  const [diagnosticProbeResults, setDiagnosticProbeResults] = useState({});
  const [activitySearch, setActivitySearch] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState(null);
  const [loadedScope, setLoadedScope] = useState('');
  const [pageVisible, setPageVisible] = useState(true);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const actionDialog = useRef(null);
  const requestId = useRef(0);
  const refreshRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const scopeKey = JSON.stringify([timeRange, userFilter, selectedUserEmail]);
  useAdminDirtyGuard('analytics', Boolean(pendingAction && actionReason !== pendingAction.reason));

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    const dialog = actionDialog.current;
    if (pendingAction && active && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [pendingAction, active]);

  const viewerTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dubai';
    } catch {
      return 'Asia/Dubai';
    }
  }, []);

  const viewerTzShort = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: viewerTimeZone,
        timeZoneName: 'short',
      }).formatToParts(new Date());
      return parts.find(p => p.type === 'timeZoneName')?.value || 'Local';
    } catch {
      return 'Local';
    }
  }, [viewerTimeZone]);

  const fetchAnalytics = async () => {
    if (!activeRef.current) return;
    const id = ++requestId.current;
    setIsRefreshing(true);
    try {
      const email = currentUserEmail || auth.currentUser?.email || 'admin@tahaluf.com';
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      headers['x-admin-email'] = email;

      const url = `/api/admin/analytics?timeRange=${timeRange}&timeZone=${encodeURIComponent(viewerTimeZone)}&userRoleFilter=${userFilter}&userEmail=${encodeURIComponent(selectedUserEmail)}&email=${encodeURIComponent(email)}`;
      if (!activeRef.current || id !== requestId.current) return;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch analytics data');
      }
      const json = await res.json();
      if (id !== requestId.current) return;
      setData(json);
      setLoadedScope(scopeKey);
      setLastSuccessfulRefresh(new Date().toISOString());
      setError(null);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      if (id === requestId.current) setError(err.message);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };
  refreshRef.current = fetchAnalytics;

  useEffect(() => {
    if (!active) return;
    fetchAnalytics();
    let timer;

    // Keep live telemetry available without polling on every few seconds of dwell.
    if (!lowQuotaMode) timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchAnalytics(true);
      }
    }, 30000);

    return () => {
      clearInterval(timer);
      requestId.current++;
      setIsRefreshing(false);
    };
  }, [timeRange, userFilter, selectedUserEmail, lowQuotaMode, active, currentUserEmail, viewerTimeZone]);

  const handleAction = (actionId, willEnable, reason = '') => {
    setActionReason(reason);
    setPendingAction({ actionId, willEnable, reason });
  };

  const executeAction = async (actionId, willEnable, reason = '') => {
    setActionLoadingId(actionId);
    setActionFeedback(null);
    try {
      const email = currentUserEmail || auth.currentUser?.email || 'admin@tahaluf.com';
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      headers['x-admin-email'] = email;

      const res = await fetch(`/api/admin/analytics?email=${encodeURIComponent(email)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          actionId,
          operation: willEnable ? 'apply' : 'revert',
          enable: willEnable,
          reason,
          email,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update action');
      }

      setActionFeedback({
        actionId,
        message: willEnable 
          ? 'Optimization configuration applied. Runtime behavior has not been verified.'
          : 'Optimization reverted back to baseline.',
      });

      // Refresh data
      await refreshRef.current(false);
    } catch (err) {
      setActionFeedback({ actionId, error: true, message: `Action execution failed: ${err.message}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleAction = async (actionId, currentStatus, reason = '') => {
    const willEnable = currentStatus !== 'applied' && currentStatus !== 'active';
    await handleAction(actionId, willEnable, reason);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    let list = [...data.users];
    
    // Apply user scope filter
    if (selectedUserEmail) {
      list = list.filter(u => u.email?.toLowerCase() === selectedUserEmail.toLowerCase());
    } else if (userFilter === 'non_admin') {
      list = list.filter(u => u.role !== 'admin' && !u.email?.toLowerCase().includes('admin@'));
    } else if (userFilter === 'admin_only') {
      list = list.filter(u => u.role === 'admin' || u.email?.toLowerCase().includes('admin@'));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(u => 
        u.email?.toLowerCase().includes(q) || 
        u.role?.toLowerCase().includes(q) ||
        u.location?.toLowerCase().includes(q) ||
        u.lastTab?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'lastActive' || sortField === 'firstSeen') {
        valA = new Date(valA).getTime() || 0;
        valB = new Date(valB).getTime() || 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [data?.users, userFilter, selectedUserEmail, searchQuery, sortField, sortDirection]);

  const filteredFindings = useMemo(() => {
    if (!data?.findings) return [];
    if (findingCategory === 'all') return data.findings;
    return data.findings.filter(f => f.category === findingCategory);
  }, [data?.findings, findingCategory]);

  const filteredActionsHistory = useMemo(() => {
    const list = data?.actionsHistory || [];
    if (!historySearchQuery) return list;
    const q = historySearchQuery.toLowerCase();
    return list.filter(h =>
      (h.actionTitle && h.actionTitle.toLowerCase().includes(q)) ||
      (h.actor && h.actor.toLowerCase().includes(q)) ||
      (h.category && h.category.toLowerCase().includes(q)) ||
      (h.operation && h.operation.toLowerCase().includes(q)) ||
      (h.reason && h.reason.toLowerCase().includes(q))
    );
  }, [data?.actionsHistory, historySearchQuery]);

  const filteredActivity = useMemo(() => {
    const query = activitySearch.trim().toLowerCase();
    return (data?.recentActivity || []).filter(event => {
      if (!query) return true;
      return [event.userEmail, event.eventType, event.tab, data?.tabLabels?.[(event.tab || '').toLowerCase()], event.geo?.city, event.geo?.country,
        JSON.stringify(event.details || {}), JSON.stringify(event.filters || {})]
        .some(value => String(value || '').toLowerCase().includes(query));
    });
  }, [data?.recentActivity, data?.tabLabels, activitySearch]);
  const activityPages = Math.max(1, Math.ceil(filteredActivity.length / activityLimit));
  const currentActivityPage = Math.min(activityPage, activityPages);
  const visibleActivity = filteredActivity.slice((currentActivityPage - 1) * activityLimit, currentActivityPage * activityLimit);

  useEffect(() => { setActivityPage(1); }, [activitySearch, activityLimit, timeRange, userFilter, selectedUserEmail]);

  const formatRelativeTime = (isoString) => {
    if (!isoString || !Number.isFinite(new Date(isoString).getTime())) return 'Time unavailable';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDays}d ago`;
  };
  const handleVerifyAction = (actionId) => {
    const nowTimeStr = new Date().toLocaleTimeString('en-US', {
      timeZone: viewerTimeZone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    setDiagnosticProbeResults(prev => ({
      ...prev,
      [actionId]: {
        verified: false,
        time: nowTimeStr,
        message: 'Runtime verification unavailable. Catalog metadata is not execution evidence. Follow the verification guide and observe the dashboard before marking this rule as verified.',
      },
    }));
  };

  const handleExportAuditLog = () => {
    const list = data?.actionsHistory || [];
    if (list.length === 0) return;
    const headers = ['History ID', 'Timestamp (ISO)', 'Local Time', 'Operation', 'Action ID', 'Action Title', 'Category', 'Admin Author', 'Observed Impact', 'Reason'];
    const rows = list.map(item => {
      const local = formatEventLocalTime(item.timestamp);
      return [
        item.historyId,
        item.timestamp,
        `"${local.timeStr} ${local.tzShort}"`,
        item.operation,
        item.actionId,
        `"${(item.actionTitle || '').replace(/"/g, '""')}"`,
        item.category,
        item.actor,
        `"${(item.observedImpact || '').replace(/"/g, '""')}"`,
        `"${(item.reason || '').replace(/"/g, '""')}"`,
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tahaluf_audit_fixes_history_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatEventLocalTime = (isoString, targetTimeZone = viewerTimeZone) => {
    if (!isoString) return { timeStr: '', tzShort: '', tzFull: '' };
    try {
      const d = new Date(isoString);
      const tz = targetTimeZone || viewerTimeZone;
      const timeStr = d.toLocaleTimeString('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'short',
      }).formatToParts(d);
      const tzShort = parts.find(p => p.type === 'timeZoneName')?.value || viewerTzShort;

      return {
        timeStr,
        tzShort,
        tzFull: tz,
      };
    } catch {
      return {
        timeStr: new Date(isoString).toLocaleTimeString(),
        tzShort: 'Local',
        tzFull: 'Local',
      };
    }
  };

  const formatDurationSec = (sec = 0) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <RefreshCw className="w-8 h-8 text-[#cedc28] animate-spin" />
        <p className="text-sm font-semibold tracking-wider text-[#14a6d9] uppercase">
          Synthesizing Real-Time Telemetry & Heuristic Intelligence...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200">
        <h3 className="font-bold text-base mb-2 flex items-center gap-2">
          <span>Failed to load analytics</span>
        </h3>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => fetchAnalytics(false)}
          className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400 rounded-lg text-xs font-bold uppercase tracking-wider"
        >
          Retry
        </button>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const findings = data?.findings || [];
  const monitoredFixes = data?.monitoredFixes || [];
  const tabUsage = data?.tabUsage || [];
  const dwellTimes = data?.dwellTimes || {};
  const featureInteractions = data?.featureInteractions || {};
  const deviceFootprint = data?.deviceFootprint || {};
  const performanceTelemetry = data?.performanceTelemetry || {};
  const userJourneys = data?.userJourneys || {};
  const geoDistribution = data?.geoDistribution || [];
  const filterInsights = data?.filterInsights || {};
  const appliedActions = data?.appliedActions || {};

  return (
    <div className="space-y-5 animate-fadeIn pb-8">
      {data?.persistence?.lastError && <p role="alert" className="p-3 border border-amber-500/40 rounded-xl text-sm text-amber-200">Analytics persistence is incomplete on this instance: {data.persistence.failedEvents || 0} events failed. {data.persistence.lastError}</p>}
      {data?.persistence?.mode === 'memory-only' && <p role="status" className="p-3 border border-amber-500/40 rounded-xl text-sm text-amber-200">Analytics is running in memory-only mode. These observations are not durably backed up.</p>}
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-gray-800">
        <div>
          <h2 className="text-xl font-bold text-white">
            Analytics
          </h2>
          <p className="text-xs text-gray-400 mt-1">Usage, activity and observed performance</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Audience Scope Filter */}
          <div className="flex items-center gap-2 bg-[#071322] px-3 py-1.5 rounded-xl border border-gray-800 shadow-sm">
            <Users className="w-3.5 h-3.5 text-[#cedc28]" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">Audience:</span>
            <select
              aria-label="Analytics audience"
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setSelectedUserEmail('');
              }}
              className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer pr-1"
            >
              <option value="non_admin" className="bg-[#0a2442] text-white">All Users (Excl. Admins) [Default]</option>
              <option value="all" className="bg-[#0a2442] text-white">All Users (Incl. Admins)</option>
              <option value="admin_only" className="bg-[#0a2442] text-white">Admins Only</option>
            </select>
            {data?.userCounts && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#cedc28]/15 text-[#cedc28] border border-[#cedc28]/30 font-bold whitespace-nowrap">
                {userFilter === 'non_admin' 
                  ? `${data.userCounts.nonAdmin} Users (${data.userCounts.admin} Admins Filtered)`
                  : userFilter === 'admin_only'
                  ? `${data.userCounts.admin} Admins`
                  : `${data.userCounts.total} Total Users`}
              </span>
            )}
          </div>

          {/* Time range selector & Timezone Badge */}
          <div className="flex flex-col sm:items-end gap-1">
            <div className="flex items-center bg-[#071322] p-1 rounded-xl border border-gray-800 shadow-sm">
              {[
                { id: 'all', label: 'All Time' },
                { id: '30d', label: '30 Days' },
                { id: '7d', label: '7 Days' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'today', label: 'Today (After 12 AM)' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTimeRange(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    timeRange === t.id
                      ? 'bg-[#cedc28] text-[#0a2442] shadow-[0_0_12px_rgba(206,220,40,0.35)]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono px-1">
              <Clock className="w-3 h-3 text-[#cedc28]" />
              <span>Timezone: <strong className="text-gray-300">{viewerTzShort} ({viewerTimeZone})</strong></span>
              {timeRange === 'today' && (
                <span className="text-[#cedc28] font-bold">• Filtered strictly after 12:00 AM midnight</span>
              )}
              {timeRange === 'yesterday' && (
                <span className="text-[#14a6d9] font-bold">• Full previous day (00:00 - 23:59)</span>
              )}
            </div>
          </div>

          <button
            onClick={() => fetchAnalytics(false)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0a2442] hover:bg-[#0d2f56] border border-[#14a6d9]/30 text-xs font-bold text-[#14a6d9] hover:text-white transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-300">
        <p>
          Active scope: <strong>{selectedUserEmail || (userFilter === 'non_admin' ? 'Users excluding admins' : userFilter === 'admin_only' ? 'Admins only' : 'All users')}</strong>
          {' · '}{timeRange === 'all' ? 'All time' : timeRange === 'today' ? 'Today' : timeRange === 'yesterday' ? 'Yesterday' : timeRange === '7d' ? 'Last 7 days' : 'Last 30 days'}
          {' · '}{viewerTimeZone}
        </p>
        <button type="button" onClick={() => {
          setTimeRange('all'); setUserFilter('non_admin'); setSelectedUserEmail('');
          setSearchQuery(''); setActivitySearch(''); setHistorySearchQuery(''); setFindingCategory('all');
        }} className="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10">
          Reset filters
        </button>
      </div>
      <p role="note" className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3 text-xs text-slate-300">
        Scope coverage: audience and specific-user filters apply to Users and Activity. Aggregate performance and tab metrics remain retained all-user rollups; all-time view totals are not audience-filtered. Dated KPIs are calculated from bounded recent activity, not the full historical dataset.
      </p>
      <div role="status" className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
        <span>Last successful refresh: {lastSuccessfulRefresh ? new Date(lastSuccessfulRefresh).toLocaleString('en-US', { timeZone: viewerTimeZone }) : 'Not yet refreshed'}</span>
        <span>{!active ? 'Polling paused: page inactive' : lowQuotaMode ? 'Polling paused: low quota mode' : !pageVisible ? 'Polling paused: browser tab hidden' : 'Polling every 30 seconds'}</span>
        {isRefreshing && <span>Refreshing…</span>}
      </div>
      {error && data && <p role="alert" className="rounded-xl border border-amber-500/40 p-3 text-sm text-amber-200">Refresh failed: {error}. Showing stale data from the last successful refresh.</p>}
      {data && loadedScope !== scopeKey && <p role="status" className="text-sm text-amber-200">The displayed snapshot belongs to the previous scope. Waiting for the selected filters to load.</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminTabs tabs={ANALYTICS_TABS} value={subView} onChange={setSubView} label="Analytics sections" />
        <button type="button" aria-current={subView === 'optimizations' ? 'page' : undefined}
          onClick={() => setSubView('optimizations')}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${subView === 'optimizations' ? 'border-amber-300 text-amber-200 bg-amber-400/10' : 'border-gray-700 text-gray-300'}`}>
          Optimizations & rollback
        </button>
      </div>

      {/* TOP 6 EXECUTIVE KPI CARDS */}
      {subView === 'overview' && (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {/* Total Views */}
        <div className="card-surface p-4 rounded-xl border border-[#cedc28]/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-[#cedc28]/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-[#cedc28] uppercase tracking-wider mb-1">Total Views</p>
              <h3 className="text-2xl font-black text-white">{kpis.totalViews?.toLocaleString() || 0}</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-[#cedc28]" /> Page loads & tabs
              </p>
            </div>
            <div className="p-2 rounded-lg bg-[#cedc28]/10 text-[#cedc28]">
              <Eye className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Active Users */}
        <div className="card-surface p-4 rounded-xl border border-[#14a6d9]/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-[#14a6d9]/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider mb-1">Active Users</p>
              <h3 className="text-2xl font-black text-white">{kpis.totalUsers ?? (filteredUsers?.length || 0)}</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 truncate">
                <Users className="w-3 h-3 text-[#14a6d9]" /> {kpis.userScopeLabel || 'Excl. Admins'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-[#14a6d9]/10 text-[#14a6d9]">
              <Users className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Avg Session Duration */}
        <div className="card-surface p-4 rounded-xl border border-[#14a6d9]/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-[#14a6d9]/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider mb-1">Avg Session Duration</p>
              <h3 className="text-2xl font-black text-white">{kpis.totalSessions > 0 && Number.isFinite(kpis.avgSessionDurationSec) ? formatDurationSec(kpis.avgSessionDurationSec) : 'Not measured'}</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#14a6d9]" /> {kpis.totalSessions || 0} total sessions
              </p>
            </div>
            <div className="p-2 rounded-lg bg-[#14a6d9]/10 text-[#14a6d9]">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Active Optimizations */}
        <div className="card-surface p-4 rounded-xl border border-teal-500/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-teal-500/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">Active Optimizations</p>
              <h3 className="text-2xl font-black text-white">{kpis.appliedOptimizationsCount || 0} Active</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-teal-400" /> In-UI enhancements
              </p>
            </div>
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Pending Findings */}
        <div className="card-surface p-4 rounded-xl border border-amber-400/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-400/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wider mb-1">Heuristic Findings</p>
              <h3 className="text-2xl font-black text-white">{findings.length} Identified</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-300" /> {kpis.pendingFindingsCount || 0} actionable
              </p>
            </div>
            <div className="p-2 rounded-lg bg-amber-400/10 text-amber-300">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* 13" Laptop Share */}
        <div className="card-surface p-4 rounded-xl border border-purple-400/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-purple-400/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-purple-300 uppercase tracking-wider mb-1">Display Samples</p>
              <h3 className="text-2xl font-black text-white">{Object.values(deviceFootprint.screenResolutions || {}).reduce((sum, count) => sum + count, 0)}</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Laptop className="w-3 h-3 text-purple-300" /> Recorded viewport observations
              </p>
            </div>
            <div className="p-2 rounded-lg bg-purple-400/10 text-purple-300">
              <Laptop className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* FEEDBACK TOAST */}
      {actionFeedback && (
        <div role={actionFeedback.error ? 'alert' : 'status'} className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-bold ${actionFeedback.error ? 'bg-red-500/10 border-red-400/40 text-red-200' : 'bg-[#cedc28]/15 border-[#cedc28]/40 text-[#cedc28]'}`}>
          <span>{actionFeedback.message}</span>
          <button type="button" className="ml-auto underline" onClick={() => setActionFeedback(null)}>Dismiss</button>
        </div>
      )}

      {/* SUB-VIEW 1: ACTIONABLE FINDINGS & INTELLIGENCE ENGINE */}
      {subView === 'recommendations' && (
        <div className="space-y-6">
          <p role="note" className="rounded-xl border border-amber-500/30 p-3 text-xs text-amber-200">Recommendation descriptions and before/after scenarios are catalog assumptions, not measured outcomes. Numerical benefits have not been independently verified.</p>
          {/* Category filter pills */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-2">Category:</span>
              {[
                { id: 'all', label: 'All Findings' },
                { id: 'ui_ux', label: 'UI & Layout' },
                { id: 'audience', label: 'Audience Bias' },
                { id: 'performance', label: 'Performance' },
                { id: 'feature_discovery', label: 'Feature Discovery' },
                { id: 'data_hygiene', label: 'Data Hygiene' },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setFindingCategory(cat.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    findingCategory === cat.id
                      ? 'bg-[#14a6d9] text-[#0a2442] shadow-[0_0_10px_rgba(20,166,217,0.35)]'
                      : 'bg-[#071322] border border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-gray-400 font-mono">
              Real-time heuristic evaluation over {kpis.totalViews?.toLocaleString()} data points
            </div>
          </div>

          {/* Quick Notice Banner pointing to Version History */}
          <div className="p-3.5 rounded-2xl bg-[#0a2442]/80 border border-[#14a6d9]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md">
            <div className="flex items-center gap-2.5 text-gray-300">
              <History className="w-4 h-4 text-[#14a6d9] flex-shrink-0" />
              <span>
                <strong>Optimizations & rollback:</strong> Review configured rules, verification guidance, author audit trails and rollback history separately. Configuration status does not prove runtime behavior.
              </span>
            </div>
            <button type="button" onClick={() => setSubView('optimizations')}
              className="px-3 py-1.5 rounded-lg bg-[#14a6d9]/20 hover:bg-[#14a6d9]/30 text-[#14a6d9] hover:text-white font-bold whitespace-nowrap text-xs border border-[#14a6d9]/40 flex items-center gap-1.5 transition-all self-start sm:self-auto"
            >
              <span>View Version History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Findings Cards Grid */}
          {filteredFindings.length === 0 && <p className="text-sm text-gray-400">No recommendations match this category and snapshot.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredFindings.map(finding => {
              const isApplied = finding.status === 'applied';
              const isLoading = actionLoadingId === finding.actionId;
              const probe = diagnosticProbeResults[finding.actionId];

              const severityColors = {
                high: 'bg-red-500/10 border-red-500/30 text-red-400',
                medium: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
                opportunity: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
                resolved: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
              };

              return (
                <div 
                  key={finding.id} 
                  className={`card-surface p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                    isApplied 
                      ? 'border-[#cedc28]/40 bg-[#0a1f33]/70 shadow-[0_0_20px_rgba(206,220,40,0.08)]' 
                      : 'border-gray-800 hover:border-gray-700 bg-[#071322]/90'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                            severityColors[finding.severity] || severityColors.medium
                          }`}>
                            {finding.severity}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800">
                            {finding.category.replace('_', ' ')}
                          </span>
                          {isApplied && (
                            <span className="text-[10px] font-mono text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Configured
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-white tracking-wide">
                          {finding.title}
                        </h4>
                      </div>

                      {/* Impact Score Gauge */}
                      <div className="flex flex-col items-end flex-shrink-0">
                        <div className="flex items-center gap-1 font-mono text-xs font-black text-[#cedc28]">
                          <Zap className="w-3.5 h-3.5 text-[#cedc28]" />
                          {finding.impactScore}/100
                        </div>
                        <span className="text-[9px] text-gray-500 uppercase tracking-widest">Impact Score</span>
                      </div>
                    </div>

                    {/* Section 1: The Problem (In Plain English) */}
                    <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/20 text-xs text-gray-200">
                      <div className="flex items-center gap-1.5 font-bold text-red-300 uppercase text-[10px] tracking-wider mb-1">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        The Problem (In Simple Words):
                      </div>
                      <p className="leading-relaxed text-gray-300">
                        {finding.plainProblem || finding.evidence}
                      </p>
                    </div>

                    {/* Section 2: The Solution (What this fix will do) */}
                    <div className="p-3 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 text-xs text-gray-200">
                      <div className="flex items-center gap-1.5 font-bold text-[#14a6d9] uppercase text-[10px] tracking-wider mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-[#14a6d9] flex-shrink-0" />
                        The Solution (What Changes):
                      </div>
                      <p className="leading-relaxed text-gray-300">
                        {finding.plainSolution || finding.recommendation}
                      </p>
                    </div>

                    {/* Section 3: Before vs After Side-by-Side Comparison */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2.5 rounded-lg bg-gray-950/70 border border-red-500/20">
                        <span className="font-bold text-red-400 text-[10px] uppercase block mb-0.5">❌ Before Fix:</span>
                        <span className="text-gray-300 leading-tight block">{finding.beforeScenario}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-gray-950/70 border border-emerald-500/30">
                        <span className="font-bold text-emerald-400 text-[10px] uppercase block mb-0.5">✅ After Fix:</span>
                        <span className="text-gray-200 leading-tight block font-medium">{finding.afterScenario}</span>
                      </div>
                    </div>

                    {/* Section 4: How to Verify & Live Probe */}
                    <div className="p-2.5 rounded-lg bg-[#030b14]/80 border border-gray-800 text-[11px] text-gray-300 space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                        <Eye className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        How to Verify in Dashboard:
                      </div>
                      <p className="text-gray-400 leading-snug">
                        {finding.howToVerify}
                      </p>

                      {/* Live Probe Result (if checked) */}
                      {probe && (
                        <div role="status" className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[10px] font-mono flex items-center justify-between gap-2">
                          <span>{probe.message}</span>
                          <span className="text-gray-400">{probe.time}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="pt-3 border-t border-gray-800 flex items-center justify-between gap-3 mt-4">
                    <div className="text-[11px] font-bold text-[#cedc28] flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Expected benefit · unverified
                    </div>

                    <div className="flex items-center gap-2">
                      {isApplied && (
                        <button
                          onClick={() => handleVerifyAction(finding.actionId)}
                          className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-[#14a6d9]/15 hover:bg-[#14a6d9]/25 border border-[#14a6d9]/40 text-[#14a6d9] hover:text-white transition-all flex items-center gap-1 shadow-sm"
                          title="Review runtime verification availability"
                        >
                          <PlayCircle className="w-3 h-3" /> Verification status
                        </button>
                      )}

                      {isApplied ? (
                        <button
                          onClick={() => handleAction(finding.actionId, false, 'Reverted from findings card')}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 transition-all flex items-center gap-1.5 shadow-sm"
                          title="Revert fix back to baseline (creates a snapshot in version history)"
                        >
                          {isLoading ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Revert
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(finding.actionId, true, 'Applied from findings card')}
                          disabled={isLoading}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-[#14a6d9] text-[#0a2442] hover:bg-[#118fbc] shadow-[0_0_12px_rgba(20,166,217,0.3)] transition-all flex items-center gap-2"
                        >
                          {isLoading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Applying Fix...
                            </>
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5" />
                              {finding.status === 'reverted' ? 'Re-Apply Optimization' : finding.actionLabel}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {subView === 'optimizations' && (
        <div className="space-y-4">
          {/* Audit Trail of Active Optimizations */}
          <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#cedc28]" />
                <h3 className="text-base font-bold text-white tracking-wide uppercase">
                  Currently Active Dashboard Optimizations
                </h3>
              </div>
              <span className="text-xs text-gray-400 font-mono">
                {Object.values(appliedActions).filter(a => a.status === 'active').length} Active Overrides
              </span>
            </div>

            <div className="divide-y divide-gray-850">
              {Object.values(appliedActions).length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-500">
                  No optimizations applied yet. Review Recommendations to choose a configuration change.
                </div>
              ) : (
                Object.values(appliedActions).map(act => (
                  <div key={act.actionId} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${act.status === 'active' ? 'bg-[#cedc28]' : 'bg-gray-600'}`}></span>
                        <span className="font-bold text-white">{act.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 bg-gray-800 text-gray-400 rounded">
                          {act.category}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 ml-4">
                        Applied by <span className="text-gray-300 font-medium">{act.appliedBy}</span> • {formatRelativeTime(act.appliedAt)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-gray-400">Runtime impact not measured</span>
                      <button
                        onClick={() => handleToggleAction(act.actionId, act.status)}
                        className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-bold uppercase tracking-wider"
                      >
                        {act.status === 'active' ? 'Deactivate' : 'Re-enable'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW: FIX MONITORING & ROLLBACK HISTORY */}
      {subView === 'optimizations' && (
        <div className="space-y-8">
          {/* Section 1: Live Fix Health & Telemetry Impact Monitor */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Optimization Configuration & Verification
                </h3>
                <p className="text-xs text-gray-400">
                  Configured rules, reported impact, verification guidance and audited rollback. Runtime verification is unavailable.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{monitoredFixes.filter(f => f.status === 'active').length} of {monitoredFixes.length} Fixes Active</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {monitoredFixes.map(fix => {
                const isActive = fix.status === 'active';
                const isReverted = fix.status === 'reverted';
                const isLoading = actionLoadingId === fix.actionId;
                const probe = diagnosticProbeResults[fix.actionId];

                return (
                  <div 
                    key={fix.id}
                    className={`card-surface p-5 rounded-2xl border transition-all ${
                      isActive 
                        ? 'border-emerald-500/40 bg-[#071d1e]/40 shadow-[0_0_20px_rgba(16,185,129,0.06)]' 
                        : isReverted 
                          ? 'border-amber-500/30 bg-[#1c1409]/40' 
                          : 'border-gray-800 bg-[#071322]/80'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                            isActive 
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                              : isReverted
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                : 'bg-gray-800 border-gray-700 text-gray-400'
                          }`}>
                            {isActive ? 'Configured active' : isReverted ? 'Reverted' : 'Standby'}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800">
                            {fix.category.replace('_', ' ')}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-mono text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Rule Active
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-white tracking-wide">{fix.title}</h4>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className={`text-[11px] font-bold block ${isActive ? 'text-emerald-400' : 'text-gray-400'}`}>
                          {fix.uptime}
                        </span>
                        <span className="text-[9px] text-gray-500 uppercase tracking-widest">Status Uptime</span>
                      </div>
                    </div>

                    {/* Problem & Solution Explanation */}
                    <div className="space-y-2 mb-3 text-xs">
                      <div className="p-2.5 rounded-xl bg-gray-950/60 border border-gray-850">
                        <span className="font-bold text-red-300 text-[10px] uppercase block mb-0.5">The Friction:</span>
                        <p className="text-gray-300 leading-snug">{fix.plainProblem || fix.description}</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-gray-950/60 border border-gray-850">
                        <span className="font-bold text-emerald-300 text-[10px] uppercase block mb-0.5">The Applied Fix:</span>
                        <p className="text-gray-300 leading-snug">{fix.plainSolution || fix.description}</p>
                      </div>
                    </div>

                    {/* How to verify & Probe result */}
                    <div className="p-2.5 rounded-xl bg-[#030b14]/80 border border-gray-850 mb-3 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                        <Eye className="w-3.5 h-3.5 text-purple-400" />
                        Verification Guide:
                      </div>
                      <p className="text-gray-400 text-[11px] leading-snug">
                        {fix.howToVerify}
                      </p>
                      {probe && (
                        <div role="status" className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[10px] font-mono flex items-center justify-between gap-2">
                          <span>{probe.message}</span>
                          <span className="text-gray-400">{probe.time}</span>
                        </div>
                      )}
                    </div>

                    {/* Observed Telemetry Impact */}
                    <div className="p-3 rounded-xl bg-[#030b14]/70 border border-gray-850 mb-3 space-y-1.5 text-xs text-gray-300">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Runtime Impact:
                      </div>
                      <p className="text-xs text-gray-200 leading-relaxed font-medium">
                        Not measured. Catalog benefits and targets are not evidence of an observed change.
                      </p>
                    </div>

                    {/* Card Footer with Details and 1-Click Revert / Apply */}
                    <div className="pt-3 border-t border-gray-800 flex items-center justify-between gap-3">
                      <div className="text-[10px] text-gray-400">
                        {isActive && fix.appliedBy && (
                          <span>Applied by <strong className="text-gray-300">{fix.appliedBy}</strong></span>
                        )}
                        {isReverted && fix.revertedBy && (
                          <span>Reverted by <strong className="text-gray-300">{fix.revertedBy}</strong></span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isActive && (
                          <button
                            onClick={() => handleVerifyAction(fix.actionId)}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-[#14a6d9]/15 hover:bg-[#14a6d9]/25 border border-[#14a6d9]/40 text-[#14a6d9] hover:text-white transition-all flex items-center gap-1 shadow-sm"
                            title="Review runtime verification availability"
                          >
                            <PlayCircle className="w-3 h-3" /> Verification status
                          </button>
                        )}

                        {isActive ? (
                          <button
                            onClick={() => handleAction(fix.actionId, false, 'Admin requested rollback from Monitoring tab')}
                            disabled={isLoading}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 transition-all flex items-center gap-1.5 shadow-sm"
                            title="Revert fix back to baseline (Version Snapshot will be created)"
                          >
                            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            Revert Fix
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAction(fix.actionId, true, 'Admin applied fix from Monitoring tab')}
                            disabled={isLoading}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#cedc28] text-[#0a2442] hover:bg-[#b8c622] transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                            {isReverted ? 'Re-Apply Fix' : 'Apply Fix'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Audit History & Rollback Timeline */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <History className="w-5 h-5 text-[#14a6d9]" />
                  Fix Execution & Rollback Version History
                </h3>
                <p className="text-xs text-gray-400">
                  Immutable audit trail of all optimizations applied, reverted, or updated with author attribution and local timestamps
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Search version history..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-[#030b14] border border-gray-800 text-xs text-white placeholder-gray-500 focus:border-[#14a6d9] outline-none w-48"
                  />
                </div>

                <button
                  onClick={handleExportAuditLog}
                  className="px-3 py-1.5 rounded-xl bg-[#0a2442] hover:bg-[#0d2f56] border border-[#14a6d9]/30 text-xs font-bold text-[#14a6d9] hover:text-white transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                  title="Export complete version history as CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-[#071322]/90 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 bg-[#030b14]/80 text-gray-400 uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Operation</th>
                      <th className="py-3 px-4">Optimization</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Admin Author</th>
                      <th className="py-3 px-4">Observed Effect / Notes</th>
                      <th className="py-3 px-4">Timestamp ({viewerTzShort})</th>
                      <th className="py-3 px-4 text-right">Quick Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 font-medium">
                    {filteredActionsHistory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500">
                          {historySearchQuery ? 'No matching audit records found.' : 'No fix history records found.'}
                        </td>
                      </tr>
                    ) : (
                      filteredActionsHistory.map((item) => {
                        const isApply = item.operation === 'APPLY';
                        const currentStatus = appliedActions[item.actionId]?.status;
                        const canRevert = currentStatus === 'active';
                        const isLoading = actionLoadingId === item.actionId;
                        const localTime = formatEventLocalTime(item.timestamp);

                        return (
                          <tr key={item.historyId} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                isApply 
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                              }`}>
                                {item.operation}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-white">
                              {item.actionTitle}
                            </td>
                            <td className="py-3 px-4 text-gray-400 font-mono text-[11px] uppercase">
                              {item.category?.replace('_', ' ')}
                            </td>
                            <td className="py-3 px-4 text-gray-300">
                              {item.actor}
                            </td>
                            <td className="py-3 px-4 text-gray-400 max-w-xs truncate" title={item.reason || item.observedImpact}>
                              {item.reason || item.observedImpact}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">
                              <span className="text-white block font-medium">
                                {localTime.timeStr} <span className="text-gray-400 font-normal">({localTime.tzShort})</span>
                              </span>
                              <span className="text-[10px] text-gray-500 block">
                                {formatRelativeTime(item.timestamp)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {canRevert ? (
                                <button
                                  onClick={() => handleAction(item.actionId, false, 'Rollback from Audit History')}
                                  disabled={isLoading}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all flex items-center gap-1 ml-auto"
                                >
                                  <RotateCcw className="w-3 h-3" /> Revert
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleAction(item.actionId, true, 'Re-apply from Audit History')}
                                  disabled={isLoading}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#cedc28]/20 hover:bg-[#cedc28]/30 text-[#cedc28] border border-[#cedc28]/30 transition-all flex items-center gap-1 ml-auto"
                                >
                                  <Zap className="w-3 h-3" /> Re-Apply
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: DWELL TIME & BEHAVIORAL TELEMETRY */}
      {subView === 'overview' && (
        <div className="space-y-6">
          {/* Tab Dwell Time & Bounce Rates Grid */}
          <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#14a6d9]" />
                <h3 className="text-base font-bold text-white tracking-wide uppercase">
                  Dwell Time & Engagement By Tab
                </h3>
              </div>
              <span className="text-xs text-gray-400 font-mono">
                Identifies deep analytical views vs high-dropoff friction points
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {tabUsage.map(t => {
                const dt = dwellTimes[t.tab] || {};
                const isHighBounce = dt.bouncePercent >= 30;
                return (
                  <div key={t.tab} className="p-4 rounded-xl bg-[#071322] border border-gray-800">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-xs font-bold text-white">{t.label}</h4>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        isHighBounce ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-[#cedc28]/10 text-[#cedc28]'
                      }`}>
                        {Number.isFinite(dt.bouncePercent) ? `${dt.bouncePercent}% bounce` : 'Bounce not measured'}
                      </span>
                    </div>

                    <div className="text-2xl font-black text-white font-mono mb-1">
                      {Number.isFinite(dt.avgSec) ? formatDurationSec(dt.avgSec) : 'Not measured'}
                    </div>
                    <p className="text-[10px] text-gray-400 mb-2">Average time spent per session</p>

                    <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-[#14a6d9] to-[#cedc28]"
                        style={{ width: `${Number.isFinite(dt.avgSec) ? Math.min(100, (dt.avgSec / 200) * 100) : 0}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* User Journey Funnels & Drop-offs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Compass className="w-5 h-5 text-[#cedc28]" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Top User Navigation Funnels</h4>
              </div>

              <div className="space-y-3">
                {(userJourneys.commonFunnels || []).map(funnel => (
                  <div key={funnel.path} className="p-3.5 rounded-xl bg-[#071322] border border-gray-850">
                    <div className="flex justify-between items-center text-xs mb-2">
                      <span className="font-bold text-white">{funnel.path}</span>
                      <span className="text-[#cedc28] font-bold font-mono">{funnel.conversionPercent}% Completion</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {funnel.flow.map((step, idx) => (
                        <React.Fragment key={step}>
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-200 text-[11px] font-semibold">{step}</span>
                          {idx < funnel.flow.length - 1 && <ArrowRight className="w-3 h-3 text-gray-500" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Zero-Result Friction Queries */}
            <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Zero-Result Queries (Dead-Ends)</h4>
              </div>

              <p className="text-xs text-gray-400 mb-3">
                Filter combinations that returned empty tables, indicating user confusion or missing media spend
              </p>

              <div className="space-y-2.5">
                {(featureInteractions.zeroResultQueries || []).map(zq => (
                  <div key={zq.combo} className="p-3 rounded-xl bg-[#071322] border border-amber-500/20 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-amber-300 font-mono">{zq.combo}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{zq.reason}</div>
                    </div>
                    <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-300 font-mono font-bold text-xs">
                      {zq.count} attempts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: DISPLAY, HARDWARE & PERFORMANCE BENCHMARKS */}
      {subView === 'performance' && (
        <div className="space-y-6">
          {/* Display & Screen Resolution Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-purple-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Screen Resolution Distribution</h4>
                </div>
                <span className="text-xs text-purple-400 font-mono">13&quot; Laptop = Baseline</span>
              </div>

              <div className="space-y-3">
                {Object.entries(deviceFootprint.screenResolutions || {}).map(([res, count]) => {
                  const total = Object.values(deviceFootprint.screenResolutions || {}).reduce((a, b) => a + b, 0) || 1;
                  const pct = Math.round((count / total) * 100);
                  const is13Inch = res.includes('13"');
                  return (
                    <div key={res} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className={`font-semibold ${is13Inch ? 'text-[#cedc28] font-bold' : 'text-gray-300'}`}>
                          {res}
                        </span>
                        <span className="font-mono text-gray-400">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${is13Inch ? 'bg-[#cedc28]' : 'bg-purple-400'}`}
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Browser & OS Matrix */}
            <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-[#14a6d9]" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Browser & Operating System</h4>
                </div>
                <span className="text-xs text-gray-400 font-mono">Executive Ecosystem</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Browsers</h5>
                  <div className="space-y-2">
                    {Object.entries(deviceFootprint.browsers || {}).map(([bName, bCount]) => (
                      <div key={bName} className="flex justify-between items-center py-1.5 px-2 rounded bg-[#071322] text-xs">
                        <span className="text-gray-300">{bName}</span>
                        <span className="font-mono font-bold text-[#14a6d9]">{bCount}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Platforms</h5>
                  <div className="space-y-2">
                    {Object.entries(deviceFootprint.os || {}).map(([osName, osCount]) => (
                      <div key={osName} className="flex justify-between items-center py-1.5 px-2 rounded bg-[#071322] text-xs">
                        <span className="text-gray-300">{osName}</span>
                        <span className="font-mono font-bold text-teal-400">{osCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance & Sheet Latency Benchmarks */}
          <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Reported Sheet Ingestion & Caching Latencies
                </h4>
              </div>
              <span className="text-xs text-emerald-400 font-mono font-bold">
                Avg Response: {Object.keys(performanceTelemetry.sheetBreakdown || {}).length > 0 && Number.isFinite(performanceTelemetry.avgApiLatencyMs) ? `${performanceTelemetry.avgApiLatencyMs}ms` : 'Not measured'}
              </span>
            </div>

            {Object.keys(performanceTelemetry.sheetBreakdown || {}).length === 0 && <p className="text-sm text-gray-400">No sheet latency samples are available in this snapshot.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(performanceTelemetry.sheetBreakdown || {}).map(([sheetName, bench]) => (
                <div key={sheetName} className="p-4 rounded-xl bg-[#071322] border border-gray-800">
                  <div className="text-xs font-bold text-white mb-2 truncate" title={sheetName}>{sheetName}</div>
                  <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                    <span>Cache Hit (p50):</span>
                    <span className="font-mono text-emerald-400 font-bold">{bench.p50}ms</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                    <span>Cold Fetch (p95):</span>
                    <span className="font-mono text-amber-400 font-bold">{bench.p95}ms</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400 mb-2">
                    <span>Cache Hit Rate:</span>
                    <span className="font-mono text-[#cedc28] font-bold">{bench.cacheHitRate}%</span>
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    Data Payload: {(bench.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: AUDIENCE, GEO & USER AUDIT */}
      {subView === 'users' && (
        <div className="space-y-6">
          {/* Countries & Business Filter Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Global Access Footprint */}
            <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-[#14a6d9]" />
                  <h3 className="text-base font-bold text-white tracking-wide uppercase">Access Footprint (Countries)</h3>
                </div>
                <span className="text-xs text-[#14a6d9] font-mono">
                  {geoDistribution.length} Active Regions
                </span>
              </div>

              <div className="space-y-3">
                {geoDistribution.slice(0, 6).map((geo) => (
                  <div 
                    key={geo.code}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#071728]/70 border border-gray-800/80 hover:border-[#14a6d9]/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl leading-none">{geo.flag}</span>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          {geo.country}
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-gray-800 text-gray-400 rounded">
                            {geo.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-[#14a6d9]" />
                          Primary City: <span className="text-gray-300 font-medium">{geo.topCity}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-white font-mono">{geo.count.toLocaleString()} visits</div>
                      <div className="text-[11px] font-bold text-[#14a6d9]">{geo.percentage}% of traffic</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Business & Dimension Adoption */}
            <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5 text-[#cedc28]" />
                <h4 className="text-base font-bold text-white uppercase tracking-wider">Business Filter Adoption</h4>
              </div>

              <div className="space-y-3 mb-6">
                {['B2B', 'B2C', 'All'].map((bKey) => {
                  const bData = filterInsights.business?.[bKey] || { count: 0, percentage: 0 };
                  const isB2B = bKey === 'B2B';
                  const isB2C = bKey === 'B2C';
                  const accentColor = isB2B ? 'text-[#cedc28]' : isB2C ? 'text-[#14a6d9]' : 'text-gray-300';
                  const barGradient = isB2B ? 'from-[#cedc28] to-emerald-400' : isB2C ? 'from-[#14a6d9] to-blue-500' : 'from-gray-500 to-gray-400';

                  return (
                    <div key={bKey} className="p-3 rounded-xl bg-[#071322] border border-gray-800/80">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <span className={`font-black ${accentColor}`}>{bKey} Selection</span>
                        <span className="font-mono text-gray-300">
                          {bData.count.toLocaleString()} <span className="text-gray-500">({bData.percentage}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div 
                          className={`h-full rounded-full bg-gradient-to-r ${barGradient}`}
                          style={{ width: `${Math.max(0, Math.min(100, bData.percentage))}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Top Filtered Events</h5>
              <div className="grid grid-cols-2 gap-2">
                {(filterInsights.topEvents || []).slice(0, 4).map(ev => (
                  <div key={ev.event} className="py-1.5 px-2 rounded bg-[#071322] text-xs flex justify-between items-center">
                    <span className="text-gray-300 truncate">{ev.event}</span>
                    <span className="font-mono font-bold text-[#14a6d9]">{ev.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Searchable User Audit Table */}
          <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-5 h-5 text-[#cedc28]" />
                  <h3 className="text-lg font-bold text-white tracking-wide uppercase">User Access & Activity Log</h3>
                </div>
                <p className="text-xs text-gray-400">
                  Tracking of every team member, access times, dwell times, and primary view
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Audience quick filter buttons */}
                <div className="flex items-center bg-[#071322] p-1 rounded-xl border border-gray-800">
                  {[
                    { id: 'non_admin', label: 'Excl. Admins (Default)' },
                    { id: 'all', label: 'All Users' },
                    { id: 'admin_only', label: 'Admins Only' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setUserFilter(f.id);
                        setSelectedUserEmail('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        userFilter === f.id && !selectedUserEmail
                          ? 'bg-[#cedc28] text-[#0a2442] shadow-[0_0_10px_rgba(206,220,40,0.3)]'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Specific user email dropdown */}
                {data?.allKnownUsers && data.allKnownUsers.length > 0 && (
                  <select
                    aria-label="Specific analytics user"
                    value={selectedUserEmail}
                    onChange={(e) => setSelectedUserEmail(e.target.value)}
                    className="bg-[#071322] border border-gray-800 text-xs font-medium text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#cedc28]"
                  >
                    <option value="">All Users in Scope ({filteredUsers.length})</option>
                    {data.allKnownUsers.map((u) => (
                      <option key={u.email} value={u.email} className="bg-[#0a2442] text-white">
                        {u.email} {u.role === 'admin' ? '[Admin]' : ''}
                      </option>
                    ))}
                  </select>
                )}

                {/* Search input */}
                <div className="relative w-full md:w-60">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    aria-label="Search users"
                    placeholder="Search user, role, city..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#071322] border border-gray-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#cedc28]"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('email')}>
                      User / Email {sortField === 'email' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('role')}>
                      Role {sortField === 'role' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('totalEvents')}>
                      Interactions {sortField === 'totalEvents' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-3 px-4">Avg Dwell</th>
                    <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('lastActive')}>
                      Last Active {sortField === 'lastActive' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-3 px-4">Current Tab</th>
                    <th className="py-3 px-4">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-850 text-xs">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-gray-500 text-xs">
                        No active user records match your search query.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isAdmin = u.role === 'admin';
                      return (
                        <tr key={u.email} className="hover:bg-[#0d2238]/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">{u.email}</div>
                            <div className="text-[10px] text-gray-500 font-mono">Sessions: {u.sessionCount ?? 'Not measured'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isAdmin 
                                ? 'bg-[#cedc28]/15 text-[#cedc28] border border-[#cedc28]/40' 
                                : 'bg-[#14a6d9]/15 text-[#14a6d9] border border-[#14a6d9]/40'
                            }`}>
                              <Shield className="w-2.5 h-2.5" />
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-gray-200">
                            {u.totalEvents?.toLocaleString() || 0}
                          </td>
                          <td className="py-3 px-4 font-mono text-gray-300">
                            {Number.isFinite(u.avgDwellSec) ? formatDurationSec(u.avgDwellSec) : 'Not measured'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-white font-medium">{formatRelativeTime(u.lastActive)}</div>
                            <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1 mt-0.5">
                              <span>
                                {new Date(u.lastActive).toLocaleTimeString('en-US', {
                                  timeZone: viewerTimeZone,
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                })} {viewerTzShort}
                              </span>
                              <span>•</span>
                              <span>
                                {new Date(u.lastActive).toLocaleDateString('en-US', {
                                  timeZone: viewerTimeZone,
                                })}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 rounded bg-[#071322] border border-gray-800 text-[11px] text-gray-300 font-medium">
                              {u.lastTab || 'Executive Summary'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-gray-300">
                              <span className="text-base">{u.flag}</span>
                              <span>{u.location}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Activity is scoped to the same API snapshot as the other sections. */}
      {subView === 'activity' && (
      <div className="card-surface p-5 rounded-2xl border border-gray-800 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-gray-800/80">
          <div className="flex flex-wrap items-center gap-2.5">
            <Activity className="w-4 h-4 text-[#cedc28]" />
            <h4 className="text-xs font-bold text-white tracking-wide uppercase">Activity</h4>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#14a6d9]/10 text-[#14a6d9] border border-[#14a6d9]/30 font-medium">
              {selectedUserEmail 
                ? `Isolating: ${selectedUserEmail}`
                : userFilter === 'non_admin' 
                ? 'Filtered Scope: Business Users (Admins Hidden)' 
                : userFilter === 'admin_only'
                ? 'Filtered Scope: Admins Only'
                : 'Scope: All Users'}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 font-medium hidden sm:inline">
              Your Timezone: {viewerTzShort} ({viewerTimeZone})
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input type="search" aria-label="Search activity" value={activitySearch}
              onChange={event => setActivitySearch(event.target.value)} placeholder="Search users, actions, tabs…"
              className="min-w-0 rounded-lg border border-gray-700 bg-[#071322] px-3 py-2 text-xs text-white" />
            {/* Limit Selector */}
            <div className="flex items-center gap-1.5 bg-[#071322] px-2.5 py-1 rounded-xl border border-gray-800">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Show:</span>
              {[10, 25, 50, 100].map((cnt) => (
                <button
                  key={cnt}
                  onClick={() => setActivityLimit(cnt)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    activityLimit === cnt
                      ? 'bg-[#cedc28] text-[#0a2442] shadow-[0_0_8px_rgba(206,220,40,0.3)]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>

          </div>
        </div>

        <div className="divide-y divide-gray-850 max-h-96 overflow-y-auto pr-1">
          {filteredActivity.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500">{activitySearch ? 'No activity matches your search.' : 'No activity recorded for this scope.'}</div>
          ) : (
            visibleActivity.map((act) => {
              const rawTab = (act.tab || '').toLowerCase();
              const tabName = rawTab === 'summary' || rawTab === 'overview' ? 'Overview' : (data?.tabLabels?.[rawTab] || act.tab || 'Dashboard');

              let narrative = { action: 'interacted with', target: tabName, color: 'text-gray-300' };
              if (act.eventType === 'dashboard_open') {
                narrative = { action: 'opened dashboard on', target: tabName, color: 'text-[#cedc28]' };
              } else if (act.eventType === 'tab_view') {
                narrative = { action: 'switched to tab', target: tabName, color: 'text-[#14a6d9]' };
              } else if (act.eventType === 'heartbeat_dwell') {
                narrative = { action: 'actively reviewing', target: tabName, color: 'text-amber-400' };
              } else if (act.eventType === 'tab_dwell') {
                narrative = { action: 'completed dwell on', target: tabName, color: 'text-emerald-400' };
              } else if (act.eventType === 'metric_card_click') {
                narrative = { action: 'inspected KPI', target: `${act.details?.metric || 'Metric'} (${act.details?.value || ''})`, color: 'text-[#cedc28]' };
              } else if (act.eventType === 'trend_view_change') {
                narrative = { action: 'switched trend view to', target: act.details?.trendView || 'Trend', color: 'text-[#14a6d9]' };
              } else if (act.eventType === 'perf_metric_change') {
                narrative = { action: 'selected chart metric', target: act.details?.metric || 'Metric', color: 'text-indigo-400' };
              } else if (act.eventType === 'filter_applied') {
                const parts = [];
                if (act.filters?.business && act.filters.business !== 'All') parts.push(`Business: ${act.filters.business}`);
                if (act.filters?.events?.length) parts.push(`Events: ${act.filters.events.join(', ')}`);
                narrative = { action: 'applied filters', target: parts.join(' | ') || 'Default Filters', color: 'text-blue-400' };
              } else if (act.eventType === 'export_pptx') {
                narrative = { action: 'generated executive PPTX deck from', target: tabName, color: 'text-purple-400' };
              } else if (act.eventType === 'export_csv') {
                narrative = { action: 'downloaded raw CSV data from', target: tabName, color: 'text-teal-400' };
              } else if (act.eventType === 'currency_toggle') {
                narrative = { action: 'toggled currency to', target: act.details?.currency || 'Unknown currency', color: 'text-amber-300' };
              } else if (act.eventType === 'search_query') {
                narrative = { action: 'searched for', target: `"${act.details?.query}"`, color: 'text-pink-400' };
              } else if (act.eventType === 'optimization_applied') {
                narrative = { action: 'applied optimization', target: act.details?.title || act.actionId, color: 'text-emerald-300' };
              } else if (act.eventType === 'optimization_reverted') {
                narrative = { action: 'reverted optimization', target: act.details?.title || act.actionId, color: 'text-rose-400' };
              }

              const localTime = formatEventLocalTime(act.timestamp, viewerTimeZone);

              return (
                <div key={act.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-white/[0.02] px-2.5 rounded-lg transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm shrink-0">{act.geo?.flag || '🌐'}</span>
                    <div className="truncate">
                      <span className="font-bold text-white">{act.userEmail}</span>
                      <span className="text-gray-400 ml-1.5">{narrative.action}</span>
                      <span className={`ml-1.5 font-bold ${narrative.color}`}>{narrative.target}</span>
                      {act.dwellTimeSec > 0 && (
                        <span className="ml-2 text-[10px] font-mono text-gray-500">
                          ({act.dwellTimeSec}s dwell)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-gray-400 font-mono text-[10px] shrink-0 sm:self-center self-end">
                    <span className="text-gray-300 font-medium">
                      {act.geo?.city ? `${act.geo.city}, ` : ''}{act.geo?.country || 'Unknown country'}
                    </span>
                    <span>•</span>
                    <span 
                      className="px-2 py-0.5 rounded-md bg-[#0a2442] border border-[#14a6d9]/30 text-[#14a6d9] font-bold tracking-tight"
                      title={`Viewed at ${localTime.timeStr} in your local timezone (${viewerTimeZone}) • Activity recorded from ${act.geo?.city || 'Unknown'}, ${act.geo?.country || 'Unknown country'}`}
                    >
                      {localTime.timeStr} {viewerTzShort}
                    </span>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold whitespace-nowrap">
                      {formatRelativeTime(act.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Stream footer indicator */}
        <div className="mt-3 pt-2.5 border-t border-gray-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>{filteredActivity.length} matching events · Page {currentActivityPage} of {activityPages}</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" disabled={currentActivityPage <= 1} onClick={() => setActivityPage(currentActivityPage - 1)}
              className="rounded border border-gray-700 px-3 py-1.5 text-white disabled:opacity-40">Previous</button>
            <button type="button" disabled={currentActivityPage >= activityPages} onClick={() => setActivityPage(currentActivityPage + 1)}
              className="rounded border border-gray-700 px-3 py-1.5 text-white disabled:opacity-40">Next</button>
          </div>
          <span className="text-gray-400">All activities normalized to your local timezone ({viewerTzShort} - {viewerTimeZone})</span>
        </div>
      </div>
      )}
      <dialog ref={actionDialog} aria-labelledby="analytics-action-title"
          onCancel={() => setPendingAction(null)}
          className="w-full max-w-lg rounded-2xl border border-gray-700 bg-[#071322] p-6 text-white backdrop:bg-black/70">
          {pendingAction && <form onSubmit={event => {
            event.preventDefault();
            const action = pendingAction;
            setPendingAction(null);
            executeAction(action.actionId, action.willEnable, actionReason);
          }} className="space-y-4">
            <h3 id="analytics-action-title" className="text-lg font-bold">{pendingAction.willEnable ? 'Apply optimization?' : 'Revert optimization?'}</h3>
            <p className="text-sm text-gray-300">Rule: {pendingAction.actionId}. This changes dashboard configuration and records an audit event. It does not verify runtime behavior.</p>
            <label className="block text-sm" htmlFor="analytics-action-reason">Audit reason</label>
            <textarea id="analytics-action-reason" value={actionReason} onChange={event => setActionReason(event.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-[#030b14] p-3 text-sm" rows={3} />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPendingAction(null)} className="rounded-lg border border-gray-600 px-4 py-2">Cancel</button>
              <button type="submit" disabled={Boolean(actionLoadingId)} className="rounded-lg bg-[#cedc28] px-4 py-2 font-semibold text-[#041628] disabled:opacity-50">
                {pendingAction.willEnable ? 'Apply' : 'Revert'}
              </button>
            </div>
          </form>}
      </dialog>
    </div>
  );
}
