/**
 * AI Internal Audit — detect anomalies; generate findings
 */

import type { AuditFinding } from "./types";

/** Minimal posted journal shape for audit */
export interface AuditJournal {
  id: string;
  entryNumber?: string;
  entryDate: string;
  description: string;
  status: string;
  approvedAt?: string | null;
  createdAt?: string;
  attachments?: { name: string; url: string }[];
  lines: {
    accountCode: string;
    debit: number;
    credit: number;
    vatAmount?: number;
    vatCategory?: string;
  }[];
  sourceModule?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fingerprint(j: AuditJournal): string {
  const parts = j.lines
    .map((l) => `${l.accountCode}:${l.debit}:${l.credit}`)
    .sort()
    .join("|");
  return `${j.entryDate}|${round2(
    j.lines.reduce((s, l) => s + l.debit, 0)
  )}|${parts}`;
}

export function runInternalAudit(
  journals: AuditJournal[],
  options?: {
    periodLockedDates?: string[];
    requireAttachmentAbove?: number;
  }
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Map<string, string>();
  const threshold = options?.requireAttachmentAbove ?? 10000;
  const locked = new Set(options?.periodLockedDates ?? []);

  for (const j of journals) {
    const totalDebit = round2(j.lines.reduce((s, l) => s + Number(l.debit || 0), 0));
    const totalCredit = round2(
      j.lines.reduce((s, l) => s + Number(l.credit || 0), 0)
    );

    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      findings.push({
        id: `unbal-${j.id}`,
        findingType: "unbalanced_journal",
        severity: "critical",
        titleAr: "قيد غير متوازن",
        titleEn: "Unbalanced journal",
        descriptionAr: `القيد ${j.entryNumber || j.id}: مدين ${totalDebit} ≠ دائن ${totalCredit}`,
        descriptionEn: `Entry ${j.entryNumber || j.id}: debit ${totalDebit} ≠ credit ${totalCredit}`,
        status: "open",
        relatedDocumentType: "journal",
        relatedDocumentId: j.id,
      });
    }

    const fp = fingerprint(j);
    const prev = seen.get(fp);
    if (prev) {
      findings.push({
        id: `dup-${j.id}`,
        findingType: "duplicate_entry",
        severity: "error",
        titleAr: "قيد مكرر محتمل",
        titleEn: "Possible duplicate entry",
        descriptionAr: `يشبه القيد ${prev}`,
        descriptionEn: `Similar to entry ${prev}`,
        status: "open",
        relatedDocumentType: "journal",
        relatedDocumentId: j.id,
      });
    } else {
      seen.set(fp, j.entryNumber || j.id);
    }

    const hasVatAccount = j.lines.some(
      (l) =>
        l.accountCode.includes("2120") ||
        l.accountCode.includes("1130") ||
        l.vatAmount
    );
    const looksTaxable = j.lines.some(
      (l) =>
        l.accountCode.startsWith("4") ||
        l.accountCode.startsWith("5") ||
        l.vatCategory === "standard_15"
    );
    if (looksTaxable && !hasVatAccount && totalDebit > 0) {
      findings.push({
        id: `vat-${j.id}`,
        findingType: "missing_vat",
        severity: "warning",
        titleAr: "ضريبة قيمة مضافة مفقودة محتملة",
        titleEn: "Possible missing VAT",
        descriptionAr: `القيد ${j.entryNumber || j.id} قد يتطلب معالجة ضريبية`,
        descriptionEn: `Entry ${j.entryNumber || j.id} may require VAT treatment`,
        status: "open",
        relatedDocumentType: "journal",
        relatedDocumentId: j.id,
      });
    }

    if (
      totalDebit >= threshold &&
      !(j.attachments && j.attachments.length > 0) &&
      j.sourceModule !== "automatic"
    ) {
      findings.push({
        id: `att-${j.id}`,
        findingType: "missing_attachment",
        severity: "warning",
        titleAr: "مرفق مفقود",
        titleEn: "Missing attachment",
        descriptionAr: `قيد بمبلغ ${totalDebit} بدون مرفقات`,
        descriptionEn: `Journal of ${totalDebit} without attachments`,
        status: "open",
        relatedDocumentType: "journal",
        relatedDocumentId: j.id,
      });
    }

    if (
      j.status === "pending_approval" &&
      j.createdAt &&
      Date.now() - new Date(j.createdAt).getTime() > 3 * 24 * 60 * 60 * 1000
    ) {
      findings.push({
        id: `late-${j.id}`,
        findingType: "late_approval",
        severity: "warning",
        titleAr: "تأخر في الاعتماد",
        titleEn: "Late approval",
        descriptionAr: `القيد ${j.entryNumber || j.id} بانتظار الاعتماد لأكثر من 3 أيام`,
        descriptionEn: `Entry ${j.entryNumber || j.id} pending approval > 3 days`,
        status: "open",
        relatedDocumentType: "journal",
        relatedDocumentId: j.id,
      });
    }

    if (locked.has(j.entryDate) && j.status === "posted") {
      findings.push({
        id: `per-${j.id}`,
        findingType: "period_violation",
        severity: "critical",
        titleAr: "ترحيل في فترة مقفلة",
        titleEn: "Posted in locked period",
        descriptionAr: `تاريخ ${j.entryDate} ضمن فترة مقفلة`,
        descriptionEn: `Date ${j.entryDate} falls in a locked period`,
        status: "open",
        relatedDocumentType: "journal",
        relatedDocumentId: j.id,
      });
    }

    // Suspicious: round-number journals above 100k with single-line description empty
    if (totalDebit >= 100000 && totalDebit % 1000 === 0 && !j.description?.trim()) {
      findings.push({
        id: `sus-${j.id}`,
        findingType: "suspicious_transaction",
        severity: "warning",
        titleAr: "معاملة مشبوهة",
        titleEn: "Suspicious transaction",
        descriptionAr: "مبلغ دائري كبير بدون وصف",
        descriptionEn: "Large round amount without description",
        status: "open",
        relatedDocumentType: "journal",
        relatedDocumentId: j.id,
      });
    }

    for (const line of j.lines) {
      if (!line.accountCode) {
        findings.push({
          id: `acc-${j.id}-${line.accountCode}`,
          findingType: "wrong_accounts",
          severity: "error",
          titleAr: "حساب غير صحيح",
          titleEn: "Wrong / missing account",
          descriptionAr: `القيد ${j.entryNumber || j.id} يحتوي سطر بدون حساب`,
          descriptionEn: `Entry ${j.entryNumber || j.id} has a line without account`,
          status: "open",
          relatedDocumentType: "journal",
          relatedDocumentId: j.id,
        });
      }
    }
  }

  return findings;
}

export function auditReportSummary(findings: AuditFinding[]): {
  total: number;
  critical: number;
  errors: number;
  warnings: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  let critical = 0;
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    byType[f.findingType] = (byType[f.findingType] || 0) + 1;
    if (f.severity === "critical") critical++;
    else if (f.severity === "error") errors++;
    else warnings++;
  }
  return { total: findings.length, critical, errors, warnings, byType };
}
