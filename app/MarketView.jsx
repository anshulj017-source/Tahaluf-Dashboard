'use client';

import React, { useState, useMemo } from 'react';

import * as d3 from 'd3';
import { Eye, DollarSign, Activity, TrendingUp, BarChart3, Target, CheckCircle2, Globe2, MousePointer2, ChevronDown, Search, Check, Camera, Download, ShoppingCart, Zap } from 'lucide-react';
import html2canvas from 'html2canvas';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const COLORS = ['#74FA93', '#cedc28', '#00937b', '#eef7f5', '#007542'];

const MetricMultiSelectDropdown = ({ options, selectedKeys, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const filtered = options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()));
  const selectedLabels = selectedKeys.map(k => options.find(o => o.key === k)?.label).filter(Boolean);

  return (
    <div className="relative min-w-[200px] z-30">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-[#0a2442] border border-[#cedc28]/30 rounded-lg text-xs font-bold text-[#eef7f5] cursor-pointer flex justify-between items-center hover:border-[#cedc28] transition-colors"
      >
        <span className="truncate pr-2">{selectedKeys.length === options.length ? 'All Metrics' : (selectedLabels.join(', ') || 'Select metrics')}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute top-full right-0 w-[240px] mt-2 z-50">
          <div className="w-full bg-[#0a2442] border border-[#cedc28]/30 rounded-xl shadow-2xl flex flex-col max-h-64 overflow-hidden">
            <div className="p-2 border-b border-[#cedc28]/10 relative">
              <Search className="w-4 h-4 text-[#14a6d9] absolute left-4 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search..." autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-[#0a2442] text-[#eef7f5] text-xs font-bold pl-9 pr-3 py-2 rounded-lg outline-none border border-transparent focus:border-[#cedc28]/50" />
            </div>
            <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
              <div onClick={() => { onChange(options.map(o => o.key)); setIsOpen(false); setSearchTerm(''); }} className={`px-3 py-2 rounded-lg text-sm font-bold cursor-pointer flex justify-between ${selectedKeys.length === options.length ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}>
                All <Check className={`w-4 h-4 ${selectedKeys.length === options.length ? 'opacity-100' : 'opacity-0'}`} />
              </div>
              {filtered.map(opt => {
                const isSel = selectedKeys.includes(opt.key);
                return (
                  <div key={opt.key} onClick={() => {
                    let next = [...selectedKeys];
                    if (isSel) {
                      next = next.filter(n => n !== opt.key);
                    } else { next.push(opt.key); }
                    onChange(next);
                  }} className={`px-3 py-2 mt-1 rounded-lg text-sm font-bold cursor-pointer flex justify-between ${isSel ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}>
                    <span className="truncate pr-2">{opt.label}</span> <Check className={`w-4 h-4 flex-shrink-0 ${isSel ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>}
    </div>
  );
};

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
  const [selectedMetrics, setSelectedMetrics] = useState(userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'purchases', 'cr'] : ['spend', 'impressions', 'clicks', 'ctr', 'cpm', 'purchases', 'cpa', 'cr']);
  const [channelMetric, setChannelMetric] = useState(userRole === 'non-finance' ? 'impressions' : 'spend'); // For chart 2
  const [trendMetric, setTrendMetric] = useState(userRole === 'non-finance' ? 'impressions' : 'spend'); // For chart 1

  const exportChart = async (chartId, filename) => {
    try {
      const el = document.getElementById(chartId);
      if (el) {
        const canvas = await html2canvas(el, { backgroundColor: '#0a2442', scale: 2 });
        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportDetailedMetrics = () => {
    try {
      let csvContent = "data:text/csv;charset=utf-8,Event Phase,Market,";
      const metricsToExport = AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key));
      csvContent += metricsToExport.map(m => m.label).join(",") + "\n";
      
      campaignBreakdown.forEach(row => {
        let line = `"${row.campaign}","${row.country}",`;
        line += metricsToExport.map(m => {
          if (m.key === 'sessions') return 'N/A';
          return `"${m.format(row[m.key]).toString().replace(/"/g, '""')}"`;
        }).join(",");
        csvContent += line + "\n";
      });
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "market_detailed_metrics.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
    }
  };

  const AVAILABLE_METRICS = useMemo(() => {
    const base = [
      { key: 'spend', label: 'Spend', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'impressions', label: 'Impressions', format: v => d3.format(",")(v) },
      { key: 'clicks', label: 'Clicks', format: v => d3.format(",")(v) },
      { key: 'purchases', label: 'Conversions', format: v => d3.format(",")(v) },
      { key: 'cpa', label: 'CPA', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'cr', label: 'CR', format: v => `${v.toFixed(2)}%` },
      { key: 'views', label: 'Video Views', format: v => d3.format(",")(v) },
      { key: 'views6s', label: '6s Views', format: v => d3.format(",")(v) },
      { key: 'views15s', label: '15s Views', format: v => d3.format(",")(v) },
      { key: 'completions', label: 'Completed Views', format: v => d3.format(",")(v) },
      /* { key: 'sessions', label: 'Paid GA4 Sessions', format: v => d3.format(",")(v) }, */
      { key: 'cpc', label: 'CPC', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'cpm', label: 'CPM', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'ctr', label: 'CTR', format: v => `${v.toFixed(2)}%` },
      { key: 'cpv', label: 'CPV', format: v => `${exSym}${d3.format(",.4f")(v * exRate)}` },
      { key: 'cpcv', label: 'CPCV', format: v => `${exSym}${d3.format(",.4f")(v * exRate)}` }
    ];
    if (userRole === 'non-finance') {
      return base.filter(m => !['spend', 'cpc', 'cpm', 'cpv', 'cpcv', 'cpa'].includes(m.key));
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
      const purchases = d3.sum(vals, d => d.purchases);
      const views = d3.sum(vals, d => d.videoViews);
      const sessions = gaGrouped.get(country) || 0;
      
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : Infinity;
      const cpc = clicks > 0 ? (spend / clicks) : Infinity;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpv = views > 0 ? (spend / views) : Infinity;
      const cpa = purchases > 0 ? (spend / purchases) : 0;
      const cr = clicks > 0 ? (purchases / clicks) * 100 : 0;

      return {
        country,
        spend,
        impressions,
        clicks,
        purchases,
        views,
        sessions,
        cpm,
        cpc,
        ctr,
        cpv,
        cpa,
        cr,
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
    const byClicks = [...marketStats].sort((a, b) => b.clicks - a.clicks)[0];
    const byPurchases = [...marketStats].sort((a, b) => b.purchases - a.purchases)[0];

    return { spend: bySpend, impressions: byImp, clicks: byClicks, purchases: byPurchases };
  }, [marketStats]);

  const handleMarketToggle = (m) => {
    if (selectedMarkets.includes(m)) {
      setSelectedMarkets(selectedMarkets.filter(c => c !== m));
    } else {
      setSelectedMarkets([...selectedMarkets, m]);
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

  // Daily trend for selected markets
  const trendData = useMemo(() => {
    if (selectedMarketAdData.length === 0 && selectedMarketGaData.length === 0) return [];
    
    const dateMap = new Map();
    const adGrouped = d3.groups(selectedMarketAdData, d => d.country, d => {
       const key = d.dateObj ? d3.timeFormat("%Y-%m-%d")(d.dateObj) : 'Unknown';
       if(key !== 'Unknown') dateMap.set(key, d.dateObj);
       return key;
    });
    const gaGrouped = d3.groups(selectedMarketGaData, d => d.country, d => {
       const key = d.dateObj ? d3.timeFormat("%Y-%m-%d")(d.dateObj) : 'Unknown';
       if(key !== 'Unknown') dateMap.set(key, d.dateObj);
       return key;
    });

    const sortedKeys = Array.from(dateMap.keys()).sort((a, b) => dateMap.get(a) - dateMap.get(b));

    return sortedKeys.map(key => {
      const displayDate = d3.timeFormat("%b %d")(dateMap.get(key));
      const row = { date: displayDate };
      selectedMarkets.forEach(country => {
         let val = 0;
         if (trendMetric === 'sessions') {
            const countryGa = gaGrouped.find(g => g[0] === country);
            if (countryGa) {
               const dayGa = countryGa[1].find(m => m[0] === key);
               if (dayGa) val = d3.sum(dayGa[1], d => d.sessions);
            }
         } else {
            const countryAd = adGrouped.find(g => g[0] === country);
            if (countryAd) {
               const dayAd = countryAd[1].find(m => m[0] === key);
               if (dayAd) {
                  if (trendMetric === 'spend') val = d3.sum(dayAd[1], d => d.cost) * exRate;
                  else if (trendMetric === 'impressions') val = d3.sum(dayAd[1], d => d.impressions);
                  else if (trendMetric === 'clicks') val = d3.sum(dayAd[1], d => d.clicks);
                  else if (trendMetric === 'purchases') val = d3.sum(dayAd[1], d => d.purchases);
                  else if (trendMetric === 'cpa') {
                    const p = d3.sum(dayAd[1], d => d.purchases);
                    val = p > 0 ? (d3.sum(dayAd[1], d => d.cost) * exRate) / p : 0;
                  }
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
    
    // Group by Country -> Phase
    const grouped = d3.groups(selectedMarketAdData, d => d.country, d => d.phase || d.campaignName);
    
    let flattened = [];
    grouped.forEach(([country, campaigns]) => {
      campaigns.forEach(([campaign, vals]) => {
        const impressions = d3.sum(vals, d => d.impressions);
        const clicks = d3.sum(vals, d => d.clicks);
        const spend = d3.sum(vals, d => d.cost);
        const purchases = d3.sum(vals, d => d.purchases);
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
          purchases,
          views,
          views6s,
          views15s,
          completions,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          cpv: views > 0 ? spend / views : 0,
          cpcv: completions > 0 ? spend / completions : 0,
          cpa: purchases > 0 ? spend / purchases : 0,
          cr: clicks > 0 ? (purchases / clicks) * 100 : 0
        });
      });
    });
    return flattened.sort((a,b) => b.spend - a.spend);
  }, [selectedMarketAdData]);

  const channelChartData = useMemo(() => {
     if (selectedMarketAdData.length === 0) return [];
     const grouped = d3.groups(selectedMarketAdData, d => d.channel);
     return grouped.map(([channel, vals]) => {
        const row = { channel, total: 0 };
        selectedMarkets.forEach(m => {
           const mVals = vals.filter(v => v.country === m);
           let val = 0;
           if (channelMetric === 'spend') val = d3.sum(mVals, d => d.cost) * exRate;
           else if (channelMetric === 'impressions') val = d3.sum(mVals, d => d.impressions);
           else if (channelMetric === 'clicks') val = d3.sum(mVals, d => d.clicks);
           else if (channelMetric === 'purchases') val = d3.sum(mVals, d => d.purchases);
           
           row[m] = val;
           row.total += val;
        });
        return row;
     }).sort((a,b) => b.total - a.total).slice(0, 7);
  }, [selectedMarketAdData, selectedMarkets, exRate, channelMetric]);


  const TrendTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0a2442] border border-[#cedc28]/30 p-4 rounded-xl shadow-xl">
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

  // AI Insights data
  const aiInsights = useMemo(() => {
    if (selectedMarkets.length === 0 || marketStats.length === 0) return null;
    const selectedData = marketStats.filter(m => selectedMarkets.includes(m.country));
    if (selectedData.length === 0) return null;
    
    const totalSpend = d3.sum(selectedData, d => d.spend) * exRate;
    const totalImpressions = d3.sum(selectedData, d => d.impressions);
    const totalClicks = d3.sum(selectedData, d => d.clicks);
    const totalPurchases = d3.sum(selectedData, d => d.purchases);
    const totalCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const totalCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
    
    const topBySpend = [...selectedData].sort((a,b) => b.spend - a.spend)[0];
    const topByImp = [...selectedData].sort((a,b) => b.impressions - a.impressions)[0];
    const topByConv = [...selectedData].sort((a,b) => b.purchases - a.purchases)[0];
    
    const lowestCPM = [...selectedData].filter(d => d.cpm > 0 && d.cpm !== Infinity).sort((a,b) => a.cpm - b.cpm)[0];
    const highestCTR = [...selectedData].sort((a,b) => b.ctr - a.ctr)[0];

    return { totalSpend, totalImpressions, totalClicks, totalPurchases, totalCTR, totalCPC, topBySpend, topByImp, topByConv, lowestCPM, highestCTR };
  }, [selectedMarkets, marketStats, exRate]);

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
      
      {/* HEADER & TOP CARDS */}
      {selectedMarkets.length === 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Globe2 className="text-[#cedc28] w-8 h-8" /> Market Overview
            </h2>
          </div>

          {topCards && (
            <div className={`grid grid-cols-1 md:grid-cols-2 ${userRole === 'non-finance' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`}>
              
              <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#cedc28]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Eye className="w-32 h-32 text-white" /></div>
                <p className="text-[#14a6d9] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Eye className="w-4 h-4 text-[#cedc28]"/> Top by Impressions</p>
                <p className="text-3xl font-anton uppercase text-white truncate flex items-center gap-2">
                   {getFlagEmoji(topCards.impressions?.country)} {topCards.impressions?.country}
                </p>
                <p className="text-[#cedc28] font-bold text-lg mt-2">{formatShort(topCards.impressions?.impressions || 0)} <span className="text-xs text-[#14a6d9] font-medium">Impressions</span></p>
              </div>

              <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#cedc28]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><MousePointer2 className="w-32 h-32 text-white" /></div>
                <p className="text-[#14a6d9] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><MousePointer2 className="w-4 h-4 text-[#cedc28]"/> Top by Clicks</p>
                <p className="text-3xl font-anton uppercase text-white truncate flex items-center gap-2">
                   {getFlagEmoji(topCards.clicks?.country)} {topCards.clicks?.country}
                </p>
                <p className="text-[#cedc28] font-bold text-lg mt-2">{formatShort(topCards.clicks?.clicks || 0)} <span className="text-xs text-[#14a6d9] font-medium">Clicks</span></p>
              </div>

              <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#cedc28]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Target className="w-32 h-32 text-white" /></div>
                <p className="text-[#14a6d9] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Target className="w-4 h-4 text-[#cedc28]"/> Top by Conversions</p>
                <p className="text-3xl font-anton uppercase text-white truncate flex items-center gap-2">
                   {getFlagEmoji(topCards.purchases?.country)} {topCards.purchases?.country}
                </p>
                <p className="text-[#cedc28] font-bold text-lg mt-2">{formatShort(topCards.purchases?.purchases || 0)} <span className="text-xs text-[#14a6d9] font-medium">Conversions</span></p>
              </div>

              {userRole !== 'non-finance' && (
                <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#cedc28]/50 transition-colors">
                  <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><DollarSign className="w-32 h-32 text-white" /></div>
                  <p className="text-[#14a6d9] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><DollarSign className="w-4 h-4 text-[#cedc28]"/> Top by Spend</p>
                  <p className="text-3xl font-anton uppercase text-white truncate flex items-center gap-2">
                     {getFlagEmoji(topCards.spend?.country)} {topCards.spend?.country}
                  </p>
                  <p className="text-[#cedc28] font-bold text-lg mt-2">{exSym}{formatShort((topCards.spend?.spend || 0) * exRate)} <span className="text-xs text-[#14a6d9] font-medium">Spend</span></p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MARKET SELECTION GRID */}
      <div className={`card-surface backdrop-blur-2xl border border-[#cedc28]/20 rounded-3xl p-6 md:p-8 transition-all ${selectedMarkets.length > 0 ? 'mt-0' : ''} export-slide`} data-title="Market Top Stats">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-2xl font-anton uppercase text-white">Compare Markets</h3>
            <p className="text-sm text-[#14a6d9]">Select markets to compare performance.</p>
          </div>
          {selectedMarkets.length > 0 && (
             <button 
                onClick={() => setSelectedMarkets([])}
                className="text-xs font-bold uppercase tracking-widest text-[#cedc28] hover:text-white bg-[#cedc28]/10 hover:bg-[#74FA93]/20 px-4 py-2 rounded-full transition-colors"
             >
                Clear Selection
             </button>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          {marketStats.map((m) => {
            const isSelected = selectedMarkets.includes(m.country);
            return (
              <button 
                key={m.country}
                onClick={() => handleMarketToggle(m.country)}
                className={`border rounded-full px-4 py-2 text-left transition-all duration-300 flex items-center justify-center
                  ${isSelected ? 'bg-[#74FA93]/20 border-[#cedc28] shadow-[0_0_15px_rgba(116,250,147,0.1)]' : 'bg-[#0a2442] border-[#cedc28]/20 hover:bg-[#cedc28]/10 hover:border-[#cedc28]/60 cursor-pointer'}
                `}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getFlagEmoji(m.country)}</span>
                  <h4 className={`text-xs font-bold transition-colors whitespace-nowrap ${isSelected ? 'text-[#cedc28]' : 'text-white'}`}>{m.country}</h4>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* DETAILED DRILL-DOWN VIEW */}
      {selectedMarkets.length > 0 && (
        <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
          
          {/* DAILY TREND CHART (Replaces KPI Matrix and old Comparison chart) */}
          <div id="export-trend-chart" className="card-surface backdrop-blur-2xl border border-[#cedc28]/20 rounded-3xl p-6 export-slide" data-title="Daily Trend">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="text-[#cedc28] w-5 h-5" /> Daily Comparison Trend
              </h3>
              <div className="flex items-center gap-2">
                <select 
                  value={trendMetric} 
                  onChange={(e) => setTrendMetric(e.target.value)}
                  className="bg-[#0a2442] text-[#cedc28] border border-[#cedc28]/30 rounded-lg px-3 py-1 text-xs font-bold outline-none"
                >
                  {userRole !== 'non-finance' && <option value="spend">Spend</option>}
                  <option value="impressions">Impressions</option>
                  <option value="clicks">Clicks</option>
                  <option value="purchases">Conversions</option>
                  {userRole !== 'non-finance' && <option value="cpa">CPA</option>}
                </select>
                <button onClick={() => exportChart('export-trend-chart', 'Daily_Comparison_Trend')} className="html2canvas-ignore p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Export Chart">
                  <Camera className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="h-80 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="date" stroke="#14a6d9" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#14a6d9" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatShort(v)} />
                  <RechartsTooltip content={<TrendTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  {selectedMarkets.map((country, idx) => (
                    <Line key={country} type="monotone" dataKey={country} name={country} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={{r:4, fill: '#0C272D', strokeWidth: 2}} activeDot={{r:6}} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* CHANNEL BREAKDOWN CHART (Left Side) */}
            <div id="export-channel-split" className="card-surface backdrop-blur-2xl border border-[#cedc28]/20 rounded-3xl p-6 export-slide" data-title="Market Channels Split">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart3 className="text-[#cedc28] w-5 h-5" /> Channel Budget Split
                </h3>
                <div className="flex items-center gap-2">
                  <select 
                    value={channelMetric} 
                    onChange={(e) => setChannelMetric(e.target.value)}
                    className="bg-[#0a2442] text-[#cedc28] border border-[#cedc28]/30 rounded-lg px-3 py-1 text-xs font-bold outline-none"
                  >
                    {userRole !== 'non-finance' && <option value="spend">Spend</option>}
                    <option value="impressions">Impressions</option>
                    <option value="clicks">Clicks</option>
                    <option value="purchases">Conversions</option>
                    {userRole !== 'non-finance' && <option value="cpa">CPA</option>}
                  </select>
                  <button onClick={() => exportChart('export-channel-split', 'Channel_Budget_Split')} className="html2canvas-ignore p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Export Chart">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="h-80 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelChartData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#14a6d9" fontSize={10} tickFormatter={(v) => formatShort(v)} />
                    <YAxis dataKey="channel" type="category" stroke="#14a6d9" fontSize={10} width={110} tickFormatter={(v) => v.length > 15 ? v.substring(0,15)+'...' : v} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '12px' }} 
                      cursor={{fill: '#ffffff05'}} 
                      formatter={(value, name) => [`${channelMetric === 'spend' ? exSym : ''}${d3.format(",.0f")(value)}`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    {selectedMarkets.map((country, idx) => (
                       <Bar key={country} dataKey={country} name={country} fill={COLORS[idx % COLORS.length]} stackId="a" radius={[0, 4, 4, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* AI INSIGHTS (Right Side) */}
            <div className="card-surface-gold p-8 rounded-3xl border border-[#cedc28]/30 shadow-2xl relative overflow-hidden export-slide" data-title="AI Insights">
              <div className="absolute top-0 right-0 p-8 opacity-10"><Zap className="w-32 h-32 text-[#cedc28]" /></div>
              <h3 className="text-xl font-bold text-white mb-5 flex items-center gap-3"><Zap className="text-[#cedc28] w-5 h-5"/> AI Performance Insights </h3>
              <div className="text-[#eef7f5] leading-relaxed max-w-5xl space-y-3 relative z-10 text-sm">
                {aiInsights && (
                  <>
                    <p>• In the selected markets, campaigns have generated <strong>{formatShort(aiInsights.totalImpressions)}</strong> impressions, <strong>{formatShort(aiInsights.totalClicks)}</strong> clicks, and <strong>{formatShort(aiInsights.totalPurchases)}</strong> conversions overall.</p>
                    {userRole !== 'non-finance' && (
                      <p>• Total spend across these markets is <strong>{exSym}{d3.format(",.0f")(aiInsights.totalSpend)}</strong> with an average CPC of <strong>{exSym}{aiInsights.totalCPC.toFixed(2)}</strong>.</p>
                    )}
                    {aiInsights.topBySpend && userRole !== 'non-finance' && (
                      <p>• <strong>{aiInsights.topBySpend.country} {getFlagEmoji(aiInsights.topBySpend.country)}</strong> is driving the highest spend at <strong>{exSym}{d3.format(",.0f")(aiInsights.topBySpend.spend * exRate)}</strong>.</p>
                    )}
                    {aiInsights.topByConv && aiInsights.topByConv.purchases > 0 && (
                      <p>• <strong>{aiInsights.topByConv.country} {getFlagEmoji(aiInsights.topByConv.country)}</strong> leads in conversions with <strong>{formatShort(aiInsights.topByConv.purchases)}</strong> completed purchases.</p>
                    )}
                    {aiInsights.lowestCPM && (
                      <p>• <strong>{aiInsights.lowestCPM.country} {getFlagEmoji(aiInsights.lowestCPM.country)}</strong> is the most cost-efficient market with a CPM of <strong>{exSym}{d3.format(",.2f")(aiInsights.lowestCPM.cpm * exRate)}</strong>.</p>
                    )}
                    {aiInsights.highestCTR && (
                      <p>• <strong>{aiInsights.highestCTR.country} {getFlagEmoji(aiInsights.highestCTR.country)}</strong> sees the highest engagement with a CTR of <strong>{aiInsights.highestCTR.ctr.toFixed(2)}%</strong>.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* TOURNAMENT DATA TABLE */}
          <div id="export-detailed-metrics" className="card-surface backdrop-blur-2xl border border-[#cedc28]/20 rounded-3xl p-6 overflow-hidden export-slide" data-title="Detailed Market Metrics">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
               <h3 className="text-lg font-bold text-white flex items-center gap-2">Detailed Event Phase Metrics</h3>
               <div className="flex items-center gap-4">
                 <div className="html2canvas-ignore">
                   <MetricMultiSelectDropdown 
                     options={AVAILABLE_METRICS}
                     selectedKeys={selectedMetrics}
                     onChange={setSelectedMetrics}
                   />
                 </div>
                 <button onClick={() => exportChart('export-detailed-metrics', 'Detailed_Event_Metrics')} className="html2canvas-ignore p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Export Image">
                   <Camera className="w-4 h-4" />
                 </button>
                 <button onClick={handleExportDetailedMetrics} className="html2canvas-ignore p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="Export CSV">
                   <Download className="w-4 h-4" />
                 </button>
               </div>
             </div>
             
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b-2 border-[#cedc28]/30">
                      <th className="px-4 py-3 text-xs font-bold text-[#14a6d9] uppercase tracking-wider sticky left-0 bg-[#0a2442] z-10">Event Phase</th>
                      <th className="px-4 py-3 text-xs font-bold text-[#14a6d9] uppercase tracking-wider">Market</th>
                      {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                         <th key={m.key} className="px-4 py-3 text-xs font-bold text-[#14a6d9] uppercase tracking-wider text-right">{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaignBreakdown.map((row, i) => (
                      <tr key={`${row.country}-${row.campaign}`} className={`border-b border-[#cedc28]/10 hover:bg-[#74FA93]/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-transparent'}`}>
                        <td className="px-4 py-4 text-sm font-bold text-white sticky left-0 z-10 bg-[#0a2442]">{row.campaign}</td>
                        <td className="px-4 py-4 text-sm font-bold text-[#14a6d9] flex items-center gap-2">
                           {getFlagEmoji(row.country)} {row.country}
                        </td>
                        {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                           <td key={m.key} className="px-4 py-4 text-sm font-medium text-[#cedc28] text-right">
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
                      const tPurchases = d3.sum(campaignBreakdown, d => d.purchases);
                      
                      const tSessions = d3.sum(selectedMarkets.map(m => marketStats.find(s => s.country === m)?.sessions || 0));

                      const totals = {
                        spend: tSpend,
                        impressions: tImp,
                        clicks: tClicks,
                        purchases: tPurchases,
                        views: tViews,
                        views6s: tViews6s,
                        views15s: tViews15s,
                        completions: tCompletions,
                        sessions: tSessions,
                        ctr: tImp > 0 ? (tClicks / tImp) * 100 : 0,
                        cpc: tClicks > 0 ? tSpend / tClicks : 0,
                        cpm: tImp > 0 ? (tSpend / tImp) * 1000 : 0,
                        cpv: tViews > 0 ? tSpend / tViews : 0,
                        cpcv: tCompletions > 0 ? tSpend / tCompletions : 0,
                        cpa: tPurchases > 0 ? tSpend / tPurchases : 0,
                        cr: tClicks > 0 ? (tPurchases / tClicks) * 100 : 0
                      };

                      return (
                         <tr className="bg-[#0a2442] border-t-2 border-[#cedc28]/50">
                            <td className="px-4 py-4 text-sm font-bold text-[#cedc28] sticky left-0 bg-[#0a2442] z-10">Total</td>
                            <td className="px-4 py-4 text-sm font-bold text-[#cedc28]"></td>
                            {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                               <td key={m.key} className="px-4 py-4 text-sm font-bold text-[#cedc28] text-right">
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
