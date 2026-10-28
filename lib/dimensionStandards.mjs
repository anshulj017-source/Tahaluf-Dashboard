import { csvParse } from 'd3';

export const DIMENSIONS = [
  ['event', 'EVENT', ['Event Name DB', 'Event Name', 'EVENT']],
  ['eventType', 'EVENT TYPE', ['Event Type DB', 'EVENT TYPE']],
  ['funnelStage', 'FUNNEL STAGE', ['Funnel Stage DB', 'FUNNEL STAGE']],
  ['channel', 'Channel', ['Channel']],
  ['strategy', 'Strategy', ['Strategy DB', 'Strategy']],
  ['campaignType', 'Campaign Type', ['Campaign Type DB', 'Campaign Type']],
  ['campaignObjective', 'Campaign Objective', ['Campaign Objective DB', 'Campaign Objective']],
  ['market', 'MARKET', ['Market DB', 'MARKET']],
  ['targeting', 'Targeting', ['Targeting DB', 'Targeting']],
  ['adFormat', 'Ad Format', ['Ad Format DB', 'Ad Format']],
  ['language', 'Language', ['Language DB', 'Language']]
].map(([id, label, headers]) => ({ id, label, headers }));

export const STANDARDS_URL = 'https://docs.google.com/spreadsheets/d/1D1BzodAQS45oJ27xwhk9FJkxFFzJk-r9x0lQzWG6u4w/export?format=csv&gid=593739615';
export const DEFAULT_DIMENSION_SETTINGS = {
  enabledDimensions: DIMENSIONS.map(dimension => dimension.id),
  metricChecksEnabled: true,
  dimensionChecksEnabled: true
};

export function isHealthCheckEnabled(issue, settings = {}) {
  const checks = eventHealthChecks(issue.eventId, settings);
  if (!checks.monitoringEnabled) return false;
  if (issue.category === 'metrics' || issue.status === 'metric-discrepancy') return checks.metricChecksEnabled;
  if (issue.category === 'dimensions' || ['dimension-discrepancy', 'dimension-unavailable'].includes(issue.status)) return checks.dimensionChecksEnabled;
  return checks.sheetChecksEnabled;
}

export function eventHealthChecks(eventId, settings = {}) {
  const overrides = settings.eventChecks?.[eventId] || {};
  const monitoringEnabled = overrides.monitoringEnabled !== false;
  return {
    monitoringEnabled,
    sheetChecksEnabled: monitoringEnabled && overrides.sheetChecksEnabled !== false,
    metricChecksEnabled: monitoringEnabled && settings.metricChecksEnabled !== false && overrides.metricChecksEnabled !== false,
    dimensionChecksEnabled: monitoringEnabled && settings.dimensionChecksEnabled !== false && overrides.dimensionChecksEnabled !== false
  };
}

export function applyHealthCheckSettings(source, settings = {}) {
  const checks = eventHealthChecks(source.eventId, settings);
  return {
    ...source,
    ...checks,
    metricDiscrepancies: !checks.metricChecksEnabled ? [] : source.metricDiscrepancies,
    channelMetrics24h: !checks.metricChecksEnabled ? [] : source.channelMetrics24h,
    dimensionHealth: !checks.dimensionChecksEnabled && source.kind === 'Actuals'
      ? { status: 'disabled', findings: [], error: null }
      : source.dimensionHealth
  };
}
export const normalize = value => String(value ?? '').trim().toLowerCase();
export const eventKey = name => normalize(name).replace(/\b20(\d{2})\b/g, '$1').replace(/[^a-z0-9]/g, '');

export function getEventCustomValues(eventName, context = {}) {
  if (!context?.eventCustomValues || !eventName) return null;
  const eventCustom = context.eventCustomValues;
  if (eventCustom[eventName]) return eventCustom[eventName];

  const norm = normalize(eventName);
  for (const [key, val] of Object.entries(eventCustom)) {
    if (normalize(key) === norm) return val;
  }
  const ek = eventKey(eventName);
  for (const [key, val] of Object.entries(eventCustom)) {
    if (eventKey(key) === ek) return val;
  }
  if (Array.isArray(context.events)) {
    const matched = context.events.find(e => {
      const candidates = [e.id, e.name, e.sourceName, e.title].filter(Boolean).map(eventKey);
      return candidates.some(c => c === ek || (!/\d{2}$/.test(c) && c === ek.replace(/\d{2}$/, '')));
    });
    if (matched && eventCustom[matched.id]) return eventCustom[matched.id];
  }
  return null;
}

export function getEffectiveAllowedValues(dimensionId, context = {}, eventNameOrId = null) {
  const standardList = context.values?.[dimensionId] || [];
  const globalAdditions = context.customValues?.[dimensionId] || [];
  const eventCustom = eventNameOrId ? getEventCustomValues(eventNameOrId, context) : null;
  const eventAdditions = eventCustom?.[dimensionId] || [];
  const globalExclusions = new Set((context.excludedValues?.[dimensionId] || []).map(normalize));

  const combined = [...standardList, ...globalAdditions, ...eventAdditions];
  const seen = new Set();
  const result = [];
  for (const val of combined) {
    const trimmed = String(val ?? '').trim();
    const norm = normalize(trimmed);
    if (!norm || globalExclusions.has(norm) || seen.has(norm)) continue;
    seen.add(norm);
    result.push(trimmed);
  }
  return result;
}
const MAX_GROUPS = 30;

export function validateDimensionSelection(ids) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !DIMENSIONS.some(dimension => dimension.id === id))) {
    throw new Error('Select unique, known dimensions.');
  }
  return [...ids];
}

export function parseDimensionStandards(text) {
  const rows = csvParse(text);
  const values = {};
  for (const dimension of DIMENSIONS) {
    const column = rows.columns.find(header => normalize(header) === normalize(dimension.label));
    if (!column) throw new Error(`Standards column missing: ${dimension.label}`);
    const list = [...new Set(rows.map(row => String(row[column] || '').trim()).filter(Boolean))];
    if (!list.length || list.length > 1000 || list.some(value => value.length > 200)) {
      throw new Error(`Standards column is empty or too large: ${dimension.label}`);
    }
    values[dimension.id] = list;
  }
  return values;
}

export function checkDimensionRows(text, context) {
  const enabled = context.enabledDimensions || DEFAULT_DIMENSION_SETTINGS.enabledDimensions;
  const base = {
    checkedAt: new Date().toISOString(), standardsFetchedAt: context.fetchedAt || null,
    enabledDimensions: enabled, stale: Boolean(context.stale), error: context.error || null
  };
  if (!enabled.length) return { ...base, status: 'disabled', groups: [] };
  if (!context.values) return { ...base, status: 'unavailable', groups: [] };
  const rows = csvParse(text);
  const columns = rows.columns;
  const mapped = Object.fromEntries(DIMENSIONS.map(dimension => [
    dimension.id, dimension.headers.map(alias => columns.find(column => normalize(column) === normalize(alias))).find(Boolean) || null
  ]));
  const globalExclusions = Object.fromEntries(enabled.map(id => [
    id, new Set((context.excludedValues?.[id] || []).map(normalize))
  ]));
  const globalAllowed = Object.fromEntries(enabled.map(id => [
    id, new Set(
      (context.values[id] || [])
        .concat(context.customValues?.[id] || [])
        .map(normalize)
        .filter(val => !globalExclusions[id].has(val))
    )
  ]));
  const groups = new Map();
  for (const [index, row] of rows.entries()) {
    if (Object.values(row).every(value => !String(value).trim())) continue;
    const eventName = mapped.event ? String(row[mapped.event] || '').trim() : '';
    if (eventName.length > 200) return { ...base, status: 'unavailable', error: 'Event name exceeds the bounded validation metadata limit.', groups: [] };
    if (!groups.has(eventName)) {
      if (groups.size >= MAX_GROUPS) return { ...base, status: 'unavailable', error: 'Too many event groups to retain bounded validation results.', groups: [] };
      groups.set(eventName, { eventName, rows: 0, findings: {} });
    }
    const group = groups.get(eventName);
    group.rows++;
    const eventCustom = getEventCustomValues(eventName, context);
    for (const id of enabled) {
      const value = mapped[id] ? String(row[mapped[id]] || '').trim() : '';
      const normVal = normalize(value);
      const isAllowed = globalAllowed[id].has(normVal) || (eventCustom?.[id] && eventCustom[id].some(v => normalize(v) === normVal));
      const type = !mapped[id] ? 'missing-column' : !value ? 'blank' : !isAllowed ? 'non-standard' : null;
      if (!type) continue;
      const key = `${id}:${type}`;
      const finding = group.findings[key] ||= {
        dimension: id, label: DIMENSIONS.find(dimension => dimension.id === id).label,
        type, count: 0, values: [], sampleRows: []
      };
      finding.count++;
      const sample = value.slice(0, 200);
      if (sample && finding.values.length < 3 && !finding.values.includes(sample)) finding.values.push(sample);
      if (finding.sampleRows.length < 3) finding.sampleRows.push(index + 2);
    }
  }
  const result = {
    ...base, status: 'checked', columns: mapped,
    groups: [...groups.values()].map(group => ({ ...group, findings: Object.values(group.findings) }))
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 256 * 1024) {
    return { ...base, status: 'unavailable', error: 'Dimension findings exceed the 256 KiB metadata limit.', groups: [] };
  }
  return result;
}

export function dimensionHealthForSource(source, validation) {
  if (source.kind !== 'Actuals') return null;
  if (!validation) return { status: 'not-checked', findings: [], error: 'Refresh this sheet to run dimension checks.' };
  // Event attribution only; validation itself never fuzzy-matches standard values.
  const candidates = [source.eventName, source.sourceName].filter(Boolean).flatMap(name => name.split(/[\/&]+/)).map(eventKey);
  const matches = name => candidates.some(candidate => candidate === eventKey(name) || (!/\d{2}$/.test(candidate) && candidate === eventKey(name).replace(/\d{2}$/, '')));
  const matching = validation.groups?.filter(group => matches(group.eventName)) || [];
  const unassigned = validation.groups?.filter(group => !group.eventName) || [];
  const invalidEvents = validation.groups?.filter(group => group.eventName && !matches(group.eventName))
    .flatMap(group => group.findings.filter(finding => finding.dimension === 'event').map(finding => ({ ...finding, eventName: group.eventName, sheetWide: true }))) || [];
  const metadata = { ...validation };
  delete metadata.groups;
  return {
    ...metadata,
    findings: [...matching, ...unassigned].flatMap(group => group.findings.map(finding => ({ ...finding, eventName: group.eventName }))).concat(invalidEvents),
    unmatchedEvents: (validation.groups || []).filter(group => !matches(group.eventName) && group.eventName).map(group => group.eventName).slice(0, 10)
  };
}
