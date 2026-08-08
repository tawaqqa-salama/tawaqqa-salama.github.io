import type { AppLocale } from '@/lib/i18n/types';

export type MoneyFormatOptions = {
  currency?: string;
  locale?: string;
};

const CURRENCY_LOCALES: Record<string, string> = {
  SAR: 'ar-SA',
  IDR: 'id-ID',
  USD: 'en-US',
  EUR: 'en-IE',
};

export function formatCurrency(
  value: number | null | undefined,
  options?: MoneyFormatOptions | string
): string {
  const amount = Number(value ?? 0);
  // Backward compatible: formatCurrency(n) used SAR + ar-SA
  if (typeof options === 'string') {
    return formatCurrency(amount, { currency: options });
  }
  const currency = options?.currency || 'SAR';
  const locale = options?.locale || CURRENCY_LOCALES[currency] || 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'IDR' ? 0 : 2,
      maximumFractionDigits: currency === 'IDR' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale)} ${currency}`;
  }
}

export function formatDate(
  value: string | null | undefined,
  locale: AppLocale | string = 'en'
): string {
  if (!value) return '-';
  const tag = locale === 'ar' ? 'ar-SA' : locale === 'id' ? 'id-ID' : 'en-GB';
  return new Date(value).toLocaleDateString(tag);
}
