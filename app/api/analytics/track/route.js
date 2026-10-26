import { NextResponse } from 'next/server';
import { recordAnalyticsEvent } from '../../../../lib/analyticsService.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    let body = {};
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      body = await req.json().catch(() => ({}));
    } else {
      // Handles sendBeacon text/plain or URLSearchParams payloads
      const text = await req.text().catch(() => '');
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }

    // Geolocation from Vercel edge headers
    const vercelCountry = req.headers.get('x-vercel-ip-country');
    const vercelCity = req.headers.get('x-vercel-ip-city');
    const vercelRegion = req.headers.get('x-vercel-ip-country-region');
    const vercelTimezone = req.headers.get('x-vercel-ip-timezone');

    // Prefer edge headers, fallback to client-supplied or defaults
    const country = vercelCountry || body.geo?.country || 'SA';
    const city = vercelCity ? decodeURIComponent(vercelCity) : (body.geo?.city || (country === 'SA' ? 'Riyadh' : 'Dubai'));
    const region = vercelRegion || body.geo?.region || '';
    const timezone = vercelTimezone || body.geo?.timezone || (country === 'AE' ? 'Asia/Dubai' : country === 'GB' ? 'Europe/London' : country === 'US' ? 'America/New_York' : 'Asia/Riyadh');

    const rawTab = (body.tab || 'summary').toLowerCase().trim();
    const tab = rawTab === 'overview' ? 'summary' : rawTab;

    const payload = {
      eventType: body.eventType || 'page_view',
      userEmail: body.userEmail || 'anonymous',
      userRole: body.userRole || 'standard',
      tab,
      dwellTimeSec: typeof body.dwellTimeSec === 'number' ? body.dwellTimeSec : 0,
      details: body.details || null,
      device: body.device || null,
      filters: body.filters || {},
      sessionId: body.sessionId,
      isNewSession: Boolean(body.isNewSession),
      geo: {
        country,
        city,
        region,
        timezone,
      },
      userAgent: req.headers.get('user-agent') || '',
      timestamp: body.timestamp || new Date().toISOString(),
    };

    const result = await recordAnalyticsEvent(payload);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
