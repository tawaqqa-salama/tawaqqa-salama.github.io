import type { ActivityActionType } from '@/lib/activity/types';

export const ACTIVITY_ACTION_LABELS: Record<ActivityActionType, string> = {
  LOGIN: 'تسجيل دخول',
  LOGOUT: 'تسجيل خروج',
  VIEW_PAGE: 'تصفح صفحة',
  CREATE: 'إنشاء',
  UPDATE: 'تعديل',
  DELETE: 'حذف',
  PRINT: 'طباعة',
  EXPORT: 'تصدير',
  ARCHIVE: 'أرشفة',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير',
  manager: 'مدير',
  engineer: 'مهندس',
  sales: 'مبيعات',
  accountant: 'محاسب',
  finance: 'مالية',
  data_entry: 'مدخل بيانات',
  clerk: 'مدخل بيانات',
  hr: 'موارد بشرية',
};

export function roleLabel(roleCode: string | null | undefined): string {
  if (!roleCode) return '—';
  return ROLE_LABELS[roleCode] || roleCode;
}

export function moduleFromPath(pathname: string): string {
  if (!pathname || pathname === '/') return 'home';
  if (pathname.startsWith('/me')) return 'home';
  if (pathname.startsWith('/marketing')) return 'marketing';
  if (pathname.startsWith('/sales')) return 'sales';
  if (pathname.startsWith('/procurement')) return 'procurement';
  if (pathname.startsWith('/finance')) return 'finance';
  if (pathname.startsWith('/hr')) return 'hr';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/login')) return 'auth';
  if (pathname.startsWith('/u')) return 'employee';
  return pathname.split('/').filter(Boolean)[0] || 'app';
}

export const MODULE_LABELS: Record<string, string> = {
  home: 'الصفحة الرئيسية',
  marketing: 'إدارة التسويق',
  sales: 'إدارة المبيعات',
  procurement: 'إدارة المشتريات',
  finance: 'الحسابات المالية',
  hr: 'الموارد البشرية',
  projects: 'المشاريع',
  settings: 'الإعدادات',
  auth: 'تسجيل الدخول',
  employee: 'صفحة موظف',
  app: 'المنصة',
};

export function moduleLabel(module: string | null | undefined): string {
  if (!module) return '—';
  return MODULE_LABELS[module] || module;
}

export function pageTitleFromPath(pathname: string): string {
  const map: Record<string, string> = {
    '/': 'الأنظمة',
    '/me': 'صفحتي',
    '/marketing': 'إدارة التسويق',
    '/sales': 'إدارة المبيعات',
    '/procurement': 'إدارة المشتريات والتعاقدات',
    '/finance': 'الحسابات المالية',
    '/finance/journal': 'القيود اليومية',
    '/finance/vouchers': 'السندات',
    '/finance/accounts': 'دليل الحسابات',
    '/finance/cost-centers': 'مراكز التكلفة',
    '/finance/reports': 'التقارير المالية',
    '/finance/client-accounts': 'حسابات العملاء',
    '/hr': 'الموارد البشرية',
    '/projects': 'المشاريع',
    '/settings': 'الإعدادات',
    '/settings/users': 'المستخدمون والصلاحيات',
    '/settings/company': 'معلومات الشركة',
    '/settings/zatca': 'الفوترة الإلكترونية',
    '/settings/building-code': 'كود البناء SBC/NFPA',
    '/settings/activity': 'سجل النشاطات',
    '/login': 'تسجيل الدخول',
  };
  if (map[pathname]) return map[pathname];
  for (const [prefix, label] of Object.entries(map)) {
    if (prefix !== '/' && pathname.startsWith(`${prefix}/`)) return label;
  }
  return moduleLabel(moduleFromPath(pathname));
}
