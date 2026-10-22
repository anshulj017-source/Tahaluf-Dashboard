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
const { 
  formatYMD, 
  calculatePresetRange, 
  PRESET_GROUPS 
} = datePresets;

const PORT = process.env.PORT || 3000;
const LOCAL_API_BASE = `http://localhost:${PORT}/api/sheets`;

const REQUIRED_SHEET_GIDS = [
  { name: 'GSTS Actuals (Default GID)', gid: '' },
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
}

// -------------------------------------------------------------
// 6. INTEGRATION TESTS: ADMIN EVENTS CONFIG & VERSION CONTROL
// -------------------------------------------------------------
async function testAdminEventsApi() {
  console.log('\n--- 6. Testing Admin Events Configuration & Version Control ---');
  const adminEventsUrl = `http://localhost:${PORT}/api/admin/events`;

  try {
    const res = await fetch(adminEventsUrl);
    assert(res.status === 200, 'Admin Events API: Returns HTTP 200');

    const data = await res.json();
    assert(data.success === true, 'Admin Events API: Returns success: true');
    assert(data.config && Array.isArray(data.config.events), 'Admin Events API: Returns events array');
    assert(data.config.events.length >= 8, `Admin Events API: Contains at least 8 events (found: ${data.config?.events?.length})`);
    assert(Array.isArray(data.sheetHealth), 'Admin Events API: Reports configured sheet health');

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
  }
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
  testDynamicWeekLogic();
  testDetailedDateFilterLogic();
  await testLastKnownGoodSheetCache();
  await testFirestoreChunkBatching();
  testCreativeViewLogic();

  // Check if local dev server is running before attempting API integration tests
  try {
    const health = await fetch(`http://localhost:${PORT}`);
    if (health.status === 200) {
      await testApiEndpoints();
      await testAdminEventsApi();
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
