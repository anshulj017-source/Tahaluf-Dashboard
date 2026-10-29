"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle2,
  Clock, Database, Globe, HelpCircle, Layers, Mail,
  RefreshCw, Shield, ShieldAlert, ShieldCheck, Sparkles, Zap, ArrowUpRight
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import ApiUsageAnalytics from './ApiUsageAnalytics';
import { useLowQuotaMode } from './DashboardFeatureContext';
import { AdminTabs, AdminDialog, useAdminView } from './AdminUI';

const getServiceIcon = (id) => {
  switch (id) {
    case 'firestore':
      return <Database className="w-5 h-5 text-amber-400" />;
    case 'vercel':
      return <Globe className="w-5 h-5 text-[#14a6d9]" />;
    case 'sheets':
      return <Layers className="w-5 h-5 text-lime-400" />;
    case 'smtp':
      return <Mail className="w-5 h-5 text-indigo-400" />;
    case 'firebase-auth':
      return <Shield className="w-5 h-5 text-cyan-400" />;
    default:
      return <Activity className="w-5 h-5 text-[#cedc28]" />;
  }
};

const getStatusBadge = (status) => {
  switch (status) {
    case 'healthy':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-lime-500/10 text-lime-300 border border-lime-400/30">
          <CheckCircle2 className="w-3 h-3 text-lime-400" />
          Connectivity OK
        </span>
      );
    case 'observed':
      return <span className="text-[10px] text-[#14a6d9]">Usage observed</span>;
    case 'warning':
    case 'quota-exceeded':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-400/40">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          Connectivity warning
        </span>
      );
    case 'critical':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-400/40">
          <ShieldAlert className="w-3 h-3 text-rose-400" />
          Service error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-300 border border-gray-500/30">
          <HelpCircle className="w-3 h-3 text-gray-400" />
          Not verified
        </span>
      );
  }
};

const getProgressColor = (percent) => {
  if (percent >= 90) return 'bg-rose-500 text-rose-400';
  if (percent >= 70) return 'bg-amber-400 text-amber-400';
  return 'bg-lime-400 text-lime-400';
};

export default function ApiQuotasAdmin({
  active = true,
  currentUserEmail = null,
  userRole = null,
  onPolicySaved
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
    const email = authContextRef.current.currentUserEmail || auth.currentUser?.email || cachedEmail || 'admin@tahaluf.com';
    const role = authContextRef.current.userRole || cachedRole || 'super_admin';
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-admin-email': email,
      'x-admin-role': role
    };
  }, []);

  const lowQuotaMode = useLowQuotaMode();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(null);
  const [error, setError] = useState(null);
  const [lastAuditAt, setLastAuditAt] = useState(null);
  const [pingResults, setPingResults] = useState({});
  const [pinging, setPinging] = useState(null);
  const [view, setView] = useAdminView('apiView', 'overview', ['overview', 'usage', 'alerts', 'diagnostics']);
  const [confirmMemory, setConfirmMemory] = useState(false);
  const measuredServices = data?.services?.filter(service => Number.isFinite(service.latencyMs)) || [];

  const fetchQuotas = useCallback(async (isRefresh = false, propagateError = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/quotas', { headers });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load API quota data.');
      }
      setData(json);
      setLastAuditAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error fetching API infrastructure status');
      if (propagateError) throw err;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (active) {
      fetchQuotas();
    }
  }, [active, fetchQuotas]);

  const toggleCircuitBreaker = async (key, currentValue) => {
    setToggling(key);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          action: 'toggle-circuit-breaker',
          [key]: !currentValue
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update safeguard settings.');
      }
      setData(prev => ({
        ...prev,
        circuitBreakers: json.circuitBreakers
      }));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error updating guardrail state');
    } finally {
      setToggling(null);
    }
  };

  const pingSingleService = async (serviceId) => {
    setPinging(serviceId);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'ping', service: serviceId })
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.result) throw new Error(json.error || 'Service check failed.');
      if (json.result) {
        setPingResults(prev => ({
          ...prev,
          [serviceId]: json.result
        }));
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Service check failed.');
    } finally {
      setPinging(null);
    }
  };

  const exportQuotaReport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tahaluf-api-quota-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div hidden={!active} className="space-y-5">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-2xl font-bold text-white">
            <ShieldCheck className="w-6 h-6 text-[#cedc28]" />
            <h2>API &amp; Quotas</h2>
          </div>
          <p className="text-[#14a6d9] text-xs font-medium mt-1">
            Partial application usage observations and on-demand connectivity checks. Provider quotas are not verified; collection runs with traffic, not an autonomous daily scheduler.
          </p>
          {lastAuditAt && (
            <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-gray-400" />
              <span>Last successful update: {lastAuditAt}. Refreshes on entry or request; no background polling.</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {data && (
            <button
              onClick={exportQuotaReport}
              className="px-3.5 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              title="Download API quota audit snapshot"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-[#14a6d9]" />
              <span>Export Audit</span>
            </button>
          )}
          <button
            onClick={() => fetchQuotas(true)}
            disabled={loading || refreshing}
            className="px-4 py-2 rounded-xl border border-[#14a6d9]/40 bg-[#14a6d9]/10 text-[#14a6d9] hover:text-white hover:bg-[#14a6d9]/20 disabled:opacity-50 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh report'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}{data ? ' Previously loaded data may be stale.' : ''}</span>
        </div>
      )}

      <AdminTabs value={view} onChange={setView} label="API sections" tabs={[
        { id: 'overview', label: 'Overview' }, { id: 'usage', label: 'Usage & Forecast' },
        { id: 'alerts', label: 'Alerts & Limits' }, { id: 'diagnostics', label: 'Diagnostics' }
      ]} />
      {loading && !data && <p role="status" className="text-sm text-slate-300">Loading API report...</p>}
      
      {/* PROACTIVE RUNWAY & SAFEGUARD BANNER */}
      {view === 'overview' && data?.burnRate && (
        <div className="card-surface p-4 rounded-2xl border border-[#cedc28]/25 bg-gradient-to-r from-[#031120] to-[#041628] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#cedc28]/10 border border-[#cedc28]/30 text-[#cedc28]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Proactive Firestore Runway &amp; Safeguard</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                  data.burnRate.autoTripEngaged ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                }`}>
                  {data.burnRate.autoTripEngaged ? '85% Shield Active' : 'Auto-Trip Armed (85%)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Writes Today: <strong className="text-white">{data.burnRate.firestoreWritesToday.toLocaleString()}</strong> / 20,000 allowance • Velocity: <strong className="text-white">~{data.burnRate.writeBurnRatePerHour}/hr</strong> • Safety Runway: <strong className="text-emerald-400">{data.burnRate.estimatedRunwayHours}h remaining</strong>
              </p>
            </div>
          </div>
          <div className="text-right text-[10px] text-slate-400 font-mono">
            Daily reset at <strong className="text-white">00:00 UTC</strong>
          </div>
        </div>
      )}

      <div hidden={view !== 'overview'} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-surface p-4 rounded-2xl border border-white/5 space-y-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Services Monitored</div>
          <div className="text-2xl font-black text-white flex items-baseline gap-2">
            <span>{data?.summary?.totalServices ?? '—'}</span>
          </div>
          <p className="text-[10px] text-gray-500">Connected services and integration coverage</p>
        </div>

        <div className="card-surface p-4 rounded-2xl border border-white/5 space-y-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Infrastructure Status</div>
          <div className="text-2xl font-black text-white flex items-baseline gap-2">
            {data?.summary?.criticalServices > 0 ? (
              <span className="text-amber-300">Shield Engaged</span>
            ) : (
              <span className="text-[#14a6d9]">Partial coverage</span>
            )}
          </div>
          <p className="text-[10px] text-gray-500">
            {data?.summary?.criticalServices > 0 ? 'Review observed service errors' : 'Provider-wide quotas and billing not connected'}
          </p>
        </div>

        <div className="card-surface p-4 rounded-2xl border border-white/5 space-y-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Snapshot Persistence</div>
          <div className="text-2xl font-black text-[#cedc28] flex items-baseline gap-2">
            <span>{!data ? 'Not loaded' : data.circuitBreakers?.forceMemoryCache ? 'Memory only' : 'Standard'}</span>
          </div>
          <p className="text-[10px] text-gray-500">Configuration indicators, not verified protection</p>
        </div>

        <div className="card-surface p-4 rounded-2xl border border-white/5 space-y-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Avg Endpoint Latency</div>
          <div className="text-2xl font-black text-[#14a6d9] flex items-baseline gap-2">
            <span>
              {measuredServices.length
                ? Math.round(measuredServices.reduce((acc, service) => acc + service.latencyMs, 0) / measuredServices.length)
                : '—'}
              ms
            </span>
          </div>
          <p className="text-[10px] text-gray-500">Measured endpoints only; not all dashboard requests</p>
        </div>
      </div>

      {lowQuotaMode && <p className="text-sm text-amber-200">Low-quota mode enabled. API reports still load on entry or manual request; no background quota polling is configured.</p>}
      <div hidden={view === 'diagnostics'}>
      <ApiUsageAnalytics view={view} report={data?.usage} onSaved={() => fetchQuotas(true, true)} onPolicySaved={async policy => {
        setData(previous => ({ ...previous, policy, usage: { ...previous.usage, policy } }));
        await onPolicySaved?.(policy);
      }} />
      </div>

      {/* ACTIVE SAFEGUARDS & CIRCUIT BREAKER CONTROL PANEL */}
      <div hidden={view !== 'diagnostics'} className="space-y-5">
      <div className="card-surface rounded-2xl border border-[#cedc28]/30 p-5 bg-[#031120]/70 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#cedc28]/15 border border-[#cedc28]/30 text-[#cedc28]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Advanced cache controls</span>
              </h3>
              <p className="text-[11px] text-[#cedc28]/90 mt-0.5">
                Instance-local overrides. These do not enforce provider-wide quotas.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full border border-lime-400/40 bg-lime-500/10 text-lime-300 text-[10px] font-bold uppercase tracking-wider self-start sm:self-auto shrink-0">
            Manual configuration
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Toggle 1: Force Memory-Only Mode */}
          <div className="p-3.5 rounded-xl bg-[#041628] border border-gray-700/60 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Memory-Only Cache Shield</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                  data?.circuitBreakers?.forceMemoryCache
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    : 'bg-lime-500/10 text-lime-300 border-lime-400/30'
                }`}>
                  {data?.circuitBreakers?.forceMemoryCache ? 'Forced On' : 'Auto Fallback'}
                </span>
              </div>
              <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">
                Skips persistent sheet snapshot writes on this server instance. Existing in-memory caching and upstream fetching continue. Does not disable all Firestore writes or guarantee availability. Restarting or switching instances may reset this override.
              </p>
            </div>
            <button
              onClick={() => setConfirmMemory(true)}
              disabled={!data || Boolean(toggling)}
              className="mt-2 w-full py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-[#14a6d9]/40 text-[#14a6d9] hover:bg-[#14a6d9]/10 transition-all text-center"
            >
              {toggling === 'forceMemoryCache' ? 'Updating...' : data?.circuitBreakers?.forceMemoryCache ? 'Disable Forced Mode' : 'Enable Memory-Only Shield'}
            </button>
          </div>

          {/* Toggle 2: High Efficiency Edge Mode */}
          <div className="p-3.5 rounded-xl bg-[#041628] border border-gray-700/60 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Vercel Edge Shield</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border bg-lime-500/10 text-lime-300 border-lime-400/30">
                  Not configurable here
                </span>
              </div>
              <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">
                Cache headers are managed by individual endpoints. The former Edge Shield switch did not change runtime caching and has been disabled.
              </p>
            </div>
            <button
              disabled
              className="mt-2 w-full py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-white/20 text-gray-300 hover:bg-white/5 transition-all text-center"
            >
              Managed by endpoint configuration
            </button>
          </div>

          {/* Toggle 3: SMTP Throttling */}
          <div className="p-3.5 rounded-xl bg-[#041628] border border-gray-700/60 space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Alert Rate Limiter</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border bg-lime-500/10 text-lime-300 border-lime-400/30">
                  Managed in Health Monitor
                </span>
              </div>
              <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">
                Email frequency, grace periods and category preferences are configured in Health Monitor Settings. Deduplication is not a provider quota guarantee. The former switch did not control delivery and has been disabled.
              </p>
            </div>
            <button
              disabled
              className="mt-2 w-full py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-white/20 text-gray-300 hover:bg-white/5 transition-all text-center"
            >
              Configure in Health Monitor
            </button>
          </div>
        </div>
      </div>

      {/* CONNECTED APIS QUOTA PROGRESS & USAGE BREAKDOWN */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
          <Database className="w-4 h-4 text-[#14a6d9]" />
          <span>Provider diagnostics &amp; connectivity</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data?.services?.map(service => {
            const isPinging = pinging === service.id;
            const pingRes = pingResults[service.id];

            return (
              <div
                key={service.id}
                className="card-surface rounded-2xl border border-white/10 p-5 bg-[#031120]/80 space-y-4 hover:border-[#14a6d9]/30 transition-all"
              >
                {/* Service Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      {getServiceIcon(service.id)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{service.name}</span>
                      </h4>
                      <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
                        <span>{service.category}</span>
                        <span>•</span>
                        <span className="text-[#14a6d9] font-mono">{service.tier}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {getStatusBadge(service.status)}
                    <button
                      onClick={() => pingSingleService(service.id)}
                      disabled={isPinging || !['firestore', 'sheets', 'smtp', 'vercel'].includes(service.id)}
                      className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 font-mono transition-colors"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isPinging ? 'animate-spin' : ''}`} />
                      <span>{Number.isFinite(pingRes?.latencyMs ?? service.latencyMs) ? `${pingRes?.latencyMs ?? service.latencyMs}ms` : 'Not measured'}</span>
                    </button>
                    {pingRes?.error && <span className="text-[10px] text-amber-300 max-w-[180px]">{pingRes.error}</span>}
                  </div>
                </div>

                {/* Quotas Progress Bars */}
                <div className="space-y-3 pt-1">
                  {service.quotas.map(quota => {
                    const colorClass = getProgressColor(quota.percent);
                    return (
                      <div key={quota.metric} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-300 font-medium">{quota.metric}</span>
                          <span className="font-mono text-[11px] text-gray-400">
                            <strong className="text-white">{quota.used == null ? 'Not connected' : quota.used.toLocaleString()}</strong> / {quota.limit == null ? 'No allowance configured' : quota.limit.toLocaleString()} {quota.unit}
                            {quota.percent != null && <> (<span className={colorClass.split(' ')[1]}>{quota.percent.toFixed(1)}%</span>)</>}
                          </span>
                        </div>
                        {quota.percent != null && <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${colorClass.split(' ')[0]}`}
                            style={{ width: `${Math.min(100, Math.max(2, quota.percent))}%` }}
                          />
                        </div>}
                      </div>
                    );
                  })}
                  <div className="text-[10px] text-gray-500 flex items-center justify-between pt-0.5">
                    <span>{service.quotaResetText}</span>
                    <span className="text-gray-400">Configured allowance, not a provider limit</span>
                  </div>
                </div>

                {/* Active Workarounds Banner */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-lime-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-lime-400" />
                    <span>Active Workaround &amp; Safeguard</span>
                  </div>
                  <ul className="text-[11px] text-gray-300 space-y-1 pl-4 list-disc marker:text-lime-400/70">
                    {service.activeWorkarounds.map((w, idx) => (
                      <li key={idx} className="leading-snug">{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SUGGESTIONS, FIXES & ENHANCEMENTS IMPACT MATRIX */}
      <div className="card-surface rounded-2xl border border-[#14a6d9]/25 p-5 space-y-4 bg-[#031120]/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#cedc28]" />
              <span>Architectural Suggestions, Fixes &amp; Impact Analysis</span>
            </h3>
            <p className="text-[11px] text-[#14a6d9] mt-0.5">
              Suggestions for review. These are not measurements or guarantees of provider capacity.
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border border-white/10 px-2.5 py-1 rounded-full self-start sm:self-auto">
            Actionable Roadmap
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3.5">
          {data?.services?.flatMap(s => s.recommendations.map(r => ({ ...r, serviceName: s.name }))).map((rec, i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-[#041628] border border-white/10 hover:border-[#14a6d9]/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                    rec.priority === 'HIGH'
                      ? 'bg-rose-500/10 text-rose-300 border-rose-400/30'
                      : rec.priority === 'MEDIUM'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-400/30'
                        : 'bg-blue-500/10 text-blue-300 border-blue-400/30'
                  }`}>
                    {rec.priority} Priority
                  </span>
                  <span className="text-xs font-bold text-white">{rec.title}</span>
                  <span className="text-[10px] text-gray-500 font-mono">({rec.serviceName})</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{rec.summary}</p>
                <div className="flex items-start gap-1.5 text-[11px] text-[#cedc28] pt-1">
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#cedc28]" />
                  <span><strong>Dashboard Impact:</strong> {rec.impact}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
      {confirmMemory && <AdminDialog title="Change snapshot persistence?" onClose={() => setConfirmMemory(false)}>
        <p className="text-sm text-slate-300">This changes persistent sheet snapshot writes on this instance only. Memory-only data may be lost on restart. Other Firestore writes continue.</p>
        <div className="mt-4 flex gap-3">
          <button onClick={() => setConfirmMemory(false)} className="rounded border border-slate-600 px-4 py-2">Cancel</button>
          <button onClick={() => { setConfirmMemory(false); toggleCircuitBreaker('forceMemoryCache', data?.circuitBreakers?.forceMemoryCache); }} className="rounded bg-[#cedc28] px-4 py-2 text-[#041628]">Confirm change</button>
        </div>
      </AdminDialog>}
    </div>
  );
}
