import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { getAnalyticsSummary, resetAnalyticsData } from '../../../../lib/analyticsService.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  try {
    const isAdmin = await isAdminRequest(req);
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
    const isAdmin = await isAdminRequest(req);
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
