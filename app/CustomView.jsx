'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Filter, Download, Activity, TrendingUp, BarChart3, Target, Calendar, Globe2, AlertCircle, Search, Check, ChevronDown, Zap, TableProperties } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#74FA93', '#6fa89f', '#c88214', '#00937b', '#eef7f5', '#c88214', '#007542'];

// Helper to get ISO Week number
const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return `Week ${weekNo}`;
};

const MetricCard = ({ label, value, color = "text-[#c88214]" }) => {
  return (
    <div className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl p-6 rounded-[1.5rem] border border-[#c88214]/10 shadow-xl transition-all hover:shadow-[0_0_20px_rgba(116,250,147,0.15)] hover:-translate-y-1 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#74FA93]/5 to-transparent rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-[#c88214]/10 transition-colors duration-500"></div>
      <p className={`text-[10px] font-black ${color} uppercase tracking-widest mb-2 relative z-10`}>{label}</p>
      <h3 className="text-2xl font-black text-white truncate relative z-10" title={value}>{value}</h3>
    </div>
  );
};

const MultiSelectDropdown = ({ label, options, selected, onChange, className = "flex-1 relative min-w-[180px]" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isObject = options.length > 0 && typeof options[0] === 'object';
  
  const filteredOptions = options.filter(o => {
    const text = isObject ? o.label : o;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className={className}>
      {label && <span className="text-[10px] font-black uppercase text-[#6fa89f] mb-1.5 tracking-widest block">{label}</span>}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-xl text-sm font-black text-[#c88214] shadow-sm cursor-pointer flex justify-between items-center transition-colors hover:border-[#c88214]/50"
      >
        <span className="truncate pr-4">{selected.length === 0 ? 'All Selected' : (isObject ? `${selected.length} Selected` : selected.join(', '))}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); setSearchTerm(''); }} />
          <div className="absolute top-full left-0 w-full h-0 z-50">
            <div className="w-full mt-2 card-surface backdrop-blur-2xl border border-[#c88214]/20 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-80 overflow-hidden">
              <div className="p-3 border-b border-[#c88214]/10 bg-[#011414]">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#6fa89f] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    autoFocus 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full card-surface backdrop-blur-2xl text-white text-xs font-bold pl-9 pr-3 py-2.5 rounded-lg outline-none border border-[#c88214]/20 focus:border-[#c88214] transition-colors" 
                  />
                </div>
              </div>
              <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
                {!isObject && (
                <div 
                  onClick={() => { onChange([]); setIsOpen(false); setSearchTerm(''); }} 
                  className={`px-3 py-2.5 rounded-lg text-sm font-bold cursor-pointer flex justify-between items-center transition-colors ${selected.length === 0 ? 'bg-[#c88214]/20 text-[#c88214]' : 'text-white hover:bg-[#011414]'}`}
                >
                  All <Check className={`w-4 h-4 ${selected.length === 0 ? 'opacity-100' : 'opacity-0'}`} />
                </div>
                )}
                {filteredOptions.map(opt => {
                  const key = isObject ? opt.key : opt;
                  const text = isObject ? opt.label : opt;
                  const isSel = selected.includes(key);
                  return (
                    <div 
                      key={key} 
                      onClick={() => {
                        let next = [...selected];
                        if (isSel) {
                          next = next.filter(n => n !== key);
                        } else { 
                          next.push(key); 
                        }
                        onChange(next);
                      }} 
                      className={`px-3 py-2.5 mt-1 rounded-lg text-sm font-bold cursor-pointer flex justify-between items-center transition-colors ${isSel ? 'bg-[#c88214]/20 text-[#c88214]' : 'text-white hover:bg-[#011414]'}`}
                    >
                      <span className="truncate pr-4">{text}</span> 
                      <Check className={`w-4 h-4 flex-shrink-0 ${isSel ? 'opacity-100' : 'opacity-0'}`} />
                    </div>
                  )
                })}
                {filteredOptions.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs font-bold text-[#6fa89f] uppercase tracking-widest">No results found</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};


export default function CustomView({ adData = [], exRate = 1, exSym = "$", formatShort = (v)=>v, filterCampaigns = [], filterMarkets = [], dateRange = {start:'', end:''}, userRole = 'admin' }) {
  
  const hasMarketFilter = filterMarkets && filterMarkets.length > 0 && !filterMarkets.includes('All');

  
  // Data enrichment (Add Week)
  const enrichedData = useMemo(() => {
     if(!adData) return [];
     return adData.map(d => ({
        ...d,
        week: d.dateObj ? getWeekNumber(d.dateObj) : 'Unknown'
     })).filter(d => d.week !== 'Unknown');
  }, [adData]);

  // Filters State
  const [fChannels, setFChannels] = useState([]);
  const [fWeeks, setFWeeks] = useState([]);

  // Extract distinct filter options
  const optChannels = useMemo(() => Array.from(new Set(enrichedData.map(d => d.channel).filter(Boolean))).sort(), [enrichedData]);
  const optWeeks = useMemo(() => {
     const wks = Array.from(new Set(enrichedData.map(d => d.week).filter(Boolean)));
     return wks.sort((a,b) => parseInt(a.replace('Week ','')) - parseInt(b.replace('Week ','')));
  }, [enrichedData]);

  // Apply filters
  const filteredData = useMemo(() => {
    return enrichedData.filter(d => {
       const mChan = fChannels.length === 0 || fChannels.includes(d.channel);
       const mWeek = fWeeks.length === 0 || fWeeks.includes(d.week);
       return mChan && mWeek;
    });
  }, [enrichedData, fChannels, fWeeks]);

  // Actual Metrics for Filtered Data
  const actuals = useMemo(() => {
      return {
          spend: d3.sum(filteredData, d => d.cost) * exRate,
          impressions: d3.sum(filteredData, d => d.impressions),
          clicks: d3.sum(filteredData, d => d.clicks),
          views: d3.sum(filteredData, d => d.videoViews)
      }
  }, [filteredData, exRate]);


  // Trend Data for Line Chart
  const trendData = useMemo(() => {
      const grouped = d3.groups(filteredData, d => d.dateObj ? d3.timeFormat("%b %d")(d.dateObj) : 'Unknown');
      return grouped.map(([date, vals]) => ({
          date,
          sortDate: vals[0].dateObj,
          Spend: d3.sum(vals, d => d.cost) * exRate,
          Impressions: d3.sum(vals, d => d.impressions),
          Clicks: d3.sum(vals, d => d.clicks)
      })).filter(d => d.date !== 'Unknown').sort((a,b) => a.sortDate - b.sortDate);
  }, [filteredData, exRate]);

  // Channel Mix Data for Pie Chart
  const channelMix = useMemo(() => {
      return d3.groups(filteredData, d => d.channel).map(([channel, vals]) => ({
          name: channel || 'Unknown',
          value: d3.sum(vals, d => d.cost) * exRate
      })).sort((a,b) => b.value - a.value);
  }, [filteredData, exRate]);


  const marketTrendData = useMemo(() => {
      if (!hasMarketFilter) return [];
      const grouped = d3.groups(filteredData, d => d.dateObj ? d3.timeFormat("%b %d")(d.dateObj) : 'Unknown');
      return grouped.map(([date, vals]) => {
         const obj = { date, sortDate: vals[0].dateObj };
         const byMarket = d3.groups(vals, d => d.country);
         byMarket.forEach(([mkt, mktVals]) => {
             obj[`${mkt} Spend`] = d3.sum(mktVals, d => d.cost) * exRate;
             obj[`${mkt} Impressions`] = d3.sum(mktVals, d => d.impressions);
         });
         return obj;
      }).filter(d => d.date !== 'Unknown').sort((a,b) => a.sortDate - b.sortDate);
  }, [filteredData, exRate, hasMarketFilter]);

  const marketMixData = useMemo(() => {
      if (!hasMarketFilter) return [];
      return d3.groups(filteredData, d => d.country).map(([market, vals]) => ({
          name: market || 'Unknown',
          value: d3.sum(vals, d => d.cost) * exRate
      })).sort((a,b) => b.value - a.value);
  }, [filteredData, exRate, hasMarketFilter]);

  const AVAILABLE_METRICS = useMemo(() => {
    const base = [
      { key: 'cost', label: 'Spend', format: v => `${exSym}${d3.format(",.2f")((v||0) * exRate)}` },
      { key: 'impressions', label: 'Impressions', format: v => d3.format(",")((v||0)) },
      { key: 'clicks', label: 'Clicks', format: v => d3.format(",")((v||0)) },
      { key: 'videoViews', label: 'Video Views', format: v => formatShort(v||0) },
      { key: 'videoViews6s', label: '6s Views', format: v => formatShort(v||0) },
      { key: 'videoViews15s', label: '15s Views', format: v => formatShort(v||0) },
      { key: 'videoCompletions', label: 'Completed Views', format: v => formatShort(v||0) },
      { key: 'cpc', label: 'CPC', format: v => `${exSym}${d3.format(",.2f")((v||0) * exRate)}` },
      { key: 'cpm', label: 'CPM', format: v => `${exSym}${d3.format(",.2f")((v||0) * exRate)}` },
      { key: 'ctr', label: 'CTR', format: v => `${(v||0).toFixed(2)}%` },
      { key: 'cpv', label: 'CPV', format: v => `${exSym}${d3.format(",.4f")((v||0) * exRate)}` },
      { key: 'cpcv', label: 'CPCV', format: v => `${exSym}${d3.format(",.4f")((v||0) * exRate)}` }
    ];
    if (userRole === 'non-finance') {
      return base.filter(m => !['cost', 'cpc', 'cpm', 'cpv', 'cpcv'].includes(m.key));
    }
    return base;
  }, [exRate, exSym, userRole]);

  const [selectedMetrics, setSelectedMetrics] = useState(
    userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'videoViews'] : ['cost', 'impressions', 'clicks']
  );

  // Table Aggregation by Week
  const tableDataByWeek = useMemo(() => {
      const hasCampFilter = filterCampaigns.length > 0 && !filterCampaigns.includes('All');
      const hasChanFilter = fChannels.length > 0;
      
      const mappedData = filteredData.map(d => ({
          week: d.week,
          market: hasMarketFilter ? (d.country || 'Unknown') : 'All Markets',
          campaignName: hasCampFilter ? d.campaignName : 'All Campaigns',
          channel: hasChanFilter ? d.channel : 'All Channels',
          cost: d.cost || 0,
          impressions: d.impressions || 0,
          clicks: d.clicks || 0,
          videoViews: d.videoViews || 0,
          videoViews6s: d.videoViews6s || 0,
          videoViews15s: d.videoViews15s || 0,
          videoCompletions: d.videoCompletions || 0
      }));

      const groups = d3.groups(mappedData, d => d.week, d => d.market, d => d.campaignName, d => d.channel);
      const rows = [];
      groups.forEach(([week, markets]) => {
        markets.forEach(([market, camps]) => {
          camps.forEach(([camp, chans]) => {
              chans.forEach(([chan, items]) => {
                  const impressions = d3.sum(items, i => i.impressions);
                  const clicks = d3.sum(items, i => i.clicks);
                  const cost = d3.sum(items, i => i.cost);
                  const videoViews = d3.sum(items, i => i.videoViews);
                  const videoCompletions = d3.sum(items, i => i.videoCompletions);
                  rows.push({
                      week,
                      market,
                      campaignName: camp,
                      channel: chan,
                      cost,
                      impressions,
                      clicks,
                      videoViews,
                      videoViews6s: d3.sum(items, i => i.videoViews6s),
                      videoViews15s: d3.sum(items, i => i.videoViews15s),
                      videoCompletions,
                      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                      cpm: impressions > 0 ? (cost / impressions) * 1000 : 0,
                      cpc: clicks > 0 ? cost / clicks : 0,
                      cpv: videoViews > 0 ? cost / videoViews : 0,
                      cpcv: videoCompletions > 0 ? cost / videoCompletions : 0
                  });
              });
          });
        });
      });
      // Sort week numerically, then campaign
      return rows.sort((a,b) => {
         const wa = parseInt(a.week.replace('Week ','')) || 0;
         const wb = parseInt(b.week.replace('Week ','')) || 0;
         if (wa !== wb) return wa - wb;
         return a.campaignName.localeCompare(b.campaignName);
      });
  }, [filteredData, filterCampaigns, fChannels, hasMarketFilter]);



  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] mb-24">
      
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 card-surface backdrop-blur-2xl/80 backdrop-blur-xl p-8 rounded-[2rem] border border-[#c88214]/20 shadow-2xl relative z-50">
        <div className="absolute top-0 left-0 w-32 h-32 bg-[#74FA93]/5 rounded-full blur-3xl -ml-10 -mt-10"></div>
        <div className="relative z-10">
           <h2 className="text-3xl font-black text-white flex items-center gap-3">
             <Filter className="text-[#c88214] w-8 h-8" /> Custom Data Hub
           </h2>
           <p className="text-[#6fa89f] text-sm mt-2 font-medium tracking-wide">Advanced slicing, goal tracking, and export suite.</p>
        </div>
        
        <div className="flex flex-wrap gap-4 items-end w-full xl:w-auto relative z-40">
           <MultiSelectDropdown label="Week" options={optWeeks} selected={fWeeks} onChange={setFWeeks} />
           <MultiSelectDropdown label="Channel" options={optChannels} selected={fChannels} onChange={setFChannels} />
        </div>
      </div>

      {/* DYNAMIC CHARTS */}
      {filteredData.length > 0 ? (
         <>
           <div className="export-slide" data-title="Performance & Channel Mix">
             <div className={`grid grid-cols-2 md:grid-cols-${userRole === 'non-finance' ? '3' : '4'} gap-6 mb-8`}>
              {userRole !== 'non-finance' && <MetricCard label="Total Spend" value={`${exSym}${formatShort(actuals.spend)}`} />}
              <MetricCard label="Impressions" value={formatShort(actuals.impressions)} color="text-[#6fa89f]" />
              <MetricCard label="Clicks" value={formatShort(actuals.clicks)} color="text-[#c88214]" />
              <MetricCard label="Video Views" value={formatShort(actuals.views)} color="text-[#007542]" />
           </div>

           <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
              <div className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl border border-[#c88214]/10 rounded-[2rem] p-8 xl:col-span-2 shadow-xl">
                 <h3 className="text-lg font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest text-sm">
                   <TrendingUp className="text-[#c88214] w-5 h-5" /> Performance Trend
                 </h3>
                 <div className="h-72">
                   <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                       <XAxis dataKey="date" stroke="#6fa89f" fontSize={12} tickLine={false} axisLine={false} />
                       {userRole !== 'non-finance' && <YAxis yAxisId="left" stroke="#74FA93" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatShort} />}
                       <YAxis yAxisId={userRole === 'non-finance' ? "left" : "right"} orientation={userRole === 'non-finance' ? "left" : "right"} stroke="#c88214" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                       <RechartsTooltip contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
                       <Legend wrapperStyle={{ paddingTop: '20px' }} />
                       {userRole !== 'non-finance' && <Line yAxisId="left" type="monotone" dataKey="Spend" stroke="#74FA93" strokeWidth={4} dot={false} activeDot={{r:8, fill: '#74FA93', stroke: '#0C272D', strokeWidth: 2}} />}
                       <Line yAxisId={userRole === 'non-finance' ? "left" : "right"} type="monotone" dataKey="Impressions" stroke="#c88214" strokeWidth={4} dot={false} activeDot={{r:8, fill: '#c88214', stroke: '#0C272D', strokeWidth: 2}} />
                     </LineChart>
                   </ResponsiveContainer>
                 </div>
              </div>

              <div className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl border border-[#c88214]/10 rounded-[2rem] p-8 shadow-xl">
                 <h3 className="text-lg font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest text-sm">
                   <Activity className="text-[#c88214] w-5 h-5" /> Channel Mix
                 </h3>
                 <div className="h-72">
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie data={channelMix} innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value" stroke="none">
                         {channelMix.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                         ))}
                       </Pie>
                       <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '16px', fontSize: '12px' }}
                          formatter={(val) => `${exSym}${d3.format(",.2f")(val)}`}
                       />
                       <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                     </PieChart>
                   </ResponsiveContainer>
                 </div>
              </div>
           </div>
           </div>

           {/* MARKET CHARTS */}
           {hasMarketFilter && (
             <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8 mt-8 export-slide" data-title="Market Performance & Mix">
                <div className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl border border-[#c88214]/10 rounded-[2rem] p-8 xl:col-span-2 shadow-xl">
                   <h3 className="text-lg font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest text-sm">
                     <TrendingUp className="text-[#c88214] w-5 h-5" /> Market Performance Trend
                   </h3>
                   <div className="h-72">
                     <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={marketTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                         <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                         <XAxis dataKey="date" stroke="#6fa89f" fontSize={12} tickLine={false} axisLine={false} />
                         {userRole !== 'non-finance' && <YAxis yAxisId="left" stroke="#74FA93" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatShort} />}
                         <YAxis yAxisId={userRole === 'non-finance' ? "left" : "right"} orientation={userRole === 'non-finance' ? "left" : "right"} stroke="#c88214" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                         <RechartsTooltip contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
                         <Legend wrapperStyle={{ paddingTop: '20px' }} />
                         
                         {filterMarkets.map((mkt, idx) => {
                             if (mkt === 'All') return null;
                             const color1 = COLORS[idx % COLORS.length];
                             const color2 = COLORS[(idx + 2) % COLORS.length];
                             return (
                               <React.Fragment key={mkt}>
                                 {userRole !== 'non-finance' && <Line yAxisId="left" type="monotone" name={`${mkt} Spend`} dataKey={`${mkt} Spend`} stroke={color1} strokeWidth={3} dot={false} />}
                                 <Line yAxisId={userRole === 'non-finance' ? "left" : "right"} type="monotone" name={`${mkt} Impressions`} dataKey={`${mkt} Impressions`} stroke={color2} strokeWidth={3} strokeDasharray="5 5" dot={false} />
                               </React.Fragment>
                             );
                         })}
                       </LineChart>
                     </ResponsiveContainer>
                   </div>
                </div>

                <div className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl border border-[#c88214]/10 rounded-[2rem] p-8 shadow-xl">
                   <h3 className="text-lg font-black text-white mb-8 flex items-center gap-2 uppercase tracking-widest text-sm">
                     <Activity className="text-[#c88214] w-5 h-5" /> Market Mix
                   </h3>
                   <div className="h-72">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                         <Pie data={marketMixData} innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value" stroke="none">
                           {marketMixData.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                         </Pie>
                         <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '16px', fontSize: '12px' }}
                            formatter={(val) => `${exSym}${d3.format(",.2f")(val)}`}
                         />
                         <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                </div>
             </div>
           )}

           {/* Data Table */}
           <div className="card-surface backdrop-blur-2xl/80 backdrop-blur-xl border border-[#c88214]/10 rounded-[2rem] p-8 shadow-xl overflow-x-auto custom-scrollbar export-slide" data-title="Data Breakdown">
              <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                 <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-widest text-sm">
                    <TableProperties className="text-[#c88214] w-5 h-5" /> Data Breakdown
                 </h3>
                 <MultiSelectDropdown 
                   label=""
                   options={AVAILABLE_METRICS} 
                   selected={selectedMetrics} 
                   onChange={setSelectedMetrics} 
                   className="relative min-w-[220px]"
                 />
              </div>
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="border-b border-[#c88214]/20">
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Week</th>
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Market</th>
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Campaign</th>
                       <th className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest">Channel</th>
                       {selectedMetrics.map((metricKey) => {
                          const mDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                          if (!mDef) return null;
                          return (
                            <th key={metricKey} className="py-4 px-4 text-[#6fa89f] font-bold text-xs uppercase tracking-widest text-right">
                              {mDef.label}
                            </th>
                          )
                       })}
                    </tr>
                 </thead>
                 <tbody>
                    {tableDataByWeek.slice(0, 50).map((d, i) => (
                       <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 px-4 text-white text-sm font-medium">{d.week}</td>
                          <td className="py-4 px-4 text-white text-sm font-bold">{d.market}</td>
                          <td className="py-4 px-4 text-white text-sm font-bold">{d.campaignName}</td>
                          <td className="py-4 px-4 text-[#c88214] text-sm font-bold">{d.channel}</td>
                          {selectedMetrics.map((metricKey) => {
                             const mDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                             if (!mDef) return null;
                             return (
                               <td key={metricKey} className="py-4 px-4 text-white text-sm font-bold text-right">
                                 {mDef.format(d[metricKey])}
                               </td>
                             )
                          })}
                       </tr>
                    ))}
                 </tbody>
              </table>
              {tableDataByWeek.length > 50 && (
                 <div className="text-center text-[#6fa89f] text-xs font-bold mt-6 uppercase tracking-widest">
                   Showing first 50 rows. Export report for full data.
                 </div>
              )}
           </div>
         </>
      ) : (
         <div className="card-surface backdrop-blur-2xl/50 p-16 rounded-[2rem] border border-[#c88214]/10 text-center flex flex-col items-center justify-center">
            <AlertCircle className="w-16 h-16 text-[#007542] mb-6 opacity-80" />
            <h3 className="text-2xl font-black text-white">No data matches your filters</h3>
            <p className="text-[#6fa89f] mt-2 font-medium">Try clearing some selections to see results.</p>
         </div>
      )}
    </div>
  );
}
