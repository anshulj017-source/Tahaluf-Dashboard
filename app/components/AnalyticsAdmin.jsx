"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Eye, Compass, Globe, Filter, Activity, RefreshCw, 
  Search, ArrowUpRight, TrendingUp, Sparkles, CheckCircle2, Clock, 
  Layers, BarChart2, Shield, Laptop, MapPin, Zap, AlertTriangle,
  Check, ArrowRight, Settings, Download, Monitor, Database, Sliders,
  Gauge, PieChart as PieIcon, Cpu, AlertCircle, PlayCircle,
  RotateCcw, ShieldCheck, History
} from 'lucide-react';
import { auth } from '../../lib/firebase';

export default function AnalyticsAdmin({ currentUserEmail = 'admin@tahaluf.com' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('all');
  const [subView, setSubView] = useState('intelligence'); // 'intelligence' | 'behavior' | 'hardware' | 'audience'
  const [findingCategory, setFindingCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('lastActive');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  const fetchAnalytics = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const email = currentUserEmail || auth.currentUser?.email || 'admin@tahaluf.com';
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      headers['x-admin-email'] = email;

      const res = await fetch(`/api/admin/analytics?timeRange=${timeRange}&email=${encodeURIComponent(email)}`, {
        headers,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch analytics data');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const handleAction = async (actionId, willEnable, reason = '') => {
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
          ? 'Optimization applied successfully! Telemetry monitoring active.' 
          : 'Optimization reverted back to baseline.',
      });

      // Refresh data
      await fetchAnalytics();
    } catch (err) {
      alert(`Action execution failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setActionFeedback(null), 4000);
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
  }, [data?.users, searchQuery, sortField, sortDirection]);

  const filteredFindings = useMemo(() => {
    if (!data?.findings) return [];
    if (findingCategory === 'all') return data.findings;
    return data.findings.filter(f => f.category === findingCategory);
  }, [data?.findings, findingCategory]);

  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'Just now';
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
          onClick={fetchAnalytics}
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
  const actionsHistory = data?.actionsHistory || [];
  const tabUsage = data?.tabUsage || [];
  const dwellTimes = data?.dwellTimes || {};
  const featureInteractions = data?.featureInteractions || {};
  const deviceFootprint = data?.deviceFootprint || {};
  const performanceTelemetry = data?.performanceTelemetry || {};
  const userJourneys = data?.userJourneys || {};
  const geoDistribution = data?.geoDistribution || [];
  const filterInsights = data?.filterInsights || {};
  const appliedActions = data?.appliedActions || {};
  const recentActivity = data?.recentActivity || [];

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#cedc28] animate-pulse"></span>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#cedc28]">
              Automated Analysis & In-UI Action Engine
            </span>
          </div>
          <h2 className="text-3xl font-black text-white tracking-wider uppercase">
            Dashboard Intelligence & Analytics
          </h2>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Deep telemetry tracking, automated UX findings, display ergonomics, and 1-click dashboard optimizations
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time range selector */}
          <div className="flex items-center bg-[#071322] p-1 rounded-xl border border-gray-800">
            {[
              { id: 'all', label: 'All Time' },
              { id: '30d', label: '30 Days' },
              { id: '7d', label: '7 Days' },
              { id: 'today', label: 'Today' }
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

          <button
            onClick={fetchAnalytics}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0a2442] hover:bg-[#0d2f56] border border-[#14a6d9]/30 text-xs font-bold text-[#14a6d9] hover:text-white transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* TOP 5 EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total Views */}
        <div className="card-surface p-4 rounded-xl border border-[#cedc28]/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-[#cedc28]/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-[#cedc28] uppercase tracking-wider mb-1">Total Dashboard Views</p>
              <h3 className="text-2xl font-black text-white">{kpis.totalViews?.toLocaleString() || 0}</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-[#cedc28]" /> Page loads & tab visits
              </p>
            </div>
            <div className="p-2 rounded-lg bg-[#cedc28]/10 text-[#cedc28]">
              <Eye className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Avg Session Duration */}
        <div className="card-surface p-4 rounded-xl border border-[#14a6d9]/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-[#14a6d9]/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider mb-1">Avg Session Duration</p>
              <h3 className="text-2xl font-black text-white">{formatDurationSec(kpis.avgSessionDurationSec || 420)}</h3>
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
              <p className="text-[10px] font-bold text-purple-300 uppercase tracking-wider mb-1">13" Screen Baseline</p>
              <h3 className="text-2xl font-black text-white">58% Share</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Laptop className="w-3 h-3 text-purple-300" /> 1440x900 viewport
              </p>
            </div>
            <div className="p-2 rounded-lg bg-purple-400/10 text-purple-300">
              <Laptop className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* SUB-VIEW NAVIGATION TABS */}
      <div className="flex border-b border-gray-800 gap-6 overflow-x-auto">
        {[
          { id: 'intelligence', label: 'Actionable Findings & Intelligence', icon: Sparkles, count: findings.length },
          { id: 'fixes_monitoring', label: 'Fix Monitoring & Rollback History', icon: ShieldCheck, count: kpis.appliedOptimizationsCount },
          { id: 'behavior', label: 'Dwell Time & Behavioral Telemetry', icon: Clock },
          { id: 'hardware', label: 'Display & Performance Benchmarks', icon: Monitor },
          { id: 'audience', label: 'Audience, Geo & User Audit', icon: Users },
        ].map(tab => {
          const Icon = tab.icon;
          const active = subView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubView(tab.id)}
              className={`pb-3 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
                active
                  ? 'border-[#cedc28] text-[#cedc28]'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  active ? 'bg-[#cedc28] text-[#0a2442]' : 'bg-gray-800 text-gray-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* FEEDBACK TOAST */}
      {actionFeedback && (
        <div className="p-3 rounded-xl bg-[#cedc28]/15 border border-[#cedc28]/40 text-[#cedc28] flex items-center gap-2.5 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-[#cedc28]" />
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* SUB-VIEW 1: ACTIONABLE FINDINGS & INTELLIGENCE ENGINE */}
      {subView === 'intelligence' && (
        <div className="space-y-6">
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

          {/* Findings Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredFindings.map(finding => {
              const isApplied = finding.status === 'applied';
              const isLoading = actionLoadingId === finding.actionId;

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
                  <div>
                    {/* Card Header */}
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                            severityColors[finding.severity] || severityColors.medium
                          }`}>
                            {finding.severity}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                            {finding.category.replace('_', ' ')}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white tracking-wide">
                          {finding.title}
                        </h4>
                      </div>

                      {/* Impact Score Gauge */}
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1 font-mono text-xs font-black text-[#cedc28]">
                          <Zap className="w-3.5 h-3.5 text-[#cedc28]" />
                          {finding.impactScore}/100
                        </div>
                        <span className="text-[9px] text-gray-500 uppercase tracking-widest">Impact Score</span>
                      </div>
                    </div>

                    {/* Evidence & Findings Context */}
                    <div className="p-3 rounded-xl bg-[#030b14]/70 border border-gray-850 mb-3 text-xs text-gray-300 leading-relaxed">
                      <span className="font-bold text-gray-400 uppercase text-[10px] block mb-1">Live Telemetry Evidence:</span>
                      {finding.evidence}
                    </div>

                    {/* Recommendation */}
                    <div className="text-xs text-gray-300 mb-4 leading-relaxed">
                      <span className="font-bold text-[#14a6d9] mr-1">Recommended Action:</span>
                      {finding.recommendation}
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="pt-3 border-t border-gray-800 flex items-center justify-between gap-3">
                    <div className="text-[11px] font-bold text-[#cedc28] flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {finding.impactMetric}
                    </div>

                    {isApplied ? (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          Active & Monitored
                        </span>
                        <button
                          onClick={() => handleAction(finding.actionId, false, 'Reverted from findings card')}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 transition-all flex items-center gap-1.5 shadow-sm"
                          title="Revert fix back to baseline"
                        >
                          {isLoading ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Revert Fix
                        </button>
                      </div>
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
              );
            })}
          </div>

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
                  No automated optimizations applied yet. Review the findings above and click to apply.
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
                      <span className="text-[11px] font-bold text-emerald-400">{act.impact}</span>
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
      {subView === 'fixes_monitoring' && (
        <div className="space-y-8">
          {/* Section 1: Live Fix Health & Telemetry Impact Monitor */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Live Fix Health & Telemetry Impact Monitor
                </h3>
                <p className="text-xs text-gray-400">
                  Real-time status of applied fixes, observed telemetry delta, active duration, and 1-click rollback
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{monitoredFixes.filter(f => f.status === 'active').length} of {monitoredFixes.length} Fixes Active</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {monitoredFixes.map(fix => {
                const isActive = fix.status === 'active';
                const isReverted = fix.status === 'reverted';
                const isLoading = actionLoadingId === fix.actionId;

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
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                            isActive 
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                              : isReverted
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                : 'bg-gray-800 border-gray-700 text-gray-400'
                          }`}>
                            {isActive ? 'Active & Monitoring' : isReverted ? 'Reverted' : 'Standby'}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                            {fix.category.replace('_', ' ')}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white tracking-wide">{fix.title}</h4>
                      </div>

                      <div className="text-right">
                        <span className={`text-[11px] font-bold block ${isActive ? 'text-emerald-400' : 'text-gray-400'}`}>
                          {fix.uptime}
                        </span>
                        <span className="text-[9px] text-gray-500 uppercase tracking-widest">Status Uptime</span>
                      </div>
                    </div>

                    {/* Observed Telemetry Impact */}
                    <div className="p-3 rounded-xl bg-[#030b14]/70 border border-gray-850 mb-3 space-y-1.5 text-xs text-gray-300">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Observed Telemetry Impact:
                      </div>
                      <p className="text-xs text-gray-200 leading-relaxed font-medium">
                        {fix.telemetryEffect}
                      </p>
                      {fix.baselineMetric && (
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 pt-1 border-t border-gray-800/80 font-mono">
                          <span className="text-amber-400">Baseline: {fix.baselineMetric}</span>
                          <span>→</span>
                          <span className="text-emerald-400">Target: {fix.targetMetric}</span>
                        </div>
                      )}
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

                      {isActive ? (
                        <button
                          onClick={() => handleAction(fix.actionId, false, 'Admin requested rollback from Monitoring tab')}
                          disabled={isLoading}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 transition-all flex items-center gap-1.5 shadow-sm"
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
                );
              })}
            </div>
          </div>

          {/* Section 2: Audit History & Rollback Timeline */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <History className="w-5 h-5 text-[#14a6d9]" />
                  Fix Execution & Rollback Audit History
                </h3>
                <p className="text-xs text-gray-400">
                  Immutable log of all optimizations applied, reverted, or updated with author attribution
                </p>
              </div>
              <span className="text-xs text-gray-500 font-mono">
                {actionsHistory.length} Total Audit Entries
              </span>
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
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4 text-right">Quick Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 font-medium">
                    {actionsHistory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500">
                          No fix history records found.
                        </td>
                      </tr>
                    ) : (
                      actionsHistory.map((item) => {
                        const isApply = item.operation === 'APPLY';
                        const currentStatus = appliedActions[item.actionId]?.status;
                        const canRevert = currentStatus === 'active';
                        const isLoading = actionLoadingId === item.actionId;

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
                            <td className="py-3 px-4 text-gray-400 font-mono text-[11px] whitespace-nowrap">
                              {formatRelativeTime(item.timestamp)}
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
      {subView === 'behavior' && (
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
                const dt = dwellTimes[t.tab] || { avgSec: 60, bouncePercent: 10 };
                const isHighBounce = dt.bouncePercent >= 30;
                return (
                  <div key={t.tab} className="p-4 rounded-xl bg-[#071322] border border-gray-800">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-xs font-bold text-white">{t.label}</h4>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        isHighBounce ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-[#cedc28]/10 text-[#cedc28]'
                      }`}>
                        {dt.bouncePercent}% bounce
                      </span>
                    </div>

                    <div className="text-2xl font-black text-white font-mono mb-1">
                      {formatDurationSec(dt.avgSec)}
                    </div>
                    <p className="text-[10px] text-gray-400 mb-2">Average time spent per session</p>

                    <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-[#14a6d9] to-[#cedc28]"
                        style={{ width: `${Math.min(100, (dt.avgSec / 200) * 100)}%` }}
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
      {subView === 'hardware' && (
        <div className="space-y-6">
          {/* Display & Screen Resolution Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-purple-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Screen Resolution Distribution</h4>
                </div>
                <span className="text-xs text-purple-400 font-mono">13" Laptop = Baseline</span>
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
                  Live Sheet Data Ingestion & Caching Latencies
                </h4>
              </div>
              <span className="text-xs text-emerald-400 font-mono font-bold">
                Avg Response: {performanceTelemetry.avgApiLatencyMs}ms
              </span>
            </div>

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
      {subView === 'audience' && (
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
                          style={{ width: `${Math.max(bData.percentage, 5)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Top Filtered Events</h5>
              <div className="grid grid-cols-2 gap-2">
                {(filterInsights.topEvents || []).slice(0, 4).map((ev, i) => (
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

              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search user, role, or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#071322] border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#cedc28]"
                />
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
                            <div className="text-[10px] text-gray-500 font-mono">Sessions: {u.sessionCount || 1}</div>
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
                            {formatDurationSec(u.avgDwellSec || 120)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-gray-300 font-medium">{formatRelativeTime(u.lastActive)}</div>
                            <div className="text-[10px] text-gray-500 font-mono">
                              {new Date(u.lastActive).toLocaleDateString()}
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

      {/* PERSISTENT REAL-TIME TELEMETRY STREAM TICKER */}
      <div className="card-surface p-5 rounded-2xl border border-gray-800 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#cedc28]" />
            <h4 className="text-xs font-bold text-white tracking-wide uppercase">Real-Time Telemetry Stream</h4>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-[#cedc28] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#cedc28] animate-ping"></span>
            Streaming User Actions
          </span>
        </div>

        <div className="divide-y divide-gray-850">
          {recentActivity.slice(0, 5).map((act) => (
            <div key={act.id} className="py-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <span className="text-sm">{act.geo?.flag || '🌐'}</span>
                <div>
                  <span className="font-bold text-white">{act.userEmail}</span>
                  <span className="text-gray-400 ml-1.5">
                    {act.eventType === 'tab_view' ? 'switched to tab' : act.eventType === 'optimization_applied' ? 'applied optimization' : 'interacted with'}
                  </span>
                  <span className="ml-1.5 font-bold text-[#cedc28]">{act.tab || act.details?.title}</span>
                  {act.dwellTimeSec > 0 && (
                    <span className="ml-2 text-[10px] font-mono text-gray-500">
                      ({act.dwellTimeSec}s dwell)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-gray-500 font-mono text-[10px]">
                <span>{act.geo?.city ? `${act.geo.city}, ` : ''}{act.geo?.country}</span>
                <span>•</span>
                <span>{formatRelativeTime(act.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
