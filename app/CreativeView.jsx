import React, { useState, useMemo, useEffect } from 'react';
import * as d3 from 'd3';
import { BarChart3, Zap, Grid, List, Check, Search, ChevronDown, MonitorPlay } from 'lucide-react';

const formatC = (val, dec=2) => val != null ? `$${d3.format(`,.${dec}f`)(val)}` : '$0.00';

const MultiSelectDropdown = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const filtered = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="relative min-w-[120px] z-30">
      <span className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest mb-1.5 block">{label}</span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1.5 card-surface backdrop-blur-2xl border border-[#c88214]/30 rounded-lg text-xs font-bold text-[#eef7f5] cursor-pointer flex justify-between items-center hover:border-[#c88214] transition-colors"
      >
        <span className="truncate pr-2">{selected.includes('All') ? 'All Selected' : selected.join(', ')}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-full h-0 z-50">
          <div className="w-full mt-2 card-surface backdrop-blur-2xl border border-[#c88214]/30 rounded-xl shadow-2xl flex flex-col max-h-64 overflow-hidden">
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
      {/* Invisible overlay to close dropdown */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
      )}
    </div>
  );
};

export default function CreativeView({ data, exRate = 1, exSym = '$', formatShort = (v) => v, userRole }) {
  const CREATIVES_PER_PAGE = 24;
  const [creativePage, setCreativePage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [filterChannels, setFilterChannels] = useState(['All']);
  const [filterLanguages, setFilterLanguages] = useState(['All']);
  const [filterStatuses, setFilterStatuses] = useState(['All']);
  const [filterPhases, setFilterPhases] = useState(['All']);
  const availableMetrics = userRole === 'non-finance' ? ['Impressions', 'Clicks', 'CTR', 'Views', 'Purchases'] : ['Spend', 'Impressions', 'Clicks', 'CTR', 'CPC', 'Views', 'Purchases'];
  const [selectedMetrics, setSelectedMetrics] = useState(availableMetrics);

  const [sortConfig, setSortConfig] = useState({ key: 'cost', direction: 'desc' });

  useEffect(() => {
    setCreativePage(1);
  }, [filterChannels, filterLanguages, filterStatuses, filterPhases, searchQuery]);


  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const uniqueChannels = useMemo(() => Array.from(new Set(data.map(x => x.channel))).filter(Boolean).sort(), [data]);
  const uniqueLanguages = useMemo(() => Array.from(new Set(data.map(x => x.language))).filter(Boolean).sort(), [data]);
  const uniquePhases = useMemo(() => Array.from(new Set(data.map(x => x.phase))).filter(Boolean).sort(), [data]);

  // Aggregate creative performance
  const creativeTabData = useMemo(() => {
    const maxDate = d3.max(data, d => d.date);
    const twoDaysAgo = maxDate ? new Date(maxDate.getTime() - 48 * 60 * 60 * 1000) : new Date();

    const filtered = data.filter(d => {
      if (!filterChannels.includes('All') && !filterChannels.includes(d.channel)) return false;
      if (!filterPhases.includes('All') && !filterPhases.includes(d.phase)) return false;
      if (!filterLanguages.includes('All') && !filterLanguages.includes(d.language)) return false;
      if (searchQuery) {
        const sq = searchQuery.toLowerCase();
        if (!(d.creativeName && d.creativeName.toLowerCase().includes(sq)) && !(d.adName && d.adName.toLowerCase().includes(sq))) {
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
      const isLive = rows.some(r => r.date && r.date >= twoDaysAgo && r.cost > 0);
      const status = isLive ? 'Live' : 'Paused';
      
      return {
        adName,
        creativeName: rows[0].creativeName,
        campaignName: rows[0].campaignName,
        adImageUrl: rows[0].adImageUrl,
        videoUrl: rows[0].videoUrl,
        postUrl: rows[0].postUrl,
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
  }, [data, filterChannels, filterLanguages, filterStatuses, filterPhases, exRate, searchQuery, sortConfig]);

  const topCTR = [...creativeTabData].filter(x => x.impressions > 500).sort((a,b) => b.ctr - a.ctr).slice(0, 10);
  const topCPC = [...creativeTabData].filter(x => x.clicks > 10).sort((a,b) => a.cpc - b.cpc).slice(0, 10); // Lowest CPC
  const topCost = [...creativeTabData].filter(x => x.cost > 0).sort((a,b) => b.cost - a.cost).slice(0, 10); // Highest Spend

  const bestCPC = topCPC[0];
  const bestCTR = topCTR[0];
  let insightText = "Not enough data to generate insights.";
  if (bestCPC && bestCTR) {
    insightText = `Creative "${bestCPC.creativeName}" is driving the most cost-efficient clicks at ${exSym}${d3.format(",.2f")(bestCPC.cpc)} CPC. Meanwhile, "${bestCTR.creativeName}" is capturing the highest attention with a ${(bestCTR.ctr*100).toFixed(2)}% CTR.`;
  }

  const paginatedData = creativeTabData.slice((creativePage - 1) * CREATIVES_PER_PAGE, creativePage * CREATIVES_PER_PAGE);
  const totalPages = Math.ceil(creativeTabData.length / CREATIVES_PER_PAGE);

  const renderSortHeader = (label, key) => (
    <th 
      className="px-6 py-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest cursor-pointer hover:text-[#eef7f5] transition-colors"
      onClick={() => handleSort(key)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortConfig?.key === key && (
           <span className="text-[#c88214]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-[#eef7f5] tracking-tight">Creative Performance</h2>
          <p className="text-[#6fa89f] font-medium italic mt-1">Independent creative asset analysis.</p>
        </div>
      </div>
      
      {/* TOP 10 SUMMARY GRAPHS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 export-slide" data-title="Creative Overview">
         <div className="card-surface backdrop-blur-2xl rounded-2xl border border-[#c88214]/20 p-6 shadow-xl flex flex-col">
            <h3 className="text-sm font-black text-[#eef7f5] uppercase tracking-widest mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[#c88214]"/> Top 10 by CTR</h3>
            <div className="flex-1 space-y-3">
               {topCTR.map((c, i) => (
                  <div key={i} className="flex flex-col gap-1">
                     <div className="flex justify-between text-xs text-[#6fa89f]">
                        <span className="truncate w-3/4" title={c.creativeName}>
                          {i+1}.{' '}
                          {c.adImageUrl ? (
                            <a href={c.adImageUrl} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-white transition-colors">{c.creativeName}</a>
                          ) : (
                            c.creativeName
                          )}
                        </span>
                        <span className="font-bold text-[#c88214]">{(c.ctr*100).toFixed(2)}%</span>
                     </div>
                     <div className="w-full bg-[#011414] h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#c88214] h-full rounded-full" style={{width: `${Math.min(100, (c.ctr / (topCTR[0]?.ctr || 1)) * 100)}%`}}></div>
                     </div>
                  </div>
               ))}
               {topCTR.length === 0 && <div className="text-[#6fa89f] text-xs py-4 text-center">No data available</div>}
            </div>
         </div>
         
         {userRole !== 'non-finance' && (
           <div className="card-surface backdrop-blur-2xl rounded-2xl border border-[#c88214]/20 p-6 shadow-xl flex flex-col">
              <h3 className="text-sm font-black text-[#eef7f5] uppercase tracking-widest mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[#c88214]"/> Top 10 by CPC (Lowest)</h3>
              <div className="flex-1 space-y-3">
                 {topCPC.map((c, i) => (
                    <div key={i} className="flex flex-col gap-1">
                       <div className="flex justify-between text-xs text-[#6fa89f]">
                          <span className="truncate w-3/4" title={c.creativeName}>
                            {i+1}.{' '}
                            {c.adImageUrl ? (
                              <a href={c.adImageUrl} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-white transition-colors">{c.creativeName}</a>
                            ) : (
                              c.creativeName
                            )}
                          </span>
                          <span className="font-bold text-[#c88214]">{exSym}{d3.format(",.2f")(c.cpc)}</span>
                       </div>
                       <div className="w-full bg-[#011414] h-1.5 rounded-full overflow-hidden">
                          <div className="bg-[#74FA93] h-full rounded-full" style={{width: `${Math.min(100, (c.cpc / (topCPC[topCPC.length-1]?.cpc || 1)) * 100)}%`}}></div>
                       </div>
                    </div>
                 ))}
                 {topCPC.length === 0 && <div className="text-[#6fa89f] text-xs py-4 text-center">No data available</div>}
              </div>
           </div>
         )}
         
         {userRole !== 'non-finance' && (
           <div className="card-surface backdrop-blur-2xl rounded-2xl border border-[#c88214]/20 p-6 shadow-xl flex flex-col">
              <h3 className="text-sm font-black text-[#eef7f5] uppercase tracking-widest mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-rose-400"/> Top 10 by Spend</h3>
              <div className="flex-1 space-y-3">
                 {topCost.map((c, i) => (
                    <div key={i} className="flex flex-col gap-1">
                       <div className="flex justify-between text-xs text-[#6fa89f]">
                          <span className="truncate w-3/4" title={c.creativeName}>
                            {i+1}.{' '}
                            {c.adImageUrl ? (
                              <a href={c.adImageUrl} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-white transition-colors">{c.creativeName}</a>
                            ) : (
                              c.creativeName
                            )}
                          </span>
                          <span className="font-bold text-rose-400">{exSym}{formatShort(c.cost)}</span>
                       </div>
                       <div className="w-full bg-[#011414] h-1.5 rounded-full overflow-hidden">
                          <div className="bg-rose-500 h-full rounded-full" style={{width: `${Math.min(100, (c.cost / (topCost[0]?.cost || 1)) * 100)}%`}}></div>
                       </div>
                    </div>
                 ))}
                 {topCost.length === 0 && <div className="text-[#6fa89f] text-xs py-4 text-center">No data available</div>}
              </div>
           </div>
         )}
      </div>

      <div className="card-surface backdrop-blur-2xl p-6 rounded-2xl border border-[#c88214]/20 break-inside-avoid mb-8 shadow-lg export-slide" data-title="AI Creative Insights">
         <h4 className="text-sm font-black text-[#c88214] uppercase tracking-widest mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-[#c88214]" /> AI Creative Insights</h4>
         <p className="text-sm text-[#eef7f5] font-medium">{insightText}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 border-b border-[#c88214]/20 pb-6">
        <MultiSelectDropdown label="Channel" options={uniqueChannels} selected={filterChannels} onChange={setFilterChannels} />
        <MultiSelectDropdown label="Language" options={uniqueLanguages} selected={filterLanguages} onChange={setFilterLanguages} />
        <MultiSelectDropdown label="Phase" options={uniquePhases} selected={filterPhases} onChange={setFilterPhases} />
        <MultiSelectDropdown label="Status" options={['Live', 'Paused']} selected={filterStatuses} onChange={setFilterStatuses} />
      </div>

      <div className="flex flex-wrap justify-between items-end gap-4 mb-6 mt-4">
         <h3 className="text-lg font-black text-[#eef7f5] tracking-tight">Creative Library ({creativeTabData.length})</h3>
         <div className="flex gap-4 items-end w-full md:w-auto">
           <div className="w-full md:w-64">
              <MultiSelectDropdown label="Metrics" options={availableMetrics} selected={selectedMetrics} onChange={setSelectedMetrics} />
           </div>
           <div className="relative w-full md:w-64 flex flex-col justify-end">
              <span className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest mb-1.5 block">Search</span>
              <div className="relative">
                <Search className="w-4 h-4 text-[#6fa89f] absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search creatives..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#011414] text-[#eef7f5] text-xs font-bold pl-9 pr-3 py-1.5 card-surface backdrop-blur-2xl border border-[#c88214]/30 rounded-lg outline-none focus:border-[#c88214] transition-colors" />
              </div>
           </div>
         </div>
      </div>


        <div className="card-surface backdrop-blur-2xl rounded-3xl border border-[#c88214]/20 overflow-x-auto shadow-xl export-slide" data-title="Creative Data Breakdown">
           <table className="w-full text-left border-collapse">
              <thead>
                 <tr className="bg-[#011414] border-b border-[#c88214]/20">
                    
                    <th className="px-6 py-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest">Preview</th>
                    {renderSortHeader('Creative Name', 'creativeName')}
                    {renderSortHeader('Status', 'status')}
                    {selectedMetrics.includes('Spend') && renderSortHeader('Spend', 'cost')}
                    {selectedMetrics.includes('Impressions') && renderSortHeader('Impr', 'impressions')}
                    {selectedMetrics.includes('Clicks') && renderSortHeader('Clicks', 'clicks')}
                    {selectedMetrics.includes('CTR') && renderSortHeader('CTR', 'ctr')}
                    {selectedMetrics.includes('CPC') && renderSortHeader('CPC', 'cpc')}
                    {selectedMetrics.includes('Views') && renderSortHeader('Views', 'views')}
                    {selectedMetrics.includes('Purchases') && renderSortHeader('Purchases', 'purchases')}

                 </tr>
              </thead>
              <tbody>
                 {paginatedData.map((c, i) => (
                    <tr key={i} className="border-b border-[#c88214]/10 hover:bg-[#74FA93]/5 transition-colors group">
                       
                       <td className="px-6 py-3">
                          <div 
                             onClick={(e) => { 
                                if(c.adImageUrl || c.videoUrl || c.postUrl) window.open(c.videoUrl || c.postUrl || c.adImageUrl, '_blank');
                             }}
                             className={`group w-16 h-10 bg-[#011414] rounded-lg overflow-hidden border border-[#c88214]/20 flex items-center justify-center relative ${c.adImageUrl || c.videoUrl || c.postUrl ? 'cursor-pointer' : 'cursor-default'}`}
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
                                <img src={c.adImageUrl} className={`w-full h-full object-cover ${c.videoUrl ? 'group-hover:opacity-0 transition-opacity duration-300' : ''}`} onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} />
                             ) : (
                                <Grid className="w-4 h-4 text-[#6fa89f] opacity-30" />
                             )}
                          </div>
                       </td>
                       <td className="px-6 py-4 text-sm font-bold text-[#eef7f5] whitespace-normal break-words min-w-[200px] max-w-[400px]">
                          {c.creativeName}
                       </td>
                       <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded-md ${c.status === 'Live' ? 'bg-[#74FA93]/20 text-[#c88214]' : 'bg-gray-500/20 text-gray-400'}`}>
                            {c.status}
                          </span>
                       </td>
                       {selectedMetrics.includes('Spend') && <td className="px-6 py-4 text-sm font-bold text-rose-400 whitespace-nowrap">{exSym}{formatShort(c.cost)}</td>}
                       {selectedMetrics.includes('Impressions') && <td className="px-6 py-4 text-sm font-bold text-[#eef7f5] whitespace-nowrap">{formatShort(c.impressions)}</td>}
                       {selectedMetrics.includes('Clicks') && <td className="px-6 py-4 text-sm font-bold text-[#eef7f5] whitespace-nowrap">{formatShort(c.clicks)}</td>}
                       {selectedMetrics.includes('CTR') && <td className="px-6 py-4 text-sm font-bold text-[#c88214] whitespace-nowrap">{(c.ctr*100).toFixed(2)}%</td>}
                       {selectedMetrics.includes('CPC') && <td className="px-6 py-4 text-sm font-bold text-[#c88214] whitespace-nowrap">{exSym}{d3.format(",.2f")(c.cpc)}</td>}
                       {selectedMetrics.includes('Views') && <td className="px-6 py-4 text-sm font-bold text-amber-400 whitespace-nowrap">{formatShort(c.views)}</td>}
                       {selectedMetrics.includes('Purchases') && <td className="px-6 py-4 text-sm font-bold text-[#74FA93] whitespace-nowrap">{formatShort(c.purchases)}</td>}

                    </tr>
                 ))}
                 {paginatedData.length === 0 && <tr><td colSpan={10} className="px-6 py-8 text-center text-[#6fa89f] text-sm font-bold">No creatives match the current filters</td></tr>}
              </tbody>
           </table>
        </div>

      {totalPages > 1 && (
         <div className="flex justify-center items-center gap-4 mt-8">
            <button 
               onClick={() => setCreativePage(p => Math.max(1, p-1))} 
               disabled={creativePage === 1}
               className="px-4 py-2 card-surface backdrop-blur-2xl border border-[#c88214]/30 rounded-xl text-xs font-black text-[#c88214] uppercase tracking-widest hover:bg-[#74FA93]/20 disabled:opacity-50 transition-colors"
            >
               Prev
            </button>
            <span className="text-sm font-black text-[#6fa89f]">
               Page {creativePage} of {totalPages}
            </span>
            <button 
               onClick={() => setCreativePage(p => Math.min(totalPages, p+1))} 
               disabled={creativePage === totalPages}
               className="px-4 py-2 card-surface backdrop-blur-2xl border border-[#c88214]/30 rounded-xl text-xs font-black text-[#c88214] uppercase tracking-widest hover:bg-[#74FA93]/20 disabled:opacity-50 transition-colors"
            >
               Next
            </button>
         </div>
      )}
    </div>
  );
}
