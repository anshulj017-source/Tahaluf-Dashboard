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
 */
export function dispatchBeacon(payload) {
  if (typeof window === 'undefined') return;
  const endpoint = '/api/analytics/track';
  const data = JSON.stringify(payload);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([data], { type: 'application/json' });
      const sent = navigator.sendBeacon(endpoint, blob);
      if (sent) return;
    } catch {
      // Fallback to fetch
    }
  }

  // Fallback: non-blocking fetch with keepalive
  try {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Silent fail
  }
}

/**
 * Track user interactions (immediate for tab changes, debounced for filter adjustments)
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

  const { sid, isNew } = getSessionId();
  const geoHint = getLocalGeoHint();
  const device = getDeviceTelemetry();

  // If switching tabs, compute dwell time for the tab user just left
  let calculatedDwell = dwellTimeSec;
  if (eventType === 'tab_view' && activeTabName !== tab) {
    calculatedDwell = Math.max(1, Math.round((Date.now() - currentTabStartTime) / 1000));
    currentTabStartTime = Date.now();
    activeTabName = tab;
  }

  const payload = {
    eventType,
    userEmail: userEmail || 'admin@tahaluf.com',
    userRole: userRole || 'standard',
    tab: tab || activeTabName,
    dwellTimeSec: calculatedDwell,
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

  // Debounce filter changes by 1500ms
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    lastTrackedState = fingerprint;
    dispatchBeacon(payload);
  }, 1500);
}

/**
 * Helper to record exports (PPTX, CSV, Screenshots)
 */
export function trackExport(format, tab, userEmail = 'admin@tahaluf.com') {
  trackActivity({
    eventType: format === 'pptx' ? 'export_pptx' : 'export_csv',
    userEmail,
    tab,
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
    details: { currency },
    immediate: true,
  });
}

/**
 * Helper to record chart metric selection (CPM, CTR, CPC, CVR)
 */
export function trackMetricSelect(metric, userEmail = 'admin@tahaluf.com') {
  trackActivity({
    eventType: 'perf_metric_change',
    userEmail,
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
    details: { combo, reason },
    immediate: true,
  });
}
