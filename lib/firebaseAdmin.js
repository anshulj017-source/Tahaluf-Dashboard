import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { isBackupInstance, getFirestoreDatabaseId } from './firestoreCollections.mjs';

export function getFirebaseAdmin() {
  try {
    if (!getApps().length) {
      const isBackup = isBackupInstance();

      // Clean up the private key in case it was pasted with quotes or escaped newlines
      let privateKey = (isBackup && process.env.BACKUP_FIREBASE_PRIVATE_KEY)
        ? process.env.BACKUP_FIREBASE_PRIVATE_KEY
        : (process.env.FIREBASE_PRIVATE_KEY || '');
      privateKey = privateKey.replace(/\\n/g, '\n').replace(/(^"|"$)/g, '');

      let projectId = (isBackup && (process.env.BACKUP_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_BACKUP_FIREBASE_PROJECT_ID))
        ? (process.env.BACKUP_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_BACKUP_FIREBASE_PROJECT_ID)
        : (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '');
      projectId = projectId.replace(/(^"|"$)/g, '').trim();

      let clientEmail = (isBackup && process.env.BACKUP_FIREBASE_CLIENT_EMAIL)
        ? process.env.BACKUP_FIREBASE_CLIENT_EMAIL
        : (process.env.FIREBASE_CLIENT_EMAIL || '');
      clientEmail = clientEmail.replace(/(^"|"$)/g, '').trim();

      const serviceAccount = {
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey,
      };

      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    const databaseId = getFirestoreDatabaseId();
    const adminDb = databaseId ? getFirestore(databaseId) : getFirestore();

    return {
      adminAuth: getAuth(),
      adminDb,
    };
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
    throw error;
  }
}
