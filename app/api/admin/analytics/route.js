import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { getFirebaseAdmin } from '../../../../lib/firebaseAdmin.js';
import { getAnalyticsSummary, resetAnalyticsData } from '../../../../lib/analyticsService.mjs';

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

export async function GET(req) {
  try {
    const isAdmin = await checkAdmin(req);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Administrator access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const timeRange = searchParams.get('timeRange') || 'all';

    const summary = await getAnalyticsSummary(timeRange);
    return NextResponse.json({ success: true, ...summary }, { status: 200 });
  } catch (error) {
    console.error('Admin analytics GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const isAdmin = await checkAdmin(req);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Administrator access required' }, { status: 403 });
    }

    const resetStore = resetAnalyticsData();
    return NextResponse.json({ success: true, message: 'Analytics data successfully reset' }, { status: 200 });
  } catch (error) {
    console.error('Admin analytics DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
