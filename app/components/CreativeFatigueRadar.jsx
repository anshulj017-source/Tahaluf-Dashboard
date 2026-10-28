"use client";
import React, { useMemo } from 'react';
import { AlertTriangle, Flame, ShieldAlert, Sparkles, TrendingDown, CheckCircle2 } from 'lucide-react';
import { computeCreativeFatigue } from '../../lib/algorithmicIntelligence.mjs';

export default function CreativeFatigueRadar({
  creatives = [],
  exSym = '$',
  exRate = 1,
  formatShort = (n) => String(n)
}) {
  const evaluated = useMemo(() => {
    return computeCreativeFatigue(creatives);
  }, [creatives]);

  if (!evaluated || evaluated.length === 0) return null;

  const fatiguedCount = evaluated.filter(c => c.fatigueState === 'fatigued').length;
  const warningCount = evaluated.filter(c => c.fatigueState === 'warning').length;
  const topCount = evaluated.filter(c => c.fatigueState === 'top_performer').length;

  return (
    <div className="card-surface p-5 rounded-3xl border border-white/10 bg-[#0a2442]/80 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>Creative Fatigue &amp; Decay Radar</span>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Admin Diagnostic
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Heuristic saturation analysis detecting high-frequency audience burnout and declining CTR
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30">
            {fatiguedCount} Fatigued
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {warningCount} Burnout Warning
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {topCount} Strong
          </span>
        </div>
      </div>

      <div className="space-y-2.5 max-h-96 overflow-y-auto custom-scrollbar pr-1">
        {evaluated.slice(0, 10).map((ad, idx) => {
          let badgeStyle = 'bg-white/5 text-slate-300 border-white/10';
          let stateLabel = 'Healthy';
          if (ad.fatigueState === 'fatigued') {
            badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
            stateLabel = 'Audience Saturation';
          } else if (ad.fatigueState === 'warning') {
            badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
            stateLabel = 'Fatigue Warning';
          } else if (ad.fatigueState === 'top_performer') {
            badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
            stateLabel = 'Top Performer';
          }

          return (
            <div
              key={ad.id + idx}
              className="p-3 rounded-2xl bg-[#041628]/80 border border-white/5 hover:border-white/15 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-white truncate max-w-xs">{ad.name}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${badgeStyle}`}>
                    {stateLabel}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Channel: {ad.channel}</span>
                </div>
                <p className="text-[11px] text-slate-300 font-medium">{ad.recommendations}</p>
              </div>

              <div className="flex items-center gap-5 shrink-0 font-mono text-xs">
                <div>
                  <span className="text-[9px] text-slate-400 block uppercase">Impr</span>
                  <span className="text-white font-bold">{formatShort(ad.impressions)}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block uppercase">CTR</span>
                  <span className={`font-bold ${ad.ctr < 0.6 ? 'text-rose-400' : ad.ctr > 1.8 ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {ad.ctr.toFixed(2)}%
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block uppercase">Spend</span>
                  <span className="text-[#cedc28] font-bold">{exSym}{formatShort(ad.cost * exRate)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

