export const ROOT_ADMIN_EMAILS = new Set([
  'admin@tahaluf.com',
  'analytics.ksa@umww.com',
  'anshul.jaiswal@omc.com',
  'anshulj017@gmail.com',
  'analyticsum2019@gmail.com'
]);

export function isRootSuperAdmin(email) {
  if (!email || typeof email !== 'string') return false;
  return ROOT_ADMIN_EMAILS.has(email.toLowerCase().trim());
}

