/**
 * صفحات تعرض شريط فلترة التاريخ — قوائم وتقارير فقط، وليس صفحات الإدخال.
 */
const EXACT_ALLOWLIST = new Set([
  '/projects',
  '/sales',
  '/clients',
  '/marketing',
  '/procurement',
  '/hr',
  '/finance',
  '/invoices',
]);

const PREFIX_ALLOWLIST = [
  '/finance/invoices',
  '/finance/journal',
  '/finance/vouchers',
  '/finance/reports',
  '/finance/client-accounts',
  '/finance/accounts',
  '/finance/cost-centers',
  '/settings/activity',
] as const;

/** مسارات إدخال/نماذج — لا يُعرض فيها شريط التاريخ أبداً */
const BLOCKED_PREFIXES = [
  '/projects/file',
  '/sales/client-basic-data',
  '/sales/client-quotation',
  '/finance/enterprise',
  '/finance/operations',
  '/settings/company',
  '/settings/users',
  '/settings/zatca',
  '/settings/building-code',
  '/settings/integrations',
  '/design',
] as const;

export function shouldShowDateFilterBar(pathname: string): boolean {
  for (const blocked of BLOCKED_PREFIXES) {
    if (pathname === blocked || pathname.startsWith(`${blocked}/`)) {
      return false;
    }
  }

  if (EXACT_ALLOWLIST.has(pathname)) return true;

  for (const prefix of PREFIX_ALLOWLIST) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  return false;
}
