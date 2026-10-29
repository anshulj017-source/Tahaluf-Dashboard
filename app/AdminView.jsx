"use client";
import React, { useState, useEffect } from 'react';
import { Trash2, UserPlus, Shield, User, RefreshCw, CheckCircle2, Key, Layers, Activity, Users as UsersIcon, BarChart3, Gauge, ChevronDown, LogOut, ArrowLeft } from 'lucide-react';
import EventsAdmin from './components/EventsAdmin';
import DataHealthAdmin from './components/DataHealthAdmin';
import AnalyticsAdmin from './components/AnalyticsAdmin';
import ApiQuotasAdmin from './components/ApiQuotasAdmin';
import FeatureControlsAdmin from './components/FeatureControlsAdmin';
import { AdminDialog, useAdminView, useAdminDirtyGuard } from './components/AdminUI';

const ALL_ADMIN_SECTIONS = [
  { id: 'events', featureId: 'adminEvents', label: 'Events & Data', icon: Layers },
  { id: 'health', featureId: 'adminHealth', label: 'Health Monitor', icon: Activity },
  { id: 'quotas', featureId: 'adminQuotas', label: 'API & Quotas', icon: Gauge },
  { id: 'analytics', featureId: 'adminAnalytics', label: 'Analytics & Activity', icon: BarChart3 },
  { id: 'features', label: 'Feature Controls', icon: Shield, superAdminOnly: true },
  { id: 'users', label: 'User Access', icon: UsersIcon, superAdminOnly: true },
];

const sections = ALL_ADMIN_SECTIONS;

export default function AdminView({ 
  active = true, 
  currentUserEmail = 'admin@tahaluf.com', 
  userRole = 'super_admin',
  featureConfig = null,
  isFeatureAllowed = null,
  initialEvents = [], 
  onFeaturesSaved, 
  onEventsSaved, 
  onNavigate,
  onSignOut
}) {
  const isSuperAdmin = userRole === 'super_admin';

  // Filter sections dynamically based on role and feature controls
  const visibleSections = ALL_ADMIN_SECTIONS.filter(section => {
    // Feature Controls and User Access are restricted strictly to SUPER ADMIN
    if (section.superAdminOnly && !isSuperAdmin) {
      return false;
    }
    // Other admin features obey feature control configuration
    if (section.featureId) {
      if (typeof isFeatureAllowed === 'function') {
        return isFeatureAllowed(section.featureId);
      }
      if (featureConfig?.modes?.[section.featureId] === 'disabled') {
        return false;
      }
    }
    return true;
  });

  const [activeSection, setActiveSection] = useAdminView('admin', isSuperAdmin ? 'users' : 'events', ALL_ADMIN_SECTIONS.map(section => section.id));

  // If active section is hidden by feature controls or super admin check, fallback safely
  useEffect(() => {
    if (visibleSections && visibleSections.length > 0 && !visibleSections.some(s => s.id === activeSection)) {
      setActiveSection(visibleSections[0].id);
    }
  }, [visibleSections, activeSection, setActiveSection]);
  const [visited, setVisited] = useState({ events: true });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dirtyScopes, setDirtyScopes] = useState({});
  const [acknowledgedDraftSections, setAcknowledgedDraftSections] = useState(new Set());
  const [pendingSection, setPendingSection] = useState(null);
  const [userAction, setUserAction] = useState(null);
  const [actionPassword, setActionPassword] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [healthIssueCount, setHealthIssueCount] = useState(0);
  const [dashboardAlertsEnabled, setDashboardAlertsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // New user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('standard');
  const [addingUser, setAddingUser] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  useAdminDirtyGuard('new-user', showAddForm && Boolean(newEmail || newPassword || newRole !== 'standard'));
  useEffect(() => {
    const updateDirty = event => {
      setDirtyScopes(current => ({ ...current, [event.detail.scope]: event.detail.dirty }));
      // If marked clean again, remove from acknowledged set
      if (!event.detail.dirty) {
        setAcknowledgedDraftSections(prev => {
          const next = new Set(prev);
          next.delete(event.detail.scope);
          return next;
        });
      }
    };
    window.addEventListener('admin-dirty', updateDirty);
    return () => window.removeEventListener('admin-dirty', updateDirty);
  }, []);
  useEffect(() => { setVisited(current => ({ ...current, [activeSection]: true })); }, [activeSection]);
  const navigate = section => {
    // Only prompt when navigating AWAY from the section that currently has unacknowledged dirty changes
    if (section !== activeSection && dirtyScopes[activeSection] && !acknowledgedDraftSections.has(activeSection)) {
      setPendingSection(section);
    } else {
      setActiveSection(section);
    }
  };

  const [sortConfig, setSortConfig] = useState({ key: 'lastactive', direction: 'desc' });

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getAdminHeaders = () => ({
    'Content-Type': 'application/json',
    'x-admin-email': currentUserEmail || (typeof window !== 'undefined' ? localStorage.getItem('tahaluf_cached_email') : '') || 'admin@tahaluf.com',
    'x-admin-role': userRole || (typeof window !== 'undefined' ? localStorage.getItem('tahaluf_cached_role') : '') || 'super_admin'
  });

  const fetchUsers = async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        headers: getAdminHeaders()
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch users');
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not load users. Make sure you are an admin and the server is running.');
    } finally {
      setLoading(false);
    }
  };

  // Only fetch users on demand when switching to the users section and if user is super admin
  useEffect(() => {
    if (activeSection === 'users' && users.length === 0 && isSuperAdmin) {
      fetchUsers();
    }
  }, [activeSection, isSuperAdmin]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    setAddingUser(true);
    setError(null);
    setAddSuccess(false);
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      
      setAddSuccess(true);
      setNewEmail('');
      setNewPassword('');
      setNewRole('standard');
      setShowAddForm(false);
      fetchUsers(); // Refresh the list
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (uid) => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: getAdminHeaders(),
        body: JSON.stringify({ uid })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }
      
      fetchUsers(); // Refresh the list
    } catch (err) {
      console.error(err);
      throw new Error('Error deleting user: ' + err.message);
    }
  };

  const updateUserRole = async (uid, newRole) => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ uid, role: newRole })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update user');
      }
      
      // Optimistically update the UI
      setUsers(current => current.map(u => u.uid === uid ? { ...u, role: newRole } : u));
      setNotice('User role updated.');
    } catch (err) {
      console.error(err);
      throw new Error('Error updating user role: ' + err.message);
    }
  };

  const handleChangePassword = async (uid, email, password) => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ uid, password })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update password');
      }
      
      setNotice(`Password successfully updated for ${email}.`);
    } catch (err) {
      console.error(err);
      throw new Error('Error updating user password: ' + err.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never logged in';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).format(date);
  };
  const filteredUsers = users.filter(user => `${user.email} ${user.role}`.toLowerCase().includes(userSearch.toLowerCase()));
  const visibleUserPage = Math.min(userPage, Math.max(1, Math.ceil(filteredUsers.length / 20)));

  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#061726] text-white min-h-[60vh]">
        <Shield className="w-16 h-16 text-rose-400 mb-4 opacity-80" />
        <h2 className="text-xl font-bold mb-2 text-white">Access Restricted</h2>
        <p className="text-sm text-gray-400 max-w-md mb-6">
          You do not have administrative privileges to access the Admin Center.
        </p>
        <button
          onClick={() => (onNavigate ? onNavigate('summary') : (window.location.href = '/'))}
          className="px-4 py-2 bg-[#cedc28] text-[#1a302e] font-bold text-xs uppercase tracking-wider rounded-lg hover:brightness-110 shadow-lg"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="admin-workspace flex-1 p-4 md:p-6 overflow-auto pb-32">
      <div className="max-w-[1500px] mx-auto lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-6">
        <aside className="mb-5 lg:mb-0">
          <nav aria-label="Admin sections" className="relative">
            {/* 1. SMALL MOBILE SCREENS (< sm / < 640px): POLISHED CUSTOM DROPDOWN */}
            <div className="block sm:hidden">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Admin Section</span>
                <span className="text-[10px] text-[#cedc28] font-mono">
                  {visibleSections.findIndex(s => s.id === activeSection) + 1} of {visibleSections.length}
                </span>
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(prev => !prev)}
                  aria-expanded={mobileMenuOpen}
                  aria-label="Admin section selection"
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-[#0a2442] border border-[#cedc28]/40 hover:border-[#cedc28] text-white shadow-lg transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-[#cedc28]/20 flex items-center justify-center shrink-0">
                      {React.createElement(visibleSections.find(s => s.id === activeSection)?.icon || Layers, {
                        className: "h-3.5 w-3.5 text-[#cedc28]"
                      })}
                    </div>
                    <span className="font-bold text-xs truncate">
                      {visibleSections.find(s => s.id === activeSection)?.label || 'Select Section'}
                    </span>
                    {activeSection === 'health' && dashboardAlertsEnabled && healthIssueCount > 0 && (
                      <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        {healthIssueCount}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-[#cedc28] shrink-0 transition-transform duration-200 ${mobileMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {mobileMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs" 
                      onClick={() => setMobileMenuOpen(false)} 
                    />
                    <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl bg-[#0a2442] border border-[#cedc28]/40 p-2 shadow-2xl backdrop-blur-2xl flex flex-col gap-1 max-h-72 overflow-y-auto">
                      {visibleSections.map(({ id, label, icon: Icon }) => {
                        const isSelected = activeSection === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              navigate(id);
                              setMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-all ${
                              isSelected
                                ? 'bg-[#cedc28] text-[#041628] font-bold shadow-md shadow-[#cedc28]/20'
                                : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-[#041628]' : 'text-[#cedc28]'}`} />
                              <span className="truncate">{label}</span>
                            </div>
                            {id === 'health' && dashboardAlertsEnabled && healthIssueCount > 0 && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isSelected ? 'bg-red-700 text-white' : 'bg-red-600 text-white'
                              }`}>
                                {healthIssueCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 2. MEDIUM TABLET SCREENS (sm to lg: 640px - 1023px): TWO-LINE GRID (NO HORIZONTAL SCROLL) */}
            <div className="hidden sm:grid lg:hidden grid-cols-3 gap-2 pb-1 border-b border-white/10">
              {visibleSections.map(({ id, label, icon: Icon }) => (
                <button 
                  key={id} 
                  type="button" 
                  onClick={() => navigate(id)} 
                  aria-current={activeSection === id ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-all border ${
                    activeSection === id 
                      ? 'bg-[#cedc28] text-[#041628] border-[#cedc28] font-bold shadow-md shadow-[#cedc28]/20' 
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                  {id === 'health' && dashboardAlertsEnabled && healthIssueCount > 0 && (
                    <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                      {healthIssueCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* MOBILE & TABLET QUICK ACTIONS (< 1024px): BACK TO DASHBOARD & SIGN OUT */}
            <div className="flex lg:hidden items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/10">
              <button 
                type="button" 
                onClick={() => onNavigate ? onNavigate('summary') : (window.location.href = '/')}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all border border-white/10"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-[#cedc28] shrink-0" />
                <span>Back to Dashboard</span>
              </button>
              {onSignOut && (
                <button 
                  type="button" 
                  onClick={onSignOut}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>

            {/* 3. DESKTOP SCREENS (>= 1024px): VERTICAL SIDEBAR */}
            <div className="hidden lg:flex sticky top-0 flex-col gap-2">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Administration</p>
              {visibleSections.map(({ id, label, icon: Icon }) => (
                <button 
                  key={id} 
                  type="button" 
                  onClick={() => navigate(id)} 
                  aria-current={activeSection === id ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-3 text-left text-sm font-semibold transition-all ${
                    activeSection === id 
                      ? 'bg-[#cedc28] text-[#041628] font-bold shadow-md shadow-[#cedc28]/20' 
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                  {id === 'health' && dashboardAlertsEnabled && healthIssueCount > 0 && (
                    <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                      {healthIssueCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          <div className="hidden lg:flex mt-6 pt-4 border-t border-white/10 flex-col gap-2">
            <button 
              type="button" 
              onClick={() => onNavigate ? onNavigate('summary') : (window.location.href = '/')}
              className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all border border-white/10"
            >
              <ArrowLeft className="h-4 w-4 text-[#cedc28] shrink-0" />
              <span>Back to Dashboard</span>
            </button>
            {onSignOut && (
              <button 
                type="button" 
                onClick={onSignOut}
                className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </aside>
        <main className="min-w-0" aria-label="Admin content">
        {activeSection !== 'health' && dashboardAlertsEnabled && healthIssueCount > 0 && (
          <button
            onClick={() => navigate('health')}
            className="w-full mb-5 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-200 hover:bg-amber-500/15"
          >
            <span className="font-bold">{healthIssueCount} active data health issue{healthIssueCount === 1 ? '' : 's'}.</span>
            {' '}Open Health Monitor to review.
          </button>
        )}

        {/* SECTION 1: EVENTS & DATA CONFIGURATION */}
        <div hidden={activeSection !== 'events'}>
          <EventsAdmin currentUserEmail={currentUserEmail} initialEvents={initialEvents} onEventsSaved={onEventsSaved} />
        </div>

        <DataHealthAdmin
          active={active && activeSection === 'health'}
          currentUserEmail={currentUserEmail}
          userRole={userRole}
          onIssueCountChange={setHealthIssueCount}
          onDashboardAlertsEnabledChange={setDashboardAlertsEnabled}
        />

        {/* SECTION: API INFRASTRUCTURE & QUOTA HUB */}
        <ApiQuotasAdmin
          active={active && activeSection === 'quotas'}
          currentUserEmail={currentUserEmail}
          userRole={userRole}
        />
        {visited.features && (
          <div hidden={activeSection !== 'features'}>
            <FeatureControlsAdmin
              currentUserEmail={currentUserEmail}
              userRole={userRole}
              onSaved={onFeaturesSaved}
              onNavigate={(featureId) => {
                if (featureId === 'dimensionExport' || featureId === 'bulkDimensionImport') {
                  setActiveSection('health');
                } else if (onNavigate) {
                  onNavigate(featureId);
                }
              }}
            />
          </div>
        )}

        {/* SECTION 2: USER ACCESS MANAGEMENT */}
        {activeSection === 'users' && (
          !isSuperAdmin ? (
            <div className="card-surface p-8 rounded-3xl border border-amber-500/30 bg-[#0a2442]/80 text-center max-w-xl mx-auto my-12 shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Super Admin Access Required</h3>
              <p className="text-sm text-gray-400 mb-6">
                Viewing user lists and modifying user roles is restricted strictly to designated Super Administrators.
              </p>
              <button
                onClick={() => setActiveSection('events')}
                className="px-5 py-2.5 bg-[#cedc28] text-[#1a302e] font-bold text-xs uppercase tracking-wider rounded-xl hover:brightness-110 shadow-lg"
              >
                Go to Events & Data
              </button>
            </div>
          ) : (
          <div>
            <div className="flex flex-wrap gap-3 justify-between items-end mb-5">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">User Access</h2>
                <p className="text-[#14a6d9] text-sm font-medium">Control dashboard access and administrator privileges</p>
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={fetchUsers}
                  disabled={loading}
                  className="px-4 py-2 bg-[#0a2442] border border-[#cedc28]/30 text-[#cedc28] hover:bg-[#cedc28]/10 hover:text-white rounded-xl transition-all text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button 
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-4 py-2 bg-[#cedc28]/20 border border-[#cedc28]/50 text-[#cedc28] hover:bg-[#cedc28]/40 hover:text-white rounded-xl transition-all text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-[0_0_15px_rgba(200,130,20,0.15)]"
                >
                  <UserPlus className="w-4 h-4" />
                  {showAddForm ? 'Cancel' : 'Add User'}
                </button>
              </div>
            </div>

        {notice && <p role="status" className="mb-4 text-sm text-lime-300">{notice}</p>}
        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-2xl text-sm font-medium mb-6 flex items-center gap-3 shadow-lg">
            <Shield className="w-5 h-5 text-red-500" />
            {error}
          </div>
        )}

        {addSuccess && (
          <div className="bg-[#cedc28]/10 border border-[#cedc28]/30 text-[#cedc28] p-4 rounded-2xl text-sm font-medium mb-6 flex items-center gap-3 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-[#cedc28]" />
            User successfully created and granted access.
          </div>
        )}

        {showAddForm && (
          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-2xl mb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 opacity-5 pointer-events-none" style={{ backgroundImage: "url('/loc-pattern.png')", backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'top right' }}></div>
            
            <h3 className="text-[#14a6d9] font-bold uppercase tracking-widest text-sm mb-4">Create New User</h3>
            
            <form onSubmit={handleAddUser} className="relative z-10 flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="new-user-email" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Email Address</label>
                <input 
                  id="new-user-email"
                  type="email" 
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-[#0a2442] border border-gray-600/50 rounded-xl px-4 py-2.5 text-sm text-[#eef7f5] focus:outline-none focus:border-[#cedc28]/50 transition-all"
                  placeholder="name@example.com"
                  required 
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="new-user-password" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Temporary Password</label>
                <input 
                  id="new-user-password"
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#0a2442] border border-gray-600/50 rounded-xl px-4 py-2.5 text-sm text-[#eef7f5] focus:outline-none focus:border-[#cedc28]/50 transition-all"
                  placeholder="Min 6 characters"
                  required 
                  minLength={6}
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label htmlFor="new-user-role" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">User Role</label>
                <select 
                  id="new-user-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-[#0a2442] border border-gray-600/50 rounded-xl px-4 py-2.5 text-sm text-[#eef7f5] font-bold focus:outline-none focus:border-[#cedc28]/50 transition-all cursor-pointer appearance-none"
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="standard">Standard</option>
                  <option value="non-finance">Non-Finance</option>
                </select>
              </div>
              
              <button 
                type="submit" 
                disabled={addingUser}
                className="px-6 py-2.5 bg-[#cedc28]/20 hover:bg-[#cedc28]/40 border border-[#cedc28]/50 text-[#cedc28] hover:text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {addingUser ? 'Creating...' : 'Create'}
              </button>
            </form>
          </div>
        )}

        <label className="mb-4 block text-sm text-slate-300">Search users
          <input type="search" value={userSearch} onChange={event => { setUserSearch(event.target.value); setUserPage(1); }} className="ml-3 rounded-lg border border-slate-600 bg-[#071b2e] p-2" />
        </label>
        <div className="card-surface border border-[#cedc28]/10 rounded-3xl overflow-hidden shadow-2xl relative">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0a2442]/50 border-b border-[#cedc28]/10">
                  {[['userdetails', 'User Details'], ['role', 'Role'], ['lastactive', 'Last Active']].map(([key, label]) => <th key={key} aria-sort={sortConfig.key === key ? sortConfig.direction === 'asc' ? 'ascending' : 'descending' : 'none'} className="py-4 px-6 text-sm text-[#14a6d9]"><button onClick={() => { handleSort(key); setUserPage(1); }}>{label}{sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>)}
                  <th className="py-4 px-6 text-sm text-[#14a6d9]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-12 text-center text-gray-500 font-medium">
                      Loading users...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-12 text-center text-gray-500 font-medium">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  [...filteredUsers].sort((a, b) => {
                    if (!sortConfig) return 0;
                    let valA = a.email;
                    let valB = b.email;
                    if (sortConfig.key === 'role') {
                      valA = a.role || 'standard';
                      valB = b.role || 'standard';
                    } else if (sortConfig.key === 'lastactive') {
                      valA = a.lastSignInTime ? new Date(a.lastSignInTime).getTime() : 0;
                      valB = b.lastSignInTime ? new Date(b.lastSignInTime).getTime() : 0;
                    }
                    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                  }).slice((visibleUserPage - 1) * 20, visibleUserPage * 20).map(user => (
                    <tr key={user.uid} className="hover:bg-[#0a2442]/30 transition-colors group">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            user.role === 'super_admin' ? 'bg-[#cedc28]/20 text-[#cedc28] border border-[#cedc28]/50 shadow-[0_0_10px_rgba(206,220,40,0.3)]' :
                            user.role === 'admin' ? 'bg-[#14a6d9]/15 text-[#14a6d9] border border-[#14a6d9]/30' : 
                            'bg-gray-800 text-gray-400'
                          }`}>
                            {user.role === 'super_admin' || user.role === 'admin' ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="font-bold text-white text-sm">{user.email}</div>
                            <div className="text-xs text-gray-500">ID: {user.uid.substring(0, 8)}...</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-center">
                           <select 
                            aria-label={`Role for ${user.email}`}
                            value={user.role || 'standard'}
                            onChange={(e) => { setUserAction({ type: 'role', ...user, nextRole: e.target.value }); setError(null); }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all outline-none cursor-pointer appearance-none text-center ${
                              user.role === 'super_admin' ? 'bg-[#cedc28]/25 border-2 border-[#cedc28] text-[#cedc28] shadow-[0_0_12px_rgba(206,220,40,0.35)]' :
                              user.role === 'admin' ? 'bg-[#14a6d9]/15 border border-[#14a6d9]/40 text-[#14a6d9]' : 
                              user.role === 'non-finance' ? 'bg-purple-900/20 border border-purple-500/30 text-purple-400' : 
                              'bg-gray-800 border border-gray-600 text-gray-400'
                            }`}
                           >
                            <option value="super_admin">Super Admin</option>
                            <option value="admin">Admin</option>
                            <option value="standard">Standard</option>
                            <option value="non-finance">Non-Finance</option>
                           </select>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="text-sm font-medium text-gray-400">
                          {formatDate(user.lastSignInTime)}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-center gap-2">
                          <button 
                            onClick={() => { setUserAction({ type: 'password', ...user }); setActionPassword(''); setError(null); }}
                            aria-label={`Change password for ${user.email}`}
                            className="p-2 bg-blue-500/0 hover:bg-blue-500/10 text-gray-500 hover:text-blue-400 rounded-lg transition-colors"
                            title="Change Password"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => { setUserAction({ type: 'delete', ...user }); setError(null); }}
                            aria-label={`Delete ${user.email}`}
                            className="p-2 bg-red-500/0 hover:bg-red-500/10 text-gray-500 hover:text-red-400 rounded-lg transition-colors"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {filteredUsers.length > 20 && <nav aria-label="User list pagination" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <button disabled={visibleUserPage <= 1} onClick={() => setUserPage(visibleUserPage - 1)} className="rounded border border-slate-600 p-2 disabled:opacity-40">Previous</button>
          <span aria-live="polite">Page {visibleUserPage} of {Math.ceil(filteredUsers.length / 20)} · {filteredUsers.length} users</span>
          <button disabled={visibleUserPage * 20 >= filteredUsers.length} onClick={() => setUserPage(visibleUserPage + 1)} className="rounded border border-slate-600 p-2 disabled:opacity-40">Next</button>
        </nav>}
      </div>
          )
      )}

      {/* SECTION 3: ANALYTICS & ACTIVITY */}
      {visited.analytics && (
        <div hidden={activeSection !== 'analytics'}><AnalyticsAdmin active={active && activeSection === 'analytics'} currentUserEmail={currentUserEmail} /></div>
      )}
        </main>
      </div>
      {pendingSection && <AdminDialog title="Unsaved changes" onClose={() => setPendingSection(null)}>
        <p className="text-sm text-slate-300 leading-relaxed">
          You have unsaved changes in <strong className="text-white">{sections.find(s => s.id === activeSection)?.label || activeSection}</strong>.
          Choose how you would like to proceed:
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button 
            type="button" 
            onClick={() => setPendingSection(null)} 
            className="rounded-lg border border-slate-500 hover:bg-white/10 px-3.5 py-2 text-xs font-semibold text-slate-300 transition-colors"
          >
            Stay here
          </button>
          <button 
            type="button" 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('admin-discard-draft', { detail: { section: activeSection } }));
              setDirtyScopes(current => ({ ...current, [activeSection]: false }));
              setAcknowledgedDraftSections(prev => {
                const next = new Set(prev);
                next.delete(activeSection);
                return next;
              });
              setActiveSection(pendingSection);
              setPendingSection(null);
            }} 
            className="rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-2 text-xs font-semibold text-red-300 transition-colors"
          >
            Discard changes
          </button>
          <button 
            type="button" 
            onClick={() => {
              setAcknowledgedDraftSections(prev => new Set(prev).add(activeSection));
              setActiveSection(pendingSection);
              setPendingSection(null);
            }} 
            className="rounded-lg bg-[#cedc28] hover:bg-[#b5c222] px-4 py-2 text-xs font-bold text-[#041628] transition-colors shadow-sm ml-auto"
          >
            Keep drafts & continue
          </button>
        </div>
      </AdminDialog>}
      {userAction && <AdminDialog title={userAction.type === 'delete' ? 'Delete user?' : userAction.type === 'role' ? 'Change access role?' : 'Change password'} onClose={() => { if (!actionBusy) setUserAction(null); }}>
        <form onSubmit={async event => {
          event.preventDefault();
          setActionBusy(true);
          setError(null);
          try {
            if (userAction.type === 'delete') {
              await handleDeleteUser(userAction.uid);
              setNotice(`Deleted ${userAction.email}.`);
            } else if (userAction.type === 'role') await updateUserRole(userAction.uid, userAction.nextRole);
            else await handleChangePassword(userAction.uid, userAction.email, actionPassword);
            setUserAction(null);
            setActionPassword('');
          } catch (err) { setError(err.message); }
          finally { setActionBusy(false); }
        }}>
          <p className="break-all text-sm text-slate-300">{userAction.email}{userAction.type === 'delete' ? ' will permanently lose access. This cannot be undone.' : ''}</p>
          {userAction.type === 'role' && <p className="mt-3 text-sm text-slate-300">Change from {userAction.role || 'standard'} to <strong>{userAction.nextRole}</strong>. This changes dashboard permissions immediately.</p>}
          {userAction.type === 'password' && <label className="mt-4 block text-sm">New password
            <input autoComplete="new-password" type="password" minLength={6} required value={actionPassword} onChange={event => setActionPassword(event.target.value)} className="mt-2 w-full rounded border border-slate-500 bg-[#041628] p-2" />
          </label>}
          {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" disabled={actionBusy} onClick={() => setUserAction(null)} className="rounded border border-slate-500 px-4 py-2">Cancel</button>
            <button disabled={actionBusy} className="rounded bg-[#cedc28] px-4 py-2 text-[#041628]">{actionBusy ? 'Saving...' : userAction.type === 'delete' ? 'Delete user' : userAction.type === 'role' ? 'Change role' : 'Save password'}</button>
          </div>
        </form>
      </AdminDialog>}
    </div>
  );
}
