import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { updateAdminSetting } from '../../../../lib/adminSettingsStore.mjs';
import { DEFAULT_FEATURE_CONFIG, validateFeatureModes } from '../../../../lib/dashboardFeatures.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(request) {
  if (!await isAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 401 });
  }
  let body;
  let modes;
  try {
    body = await request.json();
    modes = validateFeatureModes(body.modes);
    if (!Number.isInteger(body.revision) || body.revision < 0) throw new Error('A valid configuration revision is required.');
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
  try {
    const config = await updateAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG, current => {
      if (current.revision !== body.revision) {
        const conflict = new Error('Feature controls changed in another session. Reload before saving.');
        conflict.code = 'CONFLICT';
        throw conflict;
      }
      return { revision: current.revision + 1, updatedAt: new Date().toISOString(), modes };
    });
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[FEATURES] Save failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: error.code === 'CONFLICT' ? 409 : 500 });
  }
}
