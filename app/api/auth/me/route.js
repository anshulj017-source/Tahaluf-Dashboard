import { NextResponse } from 'next/server';
import { getFirebaseAdmin } from '../../../../lib/firebaseAdmin.js';
import { isRootSuperAdmin } from '../../../../lib/authConstants.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    let email = (request.headers.get('x-admin-email') || '').toLowerCase().trim();
    let uid = '';

    if (token) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        uid = decoded.uid;
        if (decoded.email) {
          email = decoded.email.toLowerCase().trim();
        }
      } catch (e) {
        // Token verification failed or expired
      }
    }

    if (!email && !uid) {
      return NextResponse.json({ role: 'standard', email: '', authenticated: false });
    }

    // Root Tahaluf admin and verified super admin emails
    if (email === 'admin@tahaluf.com' || isRootSuperAdmin(email)) {
      return NextResponse.json({ role: 'super_admin', email, authenticated: true });
    }

    // Lookup user in Firebase Auth by email to get UID if not already present
    if (!uid && email) {
      const authUser = await adminAuth.getUserByEmail(email).catch(() => null);
      if (authUser?.uid) {
        uid = authUser.uid;
      }
    }

    // Lookup user in Firestore by UID
    if (uid) {
      const userDoc = await adminDb.collection('users').doc(uid).get().catch(() => null);
      if (userDoc && userDoc.exists) {
        const data = userDoc.data() || {};
        const role = data.role || (data.isAdmin ? 'admin' : 'standard');
        return NextResponse.json({ role, email, authenticated: true });
      }
    }

    // Lookup user in Firestore by Email if UID lookup didn't match
    if (email) {
      const emailQuery = await adminDb.collection('users').where('email', '==', email).limit(1).get().catch(() => null);
      if (emailQuery && !emailQuery.empty) {
        const data = emailQuery.docs[0].data() || {};
        const role = data.role || (data.isAdmin ? 'admin' : 'standard');
        return NextResponse.json({ role, email, authenticated: true });
      }
    }

    // Default: check domain rules before defaulting to standard
    const { readAdminSetting } = await import('../../../../lib/adminSettingsStore.mjs');
    const userAccessConfig = await readAdminSetting('userAccessConfig', { domainRules: [] }).catch(() => ({ domainRules: [] }));
    const domainRules = Array.isArray(userAccessConfig?.domainRules) ? userAccessConfig.domainRules : [];
    const matchedRule = domainRules.find(r => r.domain && email.endsWith(r.domain.toLowerCase().trim()));
    const assignedDefaultRole = matchedRule?.role || 'standard';

    if (uid && email) {
      await adminDb.collection('users').doc(uid).set({
        email,
        role: assignedDefaultRole,
        createdAt: new Date().toISOString(),
        assignedByDomainRule: matchedRule ? matchedRule.domain : null
      }, { merge: true }).catch(() => {});
    }

    return NextResponse.json({ role: assignedDefaultRole, email, authenticated: true });
  } catch (error) {
    console.warn('[AUTH ME] Error resolving role:', error.message);
    return NextResponse.json({ role: 'standard', error: error.message }, { status: 500 });
  }
}
