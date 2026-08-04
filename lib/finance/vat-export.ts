/**
 * Saudi VAT return export helpers (CSV / printable JSON summary).
 */

import type { VatReturnSummary } from '@/lib/enterprise-accounting/types';
import type { VatSummary } from '@/lib/types/accounting';
import { VAT_RATE } from '@/lib/constants/clients';

export function vatSummaryToReturn(
  vat: VatSummary,
  periodLabel: string,
  inputVat = 0,
  taxablePurchases = 0
): VatReturnSummary {
  return {
    periodLabel,
    standardRatedSales: vat.taxableRevenue,
    outputVat: vat.outputVat,
    zeroRatedSales: 0,
    exemptSales: 0,
    standardRatedPurchases: taxablePurchases,
    inputVat,
    netVatDue: Math.round((vat.outputVat - inputVat) * 100) / 100,
    currency: 'SAR',
  };
}

export function vatReturnToCsv(vat: VatReturnSummary): string {
  const rows: string[][] = [
    ['Field', 'Value', 'Currency'],
    ['Period', vat.periodLabel, ''],
    ['Standard-rated sales (net)', String(vat.standardRatedSales), vat.currency],
    ['Output VAT 15%', String(vat.outputVat), vat.currency],
    ['Zero-rated sales', String(vat.zeroRatedSales), vat.currency],
    ['Exempt / out-of-scope sales', String(vat.exemptSales), vat.currency],
    ['Standard-rated purchases (net)', String(vat.standardRatedPurchases), vat.currency],
    ['Input VAT 15%', String(vat.inputVat), vat.currency],
    ['Net VAT due / (refund)', String(vat.netVatDue), vat.currency],
    ['Standard rate', String(VAT_RATE * 100) + '%', ''],
    ['Generated at', new Date().toISOString(), ''],
  ];
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  if (typeof window === 'undefined') return;
  const blob = new Blob(['\uFEFF' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportVatReturnCsv(vat: VatReturnSummary, filename?: string) {
  const safePeriod = vat.periodLabel.replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 40);
  downloadTextFile(filename || `VAT_Return_${safePeriod}.csv`, vatReturnToCsv(vat));
}
