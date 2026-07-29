export type PipelineStage = 'marketing' | 'sales' | 'finance' | 'projects' | 'completed';

export const PIPELINE_STAGES: { id: PipelineStage; label: string; route: string }[] = [
  { id: 'marketing', label: 'التسويق', route: '/marketing' },
  { id: 'sales', label: 'المبيعات', route: '/sales' },
  { id: 'finance', label: 'المالية', route: '/finance' },
  { id: 'projects', label: 'المشاريع', route: '/projects' },
  { id: 'completed', label: 'مكتمل', route: '/projects' },
];

export const LEAD_STATUSES = ['مهتم', 'متابعة', 'مؤهل', 'غير مهتم'] as const;

export type DepartmentId =
  | 'marketing'
  | 'sales'
  | 'procurement'
  | 'finance'
  | 'hr'
  | 'projects'
  | 'settings';

/** Main sidebar — exactly 7 departments as requested. */
export const SIDEBAR_NAV: {
  href: string;
  label: string;
  icon: string;
  department: DepartmentId;
}[] = [
  { href: '/marketing', label: 'إدارة التسويق', icon: '📣', department: 'marketing' },
  { href: '/sales', label: 'إدارة المبيعات', icon: '💼', department: 'sales' },
  { href: '/procurement', label: 'إدارة المشتريات', icon: '📦', department: 'procurement' },
  { href: '/finance', label: 'الحسابات المالية', icon: '💰', department: 'finance' },
  { href: '/hr', label: 'الموارد البشرية', icon: '👷', department: 'hr' },
  { href: '/projects', label: 'المشاريع', icon: '🏗️', department: 'projects' },
  { href: '/settings', label: 'الإعدادات', icon: '⚙️', department: 'settings' },
];

export const SYSTEM_MODULES = [
  {
    href: '/marketing',
    title: 'إدارة التسويق',
    description: 'Leads والعملاء المهتمون وتحويلهم للمبيعات',
    icon: '📣',
    color: 'from-teal-500 to-teal-600',
  },
  {
    href: '/sales',
    title: 'إدارة المبيعات',
    description: 'عروض الأسعار والمتابعة والتواصل مع العملاء',
    icon: '💼',
    color: 'from-blue-500 to-blue-600',
  },
  {
    href: '/procurement',
    title: 'إدارة المشتريات',
    description: 'الموردون وفواتير الشراء — قيد التطوير',
    icon: '📦',
    color: 'from-orange-400 to-orange-500',
    badge: 'قيد التطوير',
  },
  {
    href: '/finance',
    title: 'الحسابات المالية',
    description: 'القيود اليومية والسندات والتقارير والإقرار الضريبي',
    icon: '💰',
    color: 'from-rose-500 to-rose-600',
  },
  {
    href: '/hr',
    title: 'الموارد البشرية',
    description: 'إدارة المهندسين والموظفين وتوزيع المهام',
    icon: '👷',
    color: 'from-amber-400 to-amber-500',
  },
  {
    href: '/projects',
    title: 'المشاريع',
    description: 'المعاينة الهندسية والتراخيص والتقارير النهائية',
    icon: '🏗️',
    color: 'from-indigo-500 to-indigo-600',
  },
  {
    href: '/settings',
    title: 'الإعدادات',
    description: 'إعدادات النظام والمستخدمين والصلاحيات',
    icon: '⚙️',
    color: 'from-emerald-500 to-emerald-600',
  },
] as const;
