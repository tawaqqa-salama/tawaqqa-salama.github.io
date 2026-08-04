/**
 * AI Accounting Copilot — NEVER posts freely.
 * Reads transaction → validates via Rules Engine → suggests journal + explanations.
 */

import { getAccountByMapping } from "./coa-template";
import { validateJournalEntry } from "./rules-engine";
import { calcVat } from "./vat";
import type {
  ChartAccount,
  CopilotSuggestion,
  FiscalYear,
  JournalEntryDraft,
  VatCategory,
} from "./types";

export interface CopilotTransactionInput {
  descriptionAr: string;
  descriptionEn: string;
  amount: number;
  /** Net amount before VAT */
  vatCategory?: VatCategory;
  includeVat?: boolean;
  direction: "sale" | "purchase" | "expense" | "receipt" | "payment" | "transfer";
  projectId?: string | null;
  costCenterId?: string | null;
  entryDate?: string;
  currencyCode?: string;
  exchangeRate?: number;
  counterpartyName?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildSuggestedEntry(
  tx: CopilotTransactionInput,
  accounts: ChartAccount[]
): JournalEntryDraft | null {
  const net = round2(tx.amount);
  if (!(net > 0)) return null;

  const vatCat = tx.vatCategory ?? "standard_15";
  const vat = tx.includeVat !== false ? calcVat(net, vatCat) : 0;
  const gross = round2(net + vat);
  const date = tx.entryDate || new Date().toISOString().slice(0, 10);

  const ar = getAccountByMapping(accounts, "ar_control");
  const ap = getAccountByMapping(accounts, "ap_control");
  const cash = getAccountByMapping(accounts, "cash");
  const bank = getAccountByMapping(accounts, "bank");
  const rev = getAccountByMapping(accounts, "project_revenue") ||
    getAccountByMapping(accounts, "service_revenue");
  const exp =
    getAccountByMapping(accounts, "project_cost") ||
    getAccountByMapping(accounts, "ga_expense");
  const vatOut = getAccountByMapping(accounts, "vat_output");
  const vatIn = getAccountByMapping(accounts, "vat_input");

  const base: JournalEntryDraft = {
    entryDate: date,
    entryType: "automatic",
    description: tx.descriptionAr || tx.descriptionEn,
    currencyCode: tx.currencyCode || "SAR",
    exchangeRate: tx.exchangeRate || 1,
    projectId: tx.projectId ?? null,
    costCenterId: tx.costCenterId ?? null,
    sourceModule: "ai_copilot",
    lines: [],
    requiresApproval: true,
  };

  if (tx.direction === "sale" && ar && rev) {
    const lines = [
      {
        accountCode: ar.code,
        debit: gross,
        credit: 0,
        description: tx.descriptionEn,
        projectId: tx.projectId,
        costCenterId: tx.costCenterId,
        vatCategory: vatCat,
        vatAmount: vat,
      },
      {
        accountCode: rev.code,
        debit: 0,
        credit: net,
        description: tx.descriptionEn,
        projectId: tx.projectId,
        costCenterId: tx.costCenterId,
        vatCategory: vatCat,
      },
    ];
    if (vat > 0 && vatOut) {
      lines.push({
        accountCode: vatOut.code,
        debit: 0,
        credit: vat,
        description: "Output VAT 15%",
        vatCategory: "standard_15",
        vatAmount: vat,
        projectId: tx.projectId,
        costCenterId: tx.costCenterId,
      });
    }
    return { ...base, lines };
  }

  if ((tx.direction === "purchase" || tx.direction === "expense") && ap && exp) {
    const lines = [
      {
        accountCode: exp.code,
        debit: net,
        credit: 0,
        description: tx.descriptionEn,
        projectId: tx.projectId,
        costCenterId: tx.costCenterId,
        vatCategory: vatCat,
      },
      {
        accountCode: ap.code,
        debit: 0,
        credit: gross,
        description: tx.descriptionEn,
        projectId: tx.projectId,
        costCenterId: tx.costCenterId,
        vatCategory: vatCat,
        vatAmount: vat,
      },
    ];
    if (vat > 0 && vatIn) {
      lines.splice(1, 0, {
        accountCode: vatIn.code,
        debit: vat,
        credit: 0,
        description: "Input VAT 15%",
        vatCategory: "standard_15",
        vatAmount: vat,
        projectId: tx.projectId,
        costCenterId: tx.costCenterId,
      });
    }
    return { ...base, lines };
  }

  if (tx.direction === "receipt" && (bank || cash) && ar) {
    const cashAcc = bank || cash!;
    return {
      ...base,
      lines: [
        {
          accountCode: cashAcc.code,
          debit: net,
          credit: 0,
          description: tx.descriptionEn,
        },
        {
          accountCode: ar.code,
          debit: 0,
          credit: net,
          description: tx.descriptionEn,
        },
      ],
    };
  }

  if (tx.direction === "payment" && (bank || cash) && ap) {
    const cashAcc = bank || cash!;
    return {
      ...base,
      lines: [
        {
          accountCode: ap.code,
          debit: net,
          credit: 0,
          description: tx.descriptionEn,
        },
        {
          accountCode: cashAcc.code,
          debit: 0,
          credit: net,
          description: tx.descriptionEn,
        },
      ],
    };
  }

  if (tx.direction === "transfer" && cash && bank) {
    return {
      ...base,
      lines: [
        {
          accountCode: bank.code,
          debit: net,
          credit: 0,
          description: tx.descriptionEn,
        },
        {
          accountCode: cash.code,
          debit: 0,
          credit: net,
          description: tx.descriptionEn,
        },
      ],
    };
  }

  return null;
}

/**
 * Suggest a journal entry. Never returns a postable free-form entry without rules validation.
 */
export function suggestJournalFromTransaction(
  tx: CopilotTransactionInput,
  accounts: ChartAccount[],
  fiscalYear?: FiscalYear | null
): CopilotSuggestion {
  const suggested = buildSuggestedEntry(tx, accounts);

  if (!suggested) {
    return {
      suggestedEntry: null,
      explanationAr:
        "تعذر بناء قيد مقترح — بيانات غير كافية أو حسابات التعيين ناقصة",
      explanationEn:
        "Could not build a suggestion — insufficient data or missing mapped accounts",
      validation: {
        valid: false,
        canPost: false,
        canSuggest: false,
        violations: [],
        warnings: [],
        infos: [],
      },
      ifrsReferences: [],
      socpaReferences: [],
      zatcaReferences: [],
      vatReferences: [],
      blockedReasonAr: "لا يوجد قالب قيد مطابق للمعاملة",
      blockedReasonEn: "No matching journal template for this transaction",
    };
  }

  const validation = validateJournalEntry(suggested, {
    accounts,
    fiscalYear: fiscalYear ?? null,
    intent: "suggest",
    fromAi: true,
  });

  const ifrsReferences = [
    ...new Set(
      [...validation.violations, ...validation.warnings]
        .map((v) => v.ifrsReference)
        .filter(Boolean) as string[]
    ),
  ];
  const socpaReferences = [
    ...new Set(
      [...validation.violations, ...validation.warnings]
        .map((v) => v.socpaReference)
        .filter(Boolean) as string[]
    ),
  ];
  const zatcaReferences = [
    ...new Set(
      [...validation.violations, ...validation.warnings]
        .map((v) => v.zatcaReference)
        .filter(Boolean) as string[]
    ),
  ];
  const vatReferences = [
    ...new Set(
      [...validation.violations, ...validation.warnings]
        .map((v) => v.vatReference)
        .filter(Boolean) as string[]
    ),
  ];

  // Always include baseline compliance refs when suggesting VAT sales
  if (tx.includeVat !== false && (tx.vatCategory ?? "standard_15") === "standard_15") {
    if (!vatReferences.length) {
      vatReferences.push("Saudi VAT Regulations — 15% standard rate");
    }
    if (!zatcaReferences.length) {
      zatcaReferences.push("ZATCA FATOORA — tax invoice data requirements");
    }
  }
  if (tx.direction === "sale" && tx.projectId) {
    ifrsReferences.push("IFRS 15 Revenue from Contracts with Customers");
    socpaReferences.push("SOCPA adoption of IFRS 15");
  }

  if (!validation.canSuggest) {
    return {
      suggestedEntry: null,
      explanationAr:
        "تم رفض الاقتراح لأنه يخالف محرك القواعد المحاسبية — لا يُسمح بالترحيل الحر",
      explanationEn:
        "Suggestion rejected: violates Accounting Rules Engine — free posting is not allowed",
      validation,
      ifrsReferences,
      socpaReferences,
      zatcaReferences,
      vatReferences,
      blockedReasonAr: validation.violations
        .map((v) => `[${v.ruleCode}] ${v.messageAr}`)
        .join("؛ "),
      blockedReasonEn: validation.violations
        .map((v) => `[${v.ruleCode}] ${v.messageEn}`)
        .join("; "),
    };
  }

  return {
    suggestedEntry: suggested,
    explanationAr: `تم اقتراح قيد مزدوج بعد التحقق من القواعد (IFRS/SOCPA/ضريبة القيمة المضافة/ZATCA). المبلغ الصافي ${tx.amount} ر.س — النوع: ${tx.direction}. الذكاء الاصطناعي لا يرحّل تلقائياً.`,
    explanationEn: `Double-entry suggested after rules validation (IFRS/SOCPA/VAT/ZATCA). Net ${tx.amount} SAR — type: ${tx.direction}. AI never auto-posts.`,
    validation,
    ifrsReferences,
    socpaReferences,
    zatcaReferences,
    vatReferences,
  };
}
