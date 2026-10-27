import { readAdminSetting, updateAdminSetting } from './adminSettingsStore.mjs';
import { DEFAULT_DIMENSION_SETTINGS, STANDARDS_URL, parseDimensionStandards, checkDimensionRows, validateDimensionSelection } from './dimensionStandards.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const cache = globalThis[Symbol.for('tahaluf.dimensionStandards')] ||= { pending: null };

export async function getDimensionSettings() {
  return readAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS);
}

export async function saveDimensionSelection(ids) {
  const enabledDimensions = validateDimensionSelection(ids);
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({ ...state, enabledDimensions }));
}

export async function saveHealthCheckSettings(settings) {
  if (typeof settings?.metricChecksEnabled !== 'boolean' || typeof settings?.dimensionChecksEnabled !== 'boolean') {
    throw new Error('Metric and dimension check selections must be booleans.');
  }
  const { metricChecksEnabled, dimensionChecksEnabled } = settings;
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({
    ...state, metricChecksEnabled, dimensionChecksEnabled
  }));
}

export async function saveEventHealthChecks(eventId, checks) {
  if (typeof eventId !== 'string' || !eventId || eventId.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(eventId)) {
    throw new Error('A valid event ID is required.');
  }
  const keys = ['monitoringEnabled', 'sheetChecksEnabled', 'metricChecksEnabled', 'dimensionChecksEnabled'];
  if (!checks || keys.some(key => typeof checks[key] !== 'boolean')) {
    throw new Error('All event check selections must be booleans.');
  }
  const selection = Object.fromEntries(keys.map(key => [key, checks[key]]));
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({
    ...state, eventChecks: { ...state.eventChecks, [eventId]: selection }
  }));
}

export async function loadDimensionStandards(force = false) {
  if (cache.pending) return cache.pending;
  cache.pending = (async () => {
    const state = await getDimensionSettings();
    if (!force && !state.error && state.values && Date.now() - Date.parse(state.fetchedAt) < DAY_MS) return { ...state, stale: false };
    if (!force && state.lastAttemptAt && Date.now() - Date.parse(state.lastAttemptAt) < 5 * 60_000) {
      return { ...state, stale: Boolean(state.values) };
    }
    const lastAttemptAt = new Date().toISOString();
    try {
      const response = await fetch(STANDARDS_URL, { signal: AbortSignal.timeout(10000), cache: 'no-store', redirect: 'follow' });
      if (!response.ok) throw new Error(`Standards sheet returned HTTP ${response.status}`);
      const values = parseDimensionStandards(await response.text());
      const saved = await updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, current => ({
        ...current, values, fetchedAt: new Date().toISOString(), lastAttemptAt, error: null
      }));
      return { ...saved, stale: false };
    } catch (error) {
      console.error('[DIMENSION STANDARDS] Refresh failed:', error);
      const saved = await updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, current => ({
        ...current, lastAttemptAt, error: error.message || String(error)
      }));
      return { ...saved, stale: Boolean(saved.values) };
    }
  })();
  try {
    return await cache.pending;
  } finally {
    cache.pending = null;
  }
}

export async function summarizeDimensions(text) {
  try {
    const settings = await getDimensionSettings();
    if (settings.dimensionChecksEnabled === false || settings.enabledDimensions?.length === 0) {
      return checkDimensionRows(text, { ...settings, enabledDimensions: [] });
    }
    return checkDimensionRows(text, await loadDimensionStandards());
  } catch (error) {
    console.error('[DIMENSION STANDARDS] Validation unavailable:', error);
    return { status: 'unavailable', checkedAt: new Date().toISOString(), error: error.message || String(error), groups: [] };
  }
}
