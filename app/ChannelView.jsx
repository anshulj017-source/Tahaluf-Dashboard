'use client';

import { useState, useMemo } from 'react';

import * as d3 from 'd3';
import { Eye, MousePointer2, Play, Activity, TrendingUp, BarChart3, Target, CheckCircle2, ChevronDown, Search, Check, Camera, Download, Zap } from 'lucide-react';
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

export default function ChannelView({ adData, exRate = 1, exSym = '$', formatShort = (v) => v, userRole }) {
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState(userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'views', 'purchases', 'cr'] : ['spend', 'impressions', 'clicks', 'ctr', 'cpm', 'purchases', 'cpa', 'cr']);
  const [trendMetric, setTrendMetric] = useState(userRole === 'non-finance' ? 'impressions' : 'spend'); // spend, impressions, clicks, views

  const [sortConfig, setSortConfig] = useState({ key: 'spend', direction: 'desc' });

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const AVAILABLE_METRICS = useMemo(() => {
    const base = [
      { key: 'spend', label: 'Spend', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'impressions', label: 'Impressions', format: v => d3.format(",")(v) },
      { key: 'clicks', label: 'Clicks', format: v => d3.format(",")(v) },
      { key: 'views', label: 'Video Views', format: v => d3.format(",")(v) },
      { key: 'views6s', label: '6s Views', format: v => d3.format(",")(v) },
      { key: 'views15s', label: '15s Views', format: v => d3.format(",")(v) },
      { key: 'completions', label: 'Completed Views', format: v => d3.format(",")(v) },
      { key: 'purchases', label: 'Conversions', format: v => d3.format(",")(v) },
      { key: 'cpa', label: 'CPA', format: v => `${exSym}${d3.format(",.2f")(v * exRate)}` },
      { key: 'cr', label: 'CR', format: v => `${v.toFixed(2)}%` },
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
      const cpa = purchases > 0 ? (spend / purchases) : 0;
      const cr = clicks > 0 ? (purchases / clicks) * 100 : 0;

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
        cpa,
        cr,
        campaignsCount: new Set(vals.map(d => d.phase)).size
      };
    });
    return grouped.sort((a,b) => b.spend - a.spend);
  }, [adData]);

  // 2. Identify Top Performers for the "Trophy" cards
  const topCards = useMemo(() => {
    if (channelStats.length === 0) return null;
    
    const byImp = [...channelStats].sort((a, b) => b.impressions - a.impressions)[0];
    const byClicks = [...channelStats].sort((a, b) => b.clicks - a.clicks)[0];
    const byConversions = [...channelStats].sort((a, b) => b.purchases - a.purchases)[0];
    
    const validCpc = channelStats.filter(c => c.clicks > 100 && c.cpc !== Infinity);
    const byEfficiency = validCpc.sort((a, b) => a.cpc - b.cpc)[0] || channelStats[0];

    return { impressions: byImp, clicks: byClicks, conversions: byConversions, efficiency: byEfficiency };
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

  // 3. Detailed stats for the SELECTED channels (or all if none selected)
  const selectedChannelData = useMemo(() => {
    if (selectedChannels.length === 0) return adData;
    return adData.filter(d => selectedChannels.includes(d.channel));
  }, [selectedChannels, adData]);

  const activeChannels = useMemo(() => {
    if (selectedChannels.length > 0) return selectedChannels;
    return channelStats.map(c => c.channel);
  }, [selectedChannels, channelStats]);

  // 4. Month-by-month trend for the selected channels
  const trendData = useMemo(() => {
    if (selectedChannelData.length === 0) return [];
    
    const grouped = d3.groups(selectedChannelData, d => {
      if (!d.dateObj) return 'Unknown';
      return d3.timeFormat("%b %d, %Y")(d.dateObj);
    });

    return grouped.map(([day, vals]) => {
      const row = { day, sortDate: vals[0].dateObj || new Date(0) };
      // Calculate metric for each active channel
      activeChannels.forEach(ch => {
        const chVals = vals.filter(v => v.channel === ch);
        let val = 0;
        if (trendMetric === 'spend') val = d3.sum(chVals, d => d.cost) * exRate;
        else if (trendMetric === 'impressions') val = d3.sum(chVals, d => d.impressions);
        else if (trendMetric === 'clicks') val = d3.sum(chVals, d => d.clicks);
        else if (trendMetric === 'views') val = d3.sum(chVals, d => d.videoViews);
        else if (trendMetric === 'purchases') val = d3.sum(chVals, d => d.purchases || 0);
        else if (trendMetric === 'cpa') {
          const p = d3.sum(chVals, d => d.purchases || 0);
          val = p > 0 ? (d3.sum(chVals, d => d.cost) * exRate) / p : 0;
        }
        row[ch] = val;
      });
      return row;
    }).sort((a, b) => a.sortDate - b.sortDate);
  }, [selectedChannelData, exRate, activeChannels, trendMetric]);

  // 5. Event breakdown (flattened)
  const campaignBreakdown = useMemo(() => {
    if (selectedChannelData.length === 0) return [];
    
    // Group by Channel -> Event
    const grouped = d3.groups(selectedChannelData, d => d.channel, d => d.phase);
    
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
          cpcv: completions > 0 ? spend / completions : 0,
          cpa: purchases > 0 ? spend / purchases : 0,
          cr: clicks > 0 ? (purchases / clicks) * 100 : 0
        });
      });
    });
    return flattened.sort((a,b) => {
      if (!sortConfig) return 0;
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      if (sortConfig.key === 'event') {
        valA = a.campaign;
        valB = b.campaign;
      }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [selectedChannelData, sortConfig]);

  // Event chart data (pivot for stacked bars)
  const campaignChartData = useMemo(() => {
     if (selectedChannelData.length === 0) return [];
     const grouped = d3.groups(selectedChannelData, d => d.phase);
     return grouped.map(([campaign, vals]) => {
        const row = { campaign, totalSpend: d3.sum(vals, d => d.cost) };
        activeChannels.forEach(ch => {
           row[ch] = d3.sum(vals.filter(v => v.channel === ch), d => d.cost) * exRate;
        });
        return row;
     }).sort((a,b) => b.totalSpend - a.totalSpend).slice(0, 7);
  }, [selectedChannelData, activeChannels, exRate]);


  // Custom Tooltip for Trend Chart
  const TrendTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0a2442] border border-[#cedc28]/30 p-4 rounded-xl shadow-xl">
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

  const exportCSV = (data, filename) => {
    const encodedUri = encodeURI(data);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPerformanceMatrix = () => {
     let csv = "Metric," + activeChannels.join(",") + "\r\n";
     const metricsToExport = userRole === 'non-finance' ? ['impressions', 'clicks', 'ctr', 'views', 'purchases'] : ['spend', 'impressions', 'clicks', 'ctr', 'cpm', 'purchases'];
     metricsToExport.forEach(mKey => {
         const def = AVAILABLE_METRICS.find(m => m.key === mKey);
         if (!def) return;
         let row = [def.label];
         activeChannels.forEach(ch => {
            const stat = channelStats.find(c => c.channel === ch);
            row.push(stat ? String(def.format(stat[mKey])).replace(/,/g, '') : "0");
         });
         csv += row.join(",") + "\r\n";
     });
     exportCSV("data:text/csv;charset=utf-8," + csv, "Channel_Performance_Matrix");
  };

  const handleExportDetailedMetrics = () => {
     const headers = ["Event Phase", "Channel", ...AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => m.label)];
     let csv = headers.join(",") + "\r\n";
     campaignBreakdown.forEach(row => {
        let csvRow = [row.campaign, row.channel];
        AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).forEach(m => {
           csvRow.push(String(m.format(row[m.key])).replace(/,/g, ''));
        });
        csv += csvRow.join(",") + "\r\n";
     });
     
     // Add total row
     const tSpend = d3.sum(campaignBreakdown, d => d.spend);
     const tImp = d3.sum(campaignBreakdown, d => d.impressions);
     const tClicks = d3.sum(campaignBreakdown, d => d.clicks);
     const tViews = d3.sum(campaignBreakdown, d => d.views);
     const tPurchases = d3.sum(campaignBreakdown, d => Number(d.purchases) || 0);
     const totals = {
       spend: tSpend,
       impressions: tImp,
       clicks: tClicks,
       views: tViews,
       purchases: tPurchases,
       ctr: tImp > 0 ? (tClicks / tImp) * 100 : 0,
       cpc: tClicks > 0 ? tSpend / tClicks : 0,
       cpm: tImp > 0 ? (tSpend / tImp) * 1000 : 0,
       cpv: tViews > 0 ? tSpend / tViews : 0
     };
     let totalRow = ["Total", ""];
     AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).forEach(m => {
        totalRow.push(String(m.format(totals[m.key])).replace(/,/g, ''));
     });
     csv += totalRow.join(",") + "\r\n";

     exportCSV("data:text/csv;charset=utf-8," + csv, "Detailed_Event_Phase_Metrics");
  };


  if (!channelStats || channelStats.length === 0) return <div className="text-white p-8">No channel data available.</div>;

  // AI Insights data
  const aiInsights = useMemo(() => {
    if (activeChannels.length === 0 || channelStats.length === 0) return null;
    const selectedData = channelStats.filter(c => activeChannels.includes(c.channel));
    if (selectedData.length === 0) return null;
    
    const totalSpend = d3.sum(selectedData, d => d.spend) * exRate;
    const totalImpressions = d3.sum(selectedData, d => d.impressions);
    const totalClicks = d3.sum(selectedData, d => d.clicks);
    const totalPurchases = d3.sum(selectedData, d => Number(d.purchases) || 0);
    const totalCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const totalCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
    
    const topBySpend = [...selectedData].sort((a,b) => b.spend - a.spend)[0];
    const topByImp = [...selectedData].sort((a,b) => b.impressions - a.impressions)[0];
    const topByConv = [...selectedData].sort((a,b) => Number(b.purchases || 0) - Number(a.purchases || 0))[0];
    
    const lowestCPM = [...selectedData].filter(d => d.cpm > 0 && d.cpm !== Infinity).sort((a,b) => a.cpm - b.cpm)[0];
    const highestCTR = [...selectedData].sort((a,b) => b.ctr - a.ctr)[0];

    return { totalSpend, totalImpressions, totalClicks, totalPurchases, totalCTR, totalCPC, topBySpend, topByImp, topByConv, lowestCPM, highestCTR };
  }, [activeChannels, channelStats, exRate]);

  return (
    <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
      
      {/* HEADER & TOP CARDS (Hidden when exploring detailed view) */}
          {topCards && (
            <div className={`grid grid-cols-1 md:grid-cols-2 ${userRole === 'non-finance' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4 mb-8`}>
              <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#cedc28]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Eye className="w-32 h-32 text-white" /></div>
                <p className="text-[#14a6d9] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Eye className="w-4 h-4 text-[#cedc28]"/> Top by Impressions</p>
                <p className="text-3xl font-anton uppercase text-white truncate">{topCards.impressions.channel}</p>
                <p className="text-[#cedc28] font-bold text-lg mt-2">{formatShort(topCards.impressions.impressions)} <span className="text-xs text-[#14a6d9] font-medium">Impressions</span></p>
              </div>
              
              <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#cedc28]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><MousePointer2 className="w-32 h-32 text-white" /></div>
                <p className="text-[#14a6d9] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><MousePointer2 className="w-4 h-4 text-[#cedc28]"/> Top by Clicks</p>
                <p className="text-3xl font-anton uppercase text-white truncate">{topCards.clicks.channel}</p>
                <p className="text-[#cedc28] font-bold text-lg mt-2">{formatShort(topCards.clicks.clicks)} <span className="text-xs text-[#14a6d9] font-medium">Clicks</span></p>
              </div>

              <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-2xl p-6 relative overflow-hidden group hover:border-[#cedc28]/50 transition-colors">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><CheckCircle2 className="w-32 h-32 text-white" /></div>
                <p className="text-[#14a6d9] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#cedc28]"/> Top by Conversions</p>
                <p className="text-3xl font-anton uppercase text-white truncate">{topCards.conversions.channel}</p>
                <p className="text-[#cedc28] font-bold text-lg mt-2">{formatShort(topCards.conversions.purchases)} <span className="text-xs text-[#14a6d9] font-medium">Conversions</span></p>
              </div>

              {userRole !== 'non-finance' && (
                <div className="bg-gradient-to-br from-[#0C272D] to-[#113A42] border border-[#cedc28]/40 rounded-2xl p-6 relative overflow-hidden group hover:border-[#cedc28] transition-colors shadow-[0_0_15px_rgba(116,250,147,0.1)]">
                  <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Target className="w-32 h-32 text-[#cedc28]" /></div>
                  <p className="text-[#14a6d9] text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Target className="w-4 h-4 text-[#cedc28]"/> Most Efficient</p>
                  <p className="text-3xl font-anton uppercase text-white truncate">{topCards.efficiency.channel}</p>
                  <p className="text-[#cedc28] font-bold text-lg mt-2">{exSym}{d3.format(",.2f")(topCards.efficiency.cpc * exRate)} <span className="text-xs text-[#14a6d9] font-medium">CPC</span></p>
                </div>
              )}
            </div>
          )}

      {/* CHANNEL SELECTION BUTTONS */}
      <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl flex flex-col gap-4 export-slide" data-title="Channel Selection">
        <label className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-2 block flex items-center gap-2">
          <Activity size={14} /> Compare Channels (Select up to 3)
        </label>
        <div className="flex flex-wrap gap-2">
          {channelStats.map((ch, i) => {
            const isSelected = selectedChannels.includes(ch.channel);
            const isDisabled = !isSelected && selectedChannels.length >= 3;
            const color = COLORS[i % COLORS.length];
            return (
              <button
                key={ch.channel}
                onClick={() => handleChannelToggle(ch.channel)}
                disabled={isDisabled}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                style={{
                  backgroundColor: isSelected ? `${color}20` : '#0C272D',
                  borderColor: isSelected ? color : 'rgba(116, 250, 147, 0.2)',
                  color: isSelected ? color : '#14a6d9'
                }}
              >
                {ch.channel}
              </button>
            );
          })}
          {selectedChannels.length > 0 && (
            <button 
              onClick={() => setSelectedChannels([])}
              className="px-4 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-400/10 transition-colors ml-auto border border-transparent"
            >
              Clear Selection
            </button>
          )}
        </div>
      </div>

      {/* DETAILED DRILL-DOWN VIEW */}
      <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
        
        {/* DAILY TREND CHART (Replaces KPI Matrix) */}
        <div className="card-surface backdrop-blur-2xl border border-[#cedc28]/20 rounded-3xl p-6 export-slide" data-title="Daily Comparison Trend" id="comparison-trend-chart">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TrendingUp className="text-[#cedc28] w-5 h-5" /> Daily Comparison Trend
            </h3>
            <div className="flex items-center gap-3">
              <select 
                value={trendMetric} 
                onChange={(e) => setTrendMetric(e.target.value)}
                className="bg-[#0a2442] text-[#cedc28] border border-[#cedc28]/30 rounded-lg px-3 py-1 text-xs font-bold outline-none"
              >
                {userRole !== 'non-finance' && <option value="spend">Spend</option>}
                <option value="impressions">Impressions</option>
                <option value="clicks">Clicks</option>
                <option value="views">Video Views</option>
                <option value="purchases">Conversions</option>
                {userRole !== 'non-finance' && <option value="cpa">CPA</option>}
              </select>
              <button onClick={() => exportChart('comparison-trend-chart', 'comparison_trend')} className="p-1.5 rounded-lg bg-[#0a2442] border border-[#cedc28]/20 text-[#cedc28] hover:bg-[#cedc28]/10 transition-colors shadow-[0_0_10px_rgba(200,130,20,0.1)] text-xs font-bold" title="Export Image" data-html2canvas-ignore="true">
                <Camera size={14} />
              </button>
            </div>
          </div>
          
          <div className="h-80 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="day" stroke="#14a6d9" fontSize={9} angle={-45} textAnchor="end" height={50} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(trendData.length / 15))} />
                <YAxis stroke="#14a6d9" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatShort(v)} />
                <RechartsTooltip content={<TrendTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {activeChannels.map((ch, idx) => (
                  <Line key={ch} type="monotone" dataKey={ch} name={ch} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={false} activeDot={{r:6}} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* TOURNAMENT BREAKDOWN CHART (Left) */}
          <div className="card-surface backdrop-blur-2xl border border-[#cedc28]/20 rounded-3xl p-6 export-slide" data-title="Phases Across Channels" id="phases-across-channels-chart">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="text-[#cedc28] w-5 h-5" /> Phases Across Channels
              </h3>
              <button onClick={() => exportChart('phases-across-channels-chart', 'phases_across_channels')} className="p-1.5 rounded-lg bg-[#0a2442] border border-[#cedc28]/20 text-[#cedc28] hover:bg-[#cedc28]/10 transition-colors shadow-[0_0_10px_rgba(200,130,20,0.1)] text-xs font-bold" title="Export Image" data-html2canvas-ignore="true">
                <Camera size={14} />
              </button>
            </div>
            <div className="h-80 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={campaignChartData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#14a6d9" fontSize={10} tickFormatter={(v) => formatShort(v)} />
                  <YAxis dataKey="campaign" type="category" stroke="#14a6d9" fontSize={10} width={110} tickFormatter={(v) => v.length > 15 ? v.substring(0,15)+'...' : v} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0C272D', borderColor: '#74FA9320', color: '#fff', borderRadius: '12px' }} 
                    cursor={{fill: '#ffffff05'}} 
                    formatter={(value, name) => [`${exSym}${d3.format(",.0f")(value)}`, name]}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                  {activeChannels.map((ch, idx) => (
                     <Bar key={ch} dataKey={ch} name={ch} fill={COLORS[idx % COLORS.length]} stackId="a" radius={[0, 4, 4, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI INSIGHTS (Right) */}
          <div className="card-surface-gold p-8 rounded-3xl border border-[#cedc28]/30 shadow-2xl relative overflow-hidden export-slide" data-title="AI Insights">
            <div className="absolute top-0 right-0 p-8 opacity-10"><Zap className="w-32 h-32 text-[#cedc28]" /></div>
            <h3 className="text-xl font-bold text-white mb-5 flex items-center gap-3"><Zap className="text-[#cedc28] w-5 h-5"/> AI Performance Insights </h3>
            <div className="text-[#eef7f5] leading-relaxed max-w-5xl space-y-3 relative z-10 text-sm">
              {aiInsights && (
                <>
                  <p>• In the selected channels, campaigns have generated <strong>{formatShort(aiInsights.totalImpressions)}</strong> impressions, <strong>{formatShort(aiInsights.totalClicks)}</strong> clicks, and <strong>{formatShort(aiInsights.totalPurchases)}</strong> conversions overall.</p>
                  {userRole !== 'non-finance' && (
                    <p>• Total spend across these channels is <strong>{exSym}{d3.format(",.0f")(aiInsights.totalSpend)}</strong> with an average CPC of <strong>{exSym}{aiInsights.totalCPC.toFixed(2)}</strong>.</p>
                  )}
                  {aiInsights.topBySpend && userRole !== 'non-finance' && (
                    <p>• <strong>{aiInsights.topBySpend.channel}</strong> is driving the highest spend at <strong>{exSym}{d3.format(",.0f")(aiInsights.topBySpend.spend * exRate)}</strong>.</p>
                  )}
                  {aiInsights.topByConv && aiInsights.topByConv.purchases > 0 && (
                    <p>• <strong>{aiInsights.topByConv.channel}</strong> leads in conversions with <strong>{formatShort(aiInsights.topByConv.purchases)}</strong> completed purchases.</p>
                  )}
                  {aiInsights.lowestCPM && (
                    <p>• <strong>{aiInsights.lowestCPM.channel}</strong> is the most cost-efficient channel with a CPM of <strong>{exSym}{d3.format(",.2f")(aiInsights.lowestCPM.cpm * exRate)}</strong>.</p>
                  )}
                  {aiInsights.highestCTR && (
                    <p>• <strong>{aiInsights.highestCTR.channel}</strong> sees the highest engagement with a CTR of <strong>{aiInsights.highestCTR.ctr.toFixed(2)}%</strong>.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
          
          {/* TOURNAMENT DATA TABLE */}
          <div className="card-surface backdrop-blur-2xl border border-[#cedc28]/20 rounded-3xl p-6 overflow-hidden export-slide" data-title="Detailed Channel Metrics">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
               <div className="flex items-center gap-4">
                 <h3 className="text-lg font-bold text-white flex items-center gap-2">Detailed Event Phase Metrics</h3>
                 <button onClick={handleExportDetailedMetrics} className="p-1.5 rounded-lg bg-[#0a2442] border border-[#cedc28]/20 text-[#cedc28] hover:bg-[#cedc28]/10 transition-colors shadow-[0_0_10px_rgba(200,130,20,0.1)] text-xs font-bold" title="Export CSV">
                   <Download size={14} />
                 </button>
               </div>
               <MetricMultiSelectDropdown 
                 options={AVAILABLE_METRICS}
                 selectedKeys={selectedMetrics}
                 onChange={setSelectedMetrics}
               />
             </div>
             
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b-2 border-[#cedc28]/30">
                      <th onClick={() => handleSort('event')} className="cursor-pointer px-4 py-3 text-xs font-bold text-[#14a6d9] uppercase tracking-wider sticky left-0 bg-[#0a2442] z-10">Event Phase {sortConfig?.key === 'event' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                      <th onClick={() => handleSort('channel')} className="cursor-pointer px-4 py-3 text-xs font-bold text-[#14a6d9] uppercase tracking-wider">Channel {sortConfig?.key === 'channel' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                      {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                         <th onClick={() => handleSort(m.key)} key={m.key} className="cursor-pointer px-4 py-3 text-xs font-bold text-[#14a6d9] uppercase tracking-wider text-right">{m.label} {sortConfig?.key === m.key ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaignBreakdown.map((row, i) => (
                      <tr key={`${row.channel}-${row.campaign}`} className={`border-b border-[#cedc28]/10 hover:bg-[#74FA93]/5 transition-colors bg-transparent`}>
                        <td className="px-4 py-4 text-sm font-bold text-white sticky left-0 z-10 bg-[#0a2442]">{row.campaign}</td>
                        <td className="px-4 py-4 text-sm font-bold text-[#14a6d9]">{row.channel}</td>
                        {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                           <td key={m.key} className="px-4 py-4 text-sm font-medium text-[#cedc28] text-right">{m.format(row[m.key])}</td>
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
                        cpcv: tCompletions > 0 ? tSpend / tCompletions : 0,
                        cpa: tPurchases > 0 ? tSpend / tPurchases : 0,
                        cr: tClicks > 0 ? (tPurchases / tClicks) * 100 : 0
                      };

                      return (
                         <tr className="bg-[#0a2442] border-t-2 border-[#cedc28]/50">
                            <td className="px-4 py-4 text-sm font-bold text-[#cedc28] sticky left-0 bg-[#0a2442] z-10">Total</td>
                            <td className="px-4 py-4 text-sm font-bold text-[#cedc28]"></td>
                            {AVAILABLE_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
                               <td key={m.key} className="px-4 py-4 text-sm font-bold text-[#cedc28] text-right">{m.format(totals[m.key])}</td>
                            ))}
                         </tr>
                      )
                    })()}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      </div>
  );
}
