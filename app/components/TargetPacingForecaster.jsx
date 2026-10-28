"use client";
import React, { useMemo } from 'react';
import { Target, Calendar, TrendingUp, AlertCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { computeLaunchForecast } from '../../lib/algorithmicIntelligence.mjs';

export default function TargetPacingForecaster({
  eventName = 'Event',
  deliveredCost = 0,
  plannedBudget = 0,
  launchDateStr = '',
  startDateStr = '',
  exSym = '$',
  exRate = 1,
  formatShort = (n) => String(n)
}) {
  const forecast = useMemo(() => {
    return computeLaunchForecast(deliveredCost, plannedBudget, launchDateStr, startDateStr);
  }, [deliveredCost, plannedBudget, launchDateStr, startDateStr]);

  if (!forecast || deliveredCost <= 0) return null;

  let statusBadge = {
    label: 'On Target Pace',
    style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    icon: CheckCircle2,
    advice: 'Current daily velocity aligns with target budget delivery.'
  };

  if (forecast.status === 'under_pacing') {
    statusBadge = {
      label: 'Under-Pacing Alert',
      style: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: AlertCircle,
      advice: `Accelerate run-rate by ${Math.abs(forecast.paceGapPercent).toFixed(0)}% to reach 100% target by launch.`
    };
  } else if (forecast.status === 'over_pacing') {
    statusBadge = {
      label: 'Over-Pacing Warning',
      style: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      icon: AlertCircle,
      advice: `Budget will be exhausted before launch. Reduce daily burn by ${Math.abs(forecast.paceGapPercent).toFixed(0)}%.`
    };
  }

  const StatusIcon = statusBadge.icon;

  return (
    <div className="card-surface p-4 sm:p-5 rounded-2xl border border-white/10 bg-[#0a2442]/70 shadow-lg relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[#cedc28]" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            {eventName} Pacing Forecaster
          </h4>
          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${statusBadge.style}`}>
            <StatusIcon className="w-2.5 h-2.5" />
            {statusBadge.label}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
          <Calendar className="w-3.5 h-3.5 text-[#14a6d9]" />
          <span>Launch: {launchDateStr || 'TBD'}</span>
          <span className="text-[#cedc28] font-bold">({forecast.remainingDays} days left)</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Current Daily Burn</span>
          <div className="text-sm font-extrabold text-white mt-1">
            {exSym}{formatShort(forecast.currentDailyBurn * exRate)}/day
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Over past {forecast.elapsedDays} days</span>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Required Daily Burn</span>
          <div className="text-sm font-extrabold text-[#cedc28] mt-1">
            {exSym}{formatShort(forecast.requiredDailyBurn * exRate)}/day
          </div>
          <span className="text-[10px] text-slate-400 font-mono">To reach 100% target</span>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Projected Finish</span>
          <div className="text-sm font-extrabold text-[#14a6d9] mt-1">
            {exSym}{formatShort(forecast.projectedFinishCost * exRate)}
          </div>
          <span className={`text-[10px] font-bold ${forecast.pacePercent >= 85 && forecast.pacePercent <= 115 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {forecast.pacePercent.toFixed(1)}% of planned target
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Strategic Action</span>
          <p className="text-[11px] text-slate-300 font-medium leading-tight mt-1">
            {statusBadge.advice}
          </p>
        </div>
      </div>
    </div>
  );
}

