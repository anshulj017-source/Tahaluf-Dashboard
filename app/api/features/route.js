import { NextResponse } from 'next/server';
import { readAdminSetting } from '../../../lib/adminSettingsStore.mjs';
import { DEFAULT_FEATURE_CONFIG } from '../../../lib/dashboardFeatures.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const [rawConfig, budgets] = await Promise.all([
      readAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG),
      readAdminSetting('apiBudgets', { services: {}, updatedAt: null })
    ]);
    const config = {
      ...DEFAULT_FEATURE_CONFIG,
      ...rawConfig,
      modes: { ...DEFAULT_FEATURE_CONFIG.modes, ...(rawConfig?.modes || {}) },
      customUsers: { ...(rawConfig?.customUsers || {}) },
      history: Array.isArray(rawConfig?.history) ? rawConfig.history : []
    };
    return NextResponse.json({ success: true, config, policy: { lowQuotaMode: budgets.policy?.lowQuotaMode === true } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[FEATURES] Read failed, falling back to local defaults:', error.message || error);
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const file = path.join(process.cwd(), 'config', 'dashboardFeatures.json');
      const diskConfig = JSON.parse(await fs.readFile(file, 'utf8'));
      const fallbackConfig = {
        ...DEFAULT_FEATURE_CONFIG,
        ...diskConfig,
        modes: { ...DEFAULT_FEATURE_CONFIG.modes, ...(diskConfig?.modes || {}) },
        customUsers: { ...(diskConfig?.customUsers || {}) }
      };
      return NextResponse.json({ success: true, config: fallbackConfig, policy: { lowQuotaMode: false } }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json({ success: true, config: DEFAULT_FEATURE_CONFIG, policy: { lowQuotaMode: false } }, { headers: { 'Cache-Control': 'no-store' } });
    }
  }
}
