import { NextResponse } from 'next/server';
import { analyzeConnectedApis, pingService, updateCircuitBreakerState } from '../../../../lib/quotaService.mjs';
import { isAdminRequest } from '../../../../lib/requireAdminRequest.js';
import { EMPTY_BUDGETS, observeApiRequest, updateUsageBudgets, updateUsagePolicy, withUsageScope } from '../../../../lib/apiUsage.mjs';
import { updateAdminSetting } from '../../../../lib/adminSettingsStore.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withUsageScope(async function GET(request) {
  if (!await isAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 401 });
  }

  try {
    await observeApiRequest();
    const analysis = await analyzeConnectedApis();
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('[API QUOTAS] Analysis error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to analyze API quotas'
    }, { status: 500 });
  }
});

export const POST = withUsageScope(async function POST(request) {
  if (!await isAdminRequest(request)) {
    return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action = 'analyze' } = body;

    if (action === 'save-budgets') {
      let normalized;
      try {
        normalized = updateUsageBudgets(EMPTY_BUDGETS, body.services).services;
      } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      const budgets = await updateAdminSetting('apiBudgets', EMPTY_BUDGETS, state => updateUsageBudgets(state, normalized));
      return NextResponse.json({ success: true, budgets });
    }

    if (action === 'save-policy') {
      if (typeof body.lowQuotaMode !== 'boolean') {
        return NextResponse.json({ success: false, error: 'lowQuotaMode must be a boolean.' }, { status: 400 });
      }
      const budgets = await updateAdminSetting('apiBudgets', EMPTY_BUDGETS, state => updateUsagePolicy(state, body.lowQuotaMode));
      return NextResponse.json({ success: true, policy: budgets.policy });
    }

    if (action === 'ping') {
      const { service = 'all' } = body;
      if (service === 'all') {
        const results = {
          firestore: await pingService('firestore'),
          sheets: await pingService('sheets'),
          smtp: await pingService('smtp'),
          vercel: await pingService('vercel')
        };
        return NextResponse.json({ success: true, results });
      }
      const result = await pingService(service);
      return NextResponse.json({ success: true, service, result });
    }

    if (action === 'toggle-circuit-breaker') {
      const { forceMemoryCache, highEfficiencyMode, throttleAlertEmails } = body;
      const updated = updateCircuitBreakerState({
        forceMemoryCache,
        highEfficiencyMode,
        throttleAlertEmails
      });
      return NextResponse.json({ success: true, circuitBreakers: updated });
    }

    // Default: return full analysis
    const analysis = await analyzeConnectedApis();
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('[API QUOTAS] Action error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to execute quota action'
    }, { status: 400 });
  }
});
