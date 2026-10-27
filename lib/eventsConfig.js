import fs from 'fs';
import path from 'path';
import { getFirebaseAdmin } from './firebaseAdmin';

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
    business: 'B2B',
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
    business: 'B2B',
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
    business: 'derive',
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
    business: 'B2B',
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
    business: 'B2B',
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
    business: 'B2B',
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
    business: 'B2B',
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
    business: 'B2B',
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

function isVercelRuntime() {
  return process.env.VERCEL === '1';
}

function createInitialConfig() {
  return {
    version: 'v1.0.0',
    lastUpdated: new Date().toISOString(),
    updatedBy: 'System Default',
    events: DEFAULT_EVENTS
  };
}

function createInitialHistory(initialConfig) {
  return [{
    versionId: initialConfig.version,
    timestamp: initialConfig.lastUpdated,
    author: 'System Default',
    action: 'INIT',
    description: 'Initial factory configuration with all 8 Tahaluf events',
    eventsCount: DEFAULT_EVENTS.length,
    snapshot: initialConfig
  }];
}

function readBundledState() {
  let config;
  let history;
  try {
    config = fs.existsSync(CONFIG_FILE)
      ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      : createInitialConfig();
  } catch (error) {
    console.error('Error reading bundled eventsConfig.json:', error);
    config = createInitialConfig();
  }
  try {
    history = fs.existsSync(HISTORY_FILE)
      ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'))
      : createInitialHistory(config);
  } catch (error) {
    console.error('Error reading bundled eventsHistory.json:', error);
    history = createInitialHistory(config);
  }
  return { config, history };
}

function readFileState() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    const state = readBundledState();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(state.config, null, 2), 'utf-8');
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(state.history, null, 2), 'utf-8');
    return state;
  }
  return readBundledState();
}

function cacheState(state) {
  memoryCache = {
    config: state.config,
    history: state.history,
    lastRead: Date.now()
  };
  return state;
}

async function getFirestoreState() {
  const { adminDb } = getFirebaseAdmin();
  const docRef = adminDb.collection('appConfig').doc('events');
  const snapshot = await docRef.get();
  if (snapshot.exists) {
    return cacheState(snapshot.data());
  }

  const initialState = readBundledState();
  try {
    await docRef.create(initialState);
    return cacheState(initialState);
  } catch (error) {
    if (error.code !== 6 && error.code !== 'already-exists') throw error;
    const existingSnapshot = await docRef.get();
    if (!existingSnapshot.exists) throw error;
    return cacheState(existingSnapshot.data());
  }
}

async function getEventsState() {
  if (memoryCache.config && Date.now() - memoryCache.lastRead < CACHE_TTL_MS) {
    return { config: memoryCache.config, history: memoryCache.history || [] };
  }
  if (isVercelRuntime()) {
    try {
      return await getFirestoreState();
    } catch (error) {
      console.warn('[EVENTS CONFIG] Firestore unavailable (quota/network), using bundled state:', error?.message || error);
      return cacheState(readBundledState());
    }
  }
  return cacheState(readFileState());
}

export async function getEventsConfig() {
  return (await getEventsState()).config;
}

export async function getEventsHistory() {
  return (await getEventsState()).history;
}

function createUpdatedState(currentState, newEvents, description, author, actionType) {
  const { config: currentConfig, history } = currentState;
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
  return { config: updatedConfig, history: updatedHistory };
}

async function updateEventsState(update) {
  let updatedState;
  if (isVercelRuntime()) {
    const { adminDb } = getFirebaseAdmin();
    const docRef = adminDb.collection('appConfig').doc('events');
    updatedState = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(docRef);
      const currentState = snapshot.exists ? snapshot.data() : readBundledState();
      const nextState = update(currentState);
      transaction.set(docRef, nextState);
      return nextState;
    });
  } else {
    const currentState = readFileState();
    updatedState = update(currentState);
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updatedState.config, null, 2), 'utf-8');
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedState.history, null, 2), 'utf-8');
  }

  cacheState(updatedState);
  return updatedState;
}

export async function saveEventsConfig(newEvents, description = 'Updated events configuration', author = 'Admin', actionType = 'UPDATE') {
  return updateEventsState(currentState =>
    createUpdatedState(currentState, newEvents, description, author, actionType)
  );
}

export async function revertToVersion(versionId, author = 'Admin') {
  return updateEventsState(currentState => {
    const { history, config: currentConfig } = currentState;
    const targetEntry = history.find(h => h.versionId === versionId);

    if (!targetEntry || !targetEntry.snapshot) {
      throw new Error(`Version ${versionId} not found in history`);
    }

    // Create new rollback version
    const parts = (currentConfig.version || 'v1.0.0').replace('v', '').split('.').map(n => parseInt(n, 10) || 0);
    const nextVer = `v${parts[0]}.${parts[1]}.${(parts[2] || 0) + 1}`;

    const restoredConfig = {
      ...targetEntry.snapshot,
      version: nextVer,
      lastUpdated: new Date().toISOString(),
      updatedBy: author,
      revertedFrom: versionId
    };

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
    return { config: restoredConfig, history: updatedHistory };
  });
}

export async function resetToFactoryDefaults(author = 'Admin') {
  return saveEventsConfig(DEFAULT_EVENTS, 'Reset all events configuration to factory defaults', author, 'RESET');
}
