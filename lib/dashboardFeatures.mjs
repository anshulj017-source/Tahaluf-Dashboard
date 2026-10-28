export const FEATURE_MODES = ['public', 'admin_only', 'disabled'];

export const DASHBOARD_FEATURES = [
  { id: 'summary', name: 'Overview', group: 'Dashboard views', description: 'Summary metrics and performance tables.' },
  { id: 'campaign', name: 'Event View', group: 'Dashboard views', description: 'Event and campaign performance.' },
  { id: 'weekly', name: 'Weekly View', group: 'Dashboard views', description: 'Weekly pacing and targets.' },
  { id: 'channel', name: 'Channel View', group: 'Dashboard views', description: 'Channel performance comparisons.' },
  { id: 'market', name: 'Market View', group: 'Dashboard views', description: 'Market and geographic performance.' },
  { id: 'detailed', name: 'Detailed View', group: 'Dashboard views', description: 'Custom comparisons and detailed data grid.' },
  { id: 'webtraffic', name: 'Web Traffic', group: 'Dashboard views', description: 'GA4 data supplied by the existing sheet feed.', defaultMode: 'disabled' },
  { id: 'creative', name: 'Creative View', group: 'Dashboard views', description: 'Creative previews and ad performance.' },
  { id: 'tv', name: 'TV Wallboard', group: 'Presentation', description: 'Full-screen operations wallboard.' },
  { id: 'tvAutoCycle', name: 'TV Auto-Cycle', group: 'Presentation', description: 'Rotate through enabled Overview, Event and Weekly views.', requires: 'tv' },
  { id: 'exports', name: 'Dashboard Exports', group: 'Tools', description: 'CSV downloads and chart image exports. Admin configuration backups are unaffected.' },
  { id: 'quickJump', name: 'Command Palette (Cmd+K)', group: 'Tools', description: 'Quick jump search across events, channels, and dashboard views.', defaultMode: 'admin_only' },
  { id: 'dimensionExport', name: 'Dimension Audit Export', group: 'Tools', description: 'Export dimension compliance audit findings as CSV.', defaultMode: 'admin_only' },
  { id: 'bulkDimensionImport', name: 'Bulk Dimension Import', group: 'Tools', description: 'Bulk import custom accepted values for dimension standards.', defaultMode: 'admin_only' },
  { id: 'currency', name: 'Currency Switch', group: 'Tools', description: 'Switch between USD and SAR; disabled mode uses USD. Non-finance restrictions remain in place.' },
  { id: 'aiSummary', name: 'AI Strategic Intelligence', group: 'Intelligence', description: 'Executive summary briefings and strategic metric insights.', defaultMode: 'admin_only' },
  { id: 'granularTimeline', name: 'Granular Weekly Pacing', group: 'Advanced Analytics', description: 'Countdown W-weeks timeline breakdown and target projections.', defaultMode: 'admin_only' },
  { id: 'benchmarkComparison', name: 'Cross-Event Benchmarking', group: 'Advanced Analytics', description: 'Multi-event comparative analysis and benchmarking.', defaultMode: 'admin_only' },
  { id: 'tvCustomization', name: 'TV Wallboard Settings', group: 'Presentation', description: 'Configurable rotation interval and custom auto-cycle views.', requires: 'tv', defaultMode: 'admin_only' },
  { id: 'healthBanner', name: 'Data Health Banner', group: 'Monitoring', description: 'Admin data-health alerts on the dashboard.', defaultMode: 'admin_only', adminOnly: true },
];

export const DEFAULT_FEATURE_CONFIG = {
  revision: 0,
  updatedAt: null,
  modes: Object.fromEntries(DASHBOARD_FEATURES.map(feature => [feature.id, feature.defaultMode || 'public']))
};

export function isFeatureEnabled(config, id, role = 'standard', preview = false) {
  const feature = DASHBOARD_FEATURES.find(item => item.id === id);
  if (!feature) return false;
  const isAdmin = role === 'admin' && !preview;
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
