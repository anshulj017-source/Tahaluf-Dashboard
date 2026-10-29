"use client";

import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { auth } from '../../lib/firebase';

export default function HealthAlertBanner({ onOpenHealthMonitor }) {
  const [issues, setIssues] = useState([]);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const checkIssues = async () => {
      try {
        if (!auth.currentUser) return;
        const token = await auth.currentUser.getIdToken().catch(() => null);
        if (!token) return;
        const response = await fetch('/api/admin/health-notifications?includeHealth=true', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401 || response.status === 403) {
          return;
        }
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Could not check dashboard health alerts.');
        }
        if (!cancelled) {
          setEnabled(result.settings.dashboardEnabled);
          setIssues(result.issues || []);
        }
      } catch (error) {
        console.warn('[HEALTH ALERT] Could not update dashboard alert:', error.message || error);
      }
    };

    checkIssues();
    const intervalId = window.setInterval(checkIssues, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  if (!enabled || issues.length === 0) return null;

  return (
    <div
      className="mb-5 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-100 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span>
          <strong>{issues.length} active data health issue{issues.length === 1 ? '' : 's'}.</strong>
          {' '}Data Health Monitor detects items for administrative review.
        </span>
      </div>
      <button
        type="button"
        onClick={onOpenHealthMonitor}
        className="px-3 py-1.5 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 hover:text-white border border-amber-400/40 text-[11px] font-bold transition-all cursor-pointer shrink-0 shadow-sm"
      >
        Open Health Monitor
      </button>
    </div>
  );
}
