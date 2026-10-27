import { NextResponse } from 'next/server';
import {
  getSheetCacheKey,
  getSheetSnapshot,
  recordSheetFailure,
  storeSheetSnapshot,
  summarizeSheetData
} from '../../../lib/sheetCache.mjs';
import { getEventsConfig } from '../../../lib/eventsConfig.js';
import { observeHealthSource } from '../../../lib/healthNotifications.mjs';
import { getHealthIssues } from '../../../lib/healthNotificationUtils.mjs';

// In-memory cache for sheets: Map<url, { data: string, timestamp: number }>
// TTL: 5 minutes fresh cache. If Google Sheets fails/times out, stale data is served as resilient fallback.
const sheetCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const sourceMapCache = { expiresAt: 0, byCacheKey: new Map() };
const getSpreadsheetFormulaError = (text) =>
  text.trimStart().match(/^#(?:REF!|VALUE!|ERROR!)/)?.[0] || null;

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
  return {
    eventDataStatus: source.kind !== 'Actuals'
      ? (health.rowCount > 0 ? 'unverified' : 'missing')
      : !health.eventColumn
        ? 'unverified'
        : eventRows > 0 ? 'present' : 'missing',
    eventRows
  };
}

async function getConfiguredSourcesByCacheKey() {
  if (sourceMapCache.expiresAt > Date.now()) return sourceMapCache.byCacheKey;
  const baseUrl = process.env.COMBINED_COUNTRY_CSV_URL;
  if (!baseUrl) return new Map();
  const config = await getEventsConfig();
  const byCacheKey = new Map();
  config.events.forEach(event => {
    const sources = [
      { eventId: event.id, eventName: event.name, sourceName: event.sourceName || event.name, kind: 'Actuals', gid: event.gid || '' },
      ...(event.plannedGid
        ? [{ eventId: event.id, eventName: event.name, sourceName: event.sourceName || event.name, kind: 'Planned', gid: event.plannedGid }]
        : [])
    ];
    sources.forEach(source => {
      const cacheKey = getSheetCacheKey(baseUrl + (source.gid ? `&gid=${source.gid}` : ''));
      byCacheKey.set(cacheKey, [...(byCacheKey.get(cacheKey) || []), source]);
    });
  });
  sourceMapCache.byCacheKey = byCacheKey;
  sourceMapCache.expiresAt = Date.now() + CACHE_TTL_MS;
  return byCacheKey;
}

async function reportHealthForSheet(cacheKey, health = {}) {
  try {
    const byCacheKey = await getConfiguredSourcesByCacheKey();
    const sources = byCacheKey.get(cacheKey) || [];

    for (const source of sources) {
      const monitoredSource = { ...source, ...health, ...getEventDataStats(source, health) };
      const issue = getHealthIssues([monitoredSource])[0] || null;
      await observeHealthSource(`${source.eventId}:${source.kind}`, issue);
    }
  } catch (error) {
    console.error('[HEALTH ALERT] Could not process a sheet health update:', error);
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const forceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';

  let url;
  if (type === 'combined') {
    const gid = searchParams.get('gid');
    url = process.env.COMBINED_COUNTRY_CSV_URL + (gid ? `&gid=${gid}` : '');
  } else if (type === 'adjust') {
    url = process.env.RAW_ADJUST_CSV_URL;
  } else if (type === 'creative') {
    url = process.env.CREATIVE_CSV_URL;
  } else if (type === 'planned') {
    url = process.env.PLANNED_DATA_CSV_URL;
  } else if (type === 'afc') {
    const gid = searchParams.get('gid');
    if (!gid) {
      return new NextResponse('Missing gid for afc sheet', { status: 400 });
    }
    url = `${process.env.AFC_SHEET_BASE_URL}&gid=${gid}`;
  } else {
    return new NextResponse('Invalid sheet type', { status: 400 });
  }

  if (!url) {
    return new NextResponse('Missing sheet URL configuration', { status: 500 });
  }

  const now = Date.now();
  const cacheKey = getSheetCacheKey(url);
  let cached = sheetCache.get(url);
  if (!cached) {
    try {
      const snapshot = await getSheetSnapshot(cacheKey);
      if (snapshot?.data) {
        cached = {
          data: snapshot.data,
          timestamp: Date.parse(snapshot.fetchedAt) || 0
        };
        sheetCache.set(url, cached);
      }
    } catch (error) {
      console.error(`[SHEET CACHE] Could not load persisted snapshot for ${type}/${searchParams.get('gid') || 'default'}:`, error);
    }
  }

  // Return fresh cached data immediately if not forcing refresh
  if (!forceRefresh && cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    return new NextResponse(cached.data, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
        'X-Cache': 'HIT'
      },
    });
  }

  const serveFallbackOrEmpty = async (reason) => {
    try {
      const health = await recordSheetFailure(cacheKey, reason);
      await reportHealthForSheet(cacheKey, health);
    } catch (error) {
      console.error('[SHEET CACHE] Could not record sheet failure:', error);
    }
    if (cached && cached.data) {
      console.warn(`[CACHE RESILIENCE] ${reason} for ${url}. Serving stale cached data as fallback.`);
      return new NextResponse(cached.data, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
          'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'X-Cache': 'STALE-FALLBACK'
        }
      });
    }
    console.warn(`[CACHE RESILIENCE] ${reason} for ${url}. No cache available, returning empty response.`);
    return new NextResponse('', {
      status: 200,
      headers: { 
        'Content-Type': 'text/csv',
        'X-Cache': 'MISS-EMPTY'
      }
    });
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for large sheets (up to 13MB)

    let response = await fetch(url, { 
      cache: 'no-store', 
      redirect: 'follow',
      signal: controller.signal 
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return await serveFallbackOrEmpty(`Google Sheets returned HTTP status ${response.status}`);
    }
    
    let text = await response.text();

    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      return await serveFallbackOrEmpty('Google Sheets returned HTML instead of CSV');
    }

    const formulaError = getSpreadsheetFormulaError(text);
    if (text.startsWith('Loading...') || formulaError) {
      const retryReason = formulaError
        ? `Google Sheets returned ${formulaError}`
        : 'Google Sheets returned Loading...';
      console.log(`${retryReason}. Retrying for ${url}`);
      await new Promise(r => setTimeout(r, 1000));
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), 10000);
      response = await fetch(url, { 
        cache: 'no-store', 
        redirect: 'follow',
        signal: retryController.signal 
      });
      clearTimeout(retryTimeout);

      if (response.ok) {
        text = await response.text();
      }
      const retryFormulaError = getSpreadsheetFormulaError(text);
      if (!response.ok || text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('Loading...') || retryFormulaError) {
        const retryFailure = retryFormulaError
          ? `Google Sheets retry returned spreadsheet formula error (${retryFormulaError})`
          : 'Google Sheets retry failed or returned invalid response';
        return await serveFallbackOrEmpty(retryFailure);
      }
    }

    let dataSummary;
    try {
      dataSummary = summarizeSheetData(text);
    } catch (error) {
      return await serveFallbackOrEmpty(`Google Sheets returned invalid CSV: ${error.message}`);
    }
    if (text.trim().length <= 50 || dataSummary.rowCount === 0) {
      return await serveFallbackOrEmpty('Google Sheets returned an empty or incomplete CSV response');
    }

    let health;
    try {
      health = await storeSheetSnapshot(cacheKey, text, dataSummary);
      sheetCache.set(url, { data: text, timestamp: Date.now() });
    } catch (error) {
      console.warn('[SHEET CACHE] Could not persist sheet to Firestore (using in-memory cache):', error?.message || error);
      sheetCache.set(url, { data: text, timestamp: Date.now() });
      try {
        health = await recordSheetFailure(cacheKey, `Cache storage failed: ${error.message || error}`, 'storage-error');
        await reportHealthForSheet(cacheKey, health);
      } catch (statusError) {
        console.error('[SHEET CACHE] Could not record cache storage failure:', statusError);
      }
      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
          'X-Cache': 'MISS-PERSISTENCE-ERROR'
        }
      });
    }

    await reportHealthForSheet(cacheKey, health);
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
        'X-Cache': health?.state === 'storage-error' ? 'MISS-PERSISTENCE-ERROR' : 'MISS'
      },
    });
  } catch (error) {
    return await serveFallbackOrEmpty(`Error fetching sheet: ${error.message || error}`);
  }
}
