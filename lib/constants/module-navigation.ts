import type { DepartmentId } from '@/lib/constants/navigation';

/** حالة الوحدة في الواجهة */
export type ModuleStatus = 'active' | 'under_development' | 'beta';

export type DepartmentSubModule = {
  id: string;
  label: string;
  description?: string;
  href?: string;
  tab?: string;
  status?: ModuleStatus;
};

/**
 * هيكل التنقل الفرعي لكل قسم — مصدر واحد للتبويبات والبطاقات.
 */
export const DEPARTMENT_SUB_MODULES: Record<DepartmentId, DepartmentSubModule[]> = {
  marketing: [
    {
      id: 'dashboard',
      label: 'لوحة الحملات',
      description: 'متابعة رحلة العميل والحملات',
      tab: 'dashboard',
    },
    {
      id: 'campaigns',
      label: 'الحملات',
      description: 'حملات التواصل ومتابعة الاهتمام',
      tab: 'campaigns',
    },
    { id: 'leads', label: 'Leads', tab: 'leads' },
    { id: 'followups', label: 'متابعات التواصل', tab: 'followups' },
    { id: 'pipeline', label: 'لوحة حالة العميل', tab: 'pipeline' },
  ],
  sales: [
    {
      id: 'sales',
      label: 'المبيعات',
      description: 'خانة المبيعات — العملاء والمتابعة',
      tab: 'sales',
    },
    {
      id: 'quotations',
      label: 'عرض السعر',
      description: 'خانة عروض الأسعار والمقترحات',
      tab: 'quotations',
    },
    { id: 'documents', label: 'أرشيف المستندات', tab: 'documents' },
    { id: 'credit', label: 'الآجل والمرتجعات', tab: 'credit' },
    { id: 'contracts', label: 'العقود', tab: 'contracts' },
    { id: 'accounts', label: 'حساب العميل الشامل', tab: 'accounts' },
  ],
  procurement: [
    {
      id: 'hub',
      label: 'إدارة المشتريات',
      description: 'الموردون وطلبات الشراء',
      href: '/procurement',
      status: 'under_development',
    },
  ],
  finance: [
    { id: 'dashboard', label: 'لوحة التحكم', href: '/finance' },
    { id: 'approvals', label: 'الاعتماد المالي', href: '/finance/vouchers?tab=approvals' },
    { id: 'journal', label: 'القيود اليومية', href: '/finance/journal' },
    { id: 'vouchers', label: 'السندات', href: '/finance/vouchers' },
    { id: 'accounts', label: 'دليل الحسابات', href: '/finance/accounts' },
    { id: 'cost-centers', label: 'مراكز التكلفة', href: '/finance/cost-centers' },
    { id: 'reports', label: 'التقارير والإقرار الضريبي', href: '/finance/reports' },
    { id: 'client-accounts', label: 'حسابات العملاء', href: '/finance/client-accounts' },
  ],
  hr: [
    { id: 'employees', label: 'الموظفون', tab: 'employees' },
    { id: 'assignments', label: 'توزيع المهام', tab: 'assignments' },
  ],
  projects: [
    {
      id: 'list',
      label: 'المشاريع',
      description: 'قائمة المشاريع المعتمدة مالياً',
      tab: 'list',
    },
    {
      id: 'inspection',
      label: 'المعاينة الهندسية',
      description: 'خانة المعاينة الميدانية والتفتيش',
      tab: 'inspection',
    },
    {
      id: 'blueprints',
      label: 'المخططات / BIM',
      description: 'عارض المخططات وملفات CAD/BIM',
      tab: 'blueprints',
    },
    {
      id: 'compliance',
      label: 'الامتثال SBC/NFPA',
      description: 'محرك الامتثال وقاعدة المعرفة',
      tab: 'compliance',
    },
  ],
  settings: [
    { id: 'overview', label: 'نظرة عامة', href: '/settings' },
    { id: 'company', label: 'معلومات الشركة', href: '/settings/company' },
    { id: 'users', label: 'المستخدمون', href: '/settings/users' },
    { id: 'activity', label: 'سجل النشاطات', href: '/settings/activity' },
    { id: 'zatca', label: 'ZATCA', href: '/settings/zatca' },
  ],
};

export const MODULE_STATUS_LABELS: Record<ModuleStatus, string> = {
  active: 'مفعّل',
  under_development: 'قيد التطوير',
  beta: 'تجريبي',
};
