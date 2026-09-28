'use client';

import React, { useState, useMemo } from 'react';
import InfoTooltip from './components/InfoTooltip';
import * as d3 from 'd3';
import { Eye, DollarSign, Activity, TrendingUp, BarChart3, Target, CheckCircle2, Globe2, MousePointer2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const COLORS = ['#74FA93', '#c88214', '#00937b', '#eef7f5', '#007542'];

const getFlagEmoji = (countryName) => {
  const codes = {
    'Australia': 'au', 'Malaysia': 'my', 'Singapore': 'sg', 'Indonesia': 'id', 'India': 'in',
    'Philippines': 'ph', 'Thailand': 'th', 'Vietnam': 'vn', 'South Korea': 'kr', 'Japan': 'jp',
    'Kuwait': 'kw', 'Saudi Arabia': 'sa', 'United Arab Emirates': 'ae', 'Qatar': 'qa',
    'Bahrain': 'bh', 'Oman': 'om', 'Egypt': 'eg', 'Jordan': 'jo', 'United Kingdom': 'gb', 'United States': 'us',
    'Iraq': 'iq', 'Yemen': 'ye'
  };
  const code = codes[countryName];
  if (code) {
    return (
      <img 
        src={`https://flagcdn.com/${code}.svg`} 
        alt={countryName} 
        className="inline-block mx-1 object-contain h-[0.85em] rounded-[1px]" 
        style={{ verticalAlign: 'middle', marginTop: '-0.15em' }} 
      />
    );
  }
  return <span className="inline-block mx-1">🌐</span>;
};

export default function MarketView({ adData, gaData, exRate = 1, exSym = '$', formatShort = (v) => v, userRole }) {
  const [selectedMarkets, setSelectedMarkets] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState(userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'sessions'] : ['spend', 'impressions', 'clicks', 'ctr', 'cpm', 'sessions']);
  const [trendMetric, setTrendMetric] = useState(userRole === 'non-finance' ? 'impressions' : 'spend'); // spend, impressions, clicks, sessions

  const AVAILABLE_METRICS = useMemo(() => {
    const base = [
      { key: 'spend', label: 'Spend', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'impressions', label: 'Impressions', format: v => d3.format(",")(v) },
      { key: 'clicks', label: 'Clicks', format: v => d3.format(",")(v) },
      { key: 'views', label: 'Video Views', format: v => d3.format(",")(v) },
      { key: 'views6s', label: '6s Views', format: v => d3.format(",")(v) },
      { key: 'views15s', label: '15s Views', format: v => d3.format(",")(v) },
      { key: 'completions', label: 'Completed Views', format: v => d3.format(",")(v) },
      { key: 'sessions', label: 'Paid GA4 Sessions', format: v => d3.format(",")(v) },
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

  // Merge Ad Data and GA Data at market level
  const marketStats = useMemo(() => {
    if (!adData || adData.length === 0) return [];
    
    const paidGaData = (gaData || []).filter(d => d.paidOrganic === 'Paid');
    const gaGrouped = d3.rollup(paidGaData, v => d3.sum(v, d => d.sessions), d => d.country);

    const grouped = d3.groups(adData, d => d.country).map(([country, vals]) => {
      const impressions = d3.sum(vals, d => d.impressions);
      const clicks = d3.sum(vals, d => d.clicks);
      const spend = d3.sum(vals, d => d.cost);
      const views = d3.sum(vals, d => d.videoViews);
      const sessions = gaGrouped.get(country) || 0;
      
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : Infinity;
      const cpc = clicks > 0 ? (spend / clicks) : Infinity;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpv = views > 0 ? (spend / views) : Infinity;

      return {
        country,
        spend,
        impressions,
        clicks,
        views,
        sessions,
        cpm,
        cpc,
        ctr,
        cpv,
        campaignsCount: new Set(vals.map(d => d.campaignName)).size
      };
    });
    
    // Filter spend > $1 (raw value * exRate > 1, or just raw spend > 1 based on base currency?)
    // Assuming base is USD, spend > 1
    return grouped.filter(m => m.spend > 1).sort((a,b) => b.spend - a.spend);
  }, [adData, gaData]);

  // Identify Top Performers for the "Trophy" cards
  const topCards = useMemo(() => {
    if (marketStats.length === 0) return null;
    
    const bySpend = [...marketStats].sort((a, b) => b.spend - a.spend)[0];
    const byImp = [...marketStats].sort((a, b) => b.impressions - a.impressions)[0];
    const bySessions = [...marketStats].sort((a, b) => b.sessions - a.sessions)[0];
    
    const validCpm = marketStats.filter(m => m.impressions > 10000 && m.cpm !== Infinity);
    const byEfficiency = validCpm.sort((a, b) => a.cpm - b.cpm)[0] || marketStats[0];

    return { spend: bySpend, impressions: byImp, sessions: bySessions, efficiency: byEfficiency };
  }, [marketStats]);

  const handleMarketToggle = (m) => {
    if (selectedMarkets.includes(m)) {
      setSelectedMarkets(selectedMarkets.filter(c => c !== m));
    } else {
      if (selectedMarkets.length < 3) {
        setSelectedMarkets([...selectedMarkets, m]);
      }
    }
  };

  const selectedMarketAdData = useMemo(() => {
    if (selectedMarkets.length === 0) return [];
    return adData.filter(d => selectedMarkets.includes(d.country));
  }, [selectedMarkets, adData]);
  
  const selectedMarketGaData = useMemo(() => {
    if (selectedMarkets.length === 0) return [];
    return (gaData || []).filter(d => selectedMarkets.includes(d.country) && d.paidOrganic === 'Paid');
  }, [selectedMarkets, gaData]);

  // Month-by-month trend for selected markets
  const trendData = useMemo(() => {
    if (selectedMarketAdData.length === 0 && selectedMarketGaData.length === 0) return [];
    
    const allDates = new Set();
    const adGrouped = d3.groups(selectedMarketAdData, d => d.country, d => {
       const m = d.dateObj ? d3.timeFormat("%b %Y")(d.dateObj) : 'Unknown';
       if(m !== 'Unknown') allDates.add(m);
       return m;
    });
    const gaGrouped = d3.groups(selectedMarketGaData, d => d.country, d => {
       const m = d.dateObj ? d3.timeFormat("%b %Y")(d.dateObj) : 'Unknown';
       if(m !== 'Unknown') allDates.add(m);
       return m;
    });

    const monthsArray = Array.from(allDates).map(monthStr => {
      // rough sortDate
      const parts = monthStr.split(' ');
      const sortDate = new Date(`${parts[0]} 1, ${parts[1]}`);
      return { month: monthStr, sortDate };
    }).sort((a, b) => a.sortDate - b.sortDate);

    return monthsArray.map(({ month, sortDate }) => {
      const row = { month, sortDate };
      selectedMarkets.forEach(country => {
        let val = 0;
        if (trendMetric === 'sessions') {
           const countryGa = gaGrouped.find(g => g[0] === country);
           if (countryGa) {
              const monthGa = countryGa[1].find(m => m[0] === month);
              if (monthGa) val = d3.sum(monthGa[1], d => d.sessions);
           }
        } else {
           const countryAd = adGrouped.find(g => g[0] === country);
           if (countryAd) {
              const monthAd = countryAd[1].find(m => m[0] === month);
              if (monthAd) {
                 if (trendMetric === 'spend') val = d3.sum(monthAd[1], d => d.cost) * exRate;
                 else if (trendMetric === 'impressions') val = d3.sum(monthAd[1], d => d.impressions);
                 else if (trendMetric === 'clicks') val = d3.sum(monthAd[1], d => d.clicks);
              }
           }
        }
        row[country] = val;
      });
      return row;
    });
  }, [selectedMarketAdData, selectedMarketGaData, selectedMarkets, trendMetric, exRate]);

  // Campaign breakdown
  const campaignBreakdown = useMemo(() => {
    if (selectedMarketAdData.length === 0) return [];
    
    // Group by Country -> Campaign
    const grouped = d3.groups(selectedMarketAdData, d => d.country, d => d.campaignName);
    
    let flattened = [];
    grouped.forEach(([country, campaigns]) => {
      campaigns.forEach(([campaign, vals]) => {
        const impressions = d3.sum(vals, d => d.impressions);
        const clicks = d3.sum(vals, d => d.clicks);
        const spend = d3.sum(vals, d => d.cost);
        const views = d3.sum(vals, d => d.videoViews);
        const views6s = d3.sum(vals, d => d.videoViews6s);
        const views15s = d3.sum(vals, d => d.videoViews15s);
        const completions = d3.sum(vals, d => d.videoCompletions);
        
        flattened.push({
          country,
          campaign,
          spend,
          impressions,
          clicks,
          views,
          views6s,
          views15s,
          completions,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          cpv: views > 0 ? spend / views : 0,
          cpcv: completions > 0 ? spend / completions : 0
        });
      });
    });
    return flattened.sort((a,b) => b.spend - a.spend);
  }, [selectedMarketAdData]);

  const campaignChartData = useMemo(() => {
     if (selectedMarketAdData.length === 0) return [];
     const grouped = d3.groups(selectedMarketAdData, d => d.campaignName);
     return grouped.map(([campaign, vals]) => {
        const row = { campaign, totalSpend: d3.sum(vals, d => d.cost) };
        selectedMarkets.forEach(m => {
           row[m] = d3.sum(vals.filter(v => v.country === m), d => d.cost) * exRate;
        });
        return row;
     }).sort((a,b) => b.totalSpend - a.totalSpend).slice(0, 7);
  }, [selectedMarketAdData, selectedMarkets, exRate]);

  const channelChartData = useMemo(() => {
     if (selectedMarketAdData.length === 0) return [];
     const grouped = d3.groups(selectedMarketAdData, d => d.channel);
     return grouped.map(([channel, vals]) => {
        const row = { channel, totalSpend: d3.sum(vals, d => d.cost) };
        selectedMarkets.forEach(m => {
           row[m] = d3.sum(vals.filter(v => v.country === m), d => d.cost) * exRate;
        });
        return row;
     }).sort((a,b) => b.totalSpend - a.totalSpend).slice(0, 7);
  }, [selectedMarketAdData, selectedMarkets, exRate]);


  const TrendTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#011414] border border-[#c88214]/30 p-4 rounded-xl shadow-xl">
          <p className="text-white font-bold mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
              {getFlagEmoji(entry.name)} {entry.name}: {trendMetric === 'spend' ? `${exSym}${d3.format(",.2f")(entry.value)}` : d3.format(",")(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!marketStats || marketStats.length === 0) return <div className="text-white p-8">No market data available.</div>;

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
      
      {/* HEADER & TOP CARDS */}
      {selectedMarkets.length === 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black text-white flex items-center gap-3">
              <Globe2 className="text-[#c88214] w-8 h-8" /> Market Overview
            </h2>
          </div>

          {topCards && (
            <div className={`grid grid-cols-1 md:grid-cols-2 ${userRole === 'non-finance' ? 'lg:grid-cols-2' : 'lg:grid-cols-4'} gap-4`}>
              {userRole !== 'non-finance' && (
                <div className="bg-[#011414] border border-[#c88214]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#c88214]/50 transition-colors">
                  <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><DollarSign className="w-32 h-32 text-white" /></div>
                  <p className="text-[#6fa89f] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><DollarSign className="w-4 h-4 text-[#c88214]"/> Top by Spend</p>
                  <p className="text-2xl font-black text-white truncate flex items-center gap-2">
                     {getFlagEmoji(topCards.spend.country)} {topCards.spend.country}
                  </p>
                  <p className="text-[#c88214] font-bold text-lg mt-2">{exSym}{formatShort(topCards.spend.spend * exRate)} <span className="text-xs text-[#6fa89f] font-medium">Spend</span></p>
                </div>
              )}
              
              <div className="bg-[#011414] border border-[#c88214]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#c88214]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Eye className="w-32 h-32 text-white" /></div>
                <p className="text-[#6fa89f] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Eye className="w-4 h-4 text-[#c88214]"/> Top by Impressions</p>
                <p className="text-2xl font-black text-white truncate flex items-center gap-2">
                   {getFlagEmoji(topCards.impressions.country)} {topCards.impressions.country}
                </p>
                <p className="text-[#c88214] font-bold text-lg mt-2">{formatShort(topCards.impressions.impressions)} <span className="text-xs text-[#6fa89f] font-medium">Impressions</span></p>
              </div>

              <div className="bg-[#011414] border border-[#c88214]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#c88214]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><MousePointer2 className="w-32 h-32 text-white" /></div>
                <p className="text-[#6fa89f] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><MousePointer2 className="w-4 h-4 text-[#c88214]"/> Top by GA4 Sessions</p>
                <p className="text-2xl font-black text-white truncate flex items-center gap-2">
                   {getFlagEmoji(topCards.sessions.country)} {topCards.sessions.country}
                </p>
                <p className="text-[#c88214] font-bold text-lg mt-2">{formatShort(topCards.sessions.sessions)} <span className="text-xs text-[#6fa89f] font-medium">Sessions (Paid)</span></p>
              </div>

              {userRole !== 'non-finance' && (
                <div className="bg-gradient-to-br from-[#0C272D] to-[#113A42] border border-[#c88214]/40 rounded-2xl p-6 relative overflow-hidden group hover:border-[#c88214] transition-colors shadow-[0_0_15px_rgba(116,250,147,0.1)]">
                  <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Target className="w-32 h-32 text-[#c88214]" /></div>
                  <p className="text-[#6fa89f] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Target className="w-4 h-4 text-[#c88214]"/> Most Efficient</p>
                  <p className="text-2xl font-black text-white truncate flex items-center gap-2">
                     {getFlagEmoji(topCards.efficiency.country)} {topCards.efficiency.country}
                  </p>
                  <p className="text-[#c88214] font-bold text-lg mt-2">{exSym}{d3.format(",.2f")(topCards.efficiency.cpm * exRate)} <span className="text-xs text-[#6fa89f] font-medium">CPM</span></p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MARKET SELECTION GRID */}
      <div className={`card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 md:p-8 transition-all ${selectedMarkets.length > 0 ? 'mt-0' : ''} export-slide`} data-title="Market Top Stats">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-xl font-black text-white">Compare Markets</h3>
            <p className="text-sm text-[#6fa89f]">Select up to 3 markets to compare performance.</p>
          </div>
          {selectedMarkets.length > 0 && (
             <button 
                onClick={() => setSelectedMarkets([])}
                className="text-xs font-bold uppercase tracking-widest text-[#c88214] hover:text-white bg-[#c88214]/10 hover:bg-[#74FA93]/20 px-4 py-2 rounded-full transition-colors"
             >
                Clear Selection
             </button>
          )}
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {marketStats.map((m) => {
            const isSelected = selectedMarkets.includes(m.country);
            const isDisabled = !isSelected && selectedMarkets.length >= 3;
            return (
              <button 
                key={m.country}
                onClick={() => handleMarketToggle(m.country)}
                disabled={isDisabled}
                className={`border rounded-xl p-4 text-left transition-all duration-300 relative flex flex-col justify-between min-h-[110px]
                  ${isSelected ? 'bg-[#74FA93]/20 border-[#c88214] shadow-[0_0_15px_rgba(116,250,147,0.1)]' : 'bg-[#011414] border-[#c88214]/20'}
                  ${!isSelected && !isDisabled ? 'hover:bg-[#c88214]/10 hover:border-[#c88214]/60' : ''}
                  ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {isSelected && <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-[#c88214]" />}
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getFlagEmoji(m.country)}</span>
                  <h4 className={`text-sm font-bold transition-colors line-clamp-2 leading-tight ${isSelected ? 'text-[#c88214]' : 'text-white'}`}>{m.country}</h4>
                </div>
                <div className="mt-3 flex justify-between items-end">
                  <div>
                    <p className="text-[10px] text-[#6fa89f] uppercase tracking-wider">{userRole === 'non-finance' ? 'Clicks' : 'Spend'}</p>
                    <p className="text-xs font-black text-white">{userRole === 'non-finance' ? formatShort(m.clicks) : `${exSym}${formatShort(m.spend * exRate)}`}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#6fa89f] uppercase tracking-wider">GA4</p>
                    <p className="text-xs font-bold text-[#c88214]">{formatShort(m.sessions)}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* DETAILED DRILL-DOWN VIEW */}
      {selectedMarkets.length > 0 && (
        <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
          
          {/* KPI MATRIX */}
          <div className="card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 overflow-hidden export-slide" data-title="Top Performing Markets">
             <h3 className="text-lg font-black text-white mb-6">Market Performance Matrix</h3>
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b-2 border-[#c88214]/30">
                      <th className="px-4 py-3 text-xs font-black text-[#6fa89f] uppercase tracking-wider">Metric</th>
                      {selectedMarkets.map(country => (
                         <th key={country} className="px-4 py-3 text-sm font-black text-[#c88214] uppercase tracking-wider text-right">
                            {getFlagEmoji(country)} {country}
                         </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'sessions'] : ['spend', 'impressions', 'clicks', 'ctr', 'cpm', 'sessions']).map((metricKey, i) => {
                       const metricDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                       return (
                          <tr key={metricKey} className={`border-b border-[#c88214]/10 ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#011414]/30'}`}>
                            <td className="px-4 py-4 text-sm font-bold text-white">{metricDef.label}</td>
                            {selectedMarkets.map(country => {
                               const stat = marketStats.find(c => c.country === country);
                               return (
                                 <td key={country} className="px-4 py-4 text-sm font-medium text-white text-right">
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
            <div className="card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 export-slide" data-title="Comparison Trend">
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
                  <option value="sessions">Paid GA4 Sessions</option>
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
                    {selectedMarkets.map((country, idx) => (
                      <Line key={country} type="monotone" dataKey={country} name={country} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={{r:4, fill: '#0C272D', strokeWidth: 2}} activeDot={{r:6}} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TOURNAMENT BREAKDOWN CHART */}
            <div className="card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 export-slide" data-title="Market Channels">
              <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2">
                <BarChart3 className="text-[#c88214] w-5 h-5" /> Top Tournaments Across Markets
                <InfoTooltip definition="Definition for Top Tournaments Across Markets" />
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
                    {selectedMarkets.map((country, idx) => (
                       <Bar key={country} dataKey={country} name={country} fill={COLORS[idx % COLORS.length]} stackId="a" radius={[0, 4, 4, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* CHANNEL BREAKDOWN CHART */}
            <div className="card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 xl:col-span-2 export-slide" data-title="Top Tournaments Across Markets">
              <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2">
                <BarChart3 className="text-[#c88214] w-5 h-5" /> Top Channels Across Markets
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelChartData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#6fa89f" fontSize={10} tickFormatter={(v) => formatShort(v)} />
                    <YAxis dataKey="channel" type="category" stroke="#6fa89f" fontSize={10} width={110} tickFormatter={(v) => v.length > 15 ? v.substring(0,15)+'...' : v} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '12px' }} 
                      cursor={{fill: '#ffffff05'}} 
                      formatter={(value, name) => [`${exSym}${d3.format(",.0f")(value)}`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    {selectedMarkets.map((country, idx) => (
                       <Bar key={country} dataKey={country} name={country} fill={COLORS[idx % COLORS.length]} stackId="a" radius={[0, 4, 4, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          
          {/* TOURNAMENT DATA TABLE */}
          <div className="card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-3xl p-6 overflow-hidden export-slide" data-title="Detailed Market Metrics">
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
                      <th className="px-4 py-3 text-xs font-black text-[#6fa89f] uppercase tracking-wider">Market</th>
                      {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                         <th key={m.key} className="px-4 py-3 text-xs font-black text-[#6fa89f] uppercase tracking-wider text-right">{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaignBreakdown.map((row, i) => (
                      <tr key={`${row.country}-${row.campaign}`} className={`border-b border-[#c88214]/10 hover:bg-[#74FA93]/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#011414]/30'}`}>
                        <td className={`px-4 py-4 text-sm font-bold text-white sticky left-0 z-10 ${i % 2 === 0 ? 'card-surface backdrop-blur-2xl' : 'bg-[#011414]'}`}>{row.campaign}</td>
                        <td className="px-4 py-4 text-sm font-bold text-[#6fa89f] flex items-center gap-2">
                           {getFlagEmoji(row.country)} {row.country}
                        </td>
                        {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                           <td key={m.key} className="px-4 py-4 text-sm font-medium text-[#c88214] text-right">
                              {m.key === 'sessions' ? 'N/A' : m.format(row[m.key])}
                           </td>
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
                      
                      const tSessions = d3.sum(selectedMarkets.map(m => marketStats.find(s => s.country === m)?.sessions || 0));

                      const totals = {
                        spend: tSpend,
                        impressions: tImp,
                        clicks: tClicks,
                        views: tViews,
                        views6s: tViews6s,
                        views15s: tViews15s,
                        completions: tCompletions,
                        sessions: tSessions,
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
                               <td key={m.key} className="px-4 py-4 text-sm font-black text-[#c88214] text-right">
                                  {m.key === 'sessions' ? m.format(tSessions) : m.format(totals[m.key])}
                               </td>
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
