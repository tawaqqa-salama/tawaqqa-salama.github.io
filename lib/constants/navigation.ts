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

export type NavModuleStatus = 'active' | 'under_development' | 'beta';

/** Module launcher / app switcher — exactly 7 departments (all active). */
export const SIDEBAR_NAV: {
  href: string;
  label: string;
  icon: string;
  department: DepartmentId;
  /** لا تُخفَ الأقسام ذات الحالة active من الشبكة/القائمة */
  status: NavModuleStatus;
  disabled?: boolean;
  hidden?: boolean;
}[] = [
  { href: '/marketing', label: 'إدارة التسويق', icon: '📣', department: 'marketing', status: 'active' },
  { href: '/sales', label: 'إدارة المبيعات', icon: '💼', department: 'sales', status: 'active' },
  {
    href: '/procurement',
    label: 'إدارة المشتريات والتعاقدات',
    icon: '📦',
    department: 'procurement',
    status: 'active',
  },
  { href: '/finance', label: 'الحسابات المالية', icon: '💰', department: 'finance', status: 'active' },
  { href: '/hr', label: 'الموارد البشرية', icon: '👷', department: 'hr', status: 'active' },
  { href: '/projects', label: 'المشاريع', icon: '🏗️', department: 'projects', status: 'active' },
  { href: '/settings', label: 'الإعدادات', icon: '⚙️', department: 'settings', status: 'active' },
];

/** أقسام ظاهرة في الشبكة الرئيسية — يستبعد أي عنصر hidden/disabled/قيد التطوير */
export function getVisibleSidebarNav(
  items: typeof SIDEBAR_NAV = SIDEBAR_NAV
): typeof SIDEBAR_NAV {
  return items.filter(
    (item) => item.status === 'active' && !item.disabled && !item.hidden
  ) as typeof SIDEBAR_NAV;
}

export const SYSTEM_MODULES = [
  {
    href: '/marketing',
    title: 'إدارة التسويق',
    description: 'لوحة الحملات ورحلة العميل وLeads ومتابعات التواصل',
    icon: '📣',
    color: 'from-teal-500 to-teal-600',
    status: 'active' as const,
  },
  {
    href: '/sales',
    title: 'إدارة المبيعات',
    description: 'خانة المبيعات وخانة عروض الأسعار والعقود والأرشيف',
    icon: '💼',
    color: 'from-blue-500 to-blue-600',
    status: 'active' as const,
  },
  {
    href: '/procurement',
    title: 'إدارة المشتريات والتعاقدات',
    description: 'الموردون المعتمدون، العقود الخارجية، أوامر الشراء، وتحويل BOQ إلى RFQ',
    icon: '📦',
    color: 'from-orange-400 to-orange-500',
    status: 'active' as const,
  },
  {
    href: '/finance',
    title: 'الحسابات المالية',
    description: 'الاعتماد المالي، الفوترة، القيود، السندات والتقارير',
    icon: '💰',
    color: 'from-rose-500 to-rose-600',
    status: 'active' as const,
  },
  {
    href: '/hr',
    title: 'الموارد البشرية',
    description: 'الموظفون والرواتب والعقود وتوزيع المهام',
    icon: '👷',
    color: 'from-amber-400 to-amber-500',
    status: 'active' as const,
  },
  {
    href: '/projects',
    title: 'إدارة المشاريع',
    description: 'المعاينة الهندسية، المخططات/BIM، والامتثال SBC/NFPA',
    icon: '🏗️',
    color: 'from-indigo-500 to-indigo-600',
    status: 'active' as const,
  },
  {
    href: '/settings',
    title: 'الإعدادات',
    description: 'إعدادات النظام والمستخدمين وسجل النشاطات',
    icon: '⚙️',
    color: 'from-emerald-500 to-emerald-600',
    status: 'active' as const,
  },
] as const;

/** إعادة تصدير هيكل التبويبات الفرعية */
export { DEPARTMENT_SUB_MODULES } from '@/lib/constants/module-navigation';
