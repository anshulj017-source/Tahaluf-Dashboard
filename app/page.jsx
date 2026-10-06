"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { 
  TrendingUp, Globe, Layers, Activity, DollarSign, MousePointer2, 
  Eye, Zap, LayoutDashboard, ChevronDown, Search, Check, ShoppingCart,
  TableProperties, MonitorPlay, BarChart3, Smartphone, List, Download, RefreshCw, Users, Calendar, LayoutTemplate, PieChart, Grid, Map, LogOut
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import { useRouter } from 'next/navigation';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { GaChannelTable } from './GaChannelTable';
import AdminView from './AdminView';
import dynamic from 'next/dynamic';
import CampaignView from './CampaignView';
import ChannelView from './ChannelView';
import MarketView from './MarketView';

const CustomView = dynamic(() => import('./CustomView'), { ssr: false });
import CreativeView from './CreativeView';

const GEO_URL = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

const BASE_URL = "/api/sheets?type=combined";
const CHANNELS = [
  { name: 'TikTok', gid: '0', viewsCol: 9, compCol: 11 }, // J=9, L=11
  { name: 'Snapchat', gid: '1220368554', viewsCol: 8, compCol: 10, purchCol: 11 }, // I=8, L=11
  { name: 'Meta', gid: '796244792', viewsCol: 9, compCol: 11, purchCol: 12 }, // J=9, M=12
  { name: 'DV360', gid: '357397097', viewsCol: 9, compCol: 10, subCol: 11 }, // J=9, K=10, sub=L(11)
  { name: 'X', gid: '1750570025', viewsCol: 8, compCol: 11 }, // I=8
  { name: 'Google', gid: '1637892512', viewsCol: 6, compCol: 7, subCol: 13 }, // G=6, H=7, sub=N(13)
  { name: 'Amazon', gid: '770767992', viewsCol: 10, compCol: 10, subCol: 11 } // K=10, sub=L(11)
];
const GA4_GID = '1861950282';
const META_CREATIVE_GID = '1841259885';
const GOOGLE_PURCHASES_GID = '88343342';

// --- HELPERS ---
const formatShort = (num) => {
  if (num === null || num === undefined) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 10000) return (num / 1000).toFixed(1) + 'K';
  return d3.format(",.0f")(num);
};

const parseMetric = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(val.toString().replace(/[$,]/g, '').trim()) || 0;
};

const normalizeMarket = (marketName) => {
  if (!marketName || marketName === 'BLANK' || marketName === 'Unknown') return 'Other';
  const cleanName = marketName.trim();
  const upperName = cleanName.toUpperCase();
  const aliases = {
    'AU': 'Australia',
    'MY': 'Malaysia',
    'SG': 'Singapore',
    'ID': 'Indonesia', 'IDN': 'Indonesia',
    'IN': 'India',
    'PH': 'Philippines',
    'TH': 'Thailand',
    'VN': 'Vietnam',
    'KR': 'South Korea', 'KOR': 'South Korea',
    'JP': 'Japan', 'JPN': 'Japan',
    'KWT': 'Kuwait', 'KW': 'Kuwait', 'KUWAIT': 'Kuwait',
    'KSA': 'Saudi Arabia', 'SAU': 'Saudi Arabia', 'SA': 'Saudi Arabia', 'SAUDI ARABIA': 'Saudi Arabia',
    'UAE': 'United Arab Emirates', 'ARE': 'United Arab Emirates', 'AE': 'United Arab Emirates', 'UNITED ARAB EMIRATES': 'United Arab Emirates',
    'QAT': 'Qatar', 'QA': 'Qatar', 'QATAR': 'Qatar',
    'BHR': 'Bahrain', 'BH': 'Bahrain', 'BAHRAIN': 'Bahrain',
    'OMN': 'Oman', 'OM': 'Oman', 'OMAN': 'Oman',
    'EGY': 'Egypt', 'EG': 'Egypt', 'EGYPT': 'Egypt',
    'UK': 'United Kingdom', 'GBR': 'United Kingdom', 'GB': 'United Kingdom',
    'US': 'United States', 'USA': 'United States'
  };
  return aliases[upperName] || cleanName;
};

// --- COMPONENTS ---
const MetricCard = ({ label, value, color, icon: Icon, definition }) => (
  <div className="card-surface backdrop-blur-2xl p-4 rounded-xl border border-[#cedc28]/20 shadow-md relative overflow-hidden group hover:-translate-y-1 transition-transform">
    <div className="absolute top-0 right-0 w-16 h-16 bg-[#cedc28]/10 rounded-full blur-xl -mr-4 -mt-4 group-hover:bg-[#cedc28]/20 transition-colors duration-500"></div>
    <div className="flex justify-between items-start relative z-10">
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <p className="text-[9px] font-bold text-[#14a6d9] uppercase tracking-wider">{label}</p>

        </div>
        <h3 className={`text-xl font-black ${color} truncate`} title={value}>{value}</h3>
      </div>
    </div>
  </div>
);

const DateRangeFilter = ({ label, dateRange, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatDisplay = () => {
    if (!dateRange.start && !dateRange.end) return 'All Dates';
    const s = dateRange.start ? new Date(dateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '...';
    const e = dateRange.end ? new Date(dateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '...';
    return `${s} - ${e}`;
  };

  return (
    <div ref={wrapperRef} className="relative w-[140px] xl:w-[150px] shrink-0 z-30">
      <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-1.5 block">{label}</span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1.5 surface-inset border border-[#cedc28]/30 rounded-lg text-xs font-bold text-[#eef7f5] cursor-pointer flex justify-between items-center hover:border-[#cedc28] transition-colors"
      >
        <span className="truncate pr-2">{formatDisplay()}</span>
        <Calendar className={`w-4 h-4 flex-shrink-0 text-[#cedc28]`} />
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-[240px] h-0 z-50">
          <div className="w-full mt-2 card-surface backdrop-blur-3xl bg-[#0a2442]/95 border border-[#cedc28]/30 rounded-xl shadow-2xl flex flex-col overflow-hidden p-4 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest block">Start Date</span>
              <input type="date" value={dateRange.start} onClick={e => e.target.showPicker && e.target.showPicker()} onChange={e => onChange({ ...dateRange, start: e.target.value })} className="w-full cursor-pointer px-3 py-2 bg-black/30 border border-[#cedc28]/30 rounded-lg text-xs font-bold text-[#eef7f5] outline-none focus:border-[#cedc28] transition-colors [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest block">End Date</span>
              <input type="date" value={dateRange.end} onClick={e => e.target.showPicker && e.target.showPicker()} onChange={e => onChange({ ...dateRange, end: e.target.value })} className="w-full cursor-pointer px-3 py-2 bg-black/30 border border-[#cedc28]/30 rounded-lg text-xs font-bold text-[#eef7f5] outline-none focus:border-[#cedc28] transition-colors [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100" />
            </div>
            {(dateRange.start || dateRange.end) && (
              <button 
                onClick={() => onChange({ start: '', end: '' })}
                className="w-full px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-colors mt-2"
              >
                Clear Dates
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MultiSelect = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);
  const filtered = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-[120px] xl:w-[130px] shrink-0 z-30">
      <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-1.5 block">{label}</span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1.5 surface-inset border border-[#cedc28]/30 rounded-lg text-[10px] font-bold text-[#eef7f5] cursor-pointer flex justify-between items-center hover:border-[#cedc28] transition-colors"
      >
        <span className="truncate pr-2">{selected.includes('All') ? 'All Selected' : selected.join(', ')}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-full h-0 z-50">
          <div className="w-full mt-2 card-surface backdrop-blur-3xl bg-[#0a2442]/90 border border-[#cedc28]/30 rounded-xl shadow-2xl flex flex-col max-h-64 overflow-hidden">
            <div className="p-2 border-b border-[#cedc28]/10 relative">
              <Search className="w-4 h-4 text-[#14a6d9] absolute left-4 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-black/30 text-[#eef7f5] text-[10px] font-bold pl-9 pr-3 py-2 rounded-lg outline-none border border-transparent focus:border-[#cedc28]/50" />
            </div>
            <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
              <div onClick={() => { onChange(['All']); setIsOpen(false); setSearchTerm(''); }} className={`px-3 py-2 rounded-lg text-[11px] font-bold cursor-pointer flex justify-between ${selected.includes('All') ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}>
                All <Check className={`w-3.5 h-3.5 ${selected.includes('All') ? 'opacity-100' : 'opacity-0'}`} />
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
                  }} className={`px-3 py-2 mt-1 rounded-lg text-[11px] font-bold cursor-pointer flex justify-between ${isSel ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}>
                    <span className="truncate pr-2">{opt}</span> <Check className={`w-3.5 h-3.5 flex-shrink-0 ${isSel ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DataTable = ({ title, data, columns, totals, onRowClick, selectedRowId, rowKey, showBars = false, allowColumnSelect = false }) => {
  const [selectedLabels, setSelectedLabels] = useState(columns.slice(1).map(c => c.label));
  
  const activeColumns = allowColumnSelect 
    ? columns.filter((c, i) => i === 0 || selectedLabels.includes(c.label) || selectedLabels.includes('All'))
    : columns;

  const maxValues = {};
  if (showBars && data.length > 0) {
    activeColumns.forEach(col => {
      if (col.key !== columns[0].key) {
        maxValues[col.key] = Math.max(...data.map(r => r[col.key] || 0));
      }
    });
  }

  const exportCSV = () => {
    let csvContent = "";
    const headerRow = activeColumns.map(c => `"${c.label}"`).join(",");
    csvContent += headerRow + "\r\n";
    
    data.forEach(row => {
      const rowData = activeColumns.map(c => {
         let val = row[c.key];
         if (val === undefined || val === null) val = '';
         if (typeof val === 'number') val = Math.round(val * 100) / 100;
         if (typeof val === 'string') val = val.replace(/"/g, '""');
         return `"${val}"`;
      });
      csvContent += rowData.join(",") + "\r\n";
    });
    
    if (totals && data.length > 0) {
      const totalsRow = activeColumns.map(c => {
         let val = totals[c.key] !== undefined ? totals[c.key] : '';
         if (typeof val === 'number') val = Math.round(val * 100) / 100;
         if (typeof val === 'string') val = val.replace(/"/g, '""');
         return `"${val}"`;
      });
      csvContent += totalsRow.join(",") + "\r\n";
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${title ? String(title).replace(/\s+/g, '_') : 'export'}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  return (
    <div className="flex flex-col gap-3">
      {(title || allowColumnSelect) && (
        <div className={`flex justify-between items-end relative z-20 ${!title ? 'justify-end' : ''}`}>
          {title ? <h3 className="text-[#eef7f5] font-bold mb-1">{title}</h3> : <div />}
          <div className="flex items-end gap-3">
            <button 
              onClick={exportCSV}
              title="Export as CSV"
              className="p-1.5 flex items-center justify-center surface-inset border border-[#cedc28]/30 rounded-lg text-[#cedc28] hover:bg-[#cedc28] hover:text-[#1a302e] transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
            {allowColumnSelect && (
              <MultiSelect 
                label="Metrics" 
                options={columns.slice(1).map(c => c.label)} 
                selected={selectedLabels} 
                onChange={setSelectedLabels} 
              />
            )}
          </div>
        </div>
      )}
      <div className="overflow-x-auto card-surface rounded-2xl border border-[#cedc28]/20 z-10 relative">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-black/25 border-b border-[#cedc28]/20">
              {activeColumns.map((col, i) => (
                <th key={i} className="px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest whitespace-nowrap">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const isSelected = rowKey && selectedRowId === row[rowKey];
              return (
                <tr 
                  key={i} 
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`border-b border-[#cedc28]/10 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-[#cedc28]/15' : 'hover:bg-[#cedc28]/5'} ${isSelected ? 'bg-[#cedc28]/50 drop-shadow-md' : ''}`}
                >
                  {activeColumns.map((col, j) => {
                     const isMetric = j !== 0 && showBars;
                     const pct = isMetric && maxValues[col.key] ? (row[col.key] / maxValues[col.key]) * 100 : 0;
                     const barColor = pct > 75 ? 'rgba(206, 220, 40, 0.35)' : pct > 40 ? 'rgba(20, 166, 217, 0.3)' : 'rgba(0, 147, 123, 0.25)';
                     return (
                      <td key={j} className={`px-6 py-4 text-[11px] whitespace-nowrap relative ${isSelected ? 'font-bold text-white' : 'font-medium text-[#eef7f5]'}`}>
                        {isMetric && (
                          <div className="absolute inset-y-1.5 left-2 rounded -z-10" style={{ width: `calc(${pct}% - 16px)`, backgroundColor: barColor }}></div>
                        )}
                        <span className="relative z-10">{col.format ? col.format(row[col.key], row) : row[col.key]}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {totals && data.length > 0 && (
              <tr className="bg-black/40 border-t-2 border-[#cedc28]/50">
                {activeColumns.map((col, j) => (
                  <td key={j} className="px-6 py-4 text-[11px] font-bold text-[#cedc28] whitespace-nowrap relative">
                    <span className="relative z-10">{totals[col.key] !== undefined ? (col.format ? col.format(totals[col.key], totals) : totals[col.key]) : ''}</span>
                  </td>
                ))}
              </tr>
            )}
            {data.length === 0 && <tr><td colSpan={activeColumns.length} className="px-6 py-8 text-center text-[#14a6d9] text-[11px]">No data available</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const MetricTrendChart = ({ data, dataKey, name, format, color }) => (
  <div className="card-surface p-4 rounded-xl border border-[#cedc28]/10 h-[200px] flex flex-col">
    <h4 className="text-[#14a6d9] text-[10px] font-bold uppercase tracking-widest mb-2">{name}</h4>
    <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis dataKey="key" stroke="#14a6d9" fontSize={8} minTickGap={15} />
          <YAxis stroke="#14a6d9" fontSize={9} tickFormatter={format} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0a2442', borderColor: '#cedc2830', color: '#fff', borderRadius: '8px', fontSize: '10px' }}
            cursor={{ stroke: '#ffffff20' }}
            formatter={(val) => [format ? format(val) : val, name]}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 1.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 3, fill: color, strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const TrendSection = ({ title, trendData, currentTrendView, setViewFn, userRole, exSym, formatShort }) => {
  const [showInsights, setShowInsights] = useState(false);

  if (!trendData || trendData.length === 0) return null;

  const generateInsights = (data) => {
    if (!data || data.length < 2) return ["Not enough data to generate insights. Need at least 2 data points."];
    const current = data[data.length - 1];
    const last = data[data.length - 2];
    const twoWeeksAgo = data.length > 2 ? data[data.length - 3] : null;

    const calcChange = (curr, prev) => {
       if (prev === 0 && curr > 0) return 'increased by 100+%';
       if (prev === 0 && curr === 0) return 'remained flat';
       const pct = ((curr - prev) / prev) * 100;
       const abs = Math.abs(pct).toFixed(0);
       return pct > 0 ? `increased by ${abs}%` : `decreased by ${abs}%`;
    };

    const insights = [];
    const metrics = [
      { key: 'cpa', name: 'CPA' },
      { key: 'ctr', name: 'CTR' },
      { key: 'cvr', name: 'CVR' },
      { key: 'cpm', name: 'CPM' },
      { key: 'cpc', name: 'CPC' },
      { key: 'spend', name: 'Spend' },
      { key: 'impressions', name: 'Impressions' },
      { key: 'clicks', name: 'Clicks' },
      { key: 'purchases', name: 'Conversions' }
    ];

    metrics.forEach(m => {
      if (userRole === 'non-finance' && ['cpa', 'cpm', 'cpc', 'spend'].includes(m.key)) return;
      if (current[m.key] !== undefined && last[m.key] !== undefined) {
        let text = `${m.name} ${calcChange(current[m.key], last[m.key])} ${currentTrendView === 'Weekly' ? 'WoW' : 'DoD'}`;
        if (twoWeeksAgo) {
           text += ` and ${calcChange(current[m.key], twoWeeksAgo[m.key])} compared to ${currentTrendView === 'Weekly' ? 'two weeks ago' : 'two days ago'}`;
        }
        insights.push(text + '.');
      }
    });
    return insights;
  };

  return (
    <div className="mt-8 pt-8 border-t border-[#cedc28]/20">
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-[#eef7f5] font-bold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#cedc28]" />
          {title} Trends
        </h4>
        <div className="flex items-center gap-3">
          <button 
             onClick={() => setShowInsights(!showInsights)}
             className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-colors ${showInsights ? 'bg-[#cedc28] text-[#1a302e] border-[#cedc28]' : 'bg-[#0a2442] text-[#cedc28] border-[#cedc28]/30 hover:border-[#cedc28]'}`}
          >
            {showInsights ? 'Hide Insights' : 'View Insights'}
          </button>
          <div className="flex bg-[#0a2442] p-1 rounded-lg border border-[#cedc28]/20">
            <button onClick={() => setViewFn('Weekly')} className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${currentTrendView === 'Weekly' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}>Weekly</button>
            <button onClick={() => setViewFn('Daily')} className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${currentTrendView === 'Daily' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}>Daily</button>
          </div>
        </div>
      </div>
      
      {showInsights && (
        <div className="mb-6 p-4 rounded-xl bg-[#cedc28]/10 border border-[#cedc28]/30">
          <h5 className="text-[11px] font-bold text-[#cedc28] uppercase tracking-widest mb-3">Performance Insights</h5>
          <ul className="list-disc pl-5 space-y-1">
            {generateInsights(trendData).map((insight, idx) => (
               <li key={idx} className="text-xs text-[#eef7f5] leading-relaxed">{insight}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {userRole !== 'non-finance' && (
          <MetricTrendChart data={trendData} dataKey="spend" name="Spend" format={(v) => `${exSym}${d3.format(",.0f")(v)}`} color="#cedc28" />
        )}
        <MetricTrendChart data={trendData} dataKey="impressions" name="Impressions" format={(v) => formatShort(v)} color="#14a6d9" />
        <MetricTrendChart data={trendData} dataKey="clicks" name="Clicks" format={(v) => formatShort(v)} color="#00937b" />
        <MetricTrendChart data={trendData} dataKey="ctr" name="CTR" format={(v) => `${v.toFixed(2)}%`} color="#cedc28" />
        {userRole !== 'non-finance' && (
          <>
            <MetricTrendChart data={trendData} dataKey="cpm" name="CPM" format={(v) => `${exSym}${v.toFixed(2)}`} color="#14a6d9" />
            <MetricTrendChart data={trendData} dataKey="cpc" name="CPC" format={(v) => `${exSym}${v.toFixed(2)}`} color="#00937b" />
            <MetricTrendChart data={trendData} dataKey="cpa" name="CPA" format={(v) => `${exSym}${v.toFixed(2)}`} color="#cedc28" />
          </>
        )}
        <MetricTrendChart data={trendData} dataKey="cvr" name="Conv. Rate" format={(v) => `${v.toFixed(2)}%`} color="#14a6d9" />
        <MetricTrendChart data={trendData} dataKey="purchases" name="Conversions" format={(v) => d3.format(",.0f")(v)} color="#00937b" />
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('standard');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [adData, setAdData] = useState([]);
  const [gaData, setGaData] = useState([]);
  const [creativeData, setCreativeData] = useState([]);
  const [plannedData, setPlannedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [trendView, setTrendView] = useState('Weekly');
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [phaseTrendView, setPhaseTrendView] = useState('Weekly');
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelTrendView, setChannelTrendView] = useState('Weekly');
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [marketTrendView, setMarketTrendView] = useState('Weekly');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // State: Global Filters
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [filterCampaigns, setFilterCampaigns] = useState(['All']);
  const [filterMarkets, setFilterMarkets] = useState(['All']);
  const [filterChannels, setFilterChannels] = useState(['All']);
  const [filterPhases, setFilterPhases] = useState(['All']);
  const [filterPaidOrganic, setFilterPaidOrganic] = useState(['All']);
  const [filterGa4Properties, setFilterGa4Properties] = useState(['All']);
  const [filterEvents, setFilterEvents] = useState(['All']);
  const [filterEventTypes, setFilterEventTypes] = useState(['All']);
  const [filterPortfolios, setFilterPortfolios] = useState(['All']);
  const [filterWeeks, setFilterWeeks] = useState(['All']);
  const [localWeeklyViewWeeks, setLocalWeeklyViewWeeks] = useState(['All']);
  
  // State: Currency
  const [currency, setCurrency] = useState('USD'); // 'USD' or 'SAR'
  const exRate = currency === 'SAR' ? 3.75 : 1;
  const exSym = currency === 'SAR' ? 'SAR ' : '$';
  
  // State: Chart Filters
  const [perfMetric, setPerfMetric] = useState('CPM');
  const [perfSort, setPerfSort] = useState('Top 5');
  const [gaMetric, setGaMetric] = useState('Sessions');
  const [mapMetric, setMapMetric] = useState('Sessions');

  useEffect(() => {
    if (userRole === 'non-finance' && ['CPM', 'CPC'].includes(perfMetric)) {
      setPerfMetric('CTR');
    }
  }, [userRole, perfMetric]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsAuthenticated(true);
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserRole(data.role || (data.isAdmin ? 'admin' : 'standard'));
          } else {
            setUserRole('standard');
          }
          // Update lastActive
          await setDoc(doc(db, 'users', user.uid), { 
            lastActive: new Date().toISOString() 
          }, { merge: true });
        } catch (e) {
          console.error("Error fetching/updating user", e);
        }
        setIsAuthLoading(false);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const parseRow = (row, sourceEventName = '') => {
    const rawCost = parseMetric(row['Cost'] || row['Spend'] || 0);
    const eventNameDB = (row['Event Name DB'] || '').trim() || sourceEventName;
    const eventTypeDB = (row['Event Type DB'] || '').trim();
    const channel = row['Channel'] || 'Unknown';
    // Derive portfolio: Default to P1, SMLC to P3
    let portfolio = 'P1';
    if (eventNameDB.toUpperCase().includes('SMLC')) {
      portfolio = 'P3';
    }

    const isGoogle = channel.toLowerCase().includes('google');
    const isMetaOrLinkedin = channel.toLowerCase().includes('meta') || channel.toLowerCase().includes('linkedin') || channel.toLowerCase().includes('fb') || channel.toLowerCase().includes('ig') || channel.toLowerCase().includes('facebook') || channel.toLowerCase().includes('instagram');
    
    const rowVals = Object.values(row);
    let creativeName = row['Creative Name DB'] || rowVals[30];
    if (!creativeName || creativeName.trim() === '') {
      creativeName = isGoogle 
          ? (rowVals[11] || row['Ad set name'] || 'Unknown') 
          : (rowVals[12] || row['Ad name'] || 'Unknown');
    }
    
    let marketName = rowVals[26] || row['Market'] || row['Targeting country location'] || 'Unknown';
        
    const previewLink = isMetaOrLinkedin ? (rowVals[14] || '') : '';

    return {
      date: row['Date'],
      dateObj: row['Date'] ? new Date(row['Date']) : null,
      campaignName: row['Campaign name'] || row['Campaign DB'] || 'Unknown',
      phase: row['Funnel Stage DB'] || row['Activity'] || row['Campaign Type'] || 'Unknown',
      buyingType: 'Unknown',
      country: normalizeMarket(marketName),
      language: 'Unknown',
      channel: channel,
      adName: creativeName,
      creativeName: creativeName,
      adImageUrl: previewLink,
      postUrl: previewLink,
      cost: rawCost,
      impressions: parseMetric(row['Impressions']),
      clicks: parseMetric(row['Clicks']),
      videoViews: parseMetric(row['Video views'] || 0),
      videoViews6s: 0,
      videoViews15s: 0,
      videoCompletions: 0,
      purchases: parseMetric(row['Conversions'] || 0),
      isAuxiliaryData: false,
      eventNameDB: eventNameDB || 'Unknown',
      eventTypeDB: eventTypeDB || 'Unknown',
      weekDB: (row['Week DB'] || '').trim() || 'Unknown',
      portfolio: portfolio
    };
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    // Fetch from GSTS (default gid), SAIF (gid=1196409184), KoG 2026 (gid=1486784585), Black Hat (gid=659941332), and SMLC (gid=1526538255) sheets
    Promise.all([
      d3.csv(BASE_URL),
      d3.csv(BASE_URL + '&gid=1196409184'),
      d3.csv(BASE_URL + '&gid=1486784585'),
      d3.csv(BASE_URL + '&gid=659941332'),
      d3.csv(BASE_URL + '&gid=1526538255')
    ]).then(([gstsRaw, saifRaw, kogRaw, blackHatRaw, smlcRaw]) => {
      const gstsAds = gstsRaw.map(r => parseRow(r, 'GSTS'));
      const saifAds = saifRaw.map(r => parseRow(r, 'SAIF'));
      const kogAds = kogRaw.map(r => parseRow(r, 'KOG'));
      const blackHatAds = blackHatRaw.map(r => parseRow(r, 'BLACK HAT'));
      const smlcAds = smlcRaw.map(r => parseRow(r, 'SMLC'));
      const combinedAds = [...gstsAds, ...saifAds, ...kogAds, ...blackHatAds, ...smlcAds];

      // --- Dynamic Week DB Calculation ---
      const eventStartDates = {
        'GSTS': new Date(Date.UTC(2026, 11, 18)), // Dec 18 2026
        'SAIF': new Date(Date.UTC(2026, 10, 24)), // Nov 24 2026
        'KOG': new Date(Date.UTC(2026, 11, 1)),   // Dec 1 2026
        'BLACK HAT': new Date(Date.UTC(2026, 11, 1)),
        'SMLC': new Date(Date.UTC(2026, 9, 21))   // Oct 21 2026
      };

      const firstImps = {};
      combinedAds.forEach(d => {
        if (d.impressions > 0 && d.dateObj) {
           const ev = (d.eventNameDB || '').toUpperCase();
           const dUTC = new Date(Date.UTC(d.dateObj.getFullYear(), d.dateObj.getMonth(), d.dateObj.getDate()));
           if (!firstImps[ev] || dUTC < firstImps[ev]) {
              firstImps[ev] = dUTC;
           }
        }
      });

      const MS_PER_DAY = 1000 * 60 * 60 * 24;
      combinedAds.forEach(d => {
        if (!d.dateObj) return;
        const ev = (d.eventNameDB || '').toUpperCase();
        const campStart = firstImps[ev];
        const eventStart = Object.entries(eventStartDates).find(([k]) => ev.includes(k))?.[1];
        
        if (campStart && eventStart) {
           const dUTC = new Date(Date.UTC(d.dateObj.getFullYear(), d.dateObj.getMonth(), d.dateObj.getDate()));
           const rowDays = Math.floor((dUTC - campStart) / MS_PER_DAY);
           const rowBlock = Math.floor(rowDays / 7);
           
           const eventDays = Math.floor((eventStart - campStart) / MS_PER_DAY);
           const eventBlock = Math.floor(eventDays / 7);
           
           d.weekDB = `W${eventBlock - rowBlock}`;
        }
      });
      // ------------------------------------

      setAdData(combinedAds);
      setGaData([]);
      setCreativeData(combinedAds);
      setPlannedData([]);
      
      const allDates = combinedAds
        .map(d => d.dateObj)
        .filter(d => d instanceof Date && !isNaN(d));
      if (allDates.length > 0) {
        setLastUpdated(new Date(Math.max(...allDates)));
      } else {
        setLastUpdated(new Date());
      }
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [isAuthenticated]);

  

  const resetFilters = () => {
    setFilterCampaigns(['All']);
    setFilterMarkets(['All']);
    setFilterChannels(['All']);
    setFilterPhases(['All']);
    setFilterPaidOrganic(['All']);
    setFilterGa4Properties(['All']);
    setFilterEvents(['All']);
    setFilterEventTypes(['All']);
    setFilterPortfolios(['All']);
    setFilterWeeks(['All']);
    setDateRange({ start: '', end: '' });
  };

  const uniqueCampaigns = useMemo(() => Array.from(new Set(adData.map(d => d.campaignName))).sort(), [adData]);
  const uniqueChannels = useMemo(() => Array.from(new Set(adData.map(d => d.channel))).filter(Boolean).sort(), [adData]);
  const uniquePhases = useMemo(() => Array.from(new Set(adData.map(d => d.phase))).filter(Boolean).sort(), [adData]);
  const uniqueMarkets = useMemo(() => {
    const combined = [...adData.map(d => d.country), ...gaData.map(d => d.country)];
    return Array.from(new Set(combined)).filter(Boolean).sort();
  }, [adData, gaData]);
  const uniquePaidOrganic = useMemo(() => Array.from(new Set(gaData.map(d => d.paidOrganic))).sort(), [gaData]);
  const uniqueGa4Properties = useMemo(() => Array.from(new Set(gaData.map(d => d.ga4Property))).filter(Boolean).sort(), [gaData]);
  const uniquePortfolios = useMemo(() => Array.from(new Set(adData.map(d => d.portfolio))).filter(Boolean).sort(), [adData]);
  const eventsData = useMemo(() => filterPortfolios.includes('All') ? adData : adData.filter(d => filterPortfolios.includes(d.portfolio)), [adData, filterPortfolios]);
  const uniqueEvents = useMemo(() => Array.from(new Set(eventsData.map(d => d.eventNameDB))).filter(e => e && e !== 'Unknown').sort(), [eventsData]);
  const eventTypesData = useMemo(() => filterEvents.includes('All') ? eventsData : eventsData.filter(d => filterEvents.includes(d.eventNameDB)), [eventsData, filterEvents]);
  const uniqueEventTypes = useMemo(() => Array.from(new Set(eventTypesData.map(d => d.eventTypeDB))).filter(e => e && e !== 'Unknown').sort(), [eventTypesData]);

  useEffect(() => {
    if (filterEvents.includes('All')) return;
    const validEvents = filterEvents.filter(e => uniqueEvents.includes(e));
    if (validEvents.length !== filterEvents.length) {
      setFilterEvents(validEvents.length ? validEvents : ['All']);
    }
  }, [uniqueEvents, filterEvents]);

  useEffect(() => {
    if (filterEventTypes.includes('All')) return;
    const validTypes = filterEventTypes.filter(e => uniqueEventTypes.includes(e));
    if (validTypes.length !== filterEventTypes.length) {
      setFilterEventTypes(validTypes.length ? validTypes : ['All']);
    }
  }, [uniqueEventTypes, filterEventTypes]);
  const uniqueWeeks = useMemo(() => {
    const weeks = Array.from(new Set(adData.map(d => d.weekDB))).filter(w => w && w !== 'Unknown');
    // Sort weeks numerically in countdown order (e.g. W12, W11 ... W0)
    return weeks.sort((a, b) => {
      const numA = parseInt(a.replace(/[^\d-]/g, ''), 10);
      const numB = parseInt(b.replace(/[^\d-]/g, ''), 10);
      return numB - numA;
    });
  }, [adData]);

  // Apply filters to Ad Data
  const filteredAdData = useMemo(() => {
    return adData.filter(d => {
      if (!filterCampaigns.includes('All') && !filterCampaigns.includes(d.campaignName)) return false;
      if (!filterMarkets.includes('All') && !filterMarkets.includes(d.country)) return false;
      if (!filterChannels.includes('All') && !filterChannels.includes(d.channel)) return false;
      if (!filterPhases.includes('All') && !filterPhases.includes(d.phase)) return false;
      if (!filterEvents.includes('All') && !filterEvents.includes(d.eventNameDB)) return false;
      if (!filterPortfolios.includes('All') && !filterPortfolios.includes(d.portfolio)) return false;
      if (!filterEventTypes.includes('All') && !filterEventTypes.includes(d.eventTypeDB)) return false;
      if (!filterWeeks.includes('All') && !filterWeeks.includes(d.weekDB)) return false;
      if (dateRange.start && d.dateObj && d.dateObj < new Date(dateRange.start)) return false;
      if (dateRange.end && d.dateObj && d.dateObj > new Date(dateRange.end)) return false;
      return true;
    });
  }, [adData, filterCampaigns, filterMarkets, filterChannels, filterPhases, filterEvents, filterPortfolios, filterEventTypes, filterWeeks, dateRange]);

  const coreAdData = useMemo(() => filteredAdData.filter(d => !d.isAuxiliaryData), [filteredAdData]);

  // Apply filters to GA Data (only Date and Market apply)
  const filteredGaData = useMemo(() => {
    return gaData.filter(d => {
      let matchesCampaign = true;
      if (!filterCampaigns.includes('All')) {
        matchesCampaign = filterCampaigns.includes(d.campaignName);
        // Special rule for Gulf Cup: Include all traffic for Gulfcup GA property if Gulf Cup event is selected
        if (filterCampaigns.includes('Gulf Cup') && d.ga4Property === 'Gulfcup - Khaleeji27') {
          matchesCampaign = true;
        }
      }
      if (!matchesCampaign) return false;

      if (!filterMarkets.includes('All') && !filterMarkets.includes(d.country)) return false;
      if (!filterPaidOrganic.includes('All') && !filterPaidOrganic.includes(d.paidOrganic)) return false;
      if (!filterGa4Properties.includes('All') && !filterGa4Properties.includes(d.ga4Property)) return false;
      if (dateRange.start && d.dateObj && d.dateObj < new Date(dateRange.start)) return false;
      if (dateRange.end && d.dateObj && d.dateObj > new Date(dateRange.end)) return false;
      return true;
    });
  }, [gaData, filterCampaigns, filterMarkets, filterPaidOrganic, filterGa4Properties, dateRange]);

  const agg = useMemo(() => {
    const cost = d3.sum(filteredAdData, d => d.cost);
    const impressions = d3.sum(filteredAdData, d => d.impressions);
    const clicks = d3.sum(filteredAdData, d => d.clicks);
    const views = d3.sum(filteredAdData, d => d.videoViews);
    const views6s = d3.sum(filteredAdData, d => d.videoViews6s);
    const views15s = d3.sum(filteredAdData, d => d.videoViews15s);
    const completions = d3.sum(filteredAdData, d => d.videoCompletions);
    const purchases = d3.sum(filteredAdData, d => d.purchases || 0);
    const sessions = d3.sum(filteredGaData, d => d.sessions);
    const gaPurchases = d3.sum(filteredGaData, d => d.purchases || 0);
    const gaTickets = d3.sum(filteredGaData, d => d.gaTickets || 0);
    return { cost, impressions, clicks, views, completions, views6s, views15s, sessions, purchases, gaPurchases, gaTickets };
  }, [filteredAdData, filteredGaData]);

  const gaSourceData = useMemo(() => {
    return Array.from(d3.rollup(filteredGaData, 
      v => ({
        sessions: d3.sum(v, d => d.sessions),
        users: d3.sum(v, d => d.users),
        engagedSessions: d3.sum(v, d => d.engagedSessions),
        newUsers: d3.sum(v, d => d.newUsers),
        avgSessionDuration: d3.mean(v.filter(d => d.sessions > 0), d => d.avgSessionDuration) || 0
      }),
      d => d.sourceMedium
    )).map(([sourceMedium, metrics]) => ({
      sourceMedium,
      ...metrics
    }));
  }, [filteredGaData]);

  // Chart Data preparation
  const monthlyChartData = useMemo(() => {
    const getMonthKey = (dateObj) => {
      if (!dateObj || isNaN(dateObj)) return 'Unknown';
      return dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };
    
    const validData = filteredAdData.filter(d => d.dateObj && !isNaN(d.dateObj));
    const grouped = d3.groups(validData, d => getMonthKey(d.dateObj));
    
    return grouped.map(([month, vals]) => {
      const sortDate = new Date(vals[0].dateObj.getFullYear(), vals[0].dateObj.getMonth(), 1);
      return {
        month,
        sortDate,
        cost: d3.sum(vals, d => d.cost) * exRate,
        impressions: d3.sum(vals, d => d.impressions),
        clicks: d3.sum(vals, d => d.clicks)
      };
    }).sort((a,b) => a.sortDate - b.sortDate);
  }, [filteredAdData, exRate]);

  // Daily spend chart data (for summary tab)
  const dailySpendData = useMemo(() => {
    const validData = filteredAdData.filter(d => d.dateObj && !isNaN(d.dateObj));
    const formatKey = d3.timeFormat("%Y-%m-%d");
    const formatDisplay = d3.timeFormat("%b %d");
    const grouped = d3.groups(validData, d => formatKey(d.dateObj));
    return grouped.map(([key, vals]) => ({
      key,
      day: formatDisplay(vals[0].dateObj),
      sortDate: vals[0].dateObj,
      spend: d3.sum(vals, d => d.cost) * exRate,
      impressions: d3.sum(vals, d => d.impressions),
      clicks: d3.sum(vals, d => d.clicks),
    })).sort((a, b) => a.sortDate - b.sortDate);
  }, [filteredAdData, exRate]);

  // Channel spend breakdown (for summary tab)
  const channelSpendData = useMemo(() => {
    const grouped = d3.groups(filteredAdData, d => d.channel);
    return grouped.map(([channel, vals]) => ({
      channel,
      spend: d3.sum(vals, d => d.cost) * exRate,
      impressions: d3.sum(vals, d => d.impressions),
      clicks: d3.sum(vals, d => d.clicks),
    })).filter(d => d.spend > 0).sort((a, b) => b.spend - a.spend);
  }, [filteredAdData, exRate]);

  const topCountriesGa = useMemo(() => {
    const grouped = d3.groups(filteredGaData, d => d.country);
    return grouped.map(([country, vals]) => ({
      country,
      sessions: d3.sum(vals, d => d.sessions),
      users: d3.sum(vals, d => d.users),
      engagedSessions: d3.sum(vals, d => d.engagedSessions)
    })).sort((a,b) => {
      if (gaMetric === 'Users') return b.users - a.users;
      if (gaMetric === 'Engaged Sessions') return b.engagedSessions - a.engagedSessions;
      return b.sessions - a.sessions;
    }).slice(0, 10);
  }, [filteredGaData, gaMetric]);

  const dailyGaChartData = useMemo(() => {
    const validData = filteredGaData.filter(d => d.dateObj && !isNaN(d.dateObj));
    const formatKey = d3.timeFormat("%Y-%m-%d");
    const formatDisplay = d3.timeFormat("%b %d");
    
    const grouped = d3.groups(validData, d => formatKey(d.dateObj));
    return grouped.map(([key, vals]) => ({
      key,
      day: formatDisplay(vals[0].dateObj),
      sortDate: vals[0].dateObj,
      purchases: d3.sum(vals, d => d.purchases || 0),
      tickets: d3.sum(vals, d => d.gaTickets || 0)
    })).sort((a,b) => a.sortDate - b.sortDate);
  }, [filteredGaData]);

  const channelPerformance = useMemo(() => {
    const grouped = d3.groups(filteredAdData, d => d.channel);
    let data = grouped.map(([channel, vals]) => {
      const totalCost = d3.sum(vals, d => d.cost) * exRate;
      const totalImpressions = d3.sum(vals, d => d.impressions);
      const totalClicks = d3.sum(vals, d => d.clicks);
      return {
        channel,
        cpm: totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0,
        cpc: totalClicks > 0 ? (totalCost / totalClicks) : 0,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        clicks: totalClicks
      };
    });

    const metricKey = perfMetric.toLowerCase();
    
    // Filter out 0s
    data = data.filter(d => d[metricKey] > 0);
    
    // Sort descending (Highest first)
    data.sort((a,b) => b[metricKey] - a[metricKey]);
    
    if (perfSort === 'Top 5') {
      return data.slice(0, 5);
    } else {
      // Bottom 5 (Lowest first, so we take the last 5 and reverse them)
      return data.slice(-5).reverse();
    }
  }, [filteredAdData, exRate, perfMetric, perfSort]);

  const groupBy = (key) => d3.groups(filteredAdData, d => d[key]).map(([name, vals]) => ({
    name,
    cost: d3.sum(vals, d => d.cost),
    impressions: d3.sum(vals, d => d.impressions),
    clicks: d3.sum(vals, d => d.clicks),
    views: d3.sum(vals, d => d.videoViews),
  })).sort((a,b) => b.cost - a.cost);

  const NAV_ITEMS = [
    { id: 'summary', label: 'Overview', icon: Grid },
    { id: 'campaign', label: 'Event View', icon: Activity },
    { id: 'weekly', label: 'Weekly View', icon: Calendar },
    { id: 'channel', label: 'Channel View', icon: MonitorPlay },
    { id: 'market', label: 'Market View', icon: Map },
    { id: 'detailed', label: 'Detailed View', icon: PieChart },
    /* { id: 'webtraffic', label: 'Web Traffic', icon: Users }, */
    { id: 'creative', label: 'Creative View', icon: LayoutTemplate },
  ];

  // Admin button is rendered separately at the bottom left

  if (isAuthLoading || loading) {
    return (
      <div className="min-h-screen app-bg flex flex-col items-center justify-center text-[#cedc28] gap-6 relative overflow-hidden">
        <div className="relative flex flex-col items-center justify-center animate-pulse">
          <img src="/tahaluf-logo.svg" alt="Loading Logo" className="h-12 md:h-16 object-contain" onError={(e) => e.target.style.display = 'none'} />
        </div>
        <div className="flex flex-col items-center gap-2 z-10">
          <span className="text-sm md:text-base font-bold text-[#cedc28] tracking-[0.2em]">
            {isAuthLoading ? "AUTHENTICATING" : "LOADING DATA"}
          </span>
          <div className="flex gap-1.5 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#cedc28] animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-1.5 h-1.5 rounded-full bg-[#cedc28] animate-bounce" style={{ animationDelay: '0.15s' }}></div>
            <div className="w-1.5 h-1.5 rounded-full bg-[#cedc28] animate-bounce" style={{ animationDelay: '0.3s' }}></div>
          </div>
        </div>
      </div>
    );
  }

  // Removed unused getTotals

  const generatePpt = async () => {
      if (isGenerating) return;
      setIsGenerating(true);
      try {
          if (!window.PptxGenJS) {
              await new Promise((resolve, reject) => {
                  const script = document.createElement('script');
                  script.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js';
                  script.onload = resolve;
                  script.onerror = reject;
                  document.head.appendChild(script);
              });
          }
          if (!window.htmlToImage) {
              await new Promise((resolve, reject) => {
                  const script = document.createElement('script');
                  script.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
                  script.onload = resolve;
                  script.onerror = reject;
                  document.head.appendChild(script);
              });
          }
          
          let pres = new window.PptxGenJS();
          
          pres.defineSlideMaster({
            title: "MASTER_SLIDE",
            background: { color: "0C272D" },
            objects: [
              { image: { x: 8.8, y: 0.2, w: 0.65, h: 0.75, path: window.location.origin + "/tahaluf-logo.svg", sizing: { type: "contain" } } }
            ]
          });

          const mainScroll = document.querySelector('main');
          
          const addSnapshotSlide = async (element, title) => {
             if (element) {
                try {
                   if (mainScroll) {
                      mainScroll.scrollTop = element.offsetTop - 150;
                   } else {
                      element.scrollIntoView({ behavior: 'instant', block: 'center' });
                   }
                   await new Promise(r => setTimeout(r, 200));
                   const imgData = await window.htmlToImage.toPng(element, { 
                       backgroundColor: '#0C272D',
                       pixelRatio: 2
                   });
                   let slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
                   slide.addText(title, { x: 0.5, y: 0.3, w: "90%", h: 0.5, fontSize: 20, bold: true, color: "74FA93" });
                   const img = new Image();
                   img.src = imgData;
                   await new Promise(r => img.onload = r);
                   const imgRatio = img.width / img.height;
                   let w = 9;
                   let h = w / imgRatio;
                   if (h > 4.5) {
                      h = 4.5;
                      w = h * imgRatio;
                   }
                   slide.addImage({ data: imgData, x: 0.5, y: 0.9, w: w, h: h });
                } catch (captureErr) {
                   console.error(`Error capturing snapshot for ${title}:`, captureErr);
                   let errMsg = captureErr.message || captureErr.toString() || "Unknown Error";
                   let slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
                   slide.addText(`${title}\n(Snapshot Capture Failed)\n${errMsg}`, { x: 0.5, y: 2, w: "90%", h: 2, fontSize: 16, bold: true, color: "EF476F", align: 'center' });
                }
             }
          };

          let slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
          slide.addText("Dashboard Snapshot Report", { x: 0.5, y: 2, w: "90%", h: 1, fontSize: 36, bold: true, color: "FFFFFF", align: 'center' });
          
          let durationStr = (dateRange && dateRange.start && dateRange.end) ? `${dateRange.start} to ${dateRange.end}` : 'All Time';
          let tourneyStr = (filterCampaigns && filterCampaigns.length > 0 && !filterCampaigns.includes('All')) ? filterCampaigns.join(', ') : 'All Events';
          
          let filterText = `Duration: ${durationStr}\nEvent: ${tourneyStr}`;
          slide.addText(filterText, { x: 0.5, y: 3.5, w: "90%", h: 2, fontSize: 14, color: "CBBB9D", align: 'center', valign: 'top' });

          const slides = document.querySelectorAll('.export-slide');
          for (let i = 0; i < slides.length; i++) {
             const title = slides[i].getAttribute('data-title') || `Slide ${i + 1}`;
             await addSnapshotSlide(slides[i], title);
          }

          if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' });

          await pres.writeFile({ fileName: `Tahaluf_Dashboard_Snapshot_${new Date().getTime()}.pptx` });
      } catch (err) {
          console.error("PPTX Error", err);
          alert("Error generating PPTX: " + (err.message || err.toString()));
      }
      setIsGenerating(false);
  };

  const renderContent = () => {
      const getMetricsData = (data, groupKeyFunc, keyName) => d3.groups(data, groupKeyFunc).map(([key, vals]) => {
        const spend = d3.sum(vals, d => d.cost) * exRate;
        const impressions = d3.sum(vals, d => d.impressions);
        const clicks = d3.sum(vals, d => d.clicks);
        const purchases = d3.sum(vals, d => d.purchases || 0);
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const cpc = clicks > 0 ? (spend / clicks) : 0;
        const cpa = purchases > 0 ? (spend / purchases) : 0;
        const cvr = clicks > 0 ? (purchases / clicks) * 100 : 0;
        return { [keyName]: key || 'Unknown', spend, impressions, clicks, ctr, cpm, cpc, cpa, cvr, purchases };
      }).sort((a, b) => b.spend - a.spend);

      const getTotals = (data) => {
        const spend = d3.sum(data, d => d.cost) * exRate;
        const impressions = d3.sum(data, d => d.impressions);
        const clicks = d3.sum(data, d => d.clicks);
        const purchases = d3.sum(data, d => d.purchases || 0);
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const cpc = clicks > 0 ? (spend / clicks) : 0;
        const cpa = purchases > 0 ? (spend / purchases) : 0;
        const cvr = clicks > 0 ? (purchases / clicks) * 100 : 0;
        return { spend, impressions, clicks, ctr, cpm, cpc, cpa, cvr, purchases };
      };

      const getTrendDataForSelection = (selection, keyField, currentTrendView, allowedWeeks = null) => {
        if (!selection) return [];
        let evData = selectedEvent ? filteredAdData.filter(d => d.eventNameDB === selectedEvent) : filteredAdData;
        evData = evData.filter(d => d[keyField] === selection);
        
        if (allowedWeeks && !allowedWeeks.includes('All')) {
            evData = evData.filter(d => allowedWeeks.includes(d.weekDB));
        }
        
        const groupKey = currentTrendView === 'Daily' ? d => d.date : d => d.weekDB;
        const grouped = d3.groups(evData, groupKey).filter(([k]) => k && k !== 'Unknown');
        return grouped.map(([key, vals]) => {
          const spend = d3.sum(vals, d => d.cost) * exRate;
          const impressions = d3.sum(vals, d => d.impressions);
          const clicks = d3.sum(vals, d => d.clicks);
          const purchases = d3.sum(vals, d => d.purchases || 0);
          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
          const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
          const cpc = clicks > 0 ? (spend / clicks) : 0;
          const cpa = purchases > 0 ? (spend / purchases) : 0;
          const cvr = clicks > 0 ? (purchases / clicks) * 100 : 0;
          return { key, spend, impressions, clicks, purchases, ctr, cpm, cpc, cpa, cvr };
        }).sort((a, b) => {
          if (currentTrendView === 'Daily') return new Date(a.key) - new Date(b.key);
          const numA = parseInt(a.key.replace(/[^\d-]/g, ''), 10) || 0;
          const numB = parseInt(b.key.replace(/[^\d-]/g, ''), 10) || 0;
          return numB - numA; // Sort descending so W12 is on left, W0 is on right
        });
      };

      const createColumns = (key, label) => [
        { key: key, label: label },
        ...(userRole !== 'non-finance' ? [{ key: 'spend', label: 'Spend', format: (v) => `${exSym}${d3.format(",.0f")(v)}` }] : []),
        { key: 'impressions', label: 'Impressions', format: (v) => d3.format(",")(v) },
        { key: 'clicks', label: 'Clicks', format: (v) => d3.format(",")(v) },
        { key: 'ctr', label: 'CTR', format: (v) => `${v.toFixed(2)}%` },
        ...(userRole !== 'non-finance' ? [
          { key: 'cpm', label: 'CPM', format: (v) => `${exSym}${v.toFixed(2)}` },
          { key: 'cpc', label: 'CPC', format: (v) => `${exSym}${v.toFixed(2)}` },
          { key: 'cpa', label: 'CPA', format: (v) => `${exSym}${v.toFixed(2)}` }
        ] : []),
        { key: 'cvr', label: 'CVR', format: (v) => `${v.toFixed(2)}%` },
        { key: 'purchases', label: 'Conversions', format: (v) => d3.format(",")(v) }
      ];

    if (activeTab === 'summary') {
      // Computed metrics for summary
      const totalCTR = agg.impressions > 0 ? ((agg.clicks / agg.impressions) * 100) : 0;
      const totalCPM = agg.impressions > 0 ? ((agg.cost * exRate) / agg.impressions * 1000) : 0;
      const totalCPC = agg.clicks > 0 ? ((agg.cost * exRate) / agg.clicks) : 0;
      const totalCPA = agg.purchases > 0 ? ((agg.cost * exRate) / agg.purchases) : 0;
      const totalCVR = agg.clicks > 0 ? ((agg.purchases / agg.clicks) * 100) : 0;

      // AI Insights generation from data
      const topChannel = channelSpendData.length > 0 ? channelSpendData[0] : null;
      const lowestCPMChannel = channelPerformance.length > 0 ? [...channelPerformance].sort((a, b) => a.cpm - b.cpm).find(d => d.cpm > 0) : null;
      const highestCTRChannel = channelPerformance.length > 0 ? [...channelPerformance].sort((a, b) => b.ctr - a.ctr)[0] : null;
      const totalConversions = agg.purchases;
      const avgDailySpend = dailySpendData.length > 0 ? d3.mean(dailySpendData, d => d.spend) : 0;
      const peakSpendDay = dailySpendData.length > 0 ? dailySpendData.reduce((max, d) => d.spend > max.spend ? d : max, dailySpendData[0]) : null;

      const subTableAdData = selectedEvent ? filteredAdData.filter(d => d.eventNameDB === selectedEvent) : filteredAdData;
      const subTableTotals = getTotals(subTableAdData);

      const eventMetricsData = getMetricsData(filteredAdData, d => d.eventNameDB, 'eventName');
      const phaseMetricsData = getMetricsData(subTableAdData, d => d.phase, 'phase');
      const channelMetricsData = getMetricsData(subTableAdData, d => d.channel, 'channel');
      const marketMetricsData = getMetricsData(subTableAdData, d => d.country, 'market');

      const eventColumns = createColumns('eventName', 'Event');
      const phaseColumns = createColumns('phase', 'Funnel Stage');
      const channelColumns = createColumns('channel', 'Channel');

      const MARKET_MAPPING = {
        'GSTS': {
          'Cluster 2': 'UAE, Qatar, Oman, Bahrain, Kuwait',
          'Cluster 3': 'UK, France, Germany',
          'Cluster 4': 'Singapore, South Korea'
        },
        'KOG': {
          'Investment markets': 'USA, Canada, UK, France, Germany, Finland, Sweden, Poland, Japan, South Korea, Singapore',
          'Emerging Markets': 'Morocco, Tunisia, Nigeria, South Africa, Indonesia, Malaysia, Phillipines, Brazil'
        }
      };

      const marketColumns = createColumns('market', 'Market');
      marketColumns[0].format = (v) => {
         let tooltipText = '';
         const vClean = (v || '').toString().trim().toLowerCase();
         const activeEventContext = selectedEvent || (filterEvents.length === 1 && !filterEvents.includes('All') ? filterEvents[0] : null);
         if (activeEventContext) {
             const mappingKey = Object.keys(MARKET_MAPPING).find(k => activeEventContext.toUpperCase().includes(k));
             if (mappingKey) {
                 const matchKey = Object.keys(MARKET_MAPPING[mappingKey]).find(k => k.toLowerCase() === vClean);
                 if (matchKey) tooltipText = MARKET_MAPPING[mappingKey][matchKey];
             }
         }
         
         if (tooltipText) {
             return (
               <span 
                 data-tooltip-id="market-tooltip" 
                 data-tooltip-content={tooltipText}
                 className="underline decoration-dashed decoration-[#14a6d9]/80 underline-offset-4 cursor-help"
               >
                 {v}
               </span>
             );
         }
         return v;
      };

      const commonTotals = {
        spend: agg.cost * exRate,
        impressions: agg.impressions,
        clicks: agg.clicks,
        ctr: totalCTR,
        cpm: totalCPM,
        cpc: totalCPC,
        cpa: totalCPA,
        cvr: totalCVR,
        purchases: agg.purchases
      };


      return (
        <div className="space-y-6">
          {/* 1. Top Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 export-slide" data-title="Summary Metrics">
            {userRole !== 'non-finance' && (
              <MetricCard definition="The total amount of money spent on advertising campaigns across all channels." label="Total Spends" value={`${exSym}${formatShort(agg.cost * exRate)}`} color="text-white" icon={DollarSign} />
            )}
            <MetricCard definition="The total number of times your ads were displayed on screen to users." label="Impressions" value={formatShort(agg.impressions)} color="text-[#cedc28]" icon={Eye} />
            <MetricCard definition="The number of times users clicked on your ads." label="Clicks" value={formatShort(agg.clicks)} color="text-[#14a6d9]" icon={MousePointer2} />
            <MetricCard definition="Click-Through Rate: the percentage of impressions that resulted in a click." label="CTR" value={`${totalCTR.toFixed(2)}%`} color="text-[#00937b]" icon={TrendingUp} />
            {userRole !== 'non-finance' && (
              <>
                <MetricCard definition="Cost Per Mille: the average cost per 1,000 impressions." label="CPM" value={`${exSym}${totalCPM.toFixed(2)}`} color="text-[#cedc28]" icon={BarChart3} />
                <MetricCard definition="Cost Per Click: the average cost for each ad click." label="CPC" value={`${exSym}${totalCPC.toFixed(2)}`} color="text-[#14a6d9]" icon={MousePointer2} />
                <MetricCard definition="Cost Per Acquisition: the average cost per conversion." label="CPA" value={`${exSym}${totalCPA.toFixed(2)}`} color="text-[#cedc28]" icon={BarChart3} />
              </>
            )}
            <MetricCard definition="CVR: the percentage of clicks that resulted in a conversion." label="CVR" value={`${totalCVR.toFixed(2)}%`} color="text-[#00937b]" icon={TrendingUp} />
            <MetricCard definition="Total number of conversions (purchases, sign-ups, etc.) tracked from the campaigns." label="Total Conversions" value={formatShort(totalConversions)} color="text-white" icon={ShoppingCart} />
          </div>
          
          {/* 2. Event Metrics Table */}
          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl export-slide" data-title="Event Metrics">
            <DataTable 
              title={<div className="flex items-center gap-2">Metrics by Event <span className="text-[10px] text-slate-400 font-normal">(Click a row to view trends)</span></div>}
              data={eventMetricsData} 
              columns={eventColumns} 
              onRowClick={(row) => setSelectedEvent(selectedEvent === row.eventName ? null : row.eventName)}
              selectedRowId={selectedEvent}
              rowKey="eventName"
              totals={{ eventName: 'TOTAL', ...commonTotals }}
            />
            
            {selectedEvent && <TrendSection title={selectedEvent} trendData={getTrendDataForSelection(selectedEvent, 'eventNameDB', trendView)} currentTrendView={trendView} setViewFn={setTrendView} userRole={userRole} exSym={exSym} formatShort={formatShort} />}
          </div>

          {/* 3. Phase Metrics Table */}
          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl export-slide" data-title="Phase Metrics">
            <DataTable 
              title={<div className="flex items-center gap-2">Metrics by Funnel Stage <span className="text-[10px] text-slate-400 font-normal">({selectedEvent ? "Click a row to view trends" : "Select an event to view trends"})</span></div>}
              data={phaseMetricsData} columns={phaseColumns} totals={{ phase: 'TOTAL', ...subTableTotals }} 
              onRowClick={selectedEvent ? ((row) => setSelectedPhase(selectedPhase === row.phase ? null : row.phase)) : undefined}
              selectedRowId={selectedPhase} rowKey="phase"
              showBars={true} allowColumnSelect={true}
            />
            {selectedPhase && <TrendSection title={selectedPhase} trendData={getTrendDataForSelection(selectedPhase, 'phase', phaseTrendView)} currentTrendView={phaseTrendView} setViewFn={setPhaseTrendView} userRole={userRole} exSym={exSym} formatShort={formatShort} />}
          </div>

          {/* 4. Channel Metrics Table */}
          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl export-slide" data-title="Channel Metrics">
            <DataTable 
              title={<div className="flex items-center gap-2">Metrics by Channel <span className="text-[10px] text-slate-400 font-normal">({selectedEvent ? "Click a row to view trends" : "Select an event to view trends"})</span></div>}
              data={channelMetricsData} columns={channelColumns} totals={{ channel: 'TOTAL', ...subTableTotals }} 
              onRowClick={selectedEvent ? ((row) => setSelectedChannel(selectedChannel === row.channel ? null : row.channel)) : undefined}
              selectedRowId={selectedChannel} rowKey="channel"
              showBars={true} allowColumnSelect={true}
            />
            {selectedChannel && <TrendSection title={selectedChannel} trendData={getTrendDataForSelection(selectedChannel, 'channel', channelTrendView)} currentTrendView={channelTrendView} setViewFn={setChannelTrendView} userRole={userRole} exSym={exSym} formatShort={formatShort} />}
          </div>

          {/* 5. Market Metrics Table */}
          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl export-slide" data-title="Market Metrics">
            <DataTable 
              title={<div className="flex items-center gap-2">Metrics by Market <span className="text-[10px] text-slate-400 font-normal">({selectedEvent ? "Click a row to view trends" : "Select an event to view trends"})</span></div>}
              data={marketMetricsData} columns={marketColumns} totals={{ market: 'TOTAL', ...subTableTotals }} 
              onRowClick={selectedEvent ? ((row) => setSelectedMarket(selectedMarket === row.market ? null : row.market)) : undefined}
              selectedRowId={selectedMarket} rowKey="market"
              showBars={true} allowColumnSelect={true}
            />
            {selectedMarket && <TrendSection title={selectedMarket} trendData={getTrendDataForSelection(selectedMarket, 'country', marketTrendView)} currentTrendView={marketTrendView} setViewFn={setMarketTrendView} userRole={userRole} exSym={exSym} formatShort={formatShort} />}
          </div>

        </div>
      );
    }

    if (activeTab === 'weekly') {
      const activeEventContext = selectedEvent || (filterEvents.length === 1 && !filterEvents.includes('All') ? filterEvents[0] : null);

      if (!activeEventContext) {
         return (
           <div className="flex flex-col items-center justify-center h-[60vh] text-center w-full">
             <Calendar className="w-20 h-20 text-[#cedc28]/40 mb-6" />
             <h2 className="text-3xl font-anton uppercase text-white mb-3">Select an Event</h2>
             <p className="text-[#eef7f5]/70 max-w-lg text-sm">
               Please select exactly one event from the master filter at the top right, or click an event in the Overview tab, to unlock its full weekly breakdown and trend analysis.
             </p>
           </div>
         );
      }

      let baseWeeklyData = filteredAdData.filter(d => d.eventNameDB === activeEventContext);
      
      const eventUniqueWeeks = Array.from(new Set(baseWeeklyData.map(d => d.weekDB))).filter(Boolean).sort((a, b) => {
          const numA = parseInt(a.replace(/[^\d-]/g, '') || '0', 10);
          const numB = parseInt(b.replace(/[^\d-]/g, '') || '0', 10);
          return numB - numA;
      });

      let subTableAdData = baseWeeklyData;
      if (!localWeeklyViewWeeks.includes('All')) {
          subTableAdData = subTableAdData.filter(d => localWeeklyViewWeeks.includes(d.weekDB));
      }

      const getWeekDateRange = (weekStr) => {
         const weekData = baseWeeklyData.filter(d => d.weekDB === weekStr);
         if (weekData.length === 0) return '';
         const dates = weekData.map(d => new Date(d.date)).filter(d => !isNaN(d));
         if (dates.length === 0) return '';
         const minDate = new Date(Math.min(...dates));
         const maxDate = new Date(Math.max(...dates));
         
         const monthMin = minDate.toLocaleDateString('en-US', { month: 'short' });
         const dayMin = minDate.getDate();
         const yearMin = minDate.getFullYear();
         
         const monthMax = maxDate.toLocaleDateString('en-US', { month: 'short' });
         const dayMax = maxDate.getDate();
         const yearMax = maxDate.getFullYear();
         
         if (yearMin === yearMax) {
             if (monthMin === monthMax) {
                 return `${monthMin} ${dayMin}-${dayMax}, ${yearMax}`;
             }
             return `${monthMin} ${dayMin} - ${monthMax} ${dayMax}, ${yearMax}`;
         }
         return `${monthMin} ${dayMin}, ${yearMin} - ${monthMax} ${dayMax}, ${yearMax}`;
      };

      const weeklyMetricsData = getMetricsData(subTableAdData, d => d.weekDB, 'week');
      weeklyMetricsData.forEach(row => {
          row.dateRange = getWeekDateRange(row.week);
      });
      
      weeklyMetricsData.sort((a, b) => {
          const numA = parseInt(a.week.replace(/[^\d-]/g, '') || '0', 10);
          const numB = parseInt(b.week.replace(/[^\d-]/g, '') || '0', 10);
          return numB - numA;
      });

      const weeklyColumns = createColumns('week', 'Week');
      weeklyColumns.splice(1, 0, { key: 'dateRange', label: 'Date Range' });
      const weekTotals = getTotals(subTableAdData);
      weekTotals.week = 'TOTAL';
      weekTotals.dateRange = '-';

      return (
        <div className="space-y-8 w-full">
          <div className="flex justify-between items-center card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl mb-4 relative z-30" style={{ overflow: 'visible' }}>
            <h2 className="text-3xl font-anton uppercase text-white flex items-center gap-3"><Calendar className="text-[#cedc28]" /> Weekly View: {activeEventContext}</h2>
            <div className="w-64">
               <MultiSelect label="Select Weeks" options={eventUniqueWeeks} selected={localWeeklyViewWeeks} onChange={setLocalWeeklyViewWeeks} />
            </div>
          </div>
          
          <div className="card-surface p-6 rounded-3xl border border-[#cedc28]/10 shadow-lg relative z-20 overflow-visible">
            <DataTable 
              title={`Weekly Breakdown - ${activeEventContext}`} 
              data={weeklyMetricsData} 
              columns={weeklyColumns} 
              totals={weekTotals}
              showBars={true}
              allowColumnSelect={true}
            />
          </div>
          
          <TrendSection 
             title={activeEventContext} 
             trendData={getTrendDataForSelection(activeEventContext, 'eventNameDB', trendView, localWeeklyViewWeeks)} 
             currentTrendView={trendView} 
             setViewFn={setTrendView} 
             userRole={userRole} 
             exSym={exSym} 
             formatShort={formatShort} 
          />
        </div>
      );
    }
    
    if (activeTab === 'campaign') {
      return (
        <div className="w-full h-full">
           <CampaignView adData={filteredAdData} plannedData={plannedData} exRate={exRate} exSym={exSym} formatShort={formatShort} userRole={userRole} filterMarkets={filterMarkets} filterEvents={filterEvents} />
        </div>
      );
    }
    
    if (activeTab === 'channel') {
      return (
        <div className="w-full h-full">
          <ChannelView adData={filteredAdData} exRate={exRate} exSym={exSym} formatShort={formatShort} userRole={userRole} />
        </div>
      );
    }

    if (activeTab === 'market') {
      return (
        <div className="w-full h-full">
          <MarketView adData={coreAdData} gaData={filteredGaData} exRate={exRate} exSym={exSym} formatShort={formatShort} userRole={userRole} />
        </div>
      );
    }

    if (activeTab === 'detailed') {
      return (
        <div className="w-full h-full">
          <CustomView adData={coreAdData} exRate={exRate} exSym={exSym} formatShort={formatShort} filterCampaigns={filterCampaigns} filterMarkets={filterMarkets} dateRange={dateRange} userRole={userRole} />
        </div>
      );
    }

    if (activeTab === 'webtraffic') {
      return null; // Archived Web Traffic

      const totalGaSessions = d3.sum(filteredGaData, d => d.sessions);
      const totalGaUsers = d3.sum(filteredGaData, d => d.users);
      const totalGaEngaged = d3.sum(filteredGaData, d => d.engagedSessions);
      const totalGaNewUsers = d3.sum(filteredGaData, d => d.newUsers);
      
      const totalItemViews = d3.sum(filteredGaData, d => d.itemViews);
      const totalAddToCart = d3.sum(filteredGaData, d => d.addToCarts);
      const totalCheckouts = d3.sum(filteredGaData, d => d.checkouts);
      const totalPurchases = d3.sum(filteredGaData, d => d.purchases);
      const totalGaTickets = d3.sum(filteredGaData, d => d.gaTickets || 0);
      
      const gaWithSessions = filteredGaData.filter(d => d.sessions > 0);
      const totalGaMarkets = new Set(gaWithSessions.map(d => d.country)).size;
      
      const avgDuration = gaWithSessions.length > 0 
        ? d3.mean(gaWithSessions, d => d.avgSessionDuration) 
        : 0;

      const mapDataGrouped = d3.groups(filteredGaData, d => d.country).map(([country, vals]) => ({
        country,
        sessions: d3.sum(vals, d => d.sessions),
        users: d3.sum(vals, d => d.users),
        engagedSessions: d3.sum(vals, d => d.engagedSessions)
      }));
      const mapDataDict = Object.fromEntries(mapDataGrouped.map(d => [d.country, d]));
      
      const getMapVal = (d) => {
        if (!d) return 0;
        if (mapMetric === 'Engaged Sessions') return d.engagedSessions;
        if (mapMetric === 'Total Users') return d.users;
        return d.sessions;
      };

      const getDiscreteColor = (val) => {
        if (!val || val < 100) return '#4b5563';
        if (val < 1000) return '#34d399';
        if (val < 10000) return '#10b981';
        if (val < 30000) return '#059669';
        if (val < 50000) return '#047857';
        if (val <= 100000) return '#065f46';
        return '#064e3b';
      };

      return (
        <div className="space-y-8">
          <div className="flex justify-between items-center card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl mb-4 flex-wrap gap-4 relative z-20">
            <div className="flex items-center gap-6">
              <h2 className="text-3xl font-anton uppercase text-white flex items-center gap-3"><MonitorPlay className="text-[#cedc28]" /> Web Traffic (GA4)</h2>
              <div className="flex items-end">
                {/* <MultiSelect label="GA4 Property" options={uniqueGa4Properties} selected={filterGa4Properties} onChange={setFilterGa4Properties} /> */}
              </div>
            </div>
            <div className="flex gap-4 items-end">
              <MultiSelect label="Paid / Organic" options={uniquePaidOrganic} selected={filterPaidOrganic} onChange={setFilterPaidOrganic} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5 gap-4">
            <MetricCard definition="A session is a group of user interactions with your website that take place within a given time frame." label="Sessions" value={formatShort(totalGaSessions)} icon={Eye} color="text-white" />
            <MetricCard definition="The number of sessions that lasted longer than 10 seconds, had a conversion event, or had 2 or more screen or page views." label="Engaged Sessions" value={formatShort(totalGaEngaged)} icon={Activity} color="text-[#14a6d9]" />
            <MetricCard definition="The number of users who interacted with your site or launched your app for the first time." label="New Users" value={formatShort(totalGaNewUsers)} icon={TrendingUp} color="text-white" />
            <MetricCard definition="The total number of unique users who logged an event." label="Total Users" value={formatShort(totalGaUsers)} icon={MousePointer2} color="text-[#cedc28]" />
            
            <MetricCard definition="The total number of times items were viewed." label="Item Views" value={formatShort(totalItemViews)} icon={Eye} color="text-[#14a6d9]" />
            <MetricCard definition="The total number of times items were added to the cart." label="Add to Carts" value={formatShort(totalAddToCart)} icon={Activity} color="text-white" />
            <MetricCard definition="The total number of times users initiated a checkout." label="Checkouts" value={formatShort(totalCheckouts)} icon={MousePointer2} color="text-[#cedc28]" />
            <MetricCard definition="The total number of completed purchases." label="Purchases" value={formatShort(totalPurchases)} icon={TrendingUp} color="text-[#14a6d9]" />
            <MetricCard definition="The average duration (in seconds) of user sessions." label="Avg Session (s)" value={d3.format(",.1f")(avgDuration)} icon={List} color="text-white" />
            {/* <MetricCard definition="The total quantity of tickets sold reported by GA4." label="GA4 Tickets Sales" value={formatShort(totalGaTickets)} icon={ShoppingCart} color="text-[#cedc28]" /> */}
          </div>

          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl relative">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[#eef7f5] font-bold flex items-center gap-2">Global Web Traffic </h3>
              <div className="flex gap-2">
                {['Sessions', 'Engaged Sessions', 'Total Users'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMapMetric(m)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${mapMetric === m ? 'bg-[#cedc28] text-[#1a302e]' : 'bg-[#0a2442] text-[#cedc28] border border-[#cedc28]/30 hover:bg-[#cedc28]/20'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="w-full h-[500px] bg-[#0a2442]/50 rounded-2xl overflow-hidden border border-[#cedc28]/10 relative">
              <div className="absolute bottom-6 left-6 bg-[#0a2442]/80 backdrop-blur-md border border-[#cedc28]/20 p-4 rounded-xl flex flex-col gap-2 z-10 w-40 shadow-2xl">
                <span className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-1">{mapMetric}</span>
                {[
                  { label: '> 100k', color: '#064e3b' },
                  { label: '50k - 100k', color: '#065f46' },
                  { label: '30k - 50k', color: '#047857' },
                  { label: '10k - 30k', color: '#059669' },
                  { label: '1k - 10k', color: '#10b981' },
                  { label: '100 - 1k', color: '#34d399' },
                  { label: '< 100', color: '#4b5563' }
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-xs font-medium text-[#eef7f5]">{item.label}</span>
                  </div>
                ))}
              </div>
              <ComposableMap projection="geoMercator" projectionConfig={{ scale: 100 }} width={800} height={400}>
                <ZoomableGroup>
                  <Geographies geography={GEO_URL}>
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        const countryName = geo.properties.name;
                        const normName = normalizeMarket(countryName);
                        const data = mapDataDict[normName];
                        const val = getMapVal(data);
                        const fill = getDiscreteColor(val);
                        
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill={fill}
                            stroke="#1a302e"
                            strokeWidth={0.5}
                            style={{
                              default: { outline: 'none' },
                              hover: { fill: '#eef7f5', outline: 'none', cursor: 'pointer' },
                              pressed: { outline: 'none' },
                            }}
                            data-tooltip-id="map-tooltip"
                            data-tooltip-content={`${countryName}: ${d3.format(",")(val)} ${mapMetric}`}
                          />
                        );
                      })
                    }
                  </Geographies>
                </ZoomableGroup>
              </ComposableMap>
              <ReactTooltip id="map-tooltip" style={{ backgroundColor: '#1a302e', color: '#cedc28', fontWeight: 'bold' }} />
            </div>
          </div>
          
          {/* Daily GA4 Sales Trend
          {/* <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl h-[400px] mb-8 export-slide" data-title="Daily GA4 Sales Trend">
            <h3 className="text-[#eef7f5] font-bold mb-4 flex items-center gap-2">
              Daily GA4 Sales Trend

            </h3>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={dailyGaChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="day" stroke="#14a6d9" fontSize={10} />
                <YAxis yAxisId="left" stroke="#00937b" fontSize={10} tickFormatter={(t) => d3.format(",")(t)} />
                <YAxis yAxisId="right" orientation="right" stroke="#cedc28" fontSize={10} tickFormatter={(t) => d3.format(",")(t)} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a302e', borderColor: '#cedc2820', color: '#fff' }} 
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="purchases" name="Purchases" stroke="#00937b" strokeWidth={3} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="tickets" name="Ticket Sales" stroke="#cedc28" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div> */}

          <GaChannelTable rawData={filteredGaData} formatShort={formatShort} />
        </div>
      );
    }

    if (activeTab === 'creative') {
      const filteredCreativeData = creativeData.filter(d => {
        if (!filterCampaigns.includes('All') && !filterCampaigns.includes(d.campaignName)) return false;
        if (!filterEvents.includes('All') && !filterEvents.includes(d.eventNameDB)) return false;
        if (dateRange.start && d.date && d.date < new Date(dateRange.start)) return false;
        if (dateRange.end && d.date && d.date > new Date(dateRange.end)) return false;
        return true;
      });
      return (
        <div className="w-full h-full">
          <CreativeView data={filteredCreativeData} exRate={exRate} exSym={exSym} formatShort={formatShort} userRole={userRole} />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-screen overflow-hidden app-bg font-sans selection:bg-[#cedc28]/30 text-white flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#0a2442]/95 backdrop-blur-xl border-b border-[#cedc28]/20 px-6 py-3 shadow-2xl relative">
        <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none"></div>
        <div className="flex items-start gap-4 relative z-10 w-full justify-between">
          {/* LEFT: Logo */}
          <div className="flex items-center gap-4 shrink-0 mt-1">
            <div className="flex flex-col items-start gap-0.5 mr-2">
              <img src="/tahaluf-logo.svg" alt="Tahaluf Logo" className="h-8 object-contain" onError={(e) => e.target.style.display = 'none'} />
              <p className="text-[9px] font-bold text-[#cedc28] uppercase tracking-[0.1em]">Performance Dashboard</p>
            </div>
            <div className="h-10 w-px bg-[#cedc28]/20 hidden xl:block"></div>
          </div>

          {/* RIGHT: Filters + Actions */}
          <div className="flex gap-1.5 flex-wrap flex-1 justify-start items-end xl:ml-4">
            <DateRangeFilter label="Date Range" dateRange={dateRange} onChange={setDateRange} />
            <MultiSelect label="Week" options={uniqueWeeks} selected={filterWeeks} onChange={setFilterWeeks} />
            <MultiSelect label="Event Portfolio" options={uniquePortfolios} selected={filterPortfolios} onChange={setFilterPortfolios} />
            <MultiSelect label="Event" options={uniqueEvents} selected={filterEvents} onChange={setFilterEvents} />
            <MultiSelect label="Event Type" options={uniqueEventTypes} selected={filterEventTypes} onChange={setFilterEventTypes} />
            <MultiSelect label="Funnel Stage" options={uniquePhases} selected={filterPhases} onChange={setFilterPhases} />
            <MultiSelect label="Channel" options={uniqueChannels} selected={filterChannels} onChange={setFilterChannels} />
            <MultiSelect label="Market" options={uniqueMarkets} selected={filterMarkets} onChange={setFilterMarkets} />
            
            <div className="ml-auto shrink-0 flex items-end">
              <button onClick={resetFilters} title="Reset Filters" className="h-[34px] w-[34px] bg-[#cedc28]/10 border border-[#cedc28]/50 text-[#cedc28] rounded-lg hover:bg-[#cedc28]/20 hover:text-white transition-colors flex items-center justify-center"><RefreshCw className="w-4 h-4"/></button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-52 border-r border-[#cedc28]/10 bg-[#0a2442] flex flex-col gap-2 overflow-y-auto z-20 relative">
          <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none" style={{ opacity: 0.20 }}></div>
          <div className="p-6 pb-2 relative z-10">
            <div className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-4 px-4">Navigation</div>
          {NAV_ITEMS.map(t => {
            const active = activeTab === t.id;
            return (
              <button 
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl font-bold text-[13px] transition-all ${
                  active ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#eef7f5] hover:bg-[#cedc28]/10 hover:text-[#cedc28]'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
          </div>
          <div className="flex-1 min-h-[50px] mt-4"></div>
          
          <div className="flex flex-col gap-2 px-6 pb-6 mt-auto z-30">
            {userRole === 'admin' && (
              <div className="flex justify-start">
                <button 
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'admin' ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#eef7f5] hover:bg-[#cedc28]/10 hover:text-[#cedc28]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Admin
                </button>
              </div>
            )}
            
            {userRole !== 'non-finance' && (
              <div className="flex justify-start px-3">
                <div className="flex bg-[#0a2442] p-0.5 rounded-lg border border-[#cedc28]/20 w-[100px]">
                  <button onClick={() => setCurrency('USD')} className={`flex-1 px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${currency === 'USD' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}>USD</button>
                  <button onClick={() => setCurrency('SAR')} className={`flex-1 px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${currency === 'SAR' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}>SAR</button>
                </div>
              </div>
            )}
            
            <div className="flex justify-start mt-1">
              <button 
                onClick={handleSignOut}
                className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg font-bold transition-all text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] border border-transparent hover:border-red-500/20"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
          {lastUpdated && (
            <div className={`px-6 pb-6 text-[9px] font-bold text-[#14a6d9] uppercase tracking-wider opacity-60 text-left ${userRole === 'admin' ? 'mt-0' : 'mt-auto'}`}>
              Data up to: {lastUpdated.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
        
        {/* TABS CONTENT */}
        {activeTab === 'admin' ? (
          <AdminView />
        ) : (
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10">
          <ReactTooltip id="market-tooltip" className="z-50" style={{ backgroundColor: '#0a2442', color: '#eef7f5', border: '1px solid #cedc2830', borderRadius: '8px', zIndex: 1000 }} />
          <div className="absolute top-0 right-0 w-full h-[500px] bg-gradient-to-br from-[#062f2e]/20 via-transparent to-transparent pointer-events-none -z-10"></div>
          {renderContent()}
        </main>
        )}
      </div>
    </div>
  );
}
