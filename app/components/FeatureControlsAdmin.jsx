"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { 
  Shield, Eye, EyeOff, Save, RotateCcw, Search, CheckCircle2, 
  AlertTriangle, Filter, Sparkles, Tv, Layers, Wrench, Activity, 
  Brain, BarChart2, Globe, Lock, Ban, ExternalLink
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { DASHBOARD_FEATURES, DEFAULT_FEATURE_CONFIG, isFeatureEnabled } from '../../lib/dashboardFeatures.mjs';
import { useAdminDirtyGuard } from './AdminUI';

const GROUP_ICONS = {
  'Dashboard views': Layers,
  'Presentation': Tv,
  'Tools': Wrench,
  'Monitoring': Activity,
  'Intelligence': Brain,
  'Advanced Analytics': BarChart2,
  'Admin Center': Shield
};

export default function FeatureControlsAdmin({ currentUserEmail = 'admin@tahaluf.com', userRole = 'super_admin', onSaved, onNavigate }) {
  if (userRole !== 'super_admin') {
    return (
      <div className="card-surface p-8 rounded-3xl border border-amber-500/30 bg-[#0a2442]/80 text-center max-w-xl mx-auto my-12 shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Super Admin Access Required</h3>
        <p className="text-xs text-slate-300 mb-6 leading-relaxed">
          Feature Controls is strictly restricted to <span className="text-[#cedc28] font-bold">Super Administrators</span>. 
          Standard administrators can manage Events, Health, Quotas, and User Access, but cannot modify global feature deployments.
        </p>
        <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-black/40 text-slate-400 border border-white/10">
          Current Role: {userRole}
        </span>
      </div>
    );
  }
  const [config, setConfig] = useState(null);
  const [modes, setModes] = useState(DEFAULT_FEATURE_CONFIG.modes);
  const [previewRole, setPreviewRole] = useState('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/features', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not load feature controls.');
      setConfig(json.config);
      
      // Check for preserved draft in localStorage
      let effectiveModes = { ...DEFAULT_FEATURE_CONFIG.modes, ...json.config.modes };
      try {
        const savedDraft = localStorage.getItem('tahaluf_feature_modes_draft');
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed && typeof parsed === 'object') {
            effectiveModes = { ...effectiveModes, ...parsed };
          }
        }
      } catch {}

      setModes(effectiveModes);
      setNotice('');
    } catch (err) {
      setError(err.message || 'Error loading feature controls.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Listen for global discard events from AdminView
  useEffect(() => {
    const handleDiscard = (e) => {
      if (!e.detail || e.detail.section === 'features') {
        discardDraft();
      }
    };
    window.addEventListener('admin-discard-draft', handleDiscard);
    return () => window.removeEventListener('admin-discard-draft', handleDiscard);
  }, [config]);

  const setFeatureMode = (featureId, newMode) => {
    setModes(prev => {
      const updated = { ...prev, [featureId]: newMode };
      try {
        localStorage.setItem('tahaluf_feature_modes_draft', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setNotice('');
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem('tahaluf_feature_modes_draft');
    } catch {}
    if (config) {
      setModes({ ...DEFAULT_FEATURE_CONFIG.modes, ...config.modes });
      setNotice('Draft changes discarded. Reverted to active database configuration.');
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const token = await auth.currentUser?.getIdToken(true).catch(() => null);
      const email = currentUserEmail || auth.currentUser?.email || (typeof window !== 'undefined' ? localStorage.getItem('tahaluf_cached_email') : '') || 'admin@tahaluf.com';
      const role = userRole || (typeof window !== 'undefined' ? localStorage.getItem('tahaluf_cached_role') : '') || 'super_admin';
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-admin-email': email,
        'x-admin-role': role
      };
      const response = await fetch('/api/admin/features', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ modes, revision: config?.revision ?? 0 })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not save feature controls.');
      setConfig(json.config);
      setModes(json.config.modes);
      try {
        localStorage.removeItem('tahaluf_feature_modes_draft');
      } catch {}
      onSaved?.(json.config);
      setNotice('Feature controls saved successfully. Connected dashboard sessions update automatically within 60 seconds or on window focus.');
    } catch (err) {
      setError(err.message || 'Failed to save feature controls.');
    } finally {
      setBusy(false);
    }
  };

  const dirty = config && JSON.stringify(modes) !== JSON.stringify({ ...DEFAULT_FEATURE_CONFIG.modes, ...config.modes });
  useAdminDirtyGuard('features', Boolean(dirty));
  const changedFeatures = config ? DASHBOARD_FEATURES.filter(feature => modes[feature.id] !== ({ ...DEFAULT_FEATURE_CONFIG.modes, ...config.modes })[feature.id]) : [];

  // Summary Metrics
  const metrics = useMemo(() => {
    let publicCount = 0;
    let adminCount = 0;
    let disabledCount = 0;
    DASHBOARD_FEATURES.forEach(f => {
      const mode = modes[f.id] || f.defaultMode || 'public';
      if (mode === 'public') publicCount++;
      else if (mode === 'admin_only') adminCount++;
      else if (mode === 'disabled') disabledCount++;
    });
    return {
      total: DASHBOARD_FEATURES.length,
      publicCount,
      adminCount,
      disabledCount
    };
  }, [modes]);

  // Presets
  const applyPreset = (type) => {
    if (type === 'default') {
      setModes({ ...DEFAULT_FEATURE_CONFIG.modes });
      setNotice('Applied Default Balanced preset. Click "Save Changes" to publish.');
    } else if (type === 'showcase') {
      const newModes = { ...modes };
      DASHBOARD_FEATURES.forEach(f => {
        if (!f.adminOnly) newModes[f.id] = 'public';
      });
      setModes(newModes);
      setNotice('Applied Public Showcase preset. All views & tools enabled for all users.');
    } else if (type === 'minimal') {
      const newModes = { ...modes };
      DASHBOARD_FEATURES.forEach(f => {
        if (f.id === 'summary') newModes[f.id] = 'public';
        else if (f.group === 'Dashboard views') newModes[f.id] = 'admin_only';
      });
      setModes(newModes);
      setNotice('Applied Minimal / Staging preset. Secondary views restricted to administrators.');
    }
  };

  // Filtered features
  const groups = useMemo(() => ['All', ...new Set(DASHBOARD_FEATURES.map(f => f.group))], []);
  
  const filteredFeatures = useMemo(() => {
    return DASHBOARD_FEATURES.filter(f => {
      if (selectedGroup !== 'All' && f.group !== selectedGroup) return false;
      const currentMode = modes[f.id] || f.defaultMode || 'public';
      if (selectedStatusFilter !== 'All' && currentMode !== selectedStatusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.group.toLowerCase().includes(q);
      }
      return true;
    });
  }, [selectedGroup, selectedStatusFilter, searchQuery, modes]);

  return (
    <section className="space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-6 h-6 text-[#cedc28]" />
            <h2 className="text-2xl font-bold tracking-tight text-white">Dashboard Feature Controls</h2>
          </div>
          <p className="text-sm text-slate-400">
            Dynamically toggle visibility of dashboard views, executive intelligence tools, and presentation modes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={busy}
            onClick={load}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#0a2442] border border-[#cedc28]/25 text-slate-300 hover:text-white hover:border-[#cedc28]/50 transition-all"
            title="Reload settings from database"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>

          <button
            disabled={busy || !dirty}
            onClick={save}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
              dirty
                ? 'bg-[#cedc28] text-[#1a302e] hover:bg-[#d8e635] shadow-[0_0_20px_rgba(206,220,40,0.35)] animate-pulse'
                : 'bg-white/10 text-slate-400 border border-white/10 cursor-not-allowed opacity-50'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{busy ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}</span>
          </button>
        </div>
      </div>

      {/* PENDING DRAFT NOTICE BANNER */}
      {dirty && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-lg flex flex-wrap items-center justify-between gap-3 text-amber-200 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">Unsaved Draft Changes ({changedFeatures.length})</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 uppercase tracking-wider">Draft Mode</span>
              </div>
              <p className="text-xs text-amber-200/90 mt-0.5">
                Pending: {changedFeatures.map(f => `${f.name} → ${modes[f.id]}`).join(', ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={discardDraft}
              className="px-3.5 py-1.5 rounded-xl border border-slate-600 hover:border-red-400/50 bg-[#071b2e] text-xs font-semibold text-slate-300 hover:text-red-300 transition-all"
            >
              Discard Draft
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="px-4 py-1.5 rounded-xl bg-[#cedc28] text-[#041628] text-xs font-bold hover:bg-[#b5c222] transition-all shadow-md shadow-[#cedc28]/20 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{busy ? 'Saving...' : 'Save Draft Changes'}</span>
            </button>
          </div>
        </div>
      )}

      {/* KPI METRIC TILES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-surface p-4 rounded-2xl border border-white/10 bg-[#0a2442]/60 backdrop-blur-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Features</span>
            <Layers className="w-4 h-4 text-[#14a6d9]" />
          </div>
          <div className="text-2xl font-extrabold text-white">{metrics.total}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Managed permission modules</p>
        </div>

        <div className="card-surface p-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 backdrop-blur-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Public Access</span>
            <Globe className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-300">{metrics.publicCount}</div>
          <p className="text-[10px] text-emerald-400/80 mt-0.5">Visible to all visitors & viewers</p>
        </div>

        <div className="card-surface p-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 backdrop-blur-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Admin Gated</span>
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-300">{metrics.adminCount}</div>
          <p className="text-[10px] text-amber-400/80 mt-0.5">Exclusive to administrators</p>
        </div>

        <div className="card-surface p-4 rounded-2xl border border-rose-500/25 bg-rose-500/5 backdrop-blur-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Disabled</span>
            <Ban className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-300">{metrics.disabledCount}</div>
          <p className="text-[10px] text-rose-400/80 mt-0.5">Deactivated for everyone</p>
        </div>
      </div>

      {/* INTERACTIVE ROLE SIMULATOR / PERSONA PREVIEW CARD */}
      <div className="card-surface p-5 rounded-2xl border border-[#cedc28]/25 bg-gradient-to-br from-[#0a2442]/90 via-[#071b2e] to-[#041628] shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#cedc28]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#cedc28]">Live Persona Simulator</h3>
            <span className="text-[10px] bg-[#cedc28]/15 text-[#cedc28] px-2 py-0.5 rounded-full font-bold border border-[#cedc28]/30">
              Interactive Preview
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#041628] p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setPreviewRole('standard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                previewRole === 'standard'
                  ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Standard Viewer</span>
            </button>
            <button
              onClick={() => setPreviewRole('admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                previewRole === 'admin'
                  ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_12px_rgba(206,220,40,0.35)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Administrator</span>
            </button>
          </div>
        </div>

        {/* Live Persona Simulation Pills */}
        <div className="bg-[#041628]/80 rounded-xl p-3 border border-white/5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Active navigation &amp; tools visible to <span className="text-white font-extrabold">{previewRole === 'admin' ? 'Administrators' : 'Regular Users / Viewers'}</span>:
          </div>
          <div className="flex flex-wrap gap-2">
            {DASHBOARD_FEATURES.map(feature => {
              const visible = isFeatureEnabled({ modes }, feature.id, previewRole);
              return (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => onNavigate && onNavigate(feature.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                    visible
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm hover:border-[#cedc28] hover:text-[#cedc28] cursor-pointer'
                      : 'bg-white/5 border-white/5 text-slate-500 line-through opacity-50 cursor-pointer hover:border-slate-500'
                  }`}
                  title={`${feature.name}: ${visible ? 'Visible' : 'Hidden'} for ${previewRole}. Click to jump to this feature.`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${visible ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                  <span>{feature.name}</span>
                  {onNavigate && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* QUICK PRESETS & ACTIONS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#0a2442]/40 border border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Strategy Presets:</span>
          <button
            onClick={() => applyPreset('default')}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-[#cedc28]/20 hover:text-[#cedc28] hover:border-[#cedc28]/40 transition-all font-medium"
          >
            Default Balanced
          </button>
          <button
            onClick={() => applyPreset('showcase')}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/40 transition-all font-medium"
          >
            Public Showcase
          </button>
          <button
            onClick={() => applyPreset('minimal')}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40 transition-all font-medium"
          >
            Admin Staging Only
          </button>
        </div>

        {dirty && (
          <div className="flex items-center gap-2 text-xs text-amber-300 font-medium animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Unsaved draft changes ({changedFeatures.length})</span>
          </div>
        )}
      </div>

      {/* SEARCH & CATEGORY FILTER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search features by name or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0a2442] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#cedc28]/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#0a2442] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-[#cedc28]/50"
          >
            {groups.map(g => <option key={g} value={g}>{g === 'All' ? 'All Groups' : g}</option>)}
          </select>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#0a2442] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-[#cedc28]/50"
          >
            <option value="All">All Visibility Modes</option>
            <option value="public">Everyone (Public)</option>
            <option value="admin_only">Admin Only</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      {/* NOTICES & ALERTS */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* FEATURE CARDS LIST BY GROUP */}
      <div className="space-y-4">
        {[...new Set(filteredFeatures.map(f => f.group))].map(group => {
          const GroupIcon = GROUP_ICONS[group] || Layers;
          const featuresInGroup = filteredFeatures.filter(f => f.group === group);
          
          return (
            <div key={group} className="card-surface rounded-2xl border border-white/10 bg-[#0a2442]/60 overflow-hidden shadow-lg">
              <div className="flex items-center gap-2 px-5 py-3.5 bg-white/[0.03] border-b border-white/5">
                <GroupIcon className="w-4 h-4 text-[#cedc28]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">{group}</h3>
                <span className="text-[10px] text-slate-400 ml-auto font-mono">{featuresInGroup.length} feature{featuresInGroup.length === 1 ? '' : 's'}</span>
              </div>

              <div className="divide-y divide-white/5">
                {featuresInGroup.map(feature => {
                  const currentMode = modes[feature.id] || feature.defaultMode || 'public';
                  const isVisibleInPreview = isFeatureEnabled({ modes }, feature.id, previewRole);

                  return (
                    <div key={feature.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-bold text-white">{feature.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                            <span>📍</span>
                            <span>{feature.section || feature.group}</span>
                          </span>
                          <span className="px-2 py-0.5 rounded text-[9.5px] font-mono text-slate-400 bg-white/5 border border-white/10 hidden sm:inline-block">
                            {feature.targetLocation}
                          </span>
                          {feature.adminOnly && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              System Restricted
                            </span>
                          )}
                          {feature.requires && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/25">
                              Requires {feature.requires}
                            </span>
                          )}
                          {onNavigate && (
                            <button
                              type="button"
                              onClick={() => onNavigate(feature.id)}
                              className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#cedc28]/15 text-[#cedc28] border border-[#cedc28]/35 hover:bg-[#cedc28] hover:text-[#041628] transition-all flex items-center gap-1 shadow-sm"
                              title={`Jump directly to ${feature.name} (${feature.targetLocation})`}
                            >
                              <span>Go to Section</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{feature.description}</p>
                      </div>

                      {/* Pill Toggle Controls */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isVisibleInPreview ? 'text-emerald-300 bg-emerald-500/10' : 'text-slate-500 bg-white/5'
                        }`}>
                          {isVisibleInPreview ? 'Visible in Simulator' : 'Hidden in Simulator'}
                        </span>

                        <div className="flex items-center bg-[#041628] p-1 rounded-xl border border-white/10 shadow-inner">
                          {/* Option 1: Everyone */}
                          {!feature.adminOnly && (
                            <button
                              disabled={busy}
                              onClick={() => setFeatureMode(feature.id, 'public')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                currentMode === 'public'
                                  ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_12px_rgba(206,220,40,0.35)]'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                              title="Active for all dashboard visitors"
                            >
                              <Globe className="w-3 h-3" />
                              <span>Everyone</span>
                            </button>
                          )}

                          {/* Option 2: Admin Only */}
                          <button
                            disabled={busy}
                            onClick={() => setFeatureMode(feature.id, 'admin_only')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              currentMode === 'admin_only'
                                ? 'bg-[#14a6d9] text-white shadow-[0_0_12px_rgba(20,166,217,0.35)]'
                                : 'text-slate-400 hover:text-white'
                            }`}
                            title="Active only for administrator accounts"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Admin Only</span>
                          </button>

                          {/* Option 3: Disabled */}
                          <button
                            disabled={busy}
                            onClick={() => setFeatureMode(feature.id, 'disabled')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              currentMode === 'disabled'
                                ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                                : 'text-slate-400 hover:text-white'
                            }`}
                            title="Deactivated completely"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Disabled</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
