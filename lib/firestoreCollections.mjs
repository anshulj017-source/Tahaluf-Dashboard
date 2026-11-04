/**
 * Firestore Collection & Environment Isolation Resolver
 * 
 * Ensures Tahaluf Dashboard, Backup Mirror Dashboard, and other sibling projects
 * maintain 100% data and state isolation across runtime environments.
 */

export function isBackupInstance() {
  if (process.env.IS_BACKUP_DASHBOARD === 'true' || process.env.NEXT_PUBLIC_IS_BACKUP === 'true') {
    return true;
  }
  if (process.env.VERCEL_GIT_REPO_SLUG === 'backupdashboard') {
    return true;
  }
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL || '';
  if (vercelUrl.includes('backupdashboard')) {
    return true;
  }
  return false;
}

export function getFirestoreDatabaseId() {
  if (isBackupInstance() && process.env.BACKUP_FIRESTORE_DATABASE_ID) {
    return process.env.BACKUP_FIRESTORE_DATABASE_ID.trim();
  }
  return process.env.FIRESTORE_DATABASE_ID ? process.env.FIRESTORE_DATABASE_ID.trim() : undefined;
}

export function getCollectionPrefix() {
  // If explicitly overridden via environment variable, respect it unconditionally
  if (typeof process.env.FIRESTORE_COLLECTION_PREFIX === 'string' && process.env.FIRESTORE_COLLECTION_PREFIX.length > 0) {
    return process.env.FIRESTORE_COLLECTION_PREFIX;
  }

  // If running as backup mirror:
  // If a separate Firebase project is configured for backup, prefix is not strictly required but can still namespace if desired.
  // If sharing the Firebase project with production, automatically namespace collections with 'backup_'
  // to guarantee zero collision or cross-talk with production data.
  if (isBackupInstance()) {
    const hasDistinctBackupProject = Boolean(process.env.BACKUP_FIREBASE_PROJECT_ID);
    if (!hasDistinctBackupProject) {
      return 'backup_';
    }
  }

  return '';
}

export function getCollectionName(baseCollection) {
  const prefix = getCollectionPrefix();
  return `${prefix}${baseCollection}`;
}

