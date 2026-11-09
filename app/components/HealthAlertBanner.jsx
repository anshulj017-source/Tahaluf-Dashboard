"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, AlertOctagon, TrendingDown, Bell, X, ArrowRight, ShieldCheck, ExternalLink } from 'lucide-react';

export default function HealthAlertBanner({
  isAdmin = false,
  alertsEnabled = true,
  statusBannerEnabled = true,
  isModalOpen = false,
  onToggleModal = null,
  onAlertCountChange = () => {},
  onOpenHealthMonitor = () => {}
}) {
  const [issues, setIssues] = useState([]);
  const [eventStatuses, setEventStatuses] = useState([]);
  const [internalModalOpen, setInternalModalOpen] = useState(false);

  // Allow controlled or uncontrolled modal state
  const modalOpen = onToggleModal ? isModalOpen : internalModalOpen;
  const setModalOpen = onToggleModal ? onToggleModal : setInternalModalOpen;

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/health-alerts', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEventStatuses(data.eventStatuses || []);
          const activeIssues = alertsEnabled ? (data.issues || []) : [];
          setIssues(activeIssues);
          onAlertCountChange(activeIssues.length);
          return;
        }
      }
      // If error or disabled, default to 0
      setIssues([]);
      onAlertCountChange(0);
    } catch {
      // Silently handle offline/network issues
    }
  }, [alertsEnabled, onAlertCountChange]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 45_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Handle escape key to close modal
  useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, setModalOpen]);

  const uniqueEventNames = Array.from(new Set(issues.map(i => i.eventName))).filter(Boolean);

  return (
    <>
      {statusBannerEnabled && eventStatuses.length > 0 && (
        <div
          role="status"
          aria-label="Paused and closed events"
          className="mb-5 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-[#17150c]/90 px-4 py-3 text-left text-xs text-amber-100 shadow-lg backdrop-blur-md"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-bold text-white">Event status</span>
            {eventStatuses.map(event => (
              <span
                key={event.eventId}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  event.status === 'ended'
                    ? 'border-slate-400/40 bg-slate-500/15 text-slate-200'
                    : 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                }`}
              >
                {event.eventName}: {event.status === 'ended' ? 'Closed' : 'Paused'}
              </span>
            ))}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenHealthMonitor}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
            >
              Manage event status
            </button>
          )}
        </div>
      )}

      {/* 1. INLINE DASHBOARD HEALTH BANNER */}
      {alertsEnabled && issues.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-5 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/40 bg-[#160b13]/90 px-4 py-3 text-left text-xs text-rose-100 shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-1"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4 text-rose-400 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white text-xs sm:text-sm">
                  {issues.length} Active Data Health Alert{issues.length === 1 ? '' : 's'}
                </span>
                <span className="text-[10px] font-medium text-rose-300/80">
                  Affecting {uniqueEventNames.slice(0, 3).join(', ')}{uniqueEventNames.length > 3 ? ` +${uniqueEventNames.length - 3} more` : ''}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-rose-200/90 truncate max-w-xl">
                {issues[0]?.headline || 'Delivery anomalies or sheet discrepancies require attention.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 hover:text-white border border-rose-400/50 text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Bell className="w-3.5 h-3.5 text-rose-300" />
              <span>View Issue Details ({issues.length})</span>
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={onOpenHealthMonitor}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/20 text-xs font-semibold transition-all cursor-pointer hidden md:flex items-center gap-1"
              >
                <span>Health Monitor</span>
                <ArrowRight className="w-3 h-3 text-slate-300" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. HEALTH ALERT POPUP MODAL */}
      {alertsEnabled && modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setModalOpen(false)}
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="health-modal-title"
            className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-rose-500/40 bg-[#091b2e] shadow-2xl backdrop-blur-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-[#05111e]/90">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-rose-400" />
                </div>
                <div className="min-w-0">
                  <h3 id="health-modal-title" className="text-sm sm:text-base font-bold text-white truncate">
                    Data Health Alerts {issues.length > 0 ? `(${issues.length} Active)` : ''}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Live operational telemetry watching delivery velocity, sheet sync, and dimension integrity.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content: Issue Cards */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 custom-scrollbar">
              {issues.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 mx-auto flex items-center justify-center mb-3">
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h4 className="text-base font-bold text-white">All Event Data Sources Healthy</h4>
                  <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                    Zero active delivery drops, missing rows, or metric discrepancies detected. Automated checks run continuously.
                  </p>
                </div>
              ) : (
                issues.map((issue) => {
                  const isHalt = issue.status === 'activity-halt';
                  const isCliff = issue.status === 'spend-cliff';
                  const isCritical = issue.severity === 'critical' || isHalt;

                  return (
                    <div
                      key={issue.key || `${issue.eventId}-${issue.status}`}
                      className={`rounded-2xl border p-4 transition-all ${
                        isHalt
                          ? 'border-red-500/50 bg-red-950/30'
                          : isCliff
                          ? 'border-amber-500/50 bg-amber-950/30'
                          : isCritical
                          ? 'border-rose-500/40 bg-rose-950/25'
                          : 'border-white/10 bg-[#031120]/70'
                      }`}
                    >
                      {/* Top Row: Event name + Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm">
                            {issue.eventName}
                          </span>
                          <span className="text-[11px] text-slate-300">
                            {issue.kind} · {issue.category}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              isHalt
                                ? 'bg-red-500/25 text-red-300 border-red-500/40'
                                : isCliff
                                ? 'bg-amber-500/25 text-amber-300 border-amber-500/40'
                                : isCritical
                                ? 'bg-rose-500/25 text-rose-300 border-rose-500/40'
                                : 'bg-sky-500/25 text-sky-300 border-sky-500/40'
                            }`}
                          >
                            {isHalt
                              ? 'Activity Halt ($0)'
                              : isCliff
                              ? 'Spend Cliff'
                              : issue.status}
                          </span>
                        </div>
                        {issue.date && (
                          <span className="text-[10px] font-medium text-slate-400 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5">
                            Reporting Date: {issue.date}
                          </span>
                        )}
                      </div>

                      {/* Headline with Icon */}
                      <div className="mt-2 flex items-start gap-2">
                        {isHalt ? (
                          <AlertOctagon className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                        ) : isCliff ? (
                          <TrendingDown className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                        )}
                        <span className="text-xs font-bold text-white">
                          {issue.headline}
                        </span>
                      </div>

                      {/* 1-2 Line Informative Summary */}
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-200/95 pl-6">
                        {issue.summary}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 px-5 py-3.5 bg-[#05111e]/90 flex flex-wrap items-center justify-between gap-3 text-xs">
              {isAdmin ? (
                <>
                  <span className="text-[11px] text-slate-400">
                    Administrator access enabled: You can inspect raw data, modify thresholds, or resolve issues.
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpen(false);
                        onOpenHealthMonitor();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#cedc28] hover:bg-[#d9e838] text-[#041628] font-bold transition-all shadow-md flex items-center gap-1.5"
                    >
                      <span>Review in Health Monitor</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    ℹ️ Operational administrators have been notified. Alerts resolve automatically when recovery data is verified.
                  </p>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-1.5 rounded-xl border border-white/10 hover:bg-white/10 text-slate-200 hover:text-white transition-colors ml-auto font-medium"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
