export const ROOT_ADMIN_EMAILS = new Set([
  'fehmatics@gmail.com',
  'analytics.ksa@umww.com',
  'anshul.jaiswal@omc.com',
  'anshulj017@gmail.com',
  'analyticsum2019@gmail.com'
]);

export const PROTECTED_SUPER_ADMINS = [
  { email: 'fehmatics@gmail.com', uid: 'root_super_admin_fehmatics', creationTime: '2026-01-01T00:00:00.000Z' },
  { email: 'analyticsum2019@gmail.com', uid: 'root_super_admin_analyticsum2019', creationTime: null }
];

export function isRootSuperAdmin(email) {
  if (!email || typeof email !== 'string') return false;
  return ROOT_ADMIN_EMAILS.has(email.toLowerCase().trim());
}

export function isProtectedSuperAdmin(email, uid) {
  const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
  return PROTECTED_SUPER_ADMINS.some(account => account.email === normalizedEmail || account.uid === uid);
}
