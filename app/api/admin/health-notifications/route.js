import { NextResponse } from 'next/server';
import {
  getHealthNotificationState,
  saveHealthNotificationSettings,
  sendTestHealthEmail,
  sendTestWebhook,
  reconcileDisabledHealthChecks,
  markIssueIgnoredInHistory,
  markIssueUnignoredInHistory
} from '../../../../lib/healthNotifications.mjs';
import { getHealthIssues, mergeHealthIssues, normalizeHealthNotificationSettings } from '../../../../lib/healthNotificationUtils.mjs';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { GET as getEventsHealth } from '../events/route.js';
import { getSmtpTransportConfig } from '../../../../lib/healthEmailTransport.mjs';
import {
  getDimensionSettings,
  saveEventActivityStatus,
  saveDimensionSelection,
  saveMetricSelection,
  addCustomMetric,
  removeCustomMetric,
  saveHealthCheckSettings,
  saveEventHealthChecks,
  loadDimensionStandards,
  saveCustomValues,
  saveEventCustomValues,
  saveExcludedValues,
  acceptDimensionValue,
  ignoreDimensionBlanks,
  unignoreDimensionBlanks,
  ignoreHealthIssue,
  unignoreHealthIssue
} from '../../../../lib/dimensionMonitoring.mjs';
import { getEventsConfig } from '../../../../lib/eventsConfig.js';
import { isHealthEventId } from '../../../../lib/healthEventGroups.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isEmailConfigured() {
  if (!process.env.HEALTH_ALERT_FROM) return false;
  try {
    getSmtpTransportConfig();
    return true;
  } catch {
    return false;
  }
}

export async function GET(request) {
  if (!await isAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Admin access is required.' }, { status: 401 });
  }
  try {
    await reconcileDisabledHealthChecks();
    const state = await getHealthNotificationState();
    const dimensionSettings = await getDimensionSettings();
    const persistedIssues = Object.values(state.activeIssues || {})
      .map(item => item.issue)
      .filter(Boolean);
    let issues = persistedIssues;
    if (new URL(request.url).searchParams.get('includeHealth') === 'true') {
      const healthResponse = await getEventsHealth(new Request('http://localhost/api/admin/events?inspectOnly=true'));
      const healthPayload = await healthResponse.json();
      if (!healthResponse.ok || !healthPayload.success) {
        throw new Error(healthPayload.error || 'Could not load event health.');
      }
      const currentIssues = getHealthIssues(healthPayload.sheetHealth || [], dimensionSettings);
      issues = mergeHealthIssues(currentIssues, persistedIssues);
    } else {
      issues = mergeHealthIssues([], persistedIssues);
    }
    return NextResponse.json({
      success: true,
      settings: state.settings,
      issues,
      history: [...(state.history || [])].reverse(),
      emailConfigured: isEmailConfigured(),
      updatedAt: state.updatedAt || null,
      dimensionSettings
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('[HEALTH NOTIFICATIONS] Could not load settings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!await isAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Admin access is required.' }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (body.action === 'save-event-checks') {
      const config = await getEventsConfig();
      if (!isHealthEventId(config.events, body.eventId)) {
        return NextResponse.json({ success: false, error: 'Unknown event.' }, { status: 400 });
      }
      const dimensionSettings = await saveEventHealthChecks(body.eventId, body.checks);
      await reconcileDisabledHealthChecks();
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'set-event-activity-status') {
      const config = await getEventsConfig();
      if (!isHealthEventId(config.events, body.eventId)) {
        return NextResponse.json({ success: false, error: 'Unknown event.' }, { status: 400 });
      }
      const dimensionSettings = await saveEventActivityStatus({
        eventId: body.eventId,
        status: body.status,
        lastDataDate: body.lastDataDate ?? null,
        eventRows: body.eventRows ?? 0,
        sourceObservations: body.sourceObservations ?? [],
        author: request.headers.get('x-admin-email') || 'Admin'
      });
      await reconcileDisabledHealthChecks();
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'save-health-checks') {
      const dimensionSettings = await saveHealthCheckSettings(body);
      await reconcileDisabledHealthChecks();
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'save-dimensions') {
      return NextResponse.json({
        success: true,
        dimensionSettings: await saveDimensionSelection(body.enabledDimensions, { ignoreBlanks: body.ignoreBlanks })
      });
    }
    if (body.action === 'save-metrics') {
      const dimensionSettings = await saveMetricSelection(body.enabledMetrics, {
        metricTolerances: body.metricTolerances,
        customMetrics: body.customMetrics
      });
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'add-metric') {
      const dimensionSettings = await addCustomMetric(body.metric);
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'remove-metric') {
      const dimensionSettings = await removeCustomMetric(body.metricId);
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'save-custom-values') {
      const dimensionSettings = await saveCustomValues(body.customValues);
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'save-event-custom-values') {
      const dimensionSettings = await saveEventCustomValues(body.eventId, body.eventCustomValues);
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'save-excluded-values') {
      const dimensionSettings = await saveExcludedValues(body.excludedValues);
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'accept-dimension-value') {
      const dimensionSettings = await acceptDimensionValue({
        dimension: body.dimension,
        value: body.value,
        eventId: body.eventId,
        scope: body.scope
      });
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'ignore-dimension-blanks') {
      const adminEmail = request.headers.get('x-admin-email') || 'Admin';
      const dimensionSettings = await ignoreDimensionBlanks({
        dimension: body.dimension,
        eventId: body.eventId,
        scope: body.scope,
        author: adminEmail,
        reason: body.reason
      });
      const issueKey = body.eventId ? `${body.eventId}:Actuals:dimensions` : null;
      if (issueKey) {
        await markIssueIgnoredInHistory({
          issueKey,
          eventId: body.eventId,
          eventName: body.eventName || body.eventId,
          kind: 'Actuals',
          status: 'dimension-discrepancy',
          category: 'dimensions',
          author: adminEmail,
          reason: body.reason || `Ignored blank values for ${body.dimension} (${body.eventName || body.eventId})`
        });
      }
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'unignore-dimension-blanks') {
      const adminEmail = request.headers.get('x-admin-email') || 'Admin';
      const dimensionSettings = await unignoreDimensionBlanks({
        dimension: body.dimension,
        eventId: body.eventId,
        scope: body.scope,
        author: adminEmail
      });
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'ignore-issue') {
      const adminEmail = request.headers.get('x-admin-email') || 'Admin';
      const dimensionSettings = await ignoreHealthIssue({
        issueKey: body.issueKey,
        eventId: body.eventId,
        eventName: body.eventName,
        category: body.category,
        status: body.status,
        message: body.message,
        reason: body.reason,
        author: adminEmail,
        duration: body.duration,
        durationDays: body.durationDays
      });
      await markIssueIgnoredInHistory({
        issueKey: body.issueKey,
        eventId: body.eventId,
        eventName: body.eventName,
        kind: body.kind,
        status: body.status,
        message: body.message,
        category: body.category,
        dimensionFindings: body.dimensionFindings,
        author: adminEmail,
        reason: body.reason || 'Ignored by administrator'
      });
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'unignore-issue') {
      const adminEmail = request.headers.get('x-admin-email') || 'Admin';
      const dimensionSettings = await unignoreHealthIssue({
        issueKey: body.issueKey,
        author: adminEmail
      });
      await markIssueUnignoredInHistory({
        issueKey: body.issueKey,
        author: adminEmail
      });
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'refresh-standards') {
      const dimensionSettings = await loadDimensionStandards(true);
      return NextResponse.json({ success: !dimensionSettings.error, dimensionSettings, error: dimensionSettings.error || null }, { status: dimensionSettings.error ? 502 : 200 });
    }
    if (body.action === 'test-email') {
      await sendTestHealthEmail(body.recipient || '');
      return NextResponse.json({ success: true, message: 'Test email sent.' });
    }
    if (body.action === 'test-webhook') {
      const ok = await sendTestWebhook(body.webhookUrl, body.webhookPlatform);
      return NextResponse.json({ success: ok, message: ok ? 'Test webhook delivered successfully.' : 'Webhook endpoint returned an error or timed out.' });
    }
    if (body.action !== 'save') {
      return NextResponse.json({ success: false, error: 'Unknown notification settings action.' }, { status: 400 });
    }

    const settings = normalizeHealthNotificationSettings(body.settings);
    if (settings.emailEnabled && settings.emailRecipients.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Add at least one email recipient or turn off email notifications.'
      }, { status: 400 });
    }

    const savedSettings = await saveHealthNotificationSettings(settings);
    return NextResponse.json({
      success: true,
      settings: savedSettings,
      emailConfigured: isEmailConfigured()
    });
  } catch (error) {
    console.error('[HEALTH NOTIFICATIONS] Could not save settings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
