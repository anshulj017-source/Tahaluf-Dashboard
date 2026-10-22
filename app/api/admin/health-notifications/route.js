import { NextResponse } from 'next/server';
import {
  getHealthNotificationState,
  saveHealthNotificationSettings,
  sendTestHealthEmail
} from '../../../../lib/healthNotifications.mjs';
import { getHealthIssues, normalizeHealthNotificationSettings } from '../../../../lib/healthNotificationUtils.mjs';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { GET as getEventsHealth } from '../events/route.js';
import { getSmtpTransportConfig } from '../../../../lib/healthEmailTransport.mjs';

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
      updatedAt: state.updatedAt || null
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
