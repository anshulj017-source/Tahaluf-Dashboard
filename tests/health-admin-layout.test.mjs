import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { DEFAULT_HEALTH_NOTIFICATION_SETTINGS, getHealthIssues } from '../lib/healthNotificationUtils.mjs';
import { DEFAULT_DIMENSION_SETTINGS } from '../lib/dimensionStandards.mjs';

const require = createRequire(import.meta.url);

function createHookHarness() {
  const values = [];
  const dependencies = [];
  const cleanups = [];
  let cursor = 0;
  let pendingEffects = [];

  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], next => {
        values[index] = typeof next === 'function' ? next(values[index]) : next;
      }];
    },
    useMemo(factory) {
      cursor++;
      return factory();
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useCallback(callback) {
      cursor++;
      return callback;
    },
    useEffect(callback, deps = []) {
      const index = cursor++;
      const previous = dependencies[index];
      if (!previous || deps.some((value, i) => value !== previous[i])) {
        dependencies[index] = deps;
        pendingEffects.push(() => {
          cleanups[index]?.();
          cleanups[index] = callback();
        });
      }
    }
  };

  return {
    hooks,
    render(component, props) {
      cursor = 0;
      const tree = component(props);
      const effects = pendingEffects;
      pendingEffects = [];
      effects.forEach(effect => effect());
      return tree;
    }
  };
}

function expand(tree) {
  if (!tree || typeof tree !== 'object') return tree;
  if (Array.isArray(tree)) return tree.map(expand);
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return {
    ...tree,
    props: { ...tree.props, children: expand(tree.props?.children) }
  };
}

function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function nodeText(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(nodeText).join('');
  return nodeText(tree.props?.children);
}

function makeSource(eventId, eventName, kind, state = 'healthy', overrides = {}) {
  return {
    eventId, eventName, kind, state, eventDataStatus: 'present', eventRows: 10,
    totalRows: 20, monitoringEnabled: true, sheetChecksEnabled: true,
    metricChecksEnabled: true, ...overrides
  };
}

async function setupHealthAdmin(sourceFixture, { delaySettings = false, globalChecksEnabled = false, historyFixture } = {}) {
  const harness = createHookHarness();
  const dirtyStates = new Map();
  const requests = [];
  const sources = sourceFixture || [
    makeSource('event-a', 'Event A', 'Actuals', 'stale', {
      lastError: 'The source timed out.', dimensionHealth: { status: 'disabled', findings: [] },
      metricChecksEnabled: false
    }),
    makeSource('event-a', 'Event A', 'Planned'),
    makeSource('event-b', 'Event B', 'Actuals')
  ];
  const history = historyFixture || Array.from({ length: 25 }, (_, index) => ({
    id: `history-${index}`,
    eventId: index % 2 ? 'event-b' : 'event-a',
    eventName: index % 2 ? 'Event B' : 'Event A',
    kind: 'Actuals',
    category: index < 13 ? 'metrics' : 'feed',
    status: index < 13 ? 'metric-discrepancy' : 'stale',
    message: `Issue ${index}`,
    openedAt: '2026-10-01T10:00:00.000Z',
    ...(index % 2 ? { resolvedAt: '2026-10-01T11:00:00.000Z', resolution: 'resolved' } : {})
  }));
  const dimensionSettings = {
    ...DEFAULT_DIMENSION_SETTINGS,
    metricChecksEnabled: globalChecksEnabled,
    dimensionChecksEnabled: globalChecksEnabled,
    enabledDimensions: [...DEFAULT_DIMENSION_SETTINGS.enabledDimensions],
    eventChecks: {}
  };
  let healthReads = 0;
  const pendingSettings = [];

  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).startsWith('/api/admin/events?')) {
      healthReads++;
      return { ok: true, json: async () => ({ success: true, sheetHealth: sources }) };
    }
    if (String(url) === '/api/admin/events' && options.method === 'POST') {
      return { ok: true, json: async () => ({ success: true }) };
    }
    if (String(url) === '/api/admin/health-notifications' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      return { ok: true, json: async () => ({
        success: true,
        settings: body.action === 'save' ? body.settings : undefined,
        emailConfigured: true,
        dimensionSettings
      }) };
    }
    if (String(url) === '/api/admin/health-notifications') {
      if (delaySettings) await new Promise(resolve => pendingSettings.push(resolve));
      return { ok: true, json: async () => ({
        success: true,
        settings: { ...DEFAULT_HEALTH_NOTIFICATION_SETTINGS, emailRecipients: [] },
        emailConfigured: true,
        history,
        dimensionSettings
      }) };
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const icon = () => null;
  const AdminTabs = ({ tabs, value, onChange, label }) => React.createElement(
    'nav',
    { 'aria-label': label },
    tabs.map(tab => React.createElement('button', {
      key: tab.id,
      type: 'button',
      'aria-current': value === tab.id ? 'page' : undefined,
      onClick: () => onChange(tab.id)
    }, tab.label))
  );
  const AdminUI = {
    AdminTabs,
    useAdminView(_key, initial) {
      return harness.hooks.useState(initial);
    },
    useAdminDirtyGuard(scope, dirty) {
      dirtyStates.set(scope, dirty);
    }
  };
  const overrides = {
    react: harness.hooks,
    'lucide-react': new Proxy({}, { get: () => icon }),
    '../../lib/firebase': { auth: { currentUser: null } },
    '../../lib/healthNotificationUtils.mjs': { DEFAULT_HEALTH_NOTIFICATION_SETTINGS, getHealthIssues },
    './DashboardFeatureContext': { useLowQuotaMode: () => false, useDashboardFeature: () => true },
    '../../lib/dimensionStandards.mjs': {
      DEFAULT_DIMENSION_SETTINGS,
      DIMENSIONS: [{ id: 'geo', label: 'Geo' }]
    },
    './DimensionFindings': ({ findings = [] }) => React.createElement(
      'div',
      null,
      findings.map((finding, index) => React.createElement('p', { key: index }, `${finding.label}: ${finding.values.join(', ')}`))
    ),
    './AdminUI': AdminUI
  };
  const source = await fs.readFile(new URL('../app/components/DataHealthAdmin.jsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true
  } }).outputText;
  const moduleObject = { exports: {} };
  vm.runInNewContext(compiled, {
    module: moduleObject, exports: moduleObject.exports,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    console, URL, URLSearchParams, fetch,
    window: { setInterval: () => 1, clearInterval() {} },
    document: { visibilityState: 'visible' }
  });
  const component = moduleObject.exports.default;
  const noop = () => {};
  const render = (props = {}) => expand(harness.render(component, {
    active: true,
    onIssueCountChange: noop,
    onDashboardAlertsEnabledChange: noop,
    ...props
  }));
  const settle = async () => {
    for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve));
  };
  await settle();
  const tree = render();
  await settle();
  return { tree, render, requests, dirtyStates, sources, history, healthReads: () => healthReads, settle, pendingSettings };
}

function byText(tree, type, text) {
  return nodes(tree, node => node.type === type && nodeText(node) === text)[0];
}

function section(tree, label) {
  return nodes(tree, node => node.type === 'section' && node.props['aria-label'] === label)[0];
}

function checkbox(tree, labelText) {
  const label = nodes(tree, node => node.type === 'label' && nodeText(node).includes(labelText))[0];
  return nodes(label, node => node.type === 'input' && node.props.type === 'checkbox')[0];
}

test('health monitor navigation shows all requested sections and inspect-only polling', async () => {
  const { tree, requests } = await setupHealthAdmin();
  const tabs = nodes(tree, node => node.type === 'button' && ['Overview', 'Events', 'Issue History', 'Settings'].includes(nodeText(node)));
  assert.deepEqual(tabs.map(tab => nodeText(tab)), ['Overview', 'Events', 'Issue History', 'Settings']);
  assert.ok(nodes(tree, node => node.type === 'h2' && nodeText(node).includes('Health Monitor')).length);
  const healthRequest = requests.find(request => request.url.startsWith('/api/admin/events?'));
  assert.equal(healthRequest.url, '/api/admin/events?inspectOnly=true');
  assert.doesNotMatch(healthRequest.url, /metadataOnly/);

  const route = await fs.readFile(new URL('../app/api/admin/events/route.js', import.meta.url), 'utf8');
  assert.match(route, /if \(!inspectOnly && uncachedSources\.length > 0 && sheetBaseUrl\)/);
});

test('issue history filters by category, event, and outcome and paginates retained entries', async () => {
  const { render } = await setupHealthAdmin();
  let tree = render();
  byText(tree, 'button', 'Issue History').props.onClick();
  tree = render();
  let historySection = section(tree, 'Issue history');
  let selectors = nodes(historySection, node => node.type === 'select');
  const category = selectors.find(select => nodes(select, option => nodeText(option) === 'Dimensions').length);
  category.props.onChange({ target: { value: 'metrics' } });
  tree = render();
  assert.ok(nodeText(tree).includes('1–13 of 13'));

  historySection = section(tree, 'Issue history');
  selectors = nodes(historySection, node => node.type === 'select');
  const event = selectors.find(select => nodes(select, option => nodeText(option) === 'Event B').length);
  event.props.onChange({ target: { value: 'Event B' } });
  tree = render();
  assert.ok(nodeText(tree).includes('1–6 of 6'));

  historySection = section(tree, 'Issue history');
  selectors = nodes(historySection, node => node.type === 'select');
  const outcome = selectors.find(select => nodes(select, option => nodeText(option) === 'Checks disabled').length);
  outcome.props.onChange({ target: { value: 'resolved' } });
  tree = render();
  assert.ok(nodeText(tree).includes('1–6 of 6'));

  historySection = section(tree, 'Issue history');
  const allCategory = nodes(historySection, node => node.type === 'select').find(select => nodes(select, option => nodeText(option) === 'Dimensions').length);
  allCategory.props.onChange({ target: { value: 'all' } });
  historySection = section(tree, 'Issue history');
  const allEvent = nodes(historySection, node => node.type === 'select').find(select => nodes(select, option => nodeText(option) === 'Event A').length);
  allEvent.props.onChange({ target: { value: 'all' } });
  historySection = section(tree, 'Issue history');
  const allOutcome = nodes(historySection, node => node.type === 'select').find(select => nodes(select, option => nodeText(option) === 'Checks disabled').length);
  allOutcome.props.onChange({ target: { value: 'all' } });
  tree = render();
  assert.ok(nodeText(tree).includes('1–20 of 25'));
  byText(tree, 'button', 'Next').props.onClick();
  tree = render();
  assert.ok(nodeText(tree).includes('21–25 of 25'));
});

test('overview summarizes dimension findings and filters/paginates active issues', async () => {
  const rawDetails = 'RAW_DIMENSION_VALUE_SHOULD_STAY_IN_EXPANDABLE_FINDINGS';
  const fixture = Array.from({ length: 12 }, (_, index) => makeSource(
    `dimension-event-${index}`,
    `Dimension Event ${String(index + 1).padStart(2, '0')}`,
    'Actuals',
    'healthy',
    {
      dimensionHealth: {
        status: 'checked',
        stale: false,
        findings: [{
          label: `Dimension ${index + 1}`,
          type: 'non-standard',
          count: index + 1,
          values: [rawDetails],
          sampleRows: [index + 2]
        }]
      }
    }
  ));
  const { render } = await setupHealthAdmin(fixture);
  let tree = render();
  const overview = section(tree, 'Health overview');
  assert.ok(nodeText(overview).includes('1–5 of 12 issues'));
  const firstCard = nodes(overview, node => node.type === 'li')[0];
  assert.equal(nodes(firstCard, node => node.type === 'p')[0].props.children, '1 dimension finding to review.');
  assert.ok(nodeText(firstCard).includes(rawDetails), 'full values remain available under expandable DimensionFindings details');

  byText(overview, 'button', 'Next issues').props.onClick();
  tree = render();
  assert.ok(nodeText(section(tree, 'Health overview')).includes('6–10 of 12 issues'));

  const overviewAfterPage = section(tree, 'Health overview');
  const eventFilter = nodes(overviewAfterPage, node => node.type === 'select')
    .find(select => nodes(select, option => nodeText(option) === 'Dimension Event 01').length);
  eventFilter.props.onChange({ target: { value: 'Dimension Event 12' } });
  tree = render();
  const filteredOverview = section(tree, 'Health overview');
  assert.ok(nodeText(filteredOverview).includes('1–1 of 1 issues'));
  assert.ok(nodeText(filteredOverview).includes('Dimension Event 12'));
  assert.ok(!nodes(filteredOverview, node => node.type === 'li').some(item => nodeText(item).includes('Dimension Event 06')));

  const categoryFilter = nodes(filteredOverview, node => node.type === 'select')
    .find(select => nodes(select, option => nodeText(option) === 'Dimensions').length);
  categoryFilter.props.onChange({ target: { value: 'feed' } });
  tree = render();
  assert.ok(nodeText(section(tree, 'Health overview')).includes('No issues match these filters.'));
});

test('SAIF dimension summaries stay concise in events and history with findings rendered once per area', async () => {
  const findings = ['Market', 'Language', 'Channel'].map((label, index) => ({
    label, type: 'non-standard', count: 100 + index,
    values: [`FULL_${label.toUpperCase()}_DETAIL`], sampleRows: [index + 2]
  }));
  const wall = findings.map(finding => `${finding.label}: non-standard, ${finding.count} rows (${finding.values.join(', ')})`).join('; ');
  const historyFixture = [{
    id: 'saif-dimensions', eventId: 'saif', eventName: 'SAIF', kind: 'Actuals',
    category: 'dimensions', status: 'dimension-discrepancy',
    dimensionFindings: findings, message: wall, openedAt: '2026-10-01T10:00:00.000Z'
  }];
  const { render } = await setupHealthAdmin([
    makeSource('saif', 'SAIF', 'Actuals', 'healthy', {
      dimensionHealth: { status: 'checked', findings, checkedAt: '2026-10-01T10:00:00.000Z' }
    })
  ], { historyFixture });
  let tree = render();
  byText(tree, 'button', 'Events').props.onClick();
  tree = render();
  const events = section(tree, 'Event health and controls');
  assert.ok(nodeText(events).includes('3 dimension findings to review.'));
  assert.ok(!nodeText(events).includes('Market: non-standard, 100 rows'), 'raw multi-dimension wall is not rendered as event summary');
  assert.equal((nodeText(events).match(/FULL_MARKET_DETAIL/g) || []).length, 1, 'source details contain findings only once');
  assert.ok(!nodeText(events).includes('checked · checked'));

  byText(tree, 'button', 'Issue History').props.onClick();
  tree = render();
  const history = section(tree, 'Issue history');
  assert.ok(nodeText(history).includes('3 dimension findings to review.'));
  assert.ok(!nodeText(history).includes(wall), 'history does not render the raw dimension wall');
  assert.equal((nodeText(history).match(/FULL_MARKET_DETAIL/g) || []).length, 1);
});

test('event list filters by search, source kind, and issue status while preserving both source kinds', async () => {
  const { render } = await setupHealthAdmin();
  let tree = render();
  byText(tree, 'button', 'Events').props.onClick();
  tree = render();
  const eventsSection = section(tree, 'Event health and controls');
  const search = nodes(eventsSection, node => node.type === 'input' && node.props.placeholder === 'Search name or ID')[0];
  search.props.onChange({ target: { value: 'Event A' } });
  tree = render();
  assert.ok(nodeText(section(tree, 'Event health and controls')).includes('Actuals: Serving saved data'));
  assert.ok(nodeText(section(tree, 'Event health and controls')).includes('Planned: Healthy'));

  let filters = nodes(section(tree, 'Event health and controls'), node => node.type === 'select');
  const kindFilter = filters.find(select => nodes(select, option => nodeText(option) === 'Planned').length);
  kindFilter.props.onChange({ target: { value: 'Planned' } });
  tree = render();
  assert.ok(nodeText(section(tree, 'Event health and controls')).includes('1 of 2 events'));

  filters = nodes(section(tree, 'Event health and controls'), node => node.type === 'select');
  const statusFilter = filters.find(select => nodes(select, option => nodeText(option) === 'Has active issue').length);
  statusFilter.props.onChange({ target: { value: 'issues' } });
  tree = render();
  assert.ok(nodeText(section(tree, 'Event health and controls')).includes('1 of 2 events'));
  assert.ok(nodeText(section(tree, 'Event health and controls')).includes('Event A'));
});

test('event controls report effective global disables and preserve dirty settings across tabs', async () => {
  const { render, dirtyStates } = await setupHealthAdmin();
  let tree = render();
  byText(tree, 'button', 'Settings').props.onClick();
  tree = render();
  const settingsSection = section(tree, 'Health monitor settings');
  const dashboardAlertsLabel = nodes(settingsSection, node => node.type === 'label' && nodeText(node).includes('Show in-dashboard alerts to admins'))[0];
  const dashboardAlerts = nodes(dashboardAlertsLabel, node => node.type === 'input')[0];
  for (const setting of [
    'Global checks and standards', 'Dimension standards', 'Enable metric health checks',
    'Enable dimension health checks', 'Notifications and email', 'Send resolution email',
    'Email metric issues', 'Email dimension issues', 'Email frequency', 'Alert delay',
    'Email recipients', 'Save notification settings', 'Send test email', 'Refresh standards'
  ]) assert.ok(nodeText(settingsSection).includes(setting), `settings preserve ${setting}`);
  assert.equal(dashboardAlerts.props.checked, true);
  dashboardAlerts.props.onChange({ target: { checked: false } });
  tree = render();
  assert.equal(dirtyStates.get('health-notifications'), true);

  const dimensionSection = section(tree, 'Health monitor settings');
  const geoLabel = nodes(dimensionSection, node => node.type === 'label' && nodeText(node).includes('Geo'))[0];
  const geoToggle = nodes(geoLabel, node => node.type === 'input')[0];
  geoToggle.props.onChange({ target: { checked: true } });
  tree = render();
  assert.equal(dirtyStates.get('health-standards'), true);
  await byText(tree, 'button', 'Refresh standards').props.onClick();
  tree = render();
  assert.equal(dirtyStates.get('health-standards'), true, 'refreshing remote standards does not clear unsaved dimension selections');

  byText(tree, 'button', 'Events').props.onClick();
  tree = render();
  assert.ok(nodeText(tree).includes('Metric checks are globally disabled.'));
  assert.ok(nodeText(tree).includes('Dimension checks are globally disabled.'));
  assert.ok(nodes(tree, node => node.type === 'input' && node.props.type === 'checkbox' && node.props['aria-label']?.includes('Monitor this event')).length >= 2);

  byText(tree, 'button', 'Settings').props.onClick();
  tree = render();
  const settingsAgain = section(tree, 'Health monitor settings');
  const dashboardToggle = nodes(settingsAgain, node => node.type === 'input' && node.props.type === 'checkbox')
    .find(input => input.props.checked === false);
  assert.ok(dashboardToggle, 'unsaved notification draft is retained when changing views');
  assert.equal(dirtyStates.get('health-notifications'), true);
});

test('refresh affected sources posts only source keys represented by active issues', async () => {
  const { render, requests, settle } = await setupHealthAdmin();
  const tree = render();
  const refresh = byText(tree, 'button', 'Refresh affected sources');
  assert.ok(refresh, 'the overview exposes a distinct affected-source action');
  await refresh.props.onClick();
  await settle();
  const refreshPosts = requests.filter(request => request.url === '/api/admin/events' && request.options.method === 'POST');
  assert.deepEqual(refreshPosts.map(request => JSON.parse(request.options.body)), [{
    action: 'refresh-sheet',
    eventId: 'event-a',
    kind: 'Actuals'
  }]);
});

test('inactive to active navigation retains all unsaved health settings without reloading saved defaults', async () => {
  const { render, settle, dirtyStates, requests } = await setupHealthAdmin(undefined, { globalChecksEnabled: true });
  let tree = render();
  checkbox(tree, 'Enable metric health checks').props.onChange({ target: { checked: false } });
  checkbox(tree, 'Enable dimension health checks').props.onChange({ target: { checked: false } });
  checkbox(tree, 'Geo').props.onChange({ target: { checked: true } });
  checkbox(tree, 'Show in-dashboard alerts to admins').props.onChange({ target: { checked: false } });
  nodes(tree, node => node.type === 'input' && node.props['aria-label'] === 'Event A: Monitor this event')[0].props.onChange({ target: { checked: false } });
  nodes(tree, node => node.type === 'input' && node.props.type === 'email')[0].props.onChange({ target: { value: 'draft@example.com' } });
  render();
  const settingsReadCount = requests.filter(request => request.url === '/api/admin/health-notifications').length;
  render({ active: false });
  render({ active: true });
  await settle();
  tree = render({ active: true });
  assert.equal(checkbox(tree, 'Enable metric health checks').props.checked, false);
  assert.equal(checkbox(tree, 'Enable dimension health checks').props.checked, false);
  assert.equal(checkbox(tree, 'Geo').props.checked, true);
  assert.equal(checkbox(tree, 'Show in-dashboard alerts to admins').props.checked, false);
  assert.equal(nodes(tree, node => node.props?.['aria-label'] === 'Event A: Monitor this event')[0].props.checked, false);
  assert.equal(nodes(tree, node => node.type === 'input' && node.props.type === 'email')[0].props.value, 'draft@example.com');
  for (const scope of ['health-notifications', 'health-standards', 'health-event-checks']) {
    assert.equal(dirtyStates.get(scope), true, `${scope} remains dirty after section navigation`);
  }
  assert.equal(requests.filter(request => request.url === '/api/admin/health-notifications').length, settingsReadCount, 'returning to a mounted page does not reload settings over drafts');
});

test('cancelled settings reads cannot overwrite drafts or commit stale responses after reactivation', async () => {
  const { render, settle, pendingSettings, dirtyStates } = await setupHealthAdmin(undefined, { delaySettings: true, globalChecksEnabled: true });
  let tree = render();
  assert.equal(pendingSettings.length, 1);
  render({ active: false });
  render({ active: true });
  await settle();
  assert.equal(pendingSettings.length, 2);
  tree = render();
  checkbox(tree, 'Enable metric health checks').props.onChange({ target: { checked: false } });
  checkbox(tree, 'Enable dimension health checks').props.onChange({ target: { checked: false } });
  checkbox(tree, 'Geo').props.onChange({ target: { checked: true } });
  checkbox(tree, 'Show in-dashboard alerts to admins').props.onChange({ target: { checked: false } });
  render();
  pendingSettings[1]();
  await settle();
  tree = render();
  assert.equal(checkbox(tree, 'Geo').props.checked, true);
  assert.equal(checkbox(tree, 'Show in-dashboard alerts to admins').props.checked, false);
  pendingSettings[0]();
  await settle();
  tree = render();
  assert.equal(checkbox(tree, 'Enable metric health checks').props.checked, false);
  assert.equal(checkbox(tree, 'Enable dimension health checks').props.checked, false);
  assert.equal(checkbox(tree, 'Geo').props.checked, true);
  assert.equal(checkbox(tree, 'Show in-dashboard alerts to admins').props.checked, false);
  assert.equal(dirtyStates.get('health-notifications'), true);
  assert.equal(dirtyStates.get('health-standards'), true);
});
