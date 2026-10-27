import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { getFirebaseAdmin } from '../../../../lib/firebaseAdmin.js';
import { getAnalyticsSummary, resetAnalyticsData } from '../../../../lib/analyticsService.mjs';
import { observeApiRequest, withUsageScope } from '../../../../lib/apiUsage.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function checkAdmin(req) {
  // 1. Direct Bearer token validation
  if (await isAdminRequest(req)) {
    return true;
  }

  // 2. Email verification fallback via Firestore admin users
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get('email') || req.headers.get('x-admin-email') || '').toLowerCase().trim();
  if (!email) return false;

  // Root Tahaluf admin
  if (email === 'admin@tahaluf.com') return true;

  try {
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const userRecord = await adminAuth.getUserByEmail(email).catch(() => null);
    if (!userRecord) return false;

    const userDoc = await adminDb.collection('users').doc(userRecord.uid).get().catch(() => null);
    const data = userDoc?.data() || {};
    return data.role === 'admin' || data.isAdmin === true;
  } catch {
    return false;
  }
}

async function getAnalytics(req) {
  await observeApiRequest('analytics');
  try {
    const isAdmin = await checkAdmin(req);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Administrator access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const timeRange = searchParams.get('timeRange') || 'all';
    const userRoleFilter = searchParams.get('userRoleFilter') || 'non_admin';
    const userEmailFilter = searchParams.get('userEmail') || '';
    const timeZone = searchParams.get('timeZone') || 'UTC';

    const summary = await getAnalyticsSummary(timeRange, { userRoleFilter, userEmailFilter, timeZone });
    return NextResponse.json({ success: true, ...summary }, { status: 200 });
  } catch (error) {
    console.error('Admin analytics GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function updateAnalytics(req) {
  await observeApiRequest('analytics');
  try {
    const isAdmin = await checkAdmin(req);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Administrator access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { actionId, operation, reason } = body;
    const enable = operation === 'revert' ? false : (typeof body.enable === 'boolean' ? body.enable : true);
    const { searchParams } = new URL(req.url);
    const email = (searchParams.get('email') || req.headers.get('x-admin-email') || body.email || 'admin@tahaluf.com').toLowerCase().trim();

    if (!actionId) {
      return NextResponse.json({ error: 'Missing actionId parameter' }, { status: 400 });
    }

    const { applyAnalyticsAction } = await import('../../../../lib/analyticsService.mjs');
    const result = await applyAnalyticsAction(actionId, email, enable, reason);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Admin analytics POST action error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function deleteAnalytics(req) {
  await observeApiRequest('analytics');
  try {
    const isAdmin = await checkAdmin(req);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Administrator access required' }, { status: 403 });
    }

    await resetAnalyticsData();
    return NextResponse.json({ success: true, message: 'Analytics data successfully reset' }, { status: 200 });
  } catch (error) {
    console.error('Admin analytics DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withUsageScope(getAnalytics);
export const POST = withUsageScope(updateAnalytics);
export const DELETE = withUsageScope(deleteAnalytics);
