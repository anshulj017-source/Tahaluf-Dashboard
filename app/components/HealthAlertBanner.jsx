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
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/admin/health-notifications?includeHealth=true', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Could not check dashboard health alerts.');
        }
        if (!cancelled) {
          setEnabled(result.settings.dashboardEnabled);
          setIssues(result.issues || []);
        }
      } catch (error) {
        console.error('[HEALTH ALERT] Could not update dashboard alert:', error);
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
    <button
      onClick={onOpenHealthMonitor}
      className="mb-5 flex w-full items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-100 hover:bg-amber-500/15"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
      <span>
        <strong>{issues.length} active data health issue{issues.length === 1 ? '' : 's'}.</strong>
        {' '}Open Admin Health Monitor to review.
      </span>
    </button>
  );
}
