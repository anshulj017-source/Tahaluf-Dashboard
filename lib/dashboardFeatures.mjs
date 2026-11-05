export const FEATURE_MODES = ['public', 'admin_only', 'super_admin_only', 'custom_users', 'disabled'];

export const DASHBOARD_FEATURES = [
  { id: 'summary', name: 'Overview', group: 'Dashboard views', section: 'Overview Tab', targetLocation: 'Main Navigation > Overview', description: 'Summary metrics and performance tables.', addedAt: '2026-10-24T08:00:00.000Z', defaultMode: 'public' },
  { id: 'campaign', name: 'Event View', group: 'Dashboard views', section: 'Event View Tab', targetLocation: 'Main Navigation > Event View', description: 'Event and campaign performance.', addedAt: '2026-10-24T08:00:00.000Z', defaultMode: 'public' },
  { id: 'weekly', name: 'Weekly View', group: 'Dashboard views', section: 'Weekly View Tab', targetLocation: 'Main Navigation > Weekly View', description: 'Weekly pacing and targets.', addedAt: '2026-10-24T08:00:00.000Z', defaultMode: 'public' },
  { id: 'channel', name: 'Channel View', group: 'Dashboard views', section: 'Channel View Tab', targetLocation: 'Main Navigation > Channel View', description: 'Channel performance comparisons.', addedAt: '2026-10-24T08:00:00.000Z', defaultMode: 'public' },
  { id: 'market', name: 'Market View', group: 'Dashboard views', section: 'Market View Tab', targetLocation: 'Main Navigation > Market View', description: 'Market and geographic performance.', addedAt: '2026-10-24T08:00:00.000Z', defaultMode: 'public' },
  { id: 'detailed', name: 'Detailed View', group: 'Dashboard views', section: 'Detailed View Tab', targetLocation: 'Main Navigation > Detailed View', description: 'Custom comparisons and detailed data grid.', addedAt: '2026-10-24T08:00:00.000Z', defaultMode: 'public' },
  { id: 'webtraffic', name: 'Web Traffic', group: 'Dashboard views', section: 'Web Traffic Tab', targetLocation: 'Main Navigation > Web Traffic', description: 'GA4 data supplied by the existing sheet feed.', addedAt: '2026-10-26T10:00:00.000Z', defaultMode: 'disabled' },
  { id: 'creative', name: 'Creative View', group: 'Dashboard views', section: 'Creative View Tab', targetLocation: 'Main Navigation > Creative View', description: 'Creative previews and ad performance.', addedAt: '2026-10-25T11:00:00.000Z', defaultMode: 'public' },
  { id: 'tv', name: 'TV Wallboard', group: 'Presentation', section: 'Top Header', targetLocation: 'Header > TV Wallboard Mode', description: 'Full-screen operations wallboard.', addedAt: '2026-10-27T14:00:00.000Z' },
  { id: 'tvAutoCycle', name: 'TV Auto-Cycle', group: 'Presentation', section: 'TV Wallboard', targetLocation: 'TV Mode > Auto-Cycle Overlay', description: 'Rotate through enabled Overview, Event and Weekly views.', requires: 'tv', addedAt: '2026-10-27T14:30:00.000Z' },
  { id: 'exports', name: 'Dashboard Exports', group: 'Tools', section: 'Toolbar', targetLocation: 'View Toolbars > CSV & Chart Exports', description: 'CSV downloads and chart image exports. Admin configuration backups are unaffected.', addedAt: '2026-10-25T12:00:00.000Z' },
  { id: 'quickJump', name: 'Command Palette (Cmd+K / Ctrl+K)', group: 'Tools', section: 'Top Header', targetLocation: 'Header > Command Palette', description: 'Quick jump search across events, channels, and dashboard views (Cmd+K on Mac, Ctrl+K on Windows).', addedAt: '2026-10-30T08:28:00.000Z', defaultMode: 'admin_only' },
  { id: 'dimensionExport', name: 'Dimension Audit Export', group: 'Tools', section: 'Health Monitor', targetLocation: 'Admin Center > Health Monitor > Accepted Dimensions', description: 'Export dimension compliance audit findings as CSV.', addedAt: '2026-10-29T09:37:00.000Z', defaultMode: 'admin_only' },
  { id: 'bulkDimensionImport', name: 'Bulk Dimension Import', group: 'Tools', section: 'Health Monitor', targetLocation: 'Admin Center > Health Monitor > Accepted Dimensions', description: 'Bulk import custom accepted values for dimension standards.', addedAt: '2026-10-29T09:37:00.000Z', defaultMode: 'admin_only' },
  { id: 'currency', name: 'Currency Switch', group: 'Tools', section: 'Top Header', targetLocation: 'Header > Currency Switch (USD / SAR)', description: 'Switch between USD and SAR; disabled mode uses USD. Non-finance restrictions remain in place.', addedAt: '2026-10-25T09:00:00.000Z', defaultMode: 'public' },
  { id: 'aiSummary', name: 'AI Strategic Intelligence', group: 'Intelligence', section: 'Overview Tab', targetLocation: 'Overview Tab > AI Strategic Intelligence Brief', description: 'Executive summary briefings and strategic metric insights.', addedAt: '2026-10-28T16:00:00.000Z', defaultMode: 'admin_only' },
  { id: 'budgetSimulator', name: 'AI Budget Reallocation Simulator', group: 'Intelligence', section: 'Overview Tab', targetLocation: 'Overview Tab > AI Intelligence > Budget Simulator', description: 'Interactive scenario simulator modeling marginal return curves and projected conversion gains.', addedAt: '2026-10-28T16:00:00.000Z', defaultMode: 'admin_only' },
  { id: 'channelQuadrant', name: 'Channel Efficiency Matrix', group: 'Intelligence', section: 'Overview Tab', targetLocation: 'Overview Tab > AI Intelligence > Efficiency Matrix', description: 'Scale vs CPA quadrant analysis categorizing channels into Star Performers, Niche Drivers, and Cost Sinks.', addedAt: '2026-10-28T17:00:00.000Z', defaultMode: 'admin_only' },
  { id: 'granularTimeline', name: 'Granular Weekly Pacing', group: 'Advanced Analytics', section: 'Weekly View Tab', targetLocation: 'Weekly View Tab > Granular Weekly Pacing', description: 'Countdown W-weeks timeline breakdown and target projections.', addedAt: '2026-10-28T18:00:00.000Z', defaultMode: 'admin_only' },
  { id: 'benchmarkComparison', name: 'Cross-Event Benchmarking', group: 'Advanced Analytics', section: 'Event View Tab', targetLocation: 'Event View Tab > Cross-Event Benchmarking', description: 'Multi-event comparative analysis and benchmarking.', addedAt: '2026-10-28T19:00:00.000Z', defaultMode: 'admin_only' },
  { id: 'launchForecaster', name: 'Target Pacing & Launch Forecaster', group: 'Advanced Analytics', section: 'Weekly View Tab', targetLocation: 'Weekly View Tab > Target Pacing Forecaster', description: 'Run-rate forecaster predicting final event delivery against target budgets.', addedAt: '2026-10-28T20:00:00.000Z', defaultMode: 'admin_only' },
  { id: 'creativeFatigue', name: 'Creative Decay & Fatigue Radar', group: 'Advanced Analytics', section: 'Creative View Tab', targetLocation: 'Creative View Tab > Creative Decay Radar', description: 'Algorithmic ad fatigue detector analyzing frequency saturation and CTR decay curves.', addedAt: '2026-10-28T21:00:00.000Z', defaultMode: 'admin_only' },
  { id: 'tvCustomization', name: 'TV Wallboard Settings', group: 'Presentation', section: 'TV Wallboard', targetLocation: 'TV Wallboard Mode > Settings Gear Modal', description: 'Configurable rotation interval and custom auto-cycle views.', requires: 'tv', addedAt: '2026-10-29T09:37:00.000Z', defaultMode: 'admin_only' },
  { id: 'healthBanner', name: 'Data Health Banner', group: 'Monitoring', section: 'Global Banner', targetLocation: 'Global Dashboard Header > Health Alerts', description: 'Admin data-health alerts on the dashboard.', addedAt: '2026-10-26T12:00:00.000Z', defaultMode: 'admin_only', adminOnly: true },
  { id: 'healthAlertPopup', name: 'Dashboard Alert Popup & Bell', group: 'Monitoring', section: 'Main Dashboard', targetLocation: 'Main Dashboard > Health Alert Popup & Header Notification', description: 'Real-time health alert notification bell, banner and popup showing 1-2 line summaries of active issues on the main dashboard for both users and admins.', addedAt: '2026-11-03T15:30:00.000Z', defaultMode: 'public' },
  { id: 'adminEvents', name: 'Events & Data Management', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > Events & Data', description: 'Configure sheet connections, event names, launch countdowns, and column mappings.', addedAt: '2026-10-27T08:00:00.000Z', defaultMode: 'admin_only', adminOnly: true },
  { id: 'adminHealth', name: 'Health Monitor & Alerts', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > Health Monitor', description: 'Real-time sheet diagnostics, delivery alerts, and dimension standard compliance.', addedAt: '2026-10-27T09:00:00.000Z', defaultMode: 'admin_only', adminOnly: true },
  { id: 'adminQuotas', name: 'API Quotas & Usage Budgets', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > API & Quotas', description: 'Live external API request counters, monthly budget caps, and latency pings.', addedAt: '2026-10-27T10:00:00.000Z', defaultMode: 'admin_only', adminOnly: true },
  { id: 'adminAnalytics', name: 'Analytics & User Journeys', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > Analytics & Activity', description: 'Auditing, active session heatmaps, user dwell times, and geographical telemetry.', addedAt: '2026-10-27T11:00:00.000Z', defaultMode: 'admin_only', adminOnly: true },
  { id: 'adminUsers', name: 'User Access & Permissions', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > User Access', description: 'User access directory, account provisioning, and role assignment governance.', addedAt: '2026-10-30T08:14:00.000Z', defaultMode: 'admin_only', adminOnly: true },
  { id: 'adminFeatures', name: 'Feature Controls', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > Feature Controls', description: 'Configure global dashboard visibility, permissions, custom user access, and staging controls.', addedAt: '2026-10-31T12:19:00.000Z', defaultMode: 'super_admin_only', adminOnly: true },
  { id: 'pacingGuardian', name: 'Pacing Guardian & Spend Surge Radar', group: 'Monitoring', section: 'Health Monitor', targetLocation: 'Admin Center > Health Monitor > Pacing Guardian', description: 'Detects abnormal spend spikes and runaway media pacing exceeding daily thresholds.', addedAt: '2026-11-02T22:50:00.000Z', defaultMode: 'admin_only' },
  { id: 'budgetReconciliation', name: 'Actuals vs Planned Budget Reconciliation', group: 'Monitoring', section: 'Health Monitor', targetLocation: 'Admin Center > Health Monitor > Budget Reconciliation', description: 'Automated financial governance checking Actuals spend against Planned budgets and detecting unbudgeted channel spend.', addedAt: '2026-11-02T22:50:00.000Z', defaultMode: 'admin_only' },
  { id: 'healthWebhooks', name: 'Slack & Microsoft Teams Alerts', group: 'Monitoring', section: 'Health Monitor', targetLocation: 'Admin Center > Health Monitor > Notification Settings', description: 'Instant webhook integration delivering real-time health alerts to Slack or MS Teams channels.', addedAt: '2026-11-02T22:50:00.000Z', defaultMode: 'admin_only' },
  { id: 'eventActivityControls', name: 'Event Pause & Completion Controls', group: 'Monitoring', section: 'Health Monitor', targetLocation: 'Admin Center > Health Monitor > Events', description: 'Mark events paused or completed to suppress data-health alerts until new event data resumes.', addedAt: '2026-11-05T00:00:00.000Z', defaultMode: 'admin_only' },
  { id: 'channelSaturation', name: 'Channel Saturation & Diminishing Returns', group: 'Advanced Analytics', section: 'Admin Center', targetLocation: 'Admin Center > Analytics & Activity > Actionable Findings', description: 'Calculates marginal CPA curve efficiency to identify conversion ceilings and channel fatigue.', addedAt: '2026-11-02T22:50:00.000Z', defaultMode: 'admin_only' },
  { id: 'auditExport', name: 'Compliance Audit Trail Export', group: 'Tools', section: 'Admin Center', targetLocation: 'Admin Center > Issue History > Export Audit Trail', description: '1-click comprehensive CSV export of all governance actions, issue suppressions, and feature changes.', addedAt: '2026-11-02T22:50:00.000Z', defaultMode: 'admin_only' },
  { id: 'advancedPptx', name: 'Configurable PPTX Generator & Multi-Deck Export', group: 'Tools', section: 'Admin Center', targetLocation: 'Admin Center > Analytics & Activity > Export PPTX', description: 'Customizable presentation engine with date range, custom timestamp, and multi-deck separate export per event.', addedAt: '2026-11-02T22:50:00.000Z', defaultMode: 'admin_only' },
];

export const BASELINE_FEATURE_UPDATED = {
  summary: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  campaign: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  weekly: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  channel: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  market: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  detailed: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  webtraffic: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  creative: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  tv: { updatedAt: '2026-10-30T04:59:00.000Z', updatedBy: 'System Baseline' },
  tvAutoCycle: { updatedAt: '2026-10-30T04:59:00.000Z', updatedBy: 'System Baseline' },
  exports: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  quickJump: { updatedAt: '2026-10-30T08:28:00.000Z', updatedBy: 'System Baseline' },
  dimensionExport: { updatedAt: '2026-10-30T04:59:00.000Z', updatedBy: 'System Baseline' },
  bulkDimensionImport: { updatedAt: '2026-10-30T04:59:00.000Z', updatedBy: 'System Baseline' },
  currency: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  aiSummary: { updatedAt: '2026-11-01T14:20:00.000Z', updatedBy: 'System Baseline' },
  budgetSimulator: { updatedAt: '2026-10-30T04:59:00.000Z', updatedBy: 'System Baseline' },
  channelQuadrant: { updatedAt: '2026-11-01T14:20:00.000Z', updatedBy: 'System Baseline' },
  granularTimeline: { updatedAt: '2026-11-01T14:20:00.000Z', updatedBy: 'System Baseline' },
  benchmarkComparison: { updatedAt: '2026-11-01T14:20:00.000Z', updatedBy: 'System Baseline' },
  launchForecaster: { updatedAt: '2026-11-01T14:20:00.000Z', updatedBy: 'System Baseline' },
  creativeFatigue: { updatedAt: '2026-11-01T14:20:00.000Z', updatedBy: 'System Baseline' },
  tvCustomization: { updatedAt: '2026-10-30T04:59:00.000Z', updatedBy: 'System Baseline' },
  healthBanner: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  healthAlertPopup: { updatedAt: '2026-11-03T15:30:00.000Z', updatedBy: 'System Baseline' },
  adminEvents: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  adminHealth: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  adminQuotas: { updatedAt: '2026-10-29T09:37:00.000Z', updatedBy: 'System Baseline' },
  adminAnalytics: { updatedAt: '2026-11-01T14:20:00.000Z', updatedBy: 'System Baseline' },
  adminUsers: { updatedAt: '2026-10-31T18:00:00.000Z', updatedBy: 'System Baseline' },
  adminFeatures: { updatedAt: '2026-10-31T12:19:00.000Z', updatedBy: 'System Baseline' },
  pacingGuardian: { updatedAt: '2026-11-02T22:50:00.000Z', updatedBy: 'System Baseline' },
  budgetReconciliation: { updatedAt: '2026-11-02T22:50:00.000Z', updatedBy: 'System Baseline' },
  healthWebhooks: { updatedAt: '2026-11-02T22:50:00.000Z', updatedBy: 'System Baseline' },
  eventActivityControls: { updatedAt: '2026-11-05T00:00:00.000Z', updatedBy: 'System Baseline' },
  channelSaturation: { updatedAt: '2026-11-02T22:50:00.000Z', updatedBy: 'System Baseline' },
  auditExport: { updatedAt: '2026-11-02T22:50:00.000Z', updatedBy: 'System Baseline' },
  advancedPptx: { updatedAt: '2026-11-02T22:50:00.000Z', updatedBy: 'System Baseline' },
};

export const DEFAULT_FEATURE_CONFIG = {
  revision: 0,
  updatedAt: null,
  modes: Object.fromEntries(DASHBOARD_FEATURES.map(feature => [feature.id, feature.defaultMode || 'public'])),
  customUsers: {},
  featureUpdated: { ...BASELINE_FEATURE_UPDATED },
};

export function isFeatureEnabled(config, id, role = 'standard', preview = false, userEmail = '') {
  const feature = DASHBOARD_FEATURES.find(item => item.id === id);
  if (!feature) return false;
  const isSuperAdmin = role === 'super_admin' && !preview;
  const isAdmin = (role === 'admin' || role === 'super_admin') && !preview;
  const mode = config?.modes?.[id] ?? DEFAULT_FEATURE_CONFIG.modes[id];

  if (mode === 'disabled') {
    return false;
  }

  let modePermitted = false;
  if (isSuperAdmin) {
    // Super Admin has unconditional permanent access to all controls with no option to change it
    modePermitted = true;
  } else if (mode === 'public') {
    // Features marked adminOnly require admin privileges if left in public mode
    modePermitted = feature.adminOnly ? isAdmin : true;
  } else if (mode === 'admin_only') {
    // When Admin Only is selected, Super Admin is automatically included
    modePermitted = isAdmin;
  } else if (mode === 'super_admin_only') {
    // When Super Admin Only is selected, then it's ONLY Super Admin
    modePermitted = isSuperAdmin;
  } else if (mode === 'custom_users') {
    // Option to Select Custom Users: user can select one or more users or domain rules (e.g. @tahaluf.com)
    const normalizedUserEmail = (userEmail || '').trim().toLowerCase();
    const rawAllowedUsers = config?.customUsers?.[id];
    const allowedUsers = Array.isArray(rawAllowedUsers)
      ? rawAllowedUsers.map(u => (u || '').trim().toLowerCase())
      : [];
    const isDomainMatch = allowedUsers.some(entry => 
      entry.startsWith('@') && entry.includes('.') && normalizedUserEmail.endsWith(entry)
    );
    modePermitted = !preview && Boolean(
      normalizedUserEmail && (allowedUsers.includes(normalizedUserEmail) || isDomainMatch)
    );
  }

  return modePermitted
    && (!feature.requires || isFeatureEnabled(config, feature.requires, role, preview, userEmail));
}

export function validateCustomUsers(customUsers = {}) {
  if (!customUsers || typeof customUsers !== 'object' || Array.isArray(customUsers)) {
    return {};
  }
  const clean = {};
  for (const [id, users] of Object.entries(customUsers)) {
    if (Array.isArray(users)) {
      clean[id] = [...new Set(
        users
          .filter(u => typeof u === 'string' && u.trim().length > 0)
          .map(u => u.trim().toLowerCase())
      )];
    }
  }
  return clean;
}

export function validateFeatureModes(modes) {
  if (!modes || typeof modes !== 'object' || Array.isArray(modes)) throw new Error('Feature modes must be an object.');
  for (const [id, mode] of Object.entries(modes)) {
    const feature = DASHBOARD_FEATURES.find(item => item.id === id);
    if (!feature || !FEATURE_MODES.includes(mode)) throw new Error(`Invalid feature mode: ${id}`);
    if (feature.adminOnly && mode === 'public') throw new Error(`${feature.name} is restricted to administrators.`);
  }
  if (!DASHBOARD_FEATURES.filter(feature => feature.group === 'Dashboard views')
    .some(feature => (modes[feature.id] ?? DEFAULT_FEATURE_CONFIG.modes[feature.id]) === 'public')) {
    throw new Error('Keep at least one dashboard view enabled for everyone.');
  }
  return { ...DEFAULT_FEATURE_CONFIG.modes, ...modes };
}
