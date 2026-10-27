import { NextResponse } from 'next/server';
import { readAdminSetting } from '../../../lib/adminSettingsStore.mjs';
import { DEFAULT_FEATURE_CONFIG } from '../../../lib/dashboardFeatures.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const config = await readAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG);
    return NextResponse.json({ success: true, config }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[FEATURES] Read failed:', error);
    return NextResponse.json({ success: false, error: 'Could not load dashboard feature controls.' }, { status: 503 });
  }
}
