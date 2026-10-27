import { NextResponse } from 'next/server';
import { readAdminSetting } from '../../../lib/adminSettingsStore.mjs';
import { DEFAULT_FEATURE_CONFIG } from '../../../lib/dashboardFeatures.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const [config, budgets] = await Promise.all([
      readAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG),
      readAdminSetting('apiBudgets', { services: {}, updatedAt: null })
    ]);
    return NextResponse.json({ success: true, config, policy: { lowQuotaMode: budgets.policy?.lowQuotaMode === true } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[FEATURES] Read failed:', error);
    return NextResponse.json({ success: false, error: 'Could not load dashboard feature controls.' }, { status: 503 });
  }
}
