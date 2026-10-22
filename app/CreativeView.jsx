import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { 
  BarChart3, Zap, Grid, List, Check, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  MonitorPlay, Download, ExternalLink, Maximize2, Minimize2, X, Eye, SlidersHorizontal, Sparkles
} from 'lucide-react';

const formatC = (val, dec=2) => val != null ? `$${d3.format(`,.${dec}f`)(val)}` : '$0.00';

const MultiSelectDropdown = ({ 
  label, 
  options, 
  selected, 
  onChange, 
  allowEmpty = false, 
  noneMode = false, 
  placeholder = "Select..." 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const rootRef = useRef(null);

  // backdrop-blur ancestors trap fixed overlays, so close on outside clicks via a document listener
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const filtered = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  const displayText = noneMode
    ? (selected.length === 0 ? 'None' : selected.join(', '))
    : selected.includes('All') 
    ? 'All' 
    : selected.length === 0 
    ? (allowEmpty ? placeholder : 'None') 
    : selected.join(', ');

  return (
    <div ref={rootRef} className={`relative min-w-[110px] ${isOpen ? 'z-[100]' : 'z-[60]'}`}>
      <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-1 block">{label}</span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1.5 card-surface backdrop-blur-2xl border border-[#cedc28]/30 rounded-lg text-xs font-bold text-[#eef7f5] cursor-pointer flex justify-between items-center hover:border-[#cedc28] transition-colors"
      >
        <span className="truncate pr-2">{displayText}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-full min-w-[190px] h-0 z-[100]">
          <div className="w-full mt-2 card-surface backdrop-blur-2xl border border-[#cedc28]/30 rounded-xl shadow-2xl flex flex-col max-h-64 overflow-hidden">
            <div className="p-2 border-b border-[#cedc28]/10 relative">
              <Search className="w-4 h-4 text-[#14a6d9] absolute left-4 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search..." 
                autoFocus 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                className="w-full bg-[#0a2442] text-[#eef7f5] text-xs font-bold pl-9 pr-3 py-2 rounded-lg outline-none border border-transparent focus:border-[#cedc28]/50" 
              />
            </div>
            <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
              <div 
                onClick={() => { onChange(noneMode ? [] : ['All']); setIsOpen(false); setSearchTerm(''); }} 
                className={`px-3 py-2 rounded-lg text-sm font-bold cursor-pointer flex justify-between ${(noneMode ? selected.length === 0 : selected.includes('All')) ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}
              >
                {noneMode ? 'None' : 'All'} <Check className={`w-4 h-4 ${(noneMode ? selected.length === 0 : selected.includes('All')) ? 'opacity-100' : 'opacity-0'}`} />
              </div>
              {filtered.map(opt => {
                const isSel = selected.includes(opt);
                return (
                  <div 
                    key={opt} 
                    onClick={() => {
                      let next = [...selected];
                      if (next.includes('All')) next = [];
                      if (isSel) {
                        next = next.filter(n => n !== opt);
                        if (next.length === 0 && !allowEmpty && !noneMode) next = ['All'];
                      } else { 
                        next.push(opt); 
                      }
                      onChange(next);
                    }} 
                    className={`px-3 py-2 mt-1 rounded-lg text-sm font-bold cursor-pointer flex justify-between ${isSel ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}
                  >
                    <span className="truncate pr-2">{opt}</span> 
                    <Check className={`w-4 h-4 flex-shrink-0 ${isSel ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function CreativeView({ data, exRate = 1, exSym = '$', formatShort = (v) => v, userRole }) {
  const CREATIVES_PER_PAGE = 24;
  const [creativePage, setCreativePage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Screen-fit & Layout controls
  const [showSummary, setShowSummary] = useState(false); // Collapsed by default to fit screen & avoid scroll
  const [density, setDensity] = useState('compact'); // 'compact' | 'comfortable'

  // Status & Event Filters
  const [filterStatuses, setFilterStatuses] = useState(['All']);
  const [filterEvents, setFilterEvents] = useState(['All']);

  // Dimensions & Metrics Selection
  const availableDimensions = ['Event', 'Channel', 'Campaign'];
  const [selectedDimensions, setSelectedDimensions] = useState(['Channel']);

  const availableMetrics = userRole === 'non-finance' 
    ? ['Impressions', 'Clicks', 'CTR', 'Views', 'Conversions', 'CVR'] 
    : ['Spend', 'Impressions', 'Clicks', 'CTR', 'CPC', 'Views', 'Conversions', 'CPA', 'CVR'];
  const [selectedMetrics, setSelectedMetrics] = useState(availableMetrics);

  const [sortConfig, setSortConfig] = useState({ key: 'cost', direction: 'desc' });
  const [selectedCreative, setSelectedCreative] = useState(null);

  // Extract unique events from data
  const uniqueEvents = useMemo(() => {
    const set = new Set();
    data.forEach(d => {
      if (d.eventNameDB && d.eventNameDB !== 'Unknown') {
        set.add(d.eventNameDB);
      }
    });
    return Array.from(set).sort();
  }, [data]);

  useEffect(() => {
    setCreativePage(1);
  }, [filterStatuses, filterEvents, searchQuery]);

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  // Aggregate creative performance
  const creativeTabData = useMemo(() => {
    const maxDate = d3.max(data, d => d.dateObj);
    const twoDaysAgo = maxDate ? new Date(maxDate.getTime() - 48 * 60 * 60 * 1000) : new Date();

    const filtered = data.filter(d => {
      // Event filter
      if (!filterEvents.includes('All') && !filterEvents.includes(d.eventNameDB)) {
        return false;
      }

      // Search query (creative, ad, or event name)
      if (searchQuery) {
        const sq = searchQuery.toLowerCase();
        const cName = (d.creativeName || '').toLowerCase();
        const aName = (d.adName || '').toLowerCase();
        const eName = (d.eventNameDB || '').toLowerCase();
        if (!cName.includes(sq) && !aName.includes(sq) && !eName.includes(sq)) {
          return false;
        }
      }
      return true;
    });

    const grouped = d3.groups(filtered, d => d.adName);
    return grouped.map(([adName, rows]) => {
      const imp = d3.sum(rows, r => r.impressions);
      const clk = d3.sum(rows, r => r.clicks);
      const cst = d3.sum(rows, r => r.cost) * exRate;
      const views = d3.sum(rows, r => r.views);
      const purch = d3.sum(rows, r => r.purchases || 0);
      const ctr = imp > 0 ? clk / imp : 0;
      const cpc = clk > 0 ? cst / clk : 0;
      const cpv = views > 0 ? cst / views : 0;
      const cpa = purch > 0 ? cst / purch : 0;
      const cr = clk > 0 ? purch / clk : 0;
      const rowsWith10Imp = rows.filter(r => r.impressions >= 10 && r.dateObj && !isNaN(r.dateObj));
      const rowsWithSpend = rows.filter(r => r.cost > 0 && r.dateObj && !isNaN(r.dateObj));
      
      let startDateStr = 'N/A';
      let endDateStr = 'N/A';
      let status = 'Paused';
      
      if (rowsWith10Imp.length > 0) {
        rowsWith10Imp.sort((a, b) => a.dateObj - b.dateObj);
        const sd = rowsWith10Imp[0].dateObj;
        startDateStr = `${sd.getDate()} ${sd.toLocaleString('en-US', { month: 'short' })} ${sd.getFullYear()}`;
      }

      const activeRows = rowsWithSpend.length > 0 ? rowsWithSpend : rowsWith10Imp;
      if (activeRows.length > 0) {
        activeRows.sort((a, b) => a.dateObj - b.dateObj);
        const ed = activeRows[activeRows.length - 1].dateObj;
        endDateStr = `${ed.getDate()} ${ed.toLocaleString('en-US', { month: 'short' })} ${ed.getFullYear()}`;
        
        if (ed >= twoDaysAgo) {
          status = 'Live';
        }
      }

      const previewUrl = rows.find(r => r.videoUrl)?.videoUrl || rows.find(r => r.postUrl)?.postUrl || rows.find(r => r.adImageUrl)?.adImageUrl || rows[0].videoUrl || rows[0].postUrl || rows[0].adImageUrl || '';
      const adImageUrl = rows.find(r => r.adImageUrl)?.adImageUrl || rows[0].adImageUrl;
      const videoUrl = rows.find(r => r.videoUrl)?.videoUrl || rows[0].videoUrl;
      const postUrl = rows.find(r => r.postUrl)?.postUrl || rows[0].postUrl;

      // Extract Event dimension accurately
      const eventNames = Array.from(new Set(rows.map(r => r.eventNameDB).filter(e => e && e !== 'Unknown')));
      const eventName = eventNames.length > 0 ? eventNames.join(', ') : (rows[0].eventNameDB || 'Unknown');

      return {
        adName,
        creativeName: rows[0].creativeName,
        campaignName: rows[0].campaignName,
        eventName,
        eventNames,
        adImageUrl,
        videoUrl,
        postUrl,
        previewUrl,
        tiktokItemId: rows[0].tiktokItemId,
        channel: rows[0].channel,
        language: rows[0].language,
        status,
        impressions: imp,
        clicks: clk,
        cost: cst,
        views: views,
        purchases: purch,
        ctr,
        cpc,
        cpv,
        cpa,
        cr,
        startDate: startDateStr,
        endDate: endDateStr,
      };
    }).filter(c => filterStatuses.includes('All') || filterStatuses.includes(c.status))
    .sort((a,b) => {
      if (!sortConfig) return 0;
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, filterStatuses, filterEvents, exRate, searchQuery, sortConfig]);

  // Selected creative index within full creativeTabData
  const selectedCreativeIndex = useMemo(() => {
    if (!selectedCreative) return -1;
    return creativeTabData.findIndex(c => c.adName === selectedCreative.adName);
  }, [selectedCreative, creativeTabData]);

  // Navigate between creatives via Next / Prev (looping)
  const handlePrevCreative = () => {
    if (creativeTabData.length === 0) return;
    const curIdx = selectedCreativeIndex >= 0 ? selectedCreativeIndex : 0;
    const prevIdx = (curIdx - 1 + creativeTabData.length) % creativeTabData.length;
    setSelectedCreative(creativeTabData[prevIdx]);
  };

  const handleNextCreative = () => {
    if (creativeTabData.length === 0) return;
    const curIdx = selectedCreativeIndex >= 0 ? selectedCreativeIndex : 0;
    const nextIdx = (curIdx + 1) % creativeTabData.length;
    setSelectedCreative(creativeTabData[nextIdx]);
  };

  // Keyboard navigation: Escape closes, Left/Right arrow keys navigate between creatives
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedCreative) return;
      if (e.key === 'Escape') {
        setSelectedCreative(null);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevCreative();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextCreative();
      }
    };
    if (selectedCreative) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [selectedCreative, selectedCreativeIndex, creativeTabData]);

  const topCTR = [...creativeTabData].filter(x => x.impressions > 500).sort((a,b) => b.ctr - a.ctr).slice(0, 5);
  const topCPA = [...creativeTabData].filter(x => x.purchases > 0 && x.cpa > 0).sort((a,b) => a.cpa - b.cpa).slice(0, 5); // Lowest CPA
  const topCost = [...creativeTabData].filter(x => x.cost > 0).sort((a,b) => b.cost - a.cost).slice(0, 5); // Highest Spend
  const topPurchases = [...creativeTabData].filter(x => x.purchases > 0).sort((a,b) => b.purchases - a.purchases).slice(0, 5); // Highest Conversions

  const bestCPA = topCPA[0];
  const bestCTR = topCTR[0];
  let insightText = "Not enough data to generate insights.";
  if (bestCPA && bestCTR) {
    insightText = `Creative "${bestCPA.creativeName}" is driving the most cost-efficient conversions at ${exSym}${d3.format(",.2f")(bestCPA.cpa * exRate)} CPA. Meanwhile, "${bestCTR.creativeName}" is capturing the highest attention with a ${(bestCTR.ctr*100).toFixed(2)}% CTR.`;
  }

  const paginatedData = creativeTabData.slice((creativePage - 1) * CREATIVES_PER_PAGE, creativePage * CREATIVES_PER_PAGE);
  const totalPages = Math.ceil(creativeTabData.length / CREATIVES_PER_PAGE);

  const exportCSV = () => {
    let csvContent = "";
    
    const cols = [
      { label: "Creative Name", getVal: c => c.creativeName || c.adName || '' },
      { label: "Preview Link", getVal: c => c.adImageUrl || c.previewUrl || c.videoUrl || c.postUrl || '' },
    ];

    if (selectedDimensions.includes('Event')) {
      cols.push({ label: "Event", getVal: c => c.eventName || '' });
    }
    if (selectedDimensions.includes('Channel')) {
      cols.push({ label: "Channel", getVal: c => c.channel || '' });
    }
    if (selectedDimensions.includes('Campaign')) {
      cols.push({ label: "Campaign", getVal: c => c.campaignName || '' });
    }

    cols.push(
      { label: "Start Date", getVal: c => c.startDate || '' },
      { label: "Last Served On", getVal: c => c.endDate || '' },
      { label: "Status", getVal: c => c.status || '' }
    );

    if (selectedMetrics.includes('Spend')) {
      cols.push({ label: `Spend (${exSym})`, getVal: c => c.cost != null ? (Math.round(c.cost * 100) / 100).toFixed(2) : '0.00' });
    }
    if (selectedMetrics.includes('Impressions')) {
      cols.push({ label: "Impressions", getVal: c => c.impressions || 0 });
    }
    if (selectedMetrics.includes('Clicks')) {
      cols.push({ label: "Clicks", getVal: c => c.clicks || 0 });
    }
    if (selectedMetrics.includes('CTR')) {
      cols.push({ label: "CTR (%)", getVal: c => c.ctr != null ? +(c.ctr * 100).toFixed(2) : 0 });
    }
    if (selectedMetrics.includes('CPC')) {
      cols.push({ label: `CPC (${exSym})`, getVal: c => c.cpc != null ? (Math.round(c.cpc * 100) / 100).toFixed(2) : '0.00' });
    }
    if (selectedMetrics.includes('Views')) {
      cols.push({ label: "Views", getVal: c => c.views || 0 });
    }
    if (selectedMetrics.includes('Conversions')) {
      cols.push({ label: "Conversions", getVal: c => c.purchases || 0 });
    }
    if (selectedMetrics.includes('CPA')) {
      cols.push({ label: `CPA (${exSym})`, getVal: c => c.cpa != null ? (Math.round(c.cpa * exRate * 100) / 100).toFixed(2) : '0.00' });
    }
    if (selectedMetrics.includes('CVR')) {
      cols.push({ label: "CVR (%)", getVal: c => c.cr != null ? +(c.cr * 100).toFixed(2) : 0 });
    }

    const headerRow = cols.map(c => `"${c.label}"`).join(",");
    csvContent += headerRow + "\r\n";

    creativeTabData.forEach(c => {
      const rowData = cols.map(col => {
        let val = col.getVal(c);
        if (val === undefined || val === null) val = '';
        if (typeof val === 'string') val = val.replace(/"/g, '""');
        return `"${val}"`;
      });
      csvContent += rowData.join(",") + "\r\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Creative_Performance_Data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const renderSortHeader = (label, key) => (
    <th 
      className={`px-3 ${density === 'compact' ? 'py-2.5 text-[9px]' : 'py-3.5 text-[10px]'} font-bold text-[#14a6d9] uppercase tracking-wider cursor-pointer hover:text-[#eef7f5] transition-colors whitespace-nowrap sticky top-0 bg-[#0a2442] z-20 border-b border-[#cedc28]/20`}
      onClick={() => handleSort(key)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortConfig?.key === key && (
           <span className="text-[#cedc28]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="animate-in fade-in duration-500">
      {/* HEADER WITH SCREEN-FIT CONTROLS */}
      <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#eef7f5] tracking-tight">Creative Performance</h2>
            <span className="text-xs font-mono font-bold text-[#cedc28] bg-[#cedc28]/10 border border-[#cedc28]/30 px-2 py-0.5 rounded-full">
              {creativeTabData.length} assets
            </span>
          </div>
          <p className="text-[#14a6d9] text-xs font-medium italic mt-0.5">Asset analysis with in-window arrow navigation &amp; responsive screen-fit layout.</p>
          <p className="text-[#9bb5b0] text-[11px] font-medium italic mt-0.5">* missing data below is due to the unavailability of creative assets for Google Ads PMax campaigns</p>
        </div>

        {/* SCREEN FIT & VIEW TOGGLES */}
        <div className="flex items-center gap-2">
          {/* Toggle Summary Highlights */}
          <button
            type="button"
            onClick={() => setShowSummary(s => !s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              showSummary 
                ? 'bg-[#cedc28]/20 border-[#cedc28] text-[#cedc28] shadow-[0_0_10px_rgba(206,220,40,0.2)]' 
                : 'bg-[#0a2442] border-[#cedc28]/30 text-gray-300 hover:border-[#cedc28] hover:text-white'
            }`}
            title="Toggle Top 5 Highlights to maximize screen space"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{showSummary ? 'Hide Highlights' : 'Show Top 5 Highlights'}</span>
            {showSummary ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Table Row Density Toggle */}
          <button
            type="button"
            onClick={() => setDensity(d => d === 'compact' ? 'comfortable' : 'compact')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#0a2442] border border-[#cedc28]/30 text-gray-300 hover:text-white hover:border-[#cedc28] flex items-center gap-1.5 transition-colors cursor-pointer"
            title={`Switch to ${density === 'compact' ? 'Comfortable' : 'Compact'} density`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#14a6d9]" />
            <span className="capitalize">{density}</span>
          </button>
        </div>
      </div>
      
      {/* COLLAPSIBLE TOP 5 SUMMARY SECTION */}
      {showSummary && (
        <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
             {/* CTR */}
             <div className="card-surface backdrop-blur-2xl rounded-xl border border-[#cedc28]/20 p-3.5 shadow-lg flex flex-col">
                <h3 className="text-xs font-bold text-[#eef7f5] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-[#cedc28]"/> Top 5 CTR
                </h3>
                <div className="flex-1 space-y-2">
                   {topCTR.map((c, i) => (
                      <div key={i} className="flex flex-col gap-0.5">
                         <div className="flex justify-between text-[11px] text-[#14a6d9]">
                            <button
                              type="button"
                              onClick={() => setSelectedCreative(c)}
                              className="flex-1 pr-1 truncate text-left hover:underline hover:text-white transition-colors cursor-pointer"
                              title={c.creativeName}
                            >
                              {i+1}. {c.creativeName}
                            </button>
                            <span className="font-bold text-[#cedc28] shrink-0">{(c.ctr*100).toFixed(2)}%</span>
                         </div>
                         <div className="w-full bg-[#0a2442] h-1 rounded-full overflow-hidden">
                            <div className="bg-[#cedc28] h-full rounded-full" style={{width: `${Math.min(100, (c.ctr / (topCTR[0]?.ctr || 1)) * 100)}%`}}></div>
                         </div>
                      </div>
                   ))}
                   {topCTR.length === 0 && <div className="text-[#14a6d9] text-[11px] py-2 text-center">No data</div>}
                </div>
             </div>
             
             {/* CPA */}
             {userRole !== 'non-finance' && (
               <div className="card-surface backdrop-blur-2xl rounded-xl border border-[#cedc28]/20 p-3.5 shadow-lg flex flex-col">
                  <h3 className="text-xs font-bold text-[#eef7f5] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-[#cedc28]"/> Top 5 CPA (Lowest)
                  </h3>
                  <div className="flex-1 space-y-2">
                     {topCPA.map((c, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                           <div className="flex justify-between text-[11px] text-[#14a6d9]">
                              <button
                                type="button"
                                onClick={() => setSelectedCreative(c)}
                                className="flex-1 pr-1 truncate text-left hover:underline hover:text-white transition-colors cursor-pointer"
                                title={c.creativeName}
                              >
                                {i+1}. {c.creativeName}
                              </button>
                              <span className="font-bold text-[#cedc28] shrink-0">{exSym}{d3.format(",.2f")(c.cpa * exRate)}</span>
                           </div>
                           <div className="w-full bg-[#0a2442] h-1 rounded-full overflow-hidden">
                              <div className="bg-[#74FA93] h-full rounded-full" style={{width: `${Math.min(100, (c.cpa / (topCPA[topCPA.length-1]?.cpa || 1)) * 100)}%`}}></div>
                           </div>
                        </div>
                     ))}
                     {topCPA.length === 0 && <div className="text-[#14a6d9] text-[11px] py-2 text-center">No data</div>}
                  </div>
               </div>
             )}
             
             {/* Spend */}
             {userRole !== 'non-finance' && (
               <div className="card-surface backdrop-blur-2xl rounded-xl border border-[#cedc28]/20 p-3.5 shadow-lg flex flex-col">
                  <h3 className="text-xs font-bold text-[#eef7f5] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-rose-400"/> Top 5 Spend
                  </h3>
                  <div className="flex-1 space-y-2">
                     {topCost.map((c, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                           <div className="flex justify-between text-[11px] text-[#14a6d9]">
                              <button
                                type="button"
                                onClick={() => setSelectedCreative(c)}
                                className="flex-1 pr-1 truncate text-left hover:underline hover:text-white transition-colors cursor-pointer"
                                title={c.creativeName}
                              >
                                {i+1}. {c.creativeName}
                              </button>
                              <span className="font-bold text-rose-400 shrink-0">{exSym}{formatShort(c.cost)}</span>
                           </div>
                           <div className="w-full bg-[#0a2442] h-1 rounded-full overflow-hidden">
                              <div className="bg-rose-500 h-full rounded-full" style={{width: `${Math.min(100, (c.cost / (topCost[0]?.cost || 1)) * 100)}%`}}></div>
                           </div>
                        </div>
                     ))}
                     {topCost.length === 0 && <div className="text-[#14a6d9] text-[11px] py-2 text-center">No data</div>}
                  </div>
               </div>
             )}

             {/* Conversions */}
             {userRole !== 'non-finance' && (
               <div className="card-surface backdrop-blur-2xl rounded-xl border border-[#cedc28]/20 p-3.5 shadow-lg flex flex-col">
                  <h3 className="text-xs font-bold text-[#eef7f5] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-emerald-400"/> Top 5 Conversions
                  </h3>
                  <div className="flex-1 space-y-2">
                     {topPurchases.map((c, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                           <div className="flex justify-between text-[11px] text-[#14a6d9]">
                              <button
                                type="button"
                                onClick={() => setSelectedCreative(c)}
                                className="flex-1 pr-1 truncate text-left hover:underline hover:text-white transition-colors cursor-pointer"
                                title={c.creativeName}
                              >
                                {i+1}. {c.creativeName}
                              </button>
                              <span className="font-bold text-emerald-400 shrink-0">{formatShort(c.purchases)}</span>
                           </div>
                           <div className="w-full bg-[#0a2442] h-1 rounded-full overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full" style={{width: `${Math.min(100, (c.purchases / (topPurchases[0]?.purchases || 1)) * 100)}%`}}></div>
                           </div>
                        </div>
                     ))}
                     {topPurchases.length === 0 && <div className="text-[#14a6d9] text-[11px] py-2 text-center">No data</div>}
                  </div>
               </div>
             )}
          </div>

          {/* AI Creative Insights (Inline Compact Banner) */}
          <div className="card-surface backdrop-blur-2xl px-4 py-2.5 rounded-xl border border-[#cedc28]/20 flex items-center gap-3 shadow-md">
             <div className="p-1 rounded bg-[#cedc28]/10 text-[#cedc28] shrink-0">
               <Zap className="w-4 h-4" />
             </div>
             <p className="text-xs text-[#eef7f5] font-medium leading-relaxed truncate">{insightText}</p>
          </div>
        </div>
      )}

      {/* UNIFIED COMPACT TOOLBAR (FILTERS, DIMENSIONS, METRICS, SEARCH, EXPORT) */}
      <div className="relative z-40 !overflow-visible card-surface backdrop-blur-2xl rounded-2xl border border-[#cedc28]/20 p-3 mb-3 shadow-md">
         <div className="flex flex-wrap items-center justify-between gap-2.5">
           {/* Left Controls: Export + Filters */}
           <div className="flex flex-wrap items-center gap-2">
             <button 
               onClick={exportCSV}
               title="Export as CSV"
               className="h-[32px] px-2.5 flex items-center justify-center gap-1.5 bg-[#0a2442] border border-[#cedc28]/30 rounded-lg text-[#cedc28] hover:bg-[#cedc28]/20 hover:border-[#cedc28] transition-colors text-xs font-bold shadow-sm"
             >
               <Download className="w-3.5 h-3.5 flex-shrink-0" />
               <span className="whitespace-nowrap">Export</span>
             </button>

             <div className="w-36 flex-shrink-0">
               <MultiSelectDropdown 
                 label="Status" 
                 options={['Live', 'Paused']} 
                 selected={filterStatuses} 
                 onChange={setFilterStatuses} 
               />
             </div>

             <div className="w-44">
               <MultiSelectDropdown 
                 label="Event" 
                 options={uniqueEvents} 
                 selected={filterEvents} 
                 onChange={setFilterEvents} 
                 placeholder="All Events"
               />
             </div>
           </div>

           {/* Right Controls: Dimensions, Metrics, Search */}
           <div className="flex flex-wrap items-center gap-2 flex-1 justify-end min-w-[280px]">
             <div className="w-36">
                <MultiSelectDropdown 
                  label="Dimensions" 
                  options={availableDimensions} 
                  selected={selectedDimensions} 
                  onChange={setSelectedDimensions}
                  noneMode={true}
                />
             </div>

             <div className="w-48 flex-shrink-0">
                <MultiSelectDropdown 
                  label="Metrics" 
                  options={availableMetrics} 
                  selected={selectedMetrics} 
                  onChange={setSelectedMetrics} 
                  noneMode={true}
                />
             </div>

             <div className="relative min-w-[170px] max-w-[240px] flex-1">
                <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-1 block">Search</span>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#14a6d9] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search creatives..." 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    className="w-full bg-[#0a2442] text-[#eef7f5] text-xs font-bold pl-8 pr-2.5 py-1.5 card-surface backdrop-blur-2xl border border-[#cedc28]/30 rounded-lg outline-none focus:border-[#cedc28] transition-colors" 
                  />
                </div>
             </div>
           </div>
         </div>
      </div>

      {/* RESPONSIVE TABLE (ADAPTS TO SCREEN HEIGHT & MINIMIZES PAGE SCROLL) */}
      <div className="card-surface backdrop-blur-2xl rounded-2xl border border-[#cedc28]/20 shadow-xl overflow-hidden">
         <div 
           className="w-full custom-scrollbar" 
           style={{ 
             overflowY: 'auto', 
             overflowX: 'auto', 
             maxHeight: showSummary ? '420px' : 'calc(100vh - 240px)', 
             minHeight: '340px' 
           }}
         >
            <table className="w-full text-left border-collapse min-w-max">
               <thead className="sticky top-0 z-20 bg-[#0a2442] shadow-sm">
                  <tr className="bg-[#0a2442]">
                     <th className={`px-3 ${density === 'compact' ? 'py-2.5' : 'py-3.5'} text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider whitespace-nowrap sticky top-0 bg-[#0a2442] z-20 border-b border-[#cedc28]/20`}>Preview</th>
                     {renderSortHeader('Creative Name', 'creativeName')}
                     {selectedDimensions.includes('Event') && renderSortHeader('Event', 'eventName')}
                     {selectedDimensions.includes('Channel') && renderSortHeader('Channel', 'channel')}
                     {selectedDimensions.includes('Campaign') && renderSortHeader('Campaign', 'campaignName')}
                     <th className={`px-3 ${density === 'compact' ? 'py-2.5' : 'py-3.5'} text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider whitespace-nowrap sticky top-0 bg-[#0a2442] z-20 border-b border-[#cedc28]/20`}>Start Date</th>
                     <th className={`px-3 ${density === 'compact' ? 'py-2.5' : 'py-3.5'} text-[10px] font-bold text-[#14a6d9] uppercase tracking-wider whitespace-nowrap sticky top-0 bg-[#0a2442] z-20 border-b border-[#cedc28]/20`}>Last Served</th>
                     {renderSortHeader('Status', 'status')}
                     {selectedMetrics.includes('Spend') && renderSortHeader('Spend', 'cost')}
                     {selectedMetrics.includes('Impressions') && renderSortHeader('Impr', 'impressions')}
                     {selectedMetrics.includes('Clicks') && renderSortHeader('Clicks', 'clicks')}
                     {selectedMetrics.includes('CTR') && renderSortHeader('CTR', 'ctr')}
                     {selectedMetrics.includes('CPC') && renderSortHeader('CPC', 'cpc')}
                     {selectedMetrics.includes('Views') && renderSortHeader('Views', 'views')}
                     {selectedMetrics.includes('Conversions') && renderSortHeader('Conv', 'purchases')}
                     {selectedMetrics.includes('CPA') && renderSortHeader('CPA', 'cpa')}
                     {selectedMetrics.includes('CVR') && renderSortHeader('CVR', 'cr')}
                  </tr>
               </thead>
               <tbody>
                  {paginatedData.map((c, i) => {
                     const fullTargetUrl = c.adImageUrl || c.previewUrl || c.videoUrl || c.postUrl;
                     const padY = density === 'compact' ? 'py-2' : 'py-3.5';
                     const thumbH = density === 'compact' ? 'h-8 w-12' : 'h-10 w-16';

                     return (
                        <tr key={i} className="border-b border-[#cedc28]/10 hover:bg-[#74FA93]/5 transition-colors group">
                           {/* PREVIEW CELL */}
                           <td className={`px-3 ${padY}`}>
                              <div className="flex items-center gap-1.5">
                                 <div 
                                    onClick={() => setSelectedCreative(c)}
                                    title="Click to preview in window (or use Arrow keys)"
                                    className={`group/thumb ${thumbH} bg-[#0a2442] rounded-md overflow-hidden border border-[#cedc28]/25 flex items-center justify-center relative cursor-pointer hover:border-[#cedc28] hover:ring-1 hover:ring-[#cedc28]/50 transition-all`}
                                 >
                                    {c.videoUrl && (
                                       <video 
                                          src={c.videoUrl} 
                                          autoPlay
                                          muted 
                                          loop 
                                          playsInline
                                          className="absolute inset-0 w-full h-full object-cover opacity-0 hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none"
                                       />
                                    )}
                                    {c.adImageUrl ? (
                                       <img 
                                          src={c.adImageUrl} 
                                          alt={c.creativeName}
                                          className={`w-full h-full object-cover ${c.videoUrl ? 'group-hover/thumb:opacity-0 transition-opacity duration-300' : ''}`} 
                                          onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} 
                                       />
                                    ) : (
                                       <Grid className="w-3.5 h-3.5 text-[#14a6d9] opacity-30" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity z-20">
                                       <Eye className="w-3.5 h-3.5 text-[#cedc28]" />
                                    </div>
                                 </div>

                                 {fullTargetUrl && (
                                    <button
                                       type="button"
                                       onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(fullTargetUrl, '_blank', 'noopener,noreferrer');
                                       }}
                                       title="Open full picture in new window"
                                       className="p-1 rounded text-gray-400 hover:text-[#cedc28] hover:bg-white/10 transition-colors cursor-pointer"
                                    >
                                       <ExternalLink className="w-3 h-3" />
                                    </button>
                                 )}
                              </div>
                           </td>

                           {/* CREATIVE NAME */}
                           <td className={`px-3 ${padY} ${density === 'compact' ? 'text-xs' : 'text-sm'} font-bold text-[#eef7f5] whitespace-normal break-words min-w-[180px] max-w-[340px]`}>
                              <span 
                                 onClick={() => setSelectedCreative(c)}
                                 className="cursor-pointer hover:text-[#cedc28] hover:underline transition-colors leading-tight block"
                                 title="Click to preview in window"
                              >
                                 {c.creativeName}
                              </span>
                           </td>

                           {/* OPTIONAL EVENT DIMENSION */}
                           {selectedDimensions.includes('Event') && (
                              <td className={`px-3 ${padY} text-[11px] font-bold text-[#14a6d9] whitespace-nowrap`}>
                                 <span className="px-2 py-0.5 rounded bg-[#14a6d9]/15 border border-[#14a6d9]/30 text-[#14a6d9] font-semibold">
                                    {c.eventName}
                                 </span>
                              </td>
                           )}

                           {/* OPTIONAL CHANNEL DIMENSION */}
                           {selectedDimensions.includes('Channel') && (
                              <td className={`px-3 ${padY} text-[11px] font-bold text-[#eef7f5] whitespace-nowrap`}>
                                 <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/15 text-gray-200 uppercase text-[9px]">
                                    {c.channel || 'N/A'}
                                 </span>
                              </td>
                           )}

                           {/* OPTIONAL CAMPAIGN DIMENSION */}
                           {selectedDimensions.includes('Campaign') && (
                              <td className={`px-3 ${padY} text-[11px] font-medium text-gray-300 whitespace-normal break-words max-w-[200px]`}>
                                 {c.campaignName || 'N/A'}
                              </td>
                           )}

                           <td className={`px-3 ${padY} text-[11px] font-medium text-gray-300 whitespace-nowrap`}>
                              {c.startDate}
                           </td>
                           <td className={`px-3 ${padY} text-[11px] font-medium text-gray-300 whitespace-nowrap`}>
                              {c.endDate}
                           </td>
                           <td className={`px-3 ${padY}`}>
                              <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded ${c.status === 'Live' ? 'bg-[#74FA93]/20 text-[#cedc28]' : 'bg-gray-500/20 text-gray-400'}`}>
                                {c.status}
                              </span>
                           </td>
                           {selectedMetrics.includes('Spend') && <td className={`px-3 ${padY} ${density === 'compact' ? 'text-xs' : 'text-sm'} font-bold text-rose-400 whitespace-nowrap`}>{exSym}{formatShort(c.cost)}</td>}
                           {selectedMetrics.includes('Impressions') && <td className={`px-3 ${padY} ${density === 'compact' ? 'text-xs' : 'text-sm'} font-bold text-[#eef7f5] whitespace-nowrap`}>{formatShort(c.impressions)}</td>}
                           {selectedMetrics.includes('Clicks') && <td className={`px-3 ${padY} ${density === 'compact' ? 'text-xs' : 'text-sm'} font-bold text-[#eef7f5] whitespace-nowrap`}>{formatShort(c.clicks)}</td>}
                           {selectedMetrics.includes('CTR') && <td className={`px-3 ${padY} ${density === 'compact' ? 'text-xs' : 'text-sm'} font-bold text-[#cedc28] whitespace-nowrap`}>{(c.ctr*100).toFixed(2)}%</td>}
                           {selectedMetrics.includes('CPC') && <td className={`px-3 ${padY} ${density === 'compact' ? 'text-xs' : 'text-sm'} font-bold text-[#cedc28] whitespace-nowrap`}>{exSym}{d3.format(",.2f")(c.cpc)}</td>}
                           {selectedMetrics.includes('Views') && <td className={`px-3 ${padY} ${density === 'compact' ? 'text-xs' : 'text-sm'} font-bold text-amber-400 whitespace-nowrap`}>{formatShort(c.views)}</td>}
                           {selectedMetrics.includes('Conversions') && <td className={`px-3 ${padY} ${density === 'compact' ? 'text-xs' : 'text-sm'} font-bold text-[#74FA93] whitespace-nowrap`}>{formatShort(c.purchases)}</td>}
                           {selectedMetrics.includes('CPA') && <td className={`px-3 ${padY} text-[11px] font-medium text-[#eef7f5] whitespace-nowrap`}>{exSym}{d3.format(",.2f")(c.cpa * exRate)}</td>}
                           {selectedMetrics.includes('CVR') && <td className={`px-3 ${padY} text-[11px] font-medium text-[#eef7f5] whitespace-nowrap`}>{(c.cr * 100).toFixed(2)}%</td>}

                        </tr>
                     );
                  })}
                  {paginatedData.length === 0 && (
                     <tr>
                        <td colSpan={14} className="px-6 py-8 text-center text-[#14a6d9] text-sm font-bold">
                           No creatives match the current filters
                        </td>
                     </tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>

      {/* COMPACT PAGINATION */}
      {totalPages > 1 && (
         <div className="flex justify-between items-center gap-3 mt-3 px-1 text-xs">
            <span className="text-gray-400">
               Showing {((creativePage - 1) * CREATIVES_PER_PAGE) + 1}–{Math.min(creativePage * CREATIVES_PER_PAGE, creativeTabData.length)} of {creativeTabData.length}
            </span>
            <div className="flex items-center gap-2">
              <button 
                 onClick={() => setCreativePage(p => Math.max(1, p-1))} 
                 disabled={creativePage === 1}
                 className="px-3 py-1.5 card-surface backdrop-blur-2xl border border-[#cedc28]/30 rounded-lg text-xs font-bold text-[#cedc28] uppercase tracking-wider hover:bg-[#74FA93]/20 disabled:opacity-40 transition-colors cursor-pointer"
              >
                 Prev
              </button>
              <span className="font-bold text-[#14a6d9]">
                 {creativePage} / {totalPages}
              </span>
              <button 
                 onClick={() => setCreativePage(p => Math.min(totalPages, p+1))} 
                 disabled={creativePage === totalPages}
                 className="px-3 py-1.5 card-surface backdrop-blur-2xl border border-[#cedc28]/30 rounded-lg text-xs font-bold text-[#cedc28] uppercase tracking-wider hover:bg-[#74FA93]/20 disabled:opacity-40 transition-colors cursor-pointer"
              >
                 Next
              </button>
            </div>
         </div>
      )}

      {/* IN-WINDOW CREATIVE PREVIEW MODAL WITH ARROW KEY NAVIGATION */}
      {selectedCreative && (
        <div 
          className="fixed inset-0 z-[999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-hidden animate-in fade-in duration-200"
          onClick={() => setSelectedCreative(null)}
        >
          <div 
            className="relative bg-[#0a2442] border border-[#cedc28]/40 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95)] max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden text-white my-auto animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-3.5 sm:p-4 border-b border-[#cedc28]/20 flex items-start justify-between gap-3 bg-[#07192f]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {selectedCreative.eventName && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#14a6d9]/20 border border-[#14a6d9]/40 text-[#14a6d9]">
                      Event: {selectedCreative.eventName}
                    </span>
                  )}
                  {selectedCreative.channel && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 border border-white/20 text-white uppercase">
                      {selectedCreative.channel}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded ${selectedCreative.status === 'Live' ? 'bg-[#74FA93]/20 text-[#cedc28]' : 'bg-gray-500/20 text-gray-400'}`}>
                    {selectedCreative.status}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[#eef7f5] truncate" title={selectedCreative.creativeName}>
                  {selectedCreative.creativeName}
                </h3>
              </div>

              {/* Navigation & Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Arrow navigation counter and controls */}
                <div className="flex items-center gap-1 bg-black/40 border border-gray-700/60 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={handlePrevCreative}
                    title="Previous Creative (Left Arrow Key [←])"
                    className="p-1 rounded hover:bg-white/15 text-gray-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono font-bold text-[#cedc28] px-1.5 whitespace-nowrap">
                    {selectedCreativeIndex >= 0 ? selectedCreativeIndex + 1 : 1} / {creativeTabData.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextCreative}
                    title="Next Creative (Right Arrow Key [→])"
                    className="p-1 rounded hover:bg-white/15 text-gray-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Full picture in next window button */}
                {(selectedCreative.adImageUrl || selectedCreative.previewUrl || selectedCreative.videoUrl || selectedCreative.postUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetUrl = selectedCreative.adImageUrl || selectedCreative.previewUrl || selectedCreative.videoUrl || selectedCreative.postUrl;
                      if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer');
                    }}
                    title="Open full picture in new window"
                    className="px-2.5 py-1.5 bg-[#cedc28]/20 hover:bg-[#cedc28]/30 border border-[#cedc28]/50 text-[#cedc28] text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-sm cursor-pointer whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-[#cedc28]" />
                    <span className="hidden sm:inline">Full Picture</span>
                  </button>
                )}

                {/* Close button */}
                <button
                  type="button"
                  onClick={() => setSelectedCreative(null)}
                  title="Close preview (Esc)"
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Media Display with Floating Side Arrow Buttons */}
            <div className="relative flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-center bg-black/45 min-h-[260px] max-h-[56vh]">
              {/* Floating Left Arrow */}
              <button 
                type="button"
                onClick={handlePrevCreative}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full bg-[#0a2442]/85 hover:bg-[#cedc28] text-white hover:text-black border border-[#cedc28]/40 shadow-2xl transition-all cursor-pointer backdrop-blur-md group"
                title="Previous Creative (←)"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:-translate-x-0.5" />
              </button>

              {/* Media Content */}
              {selectedCreative.videoUrl ? (
                <div className="w-full flex flex-col items-center">
                  <video 
                    src={selectedCreative.videoUrl} 
                    controls 
                    autoPlay 
                    loop 
                    className="max-h-[50vh] max-w-full rounded-xl object-contain shadow-2xl border border-white/10"
                  />
                </div>
              ) : selectedCreative.adImageUrl ? (
                <div className="w-full flex flex-col items-center justify-center">
                  <img 
                    src={selectedCreative.adImageUrl} 
                    alt={selectedCreative.creativeName}
                    onClick={() => {
                      const targetUrl = selectedCreative.adImageUrl || selectedCreative.previewUrl;
                      if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="max-h-[50vh] max-w-full rounded-xl object-contain shadow-2xl border border-white/10 cursor-zoom-in hover:brightness-105 transition-all"
                    title="Click picture to open full size in new window"
                  />
                  <div 
                    onClick={() => {
                      const targetUrl = selectedCreative.adImageUrl || selectedCreative.previewUrl;
                      if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="mt-2 text-[11px] text-gray-400 hover:text-[#cedc28] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Maximize2 className="w-3 h-3 text-[#cedc28]" />
                    <span>Click picture to view in new tab &bull; Switch creatives using <kbd className="px-1 py-0.2 rounded bg-black/60 border border-gray-600 text-[#cedc28] font-mono text-[10px]">←</kbd> <kbd className="px-1 py-0.2 rounded bg-black/60 border border-gray-600 text-[#cedc28] font-mono text-[10px]">→</kbd> arrow keys</span>
                  </div>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center justify-center text-center gap-3">
                  <MonitorPlay className="w-10 h-10 text-[#14a6d9]" />
                  <p className="text-xs text-gray-300">Direct media file not found for inline rendering.</p>
                  {(selectedCreative.previewUrl || selectedCreative.postUrl) && (
                    <button 
                      onClick={() => window.open(selectedCreative.previewUrl || selectedCreative.postUrl, '_blank', 'noopener,noreferrer')}
                      className="px-3 py-1.5 bg-[#14a6d9]/20 hover:bg-[#14a6d9]/30 border border-[#14a6d9] text-[#14a6d9] text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Creative Link in New Window</span>
                    </button>
                  )}
                </div>
              )}

              {/* Floating Right Arrow */}
              <button 
                type="button"
                onClick={handleNextCreative}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full bg-[#0a2442]/85 hover:bg-[#cedc28] text-white hover:text-black border border-[#cedc28]/40 shadow-2xl transition-all cursor-pointer backdrop-blur-md group"
                title="Next Creative (→)"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            {/* Modal Footer / Metrics & Details */}
            <div className="p-3 bg-[#07192f] border-t border-[#cedc28]/20 flex flex-col gap-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
                {userRole !== 'non-finance' && (
                  <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-lg p-1.5 text-center">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Spend</span>
                    <span className="text-xs font-black text-rose-400">{exSym}{formatShort(selectedCreative.cost)}</span>
                  </div>
                )}
                <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-lg p-1.5 text-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Impressions</span>
                  <span className="text-xs font-black text-[#eef7f5]">{formatShort(selectedCreative.impressions)}</span>
                </div>
                <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-lg p-1.5 text-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Clicks</span>
                  <span className="text-xs font-black text-[#eef7f5]">{formatShort(selectedCreative.clicks)}</span>
                </div>
                <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-lg p-1.5 text-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">CTR</span>
                  <span className="text-xs font-black text-[#cedc28]">{(selectedCreative.ctr * 100).toFixed(2)}%</span>
                </div>
                {userRole !== 'non-finance' && (
                  <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-lg p-1.5 text-center">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">CPC</span>
                    <span className="text-xs font-black text-[#cedc28]">{exSym}{d3.format(",.2f")(selectedCreative.cpc)}</span>
                  </div>
                )}
                <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-lg p-1.5 text-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Conversions</span>
                  <span className="text-xs font-black text-[#74FA93]">{formatShort(selectedCreative.purchases)}</span>
                </div>
                {userRole !== 'non-finance' && (
                  <div className="bg-[#0a2442] border border-[#cedc28]/20 rounded-lg p-1.5 text-center">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">CPA</span>
                    <span className="text-xs font-black text-[#eef7f5]">{exSym}{d3.format(",.2f")(selectedCreative.cpa * exRate)}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-400 pt-0.5">
                <span className="font-medium truncate max-w-sm">Campaign: <strong className="text-gray-200">{selectedCreative.campaignName || 'N/A'}</strong></span>
                <span className="font-medium text-gray-400 text-[10px]">Active: {selectedCreative.startDate} – {selectedCreative.endDate}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
