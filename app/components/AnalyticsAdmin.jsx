"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Eye, Compass, Globe, Filter, Activity, RefreshCw, 
  Search, ArrowUpRight, TrendingUp, Sparkles, CheckCircle2, Clock, 
  Layers, BarChart2, Shield, Laptop, MapPin
} from 'lucide-react';
import { auth } from '../../lib/firebase';

export default function AnalyticsAdmin({ currentUserEmail = 'admin@tahaluf.com' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('lastActive');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <RefreshCw className="w-8 h-8 text-[#cedc28] animate-spin" />
        <p className="text-sm font-semibold tracking-wider text-[#14a6d9] uppercase">
          Aggregating Telemetry & User Insights...
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
  const tabUsage = data?.tabUsage || [];
  const geoDistribution = data?.geoDistribution || [];
  const filterInsights = data?.filterInsights || {};
  const recentActivity = data?.recentActivity || [];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* HEADER & TIME RANGE CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#cedc28] animate-pulse"></span>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#cedc28]">Live Telemetry Engine</span>
          </div>
          <h2 className="text-3xl font-black text-white tracking-wider uppercase">User Activity & Analytics</h2>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Real-time audit log of user sessions, tab adoption, global access footprint, and filter engagement
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time range pills */}
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

      {/* TOP KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total Views */}
        <div className="card-surface p-4 rounded-xl border border-[#cedc28]/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-[#cedc28]/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-[#cedc28] uppercase tracking-wider mb-1">Dashboard Views</p>
              <h3 className="text-2xl font-black text-white">{kpis.totalViews?.toLocaleString() || 0}</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-[#cedc28]" /> Total page visits
              </p>
            </div>
            <div className="p-2 rounded-lg bg-[#cedc28]/10 text-[#cedc28]">
              <Eye className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Total Sessions */}
        <div className="card-surface p-4 rounded-xl border border-[#14a6d9]/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-[#14a6d9]/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider mb-1">Active Sessions</p>
              <h3 className="text-2xl font-black text-white">{kpis.totalSessions?.toLocaleString() || 0}</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Laptop className="w-3 h-3 text-[#14a6d9]" /> Distinct sessions
              </p>
            </div>
            <div className="p-2 rounded-lg bg-[#14a6d9]/10 text-[#14a6d9]">
              <Compass className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Active Team Users */}
        <div className="card-surface p-4 rounded-xl border border-teal-500/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-teal-500/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">Active Team Users</p>
              <h3 className="text-2xl font-black text-white">{kpis.totalUsers || 0}</h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Shield className="w-3 h-3 text-teal-400" /> Authenticated
              </p>
            </div>
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Top Tab */}
        <div className="card-surface p-4 rounded-xl border border-indigo-500/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Most Used Tab</p>
              <h3 className="text-lg font-black text-white truncate max-w-[140px]" title={kpis.topTab}>
                {kpis.topTab}
              </h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Layers className="w-3 h-3 text-indigo-400" /> Highest traffic
              </p>
            </div>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <BarChart2 className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Top Country */}
        <div className="card-surface p-4 rounded-xl border border-amber-400/25 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-400/10 rounded-full blur-xl -mr-6 -mt-6"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wider mb-1">Top Access Region</p>
              <h3 className="text-lg font-black text-white flex items-center gap-1.5 truncate max-w-[140px]" title={kpis.topCountry}>
                <span className="text-xl">{kpis.topCountryFlag}</span>
                <span className="truncate">{kpis.topCountry}</span>
              </h3>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Globe className="w-3 h-3 text-amber-300" /> Primary hub
              </p>
            </div>
            <div className="p-2 rounded-lg bg-amber-400/10 text-amber-300">
              <Globe className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: TAB USAGE & GEOGRAPHIC DISTRIBUTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tab Usage Ranking */}
        <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#cedc28]" />
              <h3 className="text-base font-bold text-white tracking-wide uppercase">Tab Usage & Adoption</h3>
            </div>
            <span className="text-xs text-gray-400 font-mono">
              {tabUsage.reduce((acc, t) => acc + t.count, 0).toLocaleString()} total actions
            </span>
          </div>

          <div className="space-y-3.5">
            {tabUsage.map((item, idx) => (
              <div key={item.tab} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-200 flex items-center gap-2">
                    <span className="w-4 text-[10px] font-mono text-gray-500">#{idx + 1}</span>
                    {item.label}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono">{item.count.toLocaleString()}</span>
                    <span className="font-bold text-[#cedc28] w-10 text-right">{item.percentage}%</span>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-800/80 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-[#cedc28] to-[#14a6d9] transition-all duration-700"
                    style={{ width: `${Math.max(item.percentage, 4)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

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
      </div>

      {/* SECTION 2: FILTER USAGE & DIMENSION ADOPTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Business Filter Breakdown */}
        <div className="card-surface p-5 rounded-2xl border border-gray-800 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-[#cedc28]" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Business Filter Adoption</h4>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Audience segmentation preferences across B2B vs B2C vs Unfiltered views
          </p>

          <div className="space-y-3">
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
        </div>

        {/* Top Filtered Events */}
        <div className="card-surface p-5 rounded-2xl border border-gray-800 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-[#14a6d9]" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Top Filtered Events</h4>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Events most frequently isolated and inspected by executives and marketers
          </p>

          <div className="space-y-2">
            {(filterInsights.topEvents || []).slice(0, 5).map((ev, i) => (
              <div key={ev.event} className="flex justify-between items-center py-1.5 px-2.5 rounded-lg bg-[#071322] text-xs">
                <span className="font-semibold text-gray-200 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-500">#{i + 1}</span>
                  {ev.event}
                </span>
                <span className="font-mono font-bold text-[#14a6d9]">{ev.count.toLocaleString()} queries</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Filtered Channels */}
        <div className="card-surface p-5 rounded-2xl border border-gray-800 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Compass className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Top Filtered Channels</h4>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Paid media platforms analyzed most actively in channel and campaign breakdowns
          </p>

          <div className="space-y-2">
            {(filterInsights.topChannels || []).slice(0, 5).map((ch, i) => (
              <div key={ch.channel} className="flex justify-between items-center py-1.5 px-2.5 rounded-lg bg-[#071322] text-xs">
                <span className="font-semibold text-gray-200 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-500">#{i + 1}</span>
                  {ch.channel}
                </span>
                <span className="font-mono font-bold text-teal-400">{ch.count.toLocaleString()} queries</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 3: USER ACTIVITY & AUDIT TABLE */}
      <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-[#cedc28]" />
              <h3 className="text-lg font-bold text-white tracking-wide uppercase">User Access & Activity Log</h3>
            </div>
            <p className="text-xs text-gray-400">
              Detailed tracking of every authenticated team member, access times, and current view
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
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('lastActive')}>
                  Last Active {sortField === 'lastActive' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="py-3 px-4">Current Tab</th>
                <th className="py-3 px-4">Access Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-850 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-gray-500 text-xs">
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

      {/* SECTION 4: REAL-TIME AUDIT STREAM */}
      <div className="card-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#cedc28]" />
            <h3 className="text-base font-bold text-white tracking-wide uppercase">Real-Time Telemetry Feed</h3>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-[#cedc28] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#cedc28] animate-ping"></span>
            Streaming Events
          </span>
        </div>

        <div className="divide-y divide-gray-850">
          {recentActivity.slice(0, 8).map((act) => (
            <div key={act.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="text-base">{act.geo?.flag || '🌐'}</span>
                <div>
                  <span className="font-bold text-white">{act.userEmail}</span>
                  <span className="text-gray-400 ml-1.5">
                    {act.eventType === 'tab_view' ? 'opened tab' : 'applied filters on'}
                  </span>
                  <span className="ml-1.5 font-bold text-[#cedc28]">{act.tab}</span>
                  {act.filters?.business && act.filters.business !== 'All' && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#cedc28]/10 text-[#cedc28]">
                      {act.filters.business}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-gray-500 font-mono text-[11px]">
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
