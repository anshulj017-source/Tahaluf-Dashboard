import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { readAdminSetting, updateAdminSetting } from '../../../../lib/adminSettingsStore.mjs';
import { DEFAULT_FEATURE_CONFIG, validateFeatureModes, validateCustomUsers } from '../../../../lib/dashboardFeatures.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function checkAuthorization(request) {
  const adminAuthorized = await isAdminRequest(request);
  if (adminAuthorized) return true;
  const adminEmail = (request.headers.get('x-admin-email') || '').toLowerCase().trim();
  if (adminEmail) {
    try {
      const currentConfig = await readAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG);
      const allowedUsers = currentConfig?.customUsers?.adminFeatures || [];
      const normalizedAllowed = allowedUsers.map(u => (u || '').toLowerCase().trim());
      if (normalizedAllowed.includes(adminEmail) || normalizedAllowed.some(e => e.startsWith('@') && adminEmail.endsWith(e))) {
        return true;
      }
    } catch {}
  }
  return false;
}

export async function PUT(request) {
  const authorized = await checkAuthorization(request);
  if (!authorized) {
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
    const adminEmail = (request.headers.get('x-admin-email') || '').toLowerCase().trim() || 'Admin';
    const config = await updateAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG, current => {
      const currentRev = Number.isInteger(current?.revision) ? current.revision : 0;
      const clientRev = Number.isInteger(body.revision) ? body.revision : 0;
      const nextRev = Math.max(currentRev, clientRev) + 1;
      const nextCustomUsers = customUsers !== null ? customUsers : (current?.customUsers || {});
      
      const historyEntry = {
        revision: currentRev,
        timestamp: current?.updatedAt || new Date().toISOString(),
        author: current?.updatedBy || 'System / Admin',
        modes: current?.modes || DEFAULT_FEATURE_CONFIG.modes,
        customUsers: current?.customUsers || {}
      };
      const existingHistory = Array.isArray(current?.history) ? current.history : [];
      const updatedHistory = currentRev > 0 ? [historyEntry, ...existingHistory].slice(0, 30) : existingHistory;

      return { 
        revision: nextRev, 
        updatedAt: new Date().toISOString(), 
        updatedBy: adminEmail,
        modes,
        customUsers: nextCustomUsers,
        history: updatedHistory
      };
    });
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[FEATURES] Save failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: error.code === 'CONFLICT' ? 409 : 500 });
  }
}

export async function POST(request) {
  const authorized = await checkAuthorization(request);
  if (!authorized) {
    return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, targetRevision } = body;
    if (action === 'rollback') {
      const targetRevNum = parseInt(targetRevision, 10);
      if (isNaN(targetRevNum)) {
        return NextResponse.json({ success: false, error: 'Target revision number is required.' }, { status: 400 });
      }

      const adminEmail = (request.headers.get('x-admin-email') || '').toLowerCase().trim() || 'Admin';
      const config = await updateAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG, current => {
        const history = Array.isArray(current?.history) ? current.history : [];
        const targetEntry = history.find(h => h.revision === targetRevNum);
        if (!targetEntry) {
          throw new Error(`Revision ${targetRevNum} not found in history.`);
        }

        const currentRev = Number.isInteger(current?.revision) ? current.revision : 0;
        const nextRev = currentRev + 1;
        const currentHistoryEntry = {
          revision: currentRev,
          timestamp: current?.updatedAt || new Date().toISOString(),
          author: current?.updatedBy || 'Admin',
          modes: current?.modes || DEFAULT_FEATURE_CONFIG.modes,
          customUsers: current?.customUsers || {}
        };

        return {
          revision: nextRev,
          updatedAt: new Date().toISOString(),
          updatedBy: `${adminEmail} (Rollback to Rev ${targetRevNum})`,
          revertedFrom: targetRevNum,
          modes: targetEntry.modes,
          customUsers: targetEntry.customUsers || {},
          history: [currentHistoryEntry, ...history].slice(0, 30)
        };
      });

      return NextResponse.json({ success: true, config, message: `Successfully restored revision ${targetRevNum}` });
    }

    return NextResponse.json({ success: false, error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    console.error('[FEATURES] Action failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
