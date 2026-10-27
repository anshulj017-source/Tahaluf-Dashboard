import { NextResponse } from 'next/server';
import { csvParse } from 'd3';
import { 
  getEventsConfig, 
  getEventsHistory, 
  saveEventsConfig, 
  revertToVersion, 
  resetToFactoryDefaults,
  DEFAULT_EVENTS 
} from '../../../../lib/eventsConfig';
import { 
  getSheetCacheHealth, 
  getSheetCacheKey, 
  storeSheetSnapshot, 
  summarizeSheetData 
} from '../../../../lib/sheetCache.mjs';
import { GET as refreshSheet } from '../../sheets/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getEventDataStats(source, health) {
  const eventMatches = Object.entries(health.eventBreakdown || {}).filter(([sheetEventName]) => {
    const normalizedSheetName = sheetEventName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidates = [source.eventName, source.sourceName]
      .filter(Boolean)
      .flatMap(name => name.split(/[\/&]+/))
      .map(name => name.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(name => name.length > 2);
    return candidates.some(candidate =>
      normalizedSheetName.includes(candidate) || candidate.includes(normalizedSheetName)
    );
  });
  const eventRows = eventMatches.reduce((sum, [, stats]) => sum + stats.rows, 0);
  const dates = eventMatches.flatMap(([, stats]) => [stats.firstDate, stats.lastDate]).filter(Boolean).sort();

  const candidatesList = [source.eventName, source.sourceName]
    .filter(Boolean)
    .flatMap(name => name.split(/[\/&]+/))
    .map(name => name.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(name => name.length > 2);

  const eventChannelMetrics = (health.channelMetrics24h || []).filter(item => {
    if (!item.eventName || item.eventName === 'Unknown') return true;
    const itemNorm = item.eventName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return candidatesList.some(c => itemNorm.includes(c) || c.includes(itemNorm));
  });

  const eventDiscrepancies = (health.metricDiscrepancies || []).filter(item => {
    if (!item.eventName || item.eventName === 'Unknown') return true;
    const itemNorm = item.eventName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return candidatesList.some(c => itemNorm.includes(c) || c.includes(itemNorm));
  });

  return {
    eventDataStatus: source.kind !== 'Actuals'
      ? (health.rowCount > 0 ? (eventRows > 0 ? 'present' : 'unverified') : 'missing')
      : !health.eventColumn
        ? (health.rowCount > 0 ? (eventRows > 0 ? 'present' : 'unverified') : 'missing')
        : eventRows > 0 ? 'present' : 'missing',
    eventRows,
    totalRows: health.rowCount || 0,
    firstDataDate: source.kind !== 'Actuals'
      ? health.firstDate || null
      : dates[0] || (eventMatches.length === 0 && !health.eventColumn ? health.firstDate || null : null),
    lastDataDate: source.kind !== 'Actuals'
      ? health.lastDate || null
      : dates.at(-1) || (eventMatches.length === 0 && !health.eventColumn ? health.lastDate || null : null),
    eventNames: eventMatches.map(([name]) => name),
    channelMetrics24h: eventChannelMetrics,
    metricDiscrepancies: eventDiscrepancies,
    latest24hDate: health.latest24hDate || null
  };
}

export async function GET(request) {
  try {
    if (request && new URL(request.url).searchParams.get('configOnly') === 'true') {
      const config = await getEventsConfig();
      return NextResponse.json({ success: true, config });
    }
    const [config, history] = await Promise.all([
      getEventsConfig(),
      getEventsHistory()
    ]);
    const sheetBaseUrl = process.env.COMBINED_COUNTRY_CSV_URL;
    const dataSources = config.events.flatMap(event => [
      { eventId: event.id, eventName: event.name, sourceName: event.sourceName || event.name, kind: 'Actuals', gid: event.gid || '' },
      ...(event.plannedGid
        ? [{ eventId: event.id, eventName: event.name, sourceName: event.sourceName || event.name, kind: 'Planned', gid: event.plannedGid }]
        : [])
    ]).map(source => ({
      ...source,
      cacheKey: sheetBaseUrl
        ? getSheetCacheKey(sheetBaseUrl + (source.gid ? `&gid=${source.gid}` : ''))
        : null
    }));
    const cacheKeys = dataSources.map(source => source.cacheKey).filter(Boolean);
    let healthByKey = {};
    try {
      healthByKey = await getSheetCacheHealth(cacheKeys);
    } catch (err) {
      console.warn('Could not read sheet cache health (using memory/fallback):', err?.message || err);
    }

    // Auto-resolve: if any sources have 0 rows or un-cached data, hydrate them so health monitor resolves them immediately
    const uncachedSources = dataSources.filter(source => 
      source.cacheKey && (!healthByKey[source.cacheKey]?.hasCachedData || (healthByKey[source.cacheKey]?.rowCount || 0) === 0)
    );
    if (uncachedSources.length > 0 && sheetBaseUrl) {
      const uniqueUncached = Array.from(new Map(uncachedSources.map(s => [s.cacheKey, s])).values());
      await Promise.allSettled(
        uniqueUncached.map(async source => {
          try {
            const url = sheetBaseUrl + (source.gid ? `&gid=${source.gid}` : '');
            const res = await fetch(url, {
              headers: { 'Accept': 'text/csv' },
              signal: AbortSignal.timeout(8000),
              redirect: 'follow'
            });
            if (res.ok) {
              const text = await res.text();
              if (text && text.length > 50 && !text.includes('<!DOCTYPE html')) {
                const summary = summarizeSheetData(text);
                const health = await storeSheetSnapshot(source.cacheKey, text, summary);
                healthByKey[source.cacheKey] = health;
              }
            }
          } catch (e) {
            console.warn(`[ADMIN EVENTS] Auto-resolve failed for ${source.eventName} (${source.gid || 'root'}):`, e?.message || e);
          }
        })
      );
    }
    const sheetHealth = dataSources.map(source => ({
      ...source,
      ...(source.cacheKey
        ? healthByKey[source.cacheKey]
        : {
            state: 'unavailable',
            hasCachedData: false,
            bytes: 0,
            lastSuccessAt: null,
            lastFailureAt: null,
            lastError: 'COMBINED_COUNTRY_CSV_URL is not configured'
          }),
      ...(source.cacheKey ? getEventDataStats(source, healthByKey[source.cacheKey] || {}) : {})
    }));
    return NextResponse.json({
      success: true,
      config,
      history,
      sheetHealth,
      defaults: DEFAULT_EVENTS
    });
  } catch (error) {
    console.error('Error loading events configuration:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      config: { events: DEFAULT_EVENTS, version: 'v1.0.0' }
    }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action = 'save', author = 'Admin' } = body;

    if (action === 'refresh-sheet') {
      const { eventId, kind = 'Actuals' } = body;
      const config = await getEventsConfig();
      const event = config.events.find(candidate => candidate.id === eventId);
      if (!event) {
        return NextResponse.json({ success: false, error: `Event ${eventId} not found` }, { status: 404 });
      }
      if (kind !== 'Actuals' && kind !== 'Planned') {
        return NextResponse.json({ success: false, error: 'Sheet kind must be Actuals or Planned' }, { status: 400 });
      }
      const gid = kind === 'Planned' ? event.plannedGid : (event.gid || '');
      if (kind === 'Planned' && !gid) {
        return NextResponse.json({ success: false, error: `${event.name} has no planned sheet configured` }, { status: 400 });
      }
      const sheetUrl = process.env.COMBINED_COUNTRY_CSV_URL;
      if (!sheetUrl) {
        return NextResponse.json({ success: false, error: 'COMBINED_COUNTRY_CSV_URL is not configured' }, { status: 500 });
      }

      const sheetRequestUrl = new URL(
        `/api/sheets?type=combined${gid ? `&gid=${encodeURIComponent(gid)}` : ''}&refresh=true`,
        req.url
      );
      const response = await refreshSheet(new Request(sheetRequestUrl, { headers: req.headers }));
      const cacheKey = getSheetCacheKey(sheetUrl + (gid ? `&gid=${gid}` : ''));
      const health = await getSheetCacheHealth([cacheKey]);
      const cacheStatus = response.headers.get('X-Cache') || 'UNKNOWN';
      const refreshed = response.ok
        && cacheStatus !== 'MISS-EMPTY'
        && cacheStatus !== 'STALE-FALLBACK';

      return NextResponse.json({
        success: refreshed,
        refreshed,
        cacheStatus,
        error: refreshed ? null : health[cacheKey]?.lastError || 'Sheet refresh failed',
        sheetHealth: {
          eventId,
          eventName: event.name,
          sourceName: event.sourceName || event.name,
          kind,
          gid,
          cacheKey,
          ...(health[cacheKey] || {}),
          ...getEventDataStats(
            { eventName: event.name, sourceName: event.sourceName || event.name, kind },
            health[cacheKey] || {}
          )
        }
      }, { status: refreshed ? 200 : 502 });
    }

    if (action === 'save') {
      const { events, description = 'Updated events configuration' } = body;
      if (!Array.isArray(events)) {
        return NextResponse.json({ success: false, error: 'Events array is required' }, { status: 400 });
      }
      const sanitizedEvents = events.map(ev => {
        const name = (ev.name || '').trim();
        const id = (ev.id || '').trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const sourceName = (ev.sourceName || '').trim() || name;
        return {
          ...ev,
          name,
          id,
          sourceName
        };
      });
      const actionType = description.toLowerCase().includes('added') 
        ? 'ADD_EVENT' 
        : description.toLowerCase().includes('removed') 
        ? 'DELETE_EVENT' 
        : 'EDIT_EVENT';
      const result = await saveEventsConfig(sanitizedEvents, description, author, actionType);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'revert') {
      const { versionId } = body;
      if (!versionId) {
        return NextResponse.json({ success: false, error: 'Version ID is required for revert' }, { status: 400 });
      }
      const result = await revertToVersion(versionId, author);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'reset') {
      const result = await resetToFactoryDefaults(author);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'set-status') {
      const { eventId, status } = body; // 'active' | 'admin_only' | 'inactive'
      const current = await getEventsConfig();
      const updatedEvents = current.events.map(ev => {
        if (ev.id !== eventId) return ev;
        const enabled = status !== 'inactive';
        const visibility = status === 'admin_only' ? 'admin_only' : 'public';
        return { ...ev, status, visibility, enabled };
      });
      const label = status === 'admin_only' ? 'Admin Only (Testing)' : status === 'active' ? 'Active (Public)' : 'Inactive';
      const desc = `Changed status of event "${eventId}" to ${label}`;
      const result = await saveEventsConfig(updatedEvents, desc, author, 'STATUS_CHANGE');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'toggle') {
      const { eventId, enabled } = body;
      const current = await getEventsConfig();
      const updatedEvents = current.events.map(ev => 
        ev.id === eventId ? { ...ev, enabled: Boolean(enabled) } : ev
      );
      const desc = `${enabled ? 'Enabled' : 'Disabled'} event "${eventId}"`;
      const result = await saveEventsConfig(updatedEvents, desc, author, 'TOGGLE');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'update-dates') {
      const { eventId, startDate, endDate } = body;
      const current = await getEventsConfig();
      const updatedEvents = current.events.map(ev => 
        ev.id === eventId ? { ...ev, startDate: startDate ?? ev.startDate, endDate: endDate ?? ev.endDate } : ev
      );
      const desc = `Updated date range for event "${eventId}": [${startDate || 'Start'} to ${endDate || 'End'}]`;
      const result = await saveEventsConfig(updatedEvents, desc, author, 'DATE_RANGE');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'promote') {
      const { eventId } = body;
      const current = await getEventsConfig();
      const eventToPromote = current.events.find(ev => ev.id === eventId);
      if (!eventToPromote) {
        return NextResponse.json({ success: false, error: `Event ${eventId} not found` }, { status: 404 });
      }
      const updatedEvents = current.events.map(ev => 
        ev.id === eventId ? { ...ev, status: 'active', visibility: 'public', enabled: true } : ev
      );
      const desc = `Promoted event "${eventToPromote.name}" (${eventToPromote.portfolio}) from Admin Staging to Public Active`;
      const result = await saveEventsConfig(updatedEvents, desc, author, 'PROMOTE_LIVE');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'validate-sheet') {
      const { gid } = body;
      const baseUrl = process.env.COMBINED_COUNTRY_CSV_URL;
      if (!baseUrl) {
        return NextResponse.json({ success: false, error: 'COMBINED_COUNTRY_CSV_URL not set in environment' }, { status: 500 });
      }
      try {
        const sheetUrl = new URL(
          `/api/sheets?type=combined${gid ? `&gid=${encodeURIComponent(gid)}` : ''}`,
          req.url
        );
        const sheetResponse = await refreshSheet(new Request(sheetUrl, { headers: req.headers }));
        if (!sheetResponse.ok) {
          return NextResponse.json({ 
            success: false, 
            valid: false, 
            error: `Sheet proxy responded with HTTP ${sheetResponse.status} (${sheetResponse.statusText})`
          });
        }
        const text = await sheetResponse.text();
        if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('Loading...')) {
          return NextResponse.json({ 
            success: false, 
            valid: false, 
            error: 'Google Sheets returned an HTML login or loading page. Ensure sheet is published to web as CSV.' 
          });
        }
        const formulaError = text.trimStart().match(/^#(?:REF!|VALUE!|ERROR!)/);
        if (formulaError) {
          return NextResponse.json({
            success: false,
            valid: false,
            error: `Google Sheets returned a spreadsheet formula error (${formulaError[0]}).`
          });
        }

        if (!text.trim()) {
          return NextResponse.json({ success: false, valid: false, error: 'Sheet is empty (0 lines)' });
        }

        const rows = csvParse(text);
        const headers = rows.columns;
        const rowCount = rows.length;
        const lowerHeaders = headers.map(h => h.toLowerCase());

        const hasSpend = lowerHeaders.some(h => h.includes('spend') || h.includes('cost'));
        const hasDate = lowerHeaders.some(h => h.includes('date') || h.includes('day'));
        const hasImpressions = lowerHeaders.some(h => h.includes('impression'));
        const hasClicks = lowerHeaders.some(h => h.includes('click'));
        const hasEventName = lowerHeaders.some(h => h.includes('event name') || h === 'event' || h.includes('campaign'));

        // Sample some events from data lines if present
        const eventColIdx = headers.findIndex(h => /event name db|event name|event/i.test(h));
        const sampleEvents = new Set();
        if (eventColIdx !== -1) {
          for (const row of rows.slice(0, 99)) {
            const evVal = row[headers[eventColIdx]]?.trim();
            if (evVal) sampleEvents.add(evVal);
          }
        }

        return NextResponse.json({
          success: true,
          valid: true,
          rowCount,
          headers,
          hasSpend,
          hasDate,
          hasImpressions,
          hasClicks,
          hasEventName,
          sampleEvents: Array.from(sampleEvents).slice(0, 5)
        });
      } catch (err) {
        return NextResponse.json({ 
          success: false, 
          valid: false, 
          error: `Failed to connect to sheet: ${err.message}` 
        });
      }
    }

    if (action === 'import') {
      const { importedConfig } = body;
      if (!importedConfig || !Array.isArray(importedConfig.events)) {
        return NextResponse.json({ success: false, error: 'Invalid imported config structure' }, { status: 400 });
      }
      const result = await saveEventsConfig(importedConfig.events, 'Imported configuration from JSON file', author, 'IMPORT');
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('Error handling events configuration POST:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
