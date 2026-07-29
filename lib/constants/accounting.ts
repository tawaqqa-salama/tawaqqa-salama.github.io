export const ACCOUNT_TYPES = [
  { id: 'asset', label: 'الأصول', color: 'blue' },
  { id: 'liability', label: 'الخصوم', color: 'amber' },
  { id: 'equity', label: 'حقوق الملكية', color: 'purple' },
  { id: 'revenue', label: 'الإيرادات', color: 'emerald' },
  { id: 'expense', label: 'المصروفات', color: 'rose' },
] as const;

export type AccountTypeId = (typeof ACCOUNT_TYPES)[number]['id'];

export const VOUCHER_TYPES = [
  { id: 'receipt', label: 'سند قبض' },
  { id: 'payment', label: 'سند صرف' },
] as const;

export type VoucherTypeId = (typeof VOUCHER_TYPES)[number]['id'];

export const JOURNAL_STATUSES = ['مسودة', 'مرحّل', 'ملغي'] as const;
export const VOUCHER_STATUSES = ['مسودة', 'بانتظار السداد', 'مرحّل', 'ملغي'] as const;

export const DEFAULT_ACCOUNT_CODES = {
  CASH: '1110',
  ACCOUNTS_RECEIVABLE: '1120',
  VAT_PAYABLE: '2120',
  SERVICE_REVENUE: '4100',
  OPERATING_EXPENSE: '5100',
  PROCUREMENT_EXPENSE: '5200',
} as const;

/** Finance sub-navigation — scoped inside /finance only. */
export const FINANCE_NAV = [
  { href: '/finance', label: 'لوحة التحكم', icon: '▦' },
  { href: '/finance/journal', label: 'القيود اليومية', icon: '📝' },
  { href: '/finance/vouchers', label: 'السندات', icon: '🧾' },
  { href: '/finance/accounts', label: 'دليل الحسابات', icon: '🌳' },
  { href: '/finance/cost-centers', label: 'مراكز التكلفة', icon: '🏢' },
  { href: '/finance/reports', label: 'التقارير والإقرار الضريبي', icon: '📈' },
  { href: '/finance/client-accounts', label: 'حسابات العملاء', icon: '👥' },
] as const;

export function getJournalEntryTypeLabel(referenceType: string | null | undefined): string {
  const map: Record<string, string> = {
    quotation: 'قيد آلي — عرض سعر',
    receipt: 'سند قبض',
    payment: 'سند صرف',
    manual: 'قيد يومية',
    client: 'قيد عميل',
  };
  return map[referenceType || 'manual'] || 'قيد يومية';
}
