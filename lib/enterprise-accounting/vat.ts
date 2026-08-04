/**
 * Saudi VAT helpers — 15% standard, zero-rated, exempt, out of scope
 */

import type { VatCategory, VatReturnSummary } from "./types";

export const SAUDI_STANDARD_VAT_RATE = 0.15;

export const VAT_CATEGORY_LABELS: Record<
  VatCategory,
  { ar: string; en: string; rate: number }
> = {
  standard_15: { ar: "خاضع 15%", en: "Standard 15%", rate: 0.15 },
  zero_rated: { ar: "صفري", en: "Zero-rated", rate: 0 },
  exempt: { ar: "معفى", en: "Exempt", rate: 0 },
  out_of_scope: { ar: "خارج النطاق", en: "Out of scope", rate: 0 },
  not_applicable: { ar: "غير منطبق", en: "N/A", rate: 0 },
};

export function calcVat(netAmount: number, category: VatCategory): number {
  const rate = VAT_CATEGORY_LABELS[category]?.rate ?? 0;
  return Math.round(netAmount * rate * 100) / 100;
}

export function validateVatAmount(
  netAmount: number,
  vatAmount: number,
  category: VatCategory
): { ok: boolean; expected: number; messageAr: string; messageEn: string } {
  const expected = calcVat(netAmount, category);
  const ok = Math.abs(expected - vatAmount) < 0.005;
  return {
    ok,
    expected,
    messageAr: ok
      ? "ضريبة صحيحة"
      : `ضريبة غير صحيحة — المتوقع ${expected}`,
    messageEn: ok
      ? "VAT amount valid"
      : `Invalid VAT — expected ${expected}`,
  };
}

export interface VatLineInput {
  netAmount: number;
  vatAmount: number;
  category: VatCategory;
  direction: "sale" | "purchase";
}

export function buildVatReturn(
  lines: VatLineInput[],
  periodLabel: string
): VatReturnSummary {
  let standardRatedSales = 0;
  let outputVat = 0;
  let zeroRatedSales = 0;
  let exemptSales = 0;
  let standardRatedPurchases = 0;
  let inputVat = 0;

  for (const line of lines) {
    if (line.direction === "sale") {
      if (line.category === "standard_15") {
        standardRatedSales += line.netAmount;
        outputVat += line.vatAmount;
      } else if (line.category === "zero_rated") {
        zeroRatedSales += line.netAmount;
      } else if (line.category === "exempt" || line.category === "out_of_scope") {
        exemptSales += line.netAmount;
      }
    } else if (line.category === "standard_15") {
      standardRatedPurchases += line.netAmount;
      inputVat += line.vatAmount;
    }
  }

  const r = (n: number) => Math.round(n * 100) / 100;

  return {
    periodLabel,
    standardRatedSales: r(standardRatedSales),
    outputVat: r(outputVat),
    zeroRatedSales: r(zeroRatedSales),
    exemptSales: r(exemptSales),
    standardRatedPurchases: r(standardRatedPurchases),
    inputVat: r(inputVat),
    netVatDue: r(outputVat - inputVat),
    currency: "SAR",
  };
}
