import { NextResponse } from 'next/server';
import { getEventsConfig } from '../../../../lib/eventsConfig.js';
import { getHealthIssues } from '../../../../lib/healthNotificationUtils.mjs';
import { sendDailyHealthDigest } from '../../../../lib/healthNotifications.mjs';
import { GET as getEventsHealth } from '../../admin/events/route.js';
import { GET as refreshSheet } from '../../sheets/route.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

async function refreshSource(requestUrl, source, headers) {
  const refreshUrl = new URL(
    `/api/sheets?type=combined${source.gid ? `&gid=${encodeURIComponent(source.gid)}` : ''}&refresh=true`,
    requestUrl
  );
  const response = await refreshSheet(new Request(refreshUrl, { headers }));
  return {
    eventId: source.eventId,
    kind: source.kind,
    cacheStatus: response.headers.get('X-Cache') || 'UNKNOWN',
    ok: response.ok
  };
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized scheduled health check.' }, { status: 401 });
  }

  try {
    const config = await getEventsConfig();
    const sources = config.events.flatMap(event => [
      { eventId: event.id, name: event.name, kind: 'Actuals', gid: event.gid || '' },
      ...(event.plannedGid
        ? [{ eventId: event.id, name: event.name, kind: 'Planned', gid: event.plannedGid }]
        : [])
    ]);
    const refreshResults = [];
    for (let offset = 0; offset < sources.length; offset += 3) {
      const batchResults = await Promise.all(
        sources.slice(offset, offset + 3).map(source =>
          refreshSource(request.url, source, request.headers)
        )
      );
      refreshResults.push(...batchResults);
    }

    const healthResponse = await getEventsHealth();
    const healthPayload = await healthResponse.json();
    if (!healthResponse.ok || !healthPayload.success) {
      throw new Error(healthPayload.error || 'Could not load the event health report.');
    }

    const issues = getHealthIssues(healthPayload.sheetHealth || []);
    const digest = await sendDailyHealthDigest(issues);
    return NextResponse.json({
      success: true,
      checkedSources: refreshResults.length,
      refreshResults,
      activeIssues: issues.length,
      digest
    });
  } catch (error) {
    console.error('[HEALTH CRON] Scheduled health check failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
