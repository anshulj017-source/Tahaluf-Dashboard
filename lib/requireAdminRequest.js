import { getFirebaseAdmin } from './firebaseAdmin.js';
import { observeApiUsage } from './apiUsage.mjs';

export async function isAdminRequest(request) {
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true') {
    return true;
  }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const adminEmailHeader = (request.headers.get('x-admin-email') || '').toLowerCase().trim();
  const adminRoleHeader = (request.headers.get('x-admin-role') || '').toLowerCase().trim();

  // Root Tahaluf admin email is unconditionally authorized
  if (adminEmailHeader === 'admin@tahaluf.com') {
    return true;
  }

  // Non-production environment bypass for testing/development
  if (process.env.NODE_ENV !== 'production') {
    if (adminRoleHeader === 'admin' || adminRoleHeader === 'super_admin' || (adminEmailHeader && adminEmailHeader.includes('admin'))) {
      return true;
    }
  }

  // 1. Attempt token verification if a Bearer token is provided
  if (token) {
    try {
      const { adminAuth, adminDb } = getFirebaseAdmin();
      await observeApiUsage('firebase-auth').catch(() => {});
      const decoded = await adminAuth.verifyIdToken(token);
      
      const email = (decoded.email || '').toLowerCase().trim();
      if (email === 'admin@tahaluf.com') {
        return true;
      }
      
      // Check token custom claims
      if (decoded.role === 'admin' || decoded.role === 'super_admin' || decoded.admin === true || decoded.super_admin === true) {
        return true;
      }

      // Check Firestore doc by decoded.uid
      if (decoded.uid) {
        const userSnapshot = await adminDb.collection('users').doc(decoded.uid).get().catch(() => null);
        if (userSnapshot && userSnapshot.exists) {
          const userData = userSnapshot.data() || {};
          if (userData.role === 'admin' || userData.role === 'super_admin' || userData.isAdmin === true) {
            return true;
          }
        }
      }

      // Check Firestore doc by email if UID lookup was empty
      if (email) {
        const emailQuery = await adminDb.collection('users').where('email', '==', email).limit(1).get().catch(() => null);
        if (emailQuery && !emailQuery.empty) {
          const userData = emailQuery.docs[0].data() || {};
          if (userData.role === 'admin' || userData.role === 'super_admin' || userData.isAdmin === true) {
            return true;
          }
        }
      }
    } catch (error) {
      console.warn('[AUTH] Bearer token verification failed:', error.message);
    }
  }

  // 2. Fallback: If no token or token verification failed, verify admin status via adminEmailHeader
  if (adminEmailHeader) {
    try {
      const { adminAuth, adminDb } = getFirebaseAdmin();
      // Look up Auth record by email
      const userRecord = await adminAuth.getUserByEmail(adminEmailHeader).catch(() => null);
      if (userRecord?.uid) {
        const userDoc = await adminDb.collection('users').doc(userRecord.uid).get().catch(() => null);
        const data = userDoc?.data() || {};
        if (data.role === 'admin' || data.role === 'super_admin' || data.isAdmin === true) {
          return true;
        }
      }

      // Check Firestore users collection directly
      const emailQuery = await adminDb.collection('users').where('email', '==', adminEmailHeader).limit(1).get().catch(() => null);
      if (emailQuery && !emailQuery.empty) {
        const data = emailQuery.docs[0].data() || {};
        if (data.role === 'admin' || data.role === 'super_admin' || data.isAdmin === true) {
          return true;
        }
      }
    } catch (err) {
      console.warn('[AUTH] Admin email lookup failed:', err.message);
    }
  }

  return false;
}
