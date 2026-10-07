import React, { useState, useMemo } from 'react';

import * as d3 from 'd3';
import { ChevronDown, Calendar, Layers, Activity, Search, Check, Download, Camera } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import html2canvas from 'html2canvas';

const COLORS = ['#74FA93', '#cedc28', '#00937b', '#EF4444', '#14a6d9', '#10B981', '#eef7f5', '#14a6d9'];

const MetricMultiSelectDropdown = ({ options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const filtered = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="relative min-w-[200px] z-30">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-[#0a2442] border border-[#cedc28]/30 rounded-lg text-xs font-bold text-[#eef7f5] cursor-pointer flex justify-between items-center hover:border-[#cedc28] transition-colors"
      >
        <span className="truncate pr-2">{selected.includes('All') ? 'All Metrics' : selected.join(', ')}</span>
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
              <div onClick={() => { onChange(['All']); setIsOpen(false); setSearchTerm(''); }} className={`px-3 py-2 rounded-lg text-sm font-bold cursor-pointer flex justify-between ${selected.includes('All') ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}>
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
                  }} className={`px-3 py-2 mt-1 rounded-lg text-sm font-bold cursor-pointer flex justify-between ${isSel ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}>
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

export default function CampaignView({ adData, plannedData = [], exRate = 1, exSym = '$', formatShort = (v) => v, userRole, filterMarkets, filterEvents = ['All'] }) {
  const [selectedPhases, setSelectedPhases] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState({}); // { phaseName: [channelNames] }
  const [viewMode, setViewMode] = useState('overall'); // 'overall' or 'planned'
  const [plannedMetrics, setPlannedMetrics] = useState(['% Delivered']); // changed to array
  const [overallMetrics, setOverallMetrics] = useState(['All']);
  const [chartMetric, setChartMetric] = useState('Spend');

  const [sortConfig, setSortConfig] = useState({ key: 'spend', direction: 'desc' });
  const [plannedSortConfig, setPlannedSortConfig] = useState({ key: 'plannedCost', direction: 'desc' });
  const [comparisonSortConfig, setComparisonSortConfig] = useState({ key: 'spend', direction: 'desc' });

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const handlePlannedSort = (key) => {
    let direction = 'desc';
    if (plannedSortConfig && plannedSortConfig.key === key && plannedSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setPlannedSortConfig({ key, direction });
  };

  const handleComparisonSort = (key) => {
    let direction = 'desc';
    if (comparisonSortConfig && comparisonSortConfig.key === key && comparisonSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setComparisonSortConfig({ key, direction });
  };

  // Process data based on global filters
  const campaignData = useMemo(() => {
    return adData.filter(d => d.dateObj);
  }, [adData]);

  const chartPhases = useMemo(() => selectedPhases.length > 0 ? selectedPhases : ['All Phases'], [selectedPhases]);

  const dailyChartData = useMemo(() => {
    if (campaignData.length === 0) return [];
    
    // Group by date and phase
    const rolled = d3.rollup(campaignData, 
      v => ({
        Spend: d3.sum(v, d => d.cost),
        Impressions: d3.sum(v, d => d.impressions),
        Clicks: d3.sum(v, d => d.clicks),
        CPM: d3.sum(v, d => d.impressions) > 0 ? (d3.sum(v, d => d.cost) / d3.sum(v, d => d.impressions)) * 1000 : 0,
        CPC: d3.sum(v, d => d.clicks) > 0 ? d3.sum(v, d => d.cost) / d3.sum(v, d => d.clicks) : 0,
        Conversions: d3.sum(v, d => d.purchases),
        CPA: d3.sum(v, d => d.purchases) > 0 ? d3.sum(v, d => d.cost) / d3.sum(v, d => d.purchases) : 0
      }),
      d => d3.timeFormat('%Y-%m-%d')(d.dateObj),
      d => chartPhases.length === 1 && chartPhases[0] === 'All Phases' ? 'All Phases' : (chartPhases.includes(d.phase) ? d.phase : 'Other')
    );
    
    const dates = Array.from(rolled.keys()).sort();
    return dates.map(date => {
      const dateMap = rolled.get(date);
      const row = { date };
      chartPhases.forEach(p => {
        if (dateMap && dateMap.has(p)) {
          const metrics = dateMap.get(p);
          row[`${p}_Spend`] = metrics.Spend;
          row[`${p}_Impressions`] = metrics.Impressions;
          row[`${p}_Clicks`] = metrics.Clicks;
          row[`${p}_CPM`] = metrics.CPM;
          row[`${p}_CPC`] = metrics.CPC;
          row[`${p}_Conversions`] = metrics.Conversions;
          row[`${p}_CPA`] = metrics.CPA;
        } else {
          row[`${p}_Spend`] = 0;
          row[`${p}_Impressions`] = 0;
          row[`${p}_Clicks`] = 0;
          row[`${p}_CPM`] = 0;
          row[`${p}_CPC`] = 0;
          row[`${p}_Conversions`] = 0;
          row[`${p}_CPA`] = 0;
        }
      });
      return row;
    }).sort((a,b) => new Date(a.date) - new Date(b.date));
  }, [campaignData, chartPhases]);

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

  const uniqueEvents = useMemo(() => Array.from(new Set(campaignData.map(d => d.eventNameDB))).filter(e => e && e !== 'Unknown').sort(), [campaignData]);

  const relativeChartData = useMemo(() => {
    if (uniqueEvents.length <= 1) return [];

    const eventLaunchDates = {};
    uniqueEvents.forEach(evt => {
      const rows = campaignData.filter(d => d.eventNameDB === evt);
      if (rows.length > 0) {
        eventLaunchDates[evt] = d3.min(rows, d => d.dateObj);
      }
    });

    const dayMap = {}; 
    campaignData.forEach(d => {
      const evt = d.eventNameDB;
      const launch = eventLaunchDates[evt];
      if (!launch || !d.dateObj) return;

      const diffTime = Math.abs(d.dateObj - launch);
      const relativeDay = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

      if (!dayMap[relativeDay]) {
        dayMap[relativeDay] = { Day: relativeDay, date: `Day ${relativeDay}` };
      }
      
      const dayObj = dayMap[relativeDay];
      if (!dayObj[`${evt}_rawSpend`]) {
        dayObj[`${evt}_rawSpend`] = 0;
        dayObj[`${evt}_rawImp`] = 0;
        dayObj[`${evt}_rawClk`] = 0;
        dayObj[`${evt}_rawConv`] = 0;
      }

      dayObj[`${evt}_rawSpend`] += d.cost;
      dayObj[`${evt}_rawImp`] += d.impressions;
      dayObj[`${evt}_rawClk`] += d.clicks;
      dayObj[`${evt}_rawConv`] += d.purchases;
    });

    const dataArray = Object.values(dayMap).sort((a, b) => a.Day - b.Day);
    dataArray.forEach(dayObj => {
      uniqueEvents.forEach(evt => {
        if (dayObj[`${evt}_rawSpend`] !== undefined) {
          const s = dayObj[`${evt}_rawSpend`];
          const i = dayObj[`${evt}_rawImp`];
          const c = dayObj[`${evt}_rawClk`];
          const cv = dayObj[`${evt}_rawConv`];

          dayObj[`${evt}_Spend`] = s;
          dayObj[`${evt}_Impressions`] = i;
          dayObj[`${evt}_Clicks`] = c;
          dayObj[`${evt}_Conversions`] = cv;
          dayObj[`${evt}_CPM`] = i > 0 ? (s / i) * 1000 : 0;
          dayObj[`${evt}_CPC`] = c > 0 ? s / c : 0;
          dayObj[`${evt}_CPA`] = cv > 0 ? s / cv : 0;
        }
      });
    });

    return dataArray;
  }, [campaignData, uniqueEvents]);

  const comparisonTableData = useMemo(() => {
    if (uniqueEvents.length <= 1) return [];
    
    return uniqueEvents.map(evt => {
      const rows = campaignData.filter(d => d.eventNameDB === evt);
      const minDate = rows.length > 0 ? d3.min(rows, d => d.dateObj) : null;
      const spend = d3.sum(rows, d => d.cost);
      const imp = d3.sum(rows, d => d.impressions);
      const clk = d3.sum(rows, d => d.clicks);
      const conv = d3.sum(rows, d => d.purchases);
      
      return {
        event: evt,
        startDate: minDate ? d3.timeFormat('%b %d, %Y')(minDate) : 'N/A',
        spend,
        impressions: imp,
        clicks: clk,
        cpm: imp > 0 ? (spend / imp) * 1000 : 0,
        cpc: clk > 0 ? spend / clk : 0,
        ctr: imp > 0 ? (clk / imp) * 100 : 0,
        conversions: conv,
        cpa: conv > 0 ? spend / conv : 0,
        cr: clk > 0 ? (conv / clk) * 100 : 0
      };
    }).sort((a,b) => {
      if (!comparisonSortConfig) return 0;
      let valA = a[comparisonSortConfig.key];
      let valB = b[comparisonSortConfig.key];
      if (valA < valB) return comparisonSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return comparisonSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [campaignData, uniqueEvents, comparisonSortConfig]);

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
    let data = campaignData;
    const isPhaseFiltered = selectedPhases.length > 0;

    if (isPhaseFiltered) {
      data = data.filter(d => selectedPhases.includes(d.phase));
      const hasAnyChannelSelection = selectedPhases.some(p => selectedChannels[p] && selectedChannels[p].length > 0);
      if (hasAnyChannelSelection) {
        data = data.filter(d => {
          const activeChs = selectedChannels[d.phase] || [];
          return activeChs.length === 0 || activeChs.includes(d.channel);
        });
      }
    }

    const groupFn = d => isPhaseFiltered ? `${d.phase} - ${d.channel}` : d.channel;

    const grouped = d3.groups(data, groupFn).map(([label, rows]) => {
      const impressions = d3.sum(rows, d => d.impressions);
      const clicks = d3.sum(rows, d => d.clicks);
      const views = d3.sum(rows, d => d.videoViews);
      const spend = d3.sum(rows, d => d.cost);
      const conversions = d3.sum(rows, d => d.purchases || 0);
      
      return {
        channel: label,
        spend,
        impressions,
        clicks,
        views,
        completions: d3.sum(rows, d => d.videoCompletions || 0),
        conversions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpv: views > 0 ? spend / views : 0,
        cpa: conversions > 0 ? spend / conversions : 0,
        cr: clicks > 0 ? (conversions / clicks) * 100 : 0
      };
    }).sort((a,b) => {
      if (!sortConfig) return 0;
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return grouped;
  }, [campaignData, selectedPhases, selectedChannels, sortConfig]);

  // Calculate planned table data based on selections
  const plannedTableData = useMemo(() => {
    if (!plannedData || plannedData.length === 0) return [];
    
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

    const isPhaseFiltered = selectedPhases.length > 0;
    const keyFn = d => isPhaseFiltered ? `${d.phase}_${d.channel}_${d.buyingType}`.toLowerCase() : `${d.channel}_${d.buyingType}`.toLowerCase();

    const pKeys = new Set(pData.map(keyFn));
    const aKeys = new Set(actualData.map(keyFn));
    const allKeys = Array.from(new Set([...pKeys, ...aKeys]));

    const combined = allKeys.map(key => {
      const pMatching = pData.filter(d => keyFn(d) === key);
      const aMatching = actualData.filter(d => keyFn(d) === key);
      
      const rawChannel = pMatching.length > 0 ? (pMatching[0].channel || '') : (aMatching.length > 0 ? aMatching[0].channel || '' : '');
      const rawPhase = pMatching.length > 0 ? (pMatching[0].phase || '') : (aMatching.length > 0 ? aMatching[0].phase || '' : '');
      const buyingType = pMatching.length > 0 ? (pMatching[0].buyingType || '') : (aMatching.length > 0 ? aMatching[0].buyingType || '' : '');
      
      const channelLabel = isPhaseFiltered ? `${rawPhase} - ${rawChannel}` : rawChannel;

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
        channel: channelLabel,
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
    }).sort((a,b) => {
      if (!plannedSortConfig) return 0;
      let valA = a[plannedSortConfig.key];
      let valB = b[plannedSortConfig.key];
      if (valA < valB) return plannedSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return plannedSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return combined;
  }, [campaignData, plannedData, selectedPhases, selectedChannels, filterMarkets, plannedSortConfig]);



  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    const headerTitle = selectedPhases.length > 0 ? 'Phase / Channel' : 'Channel';
    
    if (viewMode === 'overall') {
      const headers = [headerTitle];
      if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('Spend'))) headers.push('Spend');
      if (overallMetrics.includes('All') || overallMetrics.includes('Impressions')) headers.push('Impressions');
      if (overallMetrics.includes('All') || overallMetrics.includes('Clicks')) headers.push('Clicks');
      if (overallMetrics.includes('All') || overallMetrics.includes('Video Views')) headers.push('Video Views');
      if (overallMetrics.includes('All') || overallMetrics.includes('Completed Views')) headers.push('Completed Views');
      if (overallMetrics.includes('All') || overallMetrics.includes('Conversions')) headers.push('Conversions');
      if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPA'))) headers.push('CPA');
      if (overallMetrics.includes('All') || overallMetrics.includes('CVR')) headers.push('CVR');
      if (overallMetrics.includes('All') || overallMetrics.includes('CTR')) headers.push('CTR');
      if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPM'))) headers.push('CPM');
      if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPC'))) headers.push('CPC');
      if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPV'))) headers.push('CPV');
      
      csvContent += headers.join(",") + "\r\n";
      
      tableData.forEach(row => {
        const rowData = [row.channel];
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('Spend'))) rowData.push((row.spend * exRate).toFixed(2));
        if (overallMetrics.includes('All') || overallMetrics.includes('Impressions')) rowData.push(row.impressions);
        if (overallMetrics.includes('All') || overallMetrics.includes('Clicks')) rowData.push(row.clicks);
        if (overallMetrics.includes('All') || overallMetrics.includes('Video Views')) rowData.push(row.views);
        if (overallMetrics.includes('All') || overallMetrics.includes('Completed Views')) rowData.push(row.completions);
        if (overallMetrics.includes('All') || overallMetrics.includes('Conversions')) rowData.push(row.conversions);
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPA'))) rowData.push((row.cpa * exRate).toFixed(2));
        if (overallMetrics.includes('All') || overallMetrics.includes('CVR')) rowData.push(row.cr.toFixed(2) + '%');
        if (overallMetrics.includes('All') || overallMetrics.includes('CTR')) rowData.push(row.ctr.toFixed(2) + '%');
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPM'))) rowData.push((row.cpm * exRate).toFixed(2));
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPC'))) rowData.push((row.cpc * exRate).toFixed(2));
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPV'))) rowData.push((row.cpv * exRate).toFixed(2));
        csvContent += rowData.join(",") + "\r\n";
      });
      
      // Add Totals row
      if (tableData.length > 0) {
        const tSpend = d3.sum(tableData, d => d.spend);
        const tImp = d3.sum(tableData, d => d.impressions);
        const tClicks = d3.sum(tableData, d => d.clicks);
        const tViews = d3.sum(tableData, d => d.views);
        const tCompletions = d3.sum(tableData, d => d.completions);
        const tConversions = d3.sum(tableData, d => d.conversions);
        const tCtr = tImp > 0 ? (tClicks / tImp) * 100 : 0;
        const tCpm = tImp > 0 ? (tSpend / tImp) * 1000 : 0;
        const tCpc = tClicks > 0 ? tSpend / tClicks : 0;
        const tCpv = tViews > 0 ? tSpend / tViews : 0;
        const tCpa = tConversions > 0 ? tSpend / tConversions : 0;
        const tCr = tClicks > 0 ? (tConversions / tClicks) * 100 : 0;

        const totalsRow = ['Total'];
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('Spend'))) totalsRow.push((tSpend * exRate).toFixed(2));
        if (overallMetrics.includes('All') || overallMetrics.includes('Impressions')) totalsRow.push(tImp);
        if (overallMetrics.includes('All') || overallMetrics.includes('Clicks')) totalsRow.push(tClicks);
        if (overallMetrics.includes('All') || overallMetrics.includes('Video Views')) totalsRow.push(tViews);
        if (overallMetrics.includes('All') || overallMetrics.includes('Completed Views')) totalsRow.push(tCompletions);
        if (overallMetrics.includes('All') || overallMetrics.includes('Conversions')) totalsRow.push(tConversions);
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPA'))) totalsRow.push((tCpa * exRate).toFixed(2));
        if (overallMetrics.includes('All') || overallMetrics.includes('CVR')) totalsRow.push(tCr.toFixed(2) + '%');
        if (overallMetrics.includes('All') || overallMetrics.includes('CTR')) totalsRow.push(tCtr.toFixed(2) + '%');
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPM'))) totalsRow.push((tCpm * exRate).toFixed(2));
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPC'))) totalsRow.push((tCpc * exRate).toFixed(2));
        if (userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPV'))) totalsRow.push((tCpv * exRate).toFixed(2));
        csvContent += totalsRow.join(",") + "\r\n";
      }

    } else {
      const headers = [selectedPhases.length > 0 ? 'Phase / Channel' : 'Channel', 'Buying Type', 'Planned Cost', 'Delivered Cost', 'Booked Units', 'Delivered Units'];
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
    link.setAttribute("download", `Event_${viewMode}_Performance_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportComparisonCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Headers
    const headers = ['Event', 'Launch Date'];
    if (userRole !== 'non-finance') headers.push('Spend');
    headers.push('Impressions', 'Clicks', 'CTR');
    if (userRole !== 'non-finance') headers.push('CPC', 'CPM');
    headers.push('Conversions', 'CVR');
    if (userRole !== 'non-finance') headers.push('CPA');
    csvContent += headers.join(",") + "\r\n";
    
    // Rows
    comparisonTableData.forEach(row => {
      const rowData = [row.event, row.startDate];
      if (userRole !== 'non-finance') rowData.push((row.spend * exRate).toFixed(2));
      rowData.push(row.impressions, row.clicks, `${row.ctr.toFixed(2)}%`);
      if (userRole !== 'non-finance') rowData.push((row.cpc * exRate).toFixed(2), (row.cpm * exRate).toFixed(2));
      rowData.push(row.conversions, `${row.cr.toFixed(2)}%`);
      if (userRole !== 'non-finance') rowData.push((row.cpa * exRate).toFixed(2));
      csvContent += rowData.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = d3.timeFormat('%Y-%m-%d')(new Date());
    link.setAttribute("download", `Event_Comparison_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (filterEvents.includes('All')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] w-full max-w-7xl mx-auto card-surface backdrop-blur-2xl p-8 rounded-3xl border border-[#cedc28]/20 shadow-xl gap-4">
        <Activity size={48} className="text-[#14a6d9] opacity-50" />
        <h2 className="text-xl font-bold text-[#eef7f5]">Select an event to see details</h2>
        <p className="text-sm text-[#14a6d9]">Or select more than one event to compare them.</p>
      </div>
    );
  }

  if (uniqueEvents.length > 1) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12">
        <div className="card-surface backdrop-blur-2xl p-8 rounded-3xl border border-[#cedc28]/20 shadow-xl overflow-hidden">
          <h3 className="text-2xl font-anton uppercase text-[#eef7f5] flex items-center gap-3 mb-2">
            <Activity className="text-[#cedc28]" /> Event Comparison (Relative Timeline)
          </h3>
          <p className="text-xs text-[#14a6d9] mb-8 font-bold tracking-wider">COMPARING DAILY TRAJECTORIES FROM DAY 1 OF EACH EVENT'S LAUNCH</p>
          
          <div className="flex justify-between items-center mb-6">
            <div className="flex bg-[#0a2442] rounded-lg p-1 border border-[#cedc28]/20 overflow-x-auto custom-scrollbar">
              {['Spend', 'Impressions', 'Clicks', 'CPM', 'CPC', 'Conversions', 'CPA'].filter(m => userRole !== 'non-finance' || (m !== 'Spend' && m !== 'CPM' && m !== 'CPC' && m !== 'CPA')).map(m => (
                <button
                  key={m}
                  onClick={() => setChartMetric(m)}
                  className={`px-4 py-2 rounded text-[10px] font-bold transition-all whitespace-nowrap ${chartMetric === m ? 'bg-[#cedc28] text-[#1a302e]' : 'text-[#14a6d9] hover:bg-[#cedc28]/10'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            
            <button
              onClick={async () => {
                try {
                  const el = document.getElementById('comparison-chart-container');
                  if (el) {
                    const svg = el.querySelector('svg');
                    if (svg) {
                      const svgData = new XMLSerializer().serializeToString(svg);
                      const canvas = document.createElement('canvas');
                      const svgSize = svg.getBoundingClientRect();
                      canvas.width = svgSize.width * 2;
                      canvas.height = svgSize.height * 2;
                      const ctx = canvas.getContext('2d');
                      
                      ctx.fillStyle = '#0a2442';
                      ctx.fillRect(0, 0, canvas.width, canvas.height);
                      
                      const img = new Image();
                      img.onload = () => {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        const link = document.createElement('a');
                        link.download = `event-comparison-${chartMetric}.png`;
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                      };
                      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                    }
                  }
                } catch (err) {
                  console.error("Error downloading chart:", err);
                  alert("Could not download chart. Please try again.");
                }
              }}
              className="p-2 rounded-lg bg-[#0a2442] border border-[#cedc28]/20 text-[#cedc28] hover:bg-[#cedc28]/10 transition-colors"
              title="Download Chart as Image"
            >
              <Camera size={14} />
            </button>
          </div>

          <div className="w-full h-[400px] mt-4 bg-[#0a2442]/30 rounded-xl p-4 border border-[#cedc28]/10" id="comparison-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={relativeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cedc28" opacity={0.1} vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#14a6d9" 
                  tick={{ fill: '#14a6d9', fontSize: 10, fontWeight: 700 }}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis 
                  stroke="#14a6d9" 
                  tick={{ fill: '#14a6d9', fontSize: 10, fontWeight: 700 }}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                  tickFormatter={formatShort}
                />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0a2442', borderColor: '#cedc28', borderRadius: '12px', color: '#eef7f5', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                  itemStyle={{ fontWeight: 700, fontSize: '12px' }}
                  labelStyle={{ color: '#14a6d9', fontWeight: 900, marginBottom: '8px', fontSize: '14px', borderBottom: '1px solid rgba(20, 166, 217, 0.2)', paddingBottom: '4px' }}
                  formatter={(value, name) => [
                    chartMetric === 'Spend' || chartMetric === 'CPA' || chartMetric === 'CPC' || chartMetric === 'CPM'
                      ? `${exSym}${(value * exRate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                      : value.toLocaleString(),
                    name.replace(`_${chartMetric}`, '')
                  ]}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="circle"
                />
                {uniqueEvents.map((evt, i) => (
                  <Line 
                    key={evt}
                    type="monotone"
                    dataKey={`${evt}_${chartMetric}`}
                    name={evt}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    connectNulls={true}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Comparison Data Table */}
        <div className="card-surface backdrop-blur-2xl p-8 rounded-3xl border border-[#cedc28]/20 shadow-xl overflow-hidden mt-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-anton uppercase text-[#eef7f5] flex items-center gap-3">
              <Layers className="text-[#cedc28]" /> Event Performance Summary
            </h3>
            <button
              onClick={handleExportComparisonCSV}
              className="px-3 py-2 flex items-center gap-2 rounded-lg bg-[#0a2442] border border-[#cedc28]/20 text-[#cedc28] hover:bg-[#cedc28]/10 transition-colors shadow-[0_0_10px_rgba(200,130,20,0.1)] text-xs font-bold"
              title="Export Comparison to CSV"
            >
              <Download size={14} /> Export Table
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#cedc28]/20 bg-[#0a2442]/50 custom-scrollbar">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-[#0a2442]/80 border-b border-[#cedc28]/20">
                  <th onClick={() => handleComparisonSort('event')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest">Event {comparisonSortConfig?.key === 'event' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                  <th onClick={() => handleComparisonSort('dateObj')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest">Launch Date {comparisonSortConfig?.key === 'dateObj' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                  {userRole !== 'non-finance' && <th onClick={() => handleComparisonSort('spend')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest text-right">Spend {comparisonSortConfig?.key === 'spend' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  <th onClick={() => handleComparisonSort('impressions')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest text-right">Impressions {comparisonSortConfig?.key === 'impressions' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                  <th onClick={() => handleComparisonSort('clicks')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest text-right">Clicks {comparisonSortConfig?.key === 'clicks' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                  <th onClick={() => handleComparisonSort('ctr')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest text-right">CTR {comparisonSortConfig?.key === 'ctr' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                  {userRole !== 'non-finance' && <th onClick={() => handleComparisonSort('cpc')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest text-right">CPC {comparisonSortConfig?.key === 'cpc' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {userRole !== 'non-finance' && <th onClick={() => handleComparisonSort('cpm')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest text-right">CPM {comparisonSortConfig?.key === 'cpm' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  <th onClick={() => handleComparisonSort('conversions')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest text-right">Conversions {comparisonSortConfig?.key === 'conversions' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                  <th onClick={() => handleComparisonSort('cr')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest text-right">CVR {comparisonSortConfig?.key === 'cr' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                  {userRole !== 'non-finance' && <th onClick={() => handleComparisonSort('cpa')} className="cursor-pointer px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest text-right">CPA {comparisonSortConfig?.key === 'cpa' ? (comparisonSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                </tr>
              </thead>
              <tbody>
                {comparisonTableData.map((row, idx) => (
                  <tr key={idx} className="border-b border-[#cedc28]/10 hover:bg-[#cedc28]/5 transition-colors">
                    <td className="px-6 py-4 text-sm font-bold text-[#eef7f5]">{row.event}</td>
                    <td className="px-6 py-4 text-sm font-bold text-[#14a6d9]">{row.startDate}</td>
                    {userRole !== 'non-finance' && <td className="px-6 py-4 text-sm font-bold text-[#cedc28] text-right">{exSym}{(row.spend * exRate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>}
                    <td className="px-6 py-4 text-sm font-bold text-[#eef7f5] text-right">{row.impressions.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-bold text-[#eef7f5] text-right">{row.clicks.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-bold text-[#eef7f5] text-right">{row.ctr.toFixed(2)}%</td>
                    {userRole !== 'non-finance' && <td className="px-6 py-4 text-sm font-bold text-[#eef7f5] text-right">{exSym}{(row.cpc * exRate).toFixed(2)}</td>}
                    {userRole !== 'non-finance' && <td className="px-6 py-4 text-sm font-bold text-[#eef7f5] text-right">{exSym}{(row.cpm * exRate).toFixed(2)}</td>}
                    <td className="px-6 py-4 text-sm font-bold text-[#10B981] text-right">{row.conversions.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-bold text-[#eef7f5] text-right">{row.cr.toFixed(2)}%</td>
                    {userRole !== 'non-finance' && <td className="px-6 py-4 text-sm font-bold text-[#10B981] text-right">{exSym}{(row.cpa * exRate).toFixed(2)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto pb-12">
      {/* Top Controls */}
      {phases.length > 0 && (
        <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl flex flex-col gap-4 export-slide" data-title="Event Top Stats">
          <label className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-2 block flex items-center gap-2">
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
                    color: isActive ? color : '#14a6d9'
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

      {/* Timeline Gantt Chart */}
      {selectedPhases.length > 0 && timeScale && (
        <div className="card-surface backdrop-blur-2xl p-4 rounded-3xl border border-[#cedc28]/20 shadow-xl overflow-hidden relative export-slide" data-title="Event Timeline">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-anton uppercase text-[#eef7f5] flex items-center gap-3">
              <Calendar className="text-[#cedc28]" /> Event Timeline

            </h3>
            <div className="text-xs font-bold text-[#14a6d9] bg-[#0a2442] px-3 py-1.5 rounded-lg border border-[#cedc28]/10">
              {d3.timeFormat('%b %d, %Y')(campaignMinDate)} - {d3.timeFormat('%b %d, %Y')(campaignMaxDate)}
            </div>
          </div>

          <div className="relative pt-4 pb-2 overflow-x-auto custom-scrollbar">
            <div className="min-w-[800px] relative">
              {/* X-Axis Ticks */}
              <div className="absolute top-0 left-[200px] right-0 h-full pointer-events-none">
                {ticks.map((tick, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-[#cedc28]/10 flex flex-col justify-start" style={{ left: `${tick.percent}%` }}>
                    <span className="text-[9px] font-bold text-[#14a6d9] uppercase tracking-widest -ml-4 -mt-6 card-surface backdrop-blur-2xl px-1">{tick.label}</span>
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
                        <div className="w-[184px] flex-shrink-0 text-right pr-4 border-r border-[#cedc28]/20">
                          <h4 className="text-sm font-bold" style={{ color: pColor }}>{phase.name}</h4>
                          <p className="text-[10px] text-[#14a6d9]">{d3.timeFormat('%b %d')(phase.minDate)} - {d3.timeFormat('%b %d')(phase.maxDate)}</p>
                        </div>
                        {/* Bar Area */}
                        <div className="flex-1 relative h-10 bg-[#0a2442]/50 rounded-lg overflow-hidden group">
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
                                color: isChActive ? pColor : '#14a6d9'
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
                            <div className="flex-1 relative h-6 bg-[#0a2442]/30 rounded-md">
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
      {(tableData.length > 0 || plannedTableData.length > 0) && (
        <div className="card-surface backdrop-blur-2xl p-8 rounded-3xl border border-[#cedc28]/20 shadow-xl overflow-hidden export-slide" data-title="Planned vs Delivered">
          <h3 className="text-2xl font-anton uppercase text-[#eef7f5] flex items-center gap-3 mb-6">
            <Activity className="text-[#cedc28]" /> Performance Metrics Breakdown

          </h3>
          
          {viewMode === 'overall' && dailyChartData.length > 0 && (
            <div className="mb-8" id="daily-progress-chart">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold text-[#14a6d9] uppercase tracking-widest">Daily Progress</h4>
                <div className="flex items-center gap-2">
                  <div className="flex bg-[#0a2442] rounded-lg p-1 border border-[#cedc28]/20">
                    {['Spend', 'Impressions', 'Clicks', 'CPM', 'CPC', 'Conversions', 'CPA'].filter(m => userRole !== 'non-finance' || (m !== 'Spend' && m !== 'CPM' && m !== 'CPC' && m !== 'CPA')).map(m => (
                      <button
                        key={m}
                        onClick={() => setChartMetric(m)}
                        className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${chartMetric === m ? 'bg-[#cedc28] text-[#1a302e]' : 'text-[#14a6d9] hover:bg-[#cedc28]/10'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const el = document.getElementById('daily-progress-chart-container');
                        if (el) {
                          const svg = el.querySelector('svg');
                          if (svg) {
                            const svgData = new XMLSerializer().serializeToString(svg);
                            const canvas = document.createElement('canvas');
                            const svgSize = svg.getBoundingClientRect();
                            canvas.width = svgSize.width * 2;
                            canvas.height = svgSize.height * 2;
                            const ctx = canvas.getContext('2d');
                            
                            // Fill background
                            ctx.fillStyle = '#0a2442';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            
                            const img = new Image();
                            img.onload = () => {
                              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                              const link = document.createElement('a');
                              link.download = `daily-progress-${chartMetric}.png`;
                              link.href = canvas.toDataURL('image/png');
                              link.click();
                            };
                            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                          }
                        }
                      } catch (err) {
                        console.error("Error downloading chart:", err);
                        alert("Could not download chart. Please try again.");
                      }
                    }}
                    className="p-1.5 rounded-lg bg-[#0a2442] border border-[#cedc28]/20 text-[#cedc28] hover:bg-[#cedc28]/10 transition-colors"
                    title="Download Chart as Image"
                  >
                    <Camera size={14} />
                  </button>
                </div>
              </div>
              <div className="h-64 w-full bg-[#0a2442]/30 rounded-xl p-4 border border-[#cedc28]/10" id="daily-progress-chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cedc28" opacity={0.1} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#eef7f5', fontSize: 10 }} 
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
                      }}
                      stroke="#cedc28" 
                      opacity={0.5} 
                    />
                    <YAxis 
                      tick={{ fill: '#eef7f5', fontSize: 10 }}
                      tickFormatter={(val) => {
                        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                        if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
                        return val;
                      }}
                      stroke="#cedc28" 
                      opacity={0.5}
                    />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#0a2442', borderColor: '#cedc28', borderRadius: '8px', color: '#eef7f5', fontSize: '12px', fontWeight: 'bold' }}
                      itemStyle={{ color: '#cedc28' }}
                      formatter={(value, name) => [
                        name === 'Spend' ? `${exSym}${d3.format(",.2f")(value * exRate)}` : d3.format(",")(value),
                        name
                      ]}
                      labelFormatter={(label) => {
                        const d = new Date(label);
                        return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
                      }}
                    />
                    {chartPhases.map((p, idx) => (
                      <Line 
                        key={p}
                        type="monotone" 
                        dataKey={`${p}_${chartMetric}`} 
                        name={p}
                        stroke={COLORS[idx % COLORS.length]} 
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, fill: COLORS[idx % COLORS.length], stroke: '#0a2442' }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="flex justify-end items-center mb-6 gap-4">
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 flex items-center gap-2 rounded-lg bg-[#0a2442] border border-[#cedc28]/20 text-[#cedc28] hover:bg-[#cedc28]/10 transition-colors shadow-[0_0_10px_rgba(200,130,20,0.1)] text-xs font-bold"
              title="Export to CSV (Excel)"
            >
              <Download size={14} /> Export Table
            </button>
            <div className="flex bg-[#0a2442] rounded-lg p-1 border border-[#cedc28]/20">
              <button 
                onClick={() => setViewMode('overall')} 
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'overall' ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#14a6d9] hover:bg-[#cedc28]/10 hover:text-[#cedc28] border border-[#cedc28]/20'}`}
              >
                Overall Data
              </button>
              <button 
                onClick={() => { if (plannedTableData.length > 0) setViewMode('planned'); }}
                disabled={plannedTableData.length === 0}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'planned' ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#14a6d9] hover:bg-[#cedc28]/10 hover:text-[#cedc28] border border-[#cedc28]/20'} ${plannedTableData.length === 0 ? 'opacity-50 cursor-not-allowed bg-black/20' : ''}`}
                title={plannedTableData.length === 0 ? 'No planned data available for the current selection' : ''}
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
              <MetricMultiSelectDropdown
                options={['Spend', 'Impressions', 'Clicks', 'Video Views', 'Completed Views', 'Conversions', 'CPA', 'CVR', 'CTR', 'CPM', 'CPC', 'CPV']}
                selected={overallMetrics}
                onChange={setOverallMetrics}
              />
            )}
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            {viewMode === 'overall' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#cedc28]/20">
                  <th onClick={() => handleSort('channel')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 rounded-tl-xl">{selectedPhases.length > 0 ? 'Phase / Channel' : 'Channel'} {sortConfig?.key === 'channel' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                  {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('Spend')) && <th onClick={() => handleSort('spend')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Spend {sortConfig?.key === 'spend' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {(overallMetrics.includes('All') || overallMetrics.includes('Impressions')) && <th onClick={() => handleSort('impressions')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Impressions {sortConfig?.key === 'impressions' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {(overallMetrics.includes('All') || overallMetrics.includes('Clicks')) && <th onClick={() => handleSort('clicks')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Clicks {sortConfig?.key === 'clicks' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {(overallMetrics.includes('All') || overallMetrics.includes('Video Views')) && <th onClick={() => handleSort('views')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Video Views {sortConfig?.key === 'views' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {(overallMetrics.includes('All') || overallMetrics.includes('Completed Views')) && <th onClick={() => handleSort('completions')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Completed Views {sortConfig?.key === 'completions' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {(overallMetrics.includes('All') || overallMetrics.includes('Conversions')) && <th onClick={() => handleSort('conversions')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Conversions {sortConfig?.key === 'conversions' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPA')) && <th onClick={() => handleSort('cpa')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">CPA {sortConfig?.key === 'cpa' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {(overallMetrics.includes('All') || overallMetrics.includes('CVR')) && <th onClick={() => handleSort('cr')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">CVR {sortConfig?.key === 'cr' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {(overallMetrics.includes('All') || overallMetrics.includes('CTR')) && <th onClick={() => handleSort('ctr')} className={`cursor-pointer py-4 px-4 text-[10px] font-black text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right ${userRole === 'non-finance' ? 'rounded-tr-xl' : ''}`}>CTR {sortConfig?.key === 'ctr' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPM')) && <th onClick={() => handleSort('cpm')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">CPM {sortConfig?.key === 'cpm' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPC')) && <th onClick={() => handleSort('cpc')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">CPC {sortConfig?.key === 'cpc' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPV')) && <th onClick={() => handleSort('cpv')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right rounded-tr-xl">CPV {sortConfig?.key === 'cpv' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr key={row.channel} className={`border-b border-[#cedc28]/10 hover:bg-[#74FA93]/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#0a2442]/20'}`}>
                    <td className="py-4 px-4 text-sm font-bold text-[#eef7f5]">{row.channel}</td>
                    {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('Spend')) && <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.spend * exRate)}</td>}
                    {(overallMetrics.includes('All') || overallMetrics.includes('Impressions')) && <td className="py-4 px-4 text-sm font-medium text-[#cedc28] text-right">{d3.format(",")(row.impressions)}</td>}
                    {(overallMetrics.includes('All') || overallMetrics.includes('Clicks')) && <td className="py-4 px-4 text-sm font-medium text-[#14a6d9] text-right">{d3.format(",")(row.clicks)}</td>}
                    {(overallMetrics.includes('All') || overallMetrics.includes('Video Views')) && <td className="py-4 px-4 text-sm font-medium text-[#cedc28] text-right">{formatShort(row.views)}</td>}
                    {(overallMetrics.includes('All') || overallMetrics.includes('Completed Views')) && <td className="py-4 px-4 text-sm font-medium text-white text-right">{formatShort(row.completions)}</td>}
                    {(overallMetrics.includes('All') || overallMetrics.includes('Conversions')) && <td className="py-4 px-4 text-sm font-medium text-white text-right">{d3.format(",")(row.conversions)}</td>}
                    {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPA')) && <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpa * exRate)}</td>}
                    {(overallMetrics.includes('All') || overallMetrics.includes('CVR')) && <td className="py-4 px-4 text-sm font-medium text-white text-right">{row.cr.toFixed(2)}%</td>}
                    {(overallMetrics.includes('All') || overallMetrics.includes('CTR')) && <td className="py-4 px-4 text-sm font-bold text-white text-right">{row.ctr.toFixed(2)}%</td>}
                    {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPM')) && <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpm * exRate)}</td>}
                    {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPC')) && <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpc * exRate)}</td>}
                    {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPV')) && <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.cpv * exRate)}</td>}
                  </tr>
                ))}
                {tableData.length > 0 && (() => {
                  const tSpend = d3.sum(tableData, d => d.spend);
                  const tImp = d3.sum(tableData, d => d.impressions);
                  const tClicks = d3.sum(tableData, d => d.clicks);
                  const tViews = d3.sum(tableData, d => d.views);
                  const tCompletions = d3.sum(tableData, d => d.completions);
                  const tConversions = d3.sum(tableData, d => d.conversions);
                  const tCtr = tImp > 0 ? (tClicks / tImp) * 100 : 0;
                  const tCpm = tImp > 0 ? (tSpend / tImp) * 1000 : 0;
                  const tCpc = tClicks > 0 ? tSpend / tClicks : 0;
                  const tCpv = tViews > 0 ? tSpend / tViews : 0;
                  const tCpa = tConversions > 0 ? tSpend / tConversions : 0;
                  const tCr = tClicks > 0 ? (tConversions / tClicks) * 100 : 0;
                  return (
                    <tr className="bg-[#0a2442]/80 border-t-2 border-[#cedc28]/50">
                      <td className="py-4 px-4 text-sm font-bold text-[#cedc28]">Total</td>
                      {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('Spend')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{exSym}{d3.format(",.2f")(tSpend * exRate)}</td>}
                      {(overallMetrics.includes('All') || overallMetrics.includes('Impressions')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{d3.format(",")(tImp)}</td>}
                      {(overallMetrics.includes('All') || overallMetrics.includes('Clicks')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{d3.format(",")(tClicks)}</td>}
                      {(overallMetrics.includes('All') || overallMetrics.includes('Video Views')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{formatShort(tViews)}</td>}
                      {(overallMetrics.includes('All') || overallMetrics.includes('Completed Views')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{formatShort(tCompletions)}</td>}
                      {(overallMetrics.includes('All') || overallMetrics.includes('Conversions')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{d3.format(",")(tConversions)}</td>}
                      {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPA')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{exSym}{d3.format(",.2f")(tCpa * exRate)}</td>}
                      {(overallMetrics.includes('All') || overallMetrics.includes('CVR')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{tCr.toFixed(2)}%</td>}
                      {(overallMetrics.includes('All') || overallMetrics.includes('CTR')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{tCtr.toFixed(2)}%</td>}
                      {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPM')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{exSym}{d3.format(",.2f")(tCpm * exRate)}</td>}
                      {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPC')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{exSym}{d3.format(",.2f")(tCpc * exRate)}</td>}
                      {userRole !== 'non-finance' && (overallMetrics.includes('All') || overallMetrics.includes('CPV')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{exSym}{d3.format(",.2f")(tCpv * exRate)}</td>}
                    </tr>
                  );
                })()}
              </tbody>
            </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#cedc28]/20">
                    <th onClick={() => handlePlannedSort('channel')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 rounded-tl-xl">{selectedPhases.length > 0 ? 'Phase / Channel' : 'Channel'} {plannedSortConfig?.key === 'channel' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                    <th onClick={() => handlePlannedSort('buyingType')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50">Buying Type {plannedSortConfig?.key === 'buyingType' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                    <th onClick={() => handlePlannedSort('plannedCost')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Planned Cost {plannedSortConfig?.key === 'plannedCost' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                    <th onClick={() => handlePlannedSort('deliveredCost')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Delivered Cost {plannedSortConfig?.key === 'deliveredCost' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                    <th onClick={() => handlePlannedSort('bookedUnits')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Booked Units {plannedSortConfig?.key === 'bookedUnits' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                    <th onClick={() => handlePlannedSort('deliveredUnits')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Delivered Units {plannedSortConfig?.key === 'deliveredUnits' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                    {(plannedMetrics.includes('% Delivered') || plannedMetrics.includes('All')) && <th onClick={() => handlePlannedSort('pctDelivered')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right rounded-tr-xl">% Delivered {plannedSortConfig?.key === 'pctDelivered' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                    {(plannedMetrics.includes('% Pacing') || plannedMetrics.includes('All')) && <th onClick={() => handlePlannedSort('pctPacing')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right rounded-tr-xl">% Pacing {plannedSortConfig?.key === 'pctPacing' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                    {(plannedMetrics.includes('Cost compare') || plannedMetrics.includes('All')) && (
                      <>
                        <th onClick={() => handlePlannedSort('plannedUnitCost')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right">Planned Unit Cost {plannedSortConfig?.key === 'plannedUnitCost' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                        <th onClick={() => handlePlannedSort('deliveredUnitCost')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right rounded-tr-xl">Delivered Unit Cost {plannedSortConfig?.key === 'deliveredUnitCost' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                      </>
                    )}
                    {(plannedMetrics.includes('% difference of unit cost') || plannedMetrics.includes('All')) && <th onClick={() => handlePlannedSort('pctDiffUnitCost')} className="cursor-pointer py-4 px-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest bg-[#0a2442]/50 text-right rounded-tr-xl">% Diff Unit Cost {plannedSortConfig?.key === 'pctDiffUnitCost' ? (plannedSortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}</th>}
                  </tr>
                </thead>
                <tbody>
                  {plannedTableData.map((row, i) => (
                    <tr key={`${row.channel}_${row.buyingType}`} className={`border-b border-[#cedc28]/10 hover:bg-[#74FA93]/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#0a2442]/20'}`}>
                      <td className="py-4 px-4 text-sm font-bold text-[#eef7f5]">{row.channel}</td>
                      <td className="py-4 px-4 text-sm font-medium text-[#cedc28]">{row.buyingType}</td>
                      <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.plannedCost * exRate)}</td>
                      <td className="py-4 px-4 text-sm font-medium text-white text-right">{exSym}{d3.format(",.2f")(row.deliveredCost * exRate)}</td>
                      <td className="py-4 px-4 text-sm font-medium text-[#14a6d9] text-right">{d3.format(",")(row.bookedUnits)}</td>
                      <td className="py-4 px-4 text-sm font-medium text-[#14a6d9] text-right">{d3.format(",")(row.deliveredUnits)}</td>
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
                      <tr className="bg-[#0a2442]/80 border-t-2 border-[#cedc28]/50">
                        <td className="py-4 px-4 text-sm font-bold text-[#cedc28]">Total</td>
                        <td className="py-4 px-4 text-sm font-bold text-[#cedc28]"></td>
                        <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{exSym}{d3.format(",.2f")(tPlannedCost * exRate)}</td>
                        <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{exSym}{d3.format(",.2f")(tDeliveredCost * exRate)}</td>
                        <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{d3.format(",")(tBookedUnits)}</td>
                        <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{d3.format(",")(tDeliveredUnits)}</td>
                        {(plannedMetrics.includes('% Delivered') || plannedMetrics.includes('All')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{tPctDelivered.toFixed(2)}%</td>}
                        {(plannedMetrics.includes('% Pacing') || plannedMetrics.includes('All')) && <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">{tPctPacing.toFixed(2)}%</td>}
                        {(plannedMetrics.includes('Cost compare') || plannedMetrics.includes('All')) && (
                          <>
                            <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">-</td>
                            <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">-</td>
                          </>
                        )}
                        {(plannedMetrics.includes('% difference of unit cost') || plannedMetrics.includes('All')) && (
                          <td className="py-4 px-4 text-sm font-bold text-[#cedc28] text-right">-</td>
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
