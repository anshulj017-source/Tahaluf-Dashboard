import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { Search, ChevronDown } from 'lucide-react';
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

  const COLORS = ['#c88214', '#eef7f5', '#6fa89f', '#00937b', '#EF4444', '#10B981', '#c88214', '#065c5d'];

  return (
    <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-xl relative">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h3 className="text-xl font-black text-[#eef7f5]">Web Traffic Analysis</h3>
        <div className="flex items-center gap-4">
          <div className="flex bg-[#011414] rounded-full p-1 border border-[#c88214]/20">
            {['sourceMedium', 'country', 'ga4Property'].map(v => (
              <button 
                key={v} 
                onClick={() => setViewBy(v)} 
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewBy === v ? 'gradient-gold text-[#043e3f]' : 'text-[#c88214] hover:text-white'}`}
              >
                {v === 'sourceMedium' ? 'Source / Medium' : v === 'country' ? 'Country' : 'Property'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#c88214]" />
            <input 
              type="text" 
              placeholder="Search channels..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-[#011414] text-[#eef7f5] text-sm pl-9 pr-4 py-2 rounded-full outline-none border border-[#c88214]/30 focus:border-[#c88214]"
            />
          </div>
          <button 
            onClick={openCompare}
            disabled={selectedChannels.length === 0}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedChannels.length > 0 ? 'gradient-gold text-[#043e3f] hover:bg-[#c88214]/80' : 'bg-[#011414] text-[#6fa89f] opacity-50 cursor-not-allowed'}`}
          >
            Compare Selected ({selectedChannels.length})
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#c88214]/10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#011414] border-b border-[#c88214]/20 select-none">
              <th className="px-3 py-3 w-12 text-center">
                <input type="checkbox" checked={selectedChannels.length === sortedAgg.length && sortedAgg.length > 0} onChange={toggleAll} className="accent-[#c88214] cursor-pointer" />
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
                <th key={col.key} onClick={() => handleSort(col.key)} className="px-3 py-3 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-[#c88214] transition-colors">
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
              <tr key={i} onClick={() => openSingle(row.dimension)} className="border-b border-[#c88214]/10 hover:bg-[#c88214]/10 transition-colors cursor-pointer group">
                <td className="px-3 py-3 w-12 text-center" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedChannels.includes(row.dimension)} onChange={(e) => toggleSelect(row.dimension, e)} className="accent-[#c88214] cursor-pointer" />
                </td>
                <td className="px-3 py-3 text-sm font-bold text-white group-hover:text-[#c88214] transition-colors">{row.dimension}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#eef7f5]">{d3.format(",")(row.sessions)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#eef7f5]">{d3.format(",")(row.users)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#eef7f5]">{d3.format(",")(row.engagedSessions)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#eef7f5]">{d3.format(",")(row.newUsers)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#6fa89f]">{d3.format(",.1f")(row.avgSessionDuration)}s</td>
                <td className="px-3 py-3 text-sm font-medium text-[#6fa89f]">{d3.format(",")(row.itemViews)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#6fa89f]">{d3.format(",")(row.addToCarts)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#6fa89f]">{d3.format(",")(row.checkouts)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#6fa89f]">{d3.format(",")(row.purchases)}</td>
                <td className="px-3 py-3 text-sm font-medium text-[#6fa89f]">{d3.format(",")(row.gaTickets)}</td>
              </tr>
            ))}
            {sortedAgg.length === 0 && <tr><td colSpan={7} className="px-6 py-8 text-center text-[#6fa89f] text-sm">No channels found</td></tr>}
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
                <tr className="bg-[#011414]/80 border-t-2 border-[#c88214]/50 hover:bg-[#c88214]/10 transition-colors">
                  <td className="px-3 py-3 w-12 text-center"></td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">Total</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",")(tSessions)}</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",")(tUsers)}</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",")(tEngaged)}</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",")(tNewUsers)}</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",.1f")(tAvgDuration)}s</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",")(tItemViews)}</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",")(tAddToCart)}</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",")(tCheckouts)}</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",")(tPurchases)}</td>
                  <td className="px-3 py-3 text-sm font-black text-[#c88214]">{d3.format(",")(tTickets)}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#6fa89f] uppercase tracking-widest">Rows per page:</span>
          <select 
            value={rowsPerPage} 
            onChange={e => setRowsPerPage(Number(e.target.value))}
            className="bg-[#011414] text-[#c88214] text-xs font-black uppercase tracking-widest px-2 py-1.5 rounded-lg border border-[#c88214]/30 outline-none cursor-pointer hover:border-[#c88214] transition-colors"
          >
            {[10, 20, 50, 100].map(val => (
              <option key={val} value={val}>{val}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-[#6fa89f] uppercase tracking-widest">
            Page {currentPage} of {totalPages || 1}
          </span>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${currentPage === 1 ? 'bg-[#011414] border border-gray-700/50 text-gray-600 cursor-not-allowed' : 'bg-[#c88214]/10 border border-[#c88214]/30 text-[#c88214] hover:bg-[#c88214]/20 hover:text-white'}`}
            >
              Prev
            </button>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${currentPage === totalPages || totalPages === 0 ? 'bg-[#011414] border border-gray-700/50 text-gray-600 cursor-not-allowed' : 'bg-[#c88214]/10 border border-[#c88214]/30 text-[#c88214] hover:bg-[#c88214]/20 hover:text-white'}`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {mounted && modalOpen && createPortal(
        <div className="fixed inset-0 z-[99999] bg-[#000000]/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="card-surface w-full max-w-5xl rounded-3xl border border-[#c88214]/30 shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-[#c88214]/20 flex justify-between items-start bg-[#011414]">
              <div>
                <h2 className="text-2xl font-black text-white mb-2">
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
              <button onClick={() => setModalOpen(false)} className="text-[#6fa89f] hover:text-white">
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            
            <div className="p-6 flex-1 flex flex-col gap-6">
              <div className="flex gap-4">
                <div className="flex bg-[#011414] rounded-full p-1 border border-[#c88214]/20">
                  {['Daily', 'Monthly'].map(t => (
                    <button key={t} onClick={() => setTrendTimeframe(t)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${trendTimeframe === t ? 'gradient-gold text-[#043e3f]' : 'text-[#c88214] hover:text-white'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex bg-[#011414] rounded-full p-1 border border-[#c88214]/20">
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
                      className={`px-3 py-1 text-[10px] font-bold rounded-full transition-colors ${trendMetric === metric.key ? 'bg-[#c88214] text-[#043e3f]' : 'text-[#6fa89f] hover:text-[#c88214]'}`}
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
                      <XAxis dataKey="time" stroke="#6fa89f" tick={{fill: '#6fa89f', fontSize: 10}} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6fa89f" tick={{fill: '#6fa89f', fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                      <Tooltip contentStyle={{backgroundColor: '#043e3f', border: '1px solid rgba(116, 250, 147, 0.2)', borderRadius: '12px', color: '#eef7f5'}} />
                      <Area type="monotone" dataKey={modalChannels[0]} stroke="#00937b" strokeWidth={3} fillOpacity={1} fill="url(#colorSingle)" />
                    </AreaChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#00937b" opacity={0.1} vertical={false} />
                      <XAxis dataKey="time" stroke="#6fa89f" tick={{fill: '#6fa89f', fontSize: 10}} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6fa89f" tick={{fill: '#6fa89f', fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={formatShort} />
                      <Tooltip contentStyle={{backgroundColor: '#043e3f', border: '1px solid rgba(116, 250, 147, 0.2)', borderRadius: '12px', color: '#eef7f5'}} />
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
