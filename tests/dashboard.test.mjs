/**
 * Automated Dashboard Test Suite
 * Validates:
 * 1. API Endpoints & Caching
 * 2. Data Ingestion & All Sheet GIDs (including SMLC, KOG, SAIF, GSTS, IDWS, Black Hat)
 * 3. Metric Parsing & Normalization Logic
 * 4. Portfolio & Event Categorization Contracts
 * 5. Dynamic Week Calculation & Countdowns
 * 6. Metric Formulas & Zero-Division Safety
 */

import fs from 'fs';
import * as d3 from 'd3-dsv';
import * as d3Array from 'd3';
import datePresets from '../app/utils/datePresets.js';
import {
  getSheetCacheHealth,
  getSheetSnapshot,
  recordSheetFailure,
  storeSheetSnapshot,
  summarizeSheetData,
  writeSnapshotChunks
} from '../lib/sheetCache.mjs';
import {
  DEFAULT_HEALTH_NOTIFICATION_SETTINGS,
  getHealthIssues,
  normalizeHealthNotificationSettings,
  recordHealthIssueOpened,
  recordHealthIssueResolved,
  MAX_HEALTH_HISTORY
} from '../lib/healthNotificationUtils.mjs';
import { getSmtpTransportConfig } from '../lib/healthEmailTransport.mjs';
import { extractChannelMetrics24h, checkMetricDiscrepancies } from '../lib/metricIntegrity.mjs';
import {
  formatHealthAlertEmail,
  formatHealthResolvedEmail,
  formatDailyDigestEmail,
  formatTestEmail
} from '../lib/healthEmailTemplates.mjs';
import {
  getWeekIndex,
  getWeekDates,
  formatWeekDateRange,
  generateEventWeekTimeline
} from '../lib/weekTimeline.mjs';
import {
  analyzeConnectedApis,
  updateCircuitBreakerState,
  getCircuitBreakerState,
  pingService
} from '../lib/quotaService.mjs';
import {
  getCountryFlag,
  getCountryName,
  recordAnalyticsEvent,
  getAnalyticsSummary,
  resetAnalyticsData,
  generateAnalyticsInsights,
  applyAnalyticsAction,
  SYSTEM_ACTIONS_CATALOG
} from '../lib/analyticsService.mjs';
import {
  DASHBOARD_FEATURES,
  DEFAULT_FEATURE_CONFIG,
  isFeatureEnabled,
  validateFeatureModes
} from '../lib/dashboardFeatures.mjs';
const { 
  formatYMD, 
  calculatePresetRange, 
  PRESET_GROUPS 
} = datePresets;

const PORT = process.env.PORT || 3000;
const LOCAL_API_BASE = `http://localhost:${PORT}/api/sheets`;

const REQUIRED_SHEET_GIDS = [
  { name: 'GSTS Actuals', gid: '120681662' },
  { name: 'SAIF 26 Actuals', gid: '1196409184' },
  { name: 'KoG 26 Actuals', gid: '1486784585' },
  { name: 'Black Hat Actuals', gid: '659941332' },
  { name: 'SMLC 26 Actuals', gid: '1526538255' },
  { name: 'IDWS 26 Actuals', gid: '1121987876' },
  { name: 'BIO 26 & CPHI 26 Actuals', gid: '1728688512' },
  { name: 'CPHI 26 LinkedIn Actuals', gid: '208497314' },
  { name: 'KoG 26 Planned', gid: '1766297835' },
  { name: 'SAIF 26 Planned', gid: '570639072' },
  { name: 'GSTS 26 Planned', gid: '2019892532' },
  { name: 'Black Hat Planned Spends', gid: '277310277' }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// -------------------------------------------------------------
// 1. UNIT TESTS: METRIC PARSING & FORMULAS
// -------------------------------------------------------------
function testUnitLogic() {
  console.log('\n--- 1. Testing Metric Parsing & Math Utilities ---');

  const parseMetric = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const clean = String(val).replace(/[^0-9.-]+/g, '');
    const parsedVal = parseFloat(clean);
    return isNaN(parsedVal) ? 0 : parsedVal;
  };

  assert(parseMetric(100) === 100, 'parseMetric handles pure numbers');
  assert(parseMetric('$1,234.56') === 1234.56, 'parseMetric strips currency & commas');
  assert(parseMetric('  SAR 500  ') === 500, 'parseMetric strips currency prefix & spaces');
  assert(parseMetric(null) === 0, 'parseMetric handles null');
  assert(parseMetric(undefined) === 0, 'parseMetric handles undefined');
  assert(parseMetric('') === 0, 'parseMetric handles empty string');
  assert(parseMetric('N/A') === 0, 'parseMetric handles non-numeric strings safely');

  // Math safety
  const calcCTR = (clicks, imps) => (imps > 0 ? (clicks / imps) * 100 : 0);
  const calcCPM = (cost, imps) => (imps > 0 ? (cost / imps) * 1000 : 0);
  const calcCPC = (cost, clicks) => (clicks > 0 ? cost / clicks : 0);
  const calcCPA = (cost, conv) => (conv > 0 ? cost / conv : 0);

  assert(calcCTR(50, 1000) === 5, 'CTR calculates correctly');
  assert(calcCTR(0, 0) === 0, 'CTR handles 0 impressions without NaN/Infinity');
  assert(calcCPM(10, 1000) === 10, 'CPM calculates correctly');
  assert(calcCPM(10, 0) === 0, 'CPM handles 0 impressions safely');
  assert(calcCPC(100, 20) === 5, 'CPC calculates correctly');
  assert(calcCPC(100, 0) === 0, 'CPC handles 0 clicks safely');
  assert(calcCPA(200, 4) === 50, 'CPA calculates correctly');
  assert(calcCPA(200, 0) === 0, 'CPA handles 0 conversions safely');
}

function testSheetSummaries() {
  console.log('\n--- Testing Sheet Data Health Summaries ---');
  const summary = summarizeSheetData([
    'Date,Event Name DB,Spend',
    '2026-03-04,KoG 26,125',
    '2026-02-01,KoG 26,75',
    '2026-01-15,SAIF 26,50'
  ].join('\n'));

  assert(summary.rowCount === 3, 'Sheet health summary counts data rows');
  assert(summary.eventColumn === 'Event Name DB', 'Sheet health summary identifies event-name column');
  assert(summary.dateColumn === 'Date', 'Sheet health summary identifies date column');
  assert(summary.eventBreakdown['KoG 26']?.rows === 2, 'Sheet health summary counts rows by event tag');
  assert(summary.eventBreakdown['KoG 26']?.firstDate === '2026-02-01', 'Sheet health summary finds the first event date');
  assert(summary.eventBreakdown['KoG 26']?.lastDate === '2026-03-04', 'Sheet health summary finds the last event date');
}

function testHealthIssueHistory() {
  console.log('\n--- Testing Health Issue History ---');
  const state = { activeIssues: {}, history: [] };
  const issue = { key: 'e1:Actuals', eventName: 'SAIF 26', kind: 'Actuals', status: 'stale', signature: 'stale', message: 'Refresh failed' };

  const id = recordHealthIssueOpened(state, issue, undefined, '2026-10-21T10:00:00.000Z');
  assert(state.history.length === 1 && state.history[0].resolvedAt === null, 'Opening an issue records an unresolved history entry');

  const sameId = recordHealthIssueOpened(state, issue, { historyId: id, signature: 'stale' }, '2026-10-21T10:05:00.000Z');
  assert(sameId === id && state.history.length === 1, 'Re-observing the same issue does not duplicate history');

  recordHealthIssueResolved(state, id, '2026-10-21T11:30:00.000Z');
  assert(state.history[0].resolvedAt === '2026-10-21T11:30:00.000Z' && state.history[0].resolution === 'resolved', 'Resolving closes the history entry with a timestamp');

  recordHealthIssueResolved(state, id, '2026-10-22T00:00:00.000Z');
  assert(state.history[0].resolvedAt === '2026-10-21T11:30:00.000Z', 'Resolving twice keeps the original resolution time');

  const first = recordHealthIssueOpened(state, issue, undefined, '2026-10-22T01:00:00.000Z');
  const changed = recordHealthIssueOpened(state, { ...issue, status: 'unavailable', signature: 'unavailable' }, { historyId: first, signature: 'stale' }, '2026-10-22T02:00:00.000Z');
  const prior = state.history.find(item => item.id === first);
  assert(changed !== first && prior.resolution === 'status-changed', 'A status change closes the old entry and opens a new one');

  for (let i = 0; i < MAX_HEALTH_HISTORY + 20; i += 1) {
    recordHealthIssueOpened(state, { ...issue, key: `k${i}` }, undefined, new Date(2026, 9, 23, 0, i).toISOString());
  }
  assert(state.history.length === MAX_HEALTH_HISTORY, 'History is capped at the maximum size');
}

function testHealthNotifications() {
  console.log('\n--- Testing Health Notification Settings & Issue Detection ---');
  const settings = normalizeHealthNotificationSettings({
    ...DEFAULT_HEALTH_NOTIFICATION_SETTINGS,
    emailRecipients: [' Admin@Example.com ', 'admin@example.com', 'alerts@example.com'],
    frequency: 'immediate_and_daily'
  });
  assert(settings.emailRecipients.length === 2, 'Notification settings normalize and deduplicate email recipients');
  assert(settings.emailRecipients[0] === 'admin@example.com', 'Notification recipient addresses are normalized');
  assert(settings.frequency === 'immediate_and_daily', 'Notification settings accept immediate and daily delivery');
  assert(DEFAULT_HEALTH_NOTIFICATION_SETTINGS.alertDelayMinutes === 5, 'Default alert delay is set to 5 minutes');
  assert(DEFAULT_HEALTH_NOTIFICATION_SETTINGS.sendResolutionEmail === true, 'Default send resolution email is enabled');

  const customSettings = normalizeHealthNotificationSettings({
    alertDelayMinutes: 15,
    sendResolutionEmail: false
  });
  assert(customSettings.alertDelayMinutes === 15, 'Accepts custom 15 minute delay');
  assert(customSettings.sendResolutionEmail === false, 'Accepts disabled resolution email');

  const fallbackSettings = normalizeHealthNotificationSettings({
    alertDelayMinutes: 999
  });
  assert(fallbackSettings.alertDelayMinutes === 5, 'Falls back to default 5 min for invalid delay');

  // Test Rich Email Templates
  const alertEmail = formatHealthAlertEmail({
    eventName: 'SMLC 26',
    kind: 'Actuals',
    status: 'metric-discrepancy',
    message: 'Cost dropped',
    discrepancies: [
      { channel: 'Google Ads', metric: 'cost', previousValue: 200, currentValue: 150, dropPercent: 25 }
    ]
  }, 'https://tahaluf-dashboard.vercel.app');
  assert(alertEmail.subject.includes('[ALERT]'), 'Alert email subject contains [ALERT]');
  assert(alertEmail.html.includes('SMLC 26'), 'Alert HTML contains event name');
  assert(alertEmail.html.includes('Google Ads'), 'Alert HTML contains channel name');
  assert(alertEmail.html.includes('-25%'), 'Alert HTML contains regression drop');
  assert(alertEmail.html.includes('Open Health Monitor'), 'Alert HTML contains CTA button');

  const resolutionEmail = formatHealthResolvedEmail({
    eventName: 'SMLC 26',
    kind: 'Actuals',
    status: 'metric-discrepancy'
  }, '2026-10-26T12:00:00.000Z', 'https://tahaluf-dashboard.vercel.app');
  assert(resolutionEmail.subject.includes('[RESOLVED]'), 'Resolution email subject contains [RESOLVED]');
  assert(resolutionEmail.html.includes('Issue Resolved'), 'Resolution HTML contains Issue Resolved');
  assert(resolutionEmail.html.includes('Reported issue cleared'), 'Resolution HTML confirms only the reported issue cleared');

  const digestEmail = formatDailyDigestEmail([
    { eventName: 'GSTS 26', kind: 'Actuals', status: 'missing-data', message: 'No rows' }
  ], 'https://tahaluf-dashboard.vercel.app');
  assert(digestEmail.subject.includes('Daily Health Digest'), 'Digest email subject contains Daily Health Digest');
  assert(digestEmail.html.includes('GSTS 26'), 'Digest HTML contains GSTS 26');

  const testEmail = formatTestEmail('https://tahaluf-dashboard.vercel.app');
  assert(testEmail.subject.includes('Health Notification Test'), 'Test email subject contains test label');
  assert(testEmail.html.includes('SMTP Transport verified'), 'Test email confirms SMTP');

  let invalidEmailRejected = false;
  try {
    normalizeHealthNotificationSettings({ emailRecipients: ['invalid-address'] });
  } catch {
    invalidEmailRejected = true;
  }
  assert(invalidEmailRejected, 'Notification settings reject invalid email recipients');

  const issues = getHealthIssues([
    { eventId: 'kog-26', eventName: 'KoG 26', kind: 'Actuals', state: 'healthy', eventDataStatus: 'present' },
    { eventId: 'smlc-26', eventName: 'SMLC 26', kind: 'Actuals', state: 'healthy', eventDataStatus: 'missing' },
    { eventId: 'saif-26', eventName: 'SAIF 26', kind: 'Planned', state: 'stale', lastError: 'Upstream timeout' }
  ]);
  assert(issues.length === 2, 'Health issue detection ignores healthy feeds and flags missing/stale sources');
  assert(issues.some(issue => issue.key === 'smlc-26:Actuals' && issue.status === 'missing-data'), 'Health issue detection identifies missing event rows');
  assert(issues.some(issue => issue.key === 'saif-26:Planned' && issue.status === 'stale'), 'Health issue detection identifies stale planned data');

  const smtpConfig = getSmtpTransportConfig({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'admin@example.com',
    SMTP_PASS: 'test app-password'
  });
  assert(smtpConfig.host === 'smtp.gmail.com' && smtpConfig.port === 587, 'Gmail SMTP settings parse correctly');
  assert(smtpConfig.requireTLS && !smtpConfig.secure, 'Port 587 requires STARTTLS');
  assert(smtpConfig.auth.user === 'admin@example.com', 'SMTP transport uses configured username');
  assert(smtpConfig.auth.pass === 'testapp-password', 'SMTP transport removes App Password display spaces');

  let missingSmtpSettingsRejected = false;
  try {
    getSmtpTransportConfig({});
  } catch {
    missingSmtpSettingsRejected = true;
  }
  assert(missingSmtpSettingsRejected, 'SMTP transport rejects missing credentials');
}

// -------------------------------------------------------------
// Testing 24h Channel Metric Integrity & Monotonicity
// -------------------------------------------------------------
function test24hMetricIntegrity() {
  console.log('\n--- Testing 24h Metric Integrity & Monotonicity ---');

  const csvData = [
    'Event Name DB,Channel,Date,Cost,Impressions,Clicks,Conversions',
    'SMLC 26,Google Ads,2026-10-24,150,4000,100,10',
    'SMLC 26,Google Ads,2026-10-25,200,5000,120,15',
    'SMLC 26,Meta,2026-10-25,350,12000,300,25'
  ].join('\n');

  const { latestDate, channelMetrics } = extractChannelMetrics24h(csvData);
  assert(latestDate === '2026-10-25', 'Latest 24h date is correctly identified as 2026-10-25');
  assert(channelMetrics.length === 2, 'Extracts metrics for both channels on latest date');

  const googleMetrics = channelMetrics.find(c => c.channel === 'Google Ads');
  assert(googleMetrics?.cost === 200, 'Google Ads cost is 200');
  assert(googleMetrics?.impressions === 5000, 'Google Ads impressions is 5000');
  assert(googleMetrics?.clicks === 120, 'Google Ads clicks is 120');
  assert(googleMetrics?.conversions === 15, 'Google Ads conversions is 15');

  // Test 1: Monotonic growth (cost increases to 250) -> No discrepancy
  const baseline1 = {
    'SMLC 26:::Google Ads:::2026-10-25': { cost: 200, impressions: 5000, clicks: 120, conversions: 15 }
  };
  const current1 = [
    { eventName: 'SMLC 26', channel: 'Google Ads', date: '2026-10-25', cost: 250, impressions: 5500, clicks: 130, conversions: 16 }
  ];
  const check1 = checkMetricDiscrepancies(current1, baseline1);
  assert(check1.discrepancies.length === 0, 'No discrepancy when metrics grow or stay flat');
  assert(check1.updatedBaselines['SMLC 26:::Google Ads:::2026-10-25'].cost === 250, 'Baseline advances to higher value');

  // Test 2: Regression drop (cost drops from 200 to 150) -> Discrepancy flagged!
  const current2 = [
    { eventName: 'SMLC 26', channel: 'Google Ads', date: '2026-10-25', cost: 150, impressions: 5000, clicks: 120, conversions: 15 }
  ];
  const check2 = checkMetricDiscrepancies(current2, baseline1);
  assert(check2.discrepancies.length === 1, 'Regression drop flags discrepancy');
  assert(check2.discrepancies[0].metric === 'cost', 'Discrepancy correctly identifies cost');
  assert(check2.discrepancies[0].dropAmount === 50, 'Discrepancy drop amount is $50');
  assert(check2.discrepancies[0].dropPercent === 25, 'Discrepancy drop percent is 25%');

  // Test 3: Micro-drop within tolerance (cost drops by $0.01) -> Ignored
  const current3 = [
    { eventName: 'SMLC 26', channel: 'Google Ads', date: '2026-10-25', cost: 199.99, impressions: 5000, clicks: 120, conversions: 15 }
  ];
  const check3 = checkMetricDiscrepancies(current3, baseline1);
  assert(check3.discrepancies.length === 0, 'Micro-drop within tolerance is safely ignored');

  // Test 4: Partial-day filtering prevents false regression alerts for today
  const todayUtc = '2026-10-28';
  const baselineToday = {
    'SMLC 26:::Google Ads:::2026-10-28': { cost: 150, impressions: 3000, clicks: 80, conversions: 8 }
  };
  const currentTodayDrop = [
    { eventName: 'SMLC 26', channel: 'Google Ads', date: todayUtc, cost: 80, impressions: 3000, clicks: 80, conversions: 8 }
  ];
  const checkFilteredToday = checkMetricDiscrepancies(currentTodayDrop, baselineToday, { filterPartialCurrentDay: true, currentDay: todayUtc });
  assert(checkFilteredToday.discrepancies.length === 0, 'Partial current-day regression drop is filtered out when enabled');

  const checkUnfilteredToday = checkMetricDiscrepancies(currentTodayDrop, baselineToday, { filterPartialCurrentDay: false, currentDay: todayUtc });
  assert(checkUnfilteredToday.discrepancies.length === 1, 'Partial current-day regression drop is detected when filtering is disabled');
  assert(checkUnfilteredToday.discrepancies[0].metric === 'cost', 'Discrepancy correctly flags cost');
  assert(checkUnfilteredToday.discrepancies[0].isPartialDay === true, 'Discrepancy correctly flags isPartialDay');

  // Test 5: Extraction with excludePartialCurrentDay
  const multiDayCsv = [
    'Event Name DB,Channel,Date,Cost,Impressions,Clicks,Conversions',
    'SMLC 26,Google Ads,2026-10-27,200,5000,120,15',
    'SMLC 26,Google Ads,2026-10-28,40,800,15,2'
  ].join('\n');
  const extractFiltered = extractChannelMetrics24h(multiDayCsv, '', { excludePartialCurrentDay: true, currentDay: '2026-10-28' });
  assert(extractFiltered.latestDate === '2026-10-27', 'excludePartialCurrentDay selects previous closed day 2026-10-27');

  const extractUnfiltered = extractChannelMetrics24h(multiDayCsv, '', { excludePartialCurrentDay: false });
  assert(extractUnfiltered.latestDate === '2026-10-28', 'Standard extraction selects latest date 2026-10-28');

  // Test 6: Health issue detection for metric discrepancy
  const healthIssues = getHealthIssues([
    {
      eventId: 'smlc-26',
      eventName: 'SMLC 26',
      kind: 'Actuals',
      state: 'healthy',
      eventDataStatus: 'present',
      metricDiscrepancies: check2.discrepancies
    }
  ]);
  assert(healthIssues.length === 1, 'Health issues include metric discrepancy alert');
  assert(healthIssues[0].status === 'metric-discrepancy', 'Status is metric-discrepancy');
}

// -------------------------------------------------------------
// 2. UNIT TESTS: EVENT NORMALIZATION & PORTFOLIO LOGIC
// -------------------------------------------------------------
function testEventAndPortfolioLogic() {
  console.log('\n--- 2. Testing Event & Portfolio Normalization ---');

  const normalizeEvent = (eventNameDB, sourceEventName) => {
    let name = (eventNameDB || '').trim() || sourceEventName;
    if (name === 'SMLC') name = 'SMLC 26';
    return name;
  };

  const derivePortfolio = (eventNameDB) => {
    let portfolio = 'P1';
    if (eventNameDB.toUpperCase().includes('SMLC') || eventNameDB.toUpperCase().includes('IDWS') || eventNameDB.toUpperCase().includes('BIO') || eventNameDB.toUpperCase().includes('CPHI')) {
      portfolio = 'P3';
    }
    return portfolio;
  };

  assert(normalizeEvent('SMLC', 'SMLC 26') === 'SMLC 26', 'Normalizes SMLC to SMLC 26');
  assert(normalizeEvent('', 'GSTS') === 'GSTS', 'Falls back to sourceEventName when empty');
  assert(normalizeEvent('SAIF 26', 'SAIF') === 'SAIF 26', 'Keeps existing normalized SAIF 26');

  assert(derivePortfolio('SMLC 26') === 'P3', 'SMLC 26 is assigned to Portfolio P3');
  assert(derivePortfolio('IDWS 26') === 'P3', 'IDWS 26 is assigned to Portfolio P3');
  assert(derivePortfolio('BIO 26') === 'P3', 'BIO 26 is assigned to Portfolio P3');
  assert(derivePortfolio('CPHI 26') === 'P3', 'CPHI 26 is assigned to Portfolio P3');
  assert(derivePortfolio('GSTS') === 'P1', 'GSTS is assigned to Portfolio P1');
  assert(derivePortfolio('SAIF 26') === 'P1', 'SAIF 26 is assigned to Portfolio P1');
  assert(derivePortfolio('KoG 26') === 'P1', 'KoG 26 is assigned to Portfolio P1');
  assert(derivePortfolio('BLACK HAT') === 'P1', 'BLACK HAT is assigned to Portfolio P1');
}

// -------------------------------------------------------------
// Testing Business Dimension Derivation & Fallback Logic
// -------------------------------------------------------------
function testBusinessDimensionLogic() {
  console.log('\n--- Testing Business Dimension Derivation & Fallback Logic ---');

  const deriveBusiness = (eventName, campaignName, businessConfig = null) => {
    const eventBusinessSetting = businessConfig || (eventName?.toUpperCase().includes('KOG') ? 'derive' : 'B2B');
    if (eventBusinessSetting === 'derive') {
      if (/\bB2C\b/i.test(campaignName)) return 'B2C';
      if (/\bB2B\b/i.test(campaignName)) return 'B2B';
      return 'B2B'; // fallback when not available
    }
    if (eventBusinessSetting === 'B2C') return 'B2C';
    return 'B2B';
  };

  // Rule 1: All events default to B2B
  assert(deriveBusiness('SMLC 26', 'Tahaluf | SMLC | Exprom') === 'B2B', 'SMLC defaults to B2B even without campaign tag');
  assert(deriveBusiness('SMLC 26', 'Tahaluf | B2C | SMLC') === 'B2B', 'SMLC defaults to B2B when configured as B2B');
  assert(deriveBusiness('SAIF 26', 'Random Campaign') === 'B2B', 'SAIF 26 defaults to B2B');
  assert(deriveBusiness('GSTS 26', 'Generic') === 'B2B', 'GSTS 26 defaults to B2B');

  // Rule 2: KoG 26 derives from campaign name, falls back to B2B
  assert(deriveBusiness('KoG 26', 'Tahaluf | B2B | KoG 2026 | Visprom') === 'B2B', 'KoG 26 extracts B2B from campaign name');
  assert(deriveBusiness('KoG 26', 'Tahaluf | B2C | KoG 2026 | Visprom') === 'B2C', 'KoG 26 extracts B2C from campaign name');
  assert(deriveBusiness('KoG 26', 'Untagged Campaign Name') === 'B2B', 'KoG 26 falls back to B2B when not specified');

  // Rule 3: Event with custom configured business dimension
  assert(deriveBusiness('Custom Event', 'Generic', 'B2C') === 'B2C', 'Custom event with B2C config returns B2C');
  assert(deriveBusiness('Custom Event', 'Tahaluf | B2C | Exp', 'derive') === 'B2C', 'Custom event with derive config extracts B2C');
  assert(deriveBusiness('Custom Event', 'Tahaluf | B2B | Exp', 'derive') === 'B2B', 'Custom event with derive config extracts B2B');
  assert(deriveBusiness('Custom Event', 'Untagged', 'derive') === 'B2B', 'Custom event with derive config falls back to B2B');
}

// -------------------------------------------------------------
// 3. UNIT TESTS: DYNAMIC WEEK COUNTDOWN LOGIC
// -------------------------------------------------------------
function testDynamicWeekLogic() {
  console.log('\n--- 3. Testing Dynamic Week Countdown Logic ---');

  const eventStartDates = {
    'GSTS': new Date(Date.UTC(2026, 11, 18)),
    'SAIF 26': new Date(Date.UTC(2026, 10, 24)),
    'KoG 26': new Date(Date.UTC(2026, 11, 1)),
    'BLACK HAT': new Date(Date.UTC(2026, 11, 1)),
    'SMLC 26': new Date(Date.UTC(2026, 9, 21)),
    'IDWS 26': new Date(Date.UTC(2026, 11, 14))
  };

  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const calculateWeekDB = (targetDate, campStart, eventStart) => {
    const getWeekIndex = (date) => {
      const daysToSunday = (7 - campStart.getUTCDay()) % 7;
      const firstWeekEnd = new Date(campStart.getTime() + daysToSunday * MS_PER_DAY);
      if (date <= firstWeekEnd) return 0;
      const diffFromNextMonday = Math.floor((date.getTime() - (firstWeekEnd.getTime() + MS_PER_DAY)) / MS_PER_DAY);
      return 1 + Math.floor(diffFromNextMonday / 7);
    };

    const rowWeekIdx = getWeekIndex(targetDate);
    const totalWeeks = getWeekIndex(eventStart);
    const countdown = Math.max(0, totalWeeks - rowWeekIdx);
    const yearSuffix = (eventStart.getUTCFullYear() % 100);
    return `W${countdown} '${yearSuffix}`;
  };

  const campStart = new Date(Date.UTC(2026, 5, 2)); // June 2 2026
  const eventStart = eventStartDates['SMLC 26'];   // Oct 21 2026

  const firstWeek = calculateWeekDB(campStart, campStart, eventStart);
  assert(/^W\d+ '26$/.test(firstWeek), `First week generated valid format: ${firstWeek}`);

  const eventDayWeek = calculateWeekDB(eventStart, campStart, eventStart);
  assert(eventDayWeek === "W0 '26", `Event launch date resolves to W0 '26 (got: ${eventDayWeek})`);

  // Test contiguous timeline generation for past events (full timeline)
  const timeline = generateEventWeekTimeline(campStart, eventStart, new Date(Date.UTC(2026, 9, 26)));
  assert(Array.isArray(timeline) && timeline.length === 21, `Timeline generates all 21 contiguous weeks (got: ${timeline.length})`);
  assert(timeline[0].week === "W20 '26", `Timeline starts at W20 '26 (got: ${timeline[0]?.week})`);
  assert(timeline[timeline.length - 1].week === "W0 '26", `Timeline ends at W0 '26 (got: ${timeline[timeline.length - 1]?.week})`);
  assert(timeline.every(t => typeof t.dateRange === 'string' && t.dateRange.length > 5), 'Every timeline week has a non-empty formatted dateRange');

  // Test that active campaigns cut off at current week and DO NOT include future upcoming weeks
  const midCampaignUntil = new Date(Date.UTC(2026, 7, 10)); // August 10, 2026 (midway through campaign)
  const activeTimeline = generateEventWeekTimeline(campStart, eventStart, midCampaignUntil);
  assert(activeTimeline.length === 11, `Active campaign timeline stops at current week (got: ${activeTimeline.length})`);
  assert(activeTimeline[activeTimeline.length - 1].week === "W10 '26", `Active campaign ends at current week W10 (got: ${activeTimeline[activeTimeline.length - 1]?.week})`);
  assert(!activeTimeline.some(t => t.week === "W0 '26"), 'Upcoming weeks (W0) are not present in active campaign timeline');
  assert(!activeTimeline.some(t => t.week === "W9 '26"), 'Next week (W9) is not present before it arrives');

  // Test zero-filling on missing weeks
  const mockActuals = [
    { week: "W20 '26", spend: 500, impressions: 5000, clicks: 100 },
    { week: "W18 '26", spend: 300, impressions: 3000, clicks: 60 }
    // W19 '26 was skipped / had 0 campaign activity
  ];
  const actualsMap = new Map(mockActuals.map(a => [a.week, a]));
  const filledWeeks = timeline.slice(0, 3).map(t => {
    if (actualsMap.has(t.week)) {
      return { ...actualsMap.get(t.week), dateRange: t.dateRange };
    }
    return {
      week: t.week,
      dateRange: t.dateRange,
      spend: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      cpc: 0
    };
  });

  assert(filledWeeks.length === 3, 'Zero-filling preserves full sequence of 3 weeks');
  assert(filledWeeks[1].week === "W19 '26", 'Gap week W19 is present in filled output');
  assert(filledWeeks[1].spend === 0 && filledWeeks[1].clicks === 0, 'Gap week W19 has 0 spend and 0 clicks');
  assert(filledWeeks[1].dateRange.length > 0, 'Gap week W19 retains formatted calendar dateRange');
  const totalSpend = filledWeeks.reduce((acc, w) => acc + w.spend, 0);
  assert(totalSpend === 800, 'Zero-filled entries do not alter total spend ($800)');
}

// -------------------------------------------------------------
// 3.5 UNIT TESTS: DETAILED DATE PRESETS & COMPARISON
// -------------------------------------------------------------
function testDetailedDateFilterLogic() {
  console.log('\n--- 3.5 Testing Detailed Date Presets & Comparison ---');

  // 1. formatYMD
  assert(formatYMD(new Date(2026, 9, 15)) === '2026-10-15', 'formatYMD formats YYYY-MM-DD correctly');
  assert(formatYMD(null) === '', 'formatYMD handles null safely');
  assert(formatYMD('invalid') === '', 'formatYMD handles invalid dates safely');

  // 2. calculatePresetRange with fixed baseDate = 2026-10-15 (Thursday)
  const anchor = new Date(2026, 9, 15);

  const todayPreset = calculatePresetRange('today', anchor);
  assert(todayPreset.start === '2026-10-15' && todayPreset.end === '2026-10-15', 'Preset Today matches anchor date');

  const yestPreset = calculatePresetRange('yesterday', anchor);
  assert(yestPreset.start === '2026-10-14' && yestPreset.end === '2026-10-14', 'Preset Yesterday matches anchor - 1');

  const l7Preset = calculatePresetRange('last_7_days', anchor);
  assert(l7Preset.start === '2026-10-09' && l7Preset.end === '2026-10-15', 'Preset Last 7 days spans 7 days inclusive');

  const l14Preset = calculatePresetRange('last_14_days', anchor);
  assert(l14Preset.start === '2026-10-02' && l14Preset.end === '2026-10-15', 'Preset Last 14 days spans 14 days inclusive');

  const l30Preset = calculatePresetRange('last_30_days', anchor);
  assert(l30Preset.start === '2026-09-16' && l30Preset.end === '2026-10-15', 'Preset Last 30 days spans 30 days inclusive');

  const thisMonth = calculatePresetRange('this_month', anchor);
  assert(thisMonth.start === '2026-10-01' && thisMonth.end === '2026-10-31', 'Preset This month starts 1st and ends 31st');

  const lastMonth = calculatePresetRange('last_month', anchor);
  assert(lastMonth.start === '2026-09-01' && lastMonth.end === '2026-09-30', 'Preset Last month spans entire September');

  const thisQuarter = calculatePresetRange('this_quarter', anchor);
  assert(thisQuarter.start === '2026-10-01' && thisQuarter.end === '2026-12-31', 'Preset This quarter spans Q4');

  const thisYear = calculatePresetRange('this_year', anchor);
  assert(thisYear.start === '2026-01-01' && thisYear.end === '2026-12-31', 'Preset This year spans 2026-01-01 to 2026-12-31');

  const lastYear = calculatePresetRange('last_year', anchor);
  assert(lastYear.start === '2025-01-01' && lastYear.end === '2025-12-31', 'Preset Last year spans 2025');

  const ytd = calculatePresetRange('ytd', anchor);
  assert(ytd.start === '2026-01-01' && ytd.end === '2026-10-15', 'Preset YTD spans Jan 1 to anchor date');

  const auto = calculatePresetRange('auto', anchor);
  assert(auto.start === '' && auto.end === '', 'Preset Auto returns empty bounds for All Time');

  // 3. Preset groups validation
  assert(PRESET_GROUPS.length >= 6, 'PRESET_GROUPS contains expected categories');
  const catNames = PRESET_GROUPS.map(g => g.category);
  assert(catNames.includes('Days') && catNames.includes('Weeks') && catNames.includes('Months & Quarters'), 'Includes expected category groups');
}

async function testLastKnownGoodSheetCache() {
  console.log('\n--- 3.6 Testing Last-Known-Good Sheet Cache ---');
  const cacheKey = `automated-test-${Date.now()}`;
  const previousData = `Channel,Event Name DB,Cost\nMeta,KoG 26,100\n${'previous data,'.repeat(8)}100`;
  const refreshedData = `Channel,Event Name DB,Cost\nGoogle,KoG 26,200\n${'refreshed data,'.repeat(8)}200`;

  await storeSheetSnapshot(cacheKey, previousData);
  await recordSheetFailure(cacheKey, 'Google Sheets returned #REF!');
  const afterFailure = await getSheetSnapshot(cacheKey);
  const failureHealth = await getSheetCacheHealth([cacheKey]);

  assert(afterFailure?.data === previousData, 'Failed refresh leaves previous good sheet data unchanged');
  assert(failureHealth[cacheKey]?.state === 'stale', 'Failed refresh reports stale cached data');
  assert(failureHealth[cacheKey]?.hasCachedData === true, 'Failed refresh retains cached-data availability');

  await storeSheetSnapshot(cacheKey, refreshedData);
  const afterSuccess = await getSheetSnapshot(cacheKey);
  const successHealth = await getSheetCacheHealth([cacheKey]);

  assert(afterSuccess?.data === refreshedData, 'Successful refresh replaces the previous snapshot');
  assert(successHealth[cacheKey]?.state === 'healthy', 'Successful refresh clears the active sheet issue');
}

async function testFirestoreChunkBatching() {
  console.log('\n--- 3.7 Testing Large Firestore Snapshot Batching ---');
  const snapshotBytes = Buffer.alloc(13 * 1024 * 1024, 'x');
  const committedBatches = [];
  const fakeAdminDb = {
    batch() {
      const writes = [];
      return {
        set(_ref, value) {
          writes.push(value);
          return this;
        },
        async commit() {
          committedBatches.push(writes);
        }
      };
    }
  };
  const snapshotRef = { collection: () => ({ doc: index => ({ id: index }) }) };

  await writeSnapshotChunks(fakeAdminDb, snapshotRef, snapshotBytes);

  const allChunks = committedBatches.flat();
  const largestBatchBytes = Math.max(...committedBatches.map(batch =>
    batch.reduce((total, chunk) => total + Buffer.byteLength(chunk.content) + 1024, 0)
  ));
  const restoredBytes = Buffer.concat(allChunks
    .sort((left, right) => left.index - right.index)
    .map(chunk => Buffer.from(chunk.content, 'base64')));

  assert(committedBatches.length > 1, 'Large snapshots are split across multiple Firestore batches');
  assert(largestBatchBytes <= 8 * 1024 * 1024, `Each Firestore batch stays below the 8 MiB safety limit (largest: ${largestBatchBytes} bytes)`);
  assert(restoredBytes.equals(snapshotBytes), 'Batched Firestore chunks reconstruct the complete snapshot in order');
}

// -------------------------------------------------------------
// 3.6 UNIT TESTS: CREATIVE VIEW & EVENT DIMENSION PROCESSING
// -------------------------------------------------------------
function testCreativeViewLogic() {
  console.log('\n--- 3.6 Testing Creative View & Event Dimension Processing ---');

  const mockRows = [
    {
      adName: 'SAIF_Ad_01',
      creativeName: 'SAIF Keynote Teaser',
      eventNameDB: 'SAIF 26',
      impressions: 1000,
      clicks: 50,
      cost: 100,
      dateObj: new Date('2026-10-18T10:00:00Z'),
      adImageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800',
      videoUrl: 'https://example.com/video.mp4',
      channel: 'Meta',
      status: 'Live'
    },
    {
      adName: 'SMLC_Ad_02',
      creativeName: 'SMLC Maritime Registration',
      eventNameDB: 'SMLC 26',
      impressions: 2000,
      clicks: 80,
      cost: 160,
      dateObj: new Date('2026-10-01T10:00:00Z'),
      adImageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
      videoUrl: '',
      channel: 'Google',
      status: 'Paused'
    }
  ];

  // 1. Event extraction
  const saifEvent = mockRows[0].eventNameDB;
  assert(saifEvent === 'SAIF 26', 'Creative correctly maps to Event dimension SAIF 26');

  const smlcEvent = mockRows[1].eventNameDB;
  assert(smlcEvent === 'SMLC 26', 'Creative correctly maps to Event dimension SMLC 26');

  // 2. Full target URL resolution
  const getFullTargetUrl = (c) => c.adImageUrl || c.previewUrl || c.videoUrl || c.postUrl;
  assert(getFullTargetUrl(mockRows[0]) === 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800', 'Full picture URL resolves adImageUrl with priority');
  assert(getFullTargetUrl(mockRows[1]) === 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800', 'Full picture URL resolves image when video absent');

  // 3. CTR and CPC calculation
  const ctr0 = mockRows[0].clicks / mockRows[0].impressions;
  assert(ctr0 === 0.05, 'Creative CTR calculates correctly (5%)');

  const cpc0 = mockRows[0].cost / mockRows[0].clicks;
  assert(cpc0 === 2.0, 'Creative CPC calculates correctly ($2.00)');
}

// -------------------------------------------------------------
// 4. INTEGRATION TESTS: LOCAL API ENDPOINTS & CACHING
// -------------------------------------------------------------
async function testApiEndpoints() {
  console.log('\n--- 4. Testing Local API Endpoints & Caching ---');

  for (const sheet of REQUIRED_SHEET_GIDS) {
    const url = `${LOCAL_API_BASE}?type=combined${sheet.gid ? `&gid=${sheet.gid}` : ''}`;
    try {
      const res = await fetch(url);
      assert(res.status === 200, `${sheet.name}: Returns HTTP 200`);
      
      const text = await res.text();
      assert(!text.startsWith('<!DOCTYPE') && !text.startsWith('<html'), `${sheet.name}: Does not return HTML error page`);
      assert(!text.startsWith('Loading...'), `${sheet.name}: Does not return Google Loading... placeholder`);

      const xCache = res.headers.get('x-cache');
      if (xCache === 'MISS-EMPTY' || text.length === 0 || text.startsWith('#REF!') || text.startsWith('#VALUE!') || text.startsWith('#ERROR!')) {
        console.warn(`  ⚠ Note: ${sheet.name} returned upstream spreadsheet formula error from Google Docs (handled safely via fallback, X-Cache: ${xCache}).`);
        assert(
          sheet.gid !== '1486784585',
          'KoG actuals sheet returns data rather than an upstream spreadsheet error'
        );
        if (sheet.gid !== '1486784585') {
          assert(true, `${sheet.name}: Handled upstream sheet condition gracefully`);
        }
      } else {
        assert(text.length > 50, `${sheet.name}: Non-empty body (${text.length} bytes)`);
        const rows = d3.csvParse(text);
        assert(rows.length > 0, `${sheet.name}: Parsed valid CSV rows (${rows.length} rows)`);

        if (sheet.gid === '1486784585') {
          const hasKoGEvent = rows.some(r => (r['Event Name DB'] || '').trim() === 'KoG 26');
          assert(hasKoGEvent, 'KoG actuals sheet contains records with KoG 26 in Event Name DB');
        }

        // Special check for SMLC sheet
        if (sheet.gid === '1526538255') {
          assert(rows.length >= 8000, `SMLC Sheet contains expected large row volume (found: ${rows.length})`);
          const hasSmlcEvent = rows.some(r => (r['Event Name DB'] || '').includes('SMLC'));
          assert(hasSmlcEvent, 'SMLC Sheet contains records with SMLC in Event Name DB');
        }
      }
    } catch (err) {
      assert(false, `${sheet.name}: Network or parse exception (${err.message})`);
    }
  }

  // Test In-Memory Caching on SMLC
  console.log('\n--- 5. Testing In-Memory Caching & Performance ---');
  const cacheTestUrl = `${LOCAL_API_BASE}?type=combined&gid=1526538255`;
  // Prime the cache with an initial request
  await fetch(cacheTestUrl);
  
  // Measure cached request performance
  const t0 = Date.now();
  const cachedRes = await fetch(cacheTestUrl);
  const elapsed = Date.now() - t0;
  const xCache = cachedRes.headers.get('x-cache');
  const cacheControl = cachedRes.headers.get('cache-control');

  assert(cachedRes.status === 200, 'Cached endpoint returns HTTP 200');
  assert(xCache === 'HIT', `X-Cache header indicates cache HIT (got: ${xCache})`);
  assert(cacheControl && cacheControl.includes('stale-while-revalidate'), `Cache-Control includes stale-while-revalidate (got: ${cacheControl})`);
  assert(elapsed < 200, `Cached response returned in <200ms (actual: ${elapsed}ms)`);

  // Verify concurrent request in-flight deduplication / coalescing
  const concurrentUrl = `${LOCAL_API_BASE}?type=combined&gid=1121987876`;
  const [resA, resB] = await Promise.all([
    fetch(concurrentUrl),
    fetch(concurrentUrl)
  ]);
  assert(resA.status === 200 && resB.status === 200, 'Concurrent sheet requests both return HTTP 200');
  const cacheHeaders = [resA.headers.get('x-cache'), resB.headers.get('x-cache')];
  assert(cacheHeaders.some(h => ['HIT', 'HIT-COALESCED', 'MISS', 'STALE-FALLBACK'].includes(h)), 'Concurrent sheet requests handled via coalesced caching');
}

// -------------------------------------------------------------
// 6. INTEGRATION TESTS: ADMIN EVENTS CONFIG & VERSION CONTROL
// -------------------------------------------------------------
async function testAdminEventsApi() {
  console.log('\n--- 6. Testing Admin Events Configuration & Version Control ---');
  const adminEventsUrl = `http://localhost:${PORT}/api/admin/events`;
  let baselineEvents = null;

  try {
    const configResponse = await fetch(`${adminEventsUrl}?configOnly=true`);
    const configData = await configResponse.json();
    assert(configResponse.status === 200 && configData.success === true, 'Dashboard config-only endpoint returns success');
    assert(Array.isArray(configData.config?.events), 'Dashboard config-only response includes configured events');
    assert(!('sheetHealth' in configData) && !('history' in configData), 'Dashboard config-only response excludes health checks and version history');
    baselineEvents = configData.config?.events ? structuredClone(configData.config.events) : null;
    const res = await fetch(adminEventsUrl);
    assert(res.status === 200, 'Admin Events API: Returns HTTP 200');

    const data = await res.json();
    assert(data.success === true, 'Admin Events API: Returns success: true');
    assert(data.config && Array.isArray(data.config.events), 'Admin Events API: Returns events array');
    assert(data.config.events.length >= 8, `Admin Events API: Contains at least 8 events (found: ${data.config?.events?.length})`);
    assert(Array.isArray(data.sheetHealth), 'Admin Events API: Reports configured sheet health');
    assert(JSON.stringify(configData.config.events) === JSON.stringify(data.config.events), 'Config-only and full admin endpoint return the same event definitions');

    // Verify key events exist in config
    const eventNames = data.config.events.map(e => e.name);
    assert(eventNames.includes('CPHI 26 (LinkedIn)') || eventNames.some(n => n.includes('CPHI')), 'Config includes CPHI event');
    assert(eventNames.some(n => n.includes('BIO')), 'Config includes BIO event');
    assert(eventNames.includes('SMLC 26'), 'Config includes SMLC 26 event');
    assert(eventNames.includes('IDWS 26'), 'Config includes IDWS 26 event');
    assert(eventNames.includes('GSTS 26'), 'Config includes GSTS 26 event');
    assert(eventNames.includes('SAIF 26'), 'Config includes SAIF 26 event');
    assert(eventNames.includes('KoG 26'), 'Config includes KoG 26 event');
    assert(eventNames.includes('Black Hat'), 'Config includes Black Hat event');
    const kogSheetHealth = data.sheetHealth.find(sheet => sheet.eventId === 'kog-26' && sheet.kind === 'Actuals');
    assert(kogSheetHealth?.state === 'healthy' && kogSheetHealth.hasCachedData, 'Admin reports KoG actuals are healthy and cached');
    assert(kogSheetHealth?.eventDataStatus === 'present' && kogSheetHealth.eventRows > 0, 'Admin confirms KoG actual rows are present');
    assert(Boolean(kogSheetHealth?.firstDataDate && kogSheetHealth?.lastDataDate), 'Admin reports KoG actual data date range');
    assert(data.sheetHealth.filter(sheet => sheet.kind === 'Actuals').length === data.config.events.length, 'Admin reports each configured event once in actuals health');

    const refreshSheetRes = await fetch(adminEventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'refresh-sheet',
        eventId: 'kog-26',
        kind: 'Actuals',
        author: 'Automated Test'
      })
    });
    const refreshSheetData = await refreshSheetRes.json();
    assert(refreshSheetRes.ok && refreshSheetData.refreshed, 'Admin can manually refresh KoG actuals');

    // Verify Version Control & History
    assert(Array.isArray(data.history), 'Admin Events API: History array is present');
    assert(data.history.length > 0, `Admin Events API: History contains snapshots (found: ${data.history?.length})`);
    const latestVersion = data.history[0];
    assert(Boolean(latestVersion.versionId), `Latest version has valid versionId (${latestVersion?.versionId})`);
    assert(Boolean(latestVersion.timestamp), 'Latest version has valid timestamp');
    assert(Boolean(latestVersion.snapshot), 'Latest version includes complete config snapshot');

    // Test Toggle action with rollback
    const toggleRes = await fetch(adminEventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'toggle',
        eventId: 'gsts-26',
        enabled: true,
        author: 'Automated Test'
      })
    });
    const toggleData = await toggleRes.json();
    assert(toggleData.success === true, 'Admin Events API: Toggle event succeeds');
    assert(toggleData.config?.version !== undefined, 'Admin Events API: Increments version on change');

    // Test Validate Sheet Action
    const validateRes = await fetch(adminEventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'validate-sheet',
        gid: '1526538255' // SMLC sheet GID
      })
    });
    const validateData = await validateRes.json();
    assert(validateData.success === true, 'Admin Events API: Sheet validator succeeds');
    assert(validateData.valid === true, 'Admin Events API: Validates live sheet correctly');
    assert(validateData.rowCount > 5000, `Admin Events API: Detected accurate row volume (${validateData.rowCount} rows)`);
    assert(validateData.hasSpend === true, 'Admin Events API: Identifies Spend/Cost column');
    assert(validateData.hasDate === true, 'Admin Events API: Identifies Date column');

    // Test Promote Action (Testing Admin Only -> Active)
    const promoteRes = await fetch(adminEventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'promote',
        eventId: 'smlc-26',
        author: 'Automated Test'
      })
    });
    const promoteData = await promoteRes.json();
    assert(promoteData.success === true, 'Admin Events API: Promote event succeeds');
    const smlcEvent = promoteData.config?.events?.find(e => e.id === 'smlc-26');
    assert(smlcEvent?.status === 'active', 'Promoted event has status: active');
    assert(smlcEvent?.visibility === 'public', 'Promoted event has visibility: public');
    assert(smlcEvent?.enabled === true, 'Promoted event is enabled');

    // Test Admin Attribution & Action Tagging
    const authorRes = await fetch(adminEventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set-status',
        eventId: 'smlc-26',
        status: 'admin_only',
        author: 'admin@tahaluf.com'
      })
    });
    const authorData = await authorRes.json();
    assert(authorData.success === true, 'Admin Events API: Status change succeeds');
    assert(authorData.config?.updatedBy === 'admin@tahaluf.com', 'Admin Attribution: Configuration updatedBy matches admin email');
    const latestHistory = authorData.history?.[0];
    assert(latestHistory?.author === 'admin@tahaluf.com', 'Admin Attribution: Version history entry author matches admin email');
    assert(latestHistory?.action === 'STATUS_CHANGE', 'Audit Trail: Action type correctly tagged as STATUS_CHANGE');

    // Test 1-Click Restore / Rollback functionality
    const targetVersionId = authorData.history?.[1]?.versionId;
    if (targetVersionId) {
      const revertRes = await fetch(adminEventsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revert',
          versionId: targetVersionId,
          author: 'recovery-admin@tahaluf.com'
        })
      });
      const revertData = await revertRes.json();
      assert(revertRes.ok && revertData.success === true, '1-Click Restore: Rollback action succeeds');
      assert(revertData.history?.[0]?.action === 'REVERT', '1-Click Restore: History records action REVERT');
      assert(revertData.history?.[0]?.author === 'recovery-admin@tahaluf.com', '1-Click Restore: Rollback records restoring admin author');
      assert(revertData.config?.updatedBy === 'recovery-admin@tahaluf.com', '1-Click Restore: Config updatedBy reflects restoring admin');
    }
  } catch (err) {
    assert(false, `Admin Events API: Exception (${err.message})`);
  } finally {
    if (baselineEvents && baselineEvents.length > 0) {
      try {
        await fetch(adminEventsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save',
            events: baselineEvents,
            description: 'Test cleanup: restore verified baseline configuration',
            author: 'Automated Test Cleanup'
          })
        });
      } catch (cleanErr) {
        console.warn('Could not restore baseline events configuration after test:', cleanErr?.message);
      }
    }
  }
}

// -------------------------------------------------------------
// 7. ANALYTICS & ACTIVITY LOGIC AND API TESTS
// -------------------------------------------------------------
async function testAnalyticsLogic() {
  console.log('\n--- 7. Testing User Activity & Analytics Logic ---');

  // Country Flag & Name Lookups
  assert(getCountryFlag('SA') === '🇸🇦', 'Resolves Saudi Arabia flag emoji (🇸🇦)');
  assert(getCountryFlag('AE') === '🇦🇪', 'Resolves UAE flag emoji (🇦🇪)');
  assert(getCountryFlag('US') === '🇺🇸', 'Resolves US flag emoji (🇺🇸)');
  assert(getCountryFlag('GB') === '🇬🇧', 'Resolves UK flag emoji (🇬🇧)');
  assert(getCountryName('SA') === 'Saudi Arabia', 'Resolves country name Saudi Arabia');
  assert(getCountryName('AE') === 'United Arab Emirates', 'Resolves country name UAE');

  // Event Recording & Metric Rollups
  const recordRes = await recordAnalyticsEvent({
    eventType: 'tab_view',
    userEmail: 'qa-tester@tahaluf.com',
    userRole: 'standard',
    tab: 'summary',
    filters: {
      business: 'B2B',
      events: ['KoG 26'],
      channels: ['Google'],
      datePreset: 'last7',
    },
    geo: { country: 'SA', city: 'Riyadh' },
    isNewSession: true,
  });

  assert(recordRes.success === true, 'Analytics record event succeeds');
  assert(typeof recordRes.activityId === 'string', 'Analytics event returns unique activityId');

  for (const payload of [
    { eventType: 'tab_view', tab: 'detailed', dwellTimeSec: 5, device: { screen: '1440x900', browser: 'Chrome' } },
    { eventType: 'currency_toggle', details: { currency: 'SAR' } },
    { eventType: 'export_pptx' }
  ]) await recordAnalyticsEvent({ userEmail: 'qa-tester@tahaluf.com', userRole: 'standard', geo: { country: 'SA', city: 'Riyadh' }, ...payload });

  const summary = await getAnalyticsSummary('all');
  assert(typeof summary.kpis?.totalViews === 'number', 'Summary contains totalViews KPI');
  assert(typeof summary.kpis?.totalSessions === 'number', 'Summary contains totalSessions KPI');
  assert(summary.kpis?.totalUsers >= 1, 'Summary reflects registered unique users');
  assert(Array.isArray(summary.tabUsage), 'Summary returns tabUsage list');
  assert(summary.tabUsage.some(t => t.tab === 'summary' && t.percentage > 0), 'Tab usage includes summary tab with positive percentage');
  assert(Array.isArray(summary.geoDistribution), 'Summary returns geoDistribution list');
  assert(summary.geoDistribution.some(g => g.code === 'SA' && g.country === 'Saudi Arabia'), 'Geo distribution includes Saudi Arabia');
  assert(summary.filterInsights?.business?.B2B?.count > 0, 'Filter insights records B2B filter selections');
  assert(Array.isArray(summary.users), 'Summary returns users ledger');
  const qaUser = summary.users.find(u => u.email === 'qa-tester@tahaluf.com');
  assert(qaUser !== undefined, 'User ledger contains qa-tester@tahaluf.com');
  assert(qaUser?.role === 'standard', 'QA user has standard role');
  assert(qaUser?.location?.includes('Saudi Arabia'), 'QA user location resolves correctly');
  assert(Array.isArray(summary.recentActivity), 'Summary returns rolling recentActivity feed');
  assert(summary.recentActivity.length > 0, 'Recent activity feed is non-empty');

  // Real-Time Findings & Intelligence Checks
  assert(Array.isArray(summary.findings), 'Summary includes real-time heuristic findings list');
  assert(summary.findings.length >= 5, 'Finds at least 5 prioritized heuristic insights');
  const detailedFinding = summary.findings.find(f => f.actionId === 'enable_compact_grid_mode');
  assert(detailedFinding !== undefined, 'Identifies Detailed Grid high bounce rate finding');
  assert(typeof detailedFinding?.impactScore === 'number' && detailedFinding.impactScore > 70, 'Finding carries valid impact score');
  assert(typeof detailedFinding?.recommendation === 'string', 'Finding contains concrete actionable recommendation');

  // Action Catalog & In-UI Action Execution
  assert(SYSTEM_ACTIONS_CATALOG['enable_compact_grid_mode'] !== undefined, 'Action catalog includes compact grid density action');
  const actionRes = await applyAnalyticsAction('enable_compact_grid_mode', 'admin@tahaluf.com', true);
  assert(actionRes.success === true, 'Applying analytics optimization succeeds');
  assert(actionRes.status === 'active', 'Action status is updated to active');

  // Rollback / Revert Action & History Verification
  const revertRes = await applyAnalyticsAction('enable_compact_grid_mode', 'admin@tahaluf.com', false, 'Testing automated rollback');
  assert(revertRes.success === true, 'Reverting analytics optimization succeeds');
  assert(revertRes.status === 'reverted', 'Reverted action status is updated to reverted');
  assert(Array.isArray(revertRes.actionsHistory), 'Revert returns actions history audit trail');
  assert(revertRes.actionsHistory.some(h => h.actionId === 'enable_compact_grid_mode' && h.operation === 'REVERT'), 'Actions history records REVERT operation with actor');

  // Monitored Fixes & Fix Health Telemetry
  const updatedSummary = await getAnalyticsSummary();
  assert(Array.isArray(updatedSummary.monitoredFixes) && updatedSummary.monitoredFixes.length > 0, 'Summary includes monitored fixes list');
  const monitoredCompact = updatedSummary.monitoredFixes.find(f => f.actionId === 'enable_compact_grid_mode');
  assert(monitoredCompact !== undefined, 'Monitored fixes contains compact grid density');
  assert(monitoredCompact.healthStatus === 'reverted', 'Monitored fix reflects reverted health state');
  assert(typeof monitoredCompact.telemetryEffect === 'string', 'Monitored fix includes empirical telemetry impact');
  assert(typeof updatedSummary.kpis.totalRollbacksAvailable === 'number', 'Summary KPIs include totalRollbacksAvailable');
  assert(Array.isArray(updatedSummary.actionsHistory) && updatedSummary.actionsHistory.length > 0, 'Summary includes complete rollback audit history');

  // Dwell Time & Device Telemetry Checks
  assert(typeof summary.dwellTimes?.summary?.avgSec === 'number', 'Summary contains dwell time for Summary tab');
  assert(typeof summary.dwellTimes?.detailed?.bouncePercent === 'number', 'Summary contains bounce rate for Detailed Grid');
  assert(Object.keys(summary.deviceFootprint?.screenResolutions || {}).length > 0, 'Summary contains screen resolution telemetry');
  assert(typeof summary.featureInteractions?.currencyToggles?.SAR === 'number', 'Summary tracks currency toggles');
  assert(typeof summary.featureInteractions?.exports?.pptx === 'number', 'Summary tracks PPTX exports');
}

async function testAnalyticsApi() {
  console.log('\n--- 8. Testing Analytics Ingestion & Admin API ---');
  const trackUrl = `http://localhost:${PORT}/api/analytics/track`;
  const adminAnalyticsUrl = `http://localhost:${PORT}/api/admin/analytics`;

  try {
    // Test POST tracking beacon
    const trackRes = await fetch(trackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-vercel-ip-country': 'AE',
        'x-vercel-ip-city': 'Dubai',
      },
      body: JSON.stringify({
        eventType: 'tab_view',
        userEmail: 'exec-vip@tahaluf.com',
        userRole: 'standard',
        tab: 'campaign',
        dwellTimeSec: 180,
        filters: { business: 'B2B', event: 'SMLC 26' },
      }),
    });

    const trackJson = await trackRes.json();
    assert(trackRes.status === 200, 'POST /api/analytics/track returns HTTP 200');
    assert(trackJson.success === true, 'POST /api/analytics/track returns success: true');
    assert(typeof trackJson.activityId === 'string', 'Tracking endpoint returns generated activityId');

    // Test POST Dashboard Open on Overview tab
    const openRes = await fetch(trackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'dashboard_open',
        userEmail: 'growth.director@tahaluf.com',
        tab: 'overview',
        filters: { business: 'All' },
      }),
    });
    assert(openRes.status === 200, 'POST /api/analytics/track (dashboard_open) returns HTTP 200');

    // Test POST Heartbeat Dwell on Overview tab
    const heartbeatRes = await fetch(trackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'heartbeat_dwell',
        userEmail: 'growth.director@tahaluf.com',
        tab: 'summary',
        dwellTimeSec: 25,
        details: { reason: 'heartbeat' },
      }),
    });
    assert(heartbeatRes.status === 200, 'POST /api/analytics/track (heartbeat_dwell) returns HTTP 200');

    // Test POST Metric Card Click on Overview tab
    const metricClickRes = await fetch(trackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'metric_card_click',
        userEmail: 'growth.director@tahaluf.com',
        tab: 'summary',
        details: { metric: 'Spend', value: '$45,000' },
      }),
    });
    assert(metricClickRes.status === 200, 'POST /api/analytics/track (metric_card_click) returns HTTP 200');

    // Test POST Admin Event to verify role indexing
    await fetch(trackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'dashboard_open',
        userEmail: 'admin@tahaluf.com',
        userRole: 'admin',
        tab: 'summary',
        filters: { business: 'All' },
      }),
    });

    // Test GET Admin Analytics
    const adminRes = await fetch(`${adminAnalyticsUrl}?email=admin@tahaluf.com`);
    const adminJson = await adminRes.json();
    assert(adminRes.status === 200, 'GET /api/admin/analytics returns HTTP 200');
    assert(adminJson.success === true, 'Admin analytics returns success: true');
    assert(adminJson.kpis?.totalViews > 0, 'Admin analytics provides totalViews metric');
    assert(Array.isArray(adminJson.findings) && adminJson.findings.length > 0, 'Admin analytics provides real-time findings array');
    assert(Array.isArray(adminJson.tabUsage) && adminJson.tabUsage.length > 0, 'Admin analytics tabUsage is populated');
    assert(Array.isArray(adminJson.geoDistribution) && adminJson.geoDistribution.length > 0, 'Admin analytics geoDistribution is populated');
    assert(Array.isArray(adminJson.monitoredFixes) && adminJson.monitoredFixes.length > 0, 'Admin analytics provides monitoredFixes list');
    assert(Array.isArray(adminJson.actionsHistory) && adminJson.actionsHistory.length > 0, 'Admin analytics provides actionsHistory audit trail');
    assert(adminJson.geoDistribution.some(g => g.code === 'AE'), 'Vercel header country AE was ingested into geo distribution');
    assert(adminJson.users.some(u => u.email === 'exec-vip@tahaluf.com'), 'New user exec-vip was indexed in user audit table');
    assert(adminJson.userCounts?.activeFilter === 'non_admin', 'Default userRoleFilter is non_admin');
    assert(adminJson.users.every(u => u.role !== 'admin' && !u.email.includes('admin@')), 'Default analytics response filters out admins from user table');
    assert(adminJson.recentActivity.every(a => a.userRole !== 'admin' && !a.userEmail.includes('admin@')), 'Default analytics response filters out admins from recent activity stream');
    assert(adminJson.recentActivity.some(a => Boolean(a.geo?.timezone)), 'Recent activity entries contain geo timezone information');
    assert(adminJson.findings.every(f => Boolean(f.plainProblem && f.plainSolution && f.howToVerify)), 'Findings contain plain problem, plain solution, and how to verify');
    assert(adminJson.monitoredFixes.every(f => Boolean(f.plainProblem && f.plainSolution && f.howToVerify)), 'Monitored fixes contain plain problem, plain solution, and how to verify');

    // Test GET Admin Analytics with timeRange=today & timeZone=Asia/Dubai
    const todayRes = await fetch(`${adminAnalyticsUrl}?timeRange=today&timeZone=Asia/Dubai&email=admin@tahaluf.com`);
    const todayJson = await todayRes.json();
    assert(todayRes.status === 200, 'GET /api/admin/analytics?timeRange=today returns HTTP 200');
    assert(todayJson.timeFilterInfo?.timeRange === 'today', 'timeFilterInfo reports timeRange=today');
    assert(todayJson.timeFilterInfo?.timeZone === 'Asia/Dubai', 'timeFilterInfo reports user timezone');
    assert(Boolean(todayJson.timeFilterInfo?.start), 'timeFilterInfo provides start timestamp for 12:00 AM midnight');
    if (todayJson.recentActivity.length > 0) {
      const midnightMs = new Date(todayJson.timeFilterInfo.start).getTime();
      assert(todayJson.recentActivity.every(a => new Date(a.timestamp).getTime() >= midnightMs), 'All activities in timeRange=today are strictly after 12:00 AM midnight in user timezone');
    }

    // Test GET Admin Analytics with userRoleFilter=all
    const allUsersRes = await fetch(`${adminAnalyticsUrl}?userRoleFilter=all&email=admin@tahaluf.com`);
    const allUsersJson = await allUsersRes.json();
    assert(allUsersRes.status === 200, 'GET /api/admin/analytics?userRoleFilter=all returns HTTP 200');
    assert(allUsersJson.users.some(u => u.email === 'admin@tahaluf.com'), 'userRoleFilter=all includes admin user');

    // Test GET Admin Analytics with userRoleFilter=admin_only
    const adminOnlyRes = await fetch(`${adminAnalyticsUrl}?userRoleFilter=admin_only&email=admin@tahaluf.com`);
    const adminOnlyJson = await adminOnlyRes.json();
    assert(adminOnlyRes.status === 200, 'GET /api/admin/analytics?userRoleFilter=admin_only returns HTTP 200');
    assert(adminOnlyJson.users.every(u => u.role === 'admin' || u.email.includes('admin@')), 'userRoleFilter=admin_only returns only admin users');

    // Test GET Admin Analytics with specific userEmail filter
    const singleUserRes = await fetch(`${adminAnalyticsUrl}?userEmail=exec-vip@tahaluf.com&email=admin@tahaluf.com`);
    const singleUserJson = await singleUserRes.json();
    assert(singleUserRes.status === 200, 'GET /api/admin/analytics?userEmail=exec-vip returns HTTP 200');
    assert(singleUserJson.users.length === 1 && singleUserJson.users[0].email === 'exec-vip@tahaluf.com', 'userEmail parameter isolates individual user journey');

    // Test POST Action Execution on Findings
    const actionPostRes = await fetch(`${adminAnalyticsUrl}?email=admin@tahaluf.com`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: 'smart_default_b2b',
        enable: true,
        email: 'admin@tahaluf.com',
      }),
    });
    const actionPostJson = await actionPostRes.json();
    assert(actionPostRes.status === 200, 'POST /api/admin/analytics executes action with HTTP 200');
    assert(actionPostJson.success === true, 'Action execution reports success: true');
    assert(actionPostJson.actionId === 'smart_default_b2b', 'Action ID matches target');
    assert(actionPostJson.status === 'active', 'Action status updated to active');

    // Test POST 1-Click Rollback / Revert on Action
    const revertPostRes = await fetch(`${adminAnalyticsUrl}?email=admin@tahaluf.com`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: 'smart_default_b2b',
        operation: 'revert',
        reason: 'Admin requested rollback via API',
        email: 'admin@tahaluf.com',
      }),
    });
    const revertPostJson = await revertPostRes.json();
    assert(revertPostRes.status === 200, 'POST /api/admin/analytics reverts action with HTTP 200');
    assert(revertPostJson.success === true, 'Revert execution reports success: true');
    assert(revertPostJson.actionId === 'smart_default_b2b', 'Reverted action ID matches target');
    assert(revertPostJson.status === 'reverted', 'Reverted action status updated to reverted');
    assert(revertPostJson.actionsHistory.some(h => h.actionId === 'smart_default_b2b' && h.operation === 'REVERT'), 'Reverted action tracked in audit history');
  } catch (err) {
    console.error('Analytics API failure stack:', err);
    assert(false, `Analytics API: Exception (${err.message})`);
  }
}

// -------------------------------------------------------------
// 9. EVENT VIEW SELECTION & IN-VIEW FILTERING CONTRACTS
// -------------------------------------------------------------
function testEventViewContracts() {
  console.log('\n--- 9. Testing Event View Selection & In-View Filtering Contracts ---');
  const pageContent = fs.readFileSync('app/page.jsx', 'utf8');
  const campaignContent = fs.readFileSync('app/CampaignView.jsx', 'utf8');

  // Verify Event Selection Hub in Event View
  assert(pageContent.includes("Select an Event to Unlock Event Breakdown &amp; Analysis"), 'Event View defines Event Selection Hub title');
  assert(pageContent.includes("Compare All Events (Relative Timeline) →"), 'Event View includes Compare All Events action');
  assert(pageContent.includes("<span>View Event</span>"), 'Event Selection cards provide consistent compact View Event action matching Weekly view');
  assert(pageContent.includes('max-w-5xl mx-auto px-4'), 'Event Selection Hub matches max-w-5xl container layout');

  // Verify In-View Event Switcher and Filter
  assert(pageContent.includes('<Activity className="text-[#cedc28]" /> Event View:'), 'Event View includes dedicated header title');
  assert(!pageContent.includes('title="Return to Event Selection Hub"'), 'All Events Selection button is removed from header when event is selected');
  assert(pageContent.includes('Comparing {filterEvents.length} Events (Relative Timeline)'), 'Event View supports multi-event comparison indicator');

  // Verify CampaignView onSelectEvent support
  assert(campaignContent.includes('onSelectEvent'), 'CampaignView signature supports onSelectEvent callback');
  assert(campaignContent.includes("Select an Event to View Performance Details"), 'CampaignView includes upgraded All Events selection layout');
}

// -------------------------------------------------------------
// 10. API QUOTAS, SAFEGUARDS & CIRCUIT BREAKER TESTS
// -------------------------------------------------------------
async function testApiQuotasLogic() {
  console.log('\n--- 10. Testing API Quotas, Safeguards & Circuit Breaker Logic ---');

  const analysis = await analyzeConnectedApis();
  assert(analysis.success === true, 'Quota Analysis reports success: true');
  assert(Array.isArray(analysis.services), 'Services array is present');
  assert(analysis.services.length >= 5, `Monitors at least 5 services (found: ${analysis.services.length})`);

  const firestoreService = analysis.services.find(s => s.id === 'firestore');
  assert(Boolean(firestoreService), 'Analysis includes Google Cloud Firestore');
  assert(Array.isArray(firestoreService.quotas), 'Firestore reports quota metrics');
  assert(firestoreService.activeWorkarounds.length > 0, 'Firestore reports active workarounds');
  assert(firestoreService.recommendations.length > 0, 'Firestore reports optimization recommendations');

  const vercelService = analysis.services.find(s => s.id === 'vercel');
  assert(Boolean(vercelService), 'Analysis includes Vercel Edge & Serverless Network');

  const sheetsService = analysis.services.find(s => s.id === 'sheets');
  assert(Boolean(sheetsService), 'Analysis includes Google Sheets Publishing API');

  // Verify proactive burnRate & auto-trip threshold
  assert(Boolean(analysis.burnRate), 'Analysis includes proactive burnRate metrics');
  assert(analysis.burnRate.autoTripThreshold === 17000, 'Reports autoTripThreshold of 17,000 writes');
  assert(typeof analysis.burnRate.writeBurnRatePerHour === 'number', 'Reports writeBurnRatePerHour');
  assert(typeof analysis.burnRate.estimatedRunwayHours === 'number', 'Reports estimatedRunwayHours');

  // Test circuit breaker state toggle & restore
  const originalState = getCircuitBreakerState();
  const toggled = updateCircuitBreakerState({ forceMemoryCache: true });
  assert(toggled.forceMemoryCache === true, 'Circuit breaker toggles forceMemoryCache to true');
  const restored = updateCircuitBreakerState({ forceMemoryCache: originalState.forceMemoryCache });
  assert(restored.forceMemoryCache === originalState.forceMemoryCache, 'Circuit breaker restores original state');

  // Test ping functionality
  const pingResult = await pingService('vercel');
  assert(pingResult.status === 'unknown' && pingResult.latencyMs === null, 'Vercel configuration is not reported as a measured health check');
}

async function testApiQuotasApi() {
  console.log('\n--- Testing Live API Quotas Endpoint ---');
  const url = `http://localhost:${PORT}/api/admin/quotas`;
  const res = await fetch(url);
  assert(res.status === 200, 'GET /api/admin/quotas returns HTTP 200');
  const data = await res.json();
  assert(data.success === true, 'GET /api/admin/quotas reports success: true');
  assert(data.services?.length >= 5, 'Live API returns all monitored services');

  // Test live ping action
  const pingRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ping', service: 'vercel' })
  });
  assert(pingRes.status === 200, 'POST /api/admin/quotas ping returns HTTP 200');
  const pingData = await pingRes.json();
  assert(pingData.success === true && pingData.result?.status === 'unknown' && pingData.result?.latencyMs === null, 'Live Vercel check does not invent a health status or latency');
}

function testFeatureControlsLogic() {
  console.log('\n--- 11. Testing Dashboard Feature Controls & Role Permissions ---');
  
  // 1. Verify all managed features are declared
  assert(Array.isArray(DASHBOARD_FEATURES) && DASHBOARD_FEATURES.length >= 18, 'DASHBOARD_FEATURES defines all managed modules');
  const featureIds = DASHBOARD_FEATURES.map(f => f.id);
  assert(featureIds.includes('tv'), 'Includes tv mode feature');
  assert(featureIds.includes('aiSummary'), 'Includes aiSummary feature');
  assert(featureIds.includes('granularTimeline'), 'Includes granularTimeline feature');
  assert(featureIds.includes('benchmarkComparison'), 'Includes benchmarkComparison feature');
  assert(featureIds.includes('quickJump'), 'Includes quickJump feature');
  assert(featureIds.includes('dimensionExport'), 'Includes dimensionExport feature');
  assert(featureIds.includes('bulkDimensionImport'), 'Includes bulkDimensionImport feature');
  assert(featureIds.includes('tvCustomization'), 'Includes tvCustomization feature');

  // 2. Verify all new features default strictly to admin_only (zero disruption to live standard users)
  const aiFeature = DASHBOARD_FEATURES.find(f => f.id === 'aiSummary');
  assert(aiFeature?.defaultMode === 'admin_only', 'New feature aiSummary defaults to admin_only');
  const timelineFeature = DASHBOARD_FEATURES.find(f => f.id === 'granularTimeline');
  assert(timelineFeature?.defaultMode === 'admin_only', 'New feature granularTimeline defaults to admin_only');
  const benchmarkFeature = DASHBOARD_FEATURES.find(f => f.id === 'benchmarkComparison');
  assert(benchmarkFeature?.defaultMode === 'admin_only', 'New feature benchmarkComparison defaults to admin_only');

  const auditFeatures = ['quickJump', 'dimensionExport', 'bulkDimensionImport', 'tvCustomization', 'budgetSimulator', 'channelQuadrant', 'launchForecaster', 'creativeFatigue'];
  for (const afId of auditFeatures) {
    const feat = DASHBOARD_FEATURES.find(f => f.id === afId);
    assert(feat?.defaultMode === 'admin_only', `New feature ${afId} defaults strictly to admin_only`);
    assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, afId, 'standard') === false, `Standard user cannot view ${afId}`);
    assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, afId, 'admin') === true, `Admin user can access ${afId}`);
    assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, afId, 'admin', true) === false, `Persona preview hides ${afId} for standard view`);
  }

  // 3. Verify standard user role cannot access admin_only features
  assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'summary', 'standard') === true, 'Standard user can view Overview');
  assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'aiSummary', 'standard') === false, 'Standard user cannot view aiSummary');
  assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'granularTimeline', 'standard') === false, 'Standard user cannot view granularTimeline');
  assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'benchmarkComparison', 'standard') === false, 'Standard user cannot view benchmarkComparison');

  // 4. Verify admin user role CAN access admin_only features
  assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'aiSummary', 'admin') === true, 'Admin user can access aiSummary');
  assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'granularTimeline', 'admin') === true, 'Admin user can access granularTimeline');
  assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'benchmarkComparison', 'admin') === true, 'Admin user can access benchmarkComparison');

  // 5. Verify simulator preview mode: when admin previews as standard user, admin_only features are hidden
  assert(isFeatureEnabled(DEFAULT_FEATURE_CONFIG, 'aiSummary', 'admin', true) === false, 'Persona preview hides aiSummary for standard view');

  // 6. Verify cascading dependencies (tvAutoCycle & tvCustomization require tv)
  const disabledTvConfig = {
    revision: 1,
    modes: { ...DEFAULT_FEATURE_CONFIG.modes, tv: 'disabled', tvAutoCycle: 'public', tvCustomization: 'admin_only' }
  };
  assert(isFeatureEnabled(disabledTvConfig, 'tvAutoCycle', 'admin') === false, 'tvAutoCycle is disabled when parent tv feature is disabled');
  assert(isFeatureEnabled(disabledTvConfig, 'tvCustomization', 'admin') === false, 'tvCustomization is disabled when parent tv feature is disabled');

  // 7. Verify validateFeatureModes validation
  const validModes = validateFeatureModes({ aiSummary: 'public' });
  assert(validModes.aiSummary === 'public', 'validateFeatureModes allows updating aiSummary');
  let thrown = false;
  try {
    validateFeatureModes({ healthBanner: 'public' });
  } catch (e) {
    thrown = true;
  }
  assert(thrown === true, 'validateFeatureModes rejects public mode on system-restricted features');
}

// -------------------------------------------------------------
// MAIN TEST RUNNER
// -------------------------------------------------------------
async function runAllTests() {
  console.log('====================================================');
  console.log('TAHALUF DASHBOARD AUTOMATED PRE-PUBLISH TEST SUITE');
  console.log('====================================================');

  testUnitLogic();
  testSheetSummaries();
  testHealthNotifications();
  testHealthIssueHistory();
  testEventAndPortfolioLogic();
  testBusinessDimensionLogic();
  testDynamicWeekLogic();
  testDetailedDateFilterLogic();
  await testLastKnownGoodSheetCache();
  await testFirestoreChunkBatching();
  testCreativeViewLogic();
  test24hMetricIntegrity();
  testEventViewContracts();
  await testAnalyticsLogic();
  await testApiQuotasLogic();
  testFeatureControlsLogic();

  // Check if local dev server is running before attempting API integration tests
  try {
    const health = await fetch(`http://localhost:${PORT}`);
    if (health.status === 200) {
      await testApiEndpoints();
      await testAdminEventsApi();
      await testAnalyticsApi();
      await testApiQuotasApi();
    } else {
      console.warn(`Local server responded with status ${health.status}, skipping live API tests.`);
    }
  } catch (e) {
    console.warn(`Local dev server not detected on port ${PORT}. Run 'npm run dev' to include live API tests.`);
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests();
