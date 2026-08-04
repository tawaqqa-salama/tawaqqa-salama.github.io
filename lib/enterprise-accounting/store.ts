/**
 * Demo / offline store for Enterprise Accounting hub
 */

import { buildDefaultChartOfAccounts } from "./coa-template";
import { BUILTIN_ACCOUNTING_RULES } from "./rules-catalog";
import { buildDashboardKpis, buildTrialBalance, type PostedLine } from "./statements";
import { buildVatReturn } from "./vat";
import { runInternalAudit, type AuditJournal } from "./audit";
import { buildAging } from "./aging";
import { ensureProjectCostCenters, projectProfitabilityReport } from "./project-accounting";
import type {
  AccountingRule,
  ChartAccount,
  CostCenter,
  FinancialDashboardKpis,
  FiscalYear,
  JournalEntryDraft,
} from "./types";

const STORAGE_KEY = "tawaqqa.enterprise.accounting.v1";

export interface EnterpriseAccountingState {
  accounts: ChartAccount[];
  costCenters: CostCenter[];
  fiscalYear: FiscalYear;
  rules: AccountingRule[];
  journals: (JournalEntryDraft & {
    id: string;
    status: string;
    entryNumber: string;
    createdAt: string;
  })[];
  arOpen: { id: string; partyName: string; dueDate: string; balance: number }[];
  apOpen: { id: string; partyName: string; dueDate: string; balance: number }[];
  projects: {
    id: string;
    code: string;
    nameAr: string;
    nameEn: string;
    budget: number;
    committedCost: number;
  }[];
  bankAccounts: {
    id: string;
    nameAr: string;
    nameEn: string;
    balance: number;
    currency: string;
  }[];
  assets: {
    id: string;
    code: string;
    nameAr: string;
    nameEn: string;
    cost: number;
    accumDep: number;
    usefulLifeMonths: number;
  }[];
  budgets: {
    id: string;
    nameAr: string;
    nameEn: string;
    amount: number;
    actual: number;
    status: "draft" | "approved" | "revised";
  }[];
}

function defaultFiscalYear(): FiscalYear {
  const year = 2026;
  const periods = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const start = `${year}-${String(m).padStart(2, "0")}-01`;
    const endDate = new Date(year, m, 0);
    const end = endDate.toISOString().slice(0, 10);
    return {
      id: `fp-${year}-${m}`,
      fiscalYearId: `fy-${year}`,
      periodNumber: m,
      nameAr: `فترة ${m}`,
      nameEn: `Period ${m}`,
      startDate: start,
      endDate: end,
      status: "open" as const,
    };
  });
  return {
    id: `fy-${year}`,
    code: String(year),
    nameAr: `السنة المالية ${year}`,
    nameEn: `Fiscal Year ${year}`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    status: "open",
    isCurrent: true,
    periods,
  };
}

export function createDemoState(): EnterpriseAccountingState {
  const accounts = buildDefaultChartOfAccounts();
  const projects = [
    {
      id: "prj-1",
      code: "P-1001",
      nameAr: "مشروع أنظمة الإطفاء — الرياض",
      nameEn: "Fire Systems Project — Riyadh",
      budget: 850000,
      committedCost: 120000,
    },
    {
      id: "prj-2",
      code: "P-1002",
      nameAr: "مشروع السلامة — جدة",
      nameEn: "Safety Project — Jeddah",
      budget: 420000,
      committedCost: 45000,
    },
  ];
  let costCenters: CostCenter[] = [
    {
      id: "cc-hq",
      code: "CC-HQ",
      nameAr: "الإدارة العامة",
      nameEn: "Headquarters",
      parentId: null,
      branchId: null,
      projectId: null,
      isActive: true,
      autoFromProject: false,
    },
  ];
  costCenters = ensureProjectCostCenters(projects, costCenters);

  const journals: EnterpriseAccountingState["journals"] = [
    {
      id: "je-demo-1",
      entryNumber: "JE-2026-0001",
      entryDate: "2026-07-01",
      entryType: "manual",
      description: "فاتورة خدمات استشارية — عميل أ",
      status: "posted",
      createdAt: "2026-07-01T10:00:00Z",
      projectId: "prj-1",
      costCenterId: costCenters.find((c) => c.projectId === "prj-1")?.id,
      lines: [
        {
          accountCode: "112001",
          debit: 115000,
          credit: 0,
          vatCategory: "standard_15",
          vatAmount: 15000,
        },
        { accountCode: "4100", debit: 0, credit: 100000, projectId: "prj-1" },
        { accountCode: "2120", debit: 0, credit: 15000, vatCategory: "standard_15" },
      ],
      attachments: [{ name: "invoice.pdf", url: "#" }],
    },
    {
      id: "je-demo-2",
      entryNumber: "JE-2026-0002",
      entryDate: "2026-07-15",
      entryType: "manual",
      description: "تكلفة مواد مشروع",
      status: "posted",
      createdAt: "2026-07-15T10:00:00Z",
      projectId: "prj-1",
      costCenterId: costCenters.find((c) => c.projectId === "prj-1")?.id,
      lines: [
        {
          accountCode: "5100",
          debit: 40000,
          credit: 0,
          projectId: "prj-1",
          vatCategory: "standard_15",
        },
        {
          accountCode: "1130",
          debit: 6000,
          credit: 0,
          vatCategory: "standard_15",
          vatAmount: 6000,
        },
        { accountCode: "211001", debit: 0, credit: 46000 },
      ],
    },
  ];

  return {
    accounts,
    costCenters,
    fiscalYear: defaultFiscalYear(),
    rules: BUILTIN_ACCOUNTING_RULES,
    journals,
    arOpen: [
      {
        id: "ar-1",
        partyName: "عميل أ",
        dueDate: "2026-06-01",
        balance: 115000,
      },
      {
        id: "ar-2",
        partyName: "عميل ب",
        dueDate: "2026-07-20",
        balance: 23000,
      },
    ],
    apOpen: [
      {
        id: "ap-1",
        partyName: "مورد المواد",
        dueDate: "2026-07-01",
        balance: 46000,
      },
    ],
    projects,
    bankAccounts: [
      {
        id: "bank-1",
        nameAr: "البنك الأهلي — جاري",
        nameEn: "SNB — Current",
        balance: 520000,
        currency: "SAR",
      },
      {
        id: "cash-1",
        nameAr: "الصندوق",
        nameEn: "Cash",
        balance: 15000,
        currency: "SAR",
      },
    ],
    assets: [
      {
        id: "fa-1",
        code: "FA-001",
        nameAr: "معدات فحص",
        nameEn: "Inspection Equipment",
        cost: 120000,
        accumDep: 24000,
        usefulLifeMonths: 60,
      },
    ],
    budgets: [
      {
        id: "bud-1",
        nameAr: "موازنة التشغيل 2026",
        nameEn: "Operating Budget 2026",
        amount: 2000000,
        actual: 640000,
        status: "approved",
      },
    ],
  };
}

export function loadEnterpriseState(): EnterpriseAccountingState {
  if (typeof window === "undefined") return createDemoState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDemoState();
    return { ...createDemoState(), ...JSON.parse(raw) } as EnterpriseAccountingState;
  } catch {
    return createDemoState();
  }
}

export function saveEnterpriseState(state: EnterpriseAccountingState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function journalsToPostedLines(
  journals: EnterpriseAccountingState["journals"]
): PostedLine[] {
  const lines: PostedLine[] = [];
  for (const j of journals) {
    if (j.status !== "posted" && j.status !== "مرحّل") continue;
    for (const line of j.lines) {
      lines.push({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        entryDate: j.entryDate,
        projectId: line.projectId ?? j.projectId,
        costCenterId: line.costCenterId ?? j.costCenterId,
        isOpening: j.entryType === "opening",
      });
    }
  }
  return lines;
}

export function deriveDashboard(state: EnterpriseAccountingState): FinancialDashboardKpis {
  const lines = journalsToPostedLines(state.journals);
  const tb = buildTrialBalance(state.accounts, lines);
  let revenue = 0;
  let expenses = 0;
  for (const row of tb) {
    if (row.accountType === "revenue") {
      revenue += row.closingCredit - row.closingDebit;
    }
    if (row.accountType === "expense") {
      expenses += row.closingDebit - row.closingCredit;
    }
  }
  const bankBalance = state.bankAccounts.reduce((s, b) => s + b.balance, 0);
  const receivables = state.arOpen.reduce((s, r) => s + r.balance, 0);
  const payables = state.apOpen.reduce((s, r) => s + r.balance, 0);
  const vatLines = state.journals.flatMap((j) =>
    j.lines
      .filter((l) => l.vatAmount || l.vatCategory === "standard_15")
      .map((l) => ({
        netAmount: Math.max(l.debit, l.credit) - (l.vatAmount || 0),
        vatAmount: l.vatAmount || 0,
        category: (l.vatCategory || "standard_15") as "standard_15",
        direction: (l.accountCode.startsWith("4") || l.accountCode === "2120"
          ? "sale"
          : "purchase") as "sale" | "purchase",
      }))
  );
  // Simpler VAT due from control accounts
  const vatOut = tb.find((r) => r.accountCode === "2120");
  const vatIn = tb.find((r) => r.accountCode === "1130");
  const vatDue =
    (vatOut ? vatOut.closingCredit - vatOut.closingDebit : 0) -
    (vatIn ? vatIn.closingDebit - vatIn.closingCredit : 0);

  const projects = projectProfitabilityReport(
    state.projects,
    state.costCenters,
    lines
  );
  const projectProfit = projects.reduce((s, p) => s + p.profit, 0);
  const budget = state.budgets[0];
  const budgetPct = budget ? (budget.actual / budget.amount) * 100 : 0;

  void vatLines;
  void buildVatReturn;

  return buildDashboardKpis({
    revenue,
    expenses,
    receivables,
    payables,
    bankBalance,
    vatDue,
    cashFlow: bankBalance * 0.02,
    projectProfit,
    budgetPct,
  });
}

export function deriveAudit(state: EnterpriseAccountingState) {
  const journals: AuditJournal[] = state.journals.map((j) => ({
    id: j.id,
    entryNumber: j.entryNumber,
    entryDate: j.entryDate,
    description: j.description,
    status: j.status,
    createdAt: j.createdAt,
    attachments: j.attachments,
    sourceModule: j.sourceModule,
    lines: j.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.debit,
      credit: l.credit,
      vatAmount: l.vatAmount,
      vatCategory: l.vatCategory,
    })),
  }));
  return runInternalAudit(journals);
}

export function deriveAging(state: EnterpriseAccountingState) {
  return {
    ar: buildAging(state.arOpen),
    ap: buildAging(state.apOpen),
  };
}
