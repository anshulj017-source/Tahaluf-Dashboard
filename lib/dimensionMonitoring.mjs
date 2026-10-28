import { readAdminSetting, updateAdminSetting } from './adminSettingsStore.mjs';
import {
  DIMENSIONS,
  normalize,
  DEFAULT_DIMENSION_SETTINGS,
  STANDARDS_URL,
  parseDimensionStandards,
  checkDimensionRows,
  validateDimensionSelection
} from './dimensionStandards.mjs';

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

export async function saveCustomValues(customValues) {
  if (!customValues || typeof customValues !== 'object' || Array.isArray(customValues)) {
    throw new Error('Custom values must be an object keyed by dimension.');
  }
  const sanitized = {};
  for (const [id, list] of Object.entries(customValues)) {
    if (!DIMENSIONS.some(d => d.id === id)) continue;
    if (!Array.isArray(list)) continue;
    sanitized[id] = [...new Set(list.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 500);
  }
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({
    ...state, customValues: sanitized
  }));
}

export async function saveEventCustomValues(eventId, eventCustomValues) {
  if (typeof eventId !== 'string' || !eventId || eventId.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(eventId)) {
    throw new Error('A valid event ID is required.');
  }
  if (!eventCustomValues || typeof eventCustomValues !== 'object' || Array.isArray(eventCustomValues)) {
    throw new Error('Event custom values must be an object keyed by dimension.');
  }
  const sanitized = {};
  for (const [id, list] of Object.entries(eventCustomValues)) {
    if (!DIMENSIONS.some(d => d.id === id)) continue;
    if (!Array.isArray(list)) continue;
    sanitized[id] = [...new Set(list.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 500);
  }
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({
    ...state,
    eventCustomValues: {
      ...(state.eventCustomValues || {}),
      [eventId]: sanitized
    }
  }));
}

export async function saveExcludedValues(excludedValues) {
  if (!excludedValues || typeof excludedValues !== 'object' || Array.isArray(excludedValues)) {
    throw new Error('Excluded values must be an object keyed by dimension.');
  }
  const sanitized = {};
  for (const [id, list] of Object.entries(excludedValues)) {
    if (!DIMENSIONS.some(d => d.id === id)) continue;
    if (!Array.isArray(list)) continue;
    sanitized[id] = [...new Set(list.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 500);
  }
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({
    ...state, excludedValues: sanitized
  }));
}

export async function acceptDimensionValue({ dimension, value, eventId = null, scope = 'event' }) {
  if (!dimension || !DIMENSIONS.some(d => d.id === dimension)) {
    throw new Error('A valid dimension identifier is required.');
  }
  const cleanVal = String(value || '').trim();
  if (!cleanVal || cleanVal.length > 200) {
    throw new Error('Value must be a non-empty string up to 200 characters.');
  }

  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    if (scope === 'event' && eventId) {
      const currentEventMap = state.eventCustomValues?.[eventId] || {};
      const currentList = currentEventMap[dimension] || [];
      if (currentList.some(v => normalize(v) === normalize(cleanVal))) {
        return state;
      }
      return {
        ...state,
        eventCustomValues: {
          ...(state.eventCustomValues || {}),
          [eventId]: {
            ...currentEventMap,
            [dimension]: [...currentList, cleanVal]
          }
        }
      };
    } else {
      const currentList = state.customValues?.[dimension] || [];
      if (currentList.some(v => normalize(v) === normalize(cleanVal))) {
        return state;
      }
      return {
        ...state,
        customValues: {
          ...(state.customValues || {}),
          [dimension]: [...currentList, cleanVal]
        }
      };
    }
  });
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
    const standards = await loadDimensionStandards();
    let events = [];
    try {
      const { getEventsConfig } = await import('./eventsConfig.js');
      const config = await getEventsConfig();
      events = config.events || [];
    } catch {}
    return checkDimensionRows(text, { ...standards, events });
  } catch (error) {
    console.error('[DIMENSION STANDARDS] Validation unavailable:', error);
    return { status: 'unavailable', checkedAt: new Date().toISOString(), error: error.message || String(error), groups: [] };
  }
}
