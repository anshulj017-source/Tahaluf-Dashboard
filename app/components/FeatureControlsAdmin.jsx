"use client";

import React, { useEffect, useState } from 'react';
import { auth } from '../../lib/firebase';
import { DASHBOARD_FEATURES, DEFAULT_FEATURE_CONFIG, isFeatureEnabled } from '../../lib/dashboardFeatures.mjs';

const labels = { public: 'Everyone', admin_only: 'Admin only', disabled: 'Disabled' };

export default function FeatureControlsAdmin({ onSaved }) {
  const [config, setConfig] = useState(null);
  const [modes, setModes] = useState(DEFAULT_FEATURE_CONFIG.modes);
  const [previewRole, setPreviewRole] = useState('standard');
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
      setModes({ ...DEFAULT_FEATURE_CONFIG.modes, ...json.config.modes });
      setNotice('');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ modes, revision: config.revision })
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not save feature controls.');
      setConfig(json.config);
      setModes(json.config.modes);
      onSaved?.(json.config);
      setNotice('Feature controls saved. Open dashboards refresh within 60 seconds or when focused.');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const dirty = config && JSON.stringify(modes) !== JSON.stringify({ ...DEFAULT_FEATURE_CONFIG.modes, ...config.modes });

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard Feature Controls</h2>
        <p className="text-sm text-gray-400 mt-2">Control dashboard views and optional tools. These visibility settings never grant permissions or bypass non-finance restrictions.</p>
        <p className="text-xs text-[#14a6d9] mt-2">Admin Center, user management, monitoring and configuration backups remain admin-only and cannot be disabled here.</p>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm text-gray-300">Preview draft as
          <select aria-label="Feature preview role" value={previewRole} onChange={event => setPreviewRole(event.target.value)} className="ml-3 bg-[#041628] border border-gray-600 rounded-lg p-2">
            <option value="standard">Other users</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <button disabled={busy || !dirty} onClick={save} className="px-4 py-2 rounded-lg bg-[#cedc28] text-[#041628] font-bold disabled:opacity-40">{busy ? 'Please wait...' : 'Save feature controls'}</button>
        <button disabled={busy} onClick={load} className="px-4 py-2 border border-gray-600 rounded-lg text-sm">Reload / discard draft</button>
        {config?.updatedAt && <span className="text-xs text-gray-500">Saved {new Date(config.updatedAt).toLocaleString()}</span>}
      </div>
      {error && <p role="alert" className="p-3 border border-red-500/40 rounded-lg text-red-300">{error}</p>}
      {notice && <p role="status" className="text-lime-300 text-sm">{notice}</p>}
      {!config && <p className="text-gray-400">Feature controls are not loaded. Use Reload to retry if needed.</p>}
      {config && [...new Set(DASHBOARD_FEATURES.map(feature => feature.group))].map(group => (
        <div key={group} className="card-surface rounded-xl border border-white/10 p-4">
          <h3 className="text-[#cedc28] font-bold mb-3">{group}</h3>
          <div className="space-y-3">
            {DASHBOARD_FEATURES.filter(feature => feature.group === group).map(feature => {
              const visible = isFeatureEnabled({ modes }, feature.id, previewRole);
              return (
                <div key={feature.id} className="flex flex-wrap items-center gap-3 border-t border-white/5 py-3">
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-sm font-bold">{feature.name}</div>
                    <p className="text-xs text-gray-400 mt-1">{feature.description}</p>
                  </div>
                  <span className={`text-xs ${visible ? 'text-lime-300' : 'text-gray-500'}`}>{visible ? 'Visible' : 'Hidden'} in preview</span>
                  <select aria-label={`${feature.name} visibility`} disabled={busy} value={modes[feature.id]} onChange={event => { setModes(current => ({ ...current, [feature.id]: event.target.value })); setNotice(''); }} className="bg-[#041628] border border-gray-600 rounded-lg p-2 text-sm">
                    {Object.entries(labels).filter(([mode]) => !feature.adminOnly || mode !== 'public').map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
