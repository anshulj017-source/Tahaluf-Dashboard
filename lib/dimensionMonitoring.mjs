import { readAdminSetting, updateAdminSetting } from './adminSettingsStore.mjs';
import {
  DIMENSIONS,
  AVAILABLE_METRICS,
  normalize,
  DEFAULT_DIMENSION_SETTINGS,
  MAX_HEALTH_ISSUE_IGNORE_DAYS,
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

export async function saveMetricSelection(enabledMetrics, options = {}) {
  if (!Array.isArray(enabledMetrics)) {
    throw new Error('Enabled metrics must be an array.');
  }
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    const validMetricIds = new Set([
      ...AVAILABLE_METRICS.map(m => m.id),
      ...(state.customMetrics || []).map(m => m.id),
      ...(options.customMetrics || []).map(m => m.id)
    ]);
    const filtered = enabledMetrics.filter(id => validMetricIds.has(id));
    return {
      ...state,
      enabledMetrics: filtered,
      ...(options.customMetrics ? { customMetrics: options.customMetrics } : {}),
      ...(options.metricTolerances ? { metricTolerances: { ...state.metricTolerances, ...options.metricTolerances } } : {})
    };
  });
}

export async function addCustomMetric(metricDef) {
  if (!metricDef || typeof metricDef !== 'object') {
    throw new Error('A valid metric definition is required.');
  }
  const id = String(metricDef.id || metricDef.label || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!id) throw new Error('A valid metric identifier or label is required.');

  const newMetric = {
    id,
    label: String(metricDef.label || id).trim(),
    columnRegex: String(metricDef.columnRegex || `^${id}$`).trim(),
    unit: String(metricDef.unit || 'cnt').trim(),
    defaultTolerancePercent: Number(metricDef.tolerancePercent ?? metricDef.defaultTolerancePercent ?? 1.0),
    minDrop: Number(metricDef.minDrop ?? 1.0),
    description: String(metricDef.description || `Custom monitored metric for ${id}`).trim()
  };

  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    const existing = (state.customMetrics || []).filter(m => m.id !== id);
    const enabled = new Set(state.enabledMetrics || AVAILABLE_METRICS.map(m => m.id));
    enabled.add(id);
    return {
      ...state,
      customMetrics: [...existing, newMetric],
      enabledMetrics: Array.from(enabled),
      metricTolerances: {
        ...(state.metricTolerances || {}),
        [id]: { percent: newMetric.defaultTolerancePercent, minDrop: newMetric.minDrop }
      }
    };
  });
}

export async function removeCustomMetric(metricId) {
  if (!metricId) throw new Error('Metric ID is required.');
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    const nextCustom = (state.customMetrics || []).filter(m => m.id !== metricId);
    const nextEnabled = (state.enabledMetrics || []).filter(id => id !== metricId);
    const nextTolerances = { ...(state.metricTolerances || {}) };
    delete nextTolerances[metricId];
    return {
      ...state,
      customMetrics: nextCustom,
      enabledMetrics: nextEnabled,
      metricTolerances: nextTolerances
    };
  });
}

export async function saveHealthCheckSettings(settings) {
  if (typeof settings?.metricChecksEnabled !== 'boolean' || typeof settings?.dimensionChecksEnabled !== 'boolean') {
    throw new Error('Metric and dimension check selections must be booleans.');
  }
  const { metricChecksEnabled, dimensionChecksEnabled } = settings;
  const activityChecksEnabled = typeof settings?.activityChecksEnabled === 'boolean' ? settings.activityChecksEnabled : true;
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({
    ...state,
    metricChecksEnabled,
    dimensionChecksEnabled,
    activityChecksEnabled,
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
  if (typeof checks.activityChecksEnabled === 'boolean') {
    selection.activityChecksEnabled = checks.activityChecksEnabled;
  }
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => ({
    ...state, eventChecks: { ...state.eventChecks, [eventId]: selection }
  }));
}

export async function saveEventActivityStatus({
  eventId,
  status,
  lastDataDate = null,
  eventRows = 0,
  author = 'Admin'
}) {
  if (typeof eventId !== 'string' || !eventId || eventId.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(eventId)) {
    throw new Error('A valid event ID is required.');
  }
  if (!['active', 'paused', 'ended'].includes(status)) {
    throw new Error('Event activity status must be active, paused, or ended.');
  }
  if (lastDataDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(lastDataDate)) {
    throw new Error('The event last-data date must use YYYY-MM-DD format.');
  }
  if (!Number.isInteger(Number(eventRows)) || Number(eventRows) < 0) {
    throw new Error('Event row count must be a non-negative integer.');
  }

  const timestamp = new Date().toISOString();
  const cleanAuthor = String(author || 'Admin').trim().slice(0, 100);
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    const eventStatuses = { ...(state.eventStatuses || {}) };
    if (status === 'active') {
      delete eventStatuses[eventId];
    } else {
      eventStatuses[eventId] = {
        status,
        lastDataDate,
        eventRows: Number(eventRows),
        changedAt: timestamp,
        changedBy: cleanAuthor
      };
    }
    const versionHistory = Array.isArray(state.versionHistory) ? state.versionHistory : [];
    return {
      ...state,
      eventStatuses,
      versionHistory: [{
        id: `event_${status}:${eventId}@${timestamp}`,
        action: status === 'active' ? 'RESUME_EVENT_ALERTS' : `MARK_EVENT_${status.toUpperCase()}`,
        eventId,
        author: cleanAuthor,
        timestamp
      }, ...versionHistory].slice(0, 100)
    };
  });
}

export async function clearResumedEventStatuses(observations = []) {
  const validObservations = observations.filter(item =>
    item?.eventId && Number(item.eventRows) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(item.lastDataDate || '')
  );
  if (validObservations.length === 0) return null;

  const observationByEvent = new Map(validObservations.map(item => [item.eventId, item]));
  return updateAdminSetting('dimensionStandards', DEFAULT_DIMENSION_SETTINGS, state => {
    const eventStatuses = { ...(state.eventStatuses || {}) };
    const versionHistory = Array.isArray(state.versionHistory) ? state.versionHistory : [];
    const resumedAt = new Date().toISOString();
    let changed = false;

    for (const [eventId, observation] of observationByEvent) {
      const eventStatus = eventStatuses[eventId];
      if (!['paused', 'ended'].includes(eventStatus?.status)) continue;
      const hasNewDate = observation.lastDataDate > (eventStatus.lastDataDate || '');
      const hasNewRows = observation.lastDataDate === eventStatus.lastDataDate &&
        Number(observation.eventRows) > Number(eventStatus.eventRows || 0);
      const hasDataAfterUnknownMarker = !eventStatus.lastDataDate && Number(observation.eventRows) > 0;
      if (!hasNewDate && !hasNewRows && !hasDataAfterUnknownMarker) continue;

      delete eventStatuses[eventId];
      versionHistory.unshift({
        id: `event_resumed:${eventId}@${resumedAt}`,
        action: 'EVENT_ALERTS_AUTO_RESUMED',
        eventId,
        author: 'System',
        timestamp: resumedAt,
        resumedOnDataDate: observation.lastDataDate
      });
      changed = true;
    }

    return changed ? {
      ...state,
      eventStatuses,
      versionHistory: versionHistory.slice(0, 100)
    } : state;
  }, { skipUnchanged: true });
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
  author = 'Admin',
  durationDays = 1
}) {
  if (!issueKey || typeof issueKey !== 'string') {
    throw new Error('A valid issue key is required.');
  }
  const ignoreDays = Number(durationDays);
  if (!Number.isInteger(ignoreDays) || ignoreDays < 1 || ignoreDays > MAX_HEALTH_ISSUE_IGNORE_DAYS) {
    throw new Error(`Health issues can be ignored for 1 to ${MAX_HEALTH_ISSUE_IGNORE_DAYS} days.`);
  }
  const cleanAuthor = String(author || 'Admin').trim().slice(0, 100);
  const cleanReason = String(reason || message || 'Ignored by administrator').trim().slice(0, 300);
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.parse(nowIso) + ignoreDays * 24 * 60 * 60 * 1000).toISOString();

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
      ignoredAt: nowIso,
      expiresAt
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
      expiresAt,
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
