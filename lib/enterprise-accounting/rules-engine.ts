/**
 * Accounting Rules Engine — rejects invalid postings; gates AI suggestions.
 */

import { getEnabledRules } from "./rules-catalog";
import type {
  AccountingRule,
  ChartAccount,
  FiscalPeriod,
  FiscalYear,
  JournalEntryDraft,
  RuleViolation,
  ValidationResult,
  VatCategory,
} from "./types";

const EPS = 0.005;
const STANDARD_VAT = 0.15;

export interface RulesContext {
  accounts: ChartAccount[];
  fiscalYear?: FiscalYear | null;
  period?: FiscalPeriod | null;
  /** True when posting (stricter) vs draft save */
  intent: "draft" | "post" | "suggest";
  /** Source is AI copilot */
  fromAi?: boolean;
  /** Checker already approved */
  approved?: boolean;
  /** ZATCA Phase 2 invoice metadata */
  zatca?: {
    phase: 1 | 2;
    uuid?: string | null;
    isEInvoice?: boolean;
  };
  rules?: AccountingRule[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineNet(debit: number, credit: number): number {
  return Math.max(debit, credit);
}

function accountMap(accounts: ChartAccount[]): Map<string, ChartAccount> {
  return new Map(accounts.map((a) => [a.code, a]));
}

function findPeriodForDate(
  fy: FiscalYear | null | undefined,
  date: string
): FiscalPeriod | null {
  if (!fy?.periods?.length) return null;
  return (
    fy.periods.find((p) => p.startDate <= date && p.endDate >= date) ?? null
  );
}

function violation(
  rule: AccountingRule,
  messageAr: string,
  messageEn: string,
  field?: string
): RuleViolation {
  return {
    ruleCode: rule.code,
    category: rule.category,
    severity: rule.severity,
    messageAr,
    messageEn,
    field,
    ifrsReference: rule.ifrsReference,
    socpaReference: rule.socpaReference,
    zatcaReference: rule.zatcaReference,
    vatReference: rule.vatReference,
  };
}

function expectedVat(net: number, category: VatCategory | undefined): number {
  if (category === "standard_15") return round2(net * STANDARD_VAT);
  return 0;
}

export function validateJournalEntry(
  entry: JournalEntryDraft,
  ctx: RulesContext
): ValidationResult {
  const rules = getEnabledRules(ctx.rules);
  const byCheck = new Map(rules.map((r) => [r.checkId, r]));
  const accounts = accountMap(ctx.accounts);
  const violations: RuleViolation[] = [];

  const add = (checkId: string, ar: string, en: string, field?: string) => {
    const rule = byCheck.get(checkId);
    if (!rule) return;
    violations.push(violation(rule, ar, en, field));
  };

  // JE-LIN-001
  if (entry.lines.length < 2) {
    add(
      "min_two_lines",
      "القيد يجب أن يحتوي على سطرين على الأقل",
      "Journal must have at least two lines"
    );
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < entry.lines.length; i++) {
    const line = entry.lines[i];
    const debit = round2(Number(line.debit || 0));
    const credit = round2(Number(line.credit || 0));
    totalDebit += debit;
    totalCredit += credit;
    const field = `lines[${i}]`;

    if (debit === 0 && credit === 0) {
      add(
        "no_zero_lines",
        `السطر ${i + 1}: مبلغ صفري غير مسموح`,
        `Line ${i + 1}: zero amount not allowed`,
        field
      );
    }
    if (debit > 0 && credit > 0) {
      add(
        "single_side_per_line",
        `السطر ${i + 1}: لا يمكن الجمع بين مدين ودائن`,
        `Line ${i + 1}: cannot have both debit and credit`,
        field
      );
    }

    const account = accounts.get(line.accountCode);
    if (!account) {
      add(
        "account_exists",
        `الحساب ${line.accountCode} غير موجود`,
        `Account ${line.accountCode} not found`,
        field
      );
      continue;
    }
    if (!account.isPostable || !account.isActive || account.isLocked) {
      add(
        "account_postable",
        `الحساب ${line.accountCode} غير قابل للترحيل`,
        `Account ${line.accountCode} is not postable`,
        field
      );
    }

    const ccId = line.costCenterId ?? entry.costCenterId;
    if (account.costCenterRequired && !ccId) {
      add(
        "cost_center_required",
        `الحساب ${line.accountCode} يتطلب مركز تكلفة`,
        `Account ${line.accountCode} requires a cost center`,
        field
      );
    }

    const projectId = line.projectId ?? entry.projectId;
    if (account.projectRequired && !projectId) {
      add(
        "project_required",
        `الحساب ${line.accountCode} يتطلب مشروع`,
        `Account ${line.accountCode} requires a project`,
        field
      );
    }

    const vatCat = line.vatCategory ?? account.vatCategory;
    const net = lineNet(debit, credit);
    const vatAmt = round2(Number(line.vatAmount || 0));

    if (vatCat === "standard_15" && net > 0) {
      const expected = expectedVat(net, "standard_15");
      // Only validate when VAT amount is explicitly provided on the line
      if (line.vatAmount !== undefined && Math.abs(vatAmt - expected) > EPS) {
        add(
          "vat_standard_rate",
          `السطر ${i + 1}: ضريبة القيمة المضافة يجب أن تكون 15% (${expected})`,
          `Line ${i + 1}: VAT must be 15% (${expected})`,
          field
        );
      }
    }
    if (vatCat === "zero_rated" && vatAmt > EPS) {
      add(
        "vat_zero_rated",
        `السطر ${i + 1}: التوريد الصفري لا يحمل ضريبة`,
        `Line ${i + 1}: zero-rated must have zero VAT`,
        field
      );
    }
    if (
      (vatCat === "exempt" || vatCat === "out_of_scope") &&
      vatAmt > EPS
    ) {
      add(
        "vat_exempt",
        `السطر ${i + 1}: الإعفاء/خارج النطاق لا يحمل ضريبة`,
        `Line ${i + 1}: exempt/out-of-scope must have zero VAT`,
        field
      );
    }

    if (
      account.mappingKey === "project_revenue" &&
      !projectId &&
      byCheck.has("ifrs15_project_link")
    ) {
      add(
        "ifrs15_project_link",
        "إيراد العقد يجب ربطه بمشروع وفق IFRS 15",
        "Contract revenue should link to a project (IFRS 15)",
        field
      );
    }
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);

  if (entry.lines.length >= 2 && Math.abs(totalDebit - totalCredit) > EPS) {
    add(
      "journal_balanced",
      `القيد غير متوازن: مدين ${totalDebit} ≠ دائن ${totalCredit}`,
      `Journal unbalanced: debit ${totalDebit} ≠ credit ${totalCredit}`
    );
  }
  if (entry.lines.length >= 2 && totalDebit <= 0) {
    add(
      "journal_balanced",
      "مجموع المدين يجب أن يكون أكبر من صفر",
      "Total debit must be greater than zero"
    );
  }

  const fy = ctx.fiscalYear ?? null;
  const period =
    ctx.period ?? findPeriodForDate(fy, entry.entryDate) ?? null;

  if (fy && (fy.status === "closed" || fy.status === "locked")) {
    add(
      "fiscal_year_open",
      "السنة المالية مقفلة — الترحيل مرفوض",
      "Fiscal year is locked — posting rejected"
    );
  }

  if (period && (period.status === "locked" || period.status === "closed")) {
    add(
      "period_open",
      `الفترة ${period.nameEn} مقفلة`,
      `Period ${period.nameEn} is locked`
    );
  }

  if (
    entry.entryType === "closing" &&
    period &&
    period.status !== "open" &&
    period.status !== "soft_closed"
  ) {
    add(
      "closing_entry_period",
      "قيود الإقفال غير مسموحة في هذه الفترة",
      "Closing entries not allowed in this period"
    );
  }

  const currency = entry.currencyCode || "SAR";
  if (currency !== "SAR") {
    const rate = Number(entry.exchangeRate || 0);
    if (!(rate > 0)) {
      add(
        "fx_rate_required",
        "سعر الصرف مطلوب للعملات الأجنبية",
        "Exchange rate required for foreign currency"
      );
    }
  }

  if (
    ctx.intent === "post" &&
    entry.entryType === "manual" &&
    totalDebit >= Number(byCheck.get("attachment_recommended")?.config?.thresholdSar ?? 10000) &&
    !(entry.attachments && entry.attachments.length > 0)
  ) {
    add(
      "attachment_recommended",
      "يُفضّل إرفاق مستند داعم للقيد اليدوي الكبير",
      "Supporting attachment recommended for large manual journal"
    );
  }

  const approvalThreshold = Number(
    byCheck.get("maker_checker")?.config?.thresholdSar ?? 5000
  );
  if (
    ctx.intent === "post" &&
    totalDebit >= approvalThreshold &&
    !ctx.approved &&
    (entry.requiresApproval !== false)
  ) {
    add(
      "maker_checker",
      "يتطلب اعتماد المراجع (Maker/Checker) قبل الترحيل",
      "Checker approval required before posting"
    );
  }

  if (
    ctx.zatca?.isEInvoice &&
    ctx.zatca.phase === 2 &&
    !ctx.zatca.uuid
  ) {
    add(
      "zatca_uuid_required",
      "فاتورة المرحلة الثانية تتطلب UUID",
      "Phase 2 e-invoice requires UUID"
    );
  }

  if (ctx.fromAi && ctx.intent === "post") {
    // AI never posts freely — always blocked at posting intent from AI
    add(
      "ai_rules_gate",
      "الذكاء الاصطناعي لا يرحّل القيود مباشرة — اقتراح فقط بعد التحقق",
      "AI cannot post journals directly — suggestions only after validation"
    );
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");
  const infos = violations.filter((v) => v.severity === "info");

  // For suggest intent, warnings don't block suggestion if no errors
  const blocking = errors;
  const canSuggest = blocking.length === 0;
  const canPost =
    ctx.intent === "post"
      ? blocking.length === 0
      : ctx.intent === "draft"
        ? errors.filter((e) => e.ruleCode !== "APR-MKR-001").length === 0
        : canSuggest;

  return {
    valid: blocking.length === 0,
    canPost: ctx.intent === "post" ? canPost : false,
    canSuggest,
    violations: errors,
    warnings,
    infos,
  };
}

export function assertCanPost(
  entry: JournalEntryDraft,
  ctx: Omit<RulesContext, "intent">
): ValidationResult {
  return validateJournalEntry(entry, { ...ctx, intent: "post" });
}

export function summarizeViolations(
  result: ValidationResult,
  lang: "ar" | "en" = "ar"
): string[] {
  const all = [...result.violations, ...result.warnings];
  return all.map((v) =>
    lang === "ar"
      ? `[${v.ruleCode}] ${v.messageAr}`
      : `[${v.ruleCode}] ${v.messageEn}`
  );
}
