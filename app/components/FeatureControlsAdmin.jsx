"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Shield, Eye, EyeOff, Save, RotateCcw, Search, CheckCircle2, 
  AlertTriangle, Filter, Sparkles, Tv, Layers, Wrench, Activity, 
  Brain, BarChart2, Globe, Lock, Ban, ExternalLink, Users,
  ChevronDown, Check, X, Plus, UserCheck
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { DASHBOARD_FEATURES, DEFAULT_FEATURE_CONFIG, isFeatureEnabled } from '../../lib/dashboardFeatures.mjs';
import { isRootSuperAdmin } from '../../lib/authConstants.mjs';
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

function CustomUserDropdown({ featureId, allUsers = [], selectedEmails = [], onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const combinedUserOptions = useMemo(() => {
    const map = new Map();
    allUsers.forEach(u => {
      const email = (u.email || '').trim().toLowerCase();
      if (email && u.role !== 'super_admin' && !isRootSuperAdmin(email)) {
        map.set(email, { email, role: u.role || 'standard' });
      }
    });
    selectedEmails.forEach(email => {
      const lower = (email || '').trim().toLowerCase();
      if (lower && !map.has(lower) && !isRootSuperAdmin(lower)) {
        map.set(lower, { email: lower, role: 'custom' });
      }
    });
    return Array.from(map.values());
  }, [allUsers, selectedEmails]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return combinedUserOptions;
    return combinedUserOptions.filter(u => u.email.includes(q) || u.role.includes(q));
  }, [combinedUserOptions, search]);

  const toggleUser = (email) => {
    const lower = email.trim().toLowerCase();
    let next;
    if (selectedEmails.includes(lower)) {
      next = selectedEmails.filter(e => e !== lower);
    } else {
      next = [...selectedEmails, lower];
    }
    onChange(next);
  };

  const selectAll = () => {
    const allEmails = combinedUserOptions.map(u => u.email);
    onChange(allEmails);
  };

  const clearAll = () => {
    onChange([]);
  };

  const addCustomEmail = (email) => {
    const lower = email.trim().toLowerCase();
    if (!lower || selectedEmails.includes(lower) || isRootSuperAdmin(lower)) return;
    onChange([...selectedEmails, lower]);
    setSearch('');
  };

  const canAddCustom = search.trim() && !isRootSuperAdmin(search.trim().toLowerCase()) && !combinedUserOptions.some(u => u.email === search.trim().toLowerCase());

  return (
    <div ref={wrapperRef} className="relative z-30">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#041628] border border-amber-500/40 text-xs font-semibold text-slate-200 hover:text-white hover:border-amber-400 transition-all shadow-sm min-w-[210px]"
      >
        <div className="flex items-center gap-1.5 truncate">
          <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate font-mono text-[11px]">
            {selectedEmails.length === 0
              ? 'Super Admin (Fixed) + 0 Users'
              : selectedEmails.length === 1
                ? `Super Admin + 1 User`
                : `Super Admin + ${selectedEmails.length} Users`}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-88 p-3 rounded-2xl bg-[#0a2442] border border-amber-500/40 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Assign Custom Users</span>
            <div className="flex items-center gap-2 text-[10px]">
              <button 
                type="button" 
                onClick={selectAll}
                className="text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Select All
              </button>
              <span className="text-white/20">|</span>
              <button 
                type="button" 
                onClick={clearAll}
                className="text-slate-400 hover:text-rose-400 font-semibold"
              >
                Clear
              </button>
            </div>
          </div>

          {/* PINNED SUPER ADMIN ROW - FIXED AND PERMANENT */}
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs bg-purple-500/15 border border-purple-500/30 text-purple-200 select-none mb-2">
            <div className="flex items-center gap-2 truncate">
              <div className="w-3.5 h-3.5 rounded flex items-center justify-center bg-purple-600 border border-purple-400 text-white shrink-0">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <div className="flex items-center gap-1.5 truncate">
                <Shield className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="truncate font-mono text-[11px] font-semibold text-white">Super Admin (All Controls)</span>
              </div>
            </div>
            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-purple-500/30 text-purple-300 shrink-0 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              <span>Fixed</span>
            </span>
          </div>

          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search or enter email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) {
                  e.preventDefault();
                  addCustomEmail(search.trim());
                }
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#041628] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60"
            />
          </div>

          {canAddCustom && (
            <button
              type="button"
              onClick={() => addCustomEmail(search.trim())}
              className="w-full mb-2 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add "{search.trim()}"</span>
            </button>
          )}

          <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar pr-1">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-3 text-xs text-slate-400">
                No other matching users found.
              </div>
            ) : (
              filteredUsers.map(user => {
                const isSelected = selectedEmails.includes(user.email);
                return (
                  <button
                    key={user.email}
                    type="button"
                    onClick={() => toggleUser(user.email)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left ${
                      isSelected
                        ? 'bg-amber-500/20 text-white font-semibold'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${
                        isSelected
                          ? 'bg-amber-500 border-amber-400 text-black'
                          : 'border-white/20 bg-black/20'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <span className="truncate font-mono text-[11px]">{user.email}</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-white/10 text-slate-400 shrink-0">
                      {user.role}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeatureControlsAdmin({ 
  currentUserEmail = 'admin@tahaluf.com', 
  userRole = 'super_admin', 
  featureConfig = null,
  isFeatureAllowed = null,
  onSaved, 
  onNavigate 
}) {
  const isSuperAdmin = userRole === 'super_admin' || (userRole !== 'admin' && userRole !== 'standard' && userRole !== 'non-finance' && isRootSuperAdmin(currentUserEmail));
  const hasFeaturePermission = typeof isFeatureAllowed === 'function'
    ? isFeatureAllowed('adminFeatures')
    : isSuperAdmin;
  const canAccess = isSuperAdmin || hasFeaturePermission;

  if (!canAccess) {
    return (
      <div className="card-surface p-8 rounded-3xl border border-amber-500/30 bg-[#0a2442]/80 text-center max-w-xl mx-auto my-12 shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Access Restricted</h3>
        <p className="text-xs text-slate-300 mb-6 leading-relaxed">
          Feature Controls is restricted by system policy. You do not have permission to view or modify feature controls.
        </p>
        <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-black/40 text-slate-400 border border-white/10">
          Current Role: {userRole}
        </span>
      </div>
    );
  }
  const [config, setConfig] = useState(null);
  const [modes, setModes] = useState(DEFAULT_FEATURE_CONFIG.modes);
  const [customUsers, setCustomUsers] = useState(DEFAULT_FEATURE_CONFIG.customUsers || {});
  const [availableUsers, setAvailableUsers] = useState([]);
  const [previewRole, setPreviewRole] = useState('standard');
  const [previewUserEmail, setPreviewUserEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadUsers = async () => {
    try {
      const token = await auth.currentUser?.getIdToken(true).catch(() => null);
      const email = currentUserEmail || auth.currentUser?.email || (typeof window !== 'undefined' ? localStorage.getItem('tahaluf_cached_email') : '') || 'admin@tahaluf.com';
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-admin-email': email,
        'x-admin-role': 'super_admin'
      };
      const res = await fetch('/api/admin/users', { headers });
      const data = await res.json();
      if (data && Array.isArray(data.users)) {
        setAvailableUsers(data.users);
      }
    } catch (err) {
      console.warn('[FeatureControls] Could not fetch users:', err);
    }
  };

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/features', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not load feature controls.');
      setConfig(json.config);
      
      let effectiveModes = { ...DEFAULT_FEATURE_CONFIG.modes, ...json.config.modes };
      let effectiveCustomUsers = { ...(json.config.customUsers || {}) };
      try {
        const savedDraft = localStorage.getItem('tahaluf_feature_modes_draft');
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed && typeof parsed === 'object') {
            effectiveModes = { ...effectiveModes, ...parsed };
          }
        }
        const savedUsersDraft = localStorage.getItem('tahaluf_feature_custom_users_draft');
        if (savedUsersDraft) {
          const parsedUsers = JSON.parse(savedUsersDraft);
          if (parsedUsers && typeof parsedUsers === 'object') {
            effectiveCustomUsers = { ...effectiveCustomUsers, ...parsedUsers };
          }
        }
      } catch {}

      setModes(effectiveModes);
      setCustomUsers(effectiveCustomUsers);
      setNotice('');
      loadUsers();
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

  const setCustomUsersForFeature = (featureId, userEmails) => {
    setCustomUsers(prev => {
      const updated = { ...prev, [featureId]: userEmails };
      try {
        localStorage.setItem('tahaluf_feature_custom_users_draft', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setNotice('');
  };

  const removeCustomUser = (featureId, emailToRemove) => {
    const current = customUsers[featureId] || [];
    const next = current.filter(e => e !== emailToRemove);
    setCustomUsersForFeature(featureId, next);
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem('tahaluf_feature_modes_draft');
      localStorage.removeItem('tahaluf_feature_custom_users_draft');
    } catch {}
    if (config) {
      setModes({ ...DEFAULT_FEATURE_CONFIG.modes, ...config.modes });
      setCustomUsers({ ...(config.customUsers || {}) });
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
      const role = (isSuperAdmin ? 'super_admin' : userRole) || (typeof window !== 'undefined' ? localStorage.getItem('tahaluf_cached_role') : '') || 'super_admin';
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-admin-email': email,
        'x-admin-role': role
      };
      const response = await fetch('/api/admin/features', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ 
          modes, 
          customUsers,
          revision: config?.revision ?? 0 
        })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not save feature controls.');
      setConfig(json.config);
      setModes(json.config.modes);
      setCustomUsers(json.config.customUsers || {});
      try {
        localStorage.removeItem('tahaluf_feature_modes_draft');
        localStorage.removeItem('tahaluf_feature_custom_users_draft');
        localStorage.setItem('tahaluf_cached_features', JSON.stringify(json.config));
      } catch {}
      onSaved?.(json.config);
      setNotice('Feature controls saved and published live. All user sessions reflect these settings.');
    } catch (err) {
      setError(err.message || 'Failed to save feature controls.');
    } finally {
      setBusy(false);
    }
  };

  const dirty = Boolean(config && (
    JSON.stringify(modes) !== JSON.stringify({ ...DEFAULT_FEATURE_CONFIG.modes, ...config.modes }) ||
    JSON.stringify(customUsers) !== JSON.stringify(config.customUsers || {})
  ));

  useAdminDirtyGuard('features', Boolean(dirty));
  const changedFeatures = config ? DASHBOARD_FEATURES.filter(feature => {
    const origMode = ({ ...DEFAULT_FEATURE_CONFIG.modes, ...config.modes })[feature.id];
    const currMode = modes[feature.id];
    const origUsers = JSON.stringify((config.customUsers || {})[feature.id] || []);
    const currUsers = JSON.stringify(customUsers[feature.id] || []);
    return origMode !== currMode || origUsers !== currUsers;
  }) : [];

  // Summary Metrics
  const metrics = useMemo(() => {
    let publicCount = 0;
    let adminCount = 0;
    let superAdminCount = 0;
    let customUsersCount = 0;
    let disabledCount = 0;
    DASHBOARD_FEATURES.forEach(f => {
      const mode = modes[f.id] || f.defaultMode || 'public';
      if (mode === 'public') publicCount++;
      else if (mode === 'admin_only') adminCount++;
      else if (mode === 'super_admin_only') superAdminCount++;
      else if (mode === 'custom_users') customUsersCount++;
      else if (mode === 'disabled') disabledCount++;
    });
    return {
      total: DASHBOARD_FEATURES.length,
      publicCount,
      adminCount,
      superAdminCount,
      customUsersCount,
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

  const toggleGroupCollapse = (group) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const collapseAll = () => {
    const next = {};
    groups.forEach(g => { if (g !== 'All') next[g] = true; });
    setCollapsedGroups(next);
  };

  const expandAll = () => {
    setCollapsedGroups({});
  };

  const getGroupStatusBreakdown = (groupFeatures) => {
    let pub = 0, adm = 0, superAdm = 0, cust = 0, dis = 0;
    groupFeatures.forEach(f => {
      const m = modes[f.id] || f.defaultMode || 'public';
      if (m === 'public') pub++;
      else if (m === 'admin_only') adm++;
      else if (m === 'super_admin_only') superAdm++;
      else if (m === 'custom_users') cust++;
      else if (m === 'disabled') dis++;
    });
    return { pub, adm, superAdm, cust, dis };
  };

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
            Dynamically configure access tiers, role visibility, custom user permissions, and feature availability.
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

      {/* KPI METRIC TILES (INTERACTIVE QUICK FILTERS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setSelectedStatusFilter('All')}
          className={`card-surface p-4 rounded-2xl border text-left transition-all cursor-pointer hover:border-[#cedc28]/60 ${
            selectedStatusFilter === 'All'
              ? 'border-[#cedc28] bg-[#0a2442] shadow-[0_0_15px_rgba(206,220,40,0.15)] ring-1 ring-[#cedc28]/50'
              : 'border-white/10 bg-[#0a2442]/60 hover:bg-[#0a2442]/90'
          }`}
          title="Show all features regardless of visibility status"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total</span>
            <Layers className="w-4 h-4 text-[#14a6d9]" />
          </div>
          <div className="text-2xl font-extrabold text-white">{metrics.total}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Permission modules</p>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatusFilter(prev => prev === 'public' ? 'All' : 'public')}
          className={`card-surface p-4 rounded-2xl border text-left transition-all cursor-pointer hover:border-emerald-500/60 ${
            selectedStatusFilter === 'public'
              ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_15px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/50'
              : 'border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10'
          }`}
          title="Filter by Public (Everyone) status"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Public</span>
            <Globe className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-300">{metrics.publicCount}</div>
          <p className="text-[10px] text-emerald-400/80 mt-0.5">Visible to all visitors</p>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatusFilter(prev => prev === 'admin_only' ? 'All' : 'admin_only')}
          className={`card-surface p-4 rounded-2xl border text-left transition-all cursor-pointer hover:border-cyan-500/60 ${
            selectedStatusFilter === 'admin_only'
              ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_15px_rgba(20,166,217,0.2)] ring-1 ring-cyan-400/50'
              : 'border-cyan-500/25 bg-cyan-500/5 hover:bg-cyan-500/10'
          }`}
          title="Filter by Admin Only status"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">Admin Only</span>
            <Lock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-extrabold text-cyan-300">{metrics.adminCount}</div>
          <p className="text-[10px] text-cyan-400/80 mt-0.5">Admin & Super Admin</p>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatusFilter(prev => prev === 'super_admin_only' ? 'All' : 'super_admin_only')}
          className={`card-surface p-4 rounded-2xl border text-left transition-all cursor-pointer hover:border-purple-500/60 ${
            selectedStatusFilter === 'super_admin_only'
              ? 'border-purple-400 bg-purple-500/15 shadow-[0_0_15px_rgba(168,85,247,0.2)] ring-1 ring-purple-400/50'
              : 'border-purple-500/25 bg-purple-500/5 hover:bg-purple-500/10'
          }`}
          title="Filter by Super Admin Only status"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Super Admin</span>
            <Shield className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-purple-300">{metrics.superAdminCount}</div>
          <p className="text-[10px] text-purple-400/80 mt-0.5">Exclusive to Super Admin</p>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatusFilter(prev => prev === 'custom_users' ? 'All' : 'custom_users')}
          className={`card-surface p-4 rounded-2xl border text-left transition-all cursor-pointer hover:border-amber-500/60 ${
            selectedStatusFilter === 'custom_users'
              ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_15px_rgba(245,158,11,0.2)] ring-1 ring-amber-400/50'
              : 'border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10'
          }`}
          title="Filter by Custom Users status"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Custom Users</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-300">{metrics.customUsersCount}</div>
          <p className="text-[10px] text-amber-400/80 mt-0.5">Selected user accounts</p>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatusFilter(prev => prev === 'disabled' ? 'All' : 'disabled')}
          className={`card-surface p-4 rounded-2xl border text-left transition-all cursor-pointer hover:border-rose-500/60 ${
            selectedStatusFilter === 'disabled'
              ? 'border-rose-400 bg-rose-500/15 shadow-[0_0_15px_rgba(244,63,94,0.2)] ring-1 ring-rose-400/50'
              : 'border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10'
          }`}
          title="Filter by Disabled status"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Disabled</span>
            <Ban className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-300">{metrics.disabledCount}</div>
          <p className="text-[10px] text-rose-400/80 mt-0.5">Deactivated for all</p>
        </button>
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

          <div className="flex flex-wrap items-center gap-2 bg-[#041628] p-1 rounded-xl border border-white/10">
            <button
              onClick={() => { setPreviewRole('standard'); setPreviewUserEmail(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                previewRole === 'standard' && !previewUserEmail
                  ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Standard Viewer</span>
            </button>
            <button
              onClick={() => { setPreviewRole('admin'); setPreviewUserEmail(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                previewRole === 'admin'
                  ? 'bg-[#14a6d9] text-white shadow-[0_0_12px_rgba(20,166,217,0.35)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Administrator</span>
            </button>
            <button
              onClick={() => { setPreviewRole('super_admin'); setPreviewUserEmail(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                previewRole === 'super_admin'
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.35)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Super Admin</span>
            </button>
            <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              <input
                type="text"
                placeholder="Test user email..."
                value={previewUserEmail}
                onChange={(e) => {
                  setPreviewUserEmail(e.target.value);
                  setPreviewRole('standard');
                }}
                className="w-40 px-2 py-1 rounded bg-[#0a2442] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Live Persona Simulation Pills */}
        <div className="bg-[#041628]/80 rounded-xl p-3 border border-white/5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Active navigation &amp; tools visible to <span className="text-white font-extrabold">
              {previewUserEmail ? `Custom User (${previewUserEmail})` : previewRole === 'super_admin' ? 'Super Administrators' : previewRole === 'admin' ? 'Administrators' : 'Regular Users / Viewers'}
            </span>:
          </div>
          <div className="flex flex-wrap gap-2">
            {DASHBOARD_FEATURES.map(feature => {
              const visible = isFeatureEnabled(
                { modes, customUsers }, 
                feature.id, 
                previewRole, 
                false, 
                previewUserEmail
              );
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
                  title={`${feature.name}: ${visible ? 'Visible' : 'Hidden'} in simulator. Click to jump.`}
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
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/40 transition-all font-medium"
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

      {/* CATEGORY TABS NAVIGATION */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 custom-scrollbar text-xs">
        {groups.map(g => {
          const Icon = g === 'All' ? Filter : (GROUP_ICONS[g] || Layers);
          const count = g === 'All' 
            ? DASHBOARD_FEATURES.length 
            : DASHBOARD_FEATURES.filter(f => f.group === g).length;
          const isSelected = selectedGroup === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedGroup(g)}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                isSelected
                  ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_15px_rgba(206,220,40,0.3)] ring-1 ring-[#cedc28]'
                  : 'bg-[#0a2442]/80 border border-white/10 text-slate-300 hover:text-white hover:border-[#cedc28]/40 hover:bg-[#0a2442]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#1a302e]' : 'text-[#14a6d9]'}`} />
              <span>{g === 'All' ? 'All Modules' : g}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                isSelected ? 'bg-black/20 text-[#1a302e]' : 'bg-white/10 text-slate-400'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* SEARCH, FILTERS & ACCORDION CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0a2442]/50 p-3 rounded-2xl border border-white/10">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search features by name, target or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#041628] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#cedc28]/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Accordion Toggles */}
          <div className="flex items-center gap-1 bg-[#041628] p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={expandAll}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition"
              title="Expand all categories"
            >
              Expand All
            </button>
            <span className="text-slate-600">|</span>
            <button
              type="button"
              onClick={collapseAll}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition"
              title="Collapse all categories"
            >
              Collapse All
            </button>
          </div>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#041628] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-[#cedc28]/50 cursor-pointer font-medium"
          >
            <option value="All">All Visibility Modes</option>
            <option value="public">Everyone (Public)</option>
            <option value="admin_only">Admin Only</option>
            <option value="super_admin_only">Super Admin Only</option>
            <option value="custom_users">Custom Users</option>
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

      {/* EMPTY SEARCH RESULT STATE */}
      {filteredFeatures.length === 0 && (
        <div className="card-surface p-12 rounded-3xl border border-white/10 text-center bg-[#0a2442]/40 backdrop-blur-md">
          <Search className="w-10 h-10 text-slate-500 mx-auto mb-3 opacity-60" />
          <h4 className="text-white font-bold text-base mb-1">No feature controls found</h4>
          <p className="text-xs text-slate-400 mb-5 max-w-md mx-auto">
            No features matched your search &quot;{searchQuery}&quot; and active filters ({selectedGroup} · {selectedStatusFilter}).
          </p>
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setSelectedGroup('All'); setSelectedStatusFilter('All'); }}
            className="px-4 py-2 rounded-xl bg-[#cedc28] text-[#1a302e] text-xs font-bold hover:brightness-110 transition shadow-lg"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* FEATURE CARDS LIST BY GROUP */}
      <div className="space-y-4">
        {[...new Set(filteredFeatures.map(f => f.group))].map(group => {
          const GroupIcon = GROUP_ICONS[group] || Layers;
          const featuresInGroup = filteredFeatures.filter(f => f.group === group);
          const isCollapsed = Boolean(collapsedGroups[group]) && !searchQuery.trim();
          const statusBreakdown = getGroupStatusBreakdown(featuresInGroup);
          
          return (
            <div key={group} className="card-surface rounded-2xl border border-white/10 bg-[#0a2442]/60 overflow-hidden shadow-lg transition-all">
              <div 
                onClick={() => toggleGroupCollapse(group)}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-white/[0.03] border-b border-white/5 cursor-pointer hover:bg-white/[0.06] select-none transition-colors"
                title={isCollapsed ? `Click to expand ${group}` : `Click to collapse ${group}`}
              >
                <div className="flex items-center gap-2.5">
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90 text-slate-500' : 'rotate-0 text-[#cedc28]'}`} />
                  <GroupIcon className="w-4 h-4 text-[#cedc28]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">{group}</h3>
                  <span className="text-[10px] text-slate-400 font-mono">({featuresInGroup.length})</span>
                </div>

                {/* Status Breakdown Pills in Group Header */}
                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                  {statusBreakdown.pub > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>{statusBreakdown.pub} Public</span>
                    </span>
                  )}
                  {statusBreakdown.adm > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      <span>{statusBreakdown.adm} Admin</span>
                    </span>
                  )}
                  {statusBreakdown.superAdm > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                      <span>{statusBreakdown.superAdm} Super Admin</span>
                    </span>
                  )}
                  {statusBreakdown.cust > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      <span>{statusBreakdown.cust} Custom</span>
                    </span>
                  )}
                  {statusBreakdown.dis > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                      <span>{statusBreakdown.dis} Disabled</span>
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 font-mono ml-1 hidden sm:inline">
                    {isCollapsed ? 'Click to expand' : 'Click to collapse'}
                  </span>
                </div>
              </div>

              {!isCollapsed && (
              <div className="divide-y divide-white/5 animate-in fade-in duration-150">
                {featuresInGroup.map(feature => {
                  const currentMode = modes[feature.id] || feature.defaultMode || 'public';
                  const isVisibleInPreview = isFeatureEnabled(
                    { modes, customUsers }, 
                    feature.id, 
                    previewRole, 
                    false, 
                    previewUserEmail
                  );
                  const assignedUsers = customUsers[feature.id] || [];

                  return (
                    <div key={feature.id} className="p-4 sm:p-5 hover:bg-white/[0.02] transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-bold text-white">{feature.name}</span>
                            <span 
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center gap-1 select-none"
                              title="Super Admin has permanent, fixed access to this control with no option to change it."
                            >
                              <Shield className="w-2.5 h-2.5 text-purple-400" />
                              <span>Super Admin: Fixed</span>
                            </span>
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
                        <div className="flex items-center gap-3 shrink-0 flex-wrap">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            isVisibleInPreview ? 'text-emerald-300 bg-emerald-500/10' : 'text-slate-500 bg-white/5'
                          }`}>
                            {isVisibleInPreview ? 'Visible in Simulator' : 'Hidden in Simulator'}
                          </span>

                          <div className="flex flex-wrap items-center bg-[#041628] p-1 rounded-xl border border-white/10 shadow-inner gap-1">
                            {/* Option 1: Everyone */}
                            {!feature.adminOnly && (
                              <button
                                disabled={busy}
                                onClick={() => setFeatureMode(feature.id, 'public')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
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
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                currentMode === 'admin_only'
                                  ? 'bg-[#14a6d9] text-white shadow-[0_0_12px_rgba(20,166,217,0.35)]'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                              title="Active for Admins & Super Admins"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Admin Only</span>
                            </button>

                            {/* Option 3: Super Admin Only */}
                            <button
                              disabled={busy}
                              onClick={() => setFeatureMode(feature.id, 'super_admin_only')}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                currentMode === 'super_admin_only'
                                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.35)]'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                              title="Restricted strictly to Super Administrators"
                            >
                              <Shield className="w-3 h-3" />
                              <span>Super Admin Only</span>
                            </button>

                            {/* Option 4: Custom Users */}
                            <button
                              disabled={busy}
                              onClick={() => setFeatureMode(feature.id, 'custom_users')}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                currentMode === 'custom_users'
                                  ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.35)]'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                              title="Select specific users who can access this feature"
                            >
                              <Users className="w-3 h-3" />
                              <span>Custom Users</span>
                              {assignedUsers.length > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[9.5px] text-amber-200 font-extrabold">
                                  {assignedUsers.length}
                                </span>
                              )}
                            </button>

                            {/* Option 5: Disabled */}
                            <button
                              disabled={busy}
                              onClick={() => setFeatureMode(feature.id, 'disabled')}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                currentMode === 'disabled'
                                  ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                              title="Deactivated completely for all users"
                            >
                              <Ban className="w-3 h-3" />
                              <span>Disabled</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* CUSTOM USERS SELECTOR & USER PILLS (Visible when Custom Users mode is chosen) */}
                      {currentMode === 'custom_users' && (
                        <div className="mt-4 pt-3 border-t border-amber-500/20 bg-amber-500/5 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 p-4 rounded-b-2xl animate-in fade-in duration-200">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                                <Users className="w-3.5 h-3.5" />
                                <span>Custom User Access: {feature.name}</span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Super Admin is permanently fixed with access. Select additional accounts below to grant access.
                              </p>
                            </div>

                            <CustomUserDropdown
                              featureId={feature.id}
                              allUsers={availableUsers}
                              selectedEmails={assignedUsers}
                              onChange={(newEmails) => setCustomUsersForFeature(feature.id, newEmails)}
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 mt-3">
                            {/* FIXED SUPER ADMIN USER PILL - Always has access, cannot be removed */}
                            <span 
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-purple-500/20 border border-purple-500/40 text-purple-200 font-mono shadow-sm select-none"
                              title="Super Admin has permanent, fixed access to all controls with no option to change it."
                            >
                              <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                              <span className="font-semibold text-white">Super Admin</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/40 text-purple-300 font-bold uppercase tracking-wider">Fixed User</span>
                              <Lock className="w-3 h-3 text-purple-300/80 ml-0.5" />
                            </span>

                            {/* REST OF THE CUSTOM USERS - Can be changed, removed, or added */}
                            {assignedUsers.map(email => (
                              <span 
                                key={email}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-[#041628] border border-amber-500/30 text-amber-200 font-mono shadow-sm"
                              >
                                <span>{email}</span>
                                <button
                                  type="button"
                                  onClick={() => removeCustomUser(feature.id, email)}
                                  className="text-slate-400 hover:text-rose-400 transition-colors p-0.5 cursor-pointer"
                                  title={`Remove ${email}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}

                            {assignedUsers.length === 0 && (
                              <span className="text-xs text-amber-400/80 italic flex items-center gap-1.5 ml-1">
                                <span>(No extra custom users assigned. Open dropdown above to add users.)</span>
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
