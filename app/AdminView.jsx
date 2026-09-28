"use client";
import React, { useState, useEffect } from 'react';
import { Trash2, UserPlus, Shield, User, RefreshCw, CheckCircle2, Key } from 'lucide-react';

export default function AdminView() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // New user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('standard');
  const [addingUser, setAddingUser] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);

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

  useEffect(() => {
    fetchUsers();
  }, []);

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

  const handleDeleteUser = async (uid, email) => {
    if (!window.confirm(`Are you sure you want to permanently delete the user ${email}?`)) return;
    
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
      alert('Error deleting user: ' + err.message);
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
      setUsers(users.map(u => u.uid === uid ? { ...u, role: newRole } : u));
    } catch (err) {
      console.error(err);
      alert('Error updating user role: ' + err.message);
    }
  };

  const handleChangePassword = async (uid, email) => {
    const newPassword = window.prompt(`Enter new password for ${email} (minimum 6 characters):`);
    if (!newPassword) return;
    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password: newPassword })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update password');
      }
      
      alert(`Password successfully updated for ${email}.`);
    } catch (err) {
      console.error(err);
      alert('Error updating user password: ' + err.message);
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

  return (
    <div className="flex-1 p-8 overflow-auto pb-32">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-3xl font-black text-white tracking-widest uppercase mb-1">User Management</h2>
            <p className="text-[#6fa89f] text-sm font-medium">Control dashboard access and administrator privileges</p>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={fetchUsers}
              className="px-4 py-2 bg-[#011414] border border-[#c88214]/30 text-[#c88214] hover:bg-[#c88214]/10 hover:text-white rounded-xl transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-[#c88214]/20 border border-[#c88214]/50 text-[#c88214] hover:bg-[#c88214]/40 hover:text-white rounded-xl transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-[0_0_15px_rgba(200,130,20,0.15)]"
            >
              <UserPlus className="w-4 h-4" />
              {showAddForm ? 'Cancel' : 'Add User'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl text-sm font-medium mb-6 flex items-center gap-3 shadow-lg">
            <Shield className="w-5 h-5 text-red-500" />
            {error}
          </div>
        )}

        {addSuccess && (
          <div className="bg-[#c88214]/10 border border-[#c88214]/30 text-[#c88214] p-4 rounded-2xl text-sm font-medium mb-6 flex items-center gap-3 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-[#c88214]" />
            User successfully created and granted access.
          </div>
        )}

        {showAddForm && (
          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-2xl mb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 opacity-5 pointer-events-none" style={{ backgroundImage: "url('/loc-pattern.png')", backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'top right' }}></div>
            
            <h3 className="text-[#6fa89f] font-black uppercase tracking-widest text-sm mb-4">Create New User</h3>
            
            <form onSubmit={handleAddUser} className="relative z-10 flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Email Address</label>
                <input 
                  type="email" 
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-[#011414] border border-gray-600/50 rounded-xl px-4 py-2.5 text-sm text-[#eef7f5] focus:outline-none focus:border-[#c88214]/50 transition-all"
                  placeholder="name@example.com"
                  required 
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Temporary Password</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#011414] border border-gray-600/50 rounded-xl px-4 py-2.5 text-sm text-[#eef7f5] focus:outline-none focus:border-[#c88214]/50 transition-all"
                  placeholder="Min 6 characters"
                  required 
                  minLength={6}
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">User Role</label>
                <select 
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-[#011414] border border-gray-600/50 rounded-xl px-4 py-2.5 text-sm text-[#eef7f5] font-bold focus:outline-none focus:border-[#c88214]/50 transition-all cursor-pointer appearance-none"
                >
                  <option value="admin">Admin</option>
                  <option value="standard">Standard</option>
                  <option value="non-finance">Non-Finance</option>
                </select>
              </div>
              
              <button 
                type="submit" 
                disabled={addingUser}
                className="px-6 py-2.5 bg-[#c88214]/20 hover:bg-[#c88214]/40 border border-[#c88214]/50 text-[#c88214] hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {addingUser ? 'Creating...' : 'Create'}
              </button>
            </form>
          </div>
        )}

        <div className="card-surface border border-[#c88214]/10 rounded-3xl overflow-hidden shadow-2xl relative">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#011414]/50 border-b border-[#c88214]/10">
                  <th className="py-4 px-6 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest">User Details</th>
                  <th className="py-4 px-6 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest text-center">Role</th>
                  <th className="py-4 px-6 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest text-center">Last Active</th>
                  <th className="py-4 px-6 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-12 text-center text-gray-500 font-medium">
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-12 text-center text-gray-500 font-medium">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map(user => (
                    <tr key={user.uid} className="hover:bg-[#011414]/30 transition-colors group">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.role === 'admin' ? 'bg-[#c88214]/10 text-[#c88214]' : 'bg-gray-800 text-gray-400'}`}>
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
                            value={user.role || 'standard'}
                            onChange={(e) => updateUserRole(user.uid, e.target.value)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all outline-none cursor-pointer appearance-none text-center ${
                              user.role === 'admin' ? 'bg-[#c88214]/10 border border-[#c88214]/30 text-[#c88214]' : 
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
                            onClick={() => handleChangePassword(user.uid, user.email)}
                            className="p-2 bg-blue-500/0 hover:bg-blue-500/10 text-gray-500 hover:text-blue-400 rounded-lg transition-colors"
                            title="Change Password"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(user.uid, user.email)}
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

      </div>
    </div>
  );
}
