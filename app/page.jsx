"use client";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { 
  TrendingUp, Globe, Layers, Activity, DollarSign, MousePointer2, 
  Eye, Zap, LayoutDashboard, ChevronDown, Search, Check, ShoppingCart,
  TableProperties, MonitorPlay, BarChart3, Smartphone, List, Download, RefreshCw, Users, Calendar, LayoutTemplate, PieChart, Grid, Map
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
import InfoTooltip from './components/InfoTooltip';
const CustomView = dynamic(() => import('./CustomView'), { ssr: false });
import CreativeView from './CreativeView';

const GEO_URL = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

const BASE_URL = "/api/sheets?type=afc";
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
  <div className="card-surface backdrop-blur-2xl p-6 rounded-2xl border border-[#c88214]/20 shadow-lg relative overflow-hidden group hover:-translate-y-1 transition-transform">
    <div className="absolute top-0 right-0 w-24 h-24 bg-[#c88214]/10 rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-[#c88214]/20 transition-colors duration-500"></div>
    <div className="flex justify-between items-start relative z-10">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest">{label}</p>
          <InfoTooltip definition={definition} />
        </div>
        <h3 className={`text-2xl font-black ${color} truncate`} title={value}>{value}</h3>
      </div>
    </div>
  </div>
);

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
    <div ref={wrapperRef} className="relative w-[160px] z-30">
      <span className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest mb-1.5 block">{label}</span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1.5 surface-inset border border-[#c88214]/30 rounded-lg text-xs font-bold text-[#eef7f5] cursor-pointer flex justify-between items-center hover:border-[#c88214] transition-colors"
      >
        <span className="truncate pr-2">{selected.includes('All') ? 'All Selected' : selected.join(', ')}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-full h-0 z-50">
          <div className="w-full mt-2 card-surface backdrop-blur-3xl bg-[#011414]/90 border border-[#c88214]/30 rounded-xl shadow-2xl flex flex-col max-h-64 overflow-hidden">
            <div className="p-2 border-b border-[#c88214]/10 relative">
              <Search className="w-4 h-4 text-[#6fa89f] absolute left-4 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-black/30 text-[#eef7f5] text-xs font-bold pl-9 pr-3 py-2 rounded-lg outline-none border border-transparent focus:border-[#c88214]/50" />
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
    </div>
  );
};

const DataTable = ({ data, columns, totals }) => (
  <div className="overflow-x-auto card-surface rounded-2xl border border-[#c88214]/20 z-10 relative">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-black/25 border-b border-[#c88214]/20">
          {columns.map((col, i) => (
            <th key={i} className="px-6 py-4 text-[10px] font-black text-[#6fa89f] uppercase tracking-widest whitespace-nowrap">{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} className="border-b border-[#c88214]/10 hover:bg-[#c88214]/5 transition-colors">
            {columns.map((col, j) => (
              <td key={j} className="px-6 py-4 text-sm font-medium text-[#eef7f5] whitespace-nowrap">
                {col.format ? col.format(row[col.key], row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
        {totals && data.length > 0 && (
          <tr className="bg-black/40 border-t-2 border-[#c88214]/50">
            {columns.map((col, j) => (
              <td key={j} className="px-6 py-4 text-sm font-black text-[#c88214] whitespace-nowrap">
                {totals[col.key] !== undefined 
                  ? (col.format ? col.format(totals[col.key], totals) : totals[col.key])
                  : ''}
              </td>
            ))}
          </tr>
        )}
        {data.length === 0 && <tr><td colSpan={columns.length} className="px-6 py-8 text-center text-[#6fa89f] text-sm">No data available</td></tr>}
      </tbody>
    </table>
  </div>
);

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
  const [isGenerating, setIsGenerating] = useState(false);
  
  // State: Global Filters
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [filterCampaigns, setFilterCampaigns] = useState(['All']);
  const [filterMarkets, setFilterMarkets] = useState(['All']);
  const [filterPaidOrganic, setFilterPaidOrganic] = useState(['All']);
  const [filterGa4Properties, setFilterGa4Properties] = useState(['All']);
  
  // State: Currency
  const [currency, setCurrency] = useState('SAR'); // 'USD' or 'SAR'
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
    } else if (userRole !== 'non-finance' && ['CTR', 'Clicks'].includes(perfMetric)) {
      setPerfMetric('CPM');
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

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchPromises = CHANNELS.map(ch => 
      d3.csv(`${BASE_URL}&gid=${ch.gid}`).then(raw => {
        return raw.map(row => {
          const vals = Object.values(row);
          // Find 'DB' prefixed columns dynamically if they exist, otherwise fallback
          const rawCampDB = row['Campaign DB'] || row['Campaign name'] || row['Campaign Name'] || 'Unknown';
          const campDB = rawCampDB.replace(/\r/g, '').trim();
          const phaseDB = row['Phase DB'] || row['Phase'] || 'Unknown';
          const countryDB = normalizeMarket(row['Country DB'] || row['Country'] || 'Unknown');
          const langDB = row['Language DB'] || row['Language'] || 'Unknown';
          
          let finalChannel = ch.name;
          if (ch.name === 'DV360') finalChannel = 'Programmatic';
          if (ch.name === 'Google') finalChannel = 'Google Search';

          if (ch.subCol !== undefined && vals[ch.subCol] && vals[ch.subCol].trim() !== '') {
            const rawSub = vals[ch.subCol].trim();
            const lowerSub = rawSub.toLowerCase();
            if (lowerSub === 'youtube') {
              finalChannel = 'YouTube';
            }
          }
          if (finalChannel.toLowerCase() === 'meta') finalChannel = 'META';

          const bKey = Object.keys(row).find(k => k && k.trim() === 'Buying Type DB');
          let finalBuyingType = bKey && row[bKey] && row[bKey].trim() !== ''
            ? row[bKey].trim()
            : 'Unknown';
          
          let rawCost = parseMetric(row['Cost (USD)'] || row['Cost'] || row['Total cost'] || row['Total media cost'] || row['Spend']);
          if (ch.name === 'X') {
            rawCost = rawCost / 3.75;
          }

          return {
            date: row['Date'],
            dateObj: row['Date'] ? new Date(row['Date']) : null,
            campaignName: campDB,
            phase: phaseDB,
            buyingType: finalBuyingType,
            country: countryDB,
            language: langDB,
            channel: finalChannel,
            adName: (ch.name === 'Snapchat' || ch.name === 'X' || ch.name === 'DV360') ? vals[4] : (ch.name === 'Amazon' ? vals[5] : (ch.name === 'Google' ? vals[2] : (row['Ad name'] || row['Ad Name'] || 'Unknown'))),
            cost: rawCost,
            impressions: parseMetric(row['Impressions']),
            clicks: parseMetric(row['Clicks'] || row['Swipes'] || row['Link clicks'] || row['Click-throughs']),
            videoViews: parseMetric(vals[ch.viewsCol]), // based on user mapping
            videoViews6s: parseMetric(row['6-second video views'] || row['Three-second video views'] || 0),
            videoViews15s: parseMetric(row['15-second video views (focused view)'] || row['ThruPlay actions'] || 0),
            videoCompletions: parseMetric(vals[ch.compCol]), // approx 100% views mapped column
            purchases: ch.purchCol !== undefined ? parseMetric(vals[ch.purchCol]) : 0
          };
        });
      })
    );

    const googlePurchasesPromise = d3.csv(`${BASE_URL}&gid=${GOOGLE_PURCHASES_GID}`).then(raw => {
      return raw
        .filter(row => row['Conversion category'] === 'Purchase/Sale')
        .map(row => {
          let cName = row['Campaign DB'] || row['Campaign name'] || 'Unknown';
          const cNameUpper = cName.toUpperCase();
          if (cNameUpper.includes('AC27')) cName = 'AC27';
          else if (cNameUpper.includes('ACLE')) cName = 'ACLE';
          else if (cNameUpper.includes('FAN ID')) cName = 'Fan ID';
          else if (cNameUpper.includes('GULF CUP')) cName = 'Gulf Cup';
          else if (cNameUpper.includes('UNDER 17') || cNameUpper.includes('U17')) cName = 'Under 17';

          return {
            date: row['Date'],
            dateObj: row['Date'] ? new Date(row['Date']) : null,
            campaignName: cName,
            isAuxiliaryData: true,
            phase: row['Phase DB'] || row['Phase'] || 'Unknown',
            buyingType: row['Buying Type DB'] || 'Unknown',
            country: normalizeMarket(row['Country DB'] || row['Country'] || 'Unknown'),
            language: row['Language DB'] || row['Language'] || 'Unknown',
            channel: 'Google Search',
            adName: row['Ad group name'] || 'Unknown',
            cost: 0,
            impressions: 0,
            clicks: 0,
            videoViews: 0,
            videoViews6s: 0,
            videoViews15s: 0,
            videoCompletions: 0,
            purchases: parseMetric(row['Conversions'])
          };
      });
    });

    const tiktokPurchasesPromise = d3.csv(`${BASE_URL}&gid=1963494707`).then(raw => {
      return raw.map(row => {
        const vals = Object.values(row);
        let cName = row['Campaign DB'] || row['Campaign name'] || 'Unknown';
        const phaseDB = row['Phase DB'] || row['Phase'] || 'Unknown';
        const countryDB = row['Country DB'] || row['Country'] || 'Unknown';
        const langDB = row['Language DB'] || row['Language'] || 'Unknown';

        const dateVal = row['By Day'] || row['Date'];
        return {
          date: dateVal,
          dateObj: dateVal ? new Date(dateVal) : null,
          campaignName: cName,
          isAuxiliaryData: true,
          phase: phaseDB,
          buyingType: row['Buying Type DB'] || row['Buying Type'] || 'Unknown',
          country: normalizeMarket(countryDB),
          language: langDB,
          channel: 'TikTok',
          adName: row['Ad name'] || row['Ad Name'] || 'Unknown',
          cost: 0,
          impressions: 0,
          clicks: 0,
          videoViews: 0,
          videoViews6s: 0,
          videoViews15s: 0,
          videoCompletions: 0,
          purchases: parseMetric(vals[5]) // Column F is index 5
        };
      });
    });

    Promise.all([
      Promise.all(fetchPromises),
      d3.csv(`${BASE_URL}&gid=${GA4_GID}`),
      d3.csv(`${BASE_URL}&gid=${META_CREATIVE_GID}`),
      googlePurchasesPromise,
      tiktokPurchasesPromise
    ]).then(([channelResults, ga4Raw, metaCreativeRaw, googlePurchases, tiktokPurchases]) => {
      let combinedAds = [];
      channelResults.forEach(res => combinedAds = combinedAds.concat(res));
      combinedAds = combinedAds.concat(googlePurchases);
      combinedAds = combinedAds.concat(tiktokPurchases);
      
      const gaResults = ga4Raw.map(row => {
        const rawPaid = row['Paid/Organic'] || 'Unknown';
        let paidOrganic = 'Unknown';
        if (rawPaid.toLowerCase() === 'paid') paidOrganic = 'Paid';
        else if (rawPaid.toLowerCase() === 'organic') paidOrganic = 'Organic';
        else paidOrganic = rawPaid;

          const campKey = Object.keys(row).find(k => k && k.trim() === 'Campaign DB');
          const rawCamp = campKey ? row[campKey] : 'Unknown';
          const campaignName = (rawCamp || 'Unknown').replace(/\r/g, '').trim();
          
          return {
            date: row['Date'],
            dateObj: row['Date'] ? new Date(row['Date']) : null,
            sourceMedium: row['Session source / medium'],
            country: normalizeMarket(row['Country']),
            sessions: parseMetric(row['Sessions']),
            users: parseMetric(row['Total users']),
            engagedSessions: parseMetric(row['Engaged sessions']),
            newUsers: parseMetric(row['New users']),
            avgSessionDuration: parseMetric(row['Average session length (sec)']),
            itemViews: parseMetric(row['Item views']),
            addToCarts: parseMetric(row['Add-to-carts']),
            checkouts: parseMetric(row['Checkouts']),
            purchases: parseMetric(row['Purchases']),
            gaTickets: parseMetric(row['Item purchase quantity']),
            campaignName,
            paidOrganic,
            ga4Property: row['GA4 property'] || 'Unknown'
          };
      });

      const creativeResults = metaCreativeRaw.map(row => {
          let cName = row['Campaign name'] || row['Campaign DB'] || 'Unknown';
          const cNameUpper = cName.toUpperCase();
          if (cNameUpper.includes('AC27')) cName = 'AC27';
          else if (cNameUpper.includes('ACLE')) cName = 'ACLE';
          else if (cNameUpper.includes('FAN ID')) cName = 'Fan ID';
          else if (cNameUpper.includes('GULF CUP')) cName = 'Gulf Cup';
          else if (cNameUpper.includes('UNDER 17') || cNameUpper.includes('U17')) cName = 'Under 17';
          
          return {
            date: row['Date'] ? new Date(row['Date']) : null,
            campaignName: cName,
            phase: row['Phase DB'] || row['Phase'] || 'Unknown',
            adName: row['Ad name'] || 'Unknown',
            creativeName: row['Creative Name'] || row['Ad name'] || 'Unknown',
            adImageUrl: row['Ad creative image URL'] || '',
            impressions: parseMetric(row['Impressions']),
            clicks: parseMetric(row['Link clicks']),
            views: parseMetric(row['Three-second video views']),
            thruPlays: parseMetric(row['ThruPlay actions']),
            cost: parseMetric(row['Cost (USD)']),
            purchases: parseMetric(row['Purchases']),
            market: row['Country DB'] || 'Unknown',
            language: row['Language DB'] || 'Unknown',
            status: row['Status'] || row['Ad Delivery'] || row['Operation Status'] || 'Unknown',
            channel: 'META'
          };
      });

      // Fetch Planned Data
      const fetchPlanned = d3.csv("/api/sheets?type=planned").then(raw => {
        return raw.map(row => ({
          phase: row['Phase'] || 'Unknown',
          channel: row['Channel'] || 'Unknown',
          buyingType: row['Buying Type'] || 'Unknown',
          bookedUnits: parseMetric(row['Booked Units'] || '0'),
          plannedCost: parseFloat((row['Planned Budget'] || '0').replace(/[^0-9.-]+/g,"")),
          targetMarket: normalizeMarket(row['Target Market'] || 'Unknown')
        }));
      });

      // Fetch TikTok Creatives
      const fetchTikTok = fetch('/api/tiktok/creatives?advertiser_id=7598486787190997008')
        .then(res => res.json())
        .then(json => {
          if (!json.success || !json.data) return [];
          return json.data.map(item => {
            let cName = item.campaignName || item.adName || 'Unknown'; 
            // Try to extract standard campaign names from TikTok naming conventions
            const cNameUpper = cName.toUpperCase();
            if (cNameUpper.includes('AC27')) cName = 'AC27';
            else if (cNameUpper.includes('ACLE')) cName = 'ACLE';
            else if (cNameUpper.includes('FAN ID')) cName = 'Fan ID';
            else if (cNameUpper.includes('GULF CUP')) cName = 'Gulf Cup';
            else if (cNameUpper.includes('UNDER 17') || cNameUpper.includes('U17')) cName = 'Under 17';
            else cName = 'Unknown';
            
            return {
              date: item.dimensions?.stat_time_day ? new Date(item.dimensions.stat_time_day) : null,
              campaignName: cName,
              adName: item.adName || 'Unknown',
              creativeName: item.adName || 'Unknown',
              adImageUrl: item.thumbnailUrl || '',
              videoUrl: item.videoUrl || '',
              postUrl: item.postUrl || '',
              impressions: parseMetric(item.metrics?.impressions),
              clicks: parseMetric(item.metrics?.clicks),
              views: parseMetric(item.metrics?.video_play_actions), // Using video_play_actions if available, fallback mapped later if needed
              thruPlays: 0,
              cost: parseFloat(item.metrics?.spend) || 0,
              market: 'Unknown',
              language: 'Unknown',
              status: item.status || 'Unknown',
              channel: 'TikTok'
            };
          });
        })
        .catch(err => {
          console.error("Error fetching TikTok creatives:", err);
          return [];
        });

      Promise.all([fetchPlanned, fetchTikTok]).then(([plannedResults, tiktokResults]) => {
        // Merge TikTok purchases
        tiktokResults.forEach(tr => {
          const matchingPurchases = tiktokPurchases.filter(tp => tp.adName === tr.adName);
          tr.purchases = d3.sum(matchingPurchases, tp => tp.purchases);
          tr.phase = matchingPurchases.length > 0 ? matchingPurchases[0].phase : 'Unknown';
        });

        // Extract other channels from combinedAds
        const otherChannelsData = combinedAds
          .filter(ad => ad.channel && ad.channel.toUpperCase() !== 'META' && ad.channel.toUpperCase() !== 'TIKTOK' && !ad.isAuxiliaryData)
          .map(ad => ({
            date: ad.dateObj,
            campaignName: ad.campaignName,
            phase: ad.phase || 'Unknown',
            adName: ad.adName,
            creativeName: ad.adName,
            adImageUrl: '',
            videoUrl: '',
            postUrl: '',
            impressions: ad.impressions || 0,
            clicks: ad.clicks || 0,
            views: ad.videoViews || 0,
            thruPlays: 0,
            cost: ad.cost || 0,
            purchases: ad.purchases || 0,
            market: ad.country || 'Unknown',
            language: ad.language || 'Unknown',
            status: 'Unknown',
            channel: ad.channel
          }));

        setAdData(combinedAds);
        setGaData(gaResults);
        setCreativeData([...creativeResults, ...tiktokResults, ...otherChannelsData]);
        setPlannedData(plannedResults);
        
        const allDates = [...combinedAds, ...gaResults]
          .map(d => d.dateObj || d.date)
          .filter(d => d instanceof Date && !isNaN(d));
        if (allDates.length > 0) {
          const maxDate = new Date(Math.max(...allDates));
          setLastUpdated(maxDate);
        } else {
          setLastUpdated(new Date());
        }
        
        setLoading(false);
      });
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [isAuthenticated]);

  const resetFilters = () => {
    setFilterCampaigns(['All']);
    setFilterMarkets(['All']);
    setFilterPaidOrganic(['All']);
    setFilterGa4Properties(['All']);
    setDateRange({ start: '', end: '' });
  };

  const uniqueCampaigns = useMemo(() => Array.from(new Set(adData.map(d => d.campaignName))).sort(), [adData]);
  const uniqueMarkets = useMemo(() => {
    const combined = [...adData.map(d => d.country), ...gaData.map(d => d.country)];
    return Array.from(new Set(combined)).filter(Boolean).sort();
  }, [adData, gaData]);
  const uniquePaidOrganic = useMemo(() => Array.from(new Set(gaData.map(d => d.paidOrganic))).sort(), [gaData]);
  const uniqueGa4Properties = useMemo(() => Array.from(new Set(gaData.map(d => d.ga4Property))).filter(Boolean).sort(), [gaData]);

  // Apply filters to Ad Data
  const filteredAdData = useMemo(() => {
    return adData.filter(d => {
      if (!filterCampaigns.includes('All') && !filterCampaigns.includes(d.campaignName)) return false;
      if (!filterMarkets.includes('All') && !filterMarkets.includes(d.country)) return false;
      if (dateRange.start && d.dateObj && d.dateObj < new Date(dateRange.start)) return false;
      if (dateRange.end && d.dateObj && d.dateObj > new Date(dateRange.end)) return false;
      return true;
    });
  }, [adData, filterCampaigns, filterMarkets, dateRange]);

  const coreAdData = useMemo(() => filteredAdData.filter(d => !d.isAuxiliaryData), [filteredAdData]);

  // Apply filters to GA Data (only Date and Market apply)
  const filteredGaData = useMemo(() => {
    return gaData.filter(d => {
      let matchesCampaign = true;
      if (!filterCampaigns.includes('All')) {
        matchesCampaign = filterCampaigns.includes(d.campaignName);
        // Special rule for Gulf Cup: Include all traffic for Gulfcup GA property if Gulf Cup tournament is selected
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
    { id: 'summary', label: 'Summary View', icon: Grid },
    { id: 'campaign', label: 'Tournament View', icon: Activity },
    { id: 'channel', label: 'Channel View', icon: MonitorPlay },
    { id: 'market', label: 'Market View', icon: Map },
    { id: 'detailed', label: 'Detailed Split', icon: PieChart },
    { id: 'webtraffic', label: 'Web Traffic', icon: Users },
    { id: 'creative', label: 'Creative View', icon: LayoutTemplate },
  ];

  // Admin button is rendered separately at the bottom left

  if (isAuthLoading || loading) {
    return (
      <div className="min-h-screen app-bg flex flex-col items-center justify-center text-[#c88214] gap-6 relative overflow-hidden">
        <div className="relative flex flex-col items-center justify-center animate-pulse">
          <img src="/loc-logo/Saudi 2027-07.png" alt="Loading Logo" className="h-24 md:h-32 object-contain" onError={(e) => e.target.style.display = 'none'} />
        </div>
        <div className="flex flex-col items-center gap-2 z-10">
          <span className="text-sm md:text-base font-bold text-[#c88214] tracking-[0.2em]">
            {isAuthLoading ? "AUTHENTICATING" : "LOADING DATA"}
          </span>
          <div className="flex gap-1.5 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#c88214] animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-1.5 h-1.5 rounded-full bg-[#c88214] animate-bounce" style={{ animationDelay: '0.15s' }}></div>
            <div className="w-1.5 h-1.5 rounded-full bg-[#c88214] animate-bounce" style={{ animationDelay: '0.3s' }}></div>
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
              { image: { x: 8.8, y: 0.2, w: 0.65, h: 0.75, path: window.location.origin + "/loc-logo/Saudi 2027-10.png", sizing: { type: "contain" } } }
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
          let tourneyStr = (filterCampaigns && filterCampaigns.length > 0 && !filterCampaigns.includes('All')) ? filterCampaigns.join(', ') : 'All Tournaments';
          
          let filterText = `Duration: ${durationStr}\nTournament: ${tourneyStr}`;
          slide.addText(filterText, { x: 0.5, y: 3.5, w: "90%", h: 2, fontSize: 14, color: "CBBB9D", align: 'center', valign: 'top' });

          const slides = document.querySelectorAll('.export-slide');
          for (let i = 0; i < slides.length; i++) {
             const title = slides[i].getAttribute('data-title') || `Slide ${i + 1}`;
             await addSnapshotSlide(slides[i], title);
          }

          if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' });

          await pres.writeFile({ fileName: `AFC_Dashboard_Snapshot_${new Date().getTime()}.pptx` });
      } catch (err) {
          console.error("PPTX Error", err);
          alert("Error generating PPTX: " + (err.message || err.toString()));
      }
      setIsGenerating(false);
  };

  const renderContent = () => {
    if (activeTab === 'summary') {
      return (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 export-slide" data-title="Summary Metrics">
            {userRole !== 'non-finance' && (
              <MetricCard definition="The total amount of money spent on advertising campaigns across all channels." label="Total Spend" value={`${exSym}${formatShort(agg.cost * exRate)}`} color="text-white" icon={DollarSign} />
            )}
            <MetricCard definition="The total number of times your ads were displayed on screen to users." label="Impressions" value={formatShort(agg.impressions)} color="text-[#c88214]" icon={Eye} />
            <MetricCard definition="The number of times users clicked on your ads." label="Clicks" value={formatShort(agg.clicks)} color="text-[#6fa89f]" icon={MousePointer2} />
            <MetricCard definition="The total number of times your video ads were watched." label="Video Views" value={formatShort(agg.views)} color="text-[#00937b]" icon={MonitorPlay} />
            <MetricCard definition="The total number of times your video ads were watched to completion (100%)." label="Video Completions (100%)" value={formatShort(agg.completions)} color="text-white" icon={Check} />
            <MetricCard definition="The total number of sessions on the website originating from the ad campaigns." label="Total Web Sessions" value={formatShort(agg.sessions)} color="text-[#c88214]" icon={Globe} />
            <MetricCard definition="The total number of purchases reported by GA4." label="GA4 Purchases" value={formatShort(agg.gaPurchases)} color="text-[#00937b]" icon={ShoppingCart} />
            <MetricCard definition="The total quantity of tickets sold reported by GA4." label="GA4 Tickets Sales" value={formatShort(agg.gaTickets)} color="text-[#6fa89f]" icon={ShoppingCart} />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
             {/* Chart 1: Monthly Spend vs Impressions */}
             <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-xl h-[400px] export-slide" data-title="Monthly Trend">
                <h3 className="text-[#eef7f5] font-black mb-4 flex items-center gap-2">
                  {userRole === 'non-finance' ? 'Monthly Clicks vs Impressions' : 'Monthly Spend vs Impressions'} 
                  <InfoTooltip definition={userRole === 'non-finance' ? "A trend analysis comparing clicks against impressions generated over time." : "A trend analysis comparing the total advertising spend against the number of impressions generated over time."} />
                </h3>
                <ResponsiveContainer width="100%" height="90%">
                  <AreaChart data={monthlyChartData}>
                    <defs>
                      <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00937b" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#00937b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="month" stroke="#6fa89f" fontSize={10} />
                    <YAxis yAxisId="left" stroke="#00937b" fontSize={10} tickFormatter={(t) => userRole === 'non-finance' ? d3.format(",")(t) : `${exSym}${d3.format(",.2f")(t)}`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#6fa89f" fontSize={10} tickFormatter={(t) => d3.format(",")(t)} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#043e3f', borderColor: '#c8821420', color: '#fff' }} 
                      formatter={(value, name) => [name === 'Spend' ? `${exSym}${d3.format(",.2f")(value)}` : (name === 'CTR' ? `${d3.format(".2f")(value)}%` : d3.format(",")(value)), name]}
                    />
                    <Legend />
                    {userRole === 'non-finance' ? (
                      <Area yAxisId="left" type="monotone" dataKey="clicks" name="Clicks" stroke="#00937b" fillOpacity={1} fill="url(#colorCost)" />
                    ) : (
                      <Area yAxisId="left" type="monotone" dataKey="cost" name="Spend" stroke="#00937b" fillOpacity={1} fill="url(#colorCost)" />
                    )}
                    <Line yAxisId="right" type="monotone" dataKey="impressions" name="Impressions" stroke="#6fa89f" strokeWidth={3} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
             </div>
             
             {/* Chart 2: Performance by Channel */}
             <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-xl h-[400px] flex flex-col export-slide" data-title="Channel Performance">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-[#eef7f5] font-black flex items-center gap-2">{perfMetric} by Channel <InfoTooltip definition="A breakdown of key performance indicators (like CPM, CPC, CTR) segmented by the advertising channel." /></h3>
                  <div className="flex gap-2">
                    <div className="flex bg-[#011414] p-1 rounded-lg border border-[#c88214]/20">
                      {userRole !== 'non-finance' ? (
                        <>
                          <button onClick={() => setPerfMetric('CPM')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${perfMetric === 'CPM' ? 'gradient-gold text-[#043e3f]' : 'text-slate-400 hover:text-white'}`}>CPM</button>
                          <button onClick={() => setPerfMetric('CPC')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${perfMetric === 'CPC' ? 'gradient-gold text-[#043e3f]' : 'text-slate-400 hover:text-white'}`}>CPC</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setPerfMetric('CTR')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${perfMetric === 'CTR' ? 'gradient-gold text-[#043e3f]' : 'text-slate-400 hover:text-white'}`}>CTR</button>
                          <button onClick={() => setPerfMetric('Clicks')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${perfMetric === 'Clicks' ? 'gradient-gold text-[#043e3f]' : 'text-slate-400 hover:text-white'}`}>Clicks</button>
                        </>
                      )}
                    </div>
                    <div className="flex bg-[#011414] p-1 rounded-lg border border-[#c88214]/20">
                      <button onClick={() => setPerfSort('Top 5')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${perfSort === 'Top 5' ? 'gradient-teal text-white' : 'text-slate-400 hover:text-white'}`}>Top 5</button>
                      <button onClick={() => setPerfSort('Bottom 5')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${perfSort === 'Bottom 5' ? 'gradient-teal text-white' : 'text-slate-400 hover:text-white'}`}>Bottom 5</button>
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={channelPerformance} margin={{ left: 20 }}>
                    <defs>
                      <linearGradient id="tealBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00937b" />
                        <stop offset="100%" stopColor="#007542" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="channel" stroke="#6fa89f" fontSize={10} />
                    <YAxis stroke="#6fa89f" fontSize={10} tickFormatter={(t) => ['CPM', 'CPC'].includes(perfMetric) ? `${exSym}${d3.format(",.2f")(t)}` : perfMetric === 'CTR' ? `${t.toFixed(2)}%` : d3.format(",")(t)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#043e3f', borderColor: '#c8821420', color: '#fff' }}
                      cursor={{fill: '#ffffff10'}}
                      formatter={(value) => [userRole === 'non-finance' ? (perfMetric === 'CTR' ? `${d3.format(".2f")(value)}%` : d3.format(",")(value)) : `${exSym}${d3.format(",.2f")(value)}`, perfMetric]}
                    />
                    <Bar dataKey={perfMetric.toLowerCase()} name={perfMetric} fill="url(#tealBarGradient)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Chart 3: Top Countries Web Traffic (Full Width) */}
          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-xl h-[400px] mb-8 flex flex-col export-slide" data-title="Web Traffic by Country">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-[#eef7f5] font-black flex items-center gap-2">Top Countries by Web Traffic <InfoTooltip definition="A geographical representation showing which countries generate the highest volume of web traffic." /></h3>
              <div className="flex bg-[#011414] p-1 rounded-lg border border-[#c88214]/20">
                <button onClick={() => setGaMetric('Sessions')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${gaMetric === 'Sessions' ? 'gradient-gold text-[#043e3f]' : 'text-slate-400 hover:text-white'}`}>Sessions</button>
                <button onClick={() => setGaMetric('Users')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${gaMetric === 'Users' ? 'gradient-gold text-[#043e3f]' : 'text-slate-400 hover:text-white'}`}>Users</button>
                <button onClick={() => setGaMetric('Engaged Sessions')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${gaMetric === 'Engaged Sessions' ? 'gradient-gold text-[#043e3f]' : 'text-slate-400 hover:text-white'}`}>Engaged</button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={topCountriesGa} layout="vertical" margin={{ left: 20 }}>
                <defs>
                  <linearGradient id="goldBarGradientH" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#d99a2e" />
                    <stop offset="100%" stopColor="#c88214" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                <XAxis type="number" stroke="#6fa89f" fontSize={10} tickFormatter={(t) => d3.format(",")(t)} />
                <YAxis dataKey="country" type="category" stroke="#6fa89f" fontSize={10} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#043e3f', borderColor: '#c8821420', color: '#fff' }}
                  cursor={{fill: '#ffffff10'}}
                  formatter={(value) => [d3.format(",")(value), gaMetric]}
                />
                <Bar dataKey={gaMetric === 'Users' ? 'users' : gaMetric === 'Engaged Sessions' ? 'engagedSessions' : 'sessions'} name={gaMetric} fill="url(#goldBarGradientH)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Daily GA4 Sales Trend */}
          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-xl h-[400px] mb-8 export-slide" data-title="Daily GA4 Sales Trend">
            <h3 className="text-[#eef7f5] font-black mb-4 flex items-center gap-2">
              Daily GA4 Sales Trend
              <InfoTooltip definition="Daily trend of Purchases and Ticket Sales reported by GA4." />
            </h3>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={dailyGaChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="day" stroke="#6fa89f" fontSize={10} />
                <YAxis yAxisId="left" stroke="#00937b" fontSize={10} tickFormatter={(t) => d3.format(",")(t)} />
                <YAxis yAxisId="right" orientation="right" stroke="#c88214" fontSize={10} tickFormatter={(t) => d3.format(",")(t)} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#043e3f', borderColor: '#c8821420', color: '#fff' }} 
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="purchases" name="Purchases" stroke="#00937b" strokeWidth={3} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="tickets" name="Ticket Sales" stroke="#c88214" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card-surface-gold p-8 rounded-3xl border border-[#c88214]/30 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10"><Zap className="w-32 h-32 text-[#c88214]" /></div>
            <h3 className="text-xl font-black text-white mb-4 flex items-center gap-3"><Zap className="text-[#c88214] w-6 h-6"/> AI Performance Insights <InfoTooltip definition="Automated observations and key takeaways generated by analyzing the current data set." /></h3>
            <div className="text-[#eef7f5] leading-relaxed max-w-4xl space-y-2 relative z-10 font-medium">
              <p>• The top performing channel generated <strong>{formatShort(agg.views)}</strong> total video views.</p>
              <p>• We saw a total of <strong>{formatShort(agg.sessions)}</strong> web sessions based on GA4 data across the selected period.</p>
              {userRole !== 'non-finance' && <p>• The overall cost per view stands at <strong>{agg.views > 0 ? `${exSym}${((agg.cost * exRate) / agg.views).toFixed(4)}` : `${exSym}0`}</strong>, indicating highly efficient media delivery.</p>}
            </div>
          </div>
        </div>
      );
    }
    
    if (activeTab === 'campaign') {
      return (
        <div className="w-full h-full">
           <CampaignView adData={filteredAdData} plannedData={plannedData} exRate={exRate} exSym={exSym} formatShort={formatShort} userRole={userRole} filterMarkets={filterMarkets} />
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
          <div className="flex justify-between items-center card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-xl mb-4 flex-wrap gap-4 relative z-20">
            <div className="flex items-center gap-6">
              <h2 className="text-2xl font-black text-white flex items-center gap-3"><MonitorPlay className="text-[#c88214]" /> Web Traffic (GA4)</h2>
              <div className="flex items-end">
                <MultiSelect label="GA4 Property" options={uniqueGa4Properties} selected={filterGa4Properties} onChange={setFilterGa4Properties} />
              </div>
            </div>
            <div className="flex gap-4 items-end">
              <MultiSelect label="Paid / Organic" options={uniquePaidOrganic} selected={filterPaidOrganic} onChange={setFilterPaidOrganic} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5 gap-4">
            <MetricCard definition="A session is a group of user interactions with your website that take place within a given time frame." label="Sessions" value={formatShort(totalGaSessions)} icon={Eye} color="text-white" />
            <MetricCard definition="The number of sessions that lasted longer than 10 seconds, had a conversion event, or had 2 or more screen or page views." label="Engaged Sessions" value={formatShort(totalGaEngaged)} icon={Activity} color="text-[#6fa89f]" />
            <MetricCard definition="The number of users who interacted with your site or launched your app for the first time." label="New Users" value={formatShort(totalGaNewUsers)} icon={TrendingUp} color="text-white" />
            <MetricCard definition="The total number of unique users who logged an event." label="Total Users" value={formatShort(totalGaUsers)} icon={MousePointer2} color="text-[#c88214]" />
            
            <MetricCard definition="The total number of times items were viewed." label="Item Views" value={formatShort(totalItemViews)} icon={Eye} color="text-[#6fa89f]" />
            <MetricCard definition="The total number of times items were added to the cart." label="Add to Carts" value={formatShort(totalAddToCart)} icon={Activity} color="text-white" />
            <MetricCard definition="The total number of times users initiated a checkout." label="Checkouts" value={formatShort(totalCheckouts)} icon={MousePointer2} color="text-[#c88214]" />
            <MetricCard definition="The total number of completed purchases." label="Purchases" value={formatShort(totalPurchases)} icon={TrendingUp} color="text-[#6fa89f]" />
            <MetricCard definition="The average duration (in seconds) of user sessions." label="Avg Session (s)" value={d3.format(",.1f")(avgDuration)} icon={List} color="text-white" />
            <MetricCard definition="The total quantity of tickets sold reported by GA4." label="GA4 Tickets Sales" value={formatShort(totalGaTickets)} icon={ShoppingCart} color="text-[#c88214]" />
          </div>

          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-xl relative">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[#eef7f5] font-black flex items-center gap-2">Global Web Traffic <InfoTooltip definition="An overview of web traffic performance metrics distributed across a global map." /></h3>
              <div className="flex gap-2">
                {['Sessions', 'Engaged Sessions', 'Total Users'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMapMetric(m)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${mapMetric === m ? 'gradient-gold text-[#043e3f]' : 'bg-[#011414] text-[#c88214] border border-[#c88214]/30 hover:bg-[#c88214]/20'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="w-full h-[500px] bg-[#011414]/50 rounded-2xl overflow-hidden border border-[#c88214]/10 relative">
              <div className="absolute bottom-6 left-6 bg-[#011414]/80 backdrop-blur-md border border-[#c88214]/20 p-4 rounded-xl flex flex-col gap-2 z-10 w-40 shadow-2xl">
                <span className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest mb-1">{mapMetric}</span>
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
                            stroke="#043e3f"
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
              <ReactTooltip id="map-tooltip" style={{ backgroundColor: '#043e3f', color: '#c88214', fontWeight: 'bold' }} />
            </div>
          </div>
          
          {/* Daily GA4 Sales Trend */}
          <div className="card-surface backdrop-blur-2xl p-6 rounded-3xl border border-[#c88214]/20 shadow-xl h-[400px] mb-8 export-slide" data-title="Daily GA4 Sales Trend">
            <h3 className="text-[#eef7f5] font-black mb-4 flex items-center gap-2">
              Daily GA4 Sales Trend
              <InfoTooltip definition="Daily trend of Purchases and Ticket Sales reported by GA4." />
            </h3>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={dailyGaChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="day" stroke="#6fa89f" fontSize={10} />
                <YAxis yAxisId="left" stroke="#00937b" fontSize={10} tickFormatter={(t) => d3.format(",")(t)} />
                <YAxis yAxisId="right" orientation="right" stroke="#c88214" fontSize={10} tickFormatter={(t) => d3.format(",")(t)} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#043e3f', borderColor: '#c8821420', color: '#fff' }} 
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="purchases" name="Purchases" stroke="#00937b" strokeWidth={3} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="tickets" name="Ticket Sales" stroke="#c88214" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <GaChannelTable rawData={filteredGaData} formatShort={formatShort} />
        </div>
      );
    }
    if (activeTab === 'creative') {
      const filteredCreativeData = creativeData.filter(d => {
        if (!filterCampaigns.includes('All') && !filterCampaigns.includes(d.campaignName)) return false;
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
    <div className="h-screen overflow-hidden app-bg font-sans selection:bg-[#c88214]/30 text-white flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#011414]/95 backdrop-blur-xl border-b border-[#c88214]/20 px-8 py-4 flex flex-wrap gap-4 items-center justify-between shadow-2xl relative">
        <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none"></div>
        <div className="flex items-center gap-4 relative z-10">
          <img src="/loc-logo/Saudi 2027-07.png" alt="AFC Logo" className="h-24 object-contain" onError={(e) => e.target.style.display = 'none'} />
          <div>
            <h1 className="text-xl font-black text-white tracking-tight uppercase">Local Organising Committee</h1>
            <p className="text-[10px] font-black text-[#c88214] uppercase tracking-[0.2em]">Tournament Performance Dashboard</p>
            {lastUpdated && (
              <p className="text-[9px] font-bold text-[#6fa89f] mt-1 uppercase tracking-wider opacity-80">
                Data up to: {lastUpdated.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex gap-3 flex-wrap flex-1 justify-end items-end relative z-10">
          <div className="flex flex-col gap-1">
             <span className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest block">Start Date</span>
             <input type="date" value={dateRange.start} onClick={e => e.target.showPicker && e.target.showPicker()} onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} className="w-[160px] cursor-pointer px-2.5 py-1.5 surface-inset border border-[#c88214]/30 rounded-lg text-xs font-bold text-[#eef7f5] outline-none focus:border-[#c88214] transition-colors [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100" />
          </div>
          <div className="flex flex-col gap-1">
             <span className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest block">End Date</span>
             <input type="date" value={dateRange.end} onClick={e => e.target.showPicker && e.target.showPicker()} onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} className="w-[160px] cursor-pointer px-2.5 py-1.5 surface-inset border border-[#c88214]/30 rounded-lg text-xs font-bold text-[#eef7f5] outline-none focus:border-[#c88214] transition-colors [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100" />
          </div>

          { activeTab !== 'campaign' ? (
            <MultiSelect label="Tournament" options={uniqueCampaigns} selected={filterCampaigns} onChange={setFilterCampaigns} />
          ) : (
            <div className="opacity-30 pointer-events-none" title="Tournament filter is disabled for this view">
              <MultiSelect label="Tournament" options={uniqueCampaigns} selected={filterCampaigns} onChange={setFilterCampaigns} />
            </div>
          )}
          <MultiSelect label="Market" options={uniqueMarkets} selected={filterMarkets} onChange={setFilterMarkets} />
          
          <div className="flex items-end gap-3 ml-2">
             {userRole !== 'non-finance' && (
               <div className="flex flex-col gap-1">
                 <span className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest block">Currency</span>
                 <div className="flex bg-[#065c5d]/20 backdrop-blur-md p-0.5 rounded-lg border border-[#c88214]/30">
                   <button onClick={() => setCurrency('USD')} className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${currency === 'USD' ? 'gradient-gold text-[#043e3f]' : 'text-slate-400 hover:text-white'}`}>USD</button>
                   <button onClick={() => setCurrency('SAR')} className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${currency === 'SAR' ? 'gradient-gold text-[#043e3f]' : 'text-slate-400 hover:text-white'}`}>SAR</button>
                 </div>
               </div>
             )}
             {(dateRange.start || dateRange.end) && activeTab !== 'summary' && (
               <button 
                 onClick={generatePpt}
                 disabled={isGenerating}
                 title="Export Dashboard to PPTX"
                 className="p-1.5 bg-[#74FA93]/10 border border-[#74FA93]/30 text-[#74FA93] rounded-lg hover:bg-[#74FA93]/20 hover:text-white transition-colors flex items-center justify-center disabled:opacity-50"
               >
                 {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5"/>}
               </button>
             )}
             <button onClick={resetFilters} className="px-3 py-1.5 bg-[#c88214]/10 border border-[#c88214]/50 text-[#c88214] text-[10px] uppercase font-black rounded-lg hover:bg-[#c88214]/20 hover:text-white transition-colors flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3"/> Reset</button>
             <button onClick={handleSignOut} className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] uppercase font-black rounded-lg hover:bg-red-500/20 hover:text-red-300 transition-colors flex items-center justify-center gap-1">Sign Out</button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR TABS */}
        <div className="w-64 border-r border-[#c88214]/10 bg-[#011414] flex flex-col gap-2 overflow-y-auto z-20 relative">
          <div className="pattern-overlay absolute inset-0 z-0 pointer-events-none" style={{ opacity: 0.20 }}></div>
          <div className="p-6 pb-2 relative z-10">
            <div className="text-[10px] font-black text-[#6fa89f] uppercase tracking-widest mb-4 px-4">Navigation</div>
          {NAV_ITEMS.map(t => {
            const active = activeTab === t.id;
            return (
              <button 
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl font-bold transition-all ${
                  active ? 'gradient-gold text-[#043e3f] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#eef7f5] hover:bg-[#c88214]/10 hover:text-[#c88214]'
                }`}
              >
                <t.icon className="w-5 h-5" />
                {t.label}
              </button>
            )
          })}
          </div>
          <div className="flex-1 min-h-[100px] mt-8"></div>
          {userRole === 'admin' && (
            <div className="mt-auto p-6 pt-0 z-30">
              <button 
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl font-bold transition-all ${
                  activeTab === 'admin' ? 'gradient-gold text-[#043e3f] shadow-[0_0_15px_rgba(200,130,20,0.35)]' : 'text-[#eef7f5] hover:bg-[#c88214]/10 hover:text-[#c88214]'
                }`}
              >
                <Users className="w-5 h-5" />
                Admin
              </button>
            </div>
          )}
        </div>
        
        {/* TABS CONTENT */}
        {activeTab === 'admin' ? (
          <AdminView />
        ) : (
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10">
          <div className="absolute top-0 right-0 w-full h-[500px] bg-gradient-to-br from-[#062f2e]/20 via-transparent to-transparent pointer-events-none -z-10"></div>
          {renderContent()}
        </main>
        )}
      </div>
    </div>
  );
}
