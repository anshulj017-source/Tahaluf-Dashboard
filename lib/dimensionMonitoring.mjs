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
  try {
    return await readAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS);
  } catch (err) {
    return DEFAULT_DIMENSION_SETTINGS;
  }
}

export async function saveDimensionSelection(ids, options = {}) {
  const enabledDimensions = validateDimensionSelection(ids);
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({
    ...state,
    enabledDimensions,
    ...(typeof options?.ignoreBlanks === 'boolean' ? { ignoreBlanks: options.ignoreBlanks } : {})
  }));
}

export async function saveHealthCheckSettings(settings) {
  if (typeof settings?.metricChecksEnabled !== 'boolean' || typeof settings?.dimensionChecksEnabled !== 'boolean') {
    throw new Error('Metric and dimension check selections must be booleans.');
  }
  const { metricChecksEnabled, dimensionChecksEnabled } = settings;
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({
    ...state,
    metricChecksEnabled,
    dimensionChecksEnabled,
    ...(typeof settings?.ignoreBlanks === 'boolean' ? { ignoreBlanks: settings.ignoreBlanks } : {})
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
    return checkDimensionRows(text, { ...standards, ...settings, events });
  } catch (error) {
    console.error('[DIMENSION STANDARDS] Validation unavailable:', error);
    return { status: 'unavailable', checkedAt: new Date().toISOString(), error: error.message || String(error), groups: [] };
  }
}

export async function ignoreDimensionBlanks({ dimension, eventId = null, scope = 'event', author = 'Admin', reason = '' }) {
  if (!dimension || !DIMENSIONS.some(d => d.id === dimension)) {
    throw new Error('A valid dimension identifier is required.');
  }
  const cleanReason = String(reason || '').trim().slice(0, 300);
  const cleanAuthor = String(author || 'Admin').trim().slice(0, 100);
  const nowIso = new Date().toISOString();

  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    const versionHistory = Array.isArray(state.versionHistory) ? state.versionHistory : [];
    const newVersionEntry = {
      id: `blanks:${dimension}:${scope === 'event' && eventId ? eventId : 'global'}@${nowIso}`,
      action: 'IGNORE_BLANKS',
      dimension,
      eventId: scope === 'event' ? eventId : null,
      scope,
      author: cleanAuthor,
      reason: cleanReason,
      timestamp: nowIso
    };

    if (scope === 'event' && eventId) {
      const currentEventMap = state.ignoreBlanksByEventDimension?.[eventId] || {};
      return {
        ...state,
        ignoreBlanksByEventDimension: {
          ...(state.ignoreBlanksByEventDimension || {}),
          [eventId]: {
            ...currentEventMap,
            [dimension]: true
          }
        },
        versionHistory: [newVersionEntry, ...versionHistory].slice(0, 100)
      };
    } else {
      return {
        ...state,
        ignoreBlanksByDimension: {
          ...(state.ignoreBlanksByDimension || {}),
          [dimension]: true
        },
        versionHistory: [newVersionEntry, ...versionHistory].slice(0, 100)
      };
    }
  });
}

export async function unignoreDimensionBlanks({ dimension, eventId = null, scope = 'event', author = 'Admin' }) {
  if (!dimension || !DIMENSIONS.some(d => d.id === dimension)) {
    throw new Error('A valid dimension identifier is required.');
  }
  const nowIso = new Date().toISOString();
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    const versionHistory = Array.isArray(state.versionHistory) ? state.versionHistory : [];
    const newVersionEntry = {
      id: `unignore_blanks:${dimension}:${scope === 'event' && eventId ? eventId : 'global'}@${nowIso}`,
      action: 'RESTORE_BLANKS_CHECK',
      dimension,
      eventId: scope === 'event' ? eventId : null,
      scope,
      author: String(author || 'Admin').trim().slice(0, 100),
      timestamp: nowIso
    };

    if (scope === 'event' && eventId) {
      const currentEventMap = { ...(state.ignoreBlanksByEventDimension?.[eventId] || {}) };
      delete currentEventMap[dimension];
      return {
        ...state,
        ignoreBlanksByEventDimension: {
          ...(state.ignoreBlanksByEventDimension || {}),
          [eventId]: currentEventMap
        },
        versionHistory: [newVersionEntry, ...versionHistory].slice(0, 100)
      };
    } else {
      const currentDims = { ...(state.ignoreBlanksByDimension || {}) };
      delete currentDims[dimension];
      return {
        ...state,
        ignoreBlanksByDimension: currentDims,
        versionHistory: [newVersionEntry, ...versionHistory].slice(0, 100)
      };
    }
  });
}

export async function ignoreHealthIssue({
  issueKey,
  eventId = null,
  eventName = null,
  category = 'feed',
  status = 'unknown',
  message = '',
  reason = '',
  author = 'Admin'
}) {
  if (!issueKey || typeof issueKey !== 'string') {
    throw new Error('A valid issue key is required.');
  }
  const cleanAuthor = String(author || 'Admin').trim().slice(0, 100);
  const cleanReason = String(reason || message || 'Ignored by administrator').trim().slice(0, 300);
  const nowIso = new Date().toISOString();

  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    const ignoredIssues = Array.isArray(state.ignoredIssues) ? state.ignoredIssues : [];
    const filtered = ignoredIssues.filter(item => (typeof item === 'string' ? item !== issueKey : item?.key !== issueKey));
    const versionHistory = Array.isArray(state.versionHistory) ? state.versionHistory : [];

    const newEntry = {
      key: issueKey,
      eventId,
      eventName,
      category,
      status,
      message,
      reason: cleanReason,
      ignoredBy: cleanAuthor,
      ignoredAt: nowIso
    };

    let nextBlanksByEvent = state.ignoreBlanksByEvent || {};
    if (status === 'dimension-discrepancy' && eventId && String(message || '').toLowerCase().includes('blank')) {
      nextBlanksByEvent = { ...nextBlanksByEvent, [eventId]: true };
    }

    const versionEntry = {
      id: `ignore_issue:${issueKey}@${nowIso}`,
      action: 'IGNORE_ISSUE',
      issueKey,
      eventId,
      eventName,
      author: cleanAuthor,
      reason: cleanReason,
      timestamp: nowIso
    };

    return {
      ...state,
      ignoredIssues: [newEntry, ...filtered],
      ignoreBlanksByEvent: nextBlanksByEvent,
      versionHistory: [versionEntry, ...versionHistory].slice(0, 100)
    };
  });
}

export async function unignoreHealthIssue({ issueKey, author = 'Admin' }) {
  if (!issueKey || typeof issueKey !== 'string') {
    throw new Error('A valid issue key is required.');
  }
  const nowIso = new Date().toISOString();
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    const ignoredIssues = Array.isArray(state.ignoredIssues) ? state.ignoredIssues : [];
    const filtered = ignoredIssues.filter(item => (typeof item === 'string' ? item !== issueKey : item?.key !== issueKey));
    const versionHistory = Array.isArray(state.versionHistory) ? state.versionHistory : [];
    const versionEntry = {
      id: `unignore_issue:${issueKey}@${nowIso}`,
      action: 'RESTORE_ISSUE',
      issueKey,
      author: String(author || 'Admin').trim().slice(0, 100),
      timestamp: nowIso
    };
    return {
      ...state,
      ignoredIssues: filtered,
      versionHistory: [versionEntry, ...versionHistory].slice(0, 100)
    };
  });
}
