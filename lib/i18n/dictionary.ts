import type { AppLocale } from '@/lib/i18n/types';

type Dict = Record<string, string>;

const ar: Dict = {
  'common.loading': 'جاري التحميل...',
  'common.close': 'إغلاق',
  'common.save': 'حفظ',
  'common.cancel': 'إلغاء',
  'common.search': 'بحث',
  'common.logout': 'خروج',
  'common.employee': 'موظف',
  'common.fullAccess': 'كاملة',
  'common.language': 'اللغة',
  'common.arabic': 'العربية',
  'common.english': 'English',

  'shell.checkingSession': 'جاري التحقق من الجلسة...',
  'shell.systems': 'الأنظمة',
  'shell.homeSubtitle': 'الصفحة الرئيسية',
  'shell.employeePage': 'صفحة موظف',
  'shell.login': 'تسجيل الدخول',
  'shell.standaloneHint': 'نظام مستقل · اختر قسماً من الشبكة',
  'shell.subnavOpenMobile': 'القائمة الفرعية مفتوحة',
  'shell.subnavVisible': 'التبويبات ظاهرة — اضغط القائمة لإخفائها',
  'shell.subnavHidden': 'التبويبات مخفية — اضغط القائمة لإظهارها',
  'shell.toggleSubnavShow': 'إظهار قائمة القسم',
  'shell.toggleSubnavHide': 'إخفاء قائمة القسم',
  'shell.toggleSubnavShowAria': 'إظهار القائمة الفرعية',
  'shell.toggleSubnavHideAria': 'إخفاء القائمة الفرعية',
  'shell.openApps': 'فتح قائمة الأقسام',
  'shell.appsTitle': 'قائمة الأقسام',
  'shell.homeAria': 'الصفحة الرئيسية للأنظمة',
  'shell.homeTitle': 'الصفحة الرئيسية للأنظمة',
  'shell.navAria': 'أزرار التنقل',

  'switcher.title': 'أقسام المنصة',
  'switcher.subtitle': 'اختر قسماً للانتقال إليه مباشرة',
  'switcher.empty': 'لا توجد أقسام متاحة لحسابك.',
  'switcher.closeOverlay': 'إغلاق قائمة الأقسام',

  'nav.marketing': 'إدارة التسويق',
  'nav.sales': 'إدارة المبيعات',
  'nav.procurement': 'إدارة المشتريات والتعاقدات',
  'nav.finance': 'الحسابات المالية',
  'nav.hr': 'الموارد البشرية',
  'nav.projects': 'المشاريع',
  'nav.settings': 'الإعدادات',

  'nav.marketing.desc': 'لوحة الحملات ورحلة العميل وLeads ومتابعات التواصل',
  'nav.sales.desc': 'خانة المبيعات وخانة عروض الأسعار والعقود والأرشيف',
  'nav.procurement.desc': 'الموردون المعتمدون، العقود الخارجية، أوامر الشراء، وتحويل BOQ إلى RFQ',
  'nav.finance.desc': 'الاعتماد المالي، الفوترة، القيود، السندات والتقارير',
  'nav.hr.desc': 'الموظفون والرواتب والعقود وتوزيع المهام',
  'nav.projects.desc': 'المعاينة الهندسية، المخططات/BIM، والامتثال SBC/NFPA',
  'nav.projects.manage': 'إدارة المشاريع',
  'nav.settings.desc': 'إعدادات النظام والمستخدمين وسجل النشاطات',

  'settings.users': 'المستخدمون والصلاحيات',
  'settings.company': 'بيانات الشركة',
  'settings.activity': 'سجل النشاطات',
  'settings.zatca': 'الفوترة الإلكترونية',
  'settings.buildingCode': 'كود البناء SBC/NFPA',
  'settings.overview': 'نظرة عامة',
  'settings.usersShort': 'المستخدمون',
  'settings.companyShort': 'معلومات الشركة',
  'settings.buildingCodeShort': 'كود البناء',
  'settings.tabs': 'تبويبات الإعدادات',
  'settings.zatcaShort': 'ZATCA',

  'finance.approvals': 'الاعتماد المالي',
  'finance.dashboard': 'لوحة التحكم',
  'finance.invoices': 'الفواتير الضريبية',
  'finance.journal': 'القيود اليومية',
  'finance.vouchers': 'السندات',
  'finance.accounts': 'دليل الحسابات',
  'finance.costCenters': 'مراكز التكلفة',
  'finance.reports': 'التقارير والإقرار الضريبي',
  'finance.clientAccounts': 'حسابات العملاء',

  'me.myPage': 'صفحتي الخاصة',
  'me.welcome': 'مرحباً، {name}',
  'me.defaultBio': 'هذه مساحتك الشخصية حسب صلاحياتك في المنصة.',
  'me.role': 'الدور',
  'me.permissionsCount': 'عدد الصلاحيات',
  'me.lastLogin': 'آخر دخول',
  'me.mySections': 'أقسام صفحتي',
  'me.manageStaff': 'إدارة الموظفين ←',
  'me.noSections': 'لا توجد أقسام مفعّلة لحسابك بعد. تواصل مع المدير لإضافة صلاحيات.',

  'login.platformTag': 'منصة استشارات السلامة',
  'login.welcomeBack': 'مرحباً بعودتك',
  'login.subtitle': 'سجّل الدخول للمتابعة إلى لوحة التحكم',
  'login.email': 'البريد الإلكتروني',
  'login.password': 'كلمة المرور',
  'login.phone': 'رقم الجوال',
  'login.otp': 'كود التحقق',
  'login.emailTab': 'إيميل وكلمة سر',
  'login.phoneTab': 'جوال وكود تحقق',
  'login.submit': 'دخول',
  'login.sendOtp': 'إرسال كود التحقق',
  'login.verifyOtp': 'تأكيد الدخول',
  'login.demoHint': 'حسابات تجريبية',
  'login.staffOnly': 'الدخول للموظفين فقط — كل مستخدم بصلاحياته وصفحته الخاصة',
  'login.staffLogin': 'دخول الموظفين',
  'login.staffLoginHint': 'بريد وكلمة مرور، أو جوال مع كود تحقق',
  'login.signingIn': 'جاري الدخول...',
  'login.processing': 'جاري المعالجة...',
  'login.demoOtp': 'كود التحقق التجريبي:',
  'login.pageTitle': 'تسجيل الدخول',
  'me.customLink': 'رابط الصفحة المخصصة',
  'me.customLinkHint': 'يمكنك مشاركة صفحتك الداخلية عبر:',
};

const en: Dict = {
  'common.loading': 'Loading...',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.search': 'Search',
  'common.logout': 'Log out',
  'common.employee': 'Staff',
  'common.fullAccess': 'Full',
  'common.language': 'Language',
  'common.arabic': 'العربية',
  'common.english': 'English',

  'shell.checkingSession': 'Checking session...',
  'shell.systems': 'Systems',
  'shell.homeSubtitle': 'Home',
  'shell.employeePage': 'Employee page',
  'shell.login': 'Sign in',
  'shell.standaloneHint': 'Standalone system · pick a department from the grid',
  'shell.subnavOpenMobile': 'Sub-navigation is open',
  'shell.subnavVisible': 'Tabs visible — tap the menu to hide',
  'shell.subnavHidden': 'Tabs hidden — tap the menu to show',
  'shell.toggleSubnavShow': 'Show department menu',
  'shell.toggleSubnavHide': 'Hide department menu',
  'shell.toggleSubnavShowAria': 'Show sub-navigation',
  'shell.toggleSubnavHideAria': 'Hide sub-navigation',
  'shell.openApps': 'Open departments menu',
  'shell.appsTitle': 'Departments menu',
  'shell.homeAria': 'Systems home',
  'shell.homeTitle': 'Systems home',
  'shell.navAria': 'Navigation controls',

  'switcher.title': 'Platform departments',
  'switcher.subtitle': 'Jump directly to a department',
  'switcher.empty': 'No departments available for your account.',
  'switcher.closeOverlay': 'Close departments menu',

  'nav.marketing': 'Marketing',
  'nav.sales': 'Sales',
  'nav.procurement': 'Procurement & Contracting',
  'nav.finance': 'Finance',
  'nav.hr': 'Human Resources',
  'nav.projects': 'Projects',
  'nav.settings': 'Settings',

  'nav.marketing.desc': 'Campaigns, customer journey, leads, and follow-ups',
  'nav.sales.desc': 'Sales desk, quotations, contracts, and document archive',
  'nav.procurement.desc': 'Approved vendors, external contracts, POs, and BOQ to RFQ',
  'nav.finance.desc': 'Approvals, invoicing, journals, vouchers, and reports',
  'nav.hr.desc': 'Employees, payroll, contracts, and task assignment',
  'nav.projects.desc': 'Engineering inspection, drawings/BIM, and SBC/NFPA compliance',
  'nav.projects.manage': 'Project Management',
  'nav.settings.desc': 'System settings, users, and activity log',

  'settings.users': 'Users & permissions',
  'settings.company': 'Company profile',
  'settings.activity': 'Activity log',
  'settings.zatca': 'E-invoicing (ZATCA)',
  'settings.buildingCode': 'Building code SBC/NFPA',
  'settings.overview': 'Overview',
  'settings.usersShort': 'Users',
  'settings.companyShort': 'Company info',
  'settings.buildingCodeShort': 'Building code',
  'settings.tabs': 'Settings tabs',
  'settings.zatcaShort': 'ZATCA',

  'finance.approvals': 'Financial approval',
  'finance.dashboard': 'Dashboard',
  'finance.invoices': 'Tax invoices',
  'finance.journal': 'Journal entries',
  'finance.vouchers': 'Vouchers',
  'finance.accounts': 'Chart of accounts',
  'finance.costCenters': 'Cost centers',
  'finance.reports': 'Reports & tax filing',
  'finance.clientAccounts': 'Client accounts',

  'me.myPage': 'My page',
  'me.welcome': 'Welcome, {name}',
  'me.defaultBio': 'This is your personal workspace based on your platform permissions.',
  'me.role': 'Role',
  'me.permissionsCount': 'Permissions',
  'me.lastLogin': 'Last login',
  'me.mySections': 'My departments',
  'me.manageStaff': 'Manage staff →',
  'me.noSections': 'No departments are enabled for your account yet. Contact an admin.',

  'login.platformTag': 'Safety consulting platform',
  'login.welcomeBack': 'Welcome back',
  'login.subtitle': 'Sign in to continue to the dashboard',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.phone': 'Mobile number',
  'login.otp': 'Verification code',
  'login.emailTab': 'Email & password',
  'login.phoneTab': 'Phone & OTP',
  'login.submit': 'Sign in',
  'login.sendOtp': 'Send verification code',
  'login.verifyOtp': 'Verify & sign in',
  'login.demoHint': 'Demo accounts',
  'login.staffOnly': 'Staff access only — each user has their own permissions and page',
  'login.staffLogin': 'Staff sign-in',
  'login.staffLoginHint': 'Email and password, or phone with a verification code',
  'login.signingIn': 'Signing in...',
  'login.processing': 'Processing...',
  'login.demoOtp': 'Demo verification code:',
  'login.pageTitle': 'Sign in',
  'me.customLink': 'Personal page link',
  'me.customLinkHint': 'Share your internal page via:',
};

export const translations: Record<AppLocale, Dict> = { ar, en };

export type TranslationKey = keyof typeof ar;

export function translate(
  locale: AppLocale,
  key: TranslationKey | string,
  vars?: Record<string, string | number>
): string {
  const table = translations[locale] || translations.ar;
  let text = table[key] ?? translations.ar[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

const HREF_TO_NAV_KEY: Record<string, TranslationKey> = {
  '/marketing': 'nav.marketing',
  '/sales': 'nav.sales',
  '/procurement': 'nav.procurement',
  '/finance': 'nav.finance',
  '/hr': 'nav.hr',
  '/projects': 'nav.projects',
  '/settings': 'nav.settings',
};

const HREF_TO_DESC_KEY: Record<string, TranslationKey> = {
  '/marketing': 'nav.marketing.desc',
  '/sales': 'nav.sales.desc',
  '/procurement': 'nav.procurement.desc',
  '/finance': 'nav.finance.desc',
  '/hr': 'nav.hr.desc',
  '/projects': 'nav.projects.desc',
  '/settings': 'nav.settings.desc',
};

export function translateNavLabel(locale: AppLocale, href: string, fallback?: string): string {
  const key = HREF_TO_NAV_KEY[href];
  if (href === '/projects' && fallback?.includes('إدارة')) {
    return translate(locale, 'nav.projects.manage');
  }
  return key ? translate(locale, key) : fallback || href;
}

export function translateNavDescription(locale: AppLocale, href: string, fallback?: string): string {
  const key = HREF_TO_DESC_KEY[href];
  return key ? translate(locale, key) : fallback || '';
}

const FINANCE_SUB_KEYS: Record<string, TranslationKey> = {
  '/finance': 'finance.dashboard',
  '/finance/vouchers?tab=approvals': 'finance.approvals',
  '/finance/invoices': 'finance.invoices',
  '/finance/journal': 'finance.journal',
  '/finance/vouchers': 'finance.vouchers',
  '/finance/accounts': 'finance.accounts',
  '/finance/cost-centers': 'finance.costCenters',
  '/finance/reports': 'finance.reports',
  '/finance/client-accounts': 'finance.clientAccounts',
};

export function translateFinanceNavLabel(locale: AppLocale, href: string, fallback: string): string {
  const key = FINANCE_SUB_KEYS[href];
  return key ? translate(locale, key) : fallback;
}

const SETTINGS_SUB_KEYS: Record<string, TranslationKey> = {
  '/settings/users': 'settings.users',
  '/settings/company': 'settings.company',
  '/settings/activity': 'settings.activity',
  '/settings/zatca': 'settings.zatca',
  '/settings/building-code': 'settings.buildingCode',
};

export function translateSettingsSub(locale: AppLocale, pathname: string): string | null {
  const key = SETTINGS_SUB_KEYS[pathname];
  return key ? translate(locale, key) : null;
}
