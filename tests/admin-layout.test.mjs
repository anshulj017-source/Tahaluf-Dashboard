import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { summarizeApiUsage } from '../lib/apiUsage.mjs';

const require = createRequire(import.meta.url);
async function load(file, overrides = {}, globals = {}) {
  const source = await fs.readFile(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true
  } }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: sandboxModule, exports: sandboxModule.exports, require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    console, URL, URLSearchParams, ...globals
  });
  return sandboxModule.exports;
}

function hookHarness() {
  const values = [];
  const dependencies = [];
  let cursor = 0;
  let pending = [];
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) {
        dependencies[index] = deps;
        pending.push(callback);
      }
    }
  };
  return { hooks, render(component, props) {
    cursor = 0;
    const tree = component(props);
    pending.forEach(callback => callback());
    pending = [];
    return tree;
  } };
}

function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

test('User Access is the default and pagination appears once below the user table only for multiple pages', async () => {
  for (const count of [0, 1, 20, 21, 41]) {
    const users = Array.from({ length: count }, (_, index) => ({
      uid: `user-${index}`, email: `user${index}@example.test`, role: 'standard'
    }));
    const harness = hookHarness();
    let defaultSection;
    const stub = () => null;
    const component = await load('../app/AdminView.jsx', {
      react: {
        ...harness.hooks,
        useState: initial => harness.hooks.useState(Array.isArray(initial) ? users : initial),
        useEffect() {}
      },
      './components/EventsAdmin': stub,
      './components/DataHealthAdmin': stub,
      './components/AnalyticsAdmin': stub,
      './components/ApiQuotasAdmin': stub,
      './components/FeatureControlsAdmin': stub,
      './components/AdminUI': {
        AdminDialog: stub, useAdminDirtyGuard() {},
        useAdminView: (_, initial) => { defaultSection = initial; return [initial, () => {}]; }
      }
    });
    const render = () => harness.render(component.default, {});
    let tree = render();
    assert.equal(defaultSection, 'users');
    let pagination = nodes(tree, node => node.props?.['aria-label'] === 'User list pagination');
    assert.equal(pagination.length, count > 20 ? 1 : 0, `${count} users`);
    const table = nodes(tree, node => node.type === 'table')[0];
    assert.equal(nodes(table, node => node.type === 'button' && ['Next', 'Previous'].includes(node.props.children)).length, 0, 'pagination never appears inside a user row');
    assert.equal(nodes(table, node => node.type === 'tr').length, 1 + Math.max(1, Math.min(count, 20)));
    if (count > 20) {
      const buttons = nodes(pagination[0], node => node.type === 'button');
      assert.equal(buttons[0].props.disabled, true);
      buttons[1].props.onClick();
      tree = render();
      pagination = nodes(tree, node => node.props?.['aria-label'] === 'User list pagination');
      assert.equal(nodes(pagination[0], node => node.type === 'button')[0].props.disabled, false);
      assert.equal(nodes(nodes(tree, node => node.type === 'table')[0], node => node.type === 'tr').length, 1 + Math.min(count - 20, 20));
      nodes(tree, node => node.type === 'input' && node.props.type === 'search')[0].props.onChange({ target: { value: 'no-matching-user' } });
      assert.equal(nodes(render(), node => node.props?.['aria-label'] === 'User list pagination').length, 0, 'search removes unnecessary pagination');
    }
  }
});

test('API selections survive refreshes and discard restores the latest saved settings', async () => {
  const harness = hookHarness();
  let dirty = false;
  const component = await load('../app/components/ApiUsageAnalytics.jsx', {
    react: harness.hooks, '../../lib/firebase': { auth: {} },
    './AdminUI': { useAdminDirtyGuard: (_, value) => { dirty = value; } }
  });
  const report = summarizeApiUsage({ startedAt: null, days: {} });
  report.availableServices = report.services;
  report.monitoredServices = report.services.map(service => service.id);
  const render = next => {
    harness.render(component.default, { report: next, view: 'alerts' });
    return harness.render(component.default, { report: next, view: 'alerts' });
  };
  let tree = render(report);
  const alertLabel = `${report.services[0].name} 70% alerts`;
  nodes(tree, node => node.props?.['aria-label'] === alertLabel)[0].props.onChange({ target: { checked: false } });
  tree = render({ ...report });
  assert.equal(nodes(tree, node => node.props?.['aria-label'] === alertLabel)[0].props.checked, false);
  assert.equal(dirty, true);
  const serviceBoxes = nodes(tree, node => node.type === 'input' && node.props.type === 'checkbox' && !node.props['aria-label']);
  serviceBoxes[0].props.onChange({ target: { checked: false } });
  tree = render({ ...report });
  assert.equal(nodes(tree, node => node.type === 'input' && node.props.type === 'checkbox' && !node.props['aria-label'])[0].props.checked, false);
  nodes(tree, node => node.type === 'button' && node.props.children === 'Discard changes')[0].props.onClick();
  tree = render({ ...report });
  assert.equal(nodes(tree, node => node.props?.['aria-label'] === alertLabel)[0].props.checked, true);
  assert.equal(dirty, false);
});

test('API budget settings include unmonitored services and preserve numeric drafts on refresh', async () => {
  const harness = hookHarness();
  const component = await load('../app/components/ApiUsageAnalytics.jsx', {
    react: harness.hooks, '../../lib/firebase': { auth: {} }, './AdminUI': { useAdminDirtyGuard() {} }
  });
  const all = summarizeApiUsage({ startedAt: null, days: {} });
  const report = { ...all, availableServices: all.services, services: [], monitoredServices: [] };
  const render = next => {
    harness.render(component.default, { report: next, view: 'alerts' });
    return harness.render(component.default, { report: next, view: 'alerts' });
  };
  let tree = render(report);
  nodes(tree, node => node.type === 'button' && node.props.children === 'Configure rates & budgets')[0].props.onClick();
  tree = render(report);
  const label = `${all.services[0].name} Monthly budget USD`;
  const field = nodes(tree, node => node.props?.['aria-label'] === label)[0];
  assert.ok(field, 'disabled monitoring does not hide budget settings');
  field.props.onChange({ target: { value: '123' } });
  tree = render({ ...report });
  assert.equal(nodes(tree, node => node.props?.['aria-label'] === label)[0].props.value, 123);
});

test('a saved API draft is retained with explicit error when the follow-up report refresh fails', async () => {
  const harness = hookHarness();
  let dirty = false;
  const component = await load('../app/components/ApiUsageAnalytics.jsx', {
    react: harness.hooks, '../../lib/firebase': { auth: {} },
    './AdminUI': { useAdminDirtyGuard: (_, value) => { dirty = value; } }
  }, { fetch: async () => ({ ok: true, json: async () => ({ success: true }) }) });
  const report = summarizeApiUsage({ startedAt: null, days: {} });
  report.availableServices = report.services;
  report.monitoredServices = report.services.map(service => service.id);
  const render = () => {
    const props = { report, view: 'alerts', onSaved: async () => { throw new Error('Refresh unavailable'); } };
    harness.render(component.default, props);
    return harness.render(component.default, props);
  };
  let tree = render();
  const label = `${report.services[0].name} 70% alerts`;
  nodes(tree, node => node.props?.['aria-label'] === label)[0].props.onChange({ target: { checked: false } });
  tree = render();
  await nodes(tree, node => node.type === 'button' && node.props.children === 'Save alert selections')[0].props.onClick();
  tree = render();
  assert.equal(dirty, true);
  assert.equal(nodes(tree, node => node.props?.['aria-label'] === label)[0].props.checked, false);
  assert.match(nodes(tree, node => node.props?.role === 'alert')[0].props.children, /Settings were saved.*report could not refresh.*draft has been retained/);
  assert.equal(nodes(tree, node => node.props?.role === 'status' && typeof node.props.children === 'string').length, 0, 'no success-only message on a partial failure');
});

test('shared tabs expose the selected page without inaccessible tab roles', async () => {
  const { AdminTabs } = await load('../app/components/AdminUI.jsx');
  const html = renderToStaticMarkup(React.createElement(AdminTabs, {
    tabs: [{ id: 'overview', label: 'Overview' }, { id: 'settings', label: 'Settings' }],
    value: 'overview', onChange() {}
  }));
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.ok(html.includes('aria-label="Page sections"'));
});

test('admin section URL state preserves unrelated filters and rejects invalid views', async () => {
  const harness = hookHarness();
  const listeners = {};
  const window = {
    location: { href: 'http://localhost:3000/?admin=health&event=GSTS', search: '?admin=health&event=GSTS' },
    history: { replaceState: (_, __, url) => { window.location.href = String(url); window.location.search = url.search; } },
    addEventListener: (name, callback) => { listeners[name] = callback; },
    removeEventListener() {}
  };
  const { useAdminView } = await load('../app/components/AdminUI.jsx', { react: harness.hooks }, { window });
  const render = () => harness.render(() => useAdminView('admin', 'events', ['events', 'health']));
  render();
  let [value, update] = render();
  assert.equal(value, 'health');
  update('invalid');
  assert.equal(render()[0], 'health');
  update('events');
  assert.equal(new URL(window.location.href).searchParams.get('event'), 'GSTS');
  window.location.search = '?admin=invalid';
  listeners.popstate();
  assert.equal(render()[0], 'events');
});

test('dirty settings notify the shell, block tab close and clean up their listeners', async () => {
  const events = [];
  const listeners = {};
  let cleanup;
  const window = {
    dispatchEvent: event => { events.push(event.detail); },
    addEventListener: (name, callback) => { listeners[name] = callback; },
    removeEventListener: name => { delete listeners[name]; }
  };
  const { useAdminDirtyGuard } = await load('../app/components/AdminUI.jsx', {
    react: { ...React, useEffect: callback => { cleanup = callback(); } }
  }, { window, CustomEvent: class { constructor(type, options) { this.detail = options.detail; } } });
  useAdminDirtyGuard('test-settings', true);
  assert.equal(events[0].dirty, true);
  let blocked = false;
  const event = { preventDefault: () => { blocked = true; } };
  listeners.beforeunload(event);
  assert.equal(blocked, true);
  assert.equal(event.returnValue, '');
  cleanup();
  assert.equal(events.at(-1).dirty, false);
  assert.equal(listeners.beforeunload, undefined);
});

test('admin dialogs support Escape and preserve native focus trapping', async () => {
  let modalOpened = false;
  let closed = false;
  const { AdminDialog } = await load('../app/components/AdminUI.jsx', {
    react: { ...React, useRef: () => ({ current: { showModal: () => { modalOpened = true; } } }), useEffect: callback => callback() }
  });
  const element = AdminDialog({ title: 'Confirm', onClose: () => { closed = true; } });
  assert.equal(modalOpened, true);
  assert.equal(element.type, 'dialog');
  element.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(closed, true);
});

test('importing an event backup does not write until confirmation and surfaces parse errors', async () => {
  const source = await fs.readFile(new URL('../app/components/EventsAdmin.jsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('EventsAdmin.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const handlers = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['handleImportJson', 'importBackup'].includes(node.name.getText(parsed))) handlers[node.name.getText(parsed)] = node.initializer.getText(parsed);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  let reader;
  let writes = 0;
  let error;
  const context = {
    console: { error() {} },
    FileReader: function () { reader = { readAsText() {} }; return reader; },
    setPendingImport: next => { context.pendingImport = next; },
    setError: next => { error = next; },
    setSaving() {}, setConfig() {}, setEvents() {}, setHistory() {}, showNotification() {},
    currentAuthor: 'admin@example.test',
    fetch: async (_, options) => {
      writes++;
      assert.equal(JSON.parse(options.body).action, 'import');
      return { ok: true, json: async () => ({ success: true, config: { events: [] }, history: [] }) };
    }
  };
  const handleImport = vm.runInNewContext(`(${handlers.handleImportJson})`, context);
  handleImport({ target: { files: [{}], value: 'backup.json' } });
  reader.onload({ target: { result: '{"events":[]}' } });
  assert.equal(writes, 0, 'choosing a file only stages it for review');
  assert.equal(context.pendingImport.events.length, 0);
  await vm.runInNewContext(`(${handlers.importBackup})()`, context);
  assert.equal(writes, 1);
  handleImport({ target: { files: [{}], value: 'invalid.json' } });
  reader.onload({ target: { result: '{invalid' } });
  assert.match(error, /Failed to read configuration/);
  assert.equal(writes, 1);
});

test('Admin section navigation is responsive with custom dropdown on mobile, 2-line layout on medium, and vertical on desktop', async () => {
  const harness = hookHarness();
  const stub = () => null;
  const component = await load('../app/AdminView.jsx', {
    react: { ...harness.hooks, useEffect() {} },
    './components/EventsAdmin': stub,
    './components/DataHealthAdmin': stub,
    './components/AnalyticsAdmin': stub,
    './components/ApiQuotasAdmin': stub,
    './components/FeatureControlsAdmin': stub,
    './components/AdminUI': {
      AdminDialog: stub, useAdminDirtyGuard() {},
      useAdminView: (_, initial) => [initial, () => {}]
    }
  });
  const tree = harness.render(component.default, {});
  const nav = nodes(tree, node => node.props?.['aria-label'] === 'Admin sections')[0];
  assert.ok(nav, 'Admin sections navigation must be present');

  // Verify responsive tiers exist in navigation structure:
  // 1. Mobile custom dropdown (< sm)
  const mobileDropdownContainer = nodes(nav, node => node.props?.className?.includes('sm:hidden'))[0];
  assert.ok(mobileDropdownContainer, 'Mobile custom dropdown container (< sm) must be present');
  const dropdownTrigger = nodes(mobileDropdownContainer, node => node.type === 'button' && node.props?.['aria-label'] === 'Admin section selection')[0];
  assert.ok(dropdownTrigger, 'Mobile custom dropdown trigger button must be present');

  // 2. Medium 2-line grid layout (sm to lg)
  const mediumGridContainer = nodes(nav, node => node.props?.className?.includes('grid-cols-3'))[0];
  assert.ok(mediumGridContainer, 'Medium 2-line grid container (grid-cols-3) must be present for tablets without horizontal scrolling');

  // 3. Desktop vertical column (>= lg)
  const desktopSidebarContainer = nodes(nav, node => node.props?.className?.includes('flex-col'))[0];
  assert.ok(desktopSidebarContainer, 'Desktop sidebar container (flex-col) must be present');

  // All 6 sections exist as accessible buttons in the desktop and medium layouts
  const mediumButtons = nodes(mediumGridContainer, node => node.type === 'button');
  assert.equal(mediumButtons.length, 6, 'all 6 admin sections must be rendered as accessible buttons in medium 2-line layout');

  const desktopButtons = nodes(desktopSidebarContainer, node => node.type === 'button');
  assert.equal(desktopButtons.length, 6, 'all 6 admin sections must be rendered as accessible buttons in desktop layout');
});

test('Regular Admin cannot view or change user roles and cannot access User Access section when restricted by Feature Controls', async () => {
  const harness = hookHarness();
  const stub = () => null;
  let activeSectionState = 'users';
  const component = await load('../app/AdminView.jsx', {
    react: { ...harness.hooks, useEffect() {} },
    './components/EventsAdmin': stub,
    './components/DataHealthAdmin': stub,
    './components/AnalyticsAdmin': stub,
    './components/ApiQuotasAdmin': stub,
    './components/FeatureControlsAdmin': stub,
    './components/AdminUI': {
      AdminDialog: stub, useAdminDirtyGuard() {},
      useAdminView: (_, initial) => [activeSectionState, (s) => { activeSectionState = s; }]
    }
  });

  // Render AdminView with userRole='admin' and isFeatureAllowed denying adminUsers
  const tree = harness.render(component.default, { 
    userRole: 'admin',
    isFeatureAllowed: (id) => id !== 'adminUsers'
  });
  const nav = nodes(tree, node => node.props?.['aria-label'] === 'Admin sections')[0];
  assert.ok(nav, 'Admin sections navigation must be present');

  // Verify only operational sections are available (events, health, quotas, analytics)
  // Both 'features' and 'users' must be excluded
  const buttons = nodes(nav, node => node.type === 'button' && typeof node.props?.children === 'string');
  const sectionLabels = buttons.map(b => b.props.children);
  assert.ok(!sectionLabels.some(l => l.includes('User Access')), 'User Access must NOT be visible when restricted');
  assert.ok(!sectionLabels.some(l => l.includes('Feature Controls')), 'Feature Controls must NOT be visible to regular admin');

  // When activeSection is forced to 'users', verify Access Restricted warning is shown
  const headings = nodes(tree, node => node.type === 'h3').map(h => h.props?.children);
  assert.ok(headings.includes('Access Restricted'), 'Accessing restricted users section shows Access Restricted message');
  const tables = nodes(tree, node => node.type === 'table');
  assert.equal(tables.length, 0, 'No user roster table is rendered when restricted');
});

test('Regular Admin can access User Access section when permitted by Feature Controls', async () => {
  const harness = hookHarness();
  const stub = () => null;
  let activeSectionState = 'users';
  const component = await load('../app/AdminView.jsx', {
    react: { ...harness.hooks, useEffect() {} },
    './components/EventsAdmin': stub,
    './components/DataHealthAdmin': stub,
    './components/AnalyticsAdmin': stub,
    './components/ApiQuotasAdmin': stub,
    './components/FeatureControlsAdmin': stub,
    './components/AdminUI': {
      AdminDialog: stub, useAdminDirtyGuard() {},
      useAdminView: (_, initial) => [activeSectionState, (s) => { activeSectionState = s; }]
    }
  });

  // Render AdminView with userRole='admin' and isFeatureAllowed permitting adminUsers
  const tree = harness.render(component.default, { 
    userRole: 'admin',
    isFeatureAllowed: (id) => id === 'adminUsers' || id === 'adminEvents'
  });
  const nav = nodes(tree, node => node.props?.['aria-label'] === 'Admin sections')[0];
  assert.ok(nav, 'Admin sections navigation must be present');

  const spans = nodes(nav, node => node.type === 'span' && typeof node.props?.children === 'string');
  const sectionLabels = spans.map(b => b.props.children);
  assert.ok(sectionLabels.some(l => l.includes('User Access')), 'User Access IS visible when permitted by feature controls');
});

test('Back to Dashboard button in AdminView clears admin search param and navigates to summary', async () => {
  const harness = hookHarness();
  const stub = () => null;
  let navigatedTarget = null;
  let windowHref = 'http://localhost:3000/?admin=users';
  const mockWindow = {
    location: {
      href: windowHref,
      search: '?admin=users',
      pathname: '/'
    },
    history: {
      replaceState: (_state, _title, url) => {
        windowHref = typeof url === 'string' ? url : url.toString();
        mockWindow.location.href = windowHref;
        mockWindow.location.search = new URL(windowHref, 'http://localhost:3000').search;
      }
    }
  };

  const component = await load('../app/AdminView.jsx', {
    react: { ...harness.hooks, useEffect() {} },
    './components/EventsAdmin': stub,
    './components/DataHealthAdmin': stub,
    './components/AnalyticsAdmin': stub,
    './components/ApiQuotasAdmin': stub,
    './components/FeatureControlsAdmin': stub,
    './components/AdminUI': {
      AdminDialog: stub, useAdminDirtyGuard() {},
      useAdminView: (_, initial) => [initial, () => {}]
    }
  }, { window: mockWindow });

  const tree = harness.render(component.default, {
    userRole: 'super_admin',
    onNavigate: target => { navigatedTarget = target; }
  });

  const buttons = nodes(tree, node => node.type === 'button');
  const backButtons = buttons.filter(b => {
    const textNodes = nodes(b, n => typeof n === 'string' || (n.type === 'span' && typeof n.props?.children === 'string'));
    return textNodes.some(t => (t.props?.children || t) === 'Back to Dashboard');
  });

  assert.ok(backButtons.length >= 1, 'At least one Back to Dashboard button must be rendered');
  // Trigger click on Back to Dashboard button
  backButtons[0].props.onClick();
  assert.equal(navigatedTarget, 'summary', 'Clicking Back to Dashboard must trigger navigation to summary view');
  assert.ok(!new URL(mockWindow.location.href, 'http://localhost:3000').searchParams.has('admin'), 'admin search param must be removed from URL');
});
