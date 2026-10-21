import { getFirebaseAdmin } from './firebaseAdmin.js';

export async function isAdminRequest(request) {
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true') {
    return true;
  }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return false;

  try {
    const { adminAuth, adminDb } = getFirebaseAdmin();
    const decoded = await adminAuth.verifyIdToken(token);
    const userSnapshot = await adminDb.collection('users').doc(decoded.uid).get();
    const userData = userSnapshot.exists ? userSnapshot.data() : {};
    return userData.role === 'admin' || userData.isAdmin === true;
  } catch (error) {
    console.warn('[HEALTH NOTIFICATIONS] Admin authorization failed:', error.message);
    return false;
  }
}
