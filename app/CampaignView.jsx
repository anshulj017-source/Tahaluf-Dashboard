import React, { useState, useMemo } from 'react';
import InfoTooltip from './components/InfoTooltip';
import * as d3 from 'd3';
import { ChevronDown, Calendar, Layers, Activity, Search, Check, Download } from 'lucide-react';

const COLORS = ['#74FA93', '#c88214', '#00937b', '#EF4444', '#065c5d', '#10B981', '#eef7f5', '#6fa89f'];

const MetricMultiSelectDropdown = ({ options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const filtered = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="relative min-w-[200px] z-30">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-[#011414] border border-[#c88214]/30 rounded-lg text-xs font-bold text-[#eef7f5] cursor-pointer flex justify-between items-center hover:border-[#c88214] transition-colors"
      >
        <span className="truncate pr-2">{selected.includes('All') ? 'All Metrics' : selected.join(', ')}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute top-full right-0 w-[240px] mt-2 z-50">
          <div className="w-full bg-[#011414] border border-[#c88214]/30 rounded-xl shadow-2xl flex flex-col max-h-64 overflow-hidden">
            <div className="p-2 border-b border-[#c88214]/10 relative">
              <Search className="w-4 h-4 text-[#6fa89f] absolute left-4 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search..." autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-[#011414] text-[#eef7f5] text-xs font-bold pl-9 pr-3 py-2 rounded-lg outline-none border border-transparent focus:border-[#c88214]/50" />
            </div>
            <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
              <div onClick={() => { onChange(['All']); setIsOpen(false); setSearchTerm(''); }} className={`px-3 py-2 rounded-lg text-sm font-bold cursor-pointer flex justify-between ${selected.includes('All') ? 'bg-[#c88214]/20 text-[#c88214]' : 'text-[#eef7f5] hover:bg-[#011414]'}`}>
                All <Check className={`w-4 h-4 ${selected.includes('All') ? 'opacity-100' : 'opacity-0'}`} />
              </div>
              {filtered.map(opt => {
                const isSel = selected.includes(opt);
                return (
                  <div key={opt} onClick={() => {
                    let next = [...selected];
                    if (next.includes('All')) next = [];
                    if (isSel) {
                      next = next.filter(n => n !== opt);
                      if (next.length === 0) next = ['All'];
                    } else { next.push(opt); }
                    onChange(next);
                  }} className={`px-3 py-2 mt-1 rounded-lg text-sm font-bold cursor-pointer flex justify-between ${isSel ? 'bg-[#c88214]/20 text-[#c88214]' : 'text-[#eef7f5] hover:bg-[#011414]'}`}>
                    <span className="truncate pr-2">{opt}</span> <Check className={`w-4 h-4 flex-shrink-0 ${isSel ? 'opacity-100' : 'opacity-0'}`} />
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

export default function CampaignView({ adData, plannedData = [], exRate = 1, exSym = '$', formatShort = (v) => v, userRole, filterMarkets }) {
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedPhases, setSelectedPhases] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState({}); // { phaseName: [channelNames] }
  const [viewMode, setViewMode] = useState('overall'); // 'overall' or 'planned'
  const [plannedMetrics, setPlannedMetrics] = useState(['% Delivered']); // changed to array

  // 1. Process Campaigns
  const campaigns = useMemo(() => { console.log("CampaignView adData length:", adData.length, "Unique:", Array.from(new Set(adData.map(d => d.campaignName))));
    return Array.from(new Set(adData.map(d => d.campaignName))).sort();
  }, [adData]);

  // Set default campaign
  React.useEffect(() => {
    if (!selectedCampaign && campaigns.length > 0) {
      setSelectedCampaign(campaigns[0]);
    }
  }, [campaigns, selectedCampaign]);

  // 2. Process data for selected campaign
  const campaignData = useMemo(() => {
    if (!selectedCampaign) return [];
    return adData.filter(d => d.campaignName === selectedCampaign && d.dateObj);
  }, [adData, selectedCampaign]);

  // 3. Extract Phases and Channels with their min/max dates and bursts
  const { phases, campaignMinDate, campaignMaxDate } = useMemo(() => {
    if (campaignData.length === 0) return { phases: [], campaignMinDate: new Date(), campaignMaxDate: new Date() };

    const cMin = d3.min(campaignData, d => d.dateObj);
    const cMax = d3.max(campaignData, d => d.dateObj);

    // Helper to extract bursts of activity (gaps > 1.5 days mean a new burst)
    const getBursts = (rows) => {
      if (rows.length === 0) return [];
      const times = Array.from(new Set(rows.map(r => r.dateObj.getTime()))).sort((a,b) => a - b);
      const bursts = [];
      let currentStart = times[0];
      let currentEnd = times[0];
      const gapThreshold = 129600000; // 1.5 days in ms
      
      for (let i = 1; i < times.length; i++) {
        const t = times[i];
        if ((t - currentEnd) > gapThreshold) {
          bursts.push({ start: new Date(currentStart), end: new Date(currentEnd) });
          currentStart = t;
        }
        currentEnd = t;
      }
      bursts.push({ start: new Date(currentStart), end: new Date(currentEnd) });
      return bursts;
    };

    const groupedByPhase = d3.group(campaignData, d => d.phase);
    
    const phaseList = Array.from(groupedByPhase, ([phaseName, phaseRows]) => {
      const pMin = d3.min(phaseRows, d => d.dateObj);
      const pMax = d3.max(phaseRows, d => d.dateObj);
      
      const groupedByChannel = d3.group(phaseRows, d => d.channel);
      const channelList = Array.from(groupedByChannel, ([channelName, chRows]) => {
        return {
          name: channelName,
          minDate: d3.min(chRows, d => d.dateObj),
          maxDate: d3.max(chRows, d => d.dateObj),
          bursts: getBursts(chRows)
        };
      }).sort((a, b) => a.minDate - b.minDate);

      return {
        name: phaseName,
        minDate: pMin,
        maxDate: pMax,
        bursts: getBursts(phaseRows),
        channels: channelList
      };
    }).sort((a, b) => a.minDate - b.minDate);

    return { phases: phaseList, campaignMinDate: cMin, campaignMaxDate: cMax };
  }, [campaignData]);

  // Create time scale for percentage calculations
  const timeScale = useMemo(() => {
    if (!campaignMinDate || !campaignMaxDate) return null;
    // Add a little padding to the ends
    const min = new Date(campaignMinDate);
    min.setDate(min.getDate() - 2);
    const max = new Date(campaignMaxDate);
    max.setDate(max.getDate() + 2);
    
    return d3.scaleTime().domain([min, max]).range([0, 100]);
  }, [campaignMinDate, campaignMaxDate]);

  // Generate ticks for the X-axis
  const ticks = useMemo(() => {
    if (!timeScale) return [];
    return timeScale.ticks(d3.timeWeek.every(2)).map(date => ({
      date,
      percent: timeScale(date),
      label: d3.timeFormat('%b %d')(date)
    }));
  }, [timeScale]);

  const togglePhase = (phaseName) => {
    setSelectedPhases(prev => 
      prev.includes(phaseName) ? prev.filter(p => p !== phaseName) : [...prev, phaseName]
    );
  };

  const toggleChannel = (phaseName, channelName) => {
    setSelectedChannels(prev => {
      const current = prev[phaseName] || [];
      const next = current.includes(channelName) 
        ? current.filter(c => c !== channelName)
        : [...current, channelName];
      return { ...prev, [phaseName]: next };
    });
  };

  // Calculate table data based on selections
  const tableData = useMemo(() => {
    if (!selectedCampaign) return [];
    let data = campaignData;

    if (selectedPhases.length > 0) {
      data = data.filter(d => selectedPhases.includes(d.phase));
      const hasAnyChannelSelection = selectedPhases.some(p => selectedChannels[p] && selectedChannels[p].length > 0);
      if (hasAnyChannelSelection) {
        data = data.filter(d => {
          const activeChs = selectedChannels[d.phase] || [];
          return activeChs.length === 0 || activeChs.includes(d.channel);
        });
      }
    }

    const grouped = d3.groups(data, d => d.channel).map(([channel, rows]) => {
      const impressions = d3.sum(rows, d => d.impressions);
      const clicks = d3.sum(rows, d => d.clicks);
      const views = d3.sum(rows, d => d.videoViews);
      const spend = d3.sum(rows, d => d.cost);
      const purchases = d3.sum(rows, d => d.purchases || 0);
      
      return {
        channel,
        spend,
        impressions,
        clicks,
        views,
        completions: d3.sum(rows, d => d.videoCompletions || 0),
        purchases,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpv: views > 0 ? spend / views : 0
      };
    });
    return grouped.sort((a,b) => b.spend - a.spend);
  }, [campaignData, selectedCampaign, selectedPhases, selectedChannels]);

  // Calculate planned table data based on selections
  const plannedTableData = useMemo(() => {
    if (!selectedCampaign || !plannedData || plannedData.length === 0) return [];
    
    let pData = plannedData;
    let actualData = campaignData;
    
    if (filterMarkets && filterMarkets.length > 0 && !filterMarkets.includes('All')) {
      pData = pData.filter(d => filterMarkets.includes(d.targetMarket));
    }
    
    if (selectedPhases.length > 0) {
      pData = pData.filter(d => selectedPhases.includes(d.phase));
      actualData = actualData.filter(d => selectedPhases.includes(d.phase));
      
      const hasAnyChannelSelection = selectedPhases.some(p => selectedChannels[p] && selectedChannels[p].length > 0);
      if (hasAnyChannelSelection) {
        pData = pData.filter(d => {
          const activeChs = selectedChannels[d.phase] || [];
          return activeChs.length === 0 || activeChs.includes(d.channel);
        });
        actualData = actualData.filter(d => {
          const activeChs = selectedChannels[d.phase] || [];
          return activeChs.length === 0 || activeChs.includes(d.channel);
        });
      }
    }

    const pKeys = new Set(pData.map(d => `${d.channel.toLowerCase()}_${d.buyingType.toLowerCase()}`));
    const aKeys = new Set(actualData.map(d => `${d.channel.toLowerCase()}_${d.buyingType.toLowerCase()}`));
    const allKeys = Array.from(new Set([...pKeys, ...aKeys]));

    const combined = allKeys.map(key => {
      const pMatching = pData.filter(d => `${d.channel.toLowerCase()}_${d.buyingType.toLowerCase()}` === key);
      const aMatching = actualData.filter(d => `${d.channel.toLowerCase()}_${d.buyingType.toLowerCase()}` === key);
      
      const channel = pMatching.length > 0 ? (pMatching[0].channel || '') : (aMatching.length > 0 ? aMatching[0].channel || '' : '');
      const buyingType = pMatching.length > 0 ? (pMatching[0].buyingType || '') : (aMatching.length > 0 ? aMatching[0].buyingType || '' : '');
      
      const plannedCost = d3.sum(pMatching, d => d.plannedCost || 0);
      const bookedUnits = d3.sum(pMatching, d => d.bookedUnits || 0);
      const deliveredCost = d3.sum(aMatching, d => d.cost || 0);
      
      let deliveredUnits = 0;
      const bt = (buyingType || '').toUpperCase();
      if (bt.includes('CPM')) {
        deliveredUnits = d3.sum(aMatching, d => d.impressions);
      } else if (bt.includes('CPC')) {
        deliveredUnits = d3.sum(aMatching, d => d.clicks);
      } else if (bt.includes('CPV')) {
        deliveredUnits = d3.sum(aMatching, d => d.videoViews);
      } else {
        deliveredUnits = d3.sum(aMatching, d => d.impressions); // fallback
      }
      
      let multiplier = 1;
      if (bt.includes('CPM')) multiplier = 1000;
      
      const plannedUnitCost = bookedUnits > 0 ? (plannedCost / bookedUnits) * multiplier : 0;
      const deliveredUnitCost = deliveredUnits > 0 ? (deliveredCost / deliveredUnits) * multiplier : 0;
      const pctDiffUnitCost = plannedUnitCost > 0 ? ((deliveredUnitCost - plannedUnitCost) / plannedUnitCost) * 100 : 0;

      return {
        channel,
        buyingType,
        plannedCost,
        deliveredCost,
        bookedUnits,
        deliveredUnits,
        pctDelivered: bookedUnits > 0 ? (deliveredUnits / bookedUnits) * 100 : 0,
        pctPacing: plannedCost > 0 ? (deliveredCost / plannedCost) * 100 : 0,
        plannedUnitCost,
        deliveredUnitCost,
        pctDiffUnitCost
      };
    });
    
    return combined.sort((a,b) => b.plannedCost - a.plannedCost);
  }, [campaignData, plannedData, selectedCampaign, selectedPhases, selectedChannels, filterMarkets]);

  // Reset viewMode if selected campaign is not Gulf Cup
  React.useEffect(() => {
    if (selectedCampaign !== 'Gulf Cup' && viewMode === 'planned') {
      setViewMode('overall');
    }
  }, [selectedCampaign, viewMode]);

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (viewMode === 'overall') {
      const headers = ['Channel'];
      if (userRole !== 'non-finance') headers.push('Spend');
      headers.push('Impressions', 'Clicks', 'Video Views', 'Completed Views', 'Purchases', 'CTR');
      if (userRole !== 'non-finance') headers.push('CPM', 'CPC', 'CPV');
      
      csvContent += headers.join(",") + "\r\n";
      
      tableData.forEach(row => {
        const rowData = [row.channel];
        if (userRole !== 'non-finance') rowData.push((row.spend * exRate).toFixed(2));
        rowData.push(row.impressions, row.clicks, row.views, row.completions, row.purchases, row.ctr.toFixed(2) + '%');
        if (userRole !== 'non-finance') rowData.push((row.cpm * exRate).toFixed(2), (row.cpc * exRate).toFixed(2), (row.cpv * exRate).toFixed(2));
        csvContent += rowData.join(",") + "\r\n";
      });
      
      // Add Totals row
      if (tableData.length > 0) {
        const tSpend = d3.sum(tableData, d => d.spend);
        const tImp = d3.sum(tableData, d => d.impressions);
        const tClicks = d3.sum(tableData, d => d.clicks);
        const tViews = d3.sum(tableData, d => d.views);
        const tCompletions = d3.sum(tableData, d => d.completions);
        const tPurchases = d3.sum(tableData, d => d.purchases);
        const tCtr = tImp > 0 ? (tClicks / tImp) * 100 : 0;
        const tCpm = tImp > 0 ? (tSpend / tImp) * 1000 : 0;
        const tCpc = tClicks > 0 ? tSpend / tClicks : 0;
        const tCpv = tViews > 0 ? tSpend / tViews : 0;

        const totalsRow = ['Total'];
        if (userRole !== 'non-finance') totalsRow.push((tSpend * exRate).toFixed(2));
        totalsRow.push(tImp, tClicks, tViews, tCompletions, tPurchases, tCtr.toFixed(2) + '%');
        if (userRole !== 'non-finance') totalsRow.push((tCpm * exRate).toFixed(2), (tCpc * exRate).toFixed(2), (tCpv * exRate).toFixed(2));
        csvContent += totalsRow.join(",") + "\r\n";
      }

    } else {
      const headers = ['Channel', 'Buying Type', 'Planned Cost', 'Delivered Cost', 'Booked Units', 'Delivered Units'];
      if (plannedMetrics.includes('% Delivered') || plannedMetrics.includes('All')) headers.push('% Delivered');
      if (plannedMetrics.includes('% Pacing') || plannedMetrics.includes('All')) headers.push('% Pacing');
      if (plannedMetrics.includes('Cost compare') || plannedMetrics.includes('All')) headers.push('Planned Unit Cost', 'Delivered Unit Cost');
      if (plannedMetrics.includes('% difference of unit cost') || plannedMetrics.includes('All')) headers.push('% Diff Unit Cost');
      
      csvContent += headers.join(",") + "\r\n";
      
      plannedTableData.forEach(row => {
        const rowData = [row.channel, row.buyingType, (row.plannedCost * exRate).toFixed(2), (row.deliveredCost * exRate).toFixed(2), row.bookedUnits, row.deliveredUnits];
        if (plannedMetrics.includes('% Delivered') || plannedMetrics.includes('All')) rowData.push(row.pctDelivered.toFixed(2) + '%');
        if (plannedMetrics.includes('% Pacing') || plannedMetrics.includes('All')) rowData.push(row.pctPacing.toFixed(2) + '%');
        if (plannedMetrics.includes('Cost compare') || plannedMetrics.includes('All')) rowData.push((row.plannedUnitCost * exRate).toFixed(2), (row.deliveredUnitCost * exRate).toFixed(2));
        if (plannedMetrics.includes('% difference of unit cost') || plannedMetrics.includes('All')) rowData.push(row.pctDiffUnitCost.toFixed(2) + '%');
        csvContent += rowData.join(",") + "\r\n";
      });

      // Add Totals row
      if (plannedTableData.length > 0) {
        const tPlannedCost = d3.sum(plannedTableData, d => d.plannedCost);
        const tDeliveredCost = d3.sum(plannedTableData, d => d.deliveredCost);
        const tBookedUnits = d3.sum(plannedTableData, d => d.bookedUnits);
        const tDeliveredUnits = d3.sum(plannedTableData, d => d.deliveredUnits);
        const tPctDelivered = tBookedUnits > 0 ? (tDeliveredUnits / tBookedUnits) * 100 : 0;
        const tPctPacing = tPlannedCost > 0 ? (tDeliveredCost / tPlannedCost) * 100 : 0;
        
        const totalsRow = ['Total', '', (tPlannedCost * exRate).toFixed(2), (tDeliveredCost * exRate).toFixed(2), tBookedUnits, tDeliveredUnits];
        if (plannedMetrics.includes('% Delivered') || plannedMetrics.includes('All')) totalsRow.push(tPctDelivered.toFixed(2) + '%');
        if (plannedMetrics.includes('% Pacing') || plannedMetrics.includes('All')) totalsRow.push(tPctPacing.toFixed(2) + '%');
        if (plannedMetrics.includes('Cost compare') || plannedMetrics.includes('All')) totalsRow.push('-', '-');
        if (plannedMetrics.includes('% difference of unit cost') || plannedMetrics.includes('All')) totalsRow.push('-');
        csvContent += totalsRow.join(",") + "\r\n";
      }
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = d3.timeFormat('%Y-%m-%d')(new Date());
    link.setAttribute("download", `${selectedCampaign.replace(/\s+/g, '_')}_${viewMode}_Performance_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto">
      {/* Top Controls */}
      <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-xl flex flex-col md:flex-row gap-6 items-start md:items-center justify-between export-slide" data-title="Tournament Top Stats">
        <div className="flex-1 w-full md:w-auto">
          <label className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest mb-2 block flex items-center gap-2">
            <Layers size={14} /> Selected Tournament
          </label>
          <div className="relative">
            <select 
              value={selectedCampaign} 
              onChange={e => {
                setSelectedCampaign(e.target.value);
                setSelectedPhases([]);
                setSelectedChannels({});
              }}
              className="w-full md:max-w-xs bg-[#011414] text-[#c88214] text-sm font-bold pl-4 pr-10 py-3 rounded-xl border border-[#c88214]/30 outline-none appearance-none cursor-pointer hover:border-[#c88214] transition-colors"
            >
              {campaigns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c88214] pointer-events-none" size={16} />
          </div>
        </div>

        {selectedCampaign && phases.length > 0 && (
          <div className="flex-1 w-full">
            <label className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest mb-2 block flex items-center gap-2">
              <Activity size={14} /> Active Phases ({phases.length})
            </label>
            <div className="flex flex-wrap gap-2">
              {phases.map((p, i) => {
                const isActive = selectedPhases.includes(p.name);
                const color = COLORS[i % COLORS.length];
                return (
                  <button
                    key={p.name}
                    onClick={() => togglePhase(p.name)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border`}
                    style={{
                      backgroundColor: isActive ? `${color}20` : '#0C272D',
                      borderColor: isActive ? color : 'rgba(116, 250, 147, 0.2)',
                      color: isActive ? color : '#6fa89f'
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
              {selectedPhases.length > 0 && (
                <button 
                  onClick={() => { setSelectedPhases([]); setSelectedChannels({}); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-400/10 transition-colors ml-auto border border-transparent"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Timeline Gantt Chart */}
      {selectedCampaign && selectedPhases.length > 0 && timeScale && (
        <div className="card-surface backdrop-blur-2xl p-8 rounded-3xl border border-[#c88214]/20 shadow-xl overflow-hidden relative export-slide" data-title="Tournament Timeline">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-black text-[#eef7f5] flex items-center gap-3">
              <Calendar className="text-[#c88214]" /> Tournament Timeline
              <InfoTooltip definition="Definition for Tournament Timeline" />
            </h3>
            <div className="text-xs font-bold text-[#6fa89f] bg-[#011414] px-4 py-2 rounded-lg border border-[#c88214]/10">
              {d3.timeFormat('%b %d, %Y')(campaignMinDate)} - {d3.timeFormat('%b %d, %Y')(campaignMaxDate)}
            </div>
          </div>

          <div className="relative pt-6 pb-4 overflow-x-auto custom-scrollbar">
            <div className="min-w-[800px] relative">
              {/* X-Axis Ticks */}
              <div className="absolute top-0 left-[200px] right-0 h-full pointer-events-none">
                {ticks.map((tick, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-[#c88214]/10 flex flex-col justify-start" style={{ left: `${tick.percent}%` }}>
                    <span className="text-[9px] font-black text-[#6fa89f] uppercase tracking-widest -ml-4 -mt-6 card-surface backdrop-blur-2xl px-1">{tick.label}</span>
                  </div>
                ))}
              </div>

              {/* Gantt Rows */}
              <div className="relative z-10 flex flex-col gap-6 mt-4">
                {phases.filter(p => selectedPhases.includes(p.name)).map((phase, i) => {
                  const pColor = COLORS[phases.findIndex(p0 => p0.name === phase.name) % COLORS.length];
                  const pLeft = timeScale(phase.minDate);
                  const pWidth = timeScale(phase.maxDate) - pLeft;
                  const activeChannels = selectedChannels[phase.name] || [];

                  return (
                    <div key={phase.name} className="flex flex-col gap-2">
                      
                      {/* Phase Row */}
                      <div className="flex items-center gap-4">
                        {/* Label */}
                        <div className="w-[184px] flex-shrink-0 text-right pr-4 border-r border-[#c88214]/20">
                          <h4 className="text-sm font-bold" style={{ color: pColor }}>{phase.name}</h4>
                          <p className="text-[10px] text-[#6fa89f]">{d3.timeFormat('%b %d')(phase.minDate)} - {d3.timeFormat('%b %d')(phase.maxDate)}</p>
                        </div>
                        {/* Bar Area */}
                        <div className="flex-1 relative h-10 bg-[#011414]/50 rounded-lg overflow-hidden group">
                          {phase.bursts.map((b, bi) => {
                            const bLeft = timeScale(b.start);
                            const bWidth = timeScale(b.end) - bLeft;
                            return (
                              <div 
                                key={bi}
                                className="absolute top-1/2 -translate-y-1/2 h-6 rounded-md shadow-lg transition-all duration-500 flex items-center justify-center overflow-hidden cursor-pointer"
                                style={{ 
                                  left: `${bLeft}%`, 
                                  width: `${Math.max(bWidth, 0.5)}%`, 
                                  backgroundColor: pColor,
                                  backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)'
                                }}
                                title={`${phase.name}: ${d3.timeFormat('%b %d, %Y')(b.start)} to ${d3.timeFormat('%b %d, %Y')(b.end)}`}
                              >
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Channel Controls for this Phase */}
                      <div className="ml-[200px] flex gap-2 flex-wrap mb-2">
                        {phase.channels.map(ch => {
                          const isChActive = activeChannels.includes(ch.name);
                          return (
                            <button
                              key={ch.name}
                              onClick={() => toggleChannel(phase.name, ch.name)}
                              className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all border`}
                              style={{
                                backgroundColor: isChActive ? `${pColor}15` : 'transparent',
                                borderColor: isChActive ? pColor : 'rgba(255,255,255,0.1)',
                                color: isChActive ? pColor : '#6fa89f'
                              }}
                            >
                              {ch.name}
                            </button>
                          );
                        })}
                      </div>

                      {/* Active Channel Bars */}
                      {activeChannels.map(chName => {
                        const chData = phase.channels.find(c => c.name === chName);
                        if (!chData) return null;

                        return (
                          <div key={chName} className="flex items-center gap-4 mt-1">
                            <div className="w-[184px] flex-shrink-0 text-right pr-4">
                              <span className="text-xs font-medium text-[#eef7f5]">{chName}</span>
                            </div>
                            <div className="flex-1 relative h-6 bg-[#011414]/30 rounded-md">
                              {chData.bursts.map((b, bi) => {
                                const chLeft = timeScale(b.start);
                                const chWidth = timeScale(b.end) - chLeft;
                                return (
                                  <div 
                                    key={bi}
                                    className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full transition-all duration-500 cursor-pointer"
                                    style={{ 
                                      left: `${chLeft}%`, 
                                      width: `${Math.max(chWidth, 0.2)}%`, 
                                      backgroundColor: pColor,
                                      opacity: 0.7
                                    }}
                                    title={`${chName} Live Duration: ${d3.timeFormat('%b %d, %Y')(b.start)} to ${d3.timeFormat('%b %d, %Y')(b.end)}`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Table */}
      {selectedCampaign && (tableData.length > 0 || plannedTableData.length > 0) && (
        <div className="card-surface backdrop-blur-2xl p-8 rounded-3xl border border-[#c88214]/20 shadow-xl overflow-hidden export-slide" data-title="Planned vs Delivered">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-[#eef7f5] flex items-center gap-3">
              <Activity className="text-[#c88214]" /> Performance Metrics Breakdown
              <InfoTooltip definition="Definition for Performance Metrics Breakdown" />
            </h3>
            
            <div className="flex items-center gap-4">
              <button
                onClick={handleExportCSV}
                className="px-3 py-2 flex items-center gap-2 rounded-lg bg-[#011414] border border-[#c88214]/20 text-[#c88214] hover:bg-[#c88214]/10 transition-colors shadow-[0_0_10px_rgba(200,130,20,0.1)] text-xs font-bold"
                title="Export to CSV (Excel)"
              >
                <Download size={14} /> Export Table
              </button>
              <div className="flex bg-[#011414] rounded-lg p-1 border border-[#c88214]/20">
                <button 
                  onClick={() => setViewMode('overall')} 
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'overall' ? 'gradient-gold text-[#043e3f] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#6fa89f] hover:bg-[#c88214]/10 hover:text-[#c88214] border border-[#c88214]/20'}`}
                >
                  Overall Data
                </button>
                <button 
                  onClick={() => { if (selectedCampaign === 'Gulf Cup') setViewMode('planned'); }}
                  disabled={selectedCampaign !== 'Gulf Cup'}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'planned' ? 'gradient-gold text-[#043e3f] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#6fa89f] hover:bg-[#c88214]/10 hover:text-[#c88214] border border-[#c88214]/20'} ${selectedCampaign !== 'Gulf Cup' ? 'opacity-50 cursor-not-allowed bg-black/20' : ''}`}
                  title={selectedCampaign !== 'Gulf Cup' ? 'Only available for live campaigns (Gulf Cup)' : ''}
                >
                  Planned v/s Delivered
                </button>
              </div>
              {viewMode === 'planned' ? (
                <MetricMultiSelectDropdown
                  options={['% Delivered', '% Pacing', 'Cost compare', '% difference of unit cost']}
                  selected={plannedMetrics}
                  onChange={setPlannedMetrics}
                />
              ) : (
                <span className="text-xs font-bold text-[#6fa89f] bg-[#011414] px-4 py-2 rounded-lg border border-[#c88214]/10">
                  Based on Selection
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            {viewMode === 'overall' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#c88214]/20">
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 rounded-tl-xl">Channel</th>
                  {userRole !== 'non-finance' && <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Spend</th>}
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Impressions</th>
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Clicks</th>
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Video Views</th>
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Completed Views</th>
                  <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Purchases</th>
                  <th className={`py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right ${userRole === 'non-finance' ? 'rounded-tr-xl' : ''}`}>CTR</th>
                  {userRole !== 'non-finance' && (
                    <>
                      <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">CPM</th>
                      <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">CPC</th>
                      <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right rounded-tr-xl">CPV</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr key={row.channel} className={`border-b border-[#c88214]/10 hover:bg-[#74FA93]/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#011414]/20'}`}>
                    <td className="py-4 px-4 text-sm font-bold text-[#eef7f5]">{row.channel}</td>
                    {userRole !== 'non-finance' && <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.spend * exRate)}</td>}
                    <td className="py-4 px-4 text-sm font-medium text-[#c88214] text-right">{d3.format(",")(row.impressions)}</td>
                    <td className="py-4 px-4 text-sm font-medium text-[#6fa89f] text-right">{d3.format(",")(row.clicks)}</td>
                    <td className="py-4 px-4 text-sm font-medium text-[#c88214] text-right">{formatShort(row.views)}</td>
                    <td className="py-4 px-4 text-sm font-medium text-white text-right">{formatShort(row.completions)}</td>
                    <td className="py-4 px-4 text-sm font-medium text-white text-right">{d3.format(",")(row.purchases)}</td>
                    <td className="py-4 px-4 text-sm font-bold text-white text-right">{row.ctr.toFixed(2)}%</td>
                    {userRole !== 'non-finance' && (
                      <>
                        <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpm * exRate)}</td>
                        <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpc * exRate)}</td>
                        <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpv * exRate)}</td>
                      </>
                    )}
                  </tr>
                ))}
                {tableData.length > 0 && (() => {
                  const tSpend = d3.sum(tableData, d => d.spend);
                  const tImp = d3.sum(tableData, d => d.impressions);
                  const tClicks = d3.sum(tableData, d => d.clicks);
                  const tViews = d3.sum(tableData, d => d.views);
                  const tCompletions = d3.sum(tableData, d => d.completions);
                  const tPurchases = d3.sum(tableData, d => d.purchases);
                  const tCtr = tImp > 0 ? (tClicks / tImp) * 100 : 0;
                  const tCpm = tImp > 0 ? (tSpend / tImp) * 1000 : 0;
                  const tCpc = tClicks > 0 ? tSpend / tClicks : 0;
                  const tCpv = tViews > 0 ? tSpend / tViews : 0;
                  return (
                    <tr className="bg-[#011414]/80 border-t-2 border-[#c88214]/50">
                      <td className="py-4 px-4 text-sm font-black text-[#c88214]">Total</td>
                      {userRole !== 'non-finance' && <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tSpend * exRate)}</td>}
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{d3.format(",")(tImp)}</td>
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{d3.format(",")(tClicks)}</td>
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{formatShort(tViews)}</td>
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{formatShort(tCompletions)}</td>
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{d3.format(",")(tPurchases)}</td>
                      <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{tCtr.toFixed(2)}%</td>
                      {userRole !== 'non-finance' && (
                        <>
                          <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tCpm * exRate)}</td>
                          <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tCpc * exRate)}</td>
                          <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tCpv * exRate)}</td>
                        </>
                      )}
                    </tr>
                  );
                })()}
              </tbody>
            </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#c88214]/20">
                    <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 rounded-tl-xl">Channel</th>
                    <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50">Buying Type</th>
                    <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Planned Cost</th>
                    <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Delivered Cost</th>
                    <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Booked Units</th>
                    <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Delivered Units</th>
                    {(plannedMetrics.includes('% Delivered') || plannedMetrics.includes('All')) && <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right rounded-tr-xl">% Delivered</th>}
                    {(plannedMetrics.includes('% Pacing') || plannedMetrics.includes('All')) && <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right rounded-tr-xl">% Pacing</th>}
                    {(plannedMetrics.includes('Cost compare') || plannedMetrics.includes('All')) && (
                      <>
                        <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right">Planned Unit Cost</th>
                        <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right rounded-tr-xl">Delivered Unit Cost</th>
                      </>
                    )}
                    {(plannedMetrics.includes('% difference of unit cost') || plannedMetrics.includes('All')) && <th className="py-4 px-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest bg-[#011414]/50 text-right rounded-tr-xl">% Diff Unit Cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {plannedTableData.map((row, i) => (
                    <tr key={`${row.channel}_${row.buyingType}`} className={`border-b border-[#c88214]/10 hover:bg-[#74FA93]/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#011414]/20'}`}>
                      <td className="py-4 px-4 text-sm font-bold text-[#eef7f5]">{row.channel}</td>
                      <td className="py-4 px-4 text-sm font-medium text-[#c88214]">{row.buyingType}</td>
                      <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.plannedCost * exRate)}</td>
                      <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.deliveredCost * exRate)}</td>
                      <td className="py-4 px-4 text-sm font-medium text-[#6fa89f] text-right">{d3.format(",")(row.bookedUnits)}</td>
                      <td className="py-4 px-4 text-sm font-medium text-[#6fa89f] text-right">{d3.format(",")(row.deliveredUnits)}</td>
                      {(plannedMetrics.includes('% Delivered') || plannedMetrics.includes('All')) && <td className="py-4 px-4 text-sm font-bold text-white text-right">{row.pctDelivered.toFixed(2)}%</td>}
                      {(plannedMetrics.includes('% Pacing') || plannedMetrics.includes('All')) && <td className="py-4 px-4 text-sm font-bold text-white text-right">{row.pctPacing.toFixed(2)}%</td>}
                      {(plannedMetrics.includes('Cost compare') || plannedMetrics.includes('All')) && (
                        <>
                          <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.plannedUnitCost * exRate)}</td>
                          <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.deliveredUnitCost * exRate)}</td>
                        </>
                      )}
                      {(plannedMetrics.includes('% difference of unit cost') || plannedMetrics.includes('All')) && (
                        <td className={`py-4 px-4 text-sm font-bold text-right ${row.pctDiffUnitCost < 0 ? 'text-[#74FA93]' : (row.pctDiffUnitCost > 0 ? 'text-red-400' : 'text-white')}`}>
                          {row.pctDiffUnitCost > 0 ? '+' : ''}{row.pctDiffUnitCost.toFixed(2)}%
                        </td>
                      )}
                    </tr>
                  ))}
                  {plannedTableData.length > 0 && (() => {
                    const tPlannedCost = d3.sum(plannedTableData, d => d.plannedCost);
                    const tDeliveredCost = d3.sum(plannedTableData, d => d.deliveredCost);
                    const tBookedUnits = d3.sum(plannedTableData, d => d.bookedUnits);
                    const tDeliveredUnits = d3.sum(plannedTableData, d => d.deliveredUnits);
                    const tPctDelivered = tBookedUnits > 0 ? (tDeliveredUnits / tBookedUnits) * 100 : 0;
                    const tPctPacing = tPlannedCost > 0 ? (tDeliveredCost / tPlannedCost) * 100 : 0;
                    
                    return (
                      <tr className="bg-[#011414]/80 border-t-2 border-[#c88214]/50">
                        <td className="py-4 px-4 text-sm font-black text-[#c88214]">Total</td>
                        <td className="py-4 px-4 text-sm font-black text-[#c88214]"></td>
                        <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tPlannedCost * exRate)}</td>
                        <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{exSym}{d3.format(",.2f")(tDeliveredCost * exRate)}</td>
                        <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{d3.format(",")(tBookedUnits)}</td>
                        <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{d3.format(",")(tDeliveredUnits)}</td>
                        {(plannedMetrics.includes('% Delivered') || plannedMetrics.includes('All')) && <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{tPctDelivered.toFixed(2)}%</td>}
                        {(plannedMetrics.includes('% Pacing') || plannedMetrics.includes('All')) && <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">{tPctPacing.toFixed(2)}%</td>}
                        {(plannedMetrics.includes('Cost compare') || plannedMetrics.includes('All')) && (
                          <>
                            <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">-</td>
                            <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">-</td>
                          </>
                        )}
                        {(plannedMetrics.includes('% difference of unit cost') || plannedMetrics.includes('All')) && (
                          <td className="py-4 px-4 text-sm font-black text-[#c88214] text-right">-</td>
                        )}
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
