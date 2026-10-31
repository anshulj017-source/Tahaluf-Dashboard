import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { readAdminSetting, updateAdminSetting } from '../../../../lib/adminSettingsStore.mjs';
import { DEFAULT_FEATURE_CONFIG, validateFeatureModes, validateCustomUsers } from '../../../../lib/dashboardFeatures.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(request) {
  const adminAuthorized = await isAdminRequest(request);
  let customUserAuthorized = false;
  if (!adminAuthorized) {
    const adminEmail = (request.headers.get('x-admin-email') || '').toLowerCase().trim();
    if (adminEmail) {
      try {
        const currentConfig = await readAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG);
        const allowedUsers = currentConfig?.customUsers?.adminFeatures || [];
        if (allowedUsers.map(u => (u || '').toLowerCase().trim()).includes(adminEmail)) {
          customUserAuthorized = true;
        }
      } catch {}
    }
  }
  if (!adminAuthorized && !customUserAuthorized) {
    return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 401 });
  }
  let body;
  let modes;
  let customUsers = null;
  try {
    body = await request.json();
    modes = validateFeatureModes(body.modes);
    if (body.customUsers !== undefined) {
      customUsers = validateCustomUsers(body.customUsers);
    }
    if (!Number.isInteger(body.revision) || body.revision < 0) throw new Error('A valid configuration revision is required.');
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
  try {
    const config = await updateAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG, current => {
      const currentRev = Number.isInteger(current?.revision) ? current.revision : 0;
      const clientRev = Number.isInteger(body.revision) ? body.revision : 0;
      const nextRev = Math.max(currentRev, clientRev) + 1;
      const nextCustomUsers = customUsers !== null ? customUsers : (current?.customUsers || {});
      return { 
        revision: nextRev, 
        updatedAt: new Date().toISOString(), 
        modes,
        customUsers: nextCustomUsers
      };
    });
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[FEATURES] Save failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: error.code === 'CONFLICT' ? 409 : 500 });
  }
}
