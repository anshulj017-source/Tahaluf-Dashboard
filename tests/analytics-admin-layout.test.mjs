import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await fs.readFile(new URL('../app/components/AnalyticsAdmin.jsx', import.meta.url), 'utf8');

async function harness({ snapshot = {}, lowQuota = false, active = true } = {}) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let tree;
  let props = { active };
  let failure = null;
  const requests = [];
  const timers = new Map();
  const dirtyStates = [];
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn, deps) {
      const index = cursor++;
      const old = slots[index];
      if (!old || !deps || deps.some((value, i) => value !== old.deps[i])) {
        effects.push(() => {
          old?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const adminUI = {
    AdminTabs: ({ tabs, value, onChange, label }) => React.createElement('nav', { 'aria-label': label },
      tabs.map(tab => React.createElement('button', { key: tab.id, onClick: () => onChange(tab.id), 'aria-current': value === tab.id ? 'page' : undefined }, tab.label))),
    useAdminView: (_key, initial) => hooks.useState(initial),
    useAdminDirtyGuard: (scope, dirty) => dirtyStates.push({ scope, dirty }),
  };
  const sandboxModule = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0, 'Analytics JSX parses');
  vm.runInNewContext(compiled.outputText, {
    module: sandboxModule, exports: sandboxModule.exports,
    require: name => name === 'react' ? hooks
      : name === '../../lib/firebase' ? { auth: { currentUser: null } }
        : name === './DashboardFeatureContext' ? { useLowQuotaMode: () => lowQuota }
          : name === './AdminUI' ? adminUI : require(name),
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    setInterval: (fn, delay) => { const id = timers.size + 1; timers.set(id, { fn, delay }); return id; },
    clearInterval: id => timers.delete(id),
    console: { error() {} },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (failure) throw new Error(failure);
      return { ok: true, json: async () => snapshot };
    },
  });
  const Component = sandboxModule.exports.default;
  function render(nextProps = {}) {
    props = { ...props, ...nextProps };
    cursor = 0;
    effects = [];
    tree = Component(props);
    for (const effect of effects) effect();
    return tree;
  }
  function nodes(node) {
    if (arguments.length === 0) node = tree;
    if (node == null || typeof node === 'boolean') return [];
    if (Array.isArray(node)) return node.flatMap(item => nodes(item));
    if (!React.isValidElement(node)) return [];
    if (typeof node.type === 'function' && node.type === adminUI.AdminTabs) return nodes(node.type(node.props));
    return [node, ...nodes(node.props.children)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join('');
    if (React.isValidElement(node)) return text(node.props.children);
    return node == null || typeof node === 'boolean' ? '' : String(node);
  }
  function button(label) {
    const node = nodes().find(item => item.type === 'button' && text(item).trim() === label);
    assert.ok(node, `Button exists: ${label}`);
    return node;
  }
  async function settle() {
    await new Promise(resolve => setImmediate(resolve));
    render();
  }
  render();
  await settle();
  return {
    requests, timers, dirtyStates, render, settle, button,
    html: () => renderToStaticMarkup(tree),
    nodes,
    fail: message => { failure = message; },
    click(label) { button(label).props.onClick(); render(); },
    input(label, value) {
      const node = nodes().find(item => item.props['aria-label'] === label);
      assert.ok(node, `Input exists: ${label}`);
      node.props.onChange({ target: { value } });
      render();
    },
  };
}

test('analytics defaults to overview, uses shared URL views and leaves missing duration unmeasured', async () => {
  const ui = await harness();
  assert.match(ui.html(), /Not measured/);
  assert.doesNotMatch(ui.html(), /7m 0s|58% Share|Live Sync/);
  assert.equal(ui.button('Overview').props['aria-current'], 'page');
  for (const label of ['Users', 'Activity', 'Performance', 'Recommendations', 'Optimizations & rollback']) ui.button(label);
  assert.match(source, /useAdminView\('analyticsView', 'overview', ANALYTICS_VIEWS\)/);
  assert.match(source, /useAdminDirtyGuard\('analytics'/);
  const zero = await harness({ snapshot: { kpis: { avgSessionDurationSec: 0, totalSessions: 1 } } });
  assert.match(zero.html(), />0s</);
});

test('empty sessions, absent dwell samples and absent latency samples stay unmeasured', async () => {
  const ui = await harness({ snapshot: {
    kpis: { avgSessionDurationSec: 0, totalSessions: 0 },
    tabUsage: [{ tab: 'summary', label: 'Summary' }],
    users: [{ email: 'measured@example.com', role: 'user', sessionCount: 0 }],
    performanceTelemetry: { avgApiLatencyMs: 0, sheetBreakdown: {} },
  } });
  assert.match(ui.html(), /Not measured/);
  assert.match(ui.html(), /Bounce not measured/);
  assert.doesNotMatch(ui.html(), /10% bounce|1m 0s/);
  ui.click('Performance');
  assert.match(ui.html(), /Avg Response: Not measured/);
  assert.doesNotMatch(ui.html(), /Avg Response: 0ms/);
  ui.click('Users');
  assert.match(ui.html(), /Sessions: 0/);
  assert.doesNotMatch(ui.html(), /2m 0s/);
});

test('scope coverage explains audience limits and bounded dated KPI history beside filters', async () => {
  const ui = await harness();
  for (const section of ['Overview', 'Users', 'Activity', 'Performance']) {
    ui.click(section);
    const markup = ui.html();
    assert.match(markup, /audience and specific-user filters apply to Users and Activity/);
    assert.match(markup, /performance and tab metrics remain retained all-user rollups/);
    assert.match(markup, /all-time view totals are not audience-filtered/);
    assert.match(markup, /Dated KPIs are calculated from bounded recent activity, not the full historical dataset/);
    assert.ok(markup.indexOf('Reset filters') < markup.indexOf('Scope coverage:'));
    assert.ok(markup.indexOf('Scope coverage:') < markup.indexOf('Last successful refresh:'));
  }
});

test('refresh click and silent polling expose failure without losing last successful data', async () => {
  const ui = await harness({ snapshot: { kpis: { totalViews: 123 } } });
  assert.equal(ui.requests.length, 1);
  assert.equal([...ui.timers.values()][0].delay, 30_000);
  ui.fail('Network offline');
  [...ui.timers.values()][0].fn();
  await ui.settle();
  assert.match(ui.html(), /Refresh failed: Network offline/);
  assert.match(ui.html(), /Showing stale data/);
  assert.match(ui.html(), /Last successful refresh:/);
  assert.match(ui.html(), />123</);
  ui.button('Refresh').props.onClick({ nativeEvent: 'must not become silent argument' });
  await ui.settle();
  assert.equal(ui.requests.length, 3);
  assert.match(ui.html(), /role="alert"/);
  assert.match(source, /onClick=\{\(\) => fetchAnalytics\(false\)\}/);
});

test('inactive analytics does not fetch or poll and retains selected section and filters', async () => {
  const ui = await harness();
  ui.click('Users');
  ui.input('Analytics audience', 'all');
  await ui.settle();
  const count = ui.requests.length;
  ui.render({ active: false });
  await ui.settle();
  assert.equal(ui.requests.length, count);
  assert.equal(ui.timers.size, 0);
  assert.match(ui.html(), /Polling paused: page inactive/);
  ui.render({ active: true });
  await ui.settle();
  assert.equal(ui.button('Users').props['aria-current'], 'page');
  assert.match(ui.requests.at(-1).url, /userRoleFilter=all/);
  assert.equal(ui.timers.size, 1);
  const inactive = await harness({ active: false });
  assert.equal(inactive.requests.length, 0);
  assert.equal(inactive.timers.size, 0);
});

test('low quota pauses automatic refresh without disabling manual refresh', async () => {
  const ui = await harness({ lowQuota: true });
  assert.equal(ui.timers.size, 0);
  assert.match(ui.html(), /Polling paused: low quota mode/);
  ui.click('Refresh');
  await ui.settle();
  assert.equal(ui.requests.length, 2);
});

test('activity searches and paginates only the existing analytics snapshot', async () => {
  const recentActivity = Array.from({ length: 60 }, (_, i) => ({
    id: `event-${i}`, userEmail: `person-${i}@example.com`, eventType: 'tab_view',
    tab: i === 55 ? 'special' : 'summary', timestamp: '2026-10-27T00:00:00Z',
  }));
  const ui = await harness({ snapshot: { recentActivity } });
  ui.click('Activity');
  assert.match(ui.html(), /Page 1 of 3/);
  assert.match(ui.html(), /person-0@example.com/);
  assert.doesNotMatch(ui.html(), /person-25@example.com/);
  ui.click('Next');
  assert.match(ui.html(), /Page 2 of 3/);
  assert.match(ui.html(), /person-25@example.com/);
  ui.input('Search activity', 'special');
  await ui.settle();
  assert.match(ui.html(), /person-55@example.com/);
  assert.match(ui.html(), /1 matching events/);
  assert.equal(ui.button('Next').props.disabled, true);
  ui.input('Search activity', 'not found');
  assert.match(ui.html(), /No activity matches your search/);
  assert.equal(ui.requests.length, 1, 'local searches do not create provider probes or polling');
});

test('catalog claims never count as runtime evidence and actions require confirmation', async () => {
  const fix = { id: 'fix-one', actionId: 'compact', title: 'Compact layout', category: 'ui_ux', status: 'active' };
  const ui = await harness({ snapshot: {
    monitoredFixes: [fix],
    catalog: { compact: { verificationProbe: { status: 'verified', latencyMs: 2 } } },
  } });
  ui.click('Optimizations & rollback');
  ui.click('Verification status');
  assert.match(ui.html(), /Runtime verification unavailable/);
  assert.doesNotMatch(ui.html(), /Runtime Probe Passed|2ms/);
  assert.equal(ui.requests.length, 1, 'verification availability does not issue a fake probe');
  ui.click('Revert Fix');
  assert.equal(ui.requests.length, 1, 'opening confirmation never mutates');
  assert.match(ui.html(), /Revert optimization\?/);
  const reason = ui.nodes().find(item => item.props.id === 'analytics-action-reason');
  reason.props.onChange({ target: { value: 'Investigate measured regression' } });
  ui.render();
  assert.equal(ui.dirtyStates.at(-1).dirty, true);
  ui.nodes().find(item => item.type === 'form').props.onSubmit({ preventDefault() {} });
  await ui.settle();
  const post = ui.requests.find(request => request.options.method === 'POST');
  const body = JSON.parse(post.options.body);
  assert.equal(body.operation, 'revert');
  assert.equal(body.reason, 'Investigate measured regression');
  assert.match(ui.html(), /Optimization reverted back to baseline/);
  assert.doesNotMatch(source, /\b(alert|confirm|prompt)\(|Math\.random/);
});

test('optimization execution failures remain visible as inline feedback', async () => {
  const ui = await harness({ snapshot: { monitoredFixes: [{
    id: 'fix-one', actionId: 'compact', title: 'Compact layout', category: 'ui_ux', status: 'active',
  }] } });
  ui.click('Optimizations & rollback');
  ui.click('Revert Fix');
  ui.fail('Mutation rejected');
  ui.nodes().find(item => item.type === 'form').props.onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.match(ui.html(), /role="alert"/);
  assert.match(ui.html(), /Action execution failed: Mutation rejected/);
  assert.doesNotMatch(ui.html(), /Optimization reverted back to baseline/);
});
