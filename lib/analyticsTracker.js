/**
 * Client-Side Analytics Tracker for Tahaluf Dashboard
 * 
 * Non-blocking, debounced tracking with navigator.sendBeacon fallback.
 * Zero impact on main thread UI rendering or filter responsiveness.
 */

let debounceTimer = null;
let lastTrackedState = null;

function getSessionId() {
  if (typeof window === 'undefined') return 'server_session';
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
  immediate = false,
}) {
  if (typeof window === 'undefined') return;

  const { sid, isNew } = getSessionId();
  const geoHint = getLocalGeoHint();

  const payload = {
    eventType,
    userEmail: userEmail || 'admin@tahaluf.com',
    userRole: userRole || 'standard',
    tab: tab || 'summary',
    filters: {
      business: filters.business || 'All',
      events: filters.events || [],
      channels: filters.channels || [],
      datePreset: filters.datePreset || 'auto',
    },
    sessionId: sid,
    isNewSession: isNew,
    geo: geoHint,
    timestamp: new Date().toISOString(),
  };

  // State fingerprint to avoid duplicate consecutive sends
  const fingerprint = JSON.stringify({
    tab: payload.tab,
    b: payload.filters.business,
    ev: payload.filters.events,
    ch: payload.filters.channels,
    dp: payload.filters.datePreset,
  });

  if (fingerprint === lastTrackedState && !immediate) {
    return;
  }

  if (immediate) {
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
