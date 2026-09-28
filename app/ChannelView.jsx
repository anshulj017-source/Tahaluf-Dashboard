'use client';

import { useState, useMemo } from 'react';
import InfoTooltip from './components/InfoTooltip';
import * as d3 from 'd3';
import { Eye, MousePointer2, Play, Activity, TrendingUp, BarChart3, Target, CheckCircle2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const COLORS = ['#74FA93', '#c88214', '#00937b', '#eef7f5', '#007542'];

export default function ChannelView({ adData, exRate = 1, exSym = '$', formatShort = (v) => v, userRole }) {
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState(userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'views'] : ['spend', 'impressions', 'clicks', 'ctr', 'cpm']);
  const [trendMetric, setTrendMetric] = useState(userRole === 'non-finance' ? 'impressions' : 'spend'); // spend, impressions, clicks, views

  const AVAILABLE_METRICS = useMemo(() => {
    const base = [
      { key: 'spend', label: 'Spend', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'impressions', label: 'Impressions', format: v => d3.format(",")(v) },
      { key: 'clicks', label: 'Clicks', format: v => d3.format(",")(v) },
      { key: 'views', label: 'Video Views', format: v => d3.format(",")(v) },
      { key: 'views6s', label: '6s Views', format: v => d3.format(",")(v) },
      { key: 'views15s', label: '15s Views', format: v => d3.format(",")(v) },
      { key: 'completions', label: 'Completed Views', format: v => d3.format(",")(v) },
      { key: 'purchases', label: 'Purchases', format: v => d3.format(",")(v) },
      { key: 'cpc', label: 'CPC', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'cpm', label: 'CPM', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'ctr', label: 'CTR', format: v => `${v.toFixed(2)}%` },
      { key: 'cpv', label: 'CPV', format: v => `${exSym}${d3.format(",.4f")(v * exRate)}` },
      { key: 'cpcv', label: 'CPCV', format: v => `${exSym}${d3.format(",.4f")(v * exRate)}` }
    ];
    if (userRole === 'non-finance') {
      return base.filter(m => !['spend', 'cpc', 'cpm', 'cpv', 'cpcv'].includes(m.key));
    }
    return base;
  }, [exRate, exSym, userRole]);

  // 1. Calculate overall channel aggregates for the top cards and grid
  const channelStats = useMemo(() => {
    if (!adData || adData.length === 0) return [];
    const grouped = d3.groups(adData, d => d.channel).map(([channel, vals]) => {
      const impressions = d3.sum(vals, d => d.impressions);
      const clicks = d3.sum(vals, d => d.clicks);
      const spend = d3.sum(vals, d => d.cost);
      const views = d3.sum(vals, d => d.videoViews);
      const purchases = d3.sum(vals, d => Number(d.purchases) || 0);
      
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : Infinity;
      const cpc = clicks > 0 ? (spend / clicks) : Infinity;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpv = views > 0 ? (spend / views) : Infinity;

      return {
        channel,
        spend,
        impressions,
        clicks,
        views,
        purchases,
        cpm,
        cpc,
        ctr,
        cpv,
        campaignsCount: new Set(vals.map(d => d.campaignName)).size
      };
    });
    return grouped.sort((a,b) => b.spend - a.spend);
  }, [adData]);

  // 2. Identify Top Performers for the "Trophy" cards
  const topCards = useMemo(() => {
    if (channelStats.length === 0) return null;
    
    const byImp = [...channelStats].sort((a, b) => b.impressions - a.impressions)[0];
    const byClicks = [...channelStats].sort((a, b) => b.clicks - a.clicks)[0];
    const byViews = [...channelStats].sort((a, b) => b.views - a.views)[0];
    
    const validCpc = channelStats.filter(c => c.clicks > 100 && c.cpc !== Infinity);
    const byEfficiency = validCpc.sort((a, b) => a.cpc - b.cpc)[0] || channelStats[0];

    return { impressions: byImp, clicks: byClicks, views: byViews, efficiency: byEfficiency };
  }, [channelStats]);

  // Handle Channel Selection
  const handleChannelToggle = (ch) => {
    if (selectedChannels.includes(ch)) {
      setSelectedChannels(selectedChannels.filter(c => c !== ch));
    } else {
      if (selectedChannels.length < 3) {
        setSelectedChannels([...selectedChannels, ch]);
      }
    }
  };

  // 3. Detailed stats for the SELECTED channels
  const selectedChannelData = useMemo(() => {
    if (selectedChannels.length === 0) return [];
    return adData.filter(d => selectedChannels.includes(d.channel));
  }, [selectedChannels, adData]);

  // 4. Month-by-month trend for the selected channels
  const trendData = useMemo(() => {
    if (selectedChannelData.length === 0) return [];
    
    const grouped = d3.groups(selectedChannelData, d => {
      if (!d.dateObj) return 'Unknown';
      return d3.timeFormat("%b %Y")(d.dateObj);
    });

    return grouped.map(([month, vals]) => {
      const row = { month, sortDate: vals[0].dateObj || new Date(0) };
      // Calculate metric for each selected channel
      selectedChannels.forEach(ch => {
        const chVals = vals.filter(v => v.channel === ch);
        let val = 0;
        if (trendMetric === 'spend') val = d3.sum(chVals, d => d.cost) * exRate;
        else if (trendMetric === 'impressions') val = d3.sum(chVals, d => d.impressions);
        else if (trendMetric === 'clicks') val = d3.sum(chVals, d => d.clicks);
        else if (trendMetric === 'views') val = d3.sum(chVals, d => d.videoViews);
        row[ch] = val;
      });
      return row;
    }).sort((a, b) => a.sortDate - b.sortDate);
  }, [selectedChannelData, exRate, selectedChannels, trendMetric]);

  // 5. Tournament breakdown (flattened)
  const campaignBreakdown = useMemo(() => {
    if (selectedChannelData.length === 0) return [];
    
    // Group by Channel -> Tournament
    const grouped = d3.groups(selectedChannelData, d => d.channel, d => d.campaignName);
    
    let flattened = [];
    grouped.forEach(([channel, campaigns]) => {
      campaigns.forEach(([campaign, vals]) => {
        const impressions = d3.sum(vals, d => d.impressions);
        const clicks = d3.sum(vals, d => d.clicks);
        const spend = d3.sum(vals, d => d.cost);
        const views = d3.sum(vals, d => d.videoViews);
        const views6s = d3.sum(vals, d => d.videoViews6s);
        const views15s = d3.sum(vals, d => d.videoViews15s);
        const completions = d3.sum(vals, d => d.videoCompletions);
        const purchases = d3.sum(vals, d => Number(d.purchases) || 0);
        
        flattened.push({
          channel,
          campaign,
          spend,
          impressions,
          clicks,
          views,
          views6s,
          views15s,
          completions,
          purchases,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          cpv: views > 0 ? spend / views : 0,
          cpcv: completions > 0 ? spend / completions : 0
        });
      });
    });
    return flattened.sort((a,b) => b.spend - a.spend);
  }, [selectedChannelData]);

  // Tournament chart data (pivot for stacked bars)
  const campaignChartData = useMemo(() => {
     if (selectedChannelData.length === 0) return [];
     const grouped = d3.groups(selectedChannelData, d => d.campaignName);
     return grouped.map(([campaign, vals]) => {
        const row = { campaign, totalSpend: d3.sum(vals, d => d.cost) };
        selectedChannels.forEach(ch => {
           row[ch] = d3.sum(vals.filter(v => v.channel === ch), d => d.cost) * exRate;
        });
        return row;
     }).sort((a,b) => b.totalSpend - a.totalSpend).slice(0, 7);
  }, [selectedChannelData, selectedChannels, exRate]);


  // Custom Tooltip for Trend Chart
  const TrendTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#011414] border border-[#c88214]/30 p-4 rounded-xl shadow-xl">
          <p className="text-white font-bold mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
              {entry.name}: {trendMetric === 'spend' ? `${exSym}${d3.format(",.2f")(entry.value)}` : d3.format(",")(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!channelStats || channelStats.length === 0) return <div className="text-white p-8">No channel data available.</div>;

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
      
      {/* HEADER & TOP CARDS (Hidden when exploring detailed view) */}
      {selectedChannels.length === 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black text-white flex items-center gap-3">
              <Activity className="text-[#c88214] w-8 h-8" /> Channel Overview
            </h2>
          </div>

          {topCards && (
            <div className={`grid grid-cols-1 md:grid-cols-2 ${userRole === 'non-finance' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`}>
              <div className="bg-[#011414] border border-[#c88214]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#c88214]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Eye className="w-32 h-32 text-white" /></div>
                <p className="text-[#6fa89f] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Eye className="w-4 h-4 text-[#c88214]"/> Top by Impressions</p>
                <p className="text-2xl font-black text-white truncate">{topCards.impressions.channel}</p>
                <p className="text-[#c88214] font-bold text-lg mt-2">{formatShort(topCards.impressions.impressions)} <span className="text-xs text-[#6fa89f] font-medium">Impressions</span></p>
              </div>
              
              <div className="bg-[#011414] border border-[#c88214]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#c88214]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><MousePointer2 className="w-32 h-32 text-white" /></div>
                <p className="text-[#6fa89f] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><MousePointer2 className="w-4 h-4 text-[#c88214]"/> Top by Clicks</p>
                <p className="text-2xl font-black text-white truncate">{topCards.clicks.channel}</p>
                <p className="text-[#c88214] font-bold text-lg mt-2">{formatShort(topCards.clicks.clicks)} <span className="text-xs text-[#6fa89f] font-medium">Clicks</span></p>
              </div>

              <div className="bg-[#011414] border border-[#c88214]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#c88214]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Play className="w-32 h-32 text-white" /></div>
                <p className="text-[#6fa89f] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Play className="w-4 h-4 text-[#c88214]"/> Top by Video Views</p>
                <p className="text-2xl font-black text-white truncate">{topCards.views.channel}</p>
                <p className="text-[#c88214] font-bold text-lg mt-2">{formatShort(topCards.views.views)} <span className="text-xs text-[#6fa89f] font-medium">Views</span></p>
              </div>

              {userRole !== 'non-finance' && (
                <div className="bg-gradient-to-br from-[#0C272D] to-[#113A42] border border-[#c88214]/40 rounded-2xl p-6 relative overflow-hidden group hover:border-[#c88214] transition-colors shadow-[0_0_15px_rgba(116,250,147,0.1)]">
                  <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Target className="w-32 h-32 text-[#c88214]" /></div>
                  <p className="text-[#6fa89f] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Target className="w-4 h-4 text-[#c88214]"/> Most Efficient</p>
                  <p className="text-2xl font-black text-white truncate">{topCards.efficiency.channel}</p>
                  <p className="text-[#c88214] font-bold text-lg mt-2">{exSym}{d3.format(",.2f")(topCards.efficiency.cpc * exRate)} <span className="text-xs text-[#6fa89f] font-medium">CPC</span></p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CHANNEL SELECTION GRID */}
      <div className={`card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 md:p-8 transition-all ${selectedChannels.length > 0 ? 'mt-0' : ''} export-slide`} data-title="Channel Top Stats">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-xl font-black text-white">Compare Channels</h3>
            <p className="text-sm text-[#6fa89f]">Select up to 3 channels to compare their performance.</p>
          </div>
          {selectedChannels.length > 0 && (
             <button 
                onClick={() => setSelectedChannels([])}
                className="text-xs font-bold uppercase tracking-widest text-[#c88214] hover:text-white bg-[#c88214]/10 hover:bg-[#74FA93]/20 px-4 py-2 rounded-full transition-colors"
             >
                Clear Selection
             </button>
          )}
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {channelStats.map((ch) => {
            const isSelected = selectedChannels.includes(ch.channel);
            const isDisabled = !isSelected && selectedChannels.length >= 3;
            return (
              <button 
                key={ch.channel}
                onClick={() => handleChannelToggle(ch.channel)}
                disabled={isDisabled}
                className={`border rounded-xl p-4 text-left transition-all duration-300 relative flex flex-col justify-between min-h-[100px]
                  ${isSelected ? 'bg-[#74FA93]/20 border-[#c88214] shadow-[0_0_15px_rgba(116,250,147,0.1)]' : 'bg-[#011414] border-[#c88214]/20'}
                  ${!isSelected && !isDisabled ? 'hover:bg-[#c88214]/10 hover:border-[#c88214]/60' : ''}
                  ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {isSelected && <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-[#c88214]" />}
                <div>
                  <h4 className={`text-base font-bold transition-colors line-clamp-1 ${isSelected ? 'text-[#c88214]' : 'text-white'}`}>{ch.channel}</h4>
                </div>
                <div className="mt-2">
                  <p className="text-[10px] text-[#6fa89f] uppercase tracking-wider">{userRole === 'non-finance' ? 'Clicks' : 'Spend'}</p>
                  <p className="text-sm font-black text-white">{userRole === 'non-finance' ? formatShort(ch.clicks) : `${exSym}${formatShort(ch.spend * exRate)}`}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* DETAILED DRILL-DOWN VIEW */}
      {selectedChannels.length > 0 && (
        <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
          
          {/* KPI MATRIX */}
          <div className="card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 overflow-hidden export-slide" data-title="Top Performing Campaigns">
             <h3 className="text-lg font-black text-white mb-6">Channel Performance Matrix</h3>
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b-2 border-[#c88214]/30">
                      <th className="px-4 py-3 text-xs font-black text-[#6fa89f] uppercase tracking-wider">Metric</th>
                      {selectedChannels.map(ch => (
                         <th key={ch} className="px-4 py-3 text-sm font-black text-[#c88214] uppercase tracking-wider text-right">{ch}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'views', 'purchases'] : ['spend', 'impressions', 'clicks', 'ctr', 'cpm', 'purchases']).map((metricKey, i) => {
                       const metricDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                       if (!metricDef) return null;
                       return (
                          <tr key={metricKey} className={`border-b border-[#c88214]/10 ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#011414]/30'}`}>
                            <td className="px-4 py-4 text-sm font-bold text-white">{metricDef.label}</td>
                            {selectedChannels.map(ch => {
                               const stat = channelStats.find(c => c.channel === ch);
                               return (
                                 <td key={ch} className="px-4 py-4 text-sm font-medium text-white text-right">
                                    {stat ? metricDef.format(stat[metricKey]) : '-'}
                                 </td>
                               );
                            })}
                          </tr>
                       )
                    })}
                  </tbody>
                </table>
             </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* TREND CHART */}
            <div className="card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 export-slide" data-title="Ad Format Performance">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <TrendingUp className="text-[#c88214] w-5 h-5" /> Comparison Trend
                </h3>
                <select 
                  value={trendMetric} 
                  onChange={(e) => setTrendMetric(e.target.value)}
                  className="bg-[#011414] text-[#c88214] border border-[#c88214]/30 rounded-lg px-3 py-1 text-xs font-bold outline-none"
                >
                  {userRole !== 'non-finance' && <option value="spend">Spend</option>}
                  <option value="impressions">Impressions</option>
                  <option value="clicks">Clicks</option>
                  <option value="views">Video Views</option>
                </select>
              </div>
              
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="month" stroke="#6fa89f" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#6fa89f" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatShort(v)} />
                    <RechartsTooltip content={<TrendTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    {selectedChannels.map((ch, idx) => (
                      <Line key={ch} type="monotone" dataKey={ch} name={ch} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={{r:4, fill: '#0C272D', strokeWidth: 2}} activeDot={{r:6}} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TOURNAMENT BREAKDOWN CHART */}
            <div className="card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 export-slide" data-title="Buying Type Performance">
              <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2">
                <BarChart3 className="text-[#c88214] w-5 h-5" /> Top Tournaments Across Channels
                <InfoTooltip definition="Definition for Top Tournaments" />
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignChartData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#6fa89f" fontSize={10} tickFormatter={(v) => formatShort(v)} />
                    <YAxis dataKey="campaign" type="category" stroke="#6fa89f" fontSize={10} width={110} tickFormatter={(v) => v.length > 15 ? v.substring(0,15)+'...' : v} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '12px' }} 
                      cursor={{fill: '#ffffff05'}} 
                      formatter={(value, name) => [`${exSym}${d3.format(",.0f")(value)}`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    {selectedChannels.map((ch, idx) => (
                       <Bar key={ch} dataKey={ch} name={ch} fill={COLORS[idx % COLORS.length]} stackId="a" radius={[0, 4, 4, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          
          {/* TOURNAMENT DATA TABLE */}
          <div className="card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 overflow-hidden export-slide" data-title="Detailed Channel Metrics">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
               <h3 className="text-lg font-black text-white flex items-center gap-2">Detailed Tournament Metrics <InfoTooltip definition="Definition for Detailed Tournament Metrics" /></h3>
               <div className="flex flex-wrap gap-2">
                 {AVAILABLE_METRICS.map(m => (
                   <button 
                     key={m.key}
                     onClick={() => setSelectedMetrics(prev => prev.includes(m.key) ? prev.filter(k => k !== m.key) : [...prev, m.key])}
                     className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${selectedMetrics.includes(m.key) ? 'bg-[#74FA93] text-[#0C272D]' : 'bg-[#011414] text-[#6fa89f] border border-[#c88214]/30 hover:border-[#c88214] hover:text-white'}`}
                   >
                     {m.label}
                   </button>
                 ))}
               </div>
             </div>
             
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b-2 border-[#c88214]/30">
                      <th className="px-4 py-3 text-xs font-black text-[#6fa89f] uppercase tracking-wider sticky left-0 bg-[#065c5d] z-10">Tournament</th>
                      <th className="px-4 py-3 text-xs font-black text-[#6fa89f] uppercase tracking-wider">Channel</th>
                      {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                         <th key={m.key} className="px-4 py-3 text-xs font-black text-[#6fa89f] uppercase tracking-wider text-right">{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaignBreakdown.map((row, i) => (
                      <tr key={`${row.channel}-${row.campaign}`} className={`border-b border-[#c88214]/10 hover:bg-[#74FA93]/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#011414]/30'}`}>
                        <td className={`px-4 py-4 text-sm font-bold text-white sticky left-0 z-10 ${i % 2 === 0 ? 'card-surface backdrop-blur-2xl' : 'bg-[#011414]'}`}>{row.campaign}</td>
                        <td className="px-4 py-4 text-sm font-bold text-[#6fa89f]">{row.channel}</td>
                        {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                           <td key={m.key} className="px-4 py-4 text-sm font-medium text-[#c88214] text-right">{m.format(row[m.key])}</td>
                        ))}
                      </tr>
                    ))}
                    {campaignBreakdown.length > 0 && (() => {
                      const tSpend = d3.sum(campaignBreakdown, d => d.spend);
                      const tImp = d3.sum(campaignBreakdown, d => d.impressions);
                      const tClicks = d3.sum(campaignBreakdown, d => d.clicks);
                      const tViews = d3.sum(campaignBreakdown, d => d.views);
                      const tViews6s = d3.sum(campaignBreakdown, d => d.views6s);
                      const tViews15s = d3.sum(campaignBreakdown, d => d.views15s);
                      const tCompletions = d3.sum(campaignBreakdown, d => d.completions);
                      const tPurchases = d3.sum(campaignBreakdown, d => Number(d.purchases) || 0);

                      const totals = {
                        spend: tSpend,
                        impressions: tImp,
                        clicks: tClicks,
                        views: tViews,
                        views6s: tViews6s,
                        views15s: tViews15s,
                        completions: tCompletions,
                        purchases: tPurchases,
                        ctr: tImp > 0 ? (tClicks / tImp) * 100 : 0,
                        cpc: tClicks > 0 ? tSpend / tClicks : 0,
                        cpm: tImp > 0 ? (tSpend / tImp) * 1000 : 0,
                        cpv: tViews > 0 ? tSpend / tViews : 0,
                        cpcv: tCompletions > 0 ? tSpend / tCompletions : 0
                      };

                      return (
                         <tr className="bg-[#011414] border-t-2 border-[#c88214]/50">
                            <td className="px-4 py-4 text-sm font-black text-[#c88214] sticky left-0 bg-[#011414] z-10">Total</td>
                            <td className="px-4 py-4 text-sm font-black text-[#c88214]"></td>
                            {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                               <td key={m.key} className="px-4 py-4 text-sm font-black text-[#c88214] text-right">{m.format(totals[m.key])}</td>
                            ))}
                         </tr>
                      )
                    })()}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
