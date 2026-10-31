import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '../../../../lib/firebaseAdmin';
import { isAdminRequest, isSuperAdminRequest } from '../../../../lib/requireAdminRequest';
import { readAdminSetting, updateAdminSetting } from '../../../../lib/adminSettingsStore.mjs';
import { DEFAULT_FEATURE_CONFIG, isFeatureEnabled } from '../../../../lib/dashboardFeatures.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_USER_ACCESS_CONFIG = {
  domainRules: [
    { domain: '@tahaluf.com', role: 'admin', description: 'Internal Tahaluf team default role', createdAt: '2026-10-31T00:00:00.000Z' },
    { domain: '@informa.com', role: 'standard', description: 'Informa Group organization access', createdAt: '2026-10-31T00:00:00.000Z' }
  ],
  history: []
};

async function canAccessUserManagement(req) {
  const isSuper = await isSuperAdminRequest(req);
  try {
    const config = await readAdminSetting('dashboardFeatures', DEFAULT_FEATURE_CONFIG);
    const mode = config?.modes?.adminUsers ?? DEFAULT_FEATURE_CONFIG.modes.adminUsers ?? 'admin_only';
    if (mode === 'disabled') {
      return false;
    }
    if (mode === 'super_admin_only') {
      return isSuper;
    }
    const adminEmailHeader = (req.headers.get('x-admin-email') || '').toLowerCase().trim();
    const adminRoleHeader = (req.headers.get('x-admin-role') || '').toLowerCase().trim();
    const role = isSuper ? 'super_admin' : (adminRoleHeader || 'admin');

    const isAdm = isSuper || await isAdminRequest(req);
    if (!isAdm && mode === 'admin_only') {
      return false;
    }

    return isFeatureEnabled(config, 'adminUsers', role, false, adminEmailHeader);
  } catch (err) {
    console.warn('[AUTH] Fallback user management permission check:', err.message);
    return isSuper;
  }
}

async function appendUserAccessHistory(entry) {
  try {
    await updateAdminSetting('userAccessConfig', DEFAULT_USER_ACCESS_CONFIG, current => {
      const history = Array.isArray(current?.history) ? current.history : [];
      const updatedHistory = [{
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        ...entry
      }, ...history].slice(0, 50);
      return {
        ...current,
        history: updatedHistory
      };
    });
  } catch (err) {
    console.warn('[USER ACCESS] Failed to log history entry:', err.message);
  }
}

export async function GET(req) {
  try {
    if (!await canAccessUserManagement(req)) {
      return NextResponse.json({ error: 'Access restricted: user management is not permitted under active feature controls.' }, { status: 403 });
    }

    const { adminAuth, adminDb } = getFirebaseAdmin();
    const [listUsersResult, userAccessConfig] = await Promise.all([
      adminAuth.listUsers(1000),
      readAdminSetting('userAccessConfig', DEFAULT_USER_ACCESS_CONFIG).catch(() => DEFAULT_USER_ACCESS_CONFIG)
    ]);

    // Fetch all user roles from Firestore in a single query instead of sequential roundtrips
    const usersSnapshot = await adminDb.collection('users').get().catch(() => null);
    const userRolesMap = new Map();
    if (usersSnapshot && !usersSnapshot.empty) {
      usersSnapshot.forEach(doc => {
        userRolesMap.set(doc.id, doc.data());
      });
    }

    const users = listUsersResult.users.map(userRecord => {
      const userData = userRolesMap.get(userRecord.uid) || {};
      const role = userData.role || (userData.isAdmin ? 'admin' : 'standard');
      return {
        uid: userRecord.uid,
        email: userRecord.email,
        role,
        lastSignInTime: userData.lastActive || userRecord.metadata.lastSignInTime || null,
        creationTime: userRecord.metadata.creationTime || null,
      };
    });

    return NextResponse.json({ 
      users,
      domainRules: Array.isArray(userAccessConfig?.domainRules) ? userAccessConfig.domainRules : DEFAULT_USER_ACCESS_CONFIG.domainRules,
      history: Array.isArray(userAccessConfig?.history) ? userAccessConfig.history : []
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users: ' + error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    if (!await canAccessUserManagement(req)) {
      return NextResponse.json({ error: 'Access restricted: user creation is not permitted under active feature controls.' }, { status: 403 });
    }

    const adminEmail = (req.headers.get('x-admin-email') || '').toLowerCase().trim() || 'Admin';
    const body = await req.json();

    // 1. Action: Add / Update Domain Rule
    if (body.action === 'add_domain_rule') {
      const { domain, role: domainRole, description } = body;
      if (!domain || typeof domain !== 'string' || !domain.startsWith('@') || !domain.includes('.')) {
        return NextResponse.json({ error: 'Valid domain rule must start with @ (e.g. @company.com)' }, { status: 400 });
      }
      const cleanDomain = domain.toLowerCase().trim();
      const cleanRole = ['admin', 'standard', 'non-finance'].includes(domainRole) ? domainRole : 'standard';

      const updated = await updateAdminSetting('userAccessConfig', DEFAULT_USER_ACCESS_CONFIG, current => {
        const rules = Array.isArray(current?.domainRules) ? [...current.domainRules] : [...DEFAULT_USER_ACCESS_CONFIG.domainRules];
        const filtered = rules.filter(r => r.domain.toLowerCase().trim() !== cleanDomain);
        const newRule = {
          domain: cleanDomain,
          role: cleanRole,
          description: (description || '').trim() || `Auto-assign ${cleanRole} to ${cleanDomain}`,
          createdAt: new Date().toISOString()
        };
        const history = Array.isArray(current?.history) ? current.history : [];
        const historyEntry = {
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          author: adminEmail,
          action: 'DOMAIN_RULE_ADD',
          target: cleanDomain,
          details: `Added domain rule ${cleanDomain} with default role ${cleanRole}`,
          rule: newRule
        };
        return {
          ...current,
          domainRules: [newRule, ...filtered],
          history: [historyEntry, ...history].slice(0, 50)
        };
      });

      return NextResponse.json({ success: true, domainRules: updated.domainRules, history: updated.history });
    }

    // 2. Action: Delete Domain Rule
    if (body.action === 'delete_domain_rule') {
      const { domain } = body;
      const cleanDomain = (domain || '').toLowerCase().trim();
      const updated = await updateAdminSetting('userAccessConfig', DEFAULT_USER_ACCESS_CONFIG, current => {
        const rules = Array.isArray(current?.domainRules) ? [...current.domainRules] : [];
        const removedRule = rules.find(r => r.domain.toLowerCase().trim() === cleanDomain);
        const filtered = rules.filter(r => r.domain.toLowerCase().trim() !== cleanDomain);
        const history = Array.isArray(current?.history) ? current.history : [];
        const historyEntry = {
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          author: adminEmail,
          action: 'DOMAIN_RULE_DELETE',
          target: cleanDomain,
          details: `Deleted domain rule for ${cleanDomain}`,
          previousRule: removedRule
        };
        return {
          ...current,
          domainRules: filtered,
          history: [historyEntry, ...history].slice(0, 50)
        };
      });

      return NextResponse.json({ success: true, domainRules: updated.domainRules, history: updated.history });
    }

    // 3. Action: Rollback History Action
    if (body.action === 'rollback_history') {
      const actionId = body.actionId || body.historyId;
      const currentConfig = await readAdminSetting('userAccessConfig', DEFAULT_USER_ACCESS_CONFIG);
      const targetAction = (currentConfig.history || []).find(a => a.id === actionId);
      if (!targetAction) {
        return NextResponse.json({ error: 'Target history action not found' }, { status: 404 });
      }

      const { adminAuth, adminDb } = getFirebaseAdmin();

      // Rollback Role Update
      if (targetAction.action === 'ROLE_UPDATE' && targetAction.uid && targetAction.previousState?.role) {
        const targetUid = targetAction.uid;
        const restoredRole = targetAction.previousState.role;
        await adminDb.collection('users').doc(targetUid).set({
          role: restoredRole,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        await adminAuth.setCustomUserClaims(targetUid, {
          role: restoredRole,
          admin: restoredRole === 'super_admin' || restoredRole === 'admin',
          super_admin: restoredRole === 'super_admin'
        }).catch(() => {});
        await appendUserAccessHistory({
          author: adminEmail,
          action: 'ROLLBACK',
          target: targetAction.target,
          details: `Rolled back role change of ${targetAction.target} to ${restoredRole}`
        });
        return NextResponse.json({ success: true, message: `Rolled back role of ${targetAction.target} to ${restoredRole}` });
      }

      // Rollback Domain Rule Deletion
      if (targetAction.action === 'DOMAIN_RULE_DELETE' && targetAction.previousRule) {
        const ruleToRestore = targetAction.previousRule;
        const updated = await updateAdminSetting('userAccessConfig', DEFAULT_USER_ACCESS_CONFIG, current => {
          const rules = Array.isArray(current?.domainRules) ? [...current.domainRules] : [];
          const history = Array.isArray(current?.history) ? current.history : [];
          return {
            ...current,
            domainRules: [ruleToRestore, ...rules.filter(r => r.domain !== ruleToRestore.domain)],
            history: [{
              id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              timestamp: new Date().toISOString(),
              author: adminEmail,
              action: 'ROLLBACK',
              target: ruleToRestore.domain,
              details: `Restored domain rule ${ruleToRestore.domain}`
            }, ...history].slice(0, 50)
          };
        });
        return NextResponse.json({ success: true, domainRules: updated.domainRules, history: updated.history });
      }

      return NextResponse.json({ error: 'Cannot automatically roll back this type of action' }, { status: 400 });
    }

    // 4. Default: Create New User Account
    const { email, password, role } = body;
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const { adminAuth, adminDb } = getFirebaseAdmin();
    const normalizedEmail = email.toLowerCase().trim();
    const assignedRole = role || 'standard';

    if (assignedRole === 'super_admin' && !await isSuperAdminRequest(req)) {
      return NextResponse.json({ error: 'Super Admin access required to create Super Admin accounts.' }, { status: 403 });
    }

    const userRecord = await adminAuth.createUser({
      email: normalizedEmail,
      password,
    });

    await adminDb.collection('users').doc(userRecord.uid).set({
      email: normalizedEmail,
      role: assignedRole,
      createdAt: new Date().toISOString()
    });

    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: assignedRole,
      admin: assignedRole === 'super_admin' || assignedRole === 'admin',
      super_admin: assignedRole === 'super_admin'
    }).catch(() => {});

    await appendUserAccessHistory({
      author: adminEmail,
      action: 'USER_CREATE',
      target: normalizedEmail,
      details: `Created new user account with role ${assignedRole}`,
      role: assignedRole
    });

    return NextResponse.json({ success: true, uid: userRecord.uid, role: assignedRole });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    if (!await canAccessUserManagement(req)) {
      return NextResponse.json({ error: 'Access restricted: user modification is not permitted under active feature controls.' }, { status: 403 });
    }

    const adminEmail = (req.headers.get('x-admin-email') || '').toLowerCase().trim() || 'Admin';
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const { uid, role, password } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: 'UID is required' }, { status: 400 });
    }

    const userDoc = await adminDb.collection('users').doc(uid).get().catch(() => null);
    const prevRole = userDoc?.data()?.role || 'standard';
    const targetEmail = userDoc?.data()?.email || uid;

    if (role) {
      if (role === 'super_admin' && !await isSuperAdminRequest(req)) {
        return NextResponse.json({ error: 'Super Admin access required to assign Super Admin role.' }, { status: 403 });
      }

      await adminDb.collection('users').doc(uid).set({
        role: role,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Synchronize custom user claims on Firebase Auth
      await adminAuth.setCustomUserClaims(uid, {
        role: role,
        admin: role === 'super_admin' || role === 'admin',
        super_admin: role === 'super_admin'
      }).catch(() => {});

      await appendUserAccessHistory({
        author: adminEmail,
        action: 'ROLE_UPDATE',
        target: targetEmail,
        uid,
        details: `Changed role of ${targetEmail} from ${prevRole} to ${role}`,
        previousState: { role: prevRole },
        newState: { role }
      });
    }

    if (password) {
      await adminAuth.updateUser(uid, { password });
      await appendUserAccessHistory({
        author: adminEmail,
        action: 'PASSWORD_RESET',
        target: targetEmail,
        details: `Reset password for ${targetEmail}`
      });
    }

    return NextResponse.json({ success: true, role });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    if (!await canAccessUserManagement(req)) {
      return NextResponse.json({ error: 'Access restricted: user deletion is not permitted under active feature controls.' }, { status: 403 });
    }

    const adminEmail = (req.headers.get('x-admin-email') || '').toLowerCase().trim() || 'Admin';
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const { uid } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: 'UID is required' }, { status: 400 });
    }

    const userDoc = await adminDb.collection('users').doc(uid).get().catch(() => null);
    const targetEmail = userDoc?.data()?.email || uid;

    await adminAuth.deleteUser(uid);
    await adminDb.collection('users').doc(uid).delete();

    await appendUserAccessHistory({
      author: adminEmail,
      action: 'USER_DELETE',
      target: targetEmail,
      details: `Deleted user account ${targetEmail}`
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
