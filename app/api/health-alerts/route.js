import { NextResponse } from 'next/server';
import { GET as getEventsHealth } from '../admin/events/route.js';
import { getHealthIssues } from '../../../lib/healthNotificationUtils.mjs';
import { getDimensionSettings } from '../../../lib/dimensionMonitoring.mjs';
import { getHealthNotificationState } from '../../../lib/healthNotifications.mjs';
import { isIssueIgnored } from '../../../lib/dimensionStandards.mjs';

export const dynamic = 'force-dynamic';

function formatIssueHeadline(issue) {
  const ev = issue.eventName || issue.eventId || 'Event';
  if (issue.status === 'activity-halt') {
    return `Complete Delivery Pause: ${ev} Daily Spend Dropped to $0.00`;
  }
  if (issue.status === 'spend-cliff') {
    const drop = issue.anomalyDetails?.dropPercent != null ? `${issue.anomalyDetails.dropPercent}%` : '≥ 40%';
    return `Spend Cliff Detected: ${ev} Daily Spend Dropped by ${drop}`;
  }
  if (issue.status === 'missing-data') {
    return `Missing Event Rows: No Tagged Data Found for ${ev}`;
  }
  if (issue.status === 'metric-discrepancy') {
    return `Metric Discrepancy: ${ev} Regression in 24h Metrics`;
  }
  if (issue.status === 'dimension-discrepancy' || issue.status === 'dimension-unavailable') {
    return `Dimension Compliance Discrepancy: ${ev}`;
  }
  if (issue.status === 'stale') {
    return `Sheet Sync Stale: Serving Cached Snapshot for ${ev}`;
  }
  if (issue.status === 'unavailable' || issue.status === 'storage-error') {
    return `Sheet Source Unavailable: ${ev}`;
  }
  return `Health Alert: ${ev} (${issue.status || 'review required'})`;
}

export async function GET() {
  try {
    const [state, dimensionSettings] = await Promise.all([
      getHealthNotificationState().catch(() => ({ settings: { dashboardEnabled: true } })),
      getDimensionSettings().catch(() => ({}))
    ]);

    // If dashboard alerts are disabled in health settings, return clean empty list
    if (state?.settings?.dashboardEnabled === false) {
      return NextResponse.json({
        success: true,
        count: 0,
        issues: []
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
        }
      });
    }

    const healthResponse = await getEventsHealth(new Request('http://localhost/api/admin/events?inspectOnly=true'));
    const healthPayload = await healthResponse.json();

    if (!healthResponse.ok || !healthPayload.success) {
      return NextResponse.json({
        success: false,
        error: healthPayload.error || 'Failed to inspect event health.'
      }, { status: 500 });
    }

    const rawIssues = getHealthIssues(healthPayload.sheetHealth || [], dimensionSettings);
    const activeIssues = rawIssues.filter(issue => !isIssueIgnored(issue, dimensionSettings));

    const formattedIssues = activeIssues.map(issue => {
      const severity = issue.severity || (
        ['activity-halt', 'missing-data', 'unavailable', 'storage-error'].includes(issue.status)
          ? 'critical'
          : 'warning'
      );

      const date = issue.anomalyDetails?.date ||
        issue.discrepancies?.[0]?.date ||
        issue.date ||
        null;

      const headline = formatIssueHeadline(issue);
      const summary = issue.anomalyDetails?.message || issue.message || headline;

      return {
        key: issue.key,
        eventId: issue.eventId,
        eventName: issue.eventName || issue.eventId,
        kind: issue.kind || 'Actuals',
        category: issue.category || 'feed',
        status: issue.status,
        severity,
        date,
        headline,
        summary
      };
    });

    return NextResponse.json({
      success: true,
      count: formattedIssues.length,
      issues: formattedIssues
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
      }
    });
  } catch (error) {
    console.error('[API HEALTH ALERTS] Error evaluating alerts:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal error'
    }, { status: 500 });
  }
}
