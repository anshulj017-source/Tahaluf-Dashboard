"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { 
  TrendingUp, Globe, Layers, Activity, DollarSign, MousePointer2, 
  Eye, EyeOff, Shield, Zap, LayoutDashboard, ChevronDown, Search, Check, ShoppingCart,
  TableProperties, MonitorPlay, BarChart3, Smartphone, List, Download, RefreshCw, Users, Calendar, LayoutTemplate, PieChart, Grid, Map as MapIcon, LogOut,
  Sparkles, Menu, X, SlidersHorizontal, Tv, Maximize2, Minimize2, MoreHorizontal, Settings
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
import { getClientDashboardCache, setClientDashboardCache } from '../lib/clientCache.js';
import { DASHBOARD_FEATURES, DEFAULT_FEATURE_CONFIG, isFeatureEnabled } from '../lib/dashboardFeatures.mjs';
import { DashboardFeatureContext, ExportButton } from './components/DashboardFeatureContext';
import AiStrategicIntelligence from './components/AiStrategicIntelligence';
import GranularWeeklyPacing from './components/GranularWeeklyPacing';
import TargetPacingForecaster from './components/TargetPacingForecaster';

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
  const wrapperRef = useRef(null);
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return options;
    return options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [options, searchTerm]);

  const isAll = selected.includes('All');
  const isActive = !isAll && selected.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (opt) => {
    if (singleSelect) {
      setIsOpen(false);
      setSearchTerm('');
      React.startTransition(() => {
        onChange([opt]);
      });
    } else {
      let next = [...selected];
      if (next.includes('All')) next = [];
      if (selected.includes(opt)) {
        next = next.filter(n => n !== opt);
        if (next.length === 0) next = ['All'];
      } else { 
        next.push(opt); 
      }
      React.startTransition(() => {
        onChange(next);
      });
    }
  };

  const handleSelectAll = () => {
    setIsOpen(false);
    setSearchTerm('');
    React.startTransition(() => {
      onChange(['All']);
    });
  };

  return (
    <div ref={wrapperRef} className={`relative ${widthClass || 'w-[50px] xl:w-[62px] 2xl:w-[78px]'} shrink-0 ${isOpen ? 'z-50' : 'z-20'}`}>
      <span className={`text-[8.5px] xl:text-[9.5px] font-black uppercase tracking-wider mb-1 flex items-center justify-between whitespace-nowrap overflow-hidden text-ellipsis ${isHero ? 'text-[#cedc28]' : 'text-[#14a6d9]'}`}>
        <span className="flex items-center gap-0.5 truncate">
          {isHero && <Sparkles className="w-2.5 h-2.5 xl:w-3 xl:h-3 text-[#cedc28] shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#cedc28] animate-pulse shrink-0 ml-0.5"></span>}
      </span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`px-1.5 xl:px-2 py-1 xl:py-1.5 rounded-lg cursor-pointer flex justify-between items-center transition-all ${
          isHero
            ? isActive
              ? 'bg-[#cedc28]/20 border-2 border-[#cedc28] text-white font-black shadow-[0_0_15px_rgba(206,220,40,0.35)] hover:shadow-[0_0_20px_rgba(206,220,40,0.5)]'
              : 'bg-gradient-to-r from-[#cedc28]/15 via-[#0a2442] to-[#14a6d9]/15 border-2 border-[#cedc28]/70 text-[#eef7f5] font-bold hover:border-[#cedc28] shadow-[0_0_10px_rgba(206,220,40,0.2)]'
            : isActive
              ? 'bg-[#cedc28]/15 border border-[#cedc28] text-white font-black shadow-[0_0_10px_rgba(206,220,40,0.25)]'
              : 'surface-inset border border-[#cedc28]/30 text-[9px] xl:text-[10px] font-bold text-[#eef7f5] hover:border-[#cedc28]'
        }`}
      >
        <span className="truncate pr-0.5 text-[9px] xl:text-[10px]">
          {isAll ? (isHero ? 'All Events' : 'All') : selected.join(', ')}
        </span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${isHero || isActive ? 'text-[#cedc28]' : 'text-gray-400'}`} />
      </div>
      {isOpen && (
        <>
          {/* Backdrop shield below header to absorb misclicks and prevent click penetration to underlying banners */}
          <div 
            className="fixed inset-x-0 bottom-0 top-[52px] sm:top-[56px] xl:top-[64px] z-40 bg-transparent cursor-default"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
              setSearchTerm('');
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
          <div className={`absolute top-full ${alignRight ? 'right-0' : 'left-0'} ${options.length <= 4 ? 'min-w-[140px]' : 'min-w-[200px]'} w-full z-50`}>
            <div className="w-full mt-2 card-surface backdrop-blur-3xl bg-[#0a2442]/95 border border-[#cedc28]/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col max-h-64 overflow-hidden animate-in fade-in zoom-in-95 duration-70">
              {options.length > 4 && (
                <div className="p-2 border-b border-[#cedc28]/10 relative">
                  <Search className="w-4 h-4 text-[#14a6d9] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full bg-black/30 text-[#eef7f5] text-[10px] font-bold pl-9 pr-3 py-2 rounded-lg outline-none border border-transparent focus:border-[#cedc28]/50" 
                  />
                </div>
              )}
              <div className="overflow-y-auto p-2 flex-1 custom-scrollbar">
                <div 
                  onClick={handleSelectAll} 
                  className={`px-3 py-2 rounded-lg text-[11px] font-bold cursor-pointer flex justify-between ${selected.includes('All') ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}
                >
                  All <Check className={`w-3.5 h-3.5 ${selected.includes('All') ? 'opacity-100' : 'opacity-0'}`} />
                </div>
                {filtered.map(opt => {
                  const isSel = selected.includes(opt);
                  return (
                    <div 
                      key={opt} 
                      onClick={() => handleSelect(opt)} 
                      className={`px-3 py-2 mt-1 rounded-lg text-[11px] font-bold cursor-pointer flex justify-between ${isSel ? 'bg-[#cedc28]/20 text-[#cedc28]' : 'text-[#eef7f5] hover:bg-[#0a2442]'}`}
                    >
                      <span className="truncate pr-2">{opt}</span> 
                      <Check className={`w-3.5 h-3.5 flex-shrink-0 ${isSel ? 'opacity-100' : 'opacity-0'}`} />
                    </div>
                  );
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
            <ExportButton
              onClick={exportCSV}
              title="Export as CSV"
              className="p-1.5 flex items-center justify-center surface-inset border border-[#cedc28]/30 rounded-lg text-[#cedc28] hover:bg-[#cedc28] hover:text-[#1a302e] transition-colors"
            >
              <Download className="w-4 h-4" />
            </ExportButton>
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
      <div className="rounded-2xl border border-[#cedc28]/20 z-10 relative custom-scrollbar touch-scroll bg-[#0a2442]" style={{ overflowY: 'scroll', overflowX: 'auto', maxHeight: '550px' }}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20 bg-[#0a2442] shadow-md">
            <tr className="bg-[#0a2442] border-b border-[#cedc28]/20">
              {activeColumns.map((col, i) => (
                <th 
                  key={i} 
                  className={`px-4 sm:px-6 py-3.5 sm:py-4 text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest whitespace-nowrap sticky top-0 bg-[#0a2442] ${
                    i === 0 ? 'sticky-col-first left-0 z-30' : 'z-20'
                  }`}
                >
                  {col.label}
                </th>
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
                     const isFirst = j === 0;
                     return (
                      <td 
                        key={j} 
                        className={`px-4 sm:px-6 py-3 sm:py-4 text-[11px] whitespace-nowrap relative ${
                          isFirst ? 'sticky-col-first left-0 z-20' : ''
                        } ${isSelected ? 'font-bold text-white' : 'font-medium text-[#eef7f5]'}`}
                      >
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
                {activeColumns.map((col, j) => {
                  const isFirst = j === 0;
                  return (
                    <td 
                      key={j} 
                      className={`px-4 sm:px-6 py-3.5 sm:py-4 text-[11px] font-bold text-[#cedc28] whitespace-nowrap relative bg-[#071a30] sticky bottom-0 ${
                        isFirst ? 'sticky-col-first left-0 z-30 !bg-[#071a30]' : 'z-20'
                      }`}
                    >
                      <span className="relative z-10">{totals[col.key] !== undefined ? (col.format ? col.format(totals[col.key], totals) : totals[col.key]) : ''}</span>
                    </td>
                  );
                })}
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

// --- INITIAL LOADING SCREEN (Engaging Animation & Fast Feedback) ---
// --- INITIAL LOADING SCREEN (Engaging Animation & Gradual Feedback) ---
const InitialLoadingScreen = ({ isAuthLoading, progress = 18, statusMessage = '' }) => {
  const [factIndex, setFactIndex] = useState(0);
  const [showRetry, setShowRetry] = useState(false);

  const FACTS = useMemo(() => [
    "Tracking 8 major 2026 events across Saudi Arabia and regional markets",
    "Multi-channel actuals synced across Meta, Google, TikTok and LinkedIn",
    "Sub-50ms data queries powered by resilient in-memory sheet caching",
    "Dynamic event countdown timelines calculated relative to official launch dates",
    "Executive wallboard view with instant SAR / USD currency conversion"
  ], []);

  useEffect(() => {
    const factTimer = setInterval(() => {
      setFactIndex(i => (i + 1) % FACTS.length);
    }, 2800);

    const retryTimer = setTimeout(() => {
      setShowRetry(true);
    }, 7000);

    return () => {
      clearInterval(factTimer);
      clearTimeout(retryTimer);
    };
  }, [FACTS.length]);

  const displayProgress = Math.min(100, Math.max(12, Math.round(progress)));

  return (
    <div className="min-h-screen app-bg flex flex-col items-center justify-center text-white px-4 relative overflow-hidden select-none">
      {/* Dynamic Background Ambient Gradients */}
      <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none opacity-30"></div>
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#cedc28]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-[#14a6d9]/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center">
        {/* Orbital Animated Ring Aura with Floating Logo */}
        <div className="relative flex items-center justify-center w-36 h-36 mb-6">
          {/* Ambient Glowing Pulse Backing */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#cedc28]/25 to-[#14a6d9]/25 blur-xl animate-pulse-ring"></div>
          
          {/* Outer Rotating Dashed Ring */}
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#cedc28]/40 animate-spin-slow"></div>
          
          {/* Middle Counter-Rotating Accent Ring */}
          <div className="absolute inset-2 rounded-full border border-t-[#14a6d9] border-r-transparent border-b-[#cedc28] border-l-transparent animate-spin-reverse-slow"></div>
          
          {/* Inner Glowing Center Surface */}
          <div className="relative z-10 w-24 h-24 rounded-full bg-[#0a2442] border border-[#cedc28]/35 flex items-center justify-center p-4 shadow-[0_0_25px_rgba(206,220,40,0.3)] animate-float-subtle">
            <img 
              src="/tahaluf-logo.svg" 
              alt="Tahaluf Logo" 
              className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(206,220,40,0.4)]" 
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        </div>

        {/* Brand Title */}
        <h2 className="text-base sm:text-lg font-black uppercase tracking-[0.2em] text-[#eef7f5] mb-1">
          Tahaluf <span className="text-[#cedc28]">Performance</span>
        </h2>
        
        {/* Stage Status Ticker with Icon */}
        <div className="h-7 flex items-center justify-center gap-2 mb-4 px-2">
          <Sparkles className="w-3.5 h-3.5 text-[#cedc28] animate-pulse flex-shrink-0" />
          <span className="text-xs font-bold text-[#14a6d9] tracking-wider transition-all duration-300 truncate">
            {statusMessage || (isAuthLoading ? "Verifying executive credentials..." : "Synchronizing event data...")}
          </span>
        </div>

        {/* High-Tech Progress Track */}
        <div className="w-full max-w-xs bg-[#0a2442] h-2.5 rounded-full overflow-hidden border border-[#cedc28]/25 p-0.5 mb-3 relative shadow-inner">
          <div 
            className="h-full bg-gradient-to-r from-[#14a6d9] via-[#cedc28] to-[#14a6d9] rounded-full transition-all duration-300 ease-out relative overflow-hidden"
            style={{ width: `${displayProgress}%` }}
          >
            <div className="absolute inset-0 bg-white/40 w-1/2 animate-shimmer-flow rounded-full"></div>
          </div>
        </div>

        {/* Percentage & Connection Status */}
        <div className="flex items-center justify-between w-full max-w-xs text-[10px] font-bold text-slate-400 mb-5 px-1">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span>Live Data Sync</span>
          </span>
          <span className="font-mono text-[#cedc28] font-black">{displayProgress}%</span>
        </div>

        {/* Rotating Executive Micro-Facts Card */}
        <div className="card-surface p-3.5 rounded-2xl border border-[#cedc28]/20 bg-[#0a2442]/85 backdrop-blur-xl w-full text-left shadow-lg mb-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3 h-3 text-[#cedc28]" />
            <span className="text-[9px] font-black uppercase tracking-wider text-[#14a6d9]">System Telemetry</span>
          </div>
          <p className="text-[11px] font-medium text-slate-300 leading-snug min-h-[30px] transition-all duration-500">
            {FACTS[factIndex]}
          </p>
        </div>

        {/* Graceful Recovery Action if Connection is Slow */}
        {showRetry && (
          <button 
            onClick={() => window.location.reload()}
            className="mt-1 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[11px] font-bold bg-[#cedc28]/15 border border-[#cedc28]/40 text-[#cedc28] hover:bg-[#cedc28] hover:text-[#1a302e] transition-all shadow-[0_0_15px_rgba(206,220,40,0.25)] animate-in fade-in duration-300"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Taking longer than expected? Quick Reload</span>
          </button>
        )}
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return Boolean(localStorage.getItem('tahaluf_cached_email')); } catch {}
    }
    return false;
  });
  const [userRole, setUserRole] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('tahaluf_cached_role');
        if (cached) return cached === 'admin' ? 'super_admin' : cached;
      } catch {}
    }
    return 'standard';
  });
  const [userEmail, setUserEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('tahaluf_cached_email') || ''; } catch {}
    }
    return '';
  });
  const [isAuthLoading, setIsAuthLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return !Boolean(localStorage.getItem('tahaluf_cached_email')); } catch {}
    }
    return true;
  });
  const [adData, setAdData] = useState([]);
  const [gaData, setGaData] = useState([]);
  const [creativeData, setCreativeData] = useState([]);
  const [plannedData, setPlannedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(15);
  const [loadingStatus, setLoadingStatus] = useState('Verifying session...');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [adminVisited, setAdminVisited] = useState(false);
  const isAdminRole = userRole === 'admin' || userRole === 'super_admin';
  useEffect(() => {
    if (!isAdminRole && activeTab === 'admin') {
      setActiveTab('summary');
    }
    if (isAdminRole && new URLSearchParams(window.location.search).has('admin')) {
      setActiveTab('admin');
    }
  }, [isAdminRole, activeTab]);
  useEffect(() => {
    if (activeTab === 'admin') setAdminVisited(true);
  }, [activeTab]);
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
  const [featureConfig, setFeatureConfig] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('tahaluf_cached_features');
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });
  const [lowQuotaMode, setLowQuotaMode] = useState(false);
  const [featureError, setFeatureError] = useState('');
  const featureAllowed = (id) => isFeatureEnabled(featureConfig || DEFAULT_FEATURE_CONFIG, id, userRole, simulatingStandardUser);

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/features', { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || 'Could not load feature controls.');
        if (!disposed && json.config) {
          setFeatureConfig(json.config);
          try {
            localStorage.setItem('tahaluf_cached_features', JSON.stringify(json.config));
          } catch {}
          setLowQuotaMode(json.policy?.lowQuotaMode === true);
          window.__tahaluf_low_quota_mode = json.policy?.lowQuotaMode === true;
          setFeatureError('');
        }
      } catch (error) {
        console.error('[FEATURES]', error);
        if (!disposed) setFeatureError(error.message);
      }
    };
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!featureConfig) return;
    const enabled = id => isFeatureEnabled(featureConfig, id, userRole, simulatingStandardUser);
    if (activeTab === 'admin' && isAdminRole) return;
    if (!enabled(activeTab)) {
      const firstView = DASHBOARD_FEATURES.find(feature => feature.group === 'Dashboard views' && enabled(feature.id));
      setActiveTab(firstView?.id || 'summary');
    }
  }, [featureConfig, userRole, simulatingStandardUser, activeTab]);
  
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

  // Responsive, Mobile App & TV Wallboard States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [tvAutoCycle, setTvAutoCycle] = useState(false);
  const [tvCycleIntervalSec, setTvCycleIntervalSec] = useState(25);
  const [tvCycleViews, setTvCycleViews] = useState(['summary', 'campaign', 'weekly']);
  const [showTvSettings, setShowTvSettings] = useState(false);
  const [isQuickJumpOpen, setIsQuickJumpOpen] = useState(false);
  const [quickJumpSearch, setQuickJumpSearch] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    if (!featureConfig) return;
    if (!isFeatureEnabled(featureConfig, 'tv', userRole, simulatingStandardUser)) setTvMode(false);
    if (!isFeatureEnabled(featureConfig, 'tvAutoCycle', userRole, simulatingStandardUser)) setTvAutoCycle(false);
    if (!isFeatureEnabled(featureConfig, 'tvCustomization', userRole, simulatingStandardUser)) setShowTvSettings(false);
    if (!isFeatureEnabled(featureConfig, 'quickJump', userRole, simulatingStandardUser)) setIsQuickJumpOpen(false);
    if (!isFeatureEnabled(featureConfig, 'currency', userRole, simulatingStandardUser)) setCurrency('USD');
  }, [featureConfig, userRole, simulatingStandardUser]);

  // Active filter count for mobile badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dateRange?.start || dateRange?.end) count++;
    if (filterWeeks?.length && !filterWeeks.includes('All')) count++;
    if (filterPortfolios?.length && !filterPortfolios.includes('All')) count++;
    if (filterEvents?.length && !filterEvents.includes('All')) count++;
    if (filterEventTypes?.length && !filterEventTypes.includes('All')) count++;
    if (filterPhases?.length && !filterPhases.includes('All')) count++;
    if (filterChannels?.length && !filterChannels.includes('All')) count++;
    if (filterMarkets?.length && !filterMarkets.includes('All')) count++;
    if (filterBusinesses?.length && !filterBusinesses.includes('All')) count++;
    return count;
  }, [dateRange, filterWeeks, filterPortfolios, filterEvents, filterEventTypes, filterPhases, filterChannels, filterMarkets, filterBusinesses]);

  // TV Wallboard Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Instant Client Cache Warmup (<30ms load time from IndexedDB)
  useEffect(() => {
    let mounted = true;
    getClientDashboardCache().then(cached => {
      if (!mounted || !cached) return;
      if (cached.ads && Array.isArray(cached.ads) && cached.ads.length > 0) {
        const hydratedAds = cached.ads.map(d => ({
          ...d,
          dateObj: d.date ? new Date(d.date) : null
        }));
        setAdData(hydratedAds);
        setCreativeData(hydratedAds);
        if (cached.planned) setPlannedData(cached.planned);
        if (cached.timelines) setEventWeekTimelines(cached.timelines);
        if (cached.eventsConfig) setEventsConfiguration(cached.eventsConfig);
        if (cached.lastUpdated) setLastUpdated(new Date(cached.lastUpdated));
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  // TV Wallboard Auto-Cycle Carousel
  useEffect(() => {
    if (!tvMode || !tvAutoCycle) return;
    const baseViews = tvCycleViews.length > 0 ? tvCycleViews : ['summary', 'campaign', 'weekly'];
    const cycleTabs = baseViews.filter(id => isFeatureEnabled(featureConfig, id, userRole, simulatingStandardUser));
    if (!cycleTabs.length || !isFeatureEnabled(featureConfig, 'tvAutoCycle', userRole, simulatingStandardUser)) return;
    const intervalMs = Math.max(10, tvCycleIntervalSec) * 1000;
    const interval = setInterval(() => {
      setActiveTab(prev => {
        const nextIdx = (cycleTabs.indexOf(prev) + 1) % cycleTabs.length;
        return cycleTabs[nextIdx];
      });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [tvMode, tvAutoCycle, tvCycleIntervalSec, tvCycleViews, featureConfig, userRole, simulatingStandardUser]);

  // Command Palette (Cmd + K / Ctrl + K) Quick Jump Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (isFeatureEnabled(featureConfig, 'quickJump', userRole, simulatingStandardUser)) {
          e.preventDefault();
          setIsQuickJumpOpen(prev => !prev);
        }
      } else if (e.key === 'Escape' && isQuickJumpOpen) {
        setIsQuickJumpOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [featureConfig, userRole, simulatingStandardUser, isQuickJumpOpen]);

  useEffect(() => {
    if (userRole === 'non-finance' && ['CPM', 'CPC'].includes(perfMetric)) {
      setPerfMetric('CTR');
    }
  }, [userRole, perfMetric]);

  useEffect(() => {
    let isResolved = false;

    // Fast-path: Check localStorage for cached session to immediately warm user state
    if (typeof window !== 'undefined') {
      try {
        const cachedEmail = localStorage.getItem('tahaluf_cached_email');
        const cachedRole = localStorage.getItem('tahaluf_cached_role');
        if (cachedEmail) {
          setUserEmail(cachedEmail);
          setIsAuthenticated(true);
          if (cachedRole) setUserRole(cachedRole === 'admin' ? 'super_admin' : cachedRole);
          setIsAuthLoading(false);
        }
      } catch (e) {}
    }

    const resolveUser = async (user) => {
      if (isResolved) return;
      isResolved = true;

      const email = (user.email || user.displayName || '').toLowerCase().trim();
      setIsAuthenticated(true);
      setUserEmail(email);
      setIsAuthLoading(false);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('tahaluf_cached_email', email);
        } catch (e) {}
      }

      // Root Tahaluf admin email
      if (email === 'admin@tahaluf.com') {
        setUserRole('super_admin');
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('tahaluf_cached_role', 'super_admin'); } catch {}
        }
      } else {
        // For non-root users, immediately ensure baseline standard role so no admin tabs bleed over
        setUserRole(prev => (prev === 'admin' || prev === 'super_admin' ? 'standard' : prev));
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('tahaluf_cached_role', 'standard'); } catch {}
        }
      }

      // Fetch official verified role from secure /api/auth/me endpoint
      try {
        const token = user.getIdToken ? await user.getIdToken().catch(() => null) : null;
        const authMeRes = await fetch('/api/auth/me', {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'x-admin-email': email
          }
        });
        if (authMeRes.ok) {
          const authMeData = await authMeRes.json();
          if (authMeData.role) {
            setUserRole(authMeData.role);
            if (typeof window !== 'undefined') {
              try { localStorage.setItem('tahaluf_cached_role', authMeData.role); } catch {}
            }
          }
        }
      } catch (err) {
        console.warn('Role verification via API fallback failed:', err);
      }

      // Touch lastActive in background without awaiting
      try {
        if (user.uid && user.uid !== 'cached-user') {
          setDoc(doc(db, 'users', user.uid), { 
            lastActive: new Date().toISOString() 
          }, { merge: true }).catch(() => {});
        }
      } catch (e) {}
    };

    // Firebase Auth Listener
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        resolveUser(user);
      } else {
        if (!auth.currentUser) {
          const cachedEmail = typeof window !== 'undefined' ? localStorage.getItem('tahaluf_cached_email') : null;
          if (cachedEmail) {
            resolveUser({ email: cachedEmail, displayName: cachedEmail, uid: 'cached-user' });
            return;
          }
          isResolved = true;
          setIsAuthenticated(false);
          setUserRole('standard');
          setUserEmail('');
          setIsAuthLoading(false);
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('tahaluf_cached_role');
              localStorage.removeItem('tahaluf_cached_email');
              localStorage.removeItem('tahaluf_feature_modes_draft');
            } catch {}
          }
          router.push('/login');
        }
      }
    });

    // SAFETY NET TIMEOUT: If onAuthStateChanged takes longer than 3500ms,
    // evaluate currentUser or redirect to login
    const authTimeoutTimer = setTimeout(() => {
      if (!isResolved) {
        if (auth.currentUser) {
          resolveUser(auth.currentUser);
        } else {
          const cachedEmail = typeof window !== 'undefined' ? localStorage.getItem('tahaluf_cached_email') : null;
          if (cachedEmail) {
            resolveUser({ email: cachedEmail, displayName: cachedEmail, uid: 'cached-user' });
            return;
          }
          isResolved = true;
          setIsAuthenticated(false);
          setUserRole('standard');
          setUserEmail('');
          setIsAuthLoading(false);
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('tahaluf_cached_role');
              localStorage.removeItem('tahaluf_cached_email');
              localStorage.removeItem('tahaluf_feature_modes_draft');
            } catch {}
          }
          router.push('/login');
        }
      }
    }, 3500);

    return () => {
      unsubscribe();
      clearTimeout(authTimeoutTimer);
    };
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
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('tahaluf_cached_role');
        localStorage.removeItem('tahaluf_cached_email');
        localStorage.removeItem('tahaluf_feature_modes_draft');
        sessionStorage.clear();
      } catch (e) {}
    }
    setUserRole('standard');
    setUserEmail('');
    setIsAuthenticated(false);
    setActiveTab('summary');
    try {
      await signOut(auth);
    } catch (e) {}
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

    const fetchCsvSafe = async (url, retries = 1) => {
      try {
        const rows = await d3.csv(url);
        if (rows && rows.length > 0) return rows;
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 600));
          return fetchCsvSafe(url + '&refresh=true', retries - 1);
        }
        return rows || [];
      } catch (err) {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 600));
          return fetchCsvSafe(url + '&refresh=true', retries - 1);
        }
        console.warn("Could not load sheet:", url, err);
        return [];
      }
    };

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
      setLoadingProgress(20);
      setLoadingStatus('Connecting to performance gateway...');

      // 1. Fetch dynamic event configurations from Admin API
      let configuredEvents = [];
      try {
        const eventsRes = await fetch('/api/admin/events?configOnly=true', { cache: 'no-store' });
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          if (eventsData.config && Array.isArray(eventsData.config.events) && eventsData.config.events.length > 0) {
            configuredEvents = eventsData.config.events;
          }
        }
      } catch (e) {
        console.warn('Could not load dynamic events config from API, using fallback:', e);
      }

      // Fallback defaults with guaranteed active public status
      if (!configuredEvents || configuredEvents.length === 0) {
        configuredEvents = [
          { id: 'gsts-26', name: 'GSTS 26', sourceName: 'GSTS', portfolio: 'P1', business: 'B2B', enabled: true, status: 'active', visibility: 'public', sheetType: 'combined', gid: '120681662', plannedGid: '2019892532', launchDate: '2026-12-18' },
          { id: 'saif-26', name: 'SAIF 26', sourceName: 'SAIF 26', portfolio: 'P1', business: 'B2B', enabled: true, status: 'active', visibility: 'public', sheetType: 'combined', gid: '1196409184', plannedGid: '570639072', launchDate: '2026-11-24' },
          { id: 'kog-26', name: 'KoG 26', sourceName: 'KoG 26', portfolio: 'P1', business: 'derive', enabled: true, status: 'active', visibility: 'public', sheetType: 'combined', gid: '1486784585', plannedGid: '1766297835', launchDate: '2026-12-01' },
          { id: 'black-hat', name: 'Black Hat', sourceName: 'BLACK HAT', portfolio: 'P1', business: 'B2B', enabled: true, status: 'active', visibility: 'public', sheetType: 'combined', gid: '659941332', plannedGid: '277310277', plannedType: 'blackhat-text', launchDate: '2026-12-01' },
          { id: 'smlc-26', name: 'SMLC 26', sourceName: 'SMLC 26', portfolio: 'P3', business: 'B2B', enabled: true, status: 'active', visibility: 'public', sheetType: 'combined', gid: '1526538255', launchDate: '2026-10-21' },
          { id: 'idws-26', name: 'IDWS 26', sourceName: 'IDWS 26', portfolio: 'P3', business: 'B2B', enabled: true, status: 'active', visibility: 'public', sheetType: 'combined', gid: '1121987876', startDate: '2026-06-01', launchDate: '2026-12-14' },
          { id: 'bio-cphi-main', name: 'BIO 26 & CPHI 26', sourceName: 'BIO / CPHI', portfolio: 'P3', business: 'B2B', enabled: true, status: 'active', visibility: 'public', sheetType: 'combined', gid: '1728688512', dateFilterMode: 'year-2026', launchDate: '2026-12-14' },
          { id: 'cphi-li', name: 'CPHI 26 (LinkedIn)', sourceName: 'CPHI 26', portfolio: 'P3', business: 'B2B', enabled: true, status: 'active', visibility: 'public', sheetType: 'combined', gid: '208497314', dateFilterMode: 'year-2026', launchDate: '2026-12-14' },
          { id: 'leap-east-26', name: 'Leap East 26', sourceName: 'Leap East 26', portfolio: 'P1', business: 'B2B', enabled: true, status: 'admin_only', visibility: 'admin_only', sheetType: 'combined', gid: '1617019591', launchDate: '2026-07-01' }
        ];
      }

      setEventsConfiguration(configuredEvents);

      const effectiveRole = (isAdminRole && !simulatingStandardUser) ? 'admin' : 'standard';

      // Filter for active events based on effectiveRole & auto-publish
      const activeEvents = configuredEvents.filter(ev => {
        if (ev.enabled === false || ev.status === 'inactive') return false;

        const isAutoPublished = ev.autoPublishDate && new Date(ev.autoPublishDate) <= new Date();
        const effectiveStatus = isAutoPublished ? 'active' : (ev.status || 'active');
        const effectiveVisibility = isAutoPublished ? 'public' : (ev.visibility || 'public');

        if (effectiveVisibility === 'admin_only' || effectiveStatus === 'admin_only') {
          return effectiveRole === 'admin';
        }
        return true;
      });

      const totalPlannedCount = activeEvents.filter(ev => ev.plannedGid).length;
      const totalStreams = Math.max(1, activeEvents.length + totalPlannedCount);
      let completedStreams = 0;

      const trackStreamProgress = (name, kind) => {
        completedStreams++;
        const pct = Math.min(90, Math.round(25 + (completedStreams / totalStreams) * 65));
        setLoadingProgress(pct);
        setLoadingStatus(`Streaming ${name} ${kind}...`);
      };

      setLoadingProgress(28);
      setLoadingStatus(`Connecting to ${activeEvents.length} live event streams...`);

      // Fetch actuals for active events
      const actualsPromises = activeEvents.map(ev => {
        const url = BASE_URL + (ev.gid ? `&gid=${ev.gid}` : '');
        return fetchCsvSafe(url).then(rawRows => {
          trackStreamProgress(ev.name, 'actuals');
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
              trackStreamProgress('Black Hat', 'targets');
              const bhRows = parseBlackHatPlanned(text);
              return parsePlannedRows(bhRows, 'Black Hat').map((p, i) => ({
                ...p,
                eventType: bhRows.filter(r => r.Channel && r.Channel.trim() !== '')[i]?.__eventType || 'Exhibition'
              }));
            });
          } else {
            return fetchCsvSafe(url).then(rows => {
              trackStreamProgress(ev.name, 'targets');
              return parsePlannedRows(rows, ev.name);
            });
          }
        });

      const [actualsResults, plannedResults] = await Promise.all([
        Promise.allSettled(actualsPromises),
        Promise.allSettled(plannedPromises)
      ]);
      const allActualsArrays = actualsResults.map(r => r.status === 'fulfilled' ? r.value : []);
      const allPlannedArrays = plannedResults.map(r => r.status === 'fulfilled' ? r.value : []);

      setLoadingProgress(92);
      setLoadingStatus('Synthesizing week countdown timelines...');

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

      setClientDashboardCache({
        ads: combinedAds,
        planned: parsedPlannedData,
        timelines,
        eventsConfig: configuredEvents,
        lastUpdated: latestDataDate.toISOString()
      });

      setLoadingProgress(100);
      setLoadingStatus('Ready! Rendering visualizations...');
      setLoading(false);
    };

    loadDashboardData().catch(err => {
      console.error(err);
      setLoadingProgress(100);
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
    const vals = Array.from(new Set(adData.map(d => d.business))).filter(Boolean);
    return Array.from(new Set([...vals, 'B2B', 'B2C'])).sort();
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

  // Planned data scoped by Event Type master filter (rows with an eventType, e.g. Black Hat Exprom/Visprom,
  // are kept only when their type is selected; with no filter, both types are summed).
  const scopedPlannedData = useMemo(() => filterEventTypes.includes('All')
    ? plannedData
    : plannedData.filter(p => !p.eventType || filterEventTypes.includes(p.eventType)),
    [plannedData, filterEventTypes]
  );

  const plannedEventNames = useMemo(() => Array.from(new Set([
    ...eventsConfiguration.filter(ev => ev.plannedGid).map(ev => ev.name),
    ...eventsConfiguration.filter(ev => ev.plannedGid).map(ev => ev.sourceName).filter(Boolean),
    ...scopedPlannedData.map(p => p.event),
    'KoG 26', 'SAIF 26', 'GSTS 26', 'Black Hat'
  ])), [eventsConfiguration, scopedPlannedData]);
  const PLANNED_EVENTS = plannedEventNames;

  const NAV_ITEMS = [
    { id: 'summary', label: 'Overview', icon: Grid },
    { id: 'campaign', label: 'Event View', icon: Activity },
    { id: 'weekly', label: 'Weekly View', icon: Calendar },
    { id: 'channel', label: 'Channel View', icon: MonitorPlay },
    { id: 'market', label: 'Market View', icon: MapIcon },
    { id: 'detailed', label: 'Detailed View', icon: PieChart },
    { id: 'webtraffic', label: 'Web Traffic', icon: Users },
    { id: 'creative', label: 'Creative View', icon: LayoutTemplate },
  ].filter(item => featureAllowed(item.id));

  // Admin button is rendered separately at the bottom left

  if (isAuthLoading || loading) {
    return (
      <InitialLoadingScreen 
        isAuthLoading={isAuthLoading} 
        progress={loadingProgress}
        statusMessage={loadingStatus}
      />
    );
  }

  const generatePpt = async () => {
      if (!featureAllowed('exports')) return;
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
      const totalConversions = agg.purchases;

      const subTableAdData = selectedEvent ? filteredAdData.filter(d => d.eventNameDB === selectedEvent) : filteredAdData;
      const subTableTotals = getTotals(subTableAdData);

      const eventMetricsData = getMetricsData(filteredAdData, d => d.eventNameDB, 'eventName');
      const phaseMetricsData = getMetricsData(subTableAdData, d => d.phase, 'phase');
      const channelMetricsData = getMetricsData(subTableAdData, d => d.channel, 'channel');
      const marketMetricsData = getMetricsData(subTableAdData, d => d.country, 'market');

      // Determine active event and portfolio context cleanly
      const activeEventContext = (filterEvents.length === 1 && !filterEvents.includes('All')) 
        ? filterEvents[0] 
        : (filterEvents.includes('All') ? selectedEvent : null);
      const activePortfolioContext = filterPortfolios.length === 1 && !filterPortfolios.includes('All') ? filterPortfolios[0] : null;

      // Scoped data for AI Strategic Briefing (independent event or portfolio)
      const scopeAdData = activeEventContext ? filteredAdData.filter(d => d.eventNameDB === activeEventContext) : subTableAdData;
      const scopeTotals = getTotals(scopeAdData);

      // Scoped channel metrics for active event / portfolio
      const scopeChannelSpend = d3.groups(scopeAdData, d => d.channel).map(([channel, vals]) => {
        const spend = d3.sum(vals, d => d.cost) * exRate;
        const imps = d3.sum(vals, d => d.impressions);
        const clicks = d3.sum(vals, d => d.clicks);
        const purchases = d3.sum(vals, d => d.purchases || 0);
        return {
          channel,
          name: channel,
          spend,
          cost: d3.sum(vals, d => d.cost),
          impressions: imps,
          clicks,
          purchases,
          cpm: imps > 0 ? (spend / imps) * 1000 : 0,
          cpc: clicks > 0 ? (spend / clicks) : 0,
          ctr: imps > 0 ? (clicks / imps) * 100 : 0,
          cpa: purchases > 0 ? (spend / purchases) : 0
        };
      }).filter(d => d.spend > 0).sort((a, b) => b.spend - a.spend);

      const topChannel = scopeChannelSpend.length > 0 ? scopeChannelSpend[0] : null;
      const lowestCPMChannel = scopeChannelSpend.length > 0 ? [...scopeChannelSpend].filter(d => d.cpm > 0).sort((a, b) => a.cpm - b.cpm)[0] : null;
      const highestCTRChannel = scopeChannelSpend.length > 0 ? [...scopeChannelSpend].filter(d => d.impressions > 0).sort((a, b) => b.ctr - a.ctr)[0] : null;

      const scopeDailySpend = d3.groups(scopeAdData.filter(d => d.dateObj && !isNaN(d.dateObj)), d => d3.timeFormat("%Y-%m-%d")(d.dateObj)).map(([key, vals]) => ({
        date: d3.timeFormat("%b %d")(vals[0].dateObj),
        day: d3.timeFormat("%b %d")(vals[0].dateObj),
        spend: d3.sum(vals, d => d.cost) * exRate
      })).filter(d => d.spend > 0);

      const avgDailySpend = scopeDailySpend.length > 0 ? d3.mean(scopeDailySpend, d => d.spend) : 0;
      const peakSpendDay = scopeDailySpend.length > 0 ? scopeDailySpend.reduce((max, d) => d.spend > max.spend ? d : max, scopeDailySpend[0]) : null;

      const activeScope = {
        type: activeEventContext ? 'event' : activePortfolioContext ? 'portfolio' : 'all',
        name: activeEventContext || activePortfolioContext || 'All Events'
      };

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
          {/* AI Strategic Intelligence Briefing Card (Admin Only by default in Feature Controls) */}
          {featureAllowed('aiSummary') && (
            <AiStrategicIntelligence 
              allAdData={adData}
              filteredAdData={scopeAdData}
              plannedData={plannedData}
              channelData={scopeChannelSpend.length > 0 ? scopeChannelSpend : channelMetricsData}
              totals={scopeTotals}
              topChannel={topChannel}
              lowestCPMChannel={lowestCPMChannel}
              highestCTRChannel={highestCTRChannel}
              avgDailySpend={avgDailySpend}
              peakSpendDay={peakSpendDay}
              activeScope={activeScope}
              onSelectEvent={(evName) => {
                setFilterEvents([evName]);
                setSelectedEvent(evName);
              }}
              onSelectPortfolio={(portKey) => {
                setFilterPortfolios([portKey]);
                setFilterEvents(['All']);
                setSelectedEvent(null);
              }}
              onResetScope={() => {
                setFilterEvents(['All']);
                setFilterPortfolios(['All']);
                setSelectedEvent(null);
              }}
              exSym={exSym}
              exRate={exRate}
              formatShort={formatShort}
              userRole={userRole}
              featureAllowed={featureAllowed}
            />
          )}

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
      const activeEventContext = selectedEvent || (filterEvents.length === 1 && !filterEvents.includes('All') ? filterEvents[0] : (uniqueEvents.length > 0 ? uniqueEvents[0] : null));

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
          
          {featureAllowed('launchForecaster') && (
            <TargetPacingForecaster 
              eventName={activeEventContext}
              deliveredCost={weekTotals.spend || 0}
              plannedBudget={plannedData.filter(p => p.eventName === activeEventContext || p.event === activeEventContext || (p.sourceName && p.sourceName.toLowerCase().includes(activeEventContext.toLowerCase()))).reduce((sum, p) => sum + (Number(p.budget || p.Budget || p.spend || p.Spend || 0)), 0)}
              launchDateStr={eventsConfiguration?.find(e => e.name === activeEventContext || e.id === activeEventContext)?.launchDate || ''}
              startDateStr={eventsConfiguration?.find(e => e.name === activeEventContext || e.id === activeEventContext)?.startDate || ''}
              exSym={exSym}
              exRate={exRate}
              formatShort={formatShort}
            />
          )}

          {featureAllowed('granularTimeline') && (
            <GranularWeeklyPacing 
              eventName={activeEventContext}
              eventTimeline={eventWeekTimelines[activeEventContext] || eventWeekTimelines[activeEventContext.toUpperCase()] || []}
              weeklyData={weeklyMetricsData}
              plannedData={plannedData.filter(p => p.eventName === activeEventContext || p.event === activeEventContext || (p.sourceName && p.sourceName.toLowerCase().includes(activeEventContext.toLowerCase())))}
              selectedWeeks={localWeeklyViewWeeks}
              onSelectWeek={(w) => setLocalWeeklyViewWeeks(w === 'All' ? ['All'] : [w])}
              currency={currency}
              exRate={exRate}
              exSym={exSym}
            />
          )}

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
      const activeEventContext = selectedEvent || (filterEvents.length === 1 && !filterEvents.includes('All') ? filterEvents[0] : (uniqueEvents.length > 0 ? uniqueEvents[0] : null));
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

            {featureAllowed('benchmarkComparison') && (
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
            )}

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
    <DashboardFeatureContext.Provider value={{ config: featureConfig || DEFAULT_FEATURE_CONFIG, role: userRole, preview: simulatingStandardUser, lowQuotaMode }}>
    <div className={`h-screen overflow-hidden app-bg font-sans selection:bg-[#cedc28]/30 text-white flex flex-col ${tvMode ? 'tv-mode-active' : ''}`}>
      {/* HEADER: TV Mode or Standard Header */}
      {tvMode ? (
        <header className="sticky top-0 z-50 bg-[#071a30]/95 backdrop-blur-xl border-b-2 border-[#cedc28]/40 px-3 sm:px-6 py-2.5 shadow-2xl relative flex items-center justify-between gap-2">
          <div 
            onClick={() => {
              setTvMode(false);
              setActiveTab('summary');
            }}
            className="flex items-center gap-2 sm:gap-3 min-w-0 cursor-pointer hover:opacity-85 transition-opacity"
            title="Exit TV Mode & Return to Overview"
          >
            <img src="/tahaluf-logo.svg" alt="Tahaluf Logo" className="h-6 sm:h-7 object-contain shrink-0" onError={(e) => e.target.style.display = 'none'} />
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-[10px] sm:text-xs font-black text-[#cedc28] uppercase tracking-wider bg-[#cedc28]/10 px-2 sm:px-2.5 py-1 rounded-lg border border-[#cedc28]/30 truncate">
                TV Operations Center
              </span>
              <span className="hidden md:flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30 animate-pulse shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Live Monitoring
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="text-right hidden sm:block shrink-0">
              <div className="text-sm font-black text-white font-mono tracking-wider">{currentTime}</div>
              <div className="text-[9px] font-bold text-[#14a6d9] uppercase tracking-widest">
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            {featureAllowed('tvAutoCycle') && (
              <div className="relative flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setTvAutoCycle(!tvAutoCycle)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 shrink-0 ${
                    tvAutoCycle 
                      ? 'bg-[#cedc28] text-[#1a302e] border-[#cedc28] shadow-[0_0_15px_rgba(206,220,40,0.4)]' 
                      : 'bg-[#0a2442] text-gray-300 border-gray-700 hover:text-white'
                  }`}
                  title={`Automatically rotate between enabled views every ${tvCycleIntervalSec}s`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${tvAutoCycle ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Auto-Cycle:</span> {tvAutoCycle ? 'ON' : 'OFF'}
                </button>

                {featureAllowed('tvCustomization') && (
                  <button
                    onClick={() => setShowTvSettings(!showTvSettings)}
                    className="p-1.5 rounded-lg border border-gray-700 bg-[#0a2442] text-gray-300 hover:text-white hover:border-[#cedc28]/40 transition shrink-0"
                    title="Configure TV Wallboard rotation speed and views"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}

                {showTvSettings && featureAllowed('tvCustomization') && (
                  <div className="absolute top-full right-0 mt-2 w-64 rounded-xl border border-white/15 bg-[#031120] p-3 text-xs text-white shadow-2xl z-50">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 font-bold text-[#cedc28]">
                      <span>TV Wallboard Settings</span>
                      <button onClick={() => setShowTvSettings(false)} className="text-slate-400 hover:text-white">✕</button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Rotation Interval</label>
                        <div className="grid grid-cols-4 gap-1">
                          {[15, 25, 45, 60].map(sec => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setTvCycleIntervalSec(sec)}
                              className={`rounded py-1 font-mono text-center text-xs border ${
                                tvCycleIntervalSec === sec
                                  ? 'border-[#cedc28] bg-[#cedc28]/20 text-[#cedc28] font-bold'
                                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              {sec}s
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/10">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Enabled Rotation Slides</label>
                        <div className="space-y-1">
                          {[
                            ['summary', 'Overview'],
                            ['campaign', 'Event View'],
                            ['weekly', 'Weekly Pacing'],
                            ['channel', 'Channel Matrix'],
                            ['market', 'Market View']
                          ].map(([id, label]) => {
                            const isIncluded = tvCycleViews.includes(id);
                            return (
                              <label key={id} className="flex items-center gap-2 text-slate-200 hover:text-white cursor-pointer py-0.5">
                                <input
                                  type="checkbox"
                                  checked={isIncluded}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setTvCycleViews(prev => [...prev, id]);
                                    } else {
                                      setTvCycleViews(prev => prev.filter(v => v !== id));
                                    }
                                  }}
                                  className="accent-[#cedc28]"
                                />
                                <span>{label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setTvMode(false)}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500 hover:text-white transition-all flex items-center gap-1.5 shrink-0"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Exit TV Mode</span>
            </button>
          </div>
        </header>
      ) : activeTab === 'admin' && isAdminRole ? (
        <header className="flex items-center justify-between gap-3 border-b border-[#cedc28]/20 bg-[#0a2442] px-4 py-3 text-white">
          <div 
            onClick={() => setActiveTab('summary')}
            className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition-opacity"
            title="Return to Overview"
          >
            <img src="/tahaluf-logo.svg" alt="Tahaluf Logo" className="h-7 object-contain" />
            <span className="text-sm font-semibold tracking-wide">Admin Workspace</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-300 hidden sm:inline font-mono">{userEmail}</span>
            <button 
              onClick={() => setActiveTab('summary')} 
              className="rounded-lg border border-[#cedc28]/40 hover:bg-[#cedc28]/10 text-[#cedc28] px-3 py-1.5 text-xs font-bold transition-all"
            >
              Back to dashboard
            </button>
            <button 
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold transition-all text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:text-red-300"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-50 bg-[#0a2442]/95 backdrop-blur-xl border-b border-[#cedc28]/20 px-0 py-2 sm:py-2.5 shadow-2xl relative">
          <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none"></div>

          {/* DESKTOP HEADER (Screens >= lg / 1024px, including all 13-inch and larger screens) */}
          <div className="hidden lg:flex items-center justify-between relative z-10 w-full px-2 xl:px-4 2xl:px-6">
            {/* LEFT: Logo */}
            <div 
              onClick={() => {
                setActiveTab('summary');
                if (tvMode) setTvMode(false);
              }}
              className="w-36 xl:w-44 pr-2 xl:pr-3 flex items-center justify-between shrink-0 border-r border-[#cedc28]/15 cursor-pointer hover:opacity-85 transition-opacity"
              title="Return to Overview"
            >
              <div className="flex flex-col items-start gap-0.5">
                <img src="/tahaluf-logo.svg" alt="Tahaluf Logo" className="h-6 xl:h-7 object-contain" onError={(e) => e.target.style.display = 'none'} />
                <p className="text-[7.5px] xl:text-[8px] font-bold text-[#cedc28] uppercase tracking-[0.08em] whitespace-nowrap">Performance Dashboard</p>
              </div>
            </div>

            {/* CENTER: ALL 9 FILTERS IN A SINGLE SLEEK ROW (ZERO OVERLAP, CALIBRATED FOR 13-INCH SCREENS) */}
            <div className="px-1.5 xl:px-3 flex gap-1 xl:gap-1.5 flex-nowrap items-end justify-center">
              <DateRangeFilter label="DATE" dateRange={dateRange} onChange={setDateRange} widthClass="w-[96px] xl:w-[108px] 2xl:w-[118px]" />
              <MultiSelect label="Week" options={uniqueWeeks} selected={filterWeeks} onChange={setFilterWeeks} widthClass="w-[58px] xl:w-[64px] 2xl:w-[70px]" />
              <MultiSelect label="Portfolio" options={uniquePortfolios} selected={filterPortfolios} onChange={setFilterPortfolios} widthClass="w-[64px] xl:w-[72px] 2xl:w-[78px]" />
              {/* HERO HIGHLIGHTED EVENT FILTER */}
              <MultiSelect 
                label="Event" 
                options={uniqueEvents} 
                selected={filterEvents} 
                onChange={(next) => {
                  setFilterEvents(next);
                  if (next.length === 1 && !next.includes('All')) {
                    setSelectedEvent(next[0]);
                  } else {
                    setSelectedEvent(null);
                  }
                }} 
                isHero={true} 
                widthClass="w-[115px] xl:w-[128px] 2xl:w-[140px]" 
              />
              <MultiSelect label="Event Type" options={uniqueEventTypes} selected={filterEventTypes} onChange={setFilterEventTypes} widthClass="w-[72px] xl:w-[80px] 2xl:w-[86px]" />
              <MultiSelect label="Funnel Stage" options={uniquePhases} selected={filterPhases} onChange={setFilterPhases} widthClass="w-[74px] xl:w-[82px] 2xl:w-[88px]" />
              <MultiSelect label="Channel" options={uniqueChannels} selected={filterChannels} onChange={setFilterChannels} widthClass="w-[68px] xl:w-[74px] 2xl:w-[80px]" />
              <MultiSelect label="Market" options={uniqueMarkets} selected={filterMarkets} onChange={setFilterMarkets} widthClass="w-[74px] xl:w-[82px] 2xl:w-[88px]" alignRight={true} />
              <MultiSelect 
                label="Business" 
                options={uniqueBusinesses} 
                selected={filterBusinesses} 
                onChange={setFilterBusinesses} 
                widthClass="w-[68px] xl:w-[74px] 2xl:w-[80px]" 
                singleSelect={true}
                alignRight={true}
              />
            </div>

            {/* RIGHT: PINNED ACTIONS (ALWAYS VISIBLE & PROTECTED FROM OVERLAP) */}
            <div className="pl-2 xl:pl-3.5 shrink-0 flex items-center gap-1 xl:gap-2 border-l border-[#cedc28]/15 bg-[#0a2442] relative z-30">
              {featureAllowed('quickJump') && (
                <button
                  onClick={() => setIsQuickJumpOpen(true)}
                  title="Search & Quick Jump (Cmd+K)"
                  className="h-[28px] xl:h-[30px] px-2 bg-white/5 border border-white/15 text-slate-300 rounded-lg hover:bg-white/10 hover:text-white transition-colors flex items-center gap-1.5 text-[10px] font-semibold shrink-0"
                >
                  <Search className="w-3 h-3 text-[#14a6d9]" />
                  <span className="hidden 2xl:inline">Search</span>
                  <kbd className="hidden 2xl:inline-block rounded bg-black/40 px-1 py-0.2 text-[9px] text-slate-400 font-mono">⌘K</kbd>
                </button>
              )}
              {featureAllowed('tv') && (
                <button
                  onClick={() => setTvMode(true)} 
                  title="TV Wallboard Presentation Mode" 
                  className="h-[28px] xl:h-[30px] px-2.5 bg-[#14a6d9]/15 border border-[#14a6d9]/50 text-[#14a6d9] rounded-lg hover:bg-[#14a6d9]/25 hover:text-white transition-colors flex items-center gap-1.5 text-[10px] font-bold shadow-sm shrink-0"
                >
                  <Tv className="w-3.5 h-3.5"/>
                  <span className="inline font-bold">TV</span>
                </button>
              )}
              <button 
                onClick={resetFilters} 
                title="Reset Filters" 
                className="h-[28px] xl:h-[30px] w-[28px] xl:w-[30px] bg-[#cedc28]/10 border border-[#cedc28]/50 text-[#cedc28] rounded-lg hover:bg-[#cedc28]/20 hover:text-white transition-colors flex items-center justify-center shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>

          {/* MOBILE / TABLET HEADER (Screens < lg / 1024px) */}
          <div className="lg:hidden flex items-center justify-between px-3 relative z-10 w-full gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button 
                onClick={() => setMobileMenuOpen(true)}
                className="p-1.5 rounded-lg bg-[#cedc28]/10 text-[#cedc28] border border-[#cedc28]/30 hover:bg-[#cedc28]/20 transition-colors shrink-0"
                title="Open Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div 
                onClick={() => {
                  setActiveTab('summary');
                  if (tvMode) setTvMode(false);
                }}
                className="flex flex-col items-start shrink-0 cursor-pointer hover:opacity-85 transition-opacity"
                title="Return to Overview"
              >
                <img src="/tahaluf-logo.svg" alt="Tahaluf Logo" className="h-6 object-contain" onError={(e) => e.target.style.display = 'none'} />
                <p className="text-[7.5px] font-bold text-[#cedc28] uppercase tracking-[0.08em]">Dashboard</p>
              </div>
              {selectedEvent && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-[#cedc28]/20 text-[#cedc28] border border-[#cedc28]/40 truncate max-w-[80px] sm:max-w-[130px]">
                  {selectedEvent}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {featureAllowed('quickJump') && (
                <button
                  onClick={() => setIsQuickJumpOpen(true)}
                  title="Search & Quick Jump (Cmd+K)"
                  className="h-[32px] w-[32px] bg-white/5 border border-white/15 text-slate-300 rounded-lg hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center shrink-0"
                >
                  <Search className="w-3.5 h-3.5 text-[#14a6d9]" />
                </button>
              )}
              {featureAllowed('tv') && (
                <button
                  onClick={() => setTvMode(true)} 
                  title="TV Wallboard Mode" 
                  className="h-[32px] px-2 bg-[#14a6d9]/15 border border-[#14a6d9]/50 text-[#14a6d9] rounded-lg hover:bg-[#14a6d9]/25 transition-colors flex items-center gap-1 text-[11px] font-bold shrink-0"
                >
                  <Tv className="w-3.5 h-3.5"/>
                  <span className="hidden sm:inline">TV</span>
                </button>
              )}
              <button 
                onClick={() => setMobileFiltersOpen(true)}
                className={`h-[32px] px-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border shrink-0 ${
                  activeFilterCount > 0 
                    ? 'bg-[#cedc28] text-[#1a302e] border-[#cedc28] shadow-[0_0_10px_rgba(206,220,40,0.3)]' 
                    : 'bg-[#cedc28]/10 text-[#cedc28] border-[#cedc28]/40'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#1a302e] text-[#cedc28] text-[9px] flex items-center justify-center font-black">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button 
                onClick={resetFilters} 
                title="Reset Filters" 
                className="h-[32px] w-[32px] bg-[#cedc28]/10 border border-[#cedc28]/50 text-[#cedc28] rounded-lg hover:bg-[#cedc28]/20 transition-colors flex items-center justify-center shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* MOBILE SLIDE-OUT MENU DRAWER */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full bg-[#0a2442] border-r border-[#cedc28]/30 shadow-2xl flex flex-col p-5 overflow-y-auto custom-scrollbar animate-in slide-in-from-left duration-300">
            <div className="flex items-center justify-between pb-4 border-b border-[#cedc28]/20 mb-4">
              <div 
                onClick={() => {
                  setActiveTab('summary');
                  setMobileMenuOpen(false);
                  if (tvMode) setTvMode(false);
                }}
                className="flex flex-col items-start gap-0.5 cursor-pointer hover:opacity-85 transition-opacity"
                title="Return to Overview"
              >
                <img src="/tahaluf-logo.svg" alt="Tahaluf Logo" className="h-7 object-contain" />
                <p className="text-[8px] font-bold text-[#cedc28] uppercase tracking-[0.08em]">Performance Dashboard</p>
              </div>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-[#1a302e]/60 border border-[#cedc28]/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-[10px] font-bold text-[#14a6d9] uppercase tracking-widest mb-2 px-2">Navigation Views</div>
            <div className="flex flex-col gap-1.5 mb-6">
              {NAV_ITEMS.map(t => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTab(t.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl font-bold text-[13px] transition-all ${
                      active ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#eef7f5] hover:bg-[#cedc28]/10 hover:text-[#cedc28]'
                    }`}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
              {featureAllowed('tv') && (
                <button
                  onClick={() => {
                    setTvMode(true);
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl font-bold text-[13px] text-[#14a6d9] bg-[#14a6d9]/10 border border-[#14a6d9]/30 hover:bg-[#14a6d9]/20 transition-all"
                >
                  <Tv className="w-4 h-4" />
                  TV Wallboard Mode
                </button>
              )}
            </div>

            <div className="mt-auto pt-4 border-t border-[#cedc28]/20 flex flex-col gap-3">
              {isAdminRole && (
                <div className="flex flex-col gap-1.5">
                  <button 
                    onClick={() => {
                      setActiveTab('admin');
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      activeTab === 'admin' ? 'bg-[#cedc28] text-[#1a302e] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#eef7f5] hover:bg-[#cedc28]/10 hover:text-[#cedc28]'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Admin Center
                  </button>
                  <button 
                    onClick={() => setSimulatingStandardUser(!simulatingStandardUser)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      simulatingStandardUser 
                        ? 'bg-amber-500/25 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                        : 'bg-[#041628] text-gray-400 border-gray-700/60 hover:text-white'
                    }`}
                  >
                    {simulatingStandardUser ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-[#14a6d9]" />}
                    <span>{simulatingStandardUser ? 'Exit Simulation' : 'Preview As Viewer'}</span>
                  </button>
                </div>
              )}

              {userRole !== 'non-finance' && featureAllowed('currency') && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-[#14a6d9] uppercase tracking-wider">Currency</span>
                  <div className="flex bg-[#041628] p-0.5 rounded-lg border border-[#cedc28]/20 w-[110px]">
                    <button onClick={() => { setCurrency('USD'); trackCurrencyToggle('USD', userEmail); }} className={`flex-1 px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${currency === 'USD' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}>USD</button>
                    <button onClick={() => { setCurrency('SAR'); trackCurrencyToggle('SAR', userEmail); }} className={`flex-1 px-2 py-1 text-[11px] font-bold rounded-md transition-colors ${currency === 'SAR' ? 'bg-[#cedc28] text-[#1a302e]' : 'text-slate-400 hover:text-white'}`}>SAR</button>
                  </div>
                </div>
              )}

              <button 
                onClick={handleSignOut}
                className="flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-xl font-bold transition-all text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 mt-1"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>

              {lastUpdated && (
                <div className="text-[9px] font-bold text-[#14a6d9] uppercase tracking-wider opacity-60 text-center mt-2">
                  Data up to: {lastUpdated.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE FILTER BOTTOM SHEET */}
      {mobileFiltersOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div 
            className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="relative z-10 w-full max-h-[85vh] bg-[#0a2442] border-t-2 border-[#cedc28] rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="px-5 py-4 border-b border-[#cedc28]/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#cedc28]" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Dashboard Filters</h3>
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#cedc28] text-[#1a302e] text-[10px] font-black">
                    {activeFilterCount} Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={resetFilters}
                  className="text-[11px] font-bold text-[#cedc28] hover:underline"
                >
                  Reset All
                </button>
                <button 
                  onClick={() => setMobileFiltersOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-[#14a6d9] tracking-wider mb-1.5 block">Time & Date Window</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DateRangeFilter label="DATE" dateRange={dateRange} onChange={setDateRange} widthClass="w-full" />
                  <MultiSelect label="Week" options={uniqueWeeks} selected={filterWeeks} onChange={setFilterWeeks} widthClass="w-full" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-[#14a6d9] tracking-wider mb-1.5 block">Event & Portfolio Scope</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <MultiSelect 
                    label="Event" 
                    options={uniqueEvents} 
                    selected={filterEvents} 
                    onChange={(next) => {
                      setFilterEvents(next);
                      if (next.length === 1 && !next.includes('All')) {
                        setSelectedEvent(next[0]);
                      } else {
                        setSelectedEvent(null);
                      }
                    }} 
                    isHero={true} 
                    widthClass="w-full" 
                  />
                  <MultiSelect label="Portfolio" options={uniquePortfolios} selected={filterPortfolios} onChange={setFilterPortfolios} widthClass="w-full" />
                  <MultiSelect label="Event Type" options={uniqueEventTypes} selected={filterEventTypes} onChange={setFilterEventTypes} widthClass="w-full" />
                  <MultiSelect 
                    label="Business" 
                    options={uniqueBusinesses} 
                    selected={filterBusinesses} 
                    onChange={setFilterBusinesses} 
                    widthClass="w-full" 
                    singleSelect={true}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-[#14a6d9] tracking-wider mb-1.5 block">Marketing & Channels</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <MultiSelect label="Funnel Stage" options={uniquePhases} selected={filterPhases} onChange={setFilterPhases} widthClass="w-full" />
                  <MultiSelect label="Channel" options={uniqueChannels} selected={filterChannels} onChange={setFilterChannels} widthClass="w-full" />
                  <MultiSelect label="Market" options={uniqueMarkets} selected={filterMarkets} onChange={setFilterMarkets} widthClass="w-full" />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#cedc28]/20 bg-[#071a30] pb-safe">
              <button 
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full py-3 rounded-xl bg-[#cedc28] text-[#1a302e] font-black text-sm uppercase tracking-wider shadow-lg hover:brightness-105 active:scale-[0.99] transition-all"
              >
                Apply Filters ({activeFilterCount > 0 ? `${activeFilterCount} Active` : 'All Data'})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT BODY */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* DESKTOP SIDEBAR (Screens >= lg) */}
        {!tvMode && activeTab !== 'admin' && (
          <div className="hidden lg:flex w-52 border-r border-[#cedc28]/10 bg-[#0a2442] flex-col gap-2 overflow-y-auto z-20 relative shrink-0">
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
              {isAdminRole && (
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
              
              {userRole !== 'non-finance' && featureAllowed('currency') && (
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
              <div className={`px-6 pb-6 text-[9px] font-bold text-[#14a6d9] uppercase tracking-wider opacity-60 text-left ${isAdminRole ? 'mt-0' : 'mt-auto'}`}>
                Data up to: {lastUpdated.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
        )}
        
        {/* TABS CONTENT */}
        {(adminVisited || activeTab === 'admin') && isAdminRole && (
          <div className="min-w-0 flex-1 flex overflow-hidden" style={{ display: activeTab === 'admin' ? undefined : 'none' }}>
          <AdminView 
            active={activeTab === 'admin'}
            currentUserEmail={userEmail || (auth?.currentUser?.email) || 'admin@tahaluf.com'} 
            userRole={userRole}
            featureConfig={featureConfig}
            isFeatureAllowed={featureAllowed}
            initialEvents={eventsConfiguration}
            onFeaturesSaved={setFeatureConfig}
            onEventsSaved={setEventsConfiguration}
            onSignOut={handleSignOut}
            onNavigate={(featureId) => {
              if (['summary', 'campaign', 'weekly', 'channel', 'market', 'detailed', 'webtraffic', 'creative'].includes(featureId)) {
                setActiveTab(featureId);
              } else if (featureId === 'aiSummary' || featureId === 'budgetSimulator' || featureId === 'channelQuadrant') {
                setActiveTab('summary');
              } else if (featureId === 'launchForecaster') {
                setActiveTab('weekly');
              } else if (featureId === 'creativeFatigue') {
                setActiveTab('creative');
              } else if (featureId === 'tv' || featureId === 'tvAutoCycle') {
                setActiveTab('summary');
                setTvMode(true);
              } else if (featureId === 'tvCustomization') {
                setActiveTab('summary');
                setTvMode(true);
                setShowTvSettings(true);
              } else if (featureId === 'quickJump') {
                setActiveTab('summary');
                setIsQuickJumpOpen(true);
              } else if (featureId === 'currency' || featureId === 'exports' || featureId === 'healthBanner') {
                setActiveTab('summary');
              } else {
                setActiveTab('summary');
              }
            }}
          />
          </div>
        )}
        {!(activeTab === 'admin' && isAdminRole) && (
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 lg:p-8 pb-24 lg:pb-8 custom-scrollbar touch-scroll relative z-10">
          <ReactTooltip id="market-tooltip" className="z-50" style={{ backgroundColor: '#0a2442', color: '#eef7f5', border: '1px solid #cedc2830', borderRadius: '8px', zIndex: 1000 }} />
          <div className="absolute top-0 right-0 w-full h-[500px] bg-gradient-to-br from-[#062f2e]/20 via-transparent to-transparent pointer-events-none -z-10"></div>
          {featureAllowed('healthBanner') && !tvMode && (
            <HealthAlertBanner onOpenHealthMonitor={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('admin', 'health');
              url.searchParams.set('healthView', 'overview');
              window.history.replaceState(null, '', url);
              window.dispatchEvent(new Event('admin-locationchange'));
              setActiveTab('admin');
            }} />
          )}
          
          {/* 1. Standard User Preview Simulation Banner */}
          {simulatingStandardUser && !tvMode && (
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
          {selectedEvent && !tvMode && eventsConfiguration.some(ev => (ev.status === 'admin_only' || ev.visibility === 'admin_only') && (ev.name === selectedEvent || ev.sourceName === selectedEvent)) && (
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

          {lowQuotaMode && <p role="status" className="mb-4 p-3 border border-amber-500/40 rounded-xl text-sm text-amber-200">Low-quota mode is active: automatic admin monitoring refreshes and periodic analytics heartbeats are paused. Dashboard data, manual refreshes, and real interactions remain available.</p>}
          {featureError && <p role="alert" className="mb-4 p-3 border border-red-500/40 rounded-xl text-sm text-red-300">Feature settings could not refresh: {featureError}. {featureConfig ? 'Using the last loaded settings.' : 'Dashboard features are unavailable until settings load. Retrying automatically.'}</p>}
          {featureAllowed(activeTab) ? renderContent() : !featureError && <p className="text-sm text-gray-400">Loading dashboard feature settings...</p>}
        </main>
        )}
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR (Screens < lg / 1024px) */}
      {!tvMode && activeTab !== 'admin' && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0a2442]/95 backdrop-blur-2xl border-t border-[#cedc28]/20 px-2 py-1.5 flex items-center justify-around pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
          {NAV_ITEMS.filter(item => ['summary', 'campaign', 'weekly', 'channel'].includes(item.id)).map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${activeTab === item.id ? 'text-[#cedc28]' : 'text-slate-400 hover:text-white'}`}>
              <item.icon className="w-4 h-4" />
              <span className="text-[10px] font-bold">{item.label.replace(' View', '')}</span>
            </button>
          ))}

          <button
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              ['market', 'detailed', 'creative', 'admin'].includes(activeTab) ? 'text-[#cedc28]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
            <span className="text-[10px] font-bold">
              {activeTab === 'market' ? 'Market' : activeTab === 'detailed' ? 'Detailed' : activeTab === 'creative' ? 'Creative' : activeTab === 'admin' ? 'Admin' : 'More'}
            </span>
          </button>
        </nav>
      )}

      {/* Version badge */}
      <div className="hidden sm:flex fixed bottom-3 right-3 z-30 text-white/30 items-center gap-1 opacity-50 hover:opacity-100 transition-opacity bg-black/40 px-2 py-0.5 rounded-full border border-white/10 backdrop-blur-sm text-[8px] font-bold uppercase tracking-widest pointer-events-none">
        <Check className="w-3 h-3 text-[#cedc28]" />
        <span>V1 Universal</span>
      </div>

      {/* COMMAND PALETTE MODAL (CMD + K) */}
      {isQuickJumpOpen && featureAllowed('quickJump') && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsQuickJumpOpen(false)}
        >
          <div 
            className="w-full max-w-xl rounded-2xl border border-white/20 bg-[#071d33] shadow-2xl overflow-hidden text-white"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#041628]">
              <Search className="w-5 h-5 text-[#14a6d9] shrink-0" />
              <input
                type="text"
                autoFocus
                value={quickJumpSearch}
                onChange={e => setQuickJumpSearch(e.target.value)}
                placeholder="Jump to event, view, or tool..."
                className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">ESC</kbd>
            </div>

            {/* Results List */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-3">
              {/* Filtered Events & Nav Items */}
              {(() => {
                const q = quickJumpSearch.trim().toLowerCase();
                const matchedEvents = uniqueEvents.filter(ev => ev !== 'All' && (!q || ev.toLowerCase().includes(q)));
                const matchedNav = NAV_ITEMS.filter(item => featureAllowed(item.id) && (!q || item.label.toLowerCase().includes(q)));

                return (
                  <>
                    {matchedNav.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Views & Dashboards</div>
                        <div className="space-y-0.5">
                          {matchedNav.map(item => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setActiveTab(item.id);
                                setIsQuickJumpOpen(false);
                                setQuickJumpSearch('');
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-left transition ${
                                activeTab === item.id ? 'bg-[#14a6d9]/20 text-[#6bd5f7]' : 'hover:bg-white/5 text-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <item.icon className="w-4 h-4 text-[#14a6d9]" />
                                <span>{item.label}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">Jump →</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {matchedEvents.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Events</div>
                        <div className="grid grid-cols-2 gap-1">
                          {matchedEvents.map(ev => (
                            <button
                              key={ev}
                              type="button"
                              onClick={() => {
                                setSelectedEvent(ev);
                                setFilterEvents([ev]);
                                setActiveTab('campaign');
                                setIsQuickJumpOpen(false);
                                setQuickJumpSearch('');
                              }}
                              className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left bg-white/5 hover:bg-[#cedc28]/15 hover:text-[#cedc28] transition border border-transparent hover:border-[#cedc28]/30"
                            >
                              <span className="truncate">{ev}</span>
                              <span className="text-[10px] text-slate-500 shrink-0 font-mono">Open</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quick Utilities */}
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick Actions</div>
                      <div className="space-y-0.5">
                        {featureAllowed('currency') && (
                          <button
                            type="button"
                            onClick={() => {
                              toggleCurrency();
                              setIsQuickJumpOpen(false);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 transition"
                          >
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-emerald-400" />
                              <span>Toggle Currency (Currently {currency})</span>
                            </div>
                            <span className="text-[10px] text-slate-400">Switch to {currency === 'USD' ? 'SAR' : 'USD'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            resetFilters();
                            setIsQuickJumpOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 transition"
                        >
                          <div className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-[#cedc28]" />
                            <span>Reset All Filters</span>
                          </div>
                          <span className="text-[10px] text-slate-400">Clear filters</span>
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            
            {/* Footer */}
            <div className="px-4 py-2 border-t border-white/10 bg-[#041628] flex items-center justify-between text-[11px] text-slate-500">
              <span>Quickly navigate events and dashboard sections</span>
              <span className="font-mono">Tahaluf Intelligence</span>
            </div>
          </div>
        </div>
      )}
    </div>
    </DashboardFeatureContext.Provider>
  );
}
