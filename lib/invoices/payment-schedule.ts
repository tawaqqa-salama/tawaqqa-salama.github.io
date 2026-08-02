import { VAT_RATE } from '@/lib/constants/clients';
import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { SalesContract } from '@/lib/types/sales';

export type ScheduleMilestoneDraft = {
  title: string;
  percentage: number;
  sort_order: number;
};

function round2(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** يستخرج نسبة مئوية من نص خطة السداد مثل "الدفعة الأولى: 50% عند ..." */
export function extractPercentage(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * يبني جدول دفعات افتراضي 50/30/20 من ملف الشركة،
 * أو يعدّل النسب لتساوي 100% إن وُجدت.
 */
export function buildDefaultPaymentSchedule(
  company: Pick<CompanyProfile, 'payment_first' | 'payment_second' | 'payment_final'>
): ScheduleMilestoneDraft[] {
  const first = extractPercentage(company.payment_first) ?? 50;
  const second = extractPercentage(company.payment_second) ?? 30;
  const finalPct = extractPercentage(company.payment_final) ?? 20;

  let rows: ScheduleMilestoneDraft[] = [
    {
      title: company.payment_first?.trim() || `الدفعة المقدمة (${first}%)`,
      percentage: first,
      sort_order: 1,
    },
    {
      title: company.payment_second?.trim() || `دفعة مرحلة الدراسة (${second}%)`,
      percentage: second,
      sort_order: 2,
    },
    {
      title: company.payment_final?.trim() || `الدفعة الختامية (${finalPct}%)`,
      percentage: finalPct,
      sort_order: 3,
    },
  ];

  const sum = rows.reduce((acc, row) => acc + row.percentage, 0);
  if (sum > 0 && Math.abs(sum - 100) > 0.01) {
    rows = rows.map((row) => ({
      ...row,
      percentage: round2((row.percentage / sum) * 100),
    }));
  }

  return rows;
}

export function amountsForPercentage(baseSubtotal: number, percentage: number) {
  const amount = round2((Number(baseSubtotal || 0) * Number(percentage || 0)) / 100);
  const vatAmount = round2(amount * VAT_RATE);
  const totalAmount = round2(amount + vatAmount);
  return { amount, vatAmount, totalAmount };
}

export function resolveContractBaseSubtotal(
  client: ClientRecord,
  contract?: Pick<SalesContract, 'amount' | 'total_amount' | 'vat_amount'> | null
): number {
  if (contract?.amount != null && Number(contract.amount) > 0) {
    return round2(Number(contract.amount));
  }
  return round2(Number(client.quotation_amount || 0));
}

/** هل العميل منشأة (B2B) أم فرد (B2C) */
export function resolveInvoiceType(client: Pick<
  ClientRecord,
  'commercial_register' | 'tax_number' | 'client_kind' | 'business_name'
>): 'STANDARD' | 'SIMPLIFIED' {
  if (client.client_kind === 'business') return 'STANDARD';
  if (client.client_kind === 'consumer') return 'SIMPLIFIED';
  const hasCr = Boolean(client.commercial_register?.trim());
  const hasVat = Boolean(client.tax_number?.trim());
  if (hasCr || hasVat) return 'STANDARD';
  // منشأة باسم تجاري واضح بدون سجل → افتراض مبسطة ما لم يُحدَّد خلاف ذلك
  return 'SIMPLIFIED';
}

/** ربط حالة تقرير هندسي بفهرس الدفعة (1=مقدمة، 2=دراسة، 3=ختامي) */
export function milestoneIndexForEngineeringEvent(
  event: 'contract' | 'engineering_delivery' | 'field_visit' | 'final_inspection' | 'completion'
): number {
  switch (event) {
    case 'contract':
      return 0;
    case 'field_visit':
    case 'engineering_delivery':
      return 1;
    case 'final_inspection':
    case 'completion':
      return 2;
    default:
      return 1;
  }
}
