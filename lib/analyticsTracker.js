/**
 * Client-Side Analytics Tracker for Tahaluf Dashboard
 * 
 * Non-blocking, debounced tracking with navigator.sendBeacon fallback.
 * Zero impact on main thread UI rendering or filter responsiveness.
 */

let debounceTimer = null;
let lastTrackedState = null;
let currentTabStartTime = Date.now();
let activeTabName = 'summary';

function getSessionId() {
  if (typeof window === 'undefined') return { sid: 'server_session', isNew: false };
  try {
    let sid = window.sessionStorage.getItem('tahaluf_analytics_sid');
    let isNew = false;
    if (!sid) {
      sid = 'sid_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      window.sessionStorage.setItem('tahaluf_analytics_sid', sid);
      isNew = true;
    }
    return { sid, isNew };
  } catch {
    return { sid: 'sid_fallback', isNew: false };
  }
}

function getLocalGeoHint() {
  if (typeof window === 'undefined') return { country: 'SA', city: 'Riyadh' };
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Riyadh') || tz.includes('Asia/Riyadh')) {
      return { country: 'SA', city: 'Riyadh' };
    }
    if (tz.includes('Dubai') || tz.includes('Asia/Dubai')) {
      return { country: 'AE', city: 'Dubai' };
    }
    if (tz.includes('London') || tz.includes('Europe/London')) {
      return { country: 'GB', city: 'London' };
    }
    if (tz.includes('New_York') || tz.includes('America/New_York')) {
      return { country: 'US', city: 'New York' };
    }
    if (tz.includes('Karachi') || tz.includes('Asia/Karachi')) {
      return { country: 'PK', city: 'Karachi' };
    }
    if (tz.includes('Calcutta') || tz.includes('Asia/Kolkata')) {
      return { country: 'IN', city: 'Mumbai' };
    }
    return { country: 'SA', city: 'Riyadh' };
  } catch {
    return { country: 'SA', city: 'Riyadh' };
  }
}

function getDeviceTelemetry() {
  if (typeof window === 'undefined') {
    return { screen: '1440x900', browser: 'Chrome', os: 'macOS' };
  }
  try {
    const w = window.innerWidth || 1440;
    const h = window.innerHeight || 900;
    let screenCat = `${w}x${h}`;
    if (w <= 1440 && w >= 1200) screenCat = '1440x900 (13" MacBook / Laptop)';
    else if (w >= 1900 && w < 2200) screenCat = '1920x1080 (FHD Desktop)';
    else if (w >= 2200 && w < 3000) screenCat = '2560x1440 (2K / QHD)';
    else if (w >= 3000) screenCat = '3840x2160 (4K)';
    else if (w < 1200) screenCat = 'Tablet / Mobile (Touch)';

    const ua = navigator.userAgent || '';
    let browser = 'Google Chrome';
    if (ua.includes('Edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Apple Safari';
    else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';

    let os = 'macOS';
    if (ua.includes('Win')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Linux')) os = 'Linux';

    return { screen: screenCat, browser, os };
  } catch {
    return { screen: '1440x900', browser: 'Google Chrome', os: 'macOS' };
  }
}

/**
 * Dispatch analytics beacon to server
 * Uses fetch with keepalive: true (supports modern JSON POSTs reliably)
 * with navigator.sendBeacon as fallback on page unload.
 */
export function dispatchBeacon(payload) {
  if (typeof window === 'undefined') return;
  const endpoint = '/api/analytics/track';
  const data = JSON.stringify(payload);

  try {
    if (typeof fetch === 'function') {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true,
      }).catch(() => {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon(endpoint, new Blob([data], { type: 'application/json' }));
        }
      });
      return;
    }
  } catch {
    // Fallback below
  }

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([data], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
    } catch {
      // Silent fail
    }
  }
}

/**
 * Flush accumulated dwell time for the currently active tab.
 * Keeps dwell time metrics 100% accurate in real-time even if user never leaves Overview.
 */
function flushTabDwellTime(isPageExit = false) {
  if (typeof window === 'undefined') return;
  const elapsed = Math.round((Date.now() - currentTabStartTime) / 1000);
  if (elapsed < 3) return; // Ignore micro flickers under 3 seconds

  currentTabStartTime = Date.now();

  const { sid, isNew } = getSessionId();
  const geoHint = getLocalGeoHint();
  const device = getDeviceTelemetry();

  const payload = {
    eventType: isPageExit ? 'tab_dwell' : 'heartbeat_dwell',
    userEmail: window.__tahaluf_user_email || 'admin@tahaluf.com',
    userRole: window.__tahaluf_user_role || 'standard',
    tab: activeTabName,
    dwellTimeSec: elapsed,
    details: { reason: isPageExit ? 'exit_or_switch' : 'heartbeat' },
    device,
    sessionId: sid,
    isNewSession: false,
    geo: geoHint,
    timestamp: new Date().toISOString(),
  };

  dispatchBeacon(payload);
}

// Client-side initialization of periodic dwell heartbeat and lifecycle listeners
let lifecycleInitialized = false;
function initLifecycleTracking() {
  if (typeof window === 'undefined' || lifecycleInitialized) return;
  lifecycleInitialized = true;

  // Dwell heartbeat every 25 seconds while tab is active and visible
  setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      flushTabDwellTime(false);
    }
  }, 25000);

  // Flush dwell time when user hides the tab or minimizes window
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushTabDwellTime(true);
    } else {
      currentTabStartTime = Date.now();
    }
  });

  // Flush dwell time when user closes window or navigates away
  window.addEventListener('beforeunload', () => {
    flushTabDwellTime(true);
  });
  window.addEventListener('pagehide', () => {
    flushTabDwellTime(true);
  });
}

/**
 * Track user interactions (immediate for tab changes & actions, debounced for filter adjustments)
 */
export function trackActivity({
  eventType = 'page_view',
  userEmail = 'admin@tahaluf.com',
  userRole = 'standard',
  tab = 'summary',
  filters = {},
  details = null,
  dwellTimeSec = 0,
  immediate = false,
}) {
  if (typeof window === 'undefined') return;
  initLifecycleTracking();

  // Cache user info for lifecycle flushes
  if (userEmail) window.__tahaluf_user_email = userEmail;
  if (userRole) window.__tahaluf_user_role = userRole;

  const { sid, isNew } = getSessionId();
  const geoHint = getLocalGeoHint();
  const device = getDeviceTelemetry();

  // Handle Tab Switching: Attribute dwell time to the PREVIOUS tab before switching
  if (eventType === 'tab_view' && activeTabName !== tab) {
    const elapsedOnPreviousTab = Math.max(1, Math.round((Date.now() - currentTabStartTime) / 1000));
    const previousTab = activeTabName;
    currentTabStartTime = Date.now();
    activeTabName = tab;

    // Immediately flush dwell time for previous tab
    if (elapsedOnPreviousTab >= 2) {
      dispatchBeacon({
        eventType: 'tab_dwell',
        userEmail: userEmail || 'admin@tahaluf.com',
        userRole: userRole || 'standard',
        tab: previousTab,
        dwellTimeSec: elapsedOnPreviousTab,
        details: { previousTab, newTab: tab },
        filters: {
          business: filters.business || 'All',
          events: filters.events || [],
          channels: filters.channels || [],
          datePreset: filters.datePreset || 'auto',
        },
        device,
        sessionId: sid,
        isNewSession: false,
        geo: geoHint,
        timestamp: new Date().toISOString(),
      });
    }
  } else if (tab) {
    activeTabName = tab;
  }

  const payload = {
    eventType,
    userEmail: userEmail || 'admin@tahaluf.com',
    userRole: userRole || 'standard',
    tab: tab || activeTabName,
    dwellTimeSec: dwellTimeSec || 0,
    details,
    filters: {
      business: filters.business || 'All',
      events: filters.events || [],
      channels: filters.channels || [],
      datePreset: filters.datePreset || 'auto',
    },
    device,
    sessionId: sid,
    isNewSession: isNew,
    geo: geoHint,
    timestamp: new Date().toISOString(),
  };

  // State fingerprint to avoid duplicate consecutive sends
  const fingerprint = JSON.stringify({
    type: eventType,
    tab: payload.tab,
    b: payload.filters.business,
    ev: payload.filters.events,
    ch: payload.filters.channels,
    dp: payload.filters.datePreset,
    dt: details ? JSON.stringify(details) : '',
  });

  if (fingerprint === lastTrackedState && !immediate && eventType === 'filter_applied') {
    return;
  }

  if (immediate || eventType !== 'filter_applied') {
    if (debounceTimer) clearTimeout(debounceTimer);
    lastTrackedState = fingerprint;
    dispatchBeacon(payload);
    return;
  }

  // Debounce filter changes by 1200ms
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    lastTrackedState = fingerprint;
    dispatchBeacon(payload);
  }, 1200);
}

/**
 * Record initial dashboard open & session landing
 */
export function trackDashboardOpen(userEmail = 'admin@tahaluf.com', userRole = 'standard', initialTab = 'summary', filters = {}) {
  activeTabName = initialTab || 'summary';
  currentTabStartTime = Date.now();
  trackActivity({
    eventType: 'dashboard_open',
    userEmail,
    userRole,
    tab: activeTabName,
    filters,
    details: { initialTab: activeTabName },
    immediate: true,
  });
}

/**
 * Helper to record metric card inspection (KPI clicks on Overview tab)
 */
export function trackMetricCardClick(metricLabel, value, userEmail = 'admin@tahaluf.com') {
  trackActivity({
    eventType: 'metric_card_click',
    userEmail,
    tab: activeTabName || 'summary',
    details: { metric: metricLabel, value: String(value) },
    immediate: true,
  });
}

/**
 * Helper to record trend time-granularity toggle (Weekly, Daily, Monthly)
 */
export function trackTrendView(view, userEmail = 'admin@tahaluf.com') {
  trackActivity({
    eventType: 'trend_view_change',
    userEmail,
    tab: activeTabName || 'summary',
    details: { trendView: view },
    immediate: true,
  });
}

/**
 * Helper to record exports (PPTX, CSV, Screenshots)
 */
export function trackExport(format, tab = 'summary', userEmail = 'admin@tahaluf.com') {
  trackActivity({
    eventType: format === 'pptx' ? 'export_pptx' : 'export_csv',
    userEmail,
    tab: tab || activeTabName,
    details: { format },
    immediate: true,
  });
}

/**
 * Helper to record currency toggle (USD vs SAR)
 */
export function trackCurrencyToggle(currency, userEmail = 'admin@tahaluf.com') {
  trackActivity({
    eventType: 'currency_toggle',
    userEmail,
    tab: activeTabName || 'summary',
    details: { currency },
    immediate: true,
  });
}

/**
 * Helper to record chart metric selection (Spend, Clicks, Impressions, CTR, CPC, etc.)
 */
export function trackMetricSelect(metric, userEmail = 'admin@tahaluf.com') {
  trackActivity({
    eventType: 'perf_metric_change',
    userEmail,
    tab: activeTabName || 'summary',
    details: { metric },
    immediate: true,
  });
}

/**
 * Helper to track search queries within tables
 */
export function trackSearchQuery(query, resultCount = 0, userEmail = 'admin@tahaluf.com') {
  if (!query || query.length < 2) return;
  trackActivity({
    eventType: 'search_query',
    userEmail,
    tab: activeTabName || 'summary',
    details: { query, resultCount },
    immediate: true,
  });
}

/**
 * Helper to track zero-result / empty filter combinations
 */
export function trackZeroResult(combo, reason, userEmail = 'admin@tahaluf.com') {
  trackActivity({
    eventType: 'zero_result_query',
    userEmail,
    tab: activeTabName || 'summary',
    details: { combo, reason },
    immediate: true,
  });
}
