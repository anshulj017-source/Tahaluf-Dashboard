import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { readAdminSetting, updateAdminSetting } from '../lib/adminSettingsStore.mjs';

const require = createRequire(import.meta.url);

async function loadInstrumentedModule(relativePath, overrides = {}, globals = {}) {
  const file = new URL(relativePath, import.meta.url);
  const source = await fs.readFile(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React }
  }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: sandboxModule, exports: sandboxModule.exports,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
    process, console, structuredClone, URL, setTimeout, clearTimeout, ...globals
  }, { filename: file.pathname });
  return sandboxModule.exports;
}

function mockRequest(url, method = 'GET', body = null, headers = {}) {
  return {
    url,
    method,
    json: async () => body,
    headers: {
      get: (h) => {
        const key = h.toLowerCase();
        if (key === 'host') return 'localhost:3000';
        if (key === 'x-admin-email') return headers['x-admin-email'] || 'admin@tahaluf.com';
        if (key === 'x-admin-role') return headers['x-admin-role'] || 'super_admin';
        return null;
      }
    }
  };
}

test('User Access Domain Rules and Audit History API', async (t) => {
  const initialSettings = await readAdminSetting('userAccessConfig', { domainRules: [], history: [] });

  t.after(async () => {
    await updateAdminSetting('userAccessConfig', initialSettings, () => initialSettings);
  });

  const mockUsers = [
    { uid: 'u1', email: 'alice@tahaluf.com', role: 'admin', lastSignInTime: '2026-10-30T10:00:00Z' },
    { uid: 'u2', email: 'bob@example.com', role: 'standard', lastSignInTime: '2026-10-30T11:00:00Z' }
  ];

  const mockDb = {
    collection: () => ({
      get: async () => ({
        docs: mockUsers.map(u => ({ id: u.uid, data: () => ({ ...u }) })),
        forEach: (fn) => mockUsers.forEach(u => fn({ id: u.uid, data: () => ({ ...u }) }))
      }),
      doc: (id) => ({
        get: async () => ({
          exists: true,
          data: () => mockUsers.find(u => u.uid === id) || { email: `${id}@example.com` }
        }),
        set: async (data, opts) => {
          const idx = mockUsers.findIndex(u => u.uid === id);
          if (idx >= 0) {
            mockUsers[idx] = { ...mockUsers[idx], ...data };
          } else {
            mockUsers.push({ uid: id, ...data });
          }
        },
        delete: async () => {
          const idx = mockUsers.findIndex(u => u.uid === id);
          if (idx >= 0) mockUsers.splice(idx, 1);
        }
      })
    })
  };

  const mockAuth = {
    listUsers: async () => ({
      users: mockUsers.map(u => ({
        uid: u.uid,
        email: u.email,
        metadata: { lastSignInTime: u.lastSignInTime }
      }))
    }),
    createUser: async ({ email }) => {
      const user = { uid: `new_${Date.now()}`, email, role: 'standard' };
      mockUsers.push(user);
      return user;
    },
    updateUser: async () => {},
    setCustomUserClaims: async () => {},
    deleteUser: async (uid) => {
      const idx = mockUsers.findIndex(u => u.uid === uid);
      if (idx >= 0) mockUsers.splice(idx, 1);
    }
  };

  const mockFirebase = {
    getFirebaseAdmin: () => ({ adminAuth: mockAuth, adminDb: mockDb })
  };

  const mockRequireAdmin = {
    isAdminRequest: async () => true,
    isSuperAdminRequest: async () => true
  };

  const { DEFAULT_FEATURE_CONFIG, isFeatureEnabled } = await import('../lib/dashboardFeatures.mjs');

  const route = await loadInstrumentedModule('../app/api/admin/users/route.js', {
    '../../../../lib/firebaseAdmin': mockFirebase,
    '../../../../lib/requireAdminRequest': mockRequireAdmin,
    '../../../../lib/adminSettingsStore.mjs': { readAdminSetting, updateAdminSetting },
    '../../../../lib/dashboardFeatures.mjs': { DEFAULT_FEATURE_CONFIG, isFeatureEnabled },
    'next/server': {
      NextResponse: {
        json: (data, init = {}) => ({
          status: init.status || 200,
          json: async () => data
        })
      }
    }
  });

  await t.test('GET returns users, domainRules, and history', async () => {
    const req = mockRequest('http://localhost:3000/api/admin/users');
    const res = await route.GET(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.users));
    assert.ok(Array.isArray(data.domainRules));
    assert.ok(Array.isArray(data.history));
  });

  await t.test('POST add_domain_rule adds rule and records history', async () => {
    const req = mockRequest('http://localhost:3000/api/admin/users', 'POST', {
      action: 'add_domain_rule',
      domain: '@testcorp.com',
      role: 'admin',
      description: 'Test corporate rule'
    });
    const res = await route.POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.domainRules.some(r => r.domain === '@testcorp.com' && r.role === 'admin'));

    const historyEntry = data.history.find(h => h.action === 'DOMAIN_RULE_ADD' && h.target === '@testcorp.com');
    assert.ok(historyEntry, 'History should log DOMAIN_RULE_ADD');
    assert.equal(historyEntry.author, 'admin@tahaluf.com');
  });

  await t.test('POST delete_domain_rule removes rule and records history', async () => {
    const req = mockRequest('http://localhost:3000/api/admin/users', 'POST', {
      action: 'delete_domain_rule',
      domain: '@testcorp.com'
    });
    const res = await route.POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(!data.domainRules.some(r => r.domain === '@testcorp.com'));

    const historyEntry = data.history.find(h => h.action === 'DOMAIN_RULE_DELETE' && h.target === '@testcorp.com');
    assert.ok(historyEntry, 'History should log DOMAIN_RULE_DELETE');
  });

  await t.test('PUT update role records ROLE_UPDATE in history and can be rolled back', async () => {
    const targetUser = mockUsers.find(u => u.uid === 'u2');
    const origRole = targetUser.role; // 'standard'
    const newRole = 'admin';

    // Update role
    const putReq = mockRequest('http://localhost:3000/api/admin/users', 'PUT', {
      uid: targetUser.uid,
      role: newRole
    });
    const putRes = await route.PUT(putReq);
    assert.equal(putRes.status, 200);

    // Verify history has ROLE_UPDATE
    const settings = await readAdminSetting('userAccessConfig', { domainRules: [], history: [] });
    const history = settings?.history || [];
    const roleHistory = history.find(h => h.action === 'ROLE_UPDATE' && h.target === targetUser.email);
    assert.ok(roleHistory, 'History should log ROLE_UPDATE');
    assert.equal(roleHistory.previousState?.role, origRole);
    assert.equal(roleHistory.newState?.role, newRole);

    // 1-Click Rollback
    const rollbackReq = mockRequest('http://localhost:3000/api/admin/users', 'POST', {
      action: 'rollback_history',
      historyId: roleHistory.id
    });
    const rollbackRes = await route.POST(rollbackReq);
    assert.equal(rollbackRes.status, 200);
    const rollbackData = await rollbackRes.json();
    assert.equal(rollbackData.success, true);

    // Verify mockUsers has reverted role
    assert.equal(targetUser.role, origRole, 'Role should be rolled back to original in storage');
  });
});
