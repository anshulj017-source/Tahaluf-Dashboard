import { NextResponse } from 'next/server';
import {
  getHealthNotificationState,
  saveHealthNotificationSettings,
  sendTestHealthEmail,
  reconcileDisabledHealthChecks
} from '../../../../lib/healthNotifications.mjs';
import { getHealthIssues, normalizeHealthNotificationSettings } from '../../../../lib/healthNotificationUtils.mjs';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { GET as getEventsHealth } from '../events/route.js';
import { getSmtpTransportConfig } from '../../../../lib/healthEmailTransport.mjs';
import { getDimensionSettings, saveDimensionSelection, saveHealthCheckSettings, saveEventHealthChecks, loadDimensionStandards } from '../../../../lib/dimensionMonitoring.mjs';
import { getEventsConfig } from '../../../../lib/eventsConfig.js';

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
    const state = await getHealthNotificationState();
    let issues = [];
    if (new URL(request.url).searchParams.get('includeHealth') === 'true') {
      const healthResponse = await getEventsHealth();
      const healthPayload = await healthResponse.json();
      if (!healthResponse.ok || !healthPayload.success) {
        throw new Error(healthPayload.error || 'Could not load event health.');
      }
      issues = getHealthIssues(healthPayload.sheetHealth || []);
    }
    return NextResponse.json({
      success: true,
      settings: state.settings,
      issues,
      history: [...(state.history || [])].reverse(),
      emailConfigured: isEmailConfigured(),
      updatedAt: state.updatedAt || null,
      dimensionSettings: await getDimensionSettings()
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
      if (!config.events.some(event => event.id === body.eventId)) {
        return NextResponse.json({ success: false, error: 'Unknown event.' }, { status: 400 });
      }
      const dimensionSettings = await saveEventHealthChecks(body.eventId, body.checks);
      await reconcileDisabledHealthChecks();
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'save-health-checks') {
      const dimensionSettings = await saveHealthCheckSettings(body);
      await reconcileDisabledHealthChecks();
      return NextResponse.json({ success: true, dimensionSettings });
    }
    if (body.action === 'save-dimensions') {
      return NextResponse.json({ success: true, dimensionSettings: await saveDimensionSelection(body.enabledDimensions) });
    }
    if (body.action === 'refresh-standards') {
      const dimensionSettings = await loadDimensionStandards(true);
      return NextResponse.json({ success: !dimensionSettings.error, dimensionSettings, error: dimensionSettings.error || null }, { status: dimensionSettings.error ? 502 : 200 });
    }
    if (body.action === 'test-email') {
      await sendTestHealthEmail(body.recipient || '');
      return NextResponse.json({ success: true, message: 'Test email sent.' });
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
