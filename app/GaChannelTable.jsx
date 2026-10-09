import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { Search, ChevronDown, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

export const GaChannelTable = ({ rawData, formatShort }) => {
  const [viewBy, setViewBy] = useState('sourceMedium'); // 'sourceMedium' or 'country'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('sessions');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedChannels, setSelectedChannels] = useState([]);
  
  // Pagination state
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('single');
  const [modalChannels, setModalChannels] = useState([]);
  const [trendTimeframe, setTrendTimeframe] = useState('Monthly');
  const [trendMetric, setTrendMetric] = useState('sessions');

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const aggData = useMemo(() => {
    return Array.from(d3.rollup(rawData, 
      v => ({
        sessions: d3.sum(v, d => d.sessions),
        users: d3.sum(v, d => d.users),
        engagedSessions: d3.sum(v, d => d.engagedSessions),
        newUsers: d3.sum(v, d => d.newUsers),
        avgSessionDuration: d3.mean(v.filter(d => d.sessions > 0), d => d.avgSessionDuration) || 0,
        itemViews: d3.sum(v, d => d.itemViews),
        addToCarts: d3.sum(v, d => d.addToCarts),
        checkouts: d3.sum(v, d => d.checkouts),
        purchases: d3.sum(v, d => d.purchases),
        gaTickets: d3.sum(v, d => d.gaTickets || 0)
      }),
      d => viewBy === 'sourceMedium' ? d.sourceMedium : viewBy === 'country' ? d.country : d.ga4Property
    )).map(([dimension, metrics]) => ({
      dimension,
      ...metrics
    }));
  }, [rawData, viewBy]);

  const filteredAgg = aggData.filter(d => d.dimension.toLowerCase().includes(searchTerm.toLowerCase()));
  const sortedAgg = [...filteredAgg].sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  useEffect(() => {
    setCurrentPage(1);
    setSelectedChannels([]);
  }, [searchTerm, sortKey, sortDir, rowsPerPage, viewBy]);

  const totalPages = Math.ceil(sortedAgg.length / rowsPerPage);
  const paginatedAgg = sortedAgg.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const toggleSelect = (channel, e) => {
    e.stopPropagation();
    setSelectedChannels(prev => prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]);
  };

  const toggleAll = () => {
    if (selectedChannels.length === sortedAgg.length) setSelectedChannels([]);
    else setSelectedChannels(sortedAgg.map(d => d.dimension));
  };

  const openSingle = (channel) => {
    setModalChannels([channel]);
    setModalMode('single');
    setModalOpen(true);
  };

  const openCompare = () => {
    if (selectedChannels.length === 0) return;
    setModalChannels(selectedChannels);
    setModalMode('compare');
    setModalOpen(true);
  };

  const handleDownloadCSV = () => {
    if (sortedAgg.length === 0) return;

    const headers = [
      viewBy === 'sourceMedium' ? 'Source / Medium' : viewBy === 'country' ? 'Country' : 'Property',
      'Sessions',
      'Users',
      'Engaged',
      'New Users',
      'Avg Duration (s)',
      'Item Views',
      'Add to Carts',
      'Checkouts',
      'Purchases',
      'Ticket Sales'
    ];

    const csvRows = [
      headers.join(','),
      ...sortedAgg.map(row => [
        `"${row.dimension}"`,
        row.sessions,
        row.users,
        row.engagedSessions,
        row.newUsers,
        row.avgSessionDuration.toFixed(1),
        row.itemViews,
        row.addToCarts,
        row.checkouts,
        row.purchases,
        row.gaTickets
      ].join(','))
    ];

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `web_traffic_${viewBy}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!modalOpen) return [];
    const relevantRaw = rawData.filter(d => modalChannels.includes(viewBy === 'sourceMedium' ? d.sourceMedium : d.country) && d.dateObj);
    
    const timeKeyFunc = trendTimeframe === 'Daily' 
      ? d => d3.timeFormat("%b %d")(d.dateObj)
      : d => d3.timeFormat("%b %Y")(d.dateObj);
      
    const grouped = d3.groups(relevantRaw, timeKeyFunc);
    
    const sortedGrouped = grouped.sort((a, b) => {
      const dateA = d3.min(a[1], d => d.dateObj);
      const dateB = d3.min(b[1], d => d.dateObj);
      return dateA - dateB;
    });

    return sortedGrouped.map(([timeLabel, rows]) => {
      const obj = { time: timeLabel };
      modalChannels.forEach(ch => {
        const chRows = rows.filter(r => (viewBy === 'sourceMedium' ? r.sourceMedium : r.country) === ch);
        let val = 0;
        if (trendMetric === 'sessions') val = d3.sum(chRows, r => r.sessions);
        if (trendMetric === 'users') val = d3.sum(chRows, r => r.users);
        if (trendMetric === 'engagedSessions') val = d3.sum(chRows, r => r.engagedSessions);
        if (trendMetric === 'newUsers') val = d3.sum(chRows, r => r.newUsers);
        if (trendMetric === 'itemViews') val = d3.sum(chRows, r => r.itemViews);
        if (trendMetric === 'addToCarts') val = d3.sum(chRows, r => r.addToCarts);
        if (trendMetric === 'checkouts') val = d3.sum(chRows, r => r.checkouts);
        if (trendMetric === 'purchases') val = d3.sum(chRows, r => r.purchases);
        if (trendMetric === 'gaTickets') val = d3.sum(chRows, r => r.gaTickets || 0);
        obj[ch] = val;
      });
      return obj;
    });
  }, [modalOpen, rawData, modalChannels, trendTimeframe, trendMetric]);

  const COLORS = ['#cedc28', '#eef7f5', '#14a6d9', '#00937b', '#EF4444', '#10B981', '#cedc28', '#14a6d9'];

  return (
    <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl relative">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h3 className="text-2xl font-anton uppercase text-[#eef7f5]">Web Traffic Analysis</h3>
        <div className="flex items-center gap-4">
          <div className="flex bg-[#0a2442] rounded-full p-1 border border-[#cedc28]/20">
            {['sourceMedium', 'country', 'ga4Property'].map(v => (
              <button 
                key={v} 
                onClick={() => setViewBy(v)} 
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewBy === v ? 'bg-[#cedc28] text-[#1a302e]' : 'text-[#cedc28] hover:text-white'}`}
              >
                {v === 'sourceMedium' ? 'Source / Medium' : v === 'country' ? 'Country' : 'Property'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#cedc28]" />
            <input 
              type="text" 
              placeholder="Search channels..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-[#0a2442] text-[#eef7f5] text-sm pl-9 pr-4 py-2 rounded-full outline-none border border-[#cedc28]/30 focus:border-[#cedc28]"
            />
          </div>
          <button 
            onClick={handleDownloadCSV}
            className="px-4 py-2 rounded-full text-sm font-bold bg-[#0a2442] text-[#cedc28] border border-[#cedc28]/30 hover:bg-[#cedc28] hover:text-[#1a302e] transition-colors flex items-center gap-2"
            title="Download CSV"
          >
            <Download size={16} />
            CSV
          </button>
          <button 
            onClick={openCompare}
            disabled={selectedChannels.length === 0}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedChannels.length > 0 ? 'bg-[#cedc28] text-[#1a302e] hover:bg-[#cedc28]/80' : 'bg-[#0a2442] text-[#14a6d9] opacity-50 cursor-not-allowed'}`}
          >
            Compare Selected ({selectedChannels.length})
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#cedc28]/10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#0a2442] border-b border-[#cedc28]/20 select-none">
              <th className="px-3 py-3 w-12 text-center">
                <input type="checkbox" checked={selectedChannels.length === sortedAgg.length && sortedAgg.length > 0} onChange={toggleAll} className="accent-[#cedc28] cursor-pointer" />
              </th>
              {[
                { key: 'dimension', label: viewBy === 'sourceMedium' ? 'Source / Medium' : viewBy === 'country' ? 'Country' : 'Property' },
                { key: 'sessions', label: 'Sessions' },
                { key: 'users', label: 'Users' },
                { key: 'engagedSessions', label: 'Engaged' },
                { key: 'newUsers', label: 'New Users' },
                { key: 'avgSessionDuration', label: 'Avg Duration' },
                { key: 'itemViews', label: 'Item Views' },
                { key: 'addToCarts', label: 'Add to Carts' },
                { key: 'checkouts', label: 'Checkouts' },
                { key: 'purchases', label: 'Purchases' },
                { key: 'gaTickets', label: 'Ticket Sales' },
              ].map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)} className="px-3 py-3 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-[#cedc28] transition-colors">
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronDown size={12} className="rotate-180" />)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedAgg.map((row, i) => (
              <tr key={i} onClick={() => openSingle(row.dimension)} className="border-b border-[#cedc28]/10 hover:bg-[#cedc28]/10 transition-colors cursor-pointer group">
                <td className="px-3 py-3 w-12 text-center" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedChannels.includes(row.dimension)} onChange={(e) => toggleSelect(row.dimension, e)} className="accent-[#cedc28] cursor-pointer" />
                </td>
                <td className="px-3 py-3 text-sm font-bold text-white group-hover:text-[#cedc28] transition-colors">{row.dimension}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#eef7f5]">{d3.format(",")(row.sessions)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#eef7f5]">{d3.format(",")(row.users)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#eef7f5]">{d3.format(",")(row.engagedSessions)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#eef7f5]">{d3.format(",")(row.newUsers)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#14a6d9]">{d3.format(",.1f")(row.avgSessionDuration)}s</td>
                <td className="px-3 py-3 text-sm font-medium text-[#14a6d9]">{d3.format(",")(row.itemViews)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#14a6d9]">{d3.format(",")(row.addToCarts)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#14a6d9]">{d3.format(",")(row.checkouts)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#14a6d9]">{d3.format(",")(row.purchases)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#14a6d9]">{d3.format(",")(row.gaTickets)}</td>
              </tr>
            ))}
            {sortedAgg.length === 0 && <tr><td colSpan={7} className="px-6 py-8 text-center text-[#14a6d9] text-sm">No channels found</td></tr>}
            {sortedAgg.length > 0 && (() => {
              const tSessions = d3.sum(sortedAgg, d => d.sessions);
              const tUsers = d3.sum(sortedAgg, d => d.users);
              const tEngaged = d3.sum(sortedAgg, d => d.engagedSessions);
              const tNewUsers = d3.sum(sortedAgg, d => d.newUsers);
              const totalDuration = d3.sum(sortedAgg, d => d.avgSessionDuration * d.sessions);
              const tAvgDuration = tSessions > 0 ? totalDuration / tSessions : 0;
              const tItemViews = d3.sum(sortedAgg, d => d.itemViews);
              const tAddToCart = d3.sum(sortedAgg, d => d.addToCarts);
              const tCheckouts = d3.sum(sortedAgg, d => d.checkouts);
              const tPurchases = d3.sum(sortedAgg, d => d.purchases);
              const tTickets = d3.sum(sortedAgg, d => d.gaTickets);
              
              return (
                <tr className="bg-[#0a2442]/80 border-t-2 border-[#cedc28]/50 hover:bg-[#cedc28]/10 transition-colors">
                  <td className="px-3 py-3 w-12 text-center"></td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">Total</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",")(tSessions)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",")(tUsers)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",")(tEngaged)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",")(tNewUsers)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",.1f")(tAvgDuration)}s</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",")(tItemViews)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",")(tAddToCart)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",")(tCheckouts)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",")(tPurchases)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#cedc28]">{d3.format(",")(tTickets)}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#14a6d9] uppercase tracking-widest">Rows per page:</span>
          <select 
            value={rowsPerPage} 
            onChange={e => setRowsPerPage(Number(e.target.value))}
            className="bg-[#0a2442] text-[#cedc28] text-xs font-bold uppercase tracking-widest px-2 py-1.5 rounded-lg border border-[#cedc28]/30 outline-none cursor-pointer hover:border-[#cedc28] transition-colors"
          >
            {[10, 20, 50, 100].map(val => (
              <option key={val} value={val}>{val}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-[#14a6d9] uppercase tracking-widest">
            Page {currentPage} of {totalPages || 1}
          </span>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${currentPage === 1 ? 'bg-[#0a2442] border border-gray-700/50 text-gray-600 cursor-not-allowed' : 'bg-[#cedc28]/10 border border-[#cedc28]/30 text-[#cedc28] hover:bg-[#cedc28]/20 hover:text-white'}`}
            >
              Prev
            </button>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${currentPage === totalPages || totalPages === 0 ? 'bg-[#0a2442] border border-gray-700/50 text-gray-600 cursor-not-allowed' : 'bg-[#cedc28]/10 border border-[#cedc28]/30 text-[#cedc28] hover:bg-[#cedc28]/20 hover:text-white'}`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {mounted && modalOpen && createPortal(
        <div className="fixed inset-0 z-[99999] bg-[#000000]/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="card-surface w-full max-w-5xl rounded-3xl border border-[#cedc28]/30 shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#cedc28]/20 flex justify-between items-start bg-[#0a2442]">
              <div>
                <h2 className="text-3xl font-anton uppercase text-white mb-2">
                  {modalMode === 'single' ? modalChannels[0] : 'Channel Comparison'}
                </h2>
                {modalMode === 'compare' && (
                  <div className="flex flex-wrap gap-2">
                    {modalChannels.map((ch, i) => (
                      <span key={ch} className="text-xs font-bold px-2 py-1 rounded-md" style={{ backgroundColor: `${COLORS[i % COLORS.length]}20`, color: COLORS[i % COLORS.length] }}>
                        {ch}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setModalOpen(false)} className="text-[#14a6d9] hover:text-white">
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            
            <div className="p-6 flex-1 flex flex-col gap-6">
              <div className="flex gap-4">
                <div className="flex bg-[#0a2442] rounded-full p-1 border border-[#cedc28]/20">
                  {['Daily', 'Monthly'].map(t => (
                    <button key={t} onClick={() => setTrendTimeframe(t)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${trendTimeframe === t ? 'bg-[#cedc28] text-[#1a302e]' : 'text-[#cedc28] hover:text-white'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex bg-[#0a2442] rounded-full p-1 border border-[#cedc28]/20">
                  {[
                    { key: 'sessions', label: 'Sessions' },
                    { key: 'users', label: 'Users' },
                    { key: 'engagedSessions', label: 'Engaged' },
                    { key: 'newUsers', label: 'New Users' },
                    { key: 'itemViews', label: 'Item Views' },
                    { key: 'addToCarts', label: 'Add to Carts' },
                    { key: 'checkouts', label: 'Checkouts' },
                    { key: 'purchases', label: 'Purchases' },
                    { key: 'gaTickets', label: 'Ticket Sales' }
                  ].map(metric => (
                    <button 
                      key={metric.key}
                      onClick={() => setTrendMetric(metric.key)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-full transition-colors ${trendMetric === metric.key ? 'bg-[#cedc28] text-[#1a302e]' : 'text-[#14a6d9] hover:text-[#cedc28]'}`}
                    >
                      {metric.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {modalMode === 'single' ? (
                    <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSingle" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00937b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#00937b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#00937b" opacity={0.1} vertical={false} />
                      <XAxis dataKey="time" stroke="#14a6d9" tick={{fill: '#14a6d9', fontSize: 10}} tickLine={false} axisLine={false} />
                      <YAxis stroke="#14a6d9" tick={{fill: '#14a6d9', fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                      <Tooltip contentStyle={{backgroundColor: '#1a302e', border: '1px solid rgba(116, 250, 147, 0.2)', borderRadius: '12px', color: '#eef7f5'}} />
                      <Area type="monotone" dataKey={modalChannels[0]} stroke="#00937b" strokeWidth={3} fillOpacity={1} fill="url(#colorSingle)" />
                    </AreaChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#00937b" opacity={0.1} vertical={false} />
                      <XAxis dataKey="time" stroke="#14a6d9" tick={{fill: '#14a6d9', fontSize: 10}} tickLine={false} axisLine={false} />
                      <YAxis stroke="#14a6d9" tick={{fill: '#14a6d9', fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                      <Tooltip contentStyle={{backgroundColor: '#1a302e', border: '1px solid rgba(116, 250, 147, 0.2)', borderRadius: '12px', color: '#eef7f5'}} />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      {modalChannels.map((ch, i) => (
                        <Line key={ch} type="monotone" dataKey={ch} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{r: 3, fill: COLORS[i % COLORS.length], strokeWidth: 0}} activeDot={{r: 6}} />
                      ))}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};
