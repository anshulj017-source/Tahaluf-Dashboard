import { NextResponse } from 'next/server';

// In-memory cache for sheets: Map<url, { data: string, timestamp: number }>
// TTL: 5 minutes fresh cache. If Google Sheets fails/times out, stale data is served as resilient fallback.
const sheetCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
  const cached = sheetCache.get(url);

  // Return fresh cached data immediately if not forcing refresh
  if (!forceRefresh && cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    return new NextResponse(cached.data, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'X-Cache': 'HIT'
      },
    });
  }

  const serveFallbackOrEmpty = (reason) => {
    if (cached && cached.data) {
      console.warn(`[CACHE RESILIENCE] ${reason} for ${url}. Serving stale cached data as fallback.`);
      return new NextResponse(cached.data, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
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
      return serveFallbackOrEmpty(`Google Sheets returned HTTP status ${response.status}`);
    }
    
    let text = await response.text();

    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      return serveFallbackOrEmpty('Google Sheets returned HTML instead of CSV');
    }

    if (text.startsWith('Loading...')) {
      console.log(`Google Sheets returned Loading... Retrying for ${url}`);
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
      if (!response.ok || text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('Loading...')) {
        return serveFallbackOrEmpty('Google Sheets retry failed or returned invalid response');
      }
    }

    // Save successfully fetched data to in-memory cache
    if (text.length > 50) {
      sheetCache.set(url, { data: text, timestamp: Date.now() });
    }
    
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'X-Cache': 'MISS'
      },
    });
  } catch (error) {
    return serveFallbackOrEmpty(`Error fetching sheet: ${error.message || error}`);
  }
}

