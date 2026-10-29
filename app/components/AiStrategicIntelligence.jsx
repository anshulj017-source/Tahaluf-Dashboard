"use client";
import React, { useState, useMemo } from 'react';
import { 
  Sparkles, TrendingUp, AlertTriangle, Lightbulb, Activity, 
  Sliders, RefreshCw, Layers, Shield, ArrowUpRight, BarChart3, CheckCircle2,
  Calendar, PieChart, Filter, XCircle, ArrowRight, ListTodo, CheckSquare, Target
} from 'lucide-react';
import { 
  generateStrategicCommentary, 
  computeChannelQuadrants, 
  simulateBudgetReallocation,
  computeEventsBreakdown,
  computePortfolioBreakdown,
  computeDailyNextSteps,
  computePlannedBudgetAnalytics,
  parseFeedbackText
} from '../../lib/algorithmicIntelligence.mjs';

export default function AiStrategicIntelligence({
  allAdData = [],
  filteredAdData = [],
  plannedData = [],
  channelData = [],
  totals = {},
  topChannel = null,
  lowestCPMChannel = null,
  highestCTRChannel = null,
  avgDailySpend = 0,
  peakSpendDay = null,
  activeScope = { type: 'all', name: 'All Events' },
  onSelectEvent = null,
  onSelectPortfolio = null,
  onResetScope = null,
  exSym = '$',
  exRate = 1,
  formatShort = (n) => String(n),
  userRole = 'standard',
  featureAllowed = () => true
}) {
  const [activeTab, setActiveTab] = useState('commentary'); // 'commentary' | 'nextsteps' | 'events' | 'portfolio' | 'quadrant' | 'simulator'
  const [eventSearch, setEventSearch] = useState('');
  const [nextStepEventTypeFilter, setNextStepEventTypeFilter] = useState('All');
  const [nextStepChannelFilter, setNextStepChannelFilter] = useState('All');
  const [nextStepEventFilter, setNextStepEventFilter] = useState('All');

  // Event-level Budget Simulator state
  const [simSelectedEvent, setSimSelectedEvent] = useState('All');
  const [simBaselineMode, setSimBaselineMode] = useState('actual'); // 'actual' | 'planned'
  const [budgetShifts, setBudgetShifts] = useState({});

  // Ensure all calculations use filteredAdData so global filters (date, channel, market, etc.) strictly apply
  const effectiveData = useMemo(() => {
    return filteredAdData && filteredAdData.length > 0 ? filteredAdData : allAdData;
  }, [filteredAdData, allAdData]);

  // AI Feedback & Dynamic Calibration State
  const [feedbackRules, setFeedbackRules] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('tahaluf_ai_feedback');
      return saved ? JSON.parse(saved).rules || {} : {};
    } catch {
      return {};
    }
  });

  const [feedbackRatings, setFeedbackRatings] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('tahaluf_ai_feedback');
      return saved ? JSON.parse(saved).ratings || {} : {};
    } catch {
      return {};
    }
  });

  const [showTuningPanel, setShowTuningPanel] = useState(false);
  const [feedbackInputText, setFeedbackInputText] = useState('');
  const [feedbackSuccessMsg, setFeedbackSuccessMsg] = useState('');

  const handleRating = (id, rating) => {
    const nextRatings = { ...feedbackRatings, [id]: rating };
    setFeedbackRatings(nextRatings);
    try {
      localStorage.setItem('tahaluf_ai_feedback', JSON.stringify({ rules: feedbackRules, ratings: nextRatings }));
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_feedback', category: 'intelligence', details: { id, rating } })
      }).catch(() => {});
    } catch {}
  };

  const handleApplyTuning = (key, value) => {
    const nextRules = { ...feedbackRules, [key]: value };
    setFeedbackRules(nextRules);
    try {
      localStorage.setItem('tahaluf_ai_feedback', JSON.stringify({ rules: nextRules, ratings: feedbackRatings }));
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_tuning_applied', category: 'intelligence', details: { key, value } })
      }).catch(() => {});
    } catch {}
  };

  const handleDismiss = (id) => {
    const nextDismissed = Array.from(new Set([...(feedbackRules.dismissedIds || []), id]));
    handleApplyTuning('dismissedIds', nextDismissed);
  };

  const handleDeprioritizeChannel = (channelName) => {
    const nextDep = Array.from(new Set([...(feedbackRules.deprioritizedChannels || []), channelName]));
    handleApplyTuning('deprioritizedChannels', nextDep);
  };

  const handleTextFeedbackSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!feedbackInputText.trim()) return;

    const parsed = parseFeedbackText(feedbackInputText);
    const updatedRules = { ...feedbackRules, ...parsed };
    if (parsed.deprioritizeChannel) {
      updatedRules.deprioritizedChannels = Array.from(new Set([...(updatedRules.deprioritizedChannels || []), parsed.deprioritizeChannel]));
      delete updatedRules.deprioritizeChannel;
    }
    
    setFeedbackRules(updatedRules);
    try {
      localStorage.setItem('tahaluf_ai_feedback', JSON.stringify({ rules: updatedRules, ratings: feedbackRatings }));
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_text_feedback', category: 'intelligence', details: { text: feedbackInputText, appliedRules: parsed } })
      }).catch(() => {});
    } catch {}

    const appliedChanges = Object.keys(parsed).map(k => {
      if (k === 'preferChannel') return `Boosted ${parsed[k]}`;
      if (k === 'deprioritizeChannel') return `Deprioritized ${parsed[k]}`;
      if (k === 'targetStrictness') return `CPA sensitivity: ${parsed[k]}`;
      if (k === 'riskTolerance') return `Risk tolerance: ${parsed[k]}`;
      if (k === 'lowerFunnelFocus') return 'Lower-funnel conversion priority';
      if (k === 'scaleFocus') return 'Reach & awareness scale priority';
      return k;
    }).join(', ');

    setFeedbackSuccessMsg(appliedChanges ? `AI Calibrated: ${appliedChanges}` : 'Feedback actioned and calibrated into AI heuristics.');
    setFeedbackInputText('');
    setTimeout(() => setFeedbackSuccessMsg(''), 5000);
  };

  const handleResetFeedback = () => {
    setFeedbackRules({});
    setFeedbackRatings({});
    try {
      localStorage.removeItem('tahaluf_ai_feedback');
    } catch {}
    setFeedbackSuccessMsg('AI Calibration reset to system defaults.');
    setTimeout(() => setFeedbackSuccessMsg(''), 4000);
  };

  const activeRuleCount = useMemo(() => {
    let count = 0;
    if (feedbackRules.riskTolerance && feedbackRules.riskTolerance !== 'balanced') count++;
    if (feedbackRules.targetStrictness && feedbackRules.targetStrictness !== 'balanced') count++;
    if (feedbackRules.preferChannel) count++;
    if (feedbackRules.deprioritizedChannels?.length) count += feedbackRules.deprioritizedChannels.length;
    if (feedbackRules.lowerFunnelFocus) count++;
    if (feedbackRules.scaleFocus) count++;
    if (feedbackRules.dismissedIds?.length) count += feedbackRules.dismissedIds.length;
    return count;
  }, [feedbackRules]);

  // 1. Strategic Commentary for current scope
  const commentaryInsights = useMemo(() => {
    return generateStrategicCommentary(effectiveData, channelData, totals, exSym, exRate, formatShort, feedbackRules);
  }, [effectiveData, channelData, totals, exSym, exRate, formatShort, feedbackRules]);

  // 2. Events Strategic Breakdown
  const eventsBreakdown = useMemo(() => {
    return computeEventsBreakdown(effectiveData, exRate, exSym, formatShort);
  }, [effectiveData, exRate, exSym, formatShort]);

  // 3. Portfolio Strategic Breakdown
  const portfolioBreakdown = useMemo(() => {
    return computePortfolioBreakdown(effectiveData, exRate, exSym, formatShort);
  }, [effectiveData, exRate, exSym, formatShort]);

  // 4. Daily Next Steps (by Event, Channel, and Event Type)
  const allDailyNextSteps = useMemo(() => {
    return computeDailyNextSteps(effectiveData, exRate, exSym, formatShort, feedbackRules);
  }, [effectiveData, exRate, exSym, formatShort, feedbackRules]);

  // 5. Channel Quadrant Matrix
  const { quadrants = { star: [], niche: [], cost_sink: [], observation: [] }, benchmarks = { medianSpend: 0, medianCPA: 0, channelCount: 0 } } = useMemo(() => {
    return computeChannelQuadrants(channelData) || {
      quadrants: { star: [], niche: [], cost_sink: [], observation: [] },
      benchmarks: { medianSpend: 0, medianCPA: 0, channelCount: 0 }
    };
  }, [channelData]);

  const starChannels = quadrants?.star || [];
  const nicheChannels = quadrants?.niche || [];
  const costSinkChannels = quadrants?.cost_sink || [];
  const observationChannels = quadrants?.observation || [];

  // 6. Planned Budget Analytics (from planning sheets)
  const plannedAnalytics = useMemo(() => {
    return computePlannedBudgetAnalytics(effectiveData, plannedData, exRate, exSym, formatShort) || {
      hasPlannedData: false,
      events: [],
      eventAnalytics: [],
      availableEvents: [],
      totalPlannedSpend: 0,
      totalActualSpend: 0,
      overallPacingPercent: 0,
      overallRemaining: 0
    };
  }, [effectiveData, plannedData, exRate, exSym, formatShort]);

  const availableEventsList = plannedAnalytics?.availableEvents || [];
  const eventAnalyticsList = plannedAnalytics?.eventAnalytics || plannedAnalytics?.events || [];

  // Selected event planned media budget info
  const selectedEventPlannedInfo = useMemo(() => {
    if (simSelectedEvent === 'All') return null;
    return eventAnalyticsList.find(
      e => (e.eventName || '').toLowerCase() === simSelectedEvent.toLowerCase()
    ) || null;
  }, [simSelectedEvent, eventAnalyticsList]);

  // 7. Event-Level Channel Data for Budget Simulator
  const simChannelData = useMemo(() => {
    if (simSelectedEvent === 'All') {
      return channelData;
    }
    const eventRows = effectiveData.filter(d => (d.eventNameDB || '').trim() === simSelectedEvent);
    if (!eventRows.length) return [];

    const map = new Map();
    eventRows.forEach(r => {
      const ch = r.channel || 'Unknown';
      const spend = (Number(r.cost) || Number(r.spend) || 0) * exRate;
      const imps = Number(r.impressions || 0);
      const clicks = Number(r.clicks || 0);
      const purchases = Number(r.purchases || r.conversions || 0);

      if (!map.has(ch)) {
        map.set(ch, { channel: ch, name: ch, cost: 0, spend: 0, impressions: 0, clicks: 0, purchases: 0 });
      }
      const item = map.get(ch);
      item.cost += (Number(r.cost) || Number(r.spend) || 0);
      item.spend += spend;
      item.impressions += imps;
      item.clicks += clicks;
      item.purchases += purchases;
    });

    return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
  }, [simSelectedEvent, effectiveData, channelData, exRate]);

  // 8. Budget Simulation (Event-aware + Planned Budget baseline support)
  const simulationResults = useMemo(() => {
    const plannedBudgetByChannel = selectedEventPlannedInfo?.plannedBudgetByChannel || null;
    return simulateBudgetReallocation(simChannelData, budgetShifts, plannedBudgetByChannel, simBaselineMode);
  }, [simChannelData, budgetShifts, selectedEventPlannedInfo, simBaselineMode]);

  const handleShiftChange = (channelName, percent) => {
    setBudgetShifts(prev => ({
      ...prev,
      [channelName]: Number(percent)
    }));
  };

  const handleResetShifts = () => {
    setBudgetShifts({});
  };

  const activeShiftCount = Object.values(budgetShifts).filter(v => v !== 0).length;

  const displayTopChannel = topChannel || (channelData.length > 0 ? channelData[0] : null);
  const displayLowestCPM = lowestCPMChannel || (channelData.length > 0 ? [...channelData].filter(c => c.cpm > 0).sort((a, b) => a.cpm - b.cpm)[0] : null);
  const displayHighestCTR = highestCTRChannel || (channelData.length > 0 ? [...channelData].filter(c => c.impressions > 0).sort((a, b) => b.ctr - a.ctr)[0] : null);

  const scopeLabel = activeScope?.type === 'event' 
    ? `Event: ${activeScope.name}`
    : activeScope?.type === 'portfolio'
      ? `Portfolio: ${activeScope.name}`
      : activeScope?.type === 'multi-event'
        ? `Scope: ${activeScope.name}`
        : 'All Events Portfolio';

  const isScoped = activeScope?.type === 'event' || activeScope?.type === 'portfolio' || activeScope?.type === 'multi-event';

  const filteredEventsBreakdown = useMemo(() => {
    if (!eventSearch.trim()) return eventsBreakdown;
    const term = eventSearch.toLowerCase();
    return eventsBreakdown.filter(ev => 
      ev.name.toLowerCase().includes(term) || 
      ev.topChannel.toLowerCase().includes(term) ||
      ev.portfolio.toLowerCase().includes(term)
    );
  }, [eventsBreakdown, eventSearch]);

  // Unique filters for Daily Next Steps tab
  const nextStepAvailableEvents = useMemo(() => {
    return Array.from(new Set(allDailyNextSteps.map(s => s.event))).sort();
  }, [allDailyNextSteps]);

  const nextStepAvailableChannels = useMemo(() => {
    return Array.from(new Set(allDailyNextSteps.map(s => s.channel))).sort();
  }, [allDailyNextSteps]);

  const nextStepAvailableEventTypes = useMemo(() => {
    return Array.from(new Set(allDailyNextSteps.map(s => s.eventType))).sort();
  }, [allDailyNextSteps]);

  const filteredDailyNextSteps = useMemo(() => {
    return allDailyNextSteps.filter(s => {
      if (nextStepEventFilter !== 'All' && s.event !== nextStepEventFilter) return false;
      if (nextStepChannelFilter !== 'All' && s.channel !== nextStepChannelFilter) return false;
      if (nextStepEventTypeFilter !== 'All' && s.eventType !== nextStepEventTypeFilter) return false;
      return true;
    });
  }, [allDailyNextSteps, nextStepEventFilter, nextStepChannelFilter, nextStepEventTypeFilter]);

  return (
    <div className="card-surface p-5 sm:p-6 rounded-3xl border border-[#cedc28]/35 bg-gradient-to-r from-[#0a2442]/95 via-[#071b2e] to-[#041628] shadow-2xl relative overflow-hidden export-slide" data-title="AI Strategic Intelligence">
      <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none opacity-20"></div>

      <div className="relative z-10 flex flex-col gap-5">
        {/* Header & Scope Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#cedc28]/15 border border-[#cedc28]/40 text-[#cedc28] shadow-sm shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  AI Strategic Briefing
                </h3>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#14a6d9]/20 text-[#14a6d9] border border-[#14a6d9]/40">
                  {userRole === 'admin' ? 'Executive Analysis' : 'Intelligence Brief'}
                </span>
                
                <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                  isScoped
                    ? 'bg-[#cedc28]/20 text-[#cedc28] border-[#cedc28]/50 shadow-[0_0_8px_rgba(206,220,40,0.25)]'
                    : 'bg-white/10 text-slate-300 border-white/20'
                }`}>
                  <Filter className="w-2.5 h-2.5" />
                  <span>{scopeLabel}</span>
                  {isScoped && onResetScope && (
                    <button 
                      onClick={onResetScope} 
                      className="ml-1 text-slate-400 hover:text-white transition-colors"
                      title="Reset filter to All Events"
                    >
                      <XCircle className="w-3 h-3 text-[#cedc28] hover:text-white" />
                    </button>
                  )}
                </span>

                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  100% Deterministic Engine
                </span>

                {Object.keys(feedbackRules).length > 0 && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#14a6d9]/20 text-[#14a6d9] border border-[#14a6d9]/40 flex items-center gap-1.5 shadow-[0_0_8px_rgba(20,166,217,0.3)]">
                    <Sparkles className="w-2.5 h-2.5 text-[#14a6d9]" />
                    <span>AI Model Calibrated ({Object.keys(feedbackRules).length} active rule{Object.keys(feedbackRules).length > 1 ? 's' : ''})</span>
                    <button onClick={handleResetFeedback} className="ml-1 text-slate-400 hover:text-white" title="Reset feedback calibration">×</button>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#cedc28] font-medium mt-0.5">
                Real-time algorithmic synthesis across active paid channels and independent event pacing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* AI Feedback & Tuning Toggle Button */}
            <button
              type="button"
              onClick={() => setShowTuningPanel(!showTuningPanel)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shrink-0 ${
                showTuningPanel || activeRuleCount > 0
                  ? 'bg-[#14a6d9]/25 text-[#14a6d9] border-[#14a6d9]/60 shadow-[0_0_12px_rgba(20,166,217,0.35)]'
                  : 'bg-white/5 text-slate-300 border-white/15 hover:text-white hover:bg-white/10'
              }`}
              title="Calibrate AI intelligence algorithms with your feedback"
            >
              <Sliders className="w-3.5 h-3.5 text-[#14a6d9]" />
              <span className="hidden sm:inline">AI Tuning</span>
              {activeRuleCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#14a6d9] text-[#041628] text-[9px] font-black flex items-center justify-center">
                  {activeRuleCount}
                </span>
              )}
            </button>

            {/* View Switcher Tabs */}
            <div className="flex items-center bg-[#041628] p-1 rounded-xl border border-white/10 shadow-inner flex-wrap gap-1">
              <button
                onClick={() => setActiveTab('commentary')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'commentary'
                    ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_12px_rgba(206,220,40,0.35)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Executive Brief</span>
              </button>

              <button
                onClick={() => setActiveTab('nextsteps')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'nextsteps'
                    ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_12px_rgba(206,220,40,0.35)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ListTodo className="w-3.5 h-3.5" />
                <span>Daily Next Steps</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[9px] font-mono">
                  {allDailyNextSteps.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('events')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'events'
                    ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_12px_rgba(206,220,40,0.35)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Event Breakdown</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[9px] font-mono">
                  {eventsBreakdown.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('portfolio')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'portfolio'
                    ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_12px_rgba(206,220,40,0.35)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <PieChart className="w-3.5 h-3.5" />
                <span>Portfolio Breakdown</span>
              </button>

              {featureAllowed('channelQuadrant') && (
                <button
                  onClick={() => setActiveTab('quadrant')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeTab === 'quadrant'
                      ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_12px_rgba(206,220,40,0.35)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Efficiency Matrix</span>
                </button>
              )}

              {featureAllowed('budgetSimulator') && (
                <button
                  onClick={() => setActiveTab('simulator')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeTab === 'simulator'
                      ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_12px_rgba(206,220,40,0.35)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Budget Simulator</span>
                  {activeShiftCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-[#cedc28] text-[#1a302e] text-[9px] flex items-center justify-center font-black">
                      {activeShiftCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* MODEL CALIBRATION & INTERACTIVE FEEDBACK PANEL */}
        {showTuningPanel && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#041628]/95 border border-[#14a6d9]/40 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#14a6d9]" />
                <h4 className="text-xs font-black uppercase text-white tracking-wider">
                  AI Model Feedback &amp; Heuristics Calibration
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#14a6d9]/20 text-[#14a6d9] border border-[#14a6d9]/40 font-mono">
                  {activeRuleCount} Rule{activeRuleCount === 1 ? '' : 's'} Active
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetFeedback}
                  className="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  Reset AI Defaults
                </button>
                <button
                  type="button"
                  onClick={() => setShowTuningPanel(false)}
                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {feedbackSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{feedbackSuccessMsg}</span>
              </div>
            )}

            {/* Quick Calibration Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. Target CPA Sensitivity */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target CPA Strictness</div>
                  <p className="text-[11px] text-slate-300 mb-2.5">Controls when high CPA anomaly warnings trigger on paid channels.</p>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    ['strict', 'Strict ($50)'],
                    ['balanced', 'Normal ($65)'],
                    ['relaxed', 'Relaxed ($85+)']
                  ].map(([val, lbl]) => {
                    const isActive = (feedbackRules.targetStrictness || 'balanced') === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleApplyTuning('targetStrictness', val)}
                        className={`py-1 text-[10px] rounded font-bold border transition-all ${
                          isActive
                            ? 'bg-[#cedc28] text-[#041628] border-[#cedc28] shadow-sm'
                            : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Pacing Risk Profile */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pacing Risk Profile</div>
                  <p className="text-[11px] text-slate-300 mb-2.5">Determines budget shift aggressiveness and pacing warning margins.</p>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    ['conservative', 'Careful (+10%)'],
                    ['balanced', 'Balanced'],
                    ['aggressive', 'Aggressive']
                  ].map(([val, lbl]) => {
                    const isActive = (feedbackRules.riskTolerance || 'balanced') === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleApplyTuning('riskTolerance', val)}
                        className={`py-1 text-[10px] rounded font-bold border transition-all ${
                          isActive
                            ? 'bg-[#cedc28] text-[#041628] border-[#cedc28] shadow-sm'
                            : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Strategic Objective Priority */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Strategic Objective</div>
                  <p className="text-[11px] text-slate-300 mb-2.5">Ranks tactical recommendations towards registrations vs top-of-funnel reach.</p>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      handleApplyTuning('lowerFunnelFocus', !feedbackRules.lowerFunnelFocus);
                      if (!feedbackRules.lowerFunnelFocus) handleApplyTuning('scaleFocus', false);
                    }}
                    className={`py-1 text-[10px] rounded font-bold border transition-all ${
                      feedbackRules.lowerFunnelFocus
                        ? 'bg-[#14a6d9] text-[#041628] border-[#14a6d9] shadow-sm'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    🎯 Lower Funnel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleApplyTuning('scaleFocus', !feedbackRules.scaleFocus);
                      if (!feedbackRules.scaleFocus) handleApplyTuning('lowerFunnelFocus', false);
                    }}
                    className={`py-1 text-[10px] rounded font-bold border transition-all ${
                      feedbackRules.scaleFocus
                        ? 'bg-[#14a6d9] text-[#041628] border-[#14a6d9] shadow-sm'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    📢 Reach &amp; Scale
                  </button>
                </div>
              </div>
            </div>

            {/* Natural Language Feedback Input Box */}
            <form onSubmit={handleTextFeedbackSubmit} className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/10">
              <input
                type="text"
                value={feedbackInputText}
                onChange={(e) => setFeedbackInputText(e.target.value)}
                placeholder="Type instructions to improve AI (e.g., 'focus more on Google Search', 'relax CPA', 'conservative pacing')..."
                className="flex-1 px-3 py-2 rounded-xl bg-[#0a2442] border border-white/15 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#cedc28]"
              />
              <button
                type="submit"
                disabled={!feedbackInputText.trim()}
                className="px-4 py-2 rounded-xl bg-[#cedc28] text-[#041628] font-bold text-xs uppercase tracking-wider hover:bg-[#e0f030] transition-colors disabled:opacity-40 shrink-0 shadow-md cursor-pointer"
              >
                Action Feedback
              </button>
            </form>
          </div>
        )}

        {/* 4 PROVEN STRATEGIC KPI CARDS - ALWAYS PRESENT & SCOPED */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#041628]/80 border border-white/10 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Top Volume Driver</div>
            <div className="text-base font-extrabold text-white truncate">
              {displayTopChannel?.channel || displayTopChannel?.name || 'Multi-Channel'}
            </div>
            <p className="text-[10px] text-[#14a6d9] mt-0.5 font-medium">
              {displayTopChannel 
                ? `${exSym}${formatShort(displayTopChannel.spend || displayTopChannel.cost * exRate || 0)} delivered` 
                : 'Awaiting spend'}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#041628]/80 border border-white/10 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Efficiency Leader</div>
            <div className="text-base font-extrabold text-[#cedc28] truncate">
              {displayLowestCPM?.channel || displayLowestCPM?.name || 'Dynamic'}
            </div>
            <p className="text-[10px] text-slate-300 mt-0.5 font-medium">
              {displayLowestCPM ? `${exSym}${displayLowestCPM.cpm.toFixed(2)} lowest CPM` : 'Analyzing CPM'}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#041628]/80 border border-white/10 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Engagement Pace</div>
            <div className="text-base font-extrabold text-emerald-300 truncate">
              {displayHighestCTR?.channel || displayHighestCTR?.name || 'Optimal'}
            </div>
            <p className="text-[10px] text-slate-300 mt-0.5 font-medium">
              {displayHighestCTR ? `${displayHighestCTR.ctr.toFixed(2)}% peak CTR` : 'Analyzing CTR'}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#041628]/80 border border-white/10 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Daily Spend Pace</div>
            <div className="text-base font-extrabold text-[#14a6d9] truncate">
              {avgDailySpend > 0 ? `${exSym}${formatShort(avgDailySpend)}/day` : '—'}
            </div>
            <p className="text-[10px] text-slate-300 mt-0.5 font-medium">
              {peakSpendDay ? `Peak: ${peakSpendDay.date || peakSpendDay.day}` : 'Across campaign dates'}
            </p>
          </div>
        </div>

        {/* TAB 1: EXECUTIVE BRIEF COMMENTARY */}
        {activeTab === 'commentary' && (
          <div className="space-y-3 pt-1">
            {commentaryInsights.length === 0 ? (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-300 text-xs text-center font-medium">
                Awaiting active campaign delivery in current {activeScope?.name || 'scope'} date range.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {commentaryInsights.map((insight) => {
                  let badgeStyle = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
                  let Icon = Lightbulb;
                  if (insight.type === 'opportunity') {
                    badgeStyle = 'bg-[#cedc28]/20 text-[#cedc28] border-[#cedc28]/40';
                    Icon = TrendingUp;
                  } else if (insight.type === 'alert') {
                    badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                    Icon = AlertTriangle;
                  } else if (insight.type === 'efficiency') {
                    badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                    Icon = CheckCircle2;
                  }

                  return (
                    <div
                      key={insight.id}
                      className="p-3.5 rounded-2xl bg-[#041628]/85 border border-white/10 hover:border-white/20 transition-all shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${badgeStyle}`}>
                            <Icon className="w-2.5 h-2.5" />
                            {insight.badge}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Impact: {insight.impactScore}/100
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-white mb-1 leading-snug">
                          {insight.headline}
                        </h4>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                          {insight.detail}
                        </p>
                      </div>

                      {/* AI Feedback & Interactive Tuning */}
                      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Feedback:</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRating(insight.id, 'helpful')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                              feedbackRatings[insight.id] === 'helpful'
                                ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                                : 'text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                            title="Mark as helpful & accurate"
                          >
                            👍 {feedbackRatings[insight.id] === 'helpful' ? 'Accurate' : 'Helpful'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRating(insight.id, 'tune')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                              feedbackRatings[insight.id] === 'tune'
                                ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                                : 'text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                            title="Tune algorithmic calibration"
                          >
                            👎 {feedbackRatings[insight.id] === 'tune' ? 'Tuned' : 'Tune'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismiss(insight.id)}
                            className="text-slate-400 hover:text-rose-400 transition-colors ml-1 p-0.5 rounded text-[11px]"
                            title="Dismiss recommendation (code will not repeat this insight)"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {feedbackRatings[insight.id] === 'tune' && (
                        <div className="mt-2 pt-2 border-t border-amber-500/20 flex flex-wrap gap-1 animate-in fade-in">
                          <span className="text-[9px] text-amber-300 w-full mb-0.5">Tune AI calibration for next recommendations:</span>
                          <button 
                            type="button"
                            onClick={() => handleApplyTuning('riskTolerance', 'conservative')} 
                            className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                              feedbackRules.riskTolerance === 'conservative'
                                ? 'bg-[#cedc28] text-[#1a302e] border-[#cedc28] font-bold'
                                : 'bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/30'
                            }`}
                          >
                            Conservative pacing (+10%)
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleApplyTuning('targetStrictness', 'relaxed')} 
                            className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                              feedbackRules.targetStrictness === 'relaxed'
                                ? 'bg-[#cedc28] text-[#1a302e] border-[#cedc28] font-bold'
                                : 'bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/30'
                            }`}
                          >
                            Relax CPA threshold ($85)
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleApplyTuning('lowerFunnelFocus', true)} 
                            className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                              feedbackRules.lowerFunnelFocus === true
                                ? 'bg-[#cedc28] text-[#1a302e] border-[#cedc28] font-bold'
                                : 'bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/30'
                            }`}
                          >
                            Prioritize conversion steps
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Planned Media Plan Pacing Section (when available) */}
            {plannedAnalytics.hasPlannedData && eventAnalyticsList.length > 0 && (
              <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-[#0a2442] via-[#041628] to-[#0a2442] border border-cyan-500/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Media Plan Budget Pacing Intelligence
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({availableEventsList.length} events with planned budgets)
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-cyan-300">
                    Total Plan: {exSym}{formatShort(plannedAnalytics.totalPlannedSpend)} | Overall Pacing: {plannedAnalytics.overallPacingPercent}%
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {eventAnalyticsList.map(ep => (
                    <div key={ep.eventName} className="p-3 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-bold text-white truncate">{ep.eventName}</span>
                        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                          ep.pacingPercent > 100 
                            ? 'bg-rose-500/20 text-rose-300' 
                            : ep.pacingPercent >= 75 
                              ? 'bg-amber-500/20 text-amber-300' 
                              : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {ep.pacingPercent}%
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono space-y-0.5">
                        <div className="flex justify-between">
                          <span>Target:</span>
                          <span className="text-slate-200">{exSym}{formatShort(ep.plannedSpend)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Delivered:</span>
                          <span className="text-slate-200">{exSym}{formatShort(ep.actualSpend)}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-0.5">
                          <span>Runway:</span>
                          <span className="text-emerald-400 font-bold">{exSym}{formatShort(ep.remainingBudget)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DAILY NEXT STEPS (By Event, Channel & Event Type) */}
        {activeTab === 'nextsteps' && (
          <div className="space-y-4 pt-1">
            {/* Filter Bar for Next Steps */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 bg-black/30 p-3 rounded-2xl border border-white/10">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#cedc28]" />
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Daily Tactical Actions:
                </span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {filteredDailyNextSteps.length} of {allDailyNextSteps.length} active action paths
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Event Filter */}
                <select
                  value={nextStepEventFilter}
                  onChange={(e) => setNextStepEventFilter(e.target.value)}
                  className="bg-[#0a2442] text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-white/15 outline-none"
                >
                  <option value="All">All Events</option>
                  {nextStepAvailableEvents.map(ev => (
                    <option key={ev} value={ev}>{ev}</option>
                  ))}
                </select>

                {/* Channel Filter */}
                <select
                  value={nextStepChannelFilter}
                  onChange={(e) => setNextStepChannelFilter(e.target.value)}
                  className="bg-[#0a2442] text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-white/15 outline-none"
                >
                  <option value="All">All Channels</option>
                  {nextStepAvailableChannels.map(ch => (
                    <option key={ch} value={ch}>{ch}</option>
                  ))}
                </select>

                {/* Event Type Filter (Exprom, Visprom, etc.) */}
                <select
                  value={nextStepEventTypeFilter}
                  onChange={(e) => setNextStepEventTypeFilter(e.target.value)}
                  className="bg-[#0a2442] text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-white/15 outline-none"
                >
                  <option value="All">All Event Types</option>
                  {nextStepAvailableEventTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Next Steps Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredDailyNextSteps.map((step) => (
                <div
                  key={step.id}
                  className="p-4 rounded-2xl bg-[#041628]/90 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Event + Channel + Event Type + Priority */}
                    <div className="flex items-start justify-between gap-2 pb-2 mb-2.5 border-b border-white/10">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-extrabold text-white">{step.event}</span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg bg-[#14a6d9]/20 text-[#14a6d9] border border-[#14a6d9]/40">
                            {step.channel}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            {step.eventType}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-1">
                          Spend: {exSym}{formatShort(step.spend)} | CTR: {step.ctr.toFixed(2)}% | Conv: {step.purchases.toLocaleString()}
                        </div>
                      </div>

                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border shrink-0 ${step.priorityColor}`}>
                        {step.priority}
                      </span>
                    </div>

                    {/* Action Step Directive */}
                    <div className="p-3 rounded-xl bg-black/35 border border-white/5 mb-2.5">
                      <div className="text-[10px] font-bold text-[#cedc28] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Action Item ({step.actionType})</span>
                      </div>
                      <p className="text-xs text-white leading-relaxed font-semibold">
                        {step.dailyAction}
                      </p>
                    </div>

                    {/* Rationale */}
                    <p className="text-[11px] text-slate-300 italic">
                      <span className="text-slate-400 not-italic font-medium">Why: </span>{step.rationale}
                    </p>
                  </div>

                  {/* 1-click Filter Button and Tactical Feedback */}
                  <div className="pt-2.5 mt-2.5 border-t border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleRating(step.id, 'helpful')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                          feedbackRatings[step.id] === 'helpful'
                            ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                            : 'text-slate-400 hover:text-white hover:bg-white/10'
                        }`}
                        title="Mark step as high relevance"
                      >
                        👍 {feedbackRatings[step.id] === 'helpful' ? 'Actioned' : 'Helpful'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRating(step.id, 'tune')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                          feedbackRatings[step.id] === 'tune'
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                            : 'text-slate-400 hover:text-white hover:bg-white/10'
                        }`}
                        title="Tune AI weighting for this channel"
                      >
                        👎 {feedbackRatings[step.id] === 'tune' ? 'Adjusted' : 'Tune'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(step.id)}
                        className="text-slate-400 hover:text-rose-400 transition-colors ml-1 p-0.5 rounded text-[11px]"
                        title="Dismiss action item (code will not repeat this item)"
                      >
                        ✕
                      </button>
                    </div>

                    {onSelectEvent && (
                      <button
                        onClick={() => onSelectEvent(step.event)}
                        className="text-[11px] font-bold text-[#14a6d9] hover:text-[#cedc28] transition-colors flex items-center gap-1"
                      >
                        <span>Focus on {step.event}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {feedbackRatings[step.id] === 'tune' && (
                    <div className="mt-2 pt-2 border-t border-amber-500/20 flex flex-wrap gap-1 animate-in fade-in">
                      <span className="text-[9px] text-amber-300 w-full mb-0.5">Adjust heuristics for {step.channel}:</span>
                      <button 
                        type="button"
                        onClick={() => handleDeprioritizeChannel(step.channel)} 
                        className="text-[9px] px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors"
                      >
                        Deprioritize {step.channel}
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleApplyTuning('lowerFunnelFocus', true)} 
                        className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                          feedbackRules.lowerFunnelFocus ? 'bg-[#cedc28] text-[#1a302e] font-bold border-[#cedc28]' : 'bg-amber-500/20 text-amber-200 border-amber-500/30'
                        }`}
                      >
                        Prioritize Conversions
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleApplyTuning('targetStrictness', 'relaxed')} 
                        className="text-[9px] px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors"
                      >
                        Relax CPA
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: EVENTS BREAKDOWN */}
        {activeTab === 'events' && (
          <div className="space-y-4 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 bg-black/30 p-3 rounded-2xl border border-white/10">
              <div className="flex items-center gap-3">
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Independent Event Intelligence:
                </span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {eventsBreakdown.length} events scoped to current filters
                </span>
              </div>
              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Filter events or channels..."
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  className="w-full bg-[#0a2442] text-white text-xs px-3 py-1.5 rounded-xl border border-white/10 outline-none focus:border-[#cedc28]/60"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredEventsBreakdown.map(ev => {
                const isSelected = activeScope?.type === 'event' && activeScope?.name === ev.name;
                let statusBadge = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
                if (ev.statusType === 'success') statusBadge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                else if (ev.statusType === 'highlight') statusBadge = 'bg-[#cedc28]/20 text-[#cedc28] border-[#cedc28]/40';
                else if (ev.statusType === 'primary') statusBadge = 'bg-[#14a6d9]/20 text-[#14a6d9] border-[#14a6d9]/40';
                else if (ev.statusType === 'warning') statusBadge = 'bg-amber-500/20 text-amber-300 border-amber-500/40';

                return (
                  <div
                    key={ev.id}
                    className={`p-4 rounded-2xl transition-all flex flex-col justify-between ${
                      isSelected 
                        ? 'bg-[#0a2442] border-2 border-[#cedc28] shadow-[0_0_20px_rgba(206,220,40,0.25)]' 
                        : 'bg-[#041628]/85 border border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div>
                      {/* Event Header */}
                      <div className="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-white/10">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-extrabold text-white">{ev.name}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-mono">
                              {ev.portfolio}
                            </span>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border inline-block mt-1 ${statusBadge}`}>
                            {ev.status}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-[#cedc28] font-mono">
                            {exSym}{formatShort(ev.spend)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {ev.spendShare.toFixed(1)}% portfolio share
                          </div>
                        </div>
                      </div>

                      {/* Performance Grid */}
                      <div className="grid grid-cols-3 gap-2 py-2 text-center bg-black/25 rounded-xl border border-white/5 mb-3 font-mono text-xs">
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Top Channel</div>
                          <div className="text-white font-bold truncate text-[11px]">{ev.topChannel}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">CTR / CPM</div>
                          <div className="text-emerald-300 font-bold text-[11px]">{ev.ctr.toFixed(2)}% <span className="text-slate-400 font-normal">/ {exSym}{ev.cpm.toFixed(1)}</span></div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">CPA / Conv</div>
                          <div className="text-[#14a6d9] font-bold text-[11px]">
                            {ev.cpa > 0 ? `${exSym}${ev.cpa.toFixed(1)}` : '—'} <span className="text-slate-400 font-normal">({Math.round(ev.purchases).toLocaleString()})</span>
                          </div>
                        </div>
                      </div>

                      {/* Strategic Recommendation */}
                      <p className="text-[11px] text-slate-300 leading-snug mb-3">
                        {ev.recommendation}
                      </p>
                    </div>

                    {/* Action: 1-click Filter to this Event */}
                    {onSelectEvent && (
                      <div className="pt-2 border-t border-white/10">
                        {isSelected ? (
                          <button
                            onClick={onResetScope}
                            className="w-full py-1.5 px-3 rounded-xl bg-[#cedc28]/20 border border-[#cedc28] text-[#cedc28] text-xs font-bold hover:bg-[#cedc28]/30 transition-all flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Currently Focused (Click to View All)</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onSelectEvent(ev.name)}
                            className="w-full py-1.5 px-3 rounded-xl bg-white/5 hover:bg-[#cedc28] hover:text-[#1a302e] text-slate-300 text-xs font-bold border border-white/10 hover:border-[#cedc28] transition-all flex items-center justify-center gap-1.5 group"
                          >
                            <span>Focus Dashboard on {ev.name}</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: PORTFOLIO BREAKDOWN */}
        {activeTab === 'portfolio' && (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {portfolioBreakdown.map(p => {
                const isSelected = activeScope?.type === 'portfolio' && activeScope?.name === p.key;

                return (
                  <div
                    key={p.id}
                    className={`p-5 rounded-2xl flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'bg-[#0a2442] border-2 border-[#cedc28] shadow-[0_0_25px_rgba(206,220,40,0.25)]'
                        : 'bg-[#041628]/90 border border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between pb-3 mb-3 border-b border-white/10">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-white">{p.name}</span>
                            <span className="px-2 py-0.5 rounded-full bg-[#14a6d9]/20 text-[#14a6d9] border border-[#14a6d9]/40 text-[10px] font-bold">
                              {p.eventCount} Events
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Primary Channel: <span className="text-white font-bold">{p.topChannel}</span>
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <div className="text-lg font-extrabold text-[#cedc28]">
                            {exSym}{formatShort(p.spend)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {p.spendShare.toFixed(1)}% of total portfolio spend
                          </div>
                        </div>
                      </div>

                      {/* Share Progress Bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                          <span>Portfolio Budget Share</span>
                          <span>{p.spendShare.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden border border-white/10">
                          <div 
                            className="h-full rounded-full bg-gradient-to-r from-[#cedc28] to-[#14a6d9]" 
                            style={{ width: `${Math.min(100, p.spendShare)}%` }}
                          />
                        </div>
                      </div>

                      {/* Metrics Strip */}
                      <div className="grid grid-cols-4 gap-2 py-2.5 px-3 rounded-xl bg-black/30 border border-white/5 font-mono text-center mb-3">
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Impressions</div>
                          <div className="text-white font-bold text-xs">{formatShort(p.impressions)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Clicks (CTR)</div>
                          <div className="text-emerald-300 font-bold text-xs">{p.ctr.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Blended CPM</div>
                          <div className="text-[#14a6d9] font-bold text-xs">{exSym}{p.cpm.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase">Conversions</div>
                          <div className="text-[#cedc28] font-bold text-xs">{Math.round(p.purchases).toLocaleString()}</div>
                        </div>
                      </div>

                      {/* Included Events Badges */}
                      <div className="mb-4">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5 font-bold">
                          Assigned Events:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {p.eventList.map(ev => (
                            <span 
                              key={ev} 
                              onClick={() => onSelectEvent && onSelectEvent(ev)}
                              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-[#cedc28]/20 hover:text-[#cedc28] text-slate-300 text-[10px] font-bold cursor-pointer transition-colors border border-white/10"
                              title={`Focus on ${ev}`}
                            >
                              {ev}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Recommendation */}
                      <p className="text-[11px] text-slate-300 leading-relaxed mb-4">
                        {p.recommendation}
                      </p>
                    </div>

                    {/* Action: 1-click Filter to this Portfolio */}
                    {onSelectPortfolio && (
                      <div className="pt-3 border-t border-white/10">
                        {isSelected ? (
                          <button
                            onClick={onResetScope}
                            className="w-full py-2 px-3 rounded-xl bg-[#cedc28]/20 border border-[#cedc28] text-[#cedc28] text-xs font-bold hover:bg-[#cedc28]/30 transition-all flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Currently Focused on {p.key} (Click to View All)</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onSelectPortfolio(p.key)}
                            className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-[#cedc28] hover:text-[#1a302e] text-slate-300 text-xs font-bold border border-white/10 hover:border-[#cedc28] transition-all flex items-center justify-center gap-1.5 group"
                          >
                            <span>Filter Dashboard to {p.name}</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: EFFICIENCY QUADRANT MATRIX */}
        {activeTab === 'quadrant' && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Classified {benchmarks.channelCount} active channels based on Spend Volume vs CPA:</span>
              <span className="font-mono text-[11px] text-[#14a6d9]">
                Median Spend: {exSym}{formatShort(benchmarks.medianSpend * exRate)} | Median CPA: {exSym}{benchmarks.medianCPA.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Star Performers */}
              <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-500/20">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                    <span>🌟 Star Performers</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200">Scale</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">{starChannels.length} channels</span>
                </div>
                {starChannels.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No channels qualifying in top volume &amp; high efficiency.</p>
                ) : (
                  <div className="space-y-2">
                    {starChannels.map(c => (
                      <div key={c.id} className="p-2.5 rounded-xl bg-black/40 border border-emerald-500/20 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-white">{c.name}</div>
                          <div className="text-[10px] text-slate-300">CPA: {exSym}{c.cpa.toFixed(2)} | Spend: {exSym}{formatShort(c.cost * exRate)}</div>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          {c.action}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Niche Drivers */}
              <div className="p-4 rounded-2xl bg-[#cedc28]/5 border border-[#cedc28]/30">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#cedc28]/20">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#cedc28]">
                    <span>💎 Niche Drivers</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#cedc28]/20 text-[#cedc28]">Invest</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#cedc28]">{nicheChannels.length} channels</span>
                </div>
                {nicheChannels.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No low-spend/high-efficiency channels found.</p>
                ) : (
                  <div className="space-y-2">
                    {nicheChannels.map(c => (
                      <div key={c.id} className="p-2.5 rounded-xl bg-black/40 border border-[#cedc28]/20 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-white">{c.name}</div>
                          <div className="text-[10px] text-slate-300">CPA: {exSym}{c.cpa.toFixed(2)} | Spend: {exSym}{formatShort(c.cost * exRate)}</div>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#cedc28]/20 text-[#cedc28]">
                          {c.action}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cost Sinks */}
              <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-rose-500/20">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                    <span>⚠️ Cost Sinks</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200">Refine</span>
                  </div>
                  <span className="text-[10px] font-mono text-rose-400">{costSinkChannels.length} channels</span>
                </div>
                {costSinkChannels.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Zero channels with high cost and low conversion efficiency.</p>
                ) : (
                  <div className="space-y-2">
                    {costSinkChannels.map(c => (
                      <div key={c.id} className="p-2.5 rounded-xl bg-black/40 border border-rose-500/20 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-white">{c.name}</div>
                          <div className="text-[10px] text-slate-300">CPA: {exSym}{c.cpa.toFixed(2)} | Spend: {exSym}{formatShort(c.cost * exRate)}</div>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                          {c.action}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Observation */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <span>🔍 Under Observation</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300">Audit</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{observationChannels.length} channels</span>
                </div>
                {observationChannels.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No low-volume channels under observation.</p>
                ) : (
                  <div className="space-y-2">
                    {observationChannels.map(c => (
                      <div key={c.id} className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-white">{c.name}</div>
                          <div className="text-[10px] text-slate-300">CPA: {exSym}{c.cpa.toFixed(2)} | Spend: {exSym}{formatShort(c.cost * exRate)}</div>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-white/10 text-slate-300">
                          {c.action}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: EVENT-AWARE BUDGET REALLOCATION SIMULATOR */}
        {activeTab === 'simulator' && (
          <div className="space-y-4 pt-1">
            {/* Event Scope Switcher for Simulator */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 bg-black/30 p-3 rounded-2xl border border-white/10">
              <div className="flex items-center gap-3">
                <Sliders className="w-4 h-4 text-[#cedc28]" />
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Simulation Scope:
                </span>
                <select
                  value={simSelectedEvent}
                  onChange={(e) => {
                    setSimSelectedEvent(e.target.value);
                    setBudgetShifts({});
                  }}
                  className="bg-[#0a2442] text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 outline-none focus:border-[#cedc28]"
                >
                  <option value="All">All Events (Combined Portfolio)</option>
                  {eventsBreakdown.map(ev => (
                    <option key={ev.name} value={ev.name}>{ev.name} ({exSym}{formatShort(ev.spend)})</option>
                  ))}
                </select>
              </div>

              {activeShiftCount > 0 && (
                <button
                  onClick={handleResetShifts}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-[10px] font-bold transition-all flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset Scenario</span>
                </button>
              )}
            </div>

            {/* Planned Media Plan Intelligence Banner for Selected Event */}
            {selectedEventPlannedInfo && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-[#0a2442] to-[#cedc28]/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Approved Media Plan Budget</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {selectedEventPlannedInfo.pacingPercent}% Paced
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 flex items-center gap-3 mt-0.5">
                      <span>Target: <strong className="text-white">{exSym}{formatShort(selectedEventPlannedInfo.plannedSpend)}</strong></span>
                      <span>Delivered: <strong className="text-slate-200">{exSym}{formatShort(selectedEventPlannedInfo.actualSpend)}</strong></span>
                      <span>Runway: <strong className="text-emerald-400">{exSym}{formatShort(selectedEventPlannedInfo.remainingBudget)}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Baseline Mode Toggle */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSimBaselineMode('actual')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      simBaselineMode === 'actual' 
                        ? 'bg-[#cedc28] text-[#041628] shadow-sm' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Delivered Spend Baseline
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimBaselineMode('planned')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      simBaselineMode === 'planned' 
                        ? 'bg-emerald-400 text-[#041628] shadow-sm' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Media Plan Target Baseline
                  </button>
                </div>
              </div>
            )}

            {/* Projection Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-black/40 border border-white/10 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Base Budget</span>
                <span className="text-slate-300 font-bold">
                  {exSym}{formatShort(simulationResults.totals.baselineCost * exRate)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Projected Spend</span>
                <span className="text-white font-bold">
                  {exSym}{formatShort(simulationResults.totals.simulatedCost * exRate)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Projected Conversions</span>
                <span className="text-emerald-400 font-bold">
                  {Math.round(simulationResults.totals.simulatedConversions).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Delta Gain</span>
                <span className={`font-bold ${simulationResults.totals.deltaConversions >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                  {simulationResults.totals.deltaConversions >= 0 ? '+' : ''}{Math.round(simulationResults.totals.deltaConversions).toLocaleString()} conv
                </span>
              </div>
            </div>

            {/* Channel Sliders */}
            <div className="space-y-3">
              {simulationResults.channels.map(ch => {
                const shiftVal = budgetShifts[ch.channel] || 0;
                return (
                  <div
                    key={ch.channel}
                    className="p-3.5 rounded-2xl bg-[#041628]/85 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="w-48 shrink-0">
                      <div className="text-xs font-bold text-white">{ch.channel}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Base: {exSym}{formatShort(ch.baseCost * exRate)} | CPA: {exSym}{ch.baseCPA.toFixed(2)}
                      </div>
                    </div>

                    <div className="flex-1 max-w-md flex items-center gap-3">
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        step="5"
                        value={shiftVal}
                        onChange={(e) => handleShiftChange(ch.channel, e.target.value)}
                        className="w-full accent-[#cedc28] h-1.5 bg-white/10 rounded-lg cursor-pointer"
                      />
                      <span className={`w-12 text-right font-mono text-xs font-bold ${
                        shiftVal > 0 ? 'text-emerald-400' : shiftVal < 0 ? 'text-rose-400' : 'text-slate-400'
                      }`}>
                        {shiftVal > 0 ? `+${shiftVal}%` : `${shiftVal}%`}
                      </span>
                    </div>

                    <div className="w-48 shrink-0 flex items-center justify-end gap-3 text-right font-mono text-xs">
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase">Simulated</div>
                        <div className="text-white font-bold">{exSym}{formatShort(ch.simCost * exRate)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase">Delta Conv</div>
                        <div className={`font-bold ${ch.deltaConv >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                          {ch.deltaConv >= 0 ? `+${Math.round(ch.deltaConv).toLocaleString()}` : Math.round(ch.deltaConv).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
