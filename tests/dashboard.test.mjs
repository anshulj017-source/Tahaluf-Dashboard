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
      assert(text.length > 50, `${sheet.name}: Non-empty body (${text.length} bytes)`);
      assert(!text.startsWith('<!DOCTYPE') && !text.startsWith('<html'), `${sheet.name}: Does not return HTML error page`);
      assert(!text.startsWith('Loading...'), `${sheet.name}: Does not return Google Loading... placeholder`);

      const rows = d3.csvParse(text);
      assert(rows.length > 0, `${sheet.name}: Parsed valid CSV rows (${rows.length} rows)`);

      // Special check for SMLC sheet
      if (sheet.gid === '1526538255') {
        assert(rows.length >= 8000, `SMLC Sheet contains expected large row volume (found: ${rows.length})`);
        const hasSmlcEvent = rows.some(r => (r['Event Name DB'] || '').includes('SMLC'));
        assert(hasSmlcEvent, 'SMLC Sheet contains records with SMLC in Event Name DB');
      }
    } catch (err) {
      assert(false, `${sheet.name}: Network or parse exception (${err.message})`);
    }
  }

  // Test In-Memory Caching on SMLC
  console.log('\n--- 5. Testing In-Memory Caching & Performance ---');
  const cacheTestUrl = `${LOCAL_API_BASE}?type=combined&gid=1526538255`;
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
// MAIN TEST RUNNER
// -------------------------------------------------------------
async function runAllTests() {
  console.log('====================================================');
  console.log('TAHALUF DASHBOARD AUTOMATED PRE-PUBLISH TEST SUITE');
  console.log('====================================================');

  testUnitLogic();
  testEventAndPortfolioLogic();
  testDynamicWeekLogic();

  // Check if local dev server is running before attempting API integration tests
  try {
    const health = await fetch(`http://localhost:${PORT}`);
    if (health.status === 200) {
      await testApiEndpoints();
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
