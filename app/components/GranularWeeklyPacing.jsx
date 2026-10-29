"use client";
import React, { useState, useMemo } from 'react';
import { Calendar, TrendingUp, TrendingDown, Target, Clock, Zap, AlertTriangle, CheckCircle2, ChevronRight, ShieldCheck } from 'lucide-react';

export default function GranularWeeklyPacing({
  eventName,
  eventTimeline = [],
  weeklyData = [],
  plannedData = [],
  selectedWeeks = ['All'],
  onSelectWeek,
  currency = 'USD',
  exRate = 1,
  exSym = '$'
}) {
  const [activeMetric, setActiveMetric] = useState('spend'); // 'spend' | 'purchases' | 'cpa'

  // Synthesize weekly pacing statistics across the countdown timeline
  const pacingBreakdown = useMemo(() => {
    if (!weeklyData || weeklyData.length === 0) return [];

    // Map weekly metrics by week string (e.g. 'W12', 'W11', etc.)
    const actualsMap = new Map();
    weeklyData.forEach(d => {
      if (!d.week || d.week === 'TOTAL') return;
      actualsMap.set(d.week, d);
    });

    // Map planned targets if available
    const targetsMap = new Map();
    if (plannedData && plannedData.length > 0) {
      plannedData.forEach(p => {
        const w = p.week || p.Week;
        if (w) {
          const current = targetsMap.get(w) || { targetSpend: 0, targetConversions: 0 };
          current.targetSpend += Number(p.budget || p.Budget || p.spend || p.Spend || 0);
          current.targetConversions += Number(p.conversions || p.purchases || p.Purchases || 0);
          targetsMap.set(w, current);
        }
      });
    }

    // Determine week ordering from timeline or data
    const allWeeks = Array.from(new Set([
      ...eventTimeline.map(t => t.week),
      ...Array.from(actualsMap.keys())
    ])).filter(Boolean).sort((a, b) => {
      const numA = parseInt(a.replace(/[^\d-]/g, '') || '0', 10);
      const numB = parseInt(b.replace(/[^\d-]/g, '') || '0', 10);
      return numB - numA; // W20 -> W0
    });

    let cumulativeSpend = 0;
    let cumulativePurchases = 0;

    return allWeeks.map((weekStr, idx) => {
      const actual = actualsMap.get(weekStr) || { spend: 0, purchases: 0, impressions: 0, clicks: 0, ctr: 0, cpa: 0, dateRange: '' };
      const target = targetsMap.get(weekStr) || { targetSpend: 0, targetConversions: 0 };
      const timelineEntry = eventTimeline.find(t => t.week === weekStr);

      const spend = Number(actual.spend || 0);
      const purchases = Number(actual.purchases || 0);
      const cpa = purchases > 0 ? spend / purchases : (actual.cpa || 0);

      cumulativeSpend += spend;
      cumulativePurchases += purchases;

      // Status determination
      const hasActuals = spend > 0 || purchases > 0;
      let status = 'upcoming';
      let statusLabel = 'Upcoming';
      let statusColor = 'text-slate-400 bg-slate-500/10 border-slate-500/30';

      if (hasActuals) {
        if (target.targetSpend > 0) {
          const pacePct = (spend / target.targetSpend) * 100;
          if (pacePct >= 90 && pacePct <= 115) {
            status = 'ontrack';
            statusLabel = 'On Target';
            statusColor = 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
          } else if (pacePct > 115) {
            status = 'accelerating';
            statusLabel = 'Overpacing';
            statusColor = 'text-[#cedc28] bg-[#cedc28]/15 border-[#cedc28]/40';
          } else {
            status = 'lagging';
            statusLabel = 'Underpacing';
            statusColor = 'text-amber-400 bg-amber-500/15 border-amber-500/30';
          }
        } else {
          status = 'active';
          statusLabel = 'Active Run';
          statusColor = 'text-[#14a6d9] bg-[#14a6d9]/15 border-[#14a6d9]/30';
        }
      }

      return {
        week: weekStr,
        isEventWeek: weekStr.toUpperCase() === 'W0' || weekStr.toLowerCase().includes('event'),
        dateRange: actual.dateRange || timelineEntry?.dateRange || 'TBD',
        spend,
        purchases,
        cpa,
        cumulativeSpend,
        cumulativePurchases,
        targetSpend: target.targetSpend,
        targetConversions: target.targetConversions,
        pacePercentage: target.targetSpend > 0 ? Math.round((spend / target.targetSpend) * 100) : null,
        status,
        statusLabel,
        statusColor,
        isSelected: selectedWeeks.includes('All') || selectedWeeks.includes(weekStr)
      };
    });
  }, [weeklyData, eventTimeline, plannedData, selectedWeeks]);

  // Aggregate summary
  const totals = useMemo(() => {
    const totalSpend = pacingBreakdown.reduce((sum, w) => sum + w.spend, 0);
    const totalPurchases = pacingBreakdown.reduce((sum, w) => sum + w.purchases, 0);
    const avgCpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
    const activeWeeksCount = pacingBreakdown.filter(w => w.spend > 0).length;
    const totalWeeksCount = pacingBreakdown.length;
    return { totalSpend, totalPurchases, avgCpa, activeWeeksCount, totalWeeksCount };
  }, [pacingBreakdown]);

  return (
    <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/25 shadow-2xl relative overflow-hidden space-y-6">
      {/* Glow highlight */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#cedc28]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#cedc28]/15 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#cedc28]/20 text-[#cedc28] border border-[#cedc28]/40">
              Advanced Analytics
            </span>
            <span className="text-xs text-[#14a6d9] font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Countdown Pacing Timeline
            </span>
          </div>
          <h3 className="text-2xl font-anton uppercase text-white tracking-wide flex items-center gap-2">
            <Clock className="w-6 h-6 text-[#cedc28]" />
            Granular Weekly Pacing: <span className="text-[#cedc28]">{eventName}</span>
          </h3>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Countdown trajectory from early momentum (W{totals.totalWeeksCount > 0 ? totals.totalWeeksCount - 1 : 'N'}) down to W0 Launch Week. Tracks weekly burn rate, conversion velocity, and pacing alignment against planned targets.
          </p>
        </div>

        {/* Metric Selector Controls */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1.5 rounded-xl border border-white/10 shrink-0 self-start sm:self-center">
          <button
            onClick={() => setActiveMetric('spend')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeMetric === 'spend' ? 'bg-[#cedc28] text-[#0a2442] shadow-md' : 'text-slate-300 hover:text-white'}`}
          >
            Spend Pacing
          </button>
          <button
            onClick={() => setActiveMetric('purchases')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeMetric === 'purchases' ? 'bg-[#14a6d9] text-white shadow-md' : 'text-slate-300 hover:text-white'}`}
          >
            Conversions
          </button>
          <button
            onClick={() => setActiveMetric('cpa')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeMetric === 'cpa' ? 'bg-purple-500 text-white shadow-md' : 'text-slate-300 hover:text-white'}`}
          >
            CPA Drift
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col">
          <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider">Countdown Progress</span>
          <span className="text-xl font-black text-white mt-0.5">
            {totals.activeWeeksCount} <span className="text-xs text-slate-400 font-normal">/ {totals.totalWeeksCount} Weeks Active</span>
          </span>
          <span className="text-[10px] text-slate-400 mt-1">From W{totals.totalWeeksCount > 0 ? totals.totalWeeksCount - 1 : '0'} to W0 Launch</span>
        </div>

        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col">
          <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider">Cumulative Spend</span>
          <span className="text-xl font-black text-[#cedc28] mt-0.5">
            {exSym}{Math.round(totals.totalSpend * exRate).toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 mt-1">Total delivered across active weeks</span>
        </div>

        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col">
          <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider">Total Conversions</span>
          <span className="text-xl font-black text-[#14a6d9] mt-0.5">
            {Math.round(totals.totalPurchases).toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 mt-1">Cumulative registered / purchased</span>
        </div>

        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col">
          <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider">Average Weighted CPA</span>
          <span className="text-xl font-black text-white mt-0.5">
            {exSym}{(totals.avgCpa * exRate).toFixed(2)}
          </span>
          <span className="text-[10px] text-emerald-400 mt-1 font-semibold">Across all countdown phases</span>
        </div>
      </div>

      {/* Horizontal Interactive Countdown Timeline Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300">
          <span className="flex items-center gap-1.5 text-[#cedc28]">
            <Target className="w-3.5 h-3.5" /> Chronological Countdown Sequence (Click any week to filter)
          </span>
          <span className="text-[11px] text-slate-400">
            {pacingBreakdown.length} Countdown Intervals
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
          {pacingBreakdown.map((item) => (
            <div
              key={item.week}
              onClick={() => onSelectWeek && onSelectWeek(item.week)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group flex flex-col justify-between ${
                item.isEventWeek
                  ? 'bg-gradient-to-br from-[#cedc28]/20 via-[#0a2442] to-[#14a6d9]/20 border-[#cedc28] shadow-[0_0_20px_rgba(206,220,40,0.25)] ring-1 ring-[#cedc28]/50'
                  : item.isSelected && !selectedWeeks.includes('All')
                  ? 'bg-[#0a2442] border-[#cedc28] shadow-lg ring-1 ring-[#cedc28]/40'
                  : 'bg-[#0a2442]/70 hover:bg-[#0a2442] border-white/10 hover:border-[#cedc28]/50 shadow-md'
              }`}
            >
              {/* Card top banner */}
              <div>
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className={`text-xs font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${
                    item.isEventWeek ? 'bg-[#cedc28] text-[#0a2442]' : 'bg-white/10 text-white'
                  }`}>
                    {item.week} {item.isEventWeek && '• LAUNCH'}
                  </span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${item.statusColor}`}>
                    {item.statusLabel}
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 font-mono truncate mb-3" title={item.dateRange}>
                  {item.dateRange}
                </div>
              </div>

              {/* Value metric depending on active toggle */}
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                {activeMetric === 'spend' && (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Weekly Spend</span>
                      <span className="text-base font-black text-[#cedc28]">
                        {exSym}{Math.round(item.spend * exRate).toLocaleString()}
                      </span>
                    </div>
                    {item.targetSpend > 0 && (
                      <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-[#cedc28] h-full rounded-full transition-all"
                          style={{ width: `${Math.min(item.pacePercentage || 0, 100)}%` }}
                        ></div>
                      </div>
                    )}
                    <div className="flex justify-between text-[9.5px] text-slate-400">
                      <span>Target: {item.targetSpend > 0 ? `${exSym}${Math.round(item.targetSpend * exRate).toLocaleString()}` : 'Flexible'}</span>
                      {item.pacePercentage != null && (
                        <span className={item.pacePercentage >= 90 && item.pacePercentage <= 115 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                          {item.pacePercentage}%
                        </span>
                      )}
                    </div>
                  </>
                )}

                {activeMetric === 'purchases' && (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Conversions</span>
                      <span className="text-base font-black text-[#14a6d9]">
                        {Math.round(item.purchases).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-[9.5px] text-slate-400">
                      <span>Cumulative: {Math.round(item.cumulativePurchases).toLocaleString()}</span>
                      <span className="text-slate-300 font-mono">Conv</span>
                    </div>
                  </>
                )}

                {activeMetric === 'cpa' && (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Effective CPA</span>
                      <span className="text-base font-black text-purple-300">
                        {item.cpa > 0 ? `${exSym}${(item.cpa * exRate).toFixed(2)}` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-[9.5px] text-slate-400">
                      <span>Spend: {exSym}{Math.round(item.spend * exRate).toLocaleString()}</span>
                      <span className="text-purple-400 font-bold">Cost/Reg</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

