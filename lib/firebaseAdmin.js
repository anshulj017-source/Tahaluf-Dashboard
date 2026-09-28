import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function getFirebaseAdmin() {
  try {
    if (!getApps().length) {
      // Clean up the private key in case it was pasted with quotes or escaped newlines
      let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
      privateKey = privateKey.replace(/\\n/g, '\n').replace(/(^"|"$)/g, '');

      let projectId = process.env.FIREBASE_PROJECT_ID || '';
      projectId = projectId.replace(/(^"|"$)/g, '').trim();

      let clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
      clientEmail = clientEmail.replace(/(^"|"$)/g, '').trim();

      const serviceAccount = {
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey,
      };

      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    return {
      adminAuth: getAuth(),
      adminDb: getFirestore(),
    };
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
    throw error;
  }
}
