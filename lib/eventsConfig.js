import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'eventsConfig.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'eventsHistory.json');

// Factory default events configuration matching the live Tahaluf Dashboard
export const DEFAULT_EVENTS = [
  {
    id: 'gsts-26',
    name: 'GSTS 26',
    sourceName: 'GSTS',
    portfolio: 'P1',
    enabled: true,
    status: 'active', // 'active' (public) | 'admin_only' (testing) | 'inactive'
    visibility: 'public', // 'public' | 'admin_only'
    sheetType: 'combined',
    gid: '', // Default root sheet
    plannedGid: '2019892532',
    plannedType: 'standard',
    launchDate: '2026-12-18',
    startDate: '',
    endDate: '',
    dateFilterMode: 'none',
    eventType: 'Exhibition',
    description: 'Global Smart Transport Summit 2026',
    channelFilters: { meta: true, google: true, linkedin: true, tiktok: true, x: true }
  },
  {
    id: 'saif-26',
    name: 'SAIF 26',
    sourceName: 'SAIF 26',
    portfolio: 'P1',
    enabled: true,
    status: 'active',
    visibility: 'public',
    sheetType: 'combined',
    gid: '1196409184',
    plannedGid: '570639072',
    plannedType: 'standard',
    launchDate: '2026-11-24',
    startDate: '',
    endDate: '',
    dateFilterMode: 'none',
    eventType: 'Conference',
    description: 'Saudi Artificial Intelligence Forum 2026',
    channelFilters: { meta: true, google: true, linkedin: true, tiktok: true, x: true }
  },
  {
    id: 'kog-26',
    name: 'KoG 26',
    sourceName: 'KoG 26',
    portfolio: 'P1',
    enabled: true,
    status: 'active',
    visibility: 'public',
    sheetType: 'combined',
    gid: '1486784585',
    plannedGid: '1766297835',
    plannedType: 'standard',
    launchDate: '2026-12-01',
    startDate: '',
    endDate: '',
    dateFilterMode: 'none',
    eventType: 'Exhibition',
    description: 'Kingdom of Gaming 2026',
    channelFilters: { meta: true, google: true, linkedin: true, tiktok: true, x: true }
  },
  {
    id: 'black-hat',
    name: 'Black Hat',
    sourceName: 'BLACK HAT',
    portfolio: 'P1',
    enabled: true,
    status: 'active',
    visibility: 'public',
    sheetType: 'combined',
    gid: '659941332',
    plannedGid: '277310277',
    plannedType: 'blackhat-text',
    launchDate: '2026-12-01',
    startDate: '',
    endDate: '',
    dateFilterMode: 'none',
    eventType: 'Exhibition',
    description: 'Black Hat MEA 2026',
    channelFilters: { meta: true, google: true, linkedin: true, tiktok: true, x: true }
  },
  {
    id: 'smlc-26',
    name: 'SMLC 26',
    sourceName: 'SMLC 26',
    portfolio: 'P3',
    enabled: true,
    status: 'active',
    visibility: 'public',
    sheetType: 'combined',
    gid: '1526538255',
    plannedGid: '', // Pending from client
    plannedType: 'standard',
    launchDate: '2026-10-21',
    startDate: '',
    endDate: '',
    dateFilterMode: 'none',
    eventType: 'Exhibition',
    description: 'Saudi Maritime Logistics Congress 2026',
    channelFilters: { meta: true, google: true, linkedin: true, tiktok: true, x: true }
  },
  {
    id: 'idws-26',
    name: 'IDWS 26',
    sourceName: 'IDWS 26',
    portfolio: 'P3',
    enabled: true,
    status: 'active',
    visibility: 'public',
    sheetType: 'combined',
    gid: '1121987876',
    plannedGid: '',
    plannedType: 'standard',
    launchDate: '2026-12-14',
    startDate: '2026-06-01',
    endDate: '',
    dateFilterMode: 'min-date',
    eventType: 'Exhibition',
    description: 'International Digital Workplace Summit 2026 (Active from June 2026)',
    channelFilters: { meta: true, google: true, linkedin: true, tiktok: true, x: true }
  },
  {
    id: 'bio-cphi-main',
    name: 'BIO 26 & CPHI 26',
    sourceName: 'BIO / CPHI',
    portfolio: 'P3',
    enabled: true,
    status: 'active',
    visibility: 'public',
    sheetType: 'combined',
    gid: '1728688512',
    plannedGid: '',
    plannedType: 'standard',
    launchDate: '2026-12-14',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    dateFilterMode: 'year-2026',
    eventType: 'Both',
    description: 'BIO 26 & CPHI 26 Main Campaigns (Meta, Google Ads, LinkedIn)',
    channelFilters: { meta: true, google: true, linkedin: true, tiktok: true, x: true }
  },
  {
    id: 'cphi-li',
    name: 'CPHI 26 (LinkedIn)',
    sourceName: 'CPHI 26',
    portfolio: 'P3',
    enabled: true,
    status: 'active',
    visibility: 'public',
    sheetType: 'combined',
    gid: '208497314',
    plannedGid: '',
    plannedType: 'standard',
    launchDate: '2026-12-14',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    dateFilterMode: 'year-2026',
    eventType: 'Exhibition',
    description: 'CPHI 26 Dedicated LinkedIn Performance Sheet',
    channelFilters: { meta: false, google: false, linkedin: true, tiktok: false, x: false }
  }
];

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

let memoryCache = {
  config: null,
  history: null,
  lastRead: 0
};
const CACHE_TTL_MS = 60 * 1000; // 60s memory cache

export function invalidateEventsCache() {
  memoryCache = { config: null, history: null, lastRead: 0 };
}

export function getEventsConfig() {
  if (memoryCache.config && (Date.now() - memoryCache.lastRead < CACHE_TTL_MS)) {
    return memoryCache.config;
  }

  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    // Initialize with default
    const initialConfig = {
      version: 'v1.0.0',
      lastUpdated: new Date().toISOString(),
      updatedBy: 'System Default',
      events: DEFAULT_EVENTS
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(initialConfig, null, 2), 'utf-8');
    
    // Initialize initial history entry
    const initialHistory = [{
      versionId: 'v1.0.0',
      timestamp: new Date().toISOString(),
      author: 'System Default',
      action: 'INIT',
      description: 'Initial factory configuration with all 8 Tahaluf events',
      eventsCount: DEFAULT_EVENTS.length,
      snapshot: initialConfig
    }];
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(initialHistory, null, 2), 'utf-8');
    memoryCache.config = initialConfig;
    memoryCache.history = initialHistory;
    memoryCache.lastRead = Date.now();
    return initialConfig;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    memoryCache.config = parsed;
    memoryCache.lastRead = Date.now();
    return parsed;
  } catch (err) {
    console.error('Error reading eventsConfig.json, returning default:', err);
    return {
      version: 'v1.0.0',
      lastUpdated: new Date().toISOString(),
      updatedBy: 'System Fallback',
      events: DEFAULT_EVENTS
    };
  }
}

export function getEventsHistory() {
  if (memoryCache.history && (Date.now() - memoryCache.lastRead < CACHE_TTL_MS)) {
    return memoryCache.history;
  }

  ensureConfigDir();
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    memoryCache.history = parsed;
    return parsed;
  } catch (err) {
    console.error('Error reading eventsHistory.json:', err);
    return [];
  }
}

export function saveEventsConfig(newEvents, description = 'Updated events configuration', author = 'Admin', actionType = 'UPDATE') {
  ensureConfigDir();
  const currentConfig = getEventsConfig();
  const history = getEventsHistory();

  // Generate next version (e.g. v1.0.1)
  const currentVer = currentConfig.version || 'v1.0.0';
  const parts = currentVer.replace('v', '').split('.').map(n => parseInt(n, 10) || 0);
  const nextVer = `v${parts[0]}.${parts[1]}.${(parts[2] || 0) + 1}`;

  const updatedConfig = {
    version: nextVer,
    lastUpdated: new Date().toISOString(),
    updatedBy: author,
    events: newEvents
  };

  // Write new config
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2), 'utf-8');

  // Append to history (keep up to 50 snapshots)
  const newHistoryEntry = {
    versionId: nextVer,
    timestamp: new Date().toISOString(),
    author,
    action: actionType,
    description,
    eventsCount: newEvents.length,
    snapshot: updatedConfig
  };

  const updatedHistory = [newHistoryEntry, ...history].slice(0, 50);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory, null, 2), 'utf-8');

  memoryCache.config = updatedConfig;
  memoryCache.history = updatedHistory;
  memoryCache.lastRead = Date.now();

  return { config: updatedConfig, history: updatedHistory };
}

export function revertToVersion(versionId, author = 'Admin') {
  ensureConfigDir();
  const history = getEventsHistory();
  const targetEntry = history.find(h => h.versionId === versionId);

  if (!targetEntry || !targetEntry.snapshot) {
    throw new Error(`Version ${versionId} not found in history`);
  }

  // Create new rollback version
  const currentConfig = getEventsConfig();
  const parts = (currentConfig.version || 'v1.0.0').replace('v', '').split('.').map(n => parseInt(n, 10) || 0);
  const nextVer = `v${parts[0]}.${parts[1]}.${(parts[2] || 0) + 1}`;

  const restoredConfig = {
    ...targetEntry.snapshot,
    version: nextVer,
    lastUpdated: new Date().toISOString(),
    updatedBy: author,
    revertedFrom: versionId
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(restoredConfig, null, 2), 'utf-8');

  const rollbackEntry = {
    versionId: nextVer,
    timestamp: new Date().toISOString(),
    author,
    action: 'REVERT',
    description: `Reverted to version ${versionId} ("${targetEntry.description}")`,
    eventsCount: restoredConfig.events.length,
    snapshot: restoredConfig
  };

  const updatedHistory = [rollbackEntry, ...history].slice(0, 50);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory, null, 2), 'utf-8');

  memoryCache.config = restoredConfig;
  memoryCache.history = updatedHistory;
  memoryCache.lastRead = Date.now();

  return { config: restoredConfig, history: updatedHistory };
}

export function resetToFactoryDefaults(author = 'Admin') {
  ensureConfigDir();
  return saveEventsConfig(DEFAULT_EVENTS, 'Reset all events configuration to factory defaults', author, 'RESET');
}
