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
    { id: 'tax-invoices', label: 'الفواتير الضريبية', tab: 'tax-invoices' },
    { id: 'accounts', label: 'حساب العميل الشامل', tab: 'accounts' },
  ],
  procurement: [
    {
      id: 'vendors',
      label: 'دليل الموردين المعتمدين',
      description: 'موردو معدات الإطفاء والإنذار المعتمدون',
      href: '/procurement',
      tab: 'vendors',
      status: 'active',
    },
    {
      id: 'subcontractors',
      label: 'العقود الخارجية',
      description: 'مقاولون واستشاريون واختبارات طرف ثالث',
      href: '/procurement',
      tab: 'subcontractors',
      status: 'active',
    },
    {
      id: 'orders',
      label: 'أوامر الشراء',
      description: 'طلبات شراء أدوات ومعدات وتراخيص',
      href: '/procurement',
      tab: 'orders',
      status: 'active',
    },
    {
      id: 'boq-rfq',
      label: 'BOQ → RFQ',
      description: 'تحويل جدول الكميات إلى طلبات تسعير',
      href: '/procurement',
      tab: 'boq-rfq',
      status: 'active',
    },
  ],
  finance: [
    { id: 'dashboard', label: 'لوحة التحكم', href: '/finance' },
    { id: 'enterprise', label: 'المحاسبة المؤسسية', href: '/finance/enterprise' },
    { id: 'approvals', label: 'الاعتماد المالي', href: '/finance/vouchers?tab=approvals' },
    { id: 'invoices', label: 'الفواتير الضريبية', href: '/finance/invoices' },
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
  design: [
    { id: 'knowledge', label: 'قاعدة المعرفة', tab: 'knowledge', href: '/design' },
    { id: 'rag', label: 'محرك المعرفة AI', tab: 'rag', href: '/design' },
    { id: 'workspace', label: 'مساحة التصميم', tab: 'workspace', href: '/design' },
    { id: 'rules', label: 'محرك القواعد الهندسية', tab: 'rules', href: '/design' },
    { id: 'planner', label: 'مخطط التصميم', tab: 'planner', href: '/design' },
    { id: 'assistant', label: 'المساعد الذكي', tab: 'assistant', href: '/design' },
    { id: 'drawings', label: 'مراجعة المخططات', tab: 'drawings', href: '/design' },
    { id: 'timeline', label: 'الجدول الزمني', tab: 'timeline', href: '/design' },
    { id: 'notifications', label: 'التنبيهات', tab: 'notifications', href: '/design' },
    { id: 'checklist', label: 'قوائم التحقق', tab: 'checklist', href: '/design' },
    { id: 'copilot', label: 'Copilot', tab: 'copilot', href: '/design' },
    { id: 'lessons', label: 'الدروس المستفادة', tab: 'lessons', href: '/design' },
    { id: 'analytics', label: 'التحليلات', tab: 'analytics', href: '/design' },
  ],
  settings: [
    { id: 'overview', label: 'نظرة عامة', href: '/settings' },
    { id: 'company', label: 'معلومات الشركة', href: '/settings/company' },
    { id: 'users', label: 'المستخدمون', href: '/settings/users' },
    { id: 'activity', label: 'سجل النشاطات', href: '/settings/activity' },
    { id: 'zatca', label: 'ZATCA', href: '/settings/zatca' },
    { id: 'building-code', label: 'كود البناء SBC/NFPA', href: '/settings/building-code' },
  ],
};

export const MODULE_STATUS_LABELS: Record<ModuleStatus, string> = {
  active: 'مفعّل',
  under_development: 'قيد التطوير',
  beta: 'تجريبي',
};
