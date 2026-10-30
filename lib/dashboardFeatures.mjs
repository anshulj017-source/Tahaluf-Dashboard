export const FEATURE_MODES = ['public', 'admin_only', 'disabled'];

export const DASHBOARD_FEATURES = [
  { id: 'summary', name: 'Overview', group: 'Dashboard views', section: 'Overview Tab', targetLocation: 'Main Navigation > Overview', description: 'Summary metrics and performance tables.' },
  { id: 'campaign', name: 'Event View', group: 'Dashboard views', section: 'Event View Tab', targetLocation: 'Main Navigation > Event View', description: 'Event and campaign performance.' },
  { id: 'weekly', name: 'Weekly View', group: 'Dashboard views', section: 'Weekly View Tab', targetLocation: 'Main Navigation > Weekly View', description: 'Weekly pacing and targets.' },
  { id: 'channel', name: 'Channel View', group: 'Dashboard views', section: 'Channel View Tab', targetLocation: 'Main Navigation > Channel View', description: 'Channel performance comparisons.' },
  { id: 'market', name: 'Market View', group: 'Dashboard views', section: 'Market View Tab', targetLocation: 'Main Navigation > Market View', description: 'Market and geographic performance.' },
  { id: 'detailed', name: 'Detailed View', group: 'Dashboard views', section: 'Detailed View Tab', targetLocation: 'Main Navigation > Detailed View', description: 'Custom comparisons and detailed data grid.' },
  { id: 'webtraffic', name: 'Web Traffic', group: 'Dashboard views', section: 'Web Traffic Tab', targetLocation: 'Main Navigation > Web Traffic', description: 'GA4 data supplied by the existing sheet feed.', defaultMode: 'disabled' },
  { id: 'creative', name: 'Creative View', group: 'Dashboard views', section: 'Creative View Tab', targetLocation: 'Main Navigation > Creative View', description: 'Creative previews and ad performance.' },
  { id: 'tv', name: 'TV Wallboard', group: 'Presentation', section: 'Top Header', targetLocation: 'Header > TV Wallboard Mode', description: 'Full-screen operations wallboard.' },
  { id: 'tvAutoCycle', name: 'TV Auto-Cycle', group: 'Presentation', section: 'TV Wallboard', targetLocation: 'TV Mode > Auto-Cycle Overlay', description: 'Rotate through enabled Overview, Event and Weekly views.', requires: 'tv' },
  { id: 'exports', name: 'Dashboard Exports', group: 'Tools', section: 'Toolbar', targetLocation: 'View Toolbars > CSV & Chart Exports', description: 'CSV downloads and chart image exports. Admin configuration backups are unaffected.' },
  { id: 'quickJump', name: 'Command Palette (Cmd+K)', group: 'Tools', section: 'Top Header', targetLocation: 'Header > Command Palette (Cmd+K)', description: 'Quick jump search across events, channels, and dashboard views.', defaultMode: 'admin_only' },
  { id: 'dimensionExport', name: 'Dimension Audit Export', group: 'Tools', section: 'Health Monitor', targetLocation: 'Admin Center > Health Monitor > Accepted Dimensions', description: 'Export dimension compliance audit findings as CSV.', defaultMode: 'admin_only' },
  { id: 'bulkDimensionImport', name: 'Bulk Dimension Import', group: 'Tools', section: 'Health Monitor', targetLocation: 'Admin Center > Health Monitor > Accepted Dimensions', description: 'Bulk import custom accepted values for dimension standards.', defaultMode: 'admin_only' },
  { id: 'currency', name: 'Currency Switch', group: 'Tools', section: 'Top Header', targetLocation: 'Header > Currency Switch (USD / SAR)', description: 'Switch between USD and SAR; disabled mode uses USD. Non-finance restrictions remain in place.' },
  { id: 'aiSummary', name: 'AI Strategic Intelligence', group: 'Intelligence', section: 'Overview Tab', targetLocation: 'Overview Tab > AI Strategic Intelligence Brief', description: 'Executive summary briefings and strategic metric insights.', defaultMode: 'admin_only' },
  { id: 'budgetSimulator', name: 'AI Budget Reallocation Simulator', group: 'Intelligence', section: 'Overview Tab', targetLocation: 'Overview Tab > AI Intelligence > Budget Simulator', description: 'Interactive scenario simulator modeling marginal return curves and projected conversion gains.', defaultMode: 'admin_only' },
  { id: 'channelQuadrant', name: 'Channel Efficiency Matrix', group: 'Intelligence', section: 'Overview Tab', targetLocation: 'Overview Tab > AI Intelligence > Efficiency Matrix', description: 'Scale vs CPA quadrant analysis categorizing channels into Star Performers, Niche Drivers, and Cost Sinks.', defaultMode: 'admin_only' },
  { id: 'granularTimeline', name: 'Granular Weekly Pacing', group: 'Advanced Analytics', section: 'Weekly View Tab', targetLocation: 'Weekly View Tab > Granular Weekly Pacing', description: 'Countdown W-weeks timeline breakdown and target projections.', defaultMode: 'admin_only' },
  { id: 'benchmarkComparison', name: 'Cross-Event Benchmarking', group: 'Advanced Analytics', section: 'Event View Tab', targetLocation: 'Event View Tab > Cross-Event Benchmarking', description: 'Multi-event comparative analysis and benchmarking.', defaultMode: 'admin_only' },
  { id: 'launchForecaster', name: 'Target Pacing & Launch Forecaster', group: 'Advanced Analytics', section: 'Weekly View Tab', targetLocation: 'Weekly View Tab > Target Pacing Forecaster', description: 'Run-rate forecaster predicting final event delivery against target budgets.', defaultMode: 'admin_only' },
  { id: 'creativeFatigue', name: 'Creative Decay & Fatigue Radar', group: 'Advanced Analytics', section: 'Creative View Tab', targetLocation: 'Creative View Tab > Creative Decay Radar', description: 'Algorithmic ad fatigue detector analyzing frequency saturation and CTR decay curves.', defaultMode: 'admin_only' },
  { id: 'tvCustomization', name: 'TV Wallboard Settings', group: 'Presentation', section: 'TV Wallboard', targetLocation: 'TV Wallboard Mode > Settings Gear Modal', description: 'Configurable rotation interval and custom auto-cycle views.', requires: 'tv', defaultMode: 'admin_only' },
  { id: 'healthBanner', name: 'Data Health Banner', group: 'Monitoring', section: 'Global Banner', targetLocation: 'Global Dashboard Header > Health Alerts', description: 'Admin data-health alerts on the dashboard.', defaultMode: 'admin_only', adminOnly: true },
  { id: 'adminEvents', name: 'Events & Data Management', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > Events & Data', description: 'Configure sheet connections, event names, launch countdowns, and column mappings.', defaultMode: 'admin_only', adminOnly: true },
  { id: 'adminHealth', name: 'Health Monitor & Alerts', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > Health Monitor', description: 'Real-time sheet diagnostics, delivery alerts, and dimension standard compliance.', defaultMode: 'admin_only', adminOnly: true },
  { id: 'adminQuotas', name: 'API Quotas & Usage Budgets', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > API & Quotas', description: 'Live external API request counters, monthly budget caps, and latency pings.', defaultMode: 'admin_only', adminOnly: true },
  { id: 'adminAnalytics', name: 'Analytics & User Journeys', group: 'Admin Center', section: 'Admin Center', targetLocation: 'Admin Center > Analytics & Activity', description: 'Auditing, active session heatmaps, user dwell times, and geographical telemetry.', defaultMode: 'admin_only', adminOnly: true },
];

export const DEFAULT_FEATURE_CONFIG = {
  revision: 0,
  updatedAt: null,
  modes: Object.fromEntries(DASHBOARD_FEATURES.map(feature => [feature.id, feature.defaultMode || 'public']))
};

export function isFeatureEnabled(config, id, role = 'standard', preview = false) {
  const feature = DASHBOARD_FEATURES.find(item => item.id === id);
  if (!feature) return false;
  const isAdmin = (role === 'admin' || role === 'super_admin') && !preview;
  if (feature.adminOnly && !isAdmin) return false;
  const mode = config?.modes?.[id] ?? DEFAULT_FEATURE_CONFIG.modes[id];
  return (mode === 'public' || (mode === 'admin_only' && isAdmin))
    && (!feature.requires || isFeatureEnabled(config, feature.requires, role, preview));
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
