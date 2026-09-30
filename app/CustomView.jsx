'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Filter, Download, Activity, TrendingUp, BarChart3, Target, Calendar, Globe2, AlertCircle, Search, Check, ChevronDown, Zap, TableProperties, Camera } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import html2canvas from 'html2canvas';

const COLORS = ['#74FA93', '#14a6d9', '#cedc28', '#00937b', '#eef7f5', '#cedc28', '#007542'];

// Helper to get ISO Week number
const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return `Week ${weekNo}`;
};

const MultiSelectDropdown = ({ label, options, selected, onChange, className = "flex-1 relative min-w-[180px]", singleSelect = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isObject = options.length > 0 && typeof options[0] === 'object';
  
  const filteredOptions = options.filter(o => {
    const text = isObject ? o.label : o;
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className={className}>
      {label && <span className="text-[10px] font-bold uppercase text-[#14a6d9] mb-1.5 tracking-widest block">{label}</span>}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 card-surface backdrop-blur-2xl border border-[#cedc28]/20 rounded-xl text-sm font-bold text-[#cedc28] shadow-sm cursor-pointer flex justify-between items-center transition-colors hover:border-[#cedc28]/50"
      >
        <span className="truncate pr-4">{selected.length === 0 && !singleSelect ? 'All Selected' : (isObject ? (singleSelect ? options.find(o => o.key === selected)?.label || 'Select...' : `${selected.length} Selected`) : (singleSelect ? selected || 'Select...' : selected.join(', ')))}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); setSearchTerm(''); }} />
          <div className="absolute top-full left-0 w-full z-[100] mt-2">
            <div className="w-full card-surface backdrop-blur-2xl border border-[#cedc28]/20 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-80 overflow-hidden">
              <div className="p-3 border-b border-[#cedc28]/10 bg-[#0a2442]">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#14a6d9] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    autoFocus 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full card-surface backdrop-blur-2xl text-white text-xs font-bold pl-9 pr-3 py-2.5 rounded-lg outline-none border border-[#cedc28]/20 focus:border-[#cedc28] transition-colors" 
                  />
                </div>
              </div>
              <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
                {!isObject && !singleSelect && (
                <div 
                  onClick={() => { onChange([]); setIsOpen(false); setSearchTerm(''); }} 
                  className={`px-3 py-2.5 rounded-lg text-sm font-bold cursor-pointer flex justify-between items-center transition-colors ${selected.length === 0 ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-white hover:bg-[#0a2442]'}`}
                >
                  All <Check className={`w-4 h-4 ${selected.length === 0 ? 'opacity-100' : 'opacity-0'}`} />
                </div>
                )}
                {filteredOptions.map(opt => {
                  const key = isObject ? opt.key : opt;
                  const text = isObject ? opt.label : opt;
                  const isSel = singleSelect ? selected === key : selected.includes(key);
                  return (
                    <div 
                      key={key} 
                      onClick={() => {
                        if (singleSelect) {
                          onChange(key);
                          setIsOpen(false);
                          setSearchTerm('');
                        } else {
                          let next = [...selected];
                          if (isSel) {
                            next = next.filter(n => n !== key);
                          } else { 
                            next.push(key); 
                          }
                          onChange(next);
                        }
                      }} 
                      className={`px-3 py-2.5 mt-1 rounded-lg text-sm font-bold cursor-pointer flex justify-between items-center transition-colors ${isSel ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-white hover:bg-[#0a2442]'}`}
                    >
                      <span className="truncate pr-4">{text}</span> 
                      <Check className={`w-4 h-4 flex-shrink-0 ${isSel ? 'opacity-100' : 'opacity-0'}`} />
                    </div>
                  )
                })}
                {filteredOptions.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs font-bold text-[#14a6d9] uppercase tracking-widest">No results found</div>
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
  
  const exportChart = async (chartId, filename) => {
    try {
      const el = document.getElementById(chartId);
      if (el) {
        const originalBg = el.style.backgroundColor;
        el.style.backgroundColor = '#0a2442'; // Force background for capture
        const canvas = await html2canvas(el, { backgroundColor: '#0a2442', scale: 2, useCORS: true, allowTaint: true, logging: false });
        el.style.backgroundColor = originalBg;
        
        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert('Chart element not found.');
      }
    } catch (err) {
      console.error('Error exporting chart:', err);
      alert('Error exporting chart. Please try again.');
    }
  };

  // Data enrichment (Add Week)
  const enrichedData = useMemo(() => {
     if(!adData) return [];
     return adData.map(d => ({
        ...d,
        week: d.dateObj ? getWeekNumber(d.dateObj) : 'Unknown',
        market: d.country || 'Unknown'
     })).filter(d => d.week !== 'Unknown');
  }, [adData]);

  // Filters State
  const [fChannels, setFChannels] = useState([]);
  const [fMarkets, setFMarkets] = useState([]);

  // Extract distinct filter options
  const optChannels = useMemo(() => Array.from(new Set(enrichedData.map(d => d.channel).filter(Boolean))).sort(), [enrichedData]);
  const optMarkets = useMemo(() => Array.from(new Set(enrichedData.map(d => d.market).filter(Boolean))).sort(), [enrichedData]);

  // Apply filters
  const filteredData = useMemo(() => {
    return enrichedData.filter(d => {
       const mChan = fChannels.length === 0 || fChannels.includes(d.channel);
       const mMarket = fMarkets.length === 0 || fMarkets.includes(d.market);
       return mChan && mMarket;
    });
  }, [enrichedData, fChannels, fMarkets]);

  const AVAILABLE_METRICS = useMemo(() => {
    const base = [
      { key: 'cost', label: 'Spend', format: v => `${exSym}${d3.format(",.2f")((v||0) * exRate)}` },
      { key: 'impressions', label: 'Impressions', format: v => d3.format(",")((v||0)) },
      { key: 'clicks', label: 'Clicks', format: v => d3.format(",")((v||0)) },
      { key: 'purchases', label: 'Conversions', format: v => d3.format(",")((v||0)) },
      { key: 'cpa', label: 'CPA', format: v => `${exSym}${d3.format(",.2f")((v||0) * exRate)}` },
      { key: 'cr', label: 'CR', format: v => `${(v||0).toFixed(2)}%` },
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
      return base.filter(m => !['cost', 'cpc', 'cpm', 'cpv', 'cpcv', 'cpa'].includes(m.key));
    }
    return base;
  }, [exRate, exSym, userRole]);
  
  const DIMENSIONS = [
    { key: 'date', label: 'Daily Date' },
    { key: 'week', label: 'Week' },
    { key: 'market', label: 'Market' },
    { key: 'campaignName', label: 'Campaign' },
    { key: 'channel', label: 'Channel' },
    { key: 'phase', label: 'Event Phase' }
  ];
  
  const PIE_DIMENSIONS = DIMENSIONS.filter(d => d.key !== 'date' && d.key !== 'week' && d.key !== 'campaignName');

  // Custom Chart State
  const [chartDimX, setChartDimX] = useState('date');
  const [chartMetric1, setChartMetric1] = useState(userRole === 'non-finance' ? 'impressions' : 'cost');
  const [chartMetric2, setChartMetric2] = useState('clicks');
  
  const [pieDim, setPieDim] = useState('channel');
  const [pieMetric, setPieMetric] = useState(userRole === 'non-finance' ? 'impressions' : 'cost');
  
  const [tableDims, setTableDims] = useState(['week', 'market', 'campaignName', 'channel']);
  const [selectedMetrics, setSelectedMetrics] = useState(
    userRole === 'non-finance' ? ['impressions', 'clicks', 'purchases'] : ['cost', 'impressions', 'clicks', 'purchases']
  );

  // Dynamic Line Chart Data
  const dynamicChartData = useMemo(() => {
      let grouped;
      if (chartDimX === 'date') {
          grouped = d3.groups(filteredData, d => d.dateObj ? d3.timeFormat("%b %d")(d.dateObj) : 'Unknown');
      } else {
          grouped = d3.groups(filteredData, d => d[chartDimX] || 'Unknown');
      }
      return grouped.map(([dim, vals]) => {
          const m1Def = AVAILABLE_METRICS.find(m => m.key === chartMetric1);
          const m2Def = AVAILABLE_METRICS.find(m => m.key === chartMetric2);
          
          let m1Val = d3.sum(vals, d => d[chartMetric1] || 0);
          if (chartMetric1 === 'cost') m1Val *= exRate;
          if (['ctr', 'cpc', 'cpm', 'cpv', 'cpcv', 'cpa', 'cr'].includes(chartMetric1)) {
             // For rates, this simple sum doesn't work perfectly, but for demonstration:
             if (chartMetric1 === 'ctr') m1Val = d3.sum(vals, d => d.impressions) > 0 ? (d3.sum(vals, d => d.clicks) / d3.sum(vals, d => d.impressions)) * 100 : 0;
             if (chartMetric1 === 'cpc') m1Val = d3.sum(vals, d => d.clicks) > 0 ? (d3.sum(vals, d => d.cost) * exRate) / d3.sum(vals, d => d.clicks) : 0;
             if (chartMetric1 === 'cpm') m1Val = d3.sum(vals, d => d.impressions) > 0 ? ((d3.sum(vals, d => d.cost) * exRate) / d3.sum(vals, d => d.impressions)) * 1000 : 0;
             if (chartMetric1 === 'cpa') m1Val = d3.sum(vals, d => d.purchases) > 0 ? (d3.sum(vals, d => d.cost) * exRate) / d3.sum(vals, d => d.purchases) : 0;
             if (chartMetric1 === 'cr') m1Val = d3.sum(vals, d => d.clicks) > 0 ? (d3.sum(vals, d => d.purchases) / d3.sum(vals, d => d.clicks)) * 100 : 0;
          }

          let m2Val = d3.sum(vals, d => d[chartMetric2] || 0);
          if (chartMetric2 === 'cost') m2Val *= exRate;
          if (['ctr', 'cpc', 'cpm', 'cpv', 'cpcv', 'cpa', 'cr'].includes(chartMetric2)) {
             if (chartMetric2 === 'ctr') m2Val = d3.sum(vals, d => d.impressions) > 0 ? (d3.sum(vals, d => d.clicks) / d3.sum(vals, d => d.impressions)) * 100 : 0;
             if (chartMetric2 === 'cpc') m2Val = d3.sum(vals, d => d.clicks) > 0 ? (d3.sum(vals, d => d.cost) * exRate) / d3.sum(vals, d => d.clicks) : 0;
             if (chartMetric2 === 'cpm') m2Val = d3.sum(vals, d => d.impressions) > 0 ? ((d3.sum(vals, d => d.cost) * exRate) / d3.sum(vals, d => d.impressions)) * 1000 : 0;
             if (chartMetric2 === 'cpa') m2Val = d3.sum(vals, d => d.purchases) > 0 ? (d3.sum(vals, d => d.cost) * exRate) / d3.sum(vals, d => d.purchases) : 0;
             if (chartMetric2 === 'cr') m2Val = d3.sum(vals, d => d.clicks) > 0 ? (d3.sum(vals, d => d.purchases) / d3.sum(vals, d => d.clicks)) * 100 : 0;
          }

          return {
              dim,
              sortDate: chartDimX === 'date' ? (vals[0].dateObj || 0) : 0,
              [m1Def?.label || 'M1']: m1Val,
              [m2Def?.label || 'M2']: m2Val,
          };
      }).filter(d => d.dim !== 'Unknown').sort((a,b) => {
         if (chartDimX === 'date') return a.sortDate - b.sortDate;
         const m1Label = AVAILABLE_METRICS.find(m => m.key === chartMetric1)?.label || 'M1';
         return b[m1Label] - a[m1Label];
      });
  }, [filteredData, chartDimX, chartMetric1, chartMetric2, exRate, AVAILABLE_METRICS]);

  // Dynamic Pie Chart Data
  const dynamicPieData = useMemo(() => {
      const grouped = d3.groups(filteredData, d => d[pieDim] || 'Unknown');
      return grouped.map(([dim, vals]) => {
          let val = d3.sum(vals, d => d[pieMetric] || 0);
          if (pieMetric === 'cost') val *= exRate;
          return {
              name: dim,
              value: val
          };
      }).filter(d => d.name !== 'Unknown').sort((a,b) => b.value - a.value);
  }, [filteredData, pieDim, pieMetric, exRate]);


  // Dynamic Table Aggregation
  const dynamicTableData = useMemo(() => {
      const mappedData = filteredData.map(d => {
          const row = {
             cost: d.cost || 0,
             impressions: d.impressions || 0,
             clicks: d.clicks || 0,
             purchases: d.purchases || 0,
             videoViews: d.videoViews || 0,
             videoViews6s: d.videoViews6s || 0,
             videoViews15s: d.videoViews15s || 0,
             videoCompletions: d.videoCompletions || 0
          };
          tableDims.forEach(dim => {
             row[dim] = d[dim] || 'Unknown';
          });
          return row;
      });

      // Group dynamically
      const groupFuncs = tableDims.map(dim => (d => d[dim]));
      let grouped = d3.groups(mappedData, ...groupFuncs);
      
      const flattenGroups = (groupsArr, currentDims) => {
         let rows = [];
         groupsArr.forEach(item => {
             if (Array.isArray(item) && item.length === 2 && Array.isArray(item[1]) && !item[1][0]?.hasOwnProperty('cost')) {
                 const newDims = { ...currentDims, [tableDims[Object.keys(currentDims).length]]: item[0] };
                 rows = rows.concat(flattenGroups(item[1], newDims));
             } else if (Array.isArray(item) && item.length === 2) {
                 const newDims = { ...currentDims, [tableDims[Object.keys(currentDims).length]]: item[0] };
                 const items = item[1];
                 const impressions = d3.sum(items, i => i.impressions);
                 const clicks = d3.sum(items, i => i.clicks);
                 const purchases = d3.sum(items, i => i.purchases);
                 const cost = d3.sum(items, i => i.cost);
                 const videoViews = d3.sum(items, i => i.videoViews);
                 const videoCompletions = d3.sum(items, i => i.videoCompletions);
                 rows.push({
                     ...newDims,
                     cost,
                     impressions,
                     clicks,
                     purchases,
                     videoViews,
                     videoViews6s: d3.sum(items, i => i.videoViews6s),
                     videoViews15s: d3.sum(items, i => i.videoViews15s),
                     videoCompletions,
                     ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                     cpm: impressions > 0 ? (cost / impressions) * 1000 : 0,
                     cpc: clicks > 0 ? cost / clicks : 0,
                     cpv: videoViews > 0 ? cost / videoViews : 0,
                     cpcv: videoCompletions > 0 ? cost / videoCompletions : 0,
                     cpa: purchases > 0 ? cost / purchases : 0,
                     cr: clicks > 0 ? (purchases / clicks) * 100 : 0
                 });
             } else if (item.hasOwnProperty('cost')) { // single row case
                const impressions = item.impressions;
                 const clicks = item.clicks;
                 const cost = item.cost;
                 rows.push({
                     ...currentDims,
                     ...item,
                     ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                     cpm: impressions > 0 ? (cost / impressions) * 1000 : 0,
                     cpc: clicks > 0 ? cost / clicks : 0,
                     cpa: (item.purchases > 0 && cost) ? cost / item.purchases : 0,
                     cr: clicks > 0 ? ((item.purchases || 0) / clicks) * 100 : 0,
                 });
             }
         });
         return rows;
      };

      let rows = flattenGroups(grouped, {});
      
      // Sort rows
      return rows.sort((a,b) => {
         return (b.impressions || 0) - (a.impressions || 0);
      });
  }, [filteredData, tableDims]);

  const exportCSV = () => {
     if (dynamicTableData.length === 0) return;
     const headers = [...tableDims.map(d => DIMENSIONS.find(x => x.key === d)?.label || d), ...selectedMetrics.map(m => AVAILABLE_METRICS.find(x => x.key === m)?.label || m)];
     let csv = headers.join(",") + "\r\n";
     dynamicTableData.forEach(row => {
        let csvRow = [];
        tableDims.forEach(d => csvRow.push(`"${row[d]}"`));
        selectedMetrics.forEach(m => {
           const val = row[m];
           const mDef = AVAILABLE_METRICS.find(x => x.key === m);
           csvRow.push(mDef ? `"${String(mDef.format(val)).replace(/,/g, '')}"` : `"${val}"`);
        });
        csv += csvRow.join(",") + "\r\n";
     });
     const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv);
     const link = document.createElement("a");
     link.setAttribute("href", encodedUri);
     link.setAttribute("download", "Detailed_Custom_Data.csv");
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  const chartInsights = useMemo(() => {
     if (!dynamicChartData.length) return "No data available for the selected parameters.";
     const m1Def = AVAILABLE_METRICS.find(m => m.key === chartMetric1);
     const m2Def = AVAILABLE_METRICS.find(m => m.key === chartMetric2);
     const m1Label = m1Def?.label || 'Metric 1';
     const m2Label = m2Def?.label || 'Metric 2';
     
     const topM1 = [...dynamicChartData].sort((a,b) => b[m1Label] - a[m1Label])[0];
     const topM2 = [...dynamicChartData].sort((a,b) => b[m2Label] - a[m2Label])[0];
     
     return `Peak ${m1Label} occurs at ${topM1.dim} with ${m1Def.format(topM1[m1Label])}. Meanwhile, the highest ${m2Label} was recorded at ${topM2.dim} reaching ${m2Def.format(topM2[m2Label])}. Focus your budget and optimizations toward ${topM1.dim} to maximize performance returns.`;
  }, [dynamicChartData, chartMetric1, chartMetric2, AVAILABLE_METRICS]);

  const pieInsights = useMemo(() => {
     if (!dynamicPieData.length) return "No data available for the selected parameters.";
     const total = d3.sum(dynamicPieData, d => d.value);
     const top = dynamicPieData[0];
     const mDef = AVAILABLE_METRICS.find(m => m.key === pieMetric);
     const percentage = total > 0 ? ((top.value / total) * 100).toFixed(1) : 0;
     const metricLabel = mDef?.label || 'Metric';
     const dimLabel = PIE_DIMENSIONS.find(d => d.key === pieDim)?.label || pieDim;
     
     return `The top ${dimLabel} is ${top.name}, generating ${percentage}% of total ${metricLabel} (${mDef?.format(top.value) || top.value}).`;
  }, [dynamicPieData, pieMetric, pieDim, AVAILABLE_METRICS, PIE_DIMENSIONS]);

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out] mb-24">
      
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 card-surface !overflow-visible backdrop-blur-2xl/80 backdrop-blur-xl p-8 rounded-[2rem] border border-[#cedc28]/20 shadow-2xl relative z-[60]">
        <div className="absolute top-0 left-0 w-32 h-32 bg-[#74FA93]/5 rounded-full blur-3xl -ml-10 -mt-10"></div>
        <div className="relative z-10">
           <h2 className="text-3xl font-bold text-white flex items-center gap-3">
             <Filter className="text-[#cedc28] w-8 h-8" /> Custom Data Hub
           </h2>
           <p className="text-[#14a6d9] text-sm mt-2 font-medium tracking-wide">Advanced slicing, goal tracking, and export suite.</p>
        </div>
        
        <div className="flex flex-wrap gap-4 items-center w-full xl:w-auto relative z-50">
           <MultiSelectDropdown label="Market" options={optMarkets} selected={fMarkets} onChange={setFMarkets} />
           <MultiSelectDropdown label="Channel" options={optChannels} selected={fChannels} onChange={setFChannels} />
        </div>
      </div>

      {/* DYNAMIC CHARTS */}
      {filteredData.length > 0 ? (
         <>
           <div className="flex flex-col gap-8 export-slide" data-title="Performance & Channel Mix">
              <div id="dynamic-comparison-chart" className="card-surface !overflow-visible border border-[rgba(206,220,40,0.1)] rounded-[2rem] p-8 shadow-xl flex flex-col w-full relative z-[50]">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 relative z-30">
                     <h3 className="text-lg font-bold text-white flex items-center gap-2 uppercase tracking-widest text-sm whitespace-nowrap">
                       <TrendingUp className="text-[#cedc28] w-5 h-5" /> Dynamic Comparison
                       <button data-html2canvas-ignore="true" type="button" onClick={() => exportChart('dynamic-comparison-chart', 'Dynamic_Comparison')} className="ml-2 p-1.5 hover:bg-[rgba(206,220,40,0.1)] rounded-lg transition-colors text-[#14a6d9] relative z-50 cursor-pointer" title="Download Chart">
                         <Camera className="w-4 h-4" />
                       </button>
                     </h3>
                     <div data-html2canvas-ignore="true" className="flex flex-wrap items-center gap-3 w-full md:w-auto relative z-[50]">
                        <MultiSelectDropdown label="X-Axis" options={DIMENSIONS} selected={chartDimX} onChange={setChartDimX} singleSelect className="relative min-w-[150px]" />
                        <MultiSelectDropdown label="Primary Metric" options={AVAILABLE_METRICS} selected={chartMetric1} onChange={setChartMetric1} singleSelect className="relative min-w-[180px]" />
                        <MultiSelectDropdown label="Secondary Metric" options={AVAILABLE_METRICS} selected={chartMetric2} onChange={setChartMetric2} singleSelect className="relative min-w-[180px]" />
                     </div>
                 </div>
                 
                 <div className="h-96 w-full mb-6 relative z-10">
                   <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={dynamicChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                       <XAxis dataKey="dim" stroke="#14a6d9" fontSize={12} tickLine={false} axisLine={false} />
                       <YAxis yAxisId="left" stroke="#74FA93" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                       <YAxis yAxisId="right" orientation="right" stroke="#cedc28" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                       <RechartsTooltip contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
                       <Legend wrapperStyle={{ paddingTop: '20px' }} />
                       <Line yAxisId="left" type="monotone" name={AVAILABLE_METRICS.find(m => m.key === chartMetric1)?.label} dataKey={AVAILABLE_METRICS.find(m => m.key === chartMetric1)?.label || 'M1'} stroke="#74FA93" strokeWidth={4} dot={false} activeDot={{r:8, fill: '#74FA93', stroke: '#0C272D', strokeWidth: 2}} />
                       <Line yAxisId="right" type="monotone" name={AVAILABLE_METRICS.find(m => m.key === chartMetric2)?.label} dataKey={AVAILABLE_METRICS.find(m => m.key === chartMetric2)?.label || 'M2'} stroke="#cedc28" strokeWidth={4} dot={false} activeDot={{r:8, fill: '#cedc28', stroke: '#0C272D', strokeWidth: 2}} />
                     </LineChart>
                   </ResponsiveContainer>
                 </div>
                 
                 <div className="bg-[rgba(10,36,66,0.5)] border border-[rgba(20,166,217,0.2)] rounded-xl p-5 flex gap-3 items-start mt-auto relative z-10">
                    <Zap className="text-[#cedc28] w-6 h-6 flex-shrink-0 mt-0.5" />
                    <p className="text-base text-[#eef7f5] leading-relaxed font-medium">{chartInsights}</p>
                 </div>
              </div>

              <div id="dynamic-split-chart" className="card-surface !overflow-visible border border-[rgba(206,220,40,0.1)] rounded-[2rem] p-8 shadow-xl flex flex-col w-full relative z-[40]">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 relative z-30">
                     <h3 className="text-lg font-bold text-white flex items-center gap-2 uppercase tracking-widest text-sm">
                       <Activity className="text-[#cedc28] w-5 h-5" /> Dynamic Split
                       <button data-html2canvas-ignore="true" type="button" onClick={() => exportChart('dynamic-split-chart', 'Dynamic_Split')} className="ml-2 p-1.5 hover:bg-[rgba(206,220,40,0.1)] rounded-lg transition-colors text-[#14a6d9] relative z-50 cursor-pointer" title="Download Chart">
                         <Camera className="w-4 h-4" />
                       </button>
                     </h3>
                     <div data-html2canvas-ignore="true" className="flex flex-wrap items-center gap-3 w-full md:w-auto relative z-[50]">
                        <MultiSelectDropdown label="Split By" options={PIE_DIMENSIONS} selected={pieDim} onChange={setPieDim} singleSelect className="relative min-w-[150px]" />
                        <MultiSelectDropdown label="Metric" options={AVAILABLE_METRICS} selected={pieMetric} onChange={setPieMetric} singleSelect className="relative min-w-[180px]" />
                     </div>
                 </div>
                 <div className="flex flex-col lg:flex-row items-center gap-8 w-full mt-auto relative z-10">
                   <div className="h-[400px] w-full lg:w-1/2 flex items-center justify-center">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                         <Pie data={dynamicPieData} innerRadius="55%" outerRadius="75%" paddingAngle={5} dataKey="value" stroke="none">
                           {dynamicPieData.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                         </Pie>
                         <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '16px', fontSize: '14px', fontWeight: 'bold' }}
                            formatter={(val, name, props) => {
                               const total = d3.sum(dynamicPieData, d => d.value);
                               const percent = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                               const mDef = AVAILABLE_METRICS.find(m => m.key === pieMetric);
                               return [`${mDef ? mDef.format(val) : val} (${percent}%)`, name];
                            }}
                         />
                         <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '12px', fontWeight: '500', paddingTop: '10px' }} />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                   <div className="w-full lg:w-1/2">
                     <div className="bg-[rgba(10,36,66,0.5)] border border-[rgba(206,220,40,0.2)] rounded-xl p-6 flex gap-4 items-start shadow-[0_10px_30px_rgba(206,220,40,0.05)]">
                        <div className="bg-[rgba(206,220,40,0.1)] p-3 rounded-full flex-shrink-0">
                           <Zap className="text-[#cedc28] w-6 h-6" />
                        </div>
                        <div className="flex flex-col">
                           <h4 className="text-sm text-[#cedc28] font-bold uppercase tracking-widest mb-2">Split Insight</h4>
                           <p className="text-base text-[#eef7f5] leading-relaxed font-medium">{pieInsights}</p>
                        </div>
                     </div>
                   </div>
                 </div>
              </div>
           </div>

           {/* Data Table */}
           <div className="card-surface !overflow-visible backdrop-blur-2xl/80 backdrop-blur-xl border border-[#cedc28]/10 rounded-[2rem] p-8 shadow-xl overflow-visible export-slide relative z-[30]" data-title="Data Breakdown">
              <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-8 gap-6 relative z-30">
                 <h3 className="text-lg font-bold text-white flex items-center gap-2 uppercase tracking-widest text-sm">
                    <TableProperties className="text-[#cedc28] w-5 h-5" /> Data Breakdown
                 </h3>
                 <div className="flex flex-wrap items-center gap-3 relative z-30">
                   <MultiSelectDropdown 
                     label="Dimensions"
                     options={DIMENSIONS} 
                     selected={tableDims} 
                     onChange={setTableDims} 
                     className="relative min-w-[200px]"
                   />
                   <MultiSelectDropdown 
                     label="Metrics"
                     options={AVAILABLE_METRICS} 
                     selected={selectedMetrics} 
                     onChange={setSelectedMetrics} 
                     className="relative min-w-[200px]"
                   />
                   <button onClick={exportCSV} className="h-[44px] px-6 bg-[#0a2442] border border-[#cedc28]/30 rounded-xl text-[#cedc28] font-bold text-sm hover:bg-[#cedc28]/10 transition-colors shadow-[0_0_15px_rgba(200,130,20,0.1)] flex items-center gap-2 mt-5">
                     <Download className="w-4 h-4" /> Export CSV
                   </button>
                 </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar relative z-10 pb-4">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                     <thead>
                        <tr className="border-b border-[#cedc28]/20">
                           {tableDims.map((dim) => (
                             <th key={dim} className="py-4 px-4 text-[#14a6d9] font-bold text-xs uppercase tracking-widest whitespace-nowrap">
                               {DIMENSIONS.find(d => d.key === dim)?.label || dim}
                             </th>
                           ))}
                           {selectedMetrics.map((metricKey) => {
                              const mDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                              if (!mDef) return null;
                              return (
                                <th key={metricKey} className="py-4 px-4 text-[#14a6d9] font-bold text-xs uppercase tracking-widest text-right whitespace-nowrap">
                                  {mDef.label}
                                </th>
                              )
                           })}
                        </tr>
                     </thead>
                     <tbody>
                        {dynamicTableData.slice(0, 100).map((d, i) => (
                           <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              {tableDims.map((dim, idx) => (
                                 <td key={dim} className={`py-4 px-4 text-sm whitespace-nowrap ${idx === 0 ? 'text-[#cedc28] font-bold' : 'text-white font-medium'}`}>
                                    {d[dim]}
                                 </td>
                              ))}
                              {selectedMetrics.map((metricKey) => {
                                 const mDef = AVAILABLE_METRICS.find(m => m.key === metricKey);
                                 if (!mDef) return null;
                                 return (
                                   <td key={metricKey} className="py-4 px-4 text-white text-sm font-bold text-right whitespace-nowrap">
                                     {mDef.format(d[metricKey])}
                                   </td>
                                 )
                              })}
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {dynamicTableData.length > 100 && (
                     <div className="text-center text-[#14a6d9] text-xs font-bold mt-6 uppercase tracking-widest">
                       Showing first 100 rows. Export report for full data.
                     </div>
                  )}
                  {dynamicTableData.length === 0 && (
                     <div className="text-center text-[#14a6d9] text-xs font-bold mt-6 uppercase tracking-widest">
                       No data to display. Please select at least one dimension.
                     </div>
                  )}
              </div>
           </div>
         </>
      ) : (
         <div className="card-surface backdrop-blur-2xl/50 p-16 rounded-[2rem] border border-[#cedc28]/10 text-center flex flex-col items-center justify-center">
            <AlertCircle className="w-16 h-16 text-[#007542] mb-6 opacity-80" />
            <h3 className="text-3xl font-anton uppercase text-white">No data matches your filters</h3>
            <p className="text-[#14a6d9] mt-2 font-medium">Try clearing some selections to see results.</p>
         </div>
      )}
    </div>
  );
}
