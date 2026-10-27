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
