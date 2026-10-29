import { getFirebaseAdmin } from './firebaseAdmin.js';
import { observeApiUsage } from './apiUsage.mjs';

export async function isAdminRequest(request) {
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true') {
    return true;
  }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    if (process.env.NODE_ENV !== 'production') {
      const adminEmail = request.headers.get('x-admin-email');
      const adminRole = request.headers.get('x-admin-role');
      if (adminRole === 'admin' || adminRole === 'super_admin' || (adminEmail && adminEmail.toLowerCase().includes('admin'))) {
        return true;
      }
    }
    return false;
  }

  try {
    const { adminAuth, adminDb } = getFirebaseAdmin();
    await observeApiUsage('firebase-auth');
    const decoded = await adminAuth.verifyIdToken(token);
    const userSnapshot = await adminDb.collection('users').doc(decoded.uid).get();
    const userData = userSnapshot.exists ? userSnapshot.data() : {};
    return userData.role === 'admin' || userData.role === 'super_admin' || userData.isAdmin === true;
  } catch (error) {
    console.warn('[HEALTH NOTIFICATIONS] Admin authorization failed:', error.message);
    return false;
  }
}
