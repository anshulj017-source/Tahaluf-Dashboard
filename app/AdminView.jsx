"use client";
import React, { useState, useEffect } from 'react';
import { Trash2, UserPlus, Shield, User, RefreshCw, CheckCircle2, Key, Layers, Activity, Users as UsersIcon, BarChart3, Gauge } from 'lucide-react';
import EventsAdmin from './components/EventsAdmin';
import DataHealthAdmin from './components/DataHealthAdmin';
import AnalyticsAdmin from './components/AnalyticsAdmin';
import ApiQuotasAdmin from './components/ApiQuotasAdmin';
import FeatureControlsAdmin from './components/FeatureControlsAdmin';
import { AdminDialog, useAdminView, useAdminDirtyGuard } from './components/AdminUI';

const sections = [
  { id: 'events', label: 'Events & Data', icon: Layers },
  { id: 'health', label: 'Health Monitor', icon: Activity },
  { id: 'quotas', label: 'API & Quotas', icon: Gauge },
  { id: 'analytics', label: 'Analytics & Activity', icon: BarChart3 },
  { id: 'features', label: 'Feature Controls', icon: Shield },
  { id: 'users', label: 'User Access', icon: UsersIcon },
];

export default function AdminView({ active = true, currentUserEmail = 'admin@tahaluf.com', initialEvents = [], onFeaturesSaved }) {
  const [activeSection, setActiveSection] = useAdminView('admin', 'users', sections.map(section => section.id));
  const [visited, setVisited] = useState({ events: true });
  const [dirtyScopes, setDirtyScopes] = useState({});
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
    const updateDirty = event => setDirtyScopes(current => ({ ...current, [event.detail.scope]: event.detail.dirty }));
    window.addEventListener('admin-dirty', updateDirty);
    return () => window.removeEventListener('admin-dirty', updateDirty);
  }, []);
  useEffect(() => { setVisited(current => ({ ...current, [activeSection]: true })); }, [activeSection]);
  const navigate = section => {
    if (section !== activeSection && Object.values(dirtyScopes).some(Boolean)) setPendingSection(section);
    else setActiveSection(section);
  };

  const [sortConfig, setSortConfig] = useState({ key: 'lastactive', direction: 'desc' });

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users');
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

  // Only fetch users on demand when switching to the users section
  useEffect(() => {
    if (activeSection === 'users' && users.length === 0) {
      fetchUsers();
    }
  }, [activeSection]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddingUser(true);
    setError(null);
    setAddSuccess(false);
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <div className="admin-workspace flex-1 p-4 md:p-6 overflow-auto pb-32">
      <div className="max-w-[1500px] mx-auto lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-6">
        <aside className="mb-5 lg:mb-0">
          <label className="block lg:hidden text-sm font-semibold text-slate-300">
            Admin section
            <select aria-label="Admin section" value={activeSection} onChange={event => navigate(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-600 bg-[#071b2e] p-3 text-white">
              {sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
          </label>
          <nav aria-label="Admin sections" className="hidden lg:flex sticky top-0 flex-col gap-2">
            <p className="mb-2 text-sm font-semibold text-slate-400">Administration</p>
            {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => navigate(id)} aria-current={activeSection === id ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-semibold ${activeSection === id ? 'bg-[#cedc28] text-[#041628]' : 'text-slate-300 hover:bg-white/10'}`}>
              <Icon className="h-4 w-4 shrink-0" />{label}
              {id === 'health' && dashboardAlertsEnabled && healthIssueCount > 0 && <span className="ml-auto rounded-full bg-red-600 px-2 text-xs text-white">{healthIssueCount}</span>}
            </button>)}
          </nav>
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
          <EventsAdmin currentUserEmail={currentUserEmail} initialEvents={initialEvents} />
        </div>

        <DataHealthAdmin
          active={active && activeSection === 'health'}
          onIssueCountChange={setHealthIssueCount}
          onDashboardAlertsEnabledChange={setDashboardAlertsEnabled}
        />

        {/* SECTION: API INFRASTRUCTURE & QUOTA HUB */}
        <ApiQuotasAdmin active={active && activeSection === 'quotas'} />
        {visited.features && <div hidden={activeSection !== 'features'}><FeatureControlsAdmin onSaved={onFeaturesSaved} /></div>}

        {/* SECTION 2: USER ACCESS MANAGEMENT */}
        {activeSection === 'users' && (
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
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.role === 'admin' ? 'bg-[#cedc28]/10 text-[#cedc28]' : 'bg-gray-800 text-gray-400'}`}>
                            {user.role === 'admin' ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
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
                              user.role === 'admin' ? 'bg-[#cedc28]/10 border border-[#cedc28]/30 text-[#cedc28]' : 
                              user.role === 'non-finance' ? 'bg-purple-900/20 border border-purple-500/30 text-purple-400' : 
                              'bg-gray-800 border border-gray-600 text-gray-400'
                            }`}
                           >
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
      )}

      {/* SECTION 3: ANALYTICS & ACTIVITY */}
      {visited.analytics && (
        <div hidden={activeSection !== 'analytics'}><AnalyticsAdmin active={active && activeSection === 'analytics'} currentUserEmail={currentUserEmail} /></div>
      )}
        </main>
      </div>
      {pendingSection && <AdminDialog title="Unsaved changes" onClose={() => setPendingSection(null)}>
        <p className="text-sm text-slate-300">You have unsaved changes. Your drafts will remain here while you visit another admin section. Save before reloading or leaving the dashboard.</p>
        <div className="mt-5 flex gap-3">
          <button onClick={() => setPendingSection(null)} className="rounded border border-slate-500 px-4 py-2">Stay here</button>
          <button onClick={() => { setActiveSection(pendingSection); setPendingSection(null); }} className="rounded bg-[#cedc28] px-4 py-2 text-[#041628]">Keep drafts & continue</button>
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
