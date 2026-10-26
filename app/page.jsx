"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { 
  TrendingUp, Globe, Layers, Activity, DollarSign, MousePointer2, 
  Eye, EyeOff, Shield, Zap, LayoutDashboard, ChevronDown, Search, Check, ShoppingCart,
  TableProperties, MonitorPlay, BarChart3, Smartphone, List, Download, RefreshCw, Users, Calendar, LayoutTemplate, PieChart, Grid, Map as MapIcon, LogOut,
  Sparkles
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
import DetailedDateFilter from './components/DetailedDateFilter';
import HealthAlertBanner from './components/HealthAlertBanner';
import { getWeekIndex, generateEventWeekTimeline } from '../lib/weekTimeline.mjs';
import { 
  trackActivity, 
  trackCurrencyToggle, 
  trackDashboardOpen, 
  trackMetricCardClick, 
  trackTrendView, 
  trackExport 
} from '../lib/analyticsTracker.js';

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
const MetricCard = ({ label, value, color, icon: Icon, definition, subContent, onClick }) => (
  <div 
    onClick={() => {
      if (typeof window !== 'undefined' && window.__tahaluf_trackMetricClick) {
        window.__tahaluf_trackMetricClick(label, value);
      }
      if (onClick) onClick();
    }}
    className="card-surface backdrop-blur-2xl p-4 rounded-xl border border-[#cedc28]/20 shadow-md relative overflow-hidden group hover:-translate-y-1 transition-transform cursor-pointer"
  >
    <div className="absolute top-0 right-0 w-16 h-16 bg-[#cedc28]/10 rounded-full blur-xl -mr-4 -mt-4 group-hover:bg-[#cedc28]/20 transition-colors duration-500"></div>
    <div className="flex justify-between items-start relative z-10">
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <p className="text-[9px] font-bold text-[#14a6d9] uppercase tracking-wider">{label}</p>

        </div>
        <h3 className={`text-xl font-black ${color} truncate`} title={value}>{value}</h3>
        {subContent && <div className="mt-1">{subContent}</div>}
      </div>
    </div>
  </div>
);

const DateRangeFilter = DetailedDateFilter;

const MultiSelect = ({ label, options, selected, onChange, widthClass, isHero = false, singleSelect = false, alignRight = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [optimisticSelected, setOptimisticSelected] = useState(null);
  const wrapperRef = useRef(null);
  const filtered = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  // Reset optimistic state when props update
  useEffect(() => {
    setOptimisticSelected(prev => (prev !== null ? null : prev));
  }, [selected]);

  const activeSelected = optimisticSelected || selected;
  const isAll = activeSelected.includes('All');
  const isActive = !isAll && activeSelected.length > 0;

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
    <div ref={wrapperRef} className={`relative ${widthClass || 'w-[100px] xl:w-[110px]'} shrink-0 z-30`}>
      <span className={`text-[10px] font-black uppercase tracking-widest mb-1 flex items-center justify-between ${isHero ? 'text-[#cedc28]' : 'text-[#14a6d9]'}`}>
        <span className="flex items-center gap-1">
          {isHero && <Sparkles className="w-3 h-3 text-[#cedc28]" />}
          {label}
        </span>
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#cedc28] animate-pulse"></span>}
      </span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-1.5 rounded-xl cursor-pointer flex justify-between items-center transition-all ${
          isHero
            ? isActive
              ? 'bg-[#cedc28]/20 border-2 border-[#cedc28] text-white font-black shadow-[0_0_15px_rgba(206,220,40,0.35)] hover:shadow-[0_0_20px_rgba(206,220,40,0.5)]'
              : 'bg-gradient-to-r from-[#cedc28]/15 via-[#0a2442] to-[#14a6d9]/15 border-2 border-[#cedc28]/70 text-[#eef7f5] font-bold hover:border-[#cedc28] shadow-[0_0_10px_rgba(206,220,40,0.2)]'
            : isActive
              ? 'bg-[#cedc28]/15 border border-[#cedc28] text-white font-black shadow-[0_0_10px_rgba(206,220,40,0.25)]'
              : 'surface-inset border border-[#cedc28]/30 rounded-lg text-[10px] font-bold text-[#eef7f5] hover:border-[#cedc28]'
        }`}
      >
        <span className="truncate pr-1 text-[10px] xl:text-[10.5px]">
          {isAll ? (isHero ? 'All Events' : 'All') : activeSelected.join(', ')}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${isHero || isActive ? 'text-[#cedc28]' : ''}`} />
      </div>
      {isOpen && (
        <>
          {/* Backdrop to ensure immediate dismissal when clicking outside */}
          <div className="fixed inset-0 z-40" onClick={() => { setIsOpen(false); setSearchTerm(''); }}></div>
          <div className={`absolute top-full ${alignRight ? 'right-0' : 'left-0'} min-w-[200px] w-full h-0 z-50`}>
            <div className="w-full mt-2 card-surface backdrop-blur-3xl bg-[#0a2442]/95 border border-[#cedc28]/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col max-h-64 overflow-hidden animate-in fade-in zoom-in-95 duration-70">
              <div className="p-2 border-b border-[#cedc28]/10 relative">
                <Search className="w-4 h-4 text-[#14a6d9] absolute left-4 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-black/30 text-[#eef7f5] text-[10px] font-bold pl-9 pr-3 py-2 rounded-lg outline-none border border-transparent focus:border-[#cedc28]/50" />
              </div>
              <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
                <div 
                  onClick={() => { 
                    setOptimisticSelected(['All']);
                    setIsOpen(false); 
                    setSearchTerm(''); 
                    React.startTransition(() => {
                      onChange(['All']); 
                    });
                  }} 
                  className={`px-3 py-2 rounded-lg text-[11px] font-bold cursor-pointer flex justify-between ${activeSelected.includes('All') ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}
                >
                  All <Check className={`w-3.5 h-3.5 ${activeSelected.includes('All') ? 'opacity-100' : 'opacity-0'}`} />
                </div>
                {filtered.map(opt => {
                  const isSel = activeSelected.includes(opt);
                  return (
                    <div 
                      key={opt} 
                      onClick={() => {
                        if (singleSelect) {
                          setOptimisticSelected([opt]);
                          setIsOpen(false);
                          setSearchTerm('');
                          React.startTransition(() => {
                            onChange([opt]);
                          });
                        } else {
                          let next = [...activeSelected];
                          if (next.includes('All')) next = [];
                          if (isSel) {
                            next = next.filter(n => n !== opt);
                            if (next.length === 0) next = ['All'];
                          } else { next.push(opt); }
                          setOptimisticSelected(next);
                          React.startTransition(() => {
                            onChange(next);
                          });
                        }
                      }} 
                      className={`px-3 py-2 mt-1 rounded-lg text-[11px] font-bold cursor-pointer flex justify-between ${isSel ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}
                    >
                      <span className="truncate pr-2">{opt}</span> 
                      <Check className={`w-3.5 h-3.5 flex-shrink-0 ${isSel ? 'opacity-100' : 'opacity-0'}`} />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const DataTable = ({ title, data, columns, totals, onRowClick, selectedRowId, rowKey, showBars = false, allowColumnSelect = false }) => {
  const [selectedLabels, setSelectedLabels] = useState(['All']);

  useEffect(() => {
    // If the columns change (e.g., dynamic KoG columns injected), default back to showing all
    setSelectedLabels(prev => (prev.length === 1 && prev[0] === 'All' ? prev : ['All']));
  }, [columns.length]);
  
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
    if (typeof window !== 'undefined' && window.__tahaluf_trackExportCSV) {
      window.__tahaluf_trackExportCSV();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {(title || allowColumnSelect) && (
        <div className={`flex justify-between items-end relative z-20 ${!title ? 'justify-end' : ''}`}>
          {title ? (
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-[#eef7f5] font-bold">{title}</h3>
              {data.length > 0 && (
                <span className="text-[10px] text-[#14a6d9] font-medium bg-[#14a6d9]/10 px-2 py-0.5 rounded-full border border-[#14a6d9]/20">
                  {data.length} rows
                </span>
              )}
            </div>
          ) : <div />}
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
      <div className="rounded-2xl border border-[#cedc28]/20 z-10 relative custom-scrollbar bg-[#0a2442]" style={{ overflowY: 'scroll', overflowX: 'auto', maxHeight: '550px' }}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20 bg-[#0a2442] shadow-md">
            <tr className="bg-[#0a2442] border-b border-[#cedc28]/20">
              {activeColumns.map((col, i) => (
                <th key={i} className="px-6 py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest whitespace-nowrap sticky top-0 bg-[#0a2442] z-20">{col.label}</th>
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
            {data.length === 0 && <tr><td colSpan={activeColumns.length} className="px-6 py-8 text-center text-[#14a6d9] text-[11px]">No data available</td></tr>}
          </tbody>
          {totals && data.length > 0 && (
            <tfoot className="sticky bottom-0 z-20 bg-[#071a30] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">
              <tr className="bg-[#071a30] border-t-2 border-[#cedc28]/50">
                {activeColumns.map((col, j) => (
                  <td key={j} className="px-6 py-4 text-[11px] font-bold text-[#cedc28] whitespace-nowrap relative bg-[#071a30] sticky bottom-0 z-20">
                    <span className="relative z-10">{totals[col.key] !== undefined ? (col.format ? col.format(totals[col.key], totals) : totals[col.key]) : ''}</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
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

const TrendSection = ({ title, trendData, currentTrendView, setViewFn, userRole, exSym, formatShort, userEmail = 'admin@tahaluf.com' }) => {
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
            <button 
              onClick={() => {
                setViewFn('Weekly');
                trackTrendView('Weekly', userEmail);
              }} 
              className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${currentTrendView === 'Weekly' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}
            >
              Weekly
            </button>
            <button 
              onClick={() => {
                setViewFn('Daily');
                trackTrendView('Daily', userEmail);
              }} 
              className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${currentTrendView === 'Daily' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}
            >
              Daily
            </button>
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
  const isDevBypass = process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true';
  const [isAuthenticated, setIsAuthenticated] = useState(isDevBypass);
  const [userRole, setUserRole] = useState(isDevBypass ? 'admin' : 'standard');
  const [userEmail, setUserEmail] = useState(isDevBypass ? 'admin@tahaluf.com' : '');
  const [isAuthLoading, setIsAuthLoading] = useState(!isDevBypass);
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
  const [eventsConfiguration, setEventsConfiguration] = useState([]);
  const [simulatingStandardUser, setSimulatingStandardUser] = useState(false);
  
  // State: Global Filters
  const [dateRange, setDateRange] = useState({ start: '', end: '', preset: 'auto' });
  const [filterCampaigns, setFilterCampaigns] = useState(['All']);
  const [filterMarkets, setFilterMarkets] = useState(['All']);
  const [filterChannels, setFilterChannels] = useState(['All']);
  const [filterPhases, setFilterPhases] = useState(['All']);
  const [filterPaidOrganic, setFilterPaidOrganic] = useState(['All']);
  const [filterGa4Properties, setFilterGa4Properties] = useState(['All']);
  const [filterEvents, setFilterEvents] = useState(['All']);
  const [filterEventTypes, setFilterEventTypes] = useState(['All']);
  const [filterPortfolios, setFilterPortfolios] = useState(['All']);
  const [filterBusinesses, setFilterBusinesses] = useState(['All']);
  const [filterWeeks, setFilterWeeks] = useState(['All']);
  const [localWeeklyViewWeeks, setLocalWeeklyViewWeeks] = useState(['All']);
  const [eventWeekTimelines, setEventWeekTimelines] = useState({});
  
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
    if (process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true') {
      setIsAuthenticated(true);
      setUserRole('admin');
      setIsAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsAuthenticated(true);
        setUserEmail(user.email || user.displayName || 'admin@tahaluf.com');
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

  // Telemetric user tracking: initial landing, immediate on tab view, debounced on filter adjustments
  const hasTrackedInitialOpenRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (userEmail) window.__tahaluf_user_email = userEmail;
      if (userRole) window.__tahaluf_user_role = userRole;
      window.__tahaluf_trackMetricClick = (label, val) => {
        trackMetricCardClick(label, val, userEmail);
      };
      window.__tahaluf_trackExportCSV = () => {
        trackExport('csv', activeTab, userEmail);
      };
    }
  }, [userEmail, userRole, activeTab]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!hasTrackedInitialOpenRef.current) {
      hasTrackedInitialOpenRef.current = true;
      trackDashboardOpen(userEmail, userRole, activeTab, {
        business: filterBusinesses[0] || 'All',
        events: filterEvents,
        channels: filterChannels,
        datePreset: dateRange.preset || 'auto',
      });
      return;
    }
    trackActivity({
      eventType: 'tab_view',
      userEmail,
      userRole,
      tab: activeTab,
      filters: {
        business: filterBusinesses[0] || 'All',
        events: filterEvents,
        channels: filterChannels,
        datePreset: dateRange.preset || 'auto',
      },
      immediate: true,
    });
  }, [isAuthenticated, userEmail, userRole, activeTab]);

  useEffect(() => {
    if (!isAuthenticated) return;
    trackActivity({
      eventType: 'filter_applied',
      userEmail,
      userRole,
      tab: activeTab,
      filters: {
        business: filterBusinesses[0] || 'All',
        events: filterEvents,
        channels: filterChannels,
        datePreset: dateRange.preset || 'auto',
      },
      immediate: false,
    });
  }, [filterBusinesses, filterEvents, filterChannels, dateRange]);

  const handleSignOut = async () => {
    if (process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true') {
      router.push('/login');
      return;
    }
    await signOut(auth);
    router.push('/login');
  };

  const parseRow = (row, sourceEventName = '', forcedPortfolio = null, fieldAliases = null, businessConfig = null) => {
    const rawCost = parseMetric(
      (fieldAliases?.spend && row[fieldAliases.spend] !== undefined)
        ? row[fieldAliases.spend]
        : (row['Cost'] || row['Spend'] || row['Media Spend'] || 0)
    );

    const rowDate = (fieldAliases?.date && row[fieldAliases.date] !== undefined)
      ? row[fieldAliases.date]
      : row['Date'];

    let eventNameDB = (fieldAliases?.event && row[fieldAliases.event] !== undefined)
      ? String(row[fieldAliases.event]).trim()
      : ((row['Event Name DB'] || '').trim() || sourceEventName);
    if (eventNameDB === 'SMLC') {
      eventNameDB = 'SMLC 26';
    }
    // Auto-resolve combined BIO / CPHI sheet rows when Event Name DB is empty or generic
    if (!eventNameDB || eventNameDB === 'BIO / CPHI' || eventNameDB === 'Unknown') {
      const cName = (row['Campaign Name'] || row['Campaign name'] || row['Campaign DB'] || '').toUpperCase();
      if (cName.includes('CPHI')) eventNameDB = 'CPHI 26';
      else if (cName.includes('BIO')) eventNameDB = 'BIO 26';
    }
    const eventTypeDB = (row['Event Type DB'] || '').trim();
    const channel = row['Channel'] || 'Unknown';
    // Derive portfolio: prioritize forcedPortfolio from admin config, else fallback to standard contracts
    let portfolio = forcedPortfolio || 'P1';
    if (!forcedPortfolio) {
      const upper = (eventNameDB || '').toUpperCase();
      if (upper.includes('SMLC') || upper.includes('IDWS') || upper.includes('BIO') || upper.includes('CPHI')) {
        portfolio = 'P3';
      }
    }

    // Derive Business Dimension (B2B vs B2C)
    // Rule: Default all events to B2B. For KoG 26 (or any event configured as 'derive'), extract from campaign name with fallback to B2B.
    const eventBusinessSetting = businessConfig || (eventNameDB?.toUpperCase().includes('KOG') ? 'derive' : 'B2B');
    let business = 'B2B';
    const cName = row['Campaign name'] || row['Campaign Name'] || row['Campaign DB'] || row['Campaign'] || '';
    if (eventBusinessSetting === 'derive') {
      if (/\bB2C\b/i.test(cName)) {
        business = 'B2C';
      } else if (/\bB2B\b/i.test(cName)) {
        business = 'B2B';
      } else {
        business = 'B2B'; // fallback when not available
      }
    } else if (eventBusinessSetting === 'B2C') {
      business = 'B2C';
    } else {
      business = 'B2B';
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
      date: rowDate,
      dateObj: rowDate ? new Date(rowDate) : null,
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
      portfolio: portfolio,
      business: business
    };
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchCsvSafe = (url) => d3.csv(url).catch(err => {
      console.warn("Could not load sheet:", url, err);
      return [];
    });

    const parsePlannedRows = (rawData, eventName) => {
      return rawData.filter(r => r.Channel && r.Channel.trim() !== '').map(r => {
        let pChannel = r.Channel.toLowerCase();
        let normalizedChannel = 'Unknown';
        if (pChannel.includes('meta') || pChannel.includes('fb') || pChannel.includes('ig')) normalizedChannel = 'Meta';
        else if (pChannel.includes('linkedin')) normalizedChannel = 'LinkedIn';
        else if (pChannel.includes('demand gen') || pChannel.includes('pmax')) normalizedChannel = 'Google Ads';
        else if (pChannel.includes('google') || pChannel.includes('youtube')) normalizedChannel = 'Google';
        else if (pChannel.includes('tiktok')) normalizedChannel = 'TikTok';
        else if (pChannel.includes('snapchat')) normalizedChannel = 'Snapchat';
        else if (pChannel.includes('dv360')) normalizedChannel = 'DV360';
        else if (pChannel.includes('amazon')) normalizedChannel = 'Amazon';
        else if (pChannel === 'x' || pChannel.includes('twitter')) normalizedChannel = 'X';
        else normalizedChannel = r.Channel.trim();

        let phaseRaw = r['Funnel Stage'] ? r['Funnel Stage'].trim() : '';
        let normalizedPhase = phaseRaw;
        if (phaseRaw.toLowerCase() === 'consideration') normalizedPhase = 'Traffic';
        else if (phaseRaw.toLowerCase() === 'conversion') normalizedPhase = 'Conversions';
        else if (phaseRaw.toLowerCase().startsWith('boost')) normalizedPhase = 'Boosting';

        return {
          event: eventName,
          channel: normalizedChannel,
          phase: normalizedPhase,
          plannedBudget: parseMetric(r['Planned Budget']),
          plannedViews: parseMetric(r['Planned Views']),
          plannedClicks: parseMetric(r['Planned Clicks']),
          plannedConversions: parseMetric(r['Planned Conversions'])
        };
      });
    };

    const parseBlackHatPlanned = (text) => {
      if (!text) return [];
      const rows = d3.csvParseRows(text);
      const COL = 27; // AB
      const out = [];
      let section = null;
      rows.forEach(r => {
        const c0 = (r[COL] || '').trim();
        const c1 = (r[COL + 1] || '').trim();
        const c2 = (r[COL + 2] || '').trim();
        if (/^exprom$/i.test(c0)) { section = 'Exprom'; return; }
        if (/^visprom$/i.test(c0)) { section = 'Visprom'; return; }
        if (!section || !c0 || c0.toLowerCase() === 'channel' || /^total/i.test(c0)) return;
        out.push({ Channel: c0, 'Funnel Stage': c1, 'Planned Budget': c2, __eventType: section });
      });
      return out;
    };

    const loadDashboardData = async () => {
      // 1. Fetch dynamic event configurations from Admin API
      let configuredEvents = [];
      try {
        const eventsRes = await fetch('/api/admin/events');
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          if (eventsData.config && Array.isArray(eventsData.config.events)) {
            configuredEvents = eventsData.config.events;
          }
        }
      } catch (e) {
        console.warn('Could not load dynamic events config from API, using fallback:', e);
      }

      // Fallback defaults
      if (!configuredEvents || configuredEvents.length === 0) {
        configuredEvents = [
          { id: 'gsts-26', name: 'GSTS 26', sourceName: 'GSTS', portfolio: 'P1', business: 'B2B', enabled: true, gid: '', plannedGid: '2019892532', launchDate: '2026-12-18' },
          { id: 'saif-26', name: 'SAIF 26', sourceName: 'SAIF 26', portfolio: 'P1', business: 'B2B', enabled: true, gid: '1196409184', plannedGid: '570639072', launchDate: '2026-11-24' },
          { id: 'kog-26', name: 'KoG 26', sourceName: 'KoG 26', portfolio: 'P1', business: 'derive', enabled: true, gid: '1486784585', plannedGid: '1766297835', launchDate: '2026-12-01' },
          { id: 'black-hat', name: 'Black Hat', sourceName: 'BLACK HAT', portfolio: 'P1', business: 'B2B', enabled: true, gid: '659941332', plannedGid: '277310277', plannedType: 'blackhat-text', launchDate: '2026-12-01' },
          { id: 'smlc-26', name: 'SMLC 26', sourceName: 'SMLC 26', portfolio: 'P3', business: 'B2B', enabled: true, gid: '1526538255', launchDate: '2026-10-21' },
          { id: 'idws-26', name: 'IDWS 26', sourceName: 'IDWS 26', portfolio: 'P3', business: 'B2B', enabled: true, gid: '1121987876', startDate: '2026-06-01', launchDate: '2026-12-14' },
          { id: 'bio-cphi-main', name: 'BIO 26 & CPHI 26', sourceName: 'BIO / CPHI', portfolio: 'P3', business: 'B2B', enabled: true, gid: '1728688512', dateFilterMode: 'year-2026', launchDate: '2026-12-14' },
          { id: 'cphi-li', name: 'CPHI 26 (LinkedIn)', sourceName: 'CPHI 26', portfolio: 'P3', business: 'B2B', enabled: true, gid: '208497314', dateFilterMode: 'year-2026', launchDate: '2026-12-14' }
        ];
      }

      setEventsConfiguration(configuredEvents);

      const effectiveRole = (userRole === 'admin' && !simulatingStandardUser) ? 'admin' : 'standard';

      // Filter for active events based on effectiveRole & auto-publish:
      // - 'active' (public): visible to all users
      // - 'admin_only' (testing): visible ONLY if effectiveRole === 'admin'
      // - 'autoPublishDate': if reached, promotes event to public active automatically
      const activeEvents = configuredEvents.filter(ev => {
        if (ev.enabled === false || ev.status === 'inactive') return false;

        const isAutoPublished = ev.autoPublishDate && new Date(ev.autoPublishDate) <= new Date();
        const effectiveStatus = isAutoPublished ? 'active' : ev.status;
        const effectiveVisibility = isAutoPublished ? 'public' : ev.visibility;

        if (effectiveVisibility === 'admin_only' || effectiveStatus === 'admin_only') {
          return effectiveRole === 'admin';
        }
        return true;
      });

      // Fetch actuals for active events
      const actualsPromises = activeEvents.map(ev => {
        const url = BASE_URL + (ev.gid ? `&gid=${ev.gid}` : '');
        return fetchCsvSafe(url).then(rawRows => {
          let rows = rawRows;
          if (ev.startDate) {
            rows = rows.filter(r => r.Date && r.Date >= ev.startDate);
          }
          if (ev.endDate) {
            rows = rows.filter(r => r.Date && r.Date <= ev.endDate);
          }
          if (ev.dateFilterMode === 'year-2026') {
            rows = rows.filter(r => !r.Date || r.Date.startsWith('2026'));
          }
          return rows.map(r => parseRow(r, ev.sourceName || ev.name, ev.portfolio, ev.fieldAliases, ev.business));
        });
      });

      // Fetch planned data for active events
      const plannedPromises = activeEvents
        .filter(ev => ev.plannedGid)
        .map(ev => {
          const url = BASE_URL + `&gid=${ev.plannedGid}`;
          if (ev.plannedType === 'blackhat-text' || ev.id === 'black-hat') {
            return d3.text(url).catch(() => '').then(text => {
              const bhRows = parseBlackHatPlanned(text);
              return parsePlannedRows(bhRows, 'Black Hat').map((p, i) => ({
                ...p,
                eventType: bhRows.filter(r => r.Channel && r.Channel.trim() !== '')[i]?.__eventType || 'Exhibition'
              }));
            });
          } else {
            return fetchCsvSafe(url).then(rows => parsePlannedRows(rows, ev.name));
          }
        });

      const [allActualsArrays, allPlannedArrays] = await Promise.all([
        Promise.all(actualsPromises),
        Promise.all(plannedPromises)
      ]);

      const combinedAds = allActualsArrays.flat();
      const parsedPlannedData = allPlannedArrays.flat();

      // Dynamic Week DB Countdown Calculation
      const eventStartDates = {
        'GSTS': new Date(Date.UTC(2026, 11, 18)),
        'SAIF 26': new Date(Date.UTC(2026, 10, 24)),
        'KoG 26': new Date(Date.UTC(2026, 11, 1)),
        'BLACK HAT': new Date(Date.UTC(2026, 11, 1)),
        'SMLC 26': new Date(Date.UTC(2026, 9, 21)),
        'SMLC': new Date(Date.UTC(2026, 9, 21)),
        'IDWS 26': new Date(Date.UTC(2026, 11, 14)),
        'IDWS': new Date(Date.UTC(2026, 11, 14)),
        'BIO 26': new Date(Date.UTC(2026, 11, 14)),
        'BIO': new Date(Date.UTC(2026, 11, 14)),
        'CPHI 26': new Date(Date.UTC(2026, 11, 14)),
        'CPHI': new Date(Date.UTC(2026, 11, 14))
      };

      activeEvents.forEach(ev => {
        if (ev.launchDate) {
          const parts = ev.launchDate.split('-').map(Number);
          if (parts.length === 3) {
            const lDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
            eventStartDates[ev.name] = lDate;
            if (ev.sourceName) eventStartDates[ev.sourceName] = lDate;
          }
        }
      });

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

      combinedAds.forEach(d => {
        if (!d.dateObj) return;
        const ev = (d.eventNameDB || '').toUpperCase();
        const campStart = firstImps[ev];
        const eventEntry = Object.entries(eventStartDates).find(([k]) => ev.includes(k.toUpperCase()));
        const eventStart = eventEntry?.[1];
        
        if (campStart && eventStart) {
           const dUTC = new Date(Date.UTC(d.dateObj.getFullYear(), d.dateObj.getMonth(), d.dateObj.getDate()));
           const rowWeekIdx = getWeekIndex(dUTC, campStart);
           const totalWeeks = getWeekIndex(eventStart, campStart);
           const countdown = Math.max(0, totalWeeks - rowWeekIdx);
           const yearSuffix = (eventStart.getUTCFullYear() % 100);
           d.weekDB = `W${countdown} '${yearSuffix}`;
        } else if (d.weekDB && /^W\d+$/i.test(d.weekDB)) {
           const yr = d.dateObj ? (d.dateObj.getFullYear() % 100) : 26;
           d.weekDB = `${d.weekDB} '${yr}`;
        }
      });

      // Build complete client week timelines (countdown W{total} to current week) for all known events
      // Starting strictly from the first impression date and stopping at the current week (no upcoming weeks)
      const timelines = {};
      const allKnownEventNames = Array.from(new Set([
        ...Object.keys(eventStartDates),
        ...Object.keys(firstImps),
        ...activeEvents.map(e => e.name),
        ...combinedAds.map(d => d.eventNameDB).filter(Boolean)
      ]));

      const allDates = combinedAds
        .map(d => d.dateObj)
        .filter(d => d instanceof Date && !isNaN(d));
      const latestDataDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date();
      const now = new Date();
      const currentAnchor = latestDataDate > now ? latestDataDate : now;

      allKnownEventNames.forEach(evName => {
        const evUpper = evName.toUpperCase();
        const campStart = firstImps[evUpper] || Object.entries(firstImps).find(([k]) => evUpper.includes(k.toUpperCase()))?.[1];
        const eventEntry = Object.entries(eventStartDates).find(([k]) => evUpper.includes(k.toUpperCase()));
        const eventStart = eventEntry?.[1];

        if (campStart && eventStart) {
          const tl = generateEventWeekTimeline(campStart, eventStart, currentAnchor);
          if (tl && tl.length > 0) {
            timelines[evName] = tl;
            timelines[evUpper] = tl;
          }
        }
      });

      setEventWeekTimelines(timelines);

      setAdData(combinedAds);
      setGaData([]);
      setCreativeData(combinedAds);
      setPlannedData(parsedPlannedData);
      
      if (allDates.length > 0) {
        setLastUpdated(latestDataDate);
      } else {
        setLastUpdated(new Date());
      }
      setLoading(false);
    };

    loadDashboardData().catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [isAuthenticated, userRole, simulatingStandardUser]);

  

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
    setFilterBusinesses(['All']);
    setFilterWeeks(['All']);
    setSelectedEvent(null);
    setDateRange({ start: '', end: '', preset: 'auto' });
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
  const uniqueBusinesses = useMemo(() => {
    const vals = Array.from(new Set(adData.map(d => d.business))).filter(Boolean).sort();
    return vals.length ? vals : ['B2B', 'B2C'];
  }, [adData]);
  const eventsData = useMemo(() => filterPortfolios.includes('All') ? adData : adData.filter(d => filterPortfolios.includes(d.portfolio)), [adData, filterPortfolios]);
  const uniqueEvents = useMemo(() => Array.from(new Set(eventsData.map(d => d.eventNameDB))).filter(e => e && e !== 'Unknown').sort(), [eventsData]);
  const eventTypesData = useMemo(() => filterEvents.includes('All') ? eventsData : eventsData.filter(d => filterEvents.includes(d.eventNameDB)), [eventsData, filterEvents]);
  const uniqueEventTypes = useMemo(() => Array.from(new Set(eventTypesData.map(d => d.eventTypeDB))).filter(e => e && e !== 'Unknown').sort(), [eventTypesData]);

  const eventPortfolioMap = useMemo(() => {
    const map = {};
    for (let i = 0; i < adData.length; i++) {
      const ev = adData[i].eventNameDB;
      if (ev && !map[ev]) {
        map[ev] = adData[i].portfolio;
      }
    }
    return map;
  }, [adData]);

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
    const fromAds = adData.map(d => d.weekDB);
    const fromTimelines = Object.values(eventWeekTimelines).flat().map(t => t.week);
    const weeks = Array.from(new Set([...fromAds, ...fromTimelines])).filter(w => w && w !== 'Unknown');
    // Sort weeks numerically in countdown order (e.g. W12, W11 ... W0)
    return weeks.sort((a, b) => {
      const numA = parseInt(a.match(/^W(\d+)/i)?.[1] || a.replace(/[^\d-]/g, '') || '0', 10);
      const numB = parseInt(b.match(/^W(\d+)/i)?.[1] || b.replace(/[^\d-]/g, '') || '0', 10);
      return numB - numA;
    });
  }, [adData, eventWeekTimelines]);

  // Apply filters to Ad Data - Optimized with pre-computed Sets for instant O(1) filtering
  const filteredAdData = useMemo(() => {
    const hasCampaignFilter = !filterCampaigns.includes('All');
    const campaignSet = hasCampaignFilter ? new Set(filterCampaigns) : null;
    
    const hasMarketFilter = !filterMarkets.includes('All');
    const marketSet = hasMarketFilter ? new Set(filterMarkets) : null;
    
    const hasChannelFilter = !filterChannels.includes('All');
    const channelSet = hasChannelFilter ? new Set(filterChannels) : null;
    
    const hasPhaseFilter = !filterPhases.includes('All');
    const phaseSet = hasPhaseFilter ? new Set(filterPhases) : null;
    
    const hasEventFilter = !filterEvents.includes('All');
    const eventSet = hasEventFilter ? new Set(filterEvents) : null;
    
    const hasPortfolioFilter = !filterPortfolios.includes('All');
    const portfolioSet = hasPortfolioFilter ? new Set(filterPortfolios) : null;
    
    const hasBusinessFilter = !filterBusinesses.includes('All');
    const businessSet = hasBusinessFilter ? new Set(filterBusinesses) : null;
    
    const hasEventTypeFilter = !filterEventTypes.includes('All');
    const eventTypeSet = hasEventTypeFilter ? new Set(filterEventTypes) : null;
    
    const hasWeekFilter = !filterWeeks.includes('All');
    const weekSet = hasWeekFilter ? new Set(filterWeeks) : null;
    
    const startBound = dateRange.start ? (isNaN(new Date(dateRange.start + 'T00:00:00').getTime()) ? new Date(dateRange.start) : new Date(dateRange.start + 'T00:00:00')) : null;
    const endBound = dateRange.end ? (isNaN(new Date(dateRange.end + 'T23:59:59.999').getTime()) ? new Date(dateRange.end) : new Date(dateRange.end + 'T23:59:59.999')) : null;

    return adData.filter(d => {
      if (hasCampaignFilter && !campaignSet.has(d.campaignName)) return false;
      if (hasMarketFilter && !marketSet.has(d.country)) return false;
      if (hasChannelFilter && !channelSet.has(d.channel)) return false;
      if (hasPhaseFilter && !phaseSet.has(d.phase)) return false;
      if (hasEventFilter && !eventSet.has(d.eventNameDB)) return false;
      if (hasPortfolioFilter && !portfolioSet.has(d.portfolio)) return false;
      if (hasBusinessFilter && !businessSet.has(d.business)) return false;
      if (hasEventTypeFilter && !eventTypeSet.has(d.eventTypeDB)) return false;
      if (hasWeekFilter && !weekSet.has(d.weekDB)) return false;
      if (startBound && d.dateObj && d.dateObj < startBound) return false;
      if (endBound && d.dateObj && d.dateObj > endBound) return false;
      return true;
    });
  }, [adData, filterCampaigns, filterMarkets, filterChannels, filterPhases, filterEvents, filterPortfolios, filterBusinesses, filterEventTypes, filterWeeks, dateRange]);

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
      if (dateRange.start && d.dateObj) {
        const startBound = new Date(dateRange.start + 'T00:00:00');
        if (d.dateObj < (isNaN(startBound.getTime()) ? new Date(dateRange.start) : startBound)) return false;
      }
      if (dateRange.end && d.dateObj) {
        const endBound = new Date(dateRange.end + 'T23:59:59.999');
        if (d.dateObj > (isNaN(endBound.getTime()) ? new Date(dateRange.end) : endBound)) return false;
      }
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
    { id: 'market', label: 'Market View', icon: MapIcon },
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

  // Planned data scoped by Event Type master filter (rows with an eventType, e.g. Black Hat Exprom/Visprom,
  // are kept only when their type is selected; with no filter, both types are summed).
  const PLANNED_EVENTS = ['KoG 26', 'SAIF 26', 'GSTS 26', 'Black Hat'];
  const scopedPlannedData = filterEventTypes.includes('All')
    ? plannedData
    : plannedData.filter(p => !p.eventType || filterEventTypes.includes(p.eventType));

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
          trackExport('pptx', activeTab, userEmail);
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
        
        let row = { [keyName]: key || 'Unknown', spend, impressions, clicks, ctr, cpm, cpc, cpa, cvr, purchases };
        
        const activePlannedEvent = (filterEvents.length === 1 && PLANNED_EVENTS.includes(filterEvents[0])) ? filterEvents[0] : (PLANNED_EVENTS.includes(selectedEvent) ? selectedEvent : null);
        if (scopedPlannedData.length > 0) {
             let pBudget = 0;
             if (keyName === 'eventName') {
                 const pData = scopedPlannedData.filter(p => p.event === key);
                 pBudget = d3.sum(pData, p => p.plannedBudget);
             } else if (activePlannedEvent) {
                 if (keyName === 'channel') {
                     const pData = scopedPlannedData.filter(p => p.channel === key && p.event === activePlannedEvent);
                     pBudget = d3.sum(pData, p => p.plannedBudget);
                 } else if (keyName === 'phase') {
                     const pData = scopedPlannedData.filter(p => p.phase === key && p.event === activePlannedEvent);
                     pBudget = d3.sum(pData, p => p.plannedBudget);
                 }
             }
             if(pBudget > 0) {
               const convertedBudget = pBudget * exRate;
               row.plannedBudget = convertedBudget;
               row.budgetSpentPct = convertedBudget > 0 ? (spend / convertedBudget) * 100 : 0;
             }
          }
        return row;
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
        
        let totals = { spend, impressions, clicks, ctr, cpm, cpc, cpa, cvr, purchases };
        
        const activePlannedEvent = (filterEvents.length === 1 && PLANNED_EVENTS.includes(filterEvents[0])) ? filterEvents[0] : (PLANNED_EVENTS.includes(selectedEvent) ? selectedEvent : null);
        if (scopedPlannedData.length > 0) {
           let pData = scopedPlannedData;
           if (activePlannedEvent) {
               pData = scopedPlannedData.filter(p => p.event === activePlannedEvent);
           }
           const pBudget = d3.sum(pData, p => p.plannedBudget);
           if (pBudget > 0) {
             const convertedBudget = pBudget * exRate;
             totals.plannedBudget = convertedBudget;
             totals.budgetSpentPct = convertedBudget > 0 ? (spend / convertedBudget) * 100 : 0;
           }
        }
        return totals;
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
        const results = grouped.map(([key, vals]) => {
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
        });

        if (currentTrendView === 'Weekly') {
          const evContext = selectedEvent || (keyField === 'eventNameDB' ? selection : null);
          const evUpper = (evContext || '').toUpperCase();
          const tl = (evContext && eventWeekTimelines[evContext])
            || (evUpper && eventWeekTimelines[evUpper])
            || Object.entries(eventWeekTimelines).find(([k]) => evUpper && evUpper.includes(k.toUpperCase()))?.[1];

          const targetWeeks = (allowedWeeks && !allowedWeeks.includes('All'))
            ? allowedWeeks
            : (tl ? tl.map(t => t.week) : null);

          if (targetWeeks && targetWeeks.length > 0) {
            const existingKeys = new Set(results.map(r => r.key));
            targetWeeks.forEach(wKey => {
              if (!existingKeys.has(wKey)) {
                results.push({
                  key: wKey,
                  spend: 0,
                  impressions: 0,
                  clicks: 0,
                  purchases: 0,
                  ctr: 0,
                  cpm: 0,
                  cpc: 0,
                  cpa: 0,
                  cvr: 0
                });
              }
            });
          }
        }

        return results.sort((a, b) => {
          if (currentTrendView === 'Daily') return new Date(a.key) - new Date(b.key);
          const numA = parseInt(a.key.replace(/[^\d-]/g, ''), 10) || 0;
          const numB = parseInt(b.key.replace(/[^\d-]/g, ''), 10) || 0;
          return numB - numA; // Sort descending so W12 is on left, W0 is on right
        });
      };

      const createColumns = (key, label) => {
        const activePlannedEvent = (filterEvents.length === 1 && PLANNED_EVENTS.includes(filterEvents[0])) ? filterEvents[0] : (PLANNED_EVENTS.includes(selectedEvent) ? selectedEvent : null);
        const showPlanned = key === 'eventName' || (activePlannedEvent && key !== 'market');
          let cols = [
            { key: key, label: label },
            ...(userRole !== 'non-finance' ? [{
               key: 'spend',
               label: 'Delivered Budget',
               format: (v, row) => {
                  if (showPlanned && row && row.plannedBudget > 0) {
                     return (
                        <div className="flex flex-col">
                           <span>{`${exSym}${d3.format(",.0f")(v)}`}</span>
                           <span className="text-[10px] text-[#cedc28] mt-0.5 font-bold">{`${exSym}${d3.format(",.0f")(row.plannedBudget)}`} ({row.budgetSpentPct.toFixed(1)}%)</span>
                        </div>
                     );
                  }
                  return `${exSym}${d3.format(",.0f")(v)}`;
               }
            }] : [])
          ];

        cols.push(
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
        );
        return cols;
      };

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
        'KoG 26': {
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
             const mappingKey = Object.keys(MARKET_MAPPING).find(k => activeEventContext.toUpperCase().includes(k.toUpperCase()));
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
              <MetricCard 
                definition="The total amount of money spent on advertising campaigns across all channels." 
                label="Delivered Budget" 
                value={`${exSym}${formatShort(agg.cost * exRate)}`} 
                color="text-white" 
                icon={DollarSign} 
                
              />
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
            
            {selectedEvent && <TrendSection title={selectedEvent} trendData={getTrendDataForSelection(selectedEvent, 'eventNameDB', trendView)} currentTrendView={trendView} setViewFn={setTrendView} userRole={userRole} exSym={exSym} formatShort={formatShort} userEmail={userEmail} />}
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
            {selectedPhase && <TrendSection title={selectedPhase} trendData={getTrendDataForSelection(selectedPhase, 'phase', phaseTrendView)} currentTrendView={phaseTrendView} setViewFn={setPhaseTrendView} userRole={userRole} exSym={exSym} formatShort={formatShort} userEmail={userEmail} />}
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
            {selectedChannel && <TrendSection title={selectedChannel} trendData={getTrendDataForSelection(selectedChannel, 'channel', channelTrendView)} currentTrendView={channelTrendView} setViewFn={setChannelTrendView} userRole={userRole} exSym={exSym} formatShort={formatShort} userEmail={userEmail} />}
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
            {selectedMarket && <TrendSection title={selectedMarket} trendData={getTrendDataForSelection(selectedMarket, 'country', marketTrendView)} currentTrendView={marketTrendView} setViewFn={setMarketTrendView} userRole={userRole} exSym={exSym} formatShort={formatShort} userEmail={userEmail} />}
          </div>

        </div>
      );
    }

    if (activeTab === 'weekly') {
      const activeEventContext = selectedEvent || (filterEvents.length === 1 && !filterEvents.includes('All') ? filterEvents[0] : null);

      if (!activeEventContext) {
         return (
           <div className="flex flex-col items-center justify-center min-h-[60vh] py-10 text-center w-full max-w-5xl mx-auto px-4">
             <div className="p-4 rounded-3xl bg-[#cedc28]/10 border border-[#cedc28]/30 mb-5 shadow-[0_0_30px_rgba(206,220,40,0.15)]">
               <Calendar className="w-12 h-12 text-[#cedc28]" />
             </div>
             <h2 className="text-3xl sm:text-4xl font-anton uppercase text-white tracking-wide mb-2">
               Select an Event to Unlock Weekly Breakdown &amp; Trends
             </h2>
             <p className="text-[#eef7f5]/70 max-w-2xl text-sm mb-8">
               Select an event from the hero filter in the top bar, or click any event card below to immediately load its full countdown timeline (<span className="text-[#cedc28] font-bold">W20 → W0</span>), weekly delivery metrics, and trend analysis.
             </p>

             <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
               {uniqueEvents.map(evName => {
                 const evTimeline = eventWeekTimelines[evName] || eventWeekTimelines[evName.toUpperCase()] || [];
                 const maxWeek = evTimeline[0]?.week || 'Dynamic';
                 const portfolio = eventPortfolioMap[evName] || 'P1';

                 return (
                   <button
                     key={evName}
                     type="button"
                     onClick={() => {
                       React.startTransition(() => {
                         setFilterEvents([evName]);
                         setSelectedEvent(evName);
                       });
                     }}
                     className="group text-left p-5 rounded-2xl bg-[#0a2442]/80 hover:bg-[#0a2442] border border-[#cedc28]/30 hover:border-[#cedc28] shadow-lg hover:shadow-[0_0_25px_rgba(206,220,40,0.25)] transition-all transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
                   >
                     <div>
                       <div className="flex items-center justify-between mb-3">
                         <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#14a6d9]/20 text-[#14a6d9] border border-[#14a6d9]/30">
                           {portfolio}
                         </span>
                         <span className="text-[10px] font-bold text-gray-400 group-hover:text-[#cedc28] transition-colors">
                           {maxWeek} → W0
                         </span>
                       </div>
                       <h3 className="text-lg font-black text-white group-hover:text-[#cedc28] transition-colors truncate">
                         {evName}
                       </h3>
                     </div>
                     <div className="mt-4 pt-3 border-t border-[#cedc28]/10 flex items-center justify-between text-xs text-[#14a6d9] font-bold group-hover:text-[#cedc28]">
                       <span>View Timeline</span>
                       <span className="transition-transform group-hover:translate-x-1">→</span>
                     </div>
                   </button>
                 );
               })}
             </div>
           </div>
         );
      }

      let baseWeeklyData = filteredAdData.filter(d => d.eventNameDB === activeEventContext);
      
      const fullTimeline = (activeEventContext && eventWeekTimelines[activeEventContext]) 
        || (activeEventContext && eventWeekTimelines[activeEventContext.toUpperCase()])
        || Object.entries(eventWeekTimelines).find(([k]) => activeEventContext && activeEventContext.toUpperCase().includes(k.toUpperCase()))?.[1]
        || [];

      const timelineWeekStrings = fullTimeline.map(t => t.week);

      const eventUniqueWeeks = timelineWeekStrings.length > 0
        ? timelineWeekStrings
        : Array.from(new Set(baseWeeklyData.map(d => d.weekDB))).filter(Boolean).sort((a, b) => {
            const numA = parseInt(a.match(/^W(\d+)/i)?.[1] || a.replace(/[^\d-]/g, '') || '0', 10);
            const numB = parseInt(b.match(/^W(\d+)/i)?.[1] || b.replace(/[^\d-]/g, '') || '0', 10);
            return numB - numA;
        });

      let subTableAdData = baseWeeklyData;
      if (!localWeeklyViewWeeks.includes('All')) {
          subTableAdData = subTableAdData.filter(d => localWeeklyViewWeeks.includes(d.weekDB));
      }

      const getWeekDateRange = (weekStr) => {
         const tEntry = fullTimeline.find(t => t.week === weekStr);
         if (tEntry && tEntry.dateRange) return tEntry.dateRange;

         const weekData = baseWeeklyData.filter(d => d.weekDB === weekStr);
         if (weekData.length === 0) return '';
         const dates = weekData.map(d => new Date(d.date)).filter(d => !isNaN(d));
         if (dates.length === 0) return '';
         const minDate = new Date(Math.min(...dates));
         const maxDate = new Date(Math.max(...dates));
         
         const monthMin = minDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
         const dayMin = minDate.getUTCDate();
         const yearMin = minDate.getUTCFullYear();
         
         const monthMax = maxDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
         const dayMax = maxDate.getUTCDate();
         const yearMax = maxDate.getUTCFullYear();
         
         if (yearMin === yearMax) {
             if (monthMin === monthMax) {
                 return `${monthMin} ${dayMin}-${dayMax}, ${yearMax}`;
             }
             return `${monthMin} ${dayMin} - ${monthMax} ${dayMax}, ${yearMax}`;
         }
         return `${monthMin} ${dayMin}, ${yearMin} - ${monthMax} ${dayMax}, ${yearMax}`;
      };

      const existingMetrics = getMetricsData(subTableAdData, d => d.weekDB, 'week');
      const metricsMap = new Map(existingMetrics.map(r => [r.week, r]));
      const targetWeeks = localWeeklyViewWeeks.includes('All') ? eventUniqueWeeks : localWeeklyViewWeeks;

      const weeklyMetricsData = targetWeeks.map(weekStr => {
        if (metricsMap.has(weekStr)) {
          const row = { ...metricsMap.get(weekStr) };
          row.dateRange = getWeekDateRange(weekStr);
          return row;
        }
        return {
          week: weekStr,
          dateRange: getWeekDateRange(weekStr),
          spend: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          cpm: 0,
          cpc: 0,
          cpa: 0,
          cvr: 0,
          purchases: 0
        };
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
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-3xl font-anton uppercase text-white flex items-center gap-2">
                <Calendar className="text-[#cedc28]" /> Weekly View:
              </h2>
              {/* Event Switcher with exact same size & hero styling as main top filter */}
              <MultiSelect 
                label="Event" 
                options={uniqueEvents} 
                selected={activeEventContext ? [activeEventContext] : []} 
                onChange={(next) => {
                  const ev = next[0];
                  if (ev && ev !== 'All') {
                    React.startTransition(() => {
                      setSelectedEvent(ev);
                      setFilterEvents([ev]);
                    });
                  }
                }} 
                isHero={true} 
                widthClass="w-[155px] xl:w-[185px]" 
                singleSelect={true} 
              />
            </div>
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
      const activeEventContext = selectedEvent || (filterEvents.length === 1 && !filterEvents.includes('All') ? filterEvents[0] : null);
      const isMultiEventComparison = filterEvents.length > 1 && !filterEvents.includes('All');

      if (!activeEventContext && !isMultiEventComparison) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] py-10 text-center w-full max-w-5xl mx-auto px-4">
            <div className="p-4 rounded-3xl bg-[#cedc28]/10 border border-[#cedc28]/30 mb-5 shadow-[0_0_30px_rgba(206,220,40,0.15)]">
              <Activity className="w-12 h-12 text-[#cedc28]" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-anton uppercase text-white tracking-wide mb-2">
              Select an Event to Unlock Event Breakdown &amp; Analysis
            </h2>
            <p className="text-[#eef7f5]/70 max-w-2xl text-sm mb-6">
              Select an event from the hero filter in the top bar, or click any event card below to immediately load its full campaign performance, phase pacing, channels, and delivery metrics.
            </p>

            <div className="flex items-center justify-center gap-3 mb-8">
              <button
                type="button"
                onClick={() => {
                  React.startTransition(() => {
                    setFilterEvents(uniqueEvents);
                    setSelectedEvent(null);
                  });
                }}
                className="px-4 py-2 rounded-xl bg-[#cedc28]/15 hover:bg-[#cedc28] border border-[#cedc28]/30 hover:border-[#cedc28] text-[#cedc28] hover:text-[#1a302e] font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Compare All Events (Relative Timeline) →</span>
              </button>
            </div>

            <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {uniqueEvents.map(evName => {
                const portfolio = eventPortfolioMap[evName] || 'P1';

                return (
                  <button
                    key={evName}
                    type="button"
                    onClick={() => {
                      React.startTransition(() => {
                        setFilterEvents([evName]);
                        setSelectedEvent(evName);
                      });
                    }}
                    className="group text-left p-5 rounded-2xl bg-[#0a2442]/80 hover:bg-[#0a2442] border border-[#cedc28]/30 hover:border-[#cedc28] shadow-lg hover:shadow-[0_0_25px_rgba(206,220,40,0.25)] transition-all transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#14a6d9]/20 text-[#14a6d9] border border-[#14a6d9]/30">
                          {portfolio}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 group-hover:text-[#cedc28] transition-colors">
                          Event View
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-white group-hover:text-[#cedc28] transition-colors truncate">
                        {evName}
                      </h3>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[#cedc28]/10 flex items-center justify-between text-xs text-[#14a6d9] font-bold group-hover:text-[#cedc28]">
                      <span>View Event</span>
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      const activeAdData = activeEventContext ? filteredAdData.filter(d => d.eventNameDB === activeEventContext) : filteredAdData;
      const effectiveFilterEvents = activeEventContext ? [activeEventContext] : filterEvents;

      return (
        <div className="space-y-6 w-full">
          {/* Event Header with In-View Event Switcher & Filter */}
          <div className="flex justify-between items-center card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#cedc28]/20 shadow-xl mb-4 relative z-30" style={{ overflow: 'visible' }}>
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-3xl font-anton uppercase text-white flex items-center gap-2">
                <Activity className="text-[#cedc28]" /> Event View:
              </h2>
              {/* Event Switcher with exact same size & hero styling as main top filter */}
              <MultiSelect 
                label="Event" 
                options={uniqueEvents} 
                selected={activeEventContext ? [activeEventContext] : (filterEvents.includes('All') ? ['All'] : filterEvents)} 
                onChange={(next) => {
                  React.startTransition(() => {
                    if (next.includes('All') || next.length === 0) {
                      setFilterEvents(['All']);
                      setSelectedEvent(null);
                    } else if (next.length === 1) {
                      setFilterEvents(next);
                      setSelectedEvent(next[0]);
                    } else {
                      setFilterEvents(next);
                      setSelectedEvent(null);
                    }
                  });
                }} 
                isHero={true} 
                widthClass="w-[165px] xl:w-[200px]" 
                singleSelect={false} 
              />
            </div>
            {isMultiEventComparison && (
              <div className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[#14a6d9]/15 border border-[#14a6d9]/30 text-[#14a6d9] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                <span>Comparing {filterEvents.length} Events (Relative Timeline)</span>
              </div>
            )}
          </div>

          <CampaignView 
            adData={activeAdData} 
            plannedData={[]} 
            exRate={exRate} 
            exSym={exSym} 
            formatShort={formatShort} 
            userRole={userRole} 
            filterMarkets={filterMarkets} 
            filterEvents={effectiveFilterEvents} 
            onSelectEvent={(evName) => {
              React.startTransition(() => {
                setFilterEvents([evName]);
                setSelectedEvent(evName);
              });
            }}
          />
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
      return (
        <div className="w-full h-full">
          <CreativeView data={filteredAdData} exRate={exRate} exSym={exSym} formatShort={formatShort} userRole={userRole} />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-screen overflow-hidden app-bg font-sans selection:bg-[#cedc28]/30 text-white flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#0a2442]/95 backdrop-blur-xl border-b border-[#cedc28]/20 px-0 py-2.5 shadow-2xl relative">
        <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none"></div>
        <div className="flex items-center relative z-10 w-full">
          {/* LEFT: Logo - Exactly matches sidebar width w-52 (208px) with border-r continuing the sidebar border line */}
          <div className="w-52 pl-6 pr-4 flex items-center justify-between shrink-0 border-r border-[#cedc28]/15">
            <div className="flex flex-col items-start gap-0.5">
              <img src="/tahaluf-logo.svg" alt="Tahaluf Logo" className="h-7 object-contain" onError={(e) => e.target.style.display = 'none'} />
              <p className="text-[8.5px] font-bold text-[#cedc28] uppercase tracking-[0.08em] whitespace-nowrap">Performance Dashboard</p>
            </div>
          </div>

          {/* FILTERS + ACTIONS: pl-8 (32px) perfectly aligns the first filter (DATE) with the table & cards in <main> below */}
          <div className="pl-8 pr-6 flex gap-1.5 xl:gap-2 flex-nowrap items-end flex-1 overflow-x-auto xl:overflow-visible">
            <DateRangeFilter label="DATE" dateRange={dateRange} onChange={setDateRange} widthClass="w-[125px] xl:w-[135px]" />
            <MultiSelect label="Week" options={uniqueWeeks} selected={filterWeeks} onChange={setFilterWeeks} widthClass="w-[82px] xl:w-[90px]" />
            <MultiSelect label="Portfolio" options={uniquePortfolios} selected={filterPortfolios} onChange={setFilterPortfolios} widthClass="w-[90px] xl:w-[100px]" />
            {/* HERO HIGHLIGHTED EVENT FILTER */}
            <MultiSelect 
              label="Event" 
              options={uniqueEvents} 
              selected={filterEvents} 
              onChange={(next) => {
                setFilterEvents(next);
                if (next.length === 1 && !next.includes('All')) {
                  setSelectedEvent(next[0]);
                } else if (next.includes('All') || next.length === 0) {
                  setSelectedEvent(null);
                }
              }} 
              isHero={true} 
              widthClass="w-[145px] xl:w-[170px]" 
            />
            <MultiSelect label="Event Type" options={uniqueEventTypes} selected={filterEventTypes} onChange={setFilterEventTypes} widthClass="w-[94px] xl:w-[104px]" />
            <MultiSelect label="Funnel Stage" options={uniquePhases} selected={filterPhases} onChange={setFilterPhases} widthClass="w-[96px] xl:w-[106px]" />
            <MultiSelect label="Channel" options={uniqueChannels} selected={filterChannels} onChange={setFilterChannels} widthClass="w-[90px] xl:w-[98px]" />
            <MultiSelect label="Market" options={uniqueMarkets} selected={filterMarkets} onChange={setFilterMarkets} widthClass="w-[112px] xl:w-[128px]" />
            {/* BUSINESS DIMENSION FILTER - PUSHED TO THE VERY LAST */}
            <MultiSelect 
              label="Business" 
              options={uniqueBusinesses} 
              selected={filterBusinesses} 
              onChange={setFilterBusinesses} 
              widthClass="w-[86px] xl:w-[94px]" 
              singleSelect={true}
              alignRight={true}
            />
            
            <div className="ml-auto shrink-0 flex items-end">
              <button onClick={resetFilters} title="Reset Filters" className="h-[30px] w-[30px] bg-[#cedc28]/10 border border-[#cedc28]/50 text-[#cedc28] rounded-lg hover:bg-[#cedc28]/20 hover:text-white transition-colors flex items-center justify-center"><RefreshCw className="w-3.5 h-3.5"/></button>
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
              <div className="flex flex-col gap-1.5 px-3 mb-1">
                <button 
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'admin' ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#eef7f5] hover:bg-[#cedc28]/10 hover:text-[#cedc28]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Admin
                </button>
                <button 
                  onClick={() => setSimulatingStandardUser(!simulatingStandardUser)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                    simulatingStandardUser 
                      ? 'bg-amber-500/25 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                      : 'bg-[#041628] text-gray-400 border-gray-700/60 hover:text-white hover:border-gray-500'
                  }`}
                  title={simulatingStandardUser ? "Click to exit simulation" : "Preview dashboard as regular standard user"}
                >
                  {simulatingStandardUser ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-[#14a6d9]" />}
                  <span>{simulatingStandardUser ? 'Exit Simulation' : 'Preview As Viewer'}</span>
                </button>
              </div>
            )}
            
            {userRole !== 'non-finance' && (
              <div className="flex justify-start px-3">
                <div className="flex bg-[#0a2442] p-0.5 rounded-lg border border-[#cedc28]/20 w-[100px]">
                  <button onClick={() => { setCurrency('USD'); trackCurrencyToggle('USD', userEmail); }} className={`flex-1 px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${currency === 'USD' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}>USD</button>
                  <button onClick={() => { setCurrency('SAR'); trackCurrencyToggle('SAR', userEmail); }} className={`flex-1 px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${currency === 'SAR' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}>SAR</button>
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
          <AdminView 
            currentUserEmail={userEmail || (auth?.currentUser?.email) || 'admin@tahaluf.com'} 
            initialEvents={eventsConfiguration}
          />
        ) : (
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10">
          <ReactTooltip id="market-tooltip" className="z-50" style={{ backgroundColor: '#0a2442', color: '#eef7f5', border: '1px solid #cedc2830', borderRadius: '8px', zIndex: 1000 }} />
          <div className="absolute top-0 right-0 w-full h-[500px] bg-gradient-to-br from-[#062f2e]/20 via-transparent to-transparent pointer-events-none -z-10"></div>
          {userRole === 'admin' && !simulatingStandardUser && (
            <HealthAlertBanner onOpenHealthMonitor={() => setActiveTab('admin')} />
          )}
          
          {/* 1. Standard User Preview Simulation Banner */}
          {simulatingStandardUser && (
            <div className="mb-6 p-3.5 bg-amber-500/15 border border-amber-500/40 rounded-2xl flex items-center justify-between text-xs text-amber-200 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <EyeOff className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
                <span>
                  <strong>Standard User Preview Active:</strong> All admin-only staging events are hidden. You are viewing the dashboard exactly as a regular viewer does.
                </span>
              </div>
              <button
                onClick={() => setSimulatingStandardUser(false)}
                className="px-3 py-1 bg-amber-500/30 hover:bg-amber-500 text-amber-100 hover:text-black rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all"
              >
                Exit Preview
              </button>
            </div>
          )}

          {/* 2. Admin Staging Watermark Banner when an Admin-Only event is selected */}
          {selectedEvent && eventsConfiguration.some(ev => (ev.status === 'admin_only' || ev.visibility === 'admin_only') && (ev.name === selectedEvent || ev.sourceName === selectedEvent)) && (
            <div className="mb-4 p-3 bg-purple-950/40 border border-purple-500/50 rounded-2xl flex items-center justify-between text-xs text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-purple-400 animate-pulse flex-shrink-0" />
                <span>
                  <strong>Admin Staging Mode:</strong> You are viewing live numbers for <em>&ldquo;{selectedEvent}&rdquo;</em>. This event is strictly hidden from regular dashboard users until promoted to Public Active.
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-purple-500/25 text-purple-300 border border-purple-500/40 flex-shrink-0">
                Staging Isolation
              </span>
            </div>
          )}

          {renderContent()}
        </main>
        )}
      </div>
      <div className="fixed bottom-4 right-4 z-[999] text-white/30 flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity bg-black/40 px-2 py-1 rounded-full border border-white/10 backdrop-blur-sm">
        <Check className="w-3.5 h-3.5 text-[#cedc28]" />
        <span className="text-[9px] font-bold tracking-widest uppercase">V1</span>
      </div>
    </div>
  );
}
