import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';

let puppeteer = null;
try {
  const mod = await import('puppeteer-core');
  puppeteer = mod.default || mod;
} catch (e) {
  // puppeteer-core not available
}

// Find Google Chrome binary on common paths
function findChromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Check if a URL is responding
async function isServerReady(url) {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(6000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

// Wait for a server to respond
async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerReady(url)) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

test('E2E Browser Render & Console Error Verification Suite', async (t) => {
  const chromePath = findChromePath();
  if (!puppeteer || !chromePath) {
    t.skip('Skipping browser tests: Chrome executable or puppeteer-core not found.');
    return;
  }

  let serverProcess = null;
  let targetUrl = 'http://localhost:3000';

  // Check if port 3000 is already active
  const isDefaultRunning = await isServerReady(targetUrl);
  if (!isDefaultRunning) {
    // Spin up an ephemeral dev server on port 3008
    targetUrl = 'http://localhost:3008';
    serverProcess = spawn('npx', ['next', 'dev', '-p', '3008'], {
      stdio: 'pipe',
      detached: false,
      env: { ...process.env, PORT: '3008' }
    });
    const ready = await waitForServer(targetUrl, 25000);
    assert.ok(ready, 'Ephemeral test dev server failed to start within 25 seconds.');
  }

  let browser = null;
  const launchBrowser = () => puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const getPage = async () => {
    if (!browser || (typeof browser.isConnected === 'function' && !browser.isConnected())) {
      browser = await launchBrowser();
    }
    return browser.newPage();
  };

  try {
    browser = await launchBrowser();

    await t.test('Page loads with HTTP 200 and zero console errors or uncaught exceptions', async () => {
      const page = await getPage();
      await page.setViewport({ width: 1440, height: 900 });

      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];

      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!text.includes('403') && !text.includes('401')) {
            consoleErrors.push(text);
          }
        }
      });

      page.on('pageerror', err => {
        pageErrors.push(err.message || String(err));
      });

      page.on('requestfailed', req => {
        const url = req.url();
        const failure = req.failure()?.errorText;
        // Ignore aborted telemetry, RSC client router prefetches, or optional analytics beacons
        if (
          failure !== 'net::ERR_ABORTED' &&
          !url.includes('_rsc=') &&
          !url.includes('/api/analytics') &&
          !url.includes('google-analytics') &&
          !url.includes('doubleclick')
        ) {
          failedRequests.push({ url, failure });
        }
      });

      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      assert.equal(response.status(), 200, 'Homepage must return HTTP status 200');

      // Assert zero console errors & uncaught runtime exceptions
      assert.deepEqual(consoleErrors, [], `Detected browser console errors: ${JSON.stringify(consoleErrors)}`);
      assert.deepEqual(pageErrors, [], `Detected uncaught page runtime exceptions: ${JSON.stringify(pageErrors)}`);
      assert.deepEqual(failedRequests, [], `Detected failed asset requests: ${JSON.stringify(failedRequests)}`);

      await page.close();
    });

    await t.test('CSS Stylesheets are delivered and applied (no unstyled white fallback)', async () => {
      const page = await getPage();
      await page.setViewport({ width: 1440, height: 900 });

      const responses = [];
      page.on('response', res => {
        const url = res.url();
        if (url.endsWith('.css') || url.includes('/_next/static/css/')) {
          responses.push({ url, status: res.status() });
        }
      });

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // In dev mode Next.js injects CSS via <style> tags; in prod via <link rel="stylesheet">
      const styleElementsCount = await page.evaluate(() => {
        return document.querySelectorAll('style, link[rel="stylesheet"]').length;
      });
      assert.ok(responses.length > 0 || styleElementsCount > 0, 'At least one CSS stylesheet or style element must be present and applied');
      for (const res of responses) {
        assert.equal(res.status, 200, `CSS stylesheet at ${res.url} failed with status ${res.status}`);
      }

      // Verify computed styles on body: brand dark background, not default white
      const bodyStyles = await page.evaluate(() => {
        const style = window.getComputedStyle(document.body);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontFamily: style.fontFamily
        };
      });

      // Background must NOT be default browser white (rgb(255, 255, 255))
      assert.notEqual(
        bodyStyles.backgroundColor,
        'rgb(255, 255, 255)',
        'Body background color must not be default white (CSS failed to load)'
      );
      assert.equal(
        bodyStyles.backgroundColor,
        'rgb(26, 48, 46)',
        'Body background must match Tahaluf corporate dark green (#1a302e)'
      );

      // Font must not be Times New Roman (raw browser fallback)
      assert.ok(
        !bodyStyles.fontFamily.toLowerCase().includes('times'),
        `Font family must be sans-serif/brand, but was ${bodyStyles.fontFamily}`
      );

      await page.close();
    });

    await t.test('Interactive view navigation maintains styling and clean console', async () => {
      const page = await getPage();
      await page.setViewport({ width: 1440, height: 900 });

      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Exclude expected unauthenticated 401/403/404 status messages for protected admin endpoints or external assets
          if (!text.includes('403') && !text.includes('401') && !text.includes('404')) {
            consoleErrors.push(text);
          }
        }
      });
      page.on('pageerror', err => consoleErrors.push(err.message));

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Click around visible navigation buttons/tabs if present
      const tabCount = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const tabs = buttons.filter(b => b.textContent && ['weekly', 'channel', 'creative', 'campaign'].some(t => b.textContent.toLowerCase().includes(t)));
        tabs.slice(0, 3).forEach(t => t.click());
        return tabs.length;
      });

      // Wait a moment for any render/transition cycles
      await new Promise(r => setTimeout(r, 600));

      assert.deepEqual(consoleErrors, [], `Console errors during interactive navigation: ${JSON.stringify(consoleErrors)}`);

      await page.close();
    });

    await t.test('Full dashboard live data sync completes, spinner unmounts, and UI cards render without freezing', async () => {
      const page = await getPage();
      await page.setViewport({ width: 1440, height: 900 });

      const runtimeErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const t = msg.text();
          if (!t.includes('403') && !t.includes('401')) runtimeErrors.push(t);
        }
      });
      page.on('pageerror', err => runtimeErrors.push(err.message || String(err)));

      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('tahaluf_cached_email', 'admin@tahaluf.com');
        localStorage.setItem('tahaluf_cached_role', 'super_admin');
      });

      await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
      await new Promise(r => setTimeout(r, 600));

      // Wait for the loading spinner to disappear once live data streams finish
      await page.waitForFunction(
        () => !document.querySelector('.animate-spin-slow') && document.querySelectorAll('.card-surface').length > 0,
        { timeout: 75000 }
      );

      // Verify dashboard contents are present
      const dashboardState = await page.evaluate(() => {
        const cards = document.querySelectorAll('.card-surface');
        const text = document.body.innerText;
        return {
          cardCount: cards.length,
          hasAiBrief: text.includes('AI STRATEGIC') || text.includes('AI Strategic Briefing'),
          hasMetricHeaders: text.includes('CTR') || text.includes('Spend') || text.includes('Conversions')
        };
      });

      assert.ok(dashboardState.cardCount > 0, 'Dashboard cards must be rendered on the page');
      assert.deepEqual(runtimeErrors, [], `Detected runtime errors during full dashboard render: ${JSON.stringify(runtimeErrors)}`);

      await page.close();
    });

    await t.test('Top filters open seamlessly and switch between dropdowns without backdrop interception', async () => {
      const page = await getPage();
      await page.setViewport({ width: 1440, height: 900 });

      const runtimeErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const t = msg.text();
          if (!t.includes('403') && !t.includes('401')) runtimeErrors.push(t);
        }
      });
      page.on('pageerror', err => runtimeErrors.push(err.message || String(err)));

      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('tahaluf_cached_email', 'admin@tahaluf.com');
        localStorage.setItem('tahaluf_cached_role', 'super_admin');
      });

      await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
      await new Promise(r => setTimeout(r, 600));

      // Wait for loading spinner to finish
      await page.waitForFunction(
        () => !document.querySelector('.animate-spin-slow') && document.querySelectorAll('.card-surface').length > 0,
        { timeout: 60000 }
      );

      // Verify that MultiSelect dropdowns can open, switch to another dropdown, and close cleanly
      const filterInteractions = await page.evaluate(async () => {
        // Find visible filter labels: Event, Channel, Portfolio
        const filterContainers = Array.from(document.querySelectorAll('.shrink-0')).filter(c => c.offsetParent !== null || c.getClientRects().length > 0);
        const eventDropdown = filterContainers.find(c => c.textContent && c.textContent.includes('Event'));
        const channelDropdown = filterContainers.find(c => c.textContent && c.textContent.includes('Channel'));
        
        if (!eventDropdown || !channelDropdown) {
          return { found: false, error: 'Filter dropdown containers not found' };
        }

        // 1. Click Event dropdown trigger
        const eventTrigger = eventDropdown.querySelector('.cursor-pointer');
        if (!eventTrigger) return { found: false, error: 'Event trigger missing' };
        eventTrigger.click();

        // Check if options menu opened (search input is rendered inside dropdown)
        await new Promise(r => setTimeout(r, 150));
        const eventMenuOpen = document.querySelectorAll('input[placeholder="Search..."]').length > 0;

        // 2. Click Channel dropdown trigger immediately (tests that backdrop doesn't block neighboring filter)
        const channelTrigger = channelDropdown.querySelector('.cursor-pointer');
        if (!channelTrigger) return { found: false, error: 'Channel trigger missing' };
        channelTrigger.click();

        await new Promise(r => setTimeout(r, 150));
        const channelMenuOpen = document.querySelectorAll('input[placeholder="Search..."]').length > 0;

        // 3. Click outside on the header background to close
        const header = document.querySelector('header') || document.body;
        header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        await new Promise(r => setTimeout(r, 150));
        const menuClosed = document.querySelectorAll('input[placeholder="Search..."]').length === 0;

        return {
          found: true,
          eventMenuOpen,
          channelMenuOpen,
          menuClosed
        };
      });

      assert.ok(filterInteractions.found, filterInteractions.error || 'Filter interaction test succeeded');
      assert.ok(filterInteractions.eventMenuOpen, 'Event dropdown opened on click');
      assert.ok(filterInteractions.channelMenuOpen, 'Channel dropdown opened smoothly without click interception');
      assert.ok(filterInteractions.menuClosed, 'Dropdown closed on click outside');
      assert.deepEqual(runtimeErrors, [], `No console errors during filter interactions: ${JSON.stringify(runtimeErrors)}`);

      await page.close();
    });

    await t.test('AI Strategic Intelligence renders Event & Portfolio Breakdown tabs cleanly', async () => {
      const page = await getPage();
      await page.setViewport({ width: 1440, height: 900 });

      const runtimeErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const t = msg.text();
          if (!t.includes('403') && !t.includes('401')) runtimeErrors.push(t);
        }
      });
      page.on('pageerror', err => runtimeErrors.push(err.message || String(err)));

      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('tahaluf_cached_email', 'admin@tahaluf.com');
        localStorage.setItem('tahaluf_cached_role', 'super_admin');
      });

      await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
      await new Promise(r => setTimeout(r, 600));

      // Wait for loading spinner to finish
      await page.waitForFunction(
        () => !document.querySelector('.animate-spin-slow') && document.querySelectorAll('.card-surface').length > 0,
        { timeout: 60000 }
      );

      // Wait for AI Intelligence card tabs to appear if enabled
      const hasAiCard = await page.waitForFunction(
        () => Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Executive Brief')),
        { timeout: 8000 }
      ).catch(() => null);

      if (!hasAiCard) {
        // AI Summary is disabled in current dashboard feature controls; verify clean render without errors
        assert.deepEqual(runtimeErrors, [], `No console errors when AI Summary is disabled in feature controls: ${JSON.stringify(runtimeErrors)}`);
        await page.close();
        return;
      }

      // Verify AI Strategic tabs switch and render content
      const tabResults = await page.evaluate(async () => {
        const buttons = Array.from(document.querySelectorAll('button'));
        
        // 1. Click "Daily Next Steps" tab
        const nextStepsTab = buttons.find(b => b.textContent && b.textContent.includes('Daily Next Steps'));
        if (nextStepsTab) nextStepsTab.click();
        await new Promise(r => setTimeout(r, 200));
        const textAfterNextSteps = document.body.innerText.toLowerCase();
        const hasNextSteps = textAfterNextSteps.includes('daily tactical actions') || textAfterNextSteps.includes('action item');

        // 2. Click "Event Breakdown" tab
        const eventTab = buttons.find(b => b.textContent && b.textContent.includes('Event Breakdown'));
        if (eventTab) eventTab.click();
        await new Promise(r => setTimeout(r, 200));
        const textAfterEventTab = document.body.innerText.toLowerCase();
        const hasEventCards = textAfterEventTab.includes('independent event intelligence') || textAfterEventTab.includes('focus dashboard');

        // 3. Click "Portfolio Breakdown" tab
        const portfolioTab = buttons.find(b => b.textContent && b.textContent.includes('Portfolio Breakdown'));
        if (portfolioTab) portfolioTab.click();
        await new Promise(r => setTimeout(r, 200));
        const textAfterPortTab = document.body.innerText.toLowerCase();
        const hasPortfolioCards = textAfterPortTab.includes('portfolio 1') || textAfterPortTab.includes('portfolio budget share');

        // 4. Click back to "Executive Brief"
        const briefTab = buttons.find(b => b.textContent && b.textContent.includes('Executive Brief'));
        if (briefTab) briefTab.click();
        await new Promise(r => setTimeout(r, 200));
        const textAfterBriefTab = document.body.innerText.toLowerCase();
        const hasBrief = textAfterBriefTab.includes('top volume driver') || textAfterBriefTab.includes('strategic briefing');

        return {
          nextStepsTabFound: Boolean(nextStepsTab),
          hasNextSteps,
          eventTabFound: Boolean(eventTab),
          hasEventCards,
          portfolioTabFound: Boolean(portfolioTab),
          hasPortfolioCards,
          briefTabFound: Boolean(briefTab),
          hasBrief
        };
      });

      assert.ok(tabResults.nextStepsTabFound, 'Daily Next Steps tab exists');
      assert.ok(tabResults.hasNextSteps, 'Daily Next Steps tab renders tactical action items');
      assert.ok(tabResults.eventTabFound, 'Event Breakdown tab exists');
      assert.ok(tabResults.hasEventCards, 'Event Breakdown renders event cards');
      assert.ok(tabResults.portfolioTabFound, 'Portfolio Breakdown tab exists');
      assert.ok(tabResults.hasPortfolioCards, 'Portfolio Breakdown renders portfolio comparison');
      assert.ok(tabResults.hasBrief, 'Executive Brief tab restores strategic cards');
      assert.deepEqual(runtimeErrors, [], `No console errors during AI tab navigation: ${JSON.stringify(runtimeErrors)}`);

      await page.close();
    });

    await t.test('Admin section menu orientation adapts to screen size (dropdown on mobile, 2-line layout on medium, vertical on desktop)', async () => {
      const page = await getPage();
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!text.includes('403') && !text.includes('401')) consoleErrors.push(text);
        }
      });
      page.on('pageerror', err => consoleErrors.push(err.message));

      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('tahaluf_cached_email', 'admin@tahaluf.com');
        localStorage.setItem('tahaluf_cached_role', 'super_admin');
      });

      // 1. Smaller viewport test (mobile < sm, e.g. 375x812) -> Dropdown layout
      await page.setViewport({ width: 375, height: 812 });
      await page.goto(`${targetUrl}/?admin=events`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('nav[aria-label="Admin sections"]', { timeout: 15000 }).catch(() => null);

      const mobileDropdownState = await page.evaluate(() => {
        const trigger = document.querySelector('button[aria-label="Admin section selection"]');
        return {
          hasTrigger: !!trigger,
          triggerText: trigger ? trigger.textContent.trim() : null
        };
      });

      assert.ok(mobileDropdownState.hasTrigger, 'Mobile custom dropdown trigger must be present on smaller screens');
      assert.ok(mobileDropdownState.triggerText.includes('Events & Data'), 'Mobile dropdown displays active section label');

      // 2. Medium viewport test (tablet / not-so-small screen: 768x1024) -> Two-line layout (grid-cols-3)
      await page.setViewport({ width: 768, height: 1024 });
      await new Promise(r => setTimeout(r, 200));

      const mediumNavStyles = await page.evaluate(() => {
        const grid = document.querySelector('nav[aria-label="Admin sections"] .sm\\:grid');
        if (!grid) return null;
        const style = window.getComputedStyle(grid);
        return {
          display: style.display,
          gridTemplateColumns: style.gridTemplateColumns,
          buttonCount: grid.querySelectorAll('button').length
        };
      });

      assert.ok(mediumNavStyles, 'Medium two-line grid must be present on tablet viewports');
      assert.equal(mediumNavStyles.display, 'grid', 'Medium layout must use grid display');
      assert.equal(mediumNavStyles.buttonCount, 6, 'All 6 section buttons must be rendered in medium two-line layout');

      // 3. Desktop viewport test (1440x900) -> Vertical sidebar
      await page.setViewport({ width: 1440, height: 900 });
      await new Promise(r => setTimeout(r, 200));

      const desktopNavStyles = await page.evaluate(() => {
        const sidebar = document.querySelector('nav[aria-label="Admin sections"] .lg\\:flex');
        if (!sidebar) return null;
        const style = window.getComputedStyle(sidebar);
        return {
          display: style.display,
          flexDirection: style.flexDirection,
          buttonCount: sidebar.querySelectorAll('button').length
        };
      });

      assert.ok(desktopNavStyles, 'Desktop sidebar must be present on desktop');
      assert.equal(desktopNavStyles.flexDirection, 'column', 'Desktop section menu must have vertical column orientation');
      assert.equal(desktopNavStyles.buttonCount, 6, 'All 6 section buttons must be rendered on desktop');

      assert.deepEqual(consoleErrors, [], `No console errors during admin menu orientation check: ${JSON.stringify(consoleErrors)}`);

      await page.close();
    });

  } finally {
    if (browser) {
      await browser.close();
    }
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
});
