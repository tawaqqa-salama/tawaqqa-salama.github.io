/**
 * Financial statement builders — Trial Balance, BS, IS, CF, Equity
 */

import type {
  ChartAccount,
  FinancialDashboardKpis,
  ProjectLedgerSummary,
  StatementLine,
  TrialBalanceRow,
} from "./types";

export interface PostedLine {
  accountCode: string;
  debit: number;
  credit: number;
  entryDate: string;
  projectId?: string | null;
  costCenterId?: string | null;
  isOpening?: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildTrialBalance(
  accounts: ChartAccount[],
  lines: PostedLine[],
  fromDate?: string,
  toDate?: string
): TrialBalanceRow[] {
  const byCode = new Map<
    string,
    { od: number; oc: number; pd: number; pc: number }
  >();

  for (const a of accounts.filter((x) => x.isPostable)) {
    byCode.set(a.code, {
      od: a.openingBalanceSide === "debit" ? a.openingBalance : 0,
      oc: a.openingBalanceSide === "credit" ? a.openingBalance : 0,
      pd: 0,
      pc: 0,
    });
  }

  for (const line of lines) {
    const row = byCode.get(line.accountCode);
    if (!row) continue;
    if (line.isOpening) {
      row.od += line.debit;
      row.oc += line.credit;
      continue;
    }
    if (fromDate && line.entryDate < fromDate) {
      row.od += line.debit;
      row.oc += line.credit;
      continue;
    }
    if (toDate && line.entryDate > toDate) continue;
    row.pd += line.debit;
    row.pc += line.credit;
  }

  const result: TrialBalanceRow[] = [];
  for (const a of accounts.filter((x) => x.isPostable)) {
    const r = byCode.get(a.code)!;
    const closeDebit = r.od + r.pd;
    const closeCredit = r.oc + r.pc;
    const net = closeDebit - closeCredit;
    result.push({
      accountCode: a.code,
      accountNameAr: a.nameAr,
      accountNameEn: a.nameEn,
      accountType: a.accountType,
      openingDebit: round2(r.od),
      openingCredit: round2(r.oc),
      periodDebit: round2(r.pd),
      periodCredit: round2(r.pc),
      closingDebit: round2(net >= 0 ? net : 0),
      closingCredit: round2(net < 0 ? -net : 0),
    });
  }
  return result;
}

function sumType(
  tb: TrialBalanceRow[],
  types: ChartAccount["accountType"][],
  side: "debit" | "credit"
): number {
  let total = 0;
  for (const row of tb) {
    if (!types.includes(row.accountType)) continue;
    if (side === "debit") total += row.closingDebit - row.closingCredit;
    else total += row.closingCredit - row.closingDebit;
  }
  return round2(total);
}

export function buildIncomeStatement(tb: TrialBalanceRow[]): StatementLine[] {
  const revenue = sumType(tb, ["revenue"], "credit");
  const expenses = sumType(tb, ["expense"], "debit");
  const net = round2(revenue - expenses);
  return [
    {
      code: "REV",
      labelAr: "الإيرادات",
      labelEn: "Revenue",
      amount: revenue,
      level: 1,
    },
    {
      code: "EXP",
      labelAr: "المصروفات",
      labelEn: "Expenses",
      amount: expenses,
      level: 1,
    },
    {
      code: "NI",
      labelAr: "صافي الدخل",
      labelEn: "Net Income",
      amount: net,
      level: 0,
      isTotal: true,
    },
  ];
}

export function buildBalanceSheet(tb: TrialBalanceRow[]): StatementLine[] {
  const assets = sumType(tb, ["asset"], "debit") - sumType(tb, ["contra_asset"], "credit");
  const liabilities =
    sumType(tb, ["liability"], "credit") -
    sumType(tb, ["contra_liability"], "debit");
  const equity = sumType(tb, ["equity"], "credit");
  const ni = buildIncomeStatement(tb).find((l) => l.code === "NI")?.amount ?? 0;
  const totalEquity = round2(equity + ni);
  return [
    {
      code: "AST",
      labelAr: "إجمالي الأصول",
      labelEn: "Total Assets",
      amount: round2(assets),
      level: 0,
      isTotal: true,
    },
    {
      code: "LIA",
      labelAr: "إجمالي الالتزامات",
      labelEn: "Total Liabilities",
      amount: round2(liabilities),
      level: 1,
    },
    {
      code: "EQY",
      labelAr: "حقوق الملكية (شامل صافي الدخل)",
      labelEn: "Equity (incl. net income)",
      amount: totalEquity,
      level: 1,
    },
    {
      code: "L+E",
      labelAr: "الالتزامات + حقوق الملكية",
      labelEn: "Liabilities + Equity",
      amount: round2(liabilities + totalEquity),
      level: 0,
      isTotal: true,
    },
  ];
}

export function buildCashFlowStatement(
  lines: PostedLine[],
  cashAccountCodes: string[]
): StatementLine[] {
  const cashSet = new Set(cashAccountCodes);
  let operating = 0;
  let investing = 0;
  let financing = 0;

  for (const line of lines) {
    if (!cashSet.has(line.accountCode) || line.isOpening) continue;
    const net = line.debit - line.credit;
    // Simplified classification by account prefix heuristics
    if (line.accountCode.startsWith("12") || line.accountCode.startsWith("121")) {
      investing += net;
    } else if (line.accountCode.startsWith("3")) {
      financing += net;
    } else {
      operating += net;
    }
  }

  const netChange = round2(operating + investing + financing);
  return [
    {
      code: "CFO",
      labelAr: "التدفقات من الأنشطة التشغيلية",
      labelEn: "Operating cash flows",
      amount: round2(operating),
      level: 1,
    },
    {
      code: "CFI",
      labelAr: "التدفقات من الأنشطة الاستثمارية",
      labelEn: "Investing cash flows",
      amount: round2(investing),
      level: 1,
    },
    {
      code: "CFF",
      labelAr: "التدفقات من الأنشطة التمويلية",
      labelEn: "Financing cash flows",
      amount: round2(financing),
      level: 1,
    },
    {
      code: "CFN",
      labelAr: "صافي التغير في النقد",
      labelEn: "Net change in cash",
      amount: netChange,
      level: 0,
      isTotal: true,
    },
  ];
}

export function buildEquityChanges(
  openingEquity: number,
  netIncome: number,
  contributions: number,
  distributions: number
): StatementLine[] {
  const closing = round2(
    openingEquity + netIncome + contributions - distributions
  );
  return [
    {
      code: "EQ-OP",
      labelAr: "حقوق الملكية أول الفترة",
      labelEn: "Opening equity",
      amount: round2(openingEquity),
      level: 1,
    },
    {
      code: "EQ-NI",
      labelAr: "صافي الدخل",
      labelEn: "Net income",
      amount: round2(netIncome),
      level: 1,
    },
    {
      code: "EQ-CON",
      labelAr: "مساهمات رأس المال",
      labelEn: "Capital contributions",
      amount: round2(contributions),
      level: 1,
    },
    {
      code: "EQ-DIS",
      labelAr: "توزيعات",
      labelEn: "Distributions",
      amount: round2(distributions),
      level: 1,
    },
    {
      code: "EQ-CL",
      labelAr: "حقوق الملكية آخر الفترة",
      labelEn: "Closing equity",
      amount: closing,
      level: 0,
      isTotal: true,
    },
  ];
}

export function summarizeProjectLedger(
  projectId: string,
  costCenterId: string,
  lines: PostedLine[],
  budget: number,
  committedCost: number
): ProjectLedgerSummary {
  let revenue = 0;
  let expenses = 0;
  let cashIn = 0;
  let cashOut = 0;

  for (const line of lines) {
    if (line.projectId !== projectId) continue;
    // Revenue accounts typically credit-nature
    if (line.accountCode.startsWith("4")) {
      revenue += line.credit - line.debit;
    } else if (line.accountCode.startsWith("5")) {
      expenses += line.debit - line.credit;
    }
    if (
      line.accountCode.startsWith("111") ||
      line.accountCode === "111001" ||
      line.accountCode === "111002"
    ) {
      cashIn += line.debit;
      cashOut += line.credit;
    }
  }

  revenue = round2(revenue);
  expenses = round2(expenses);
  const profit = round2(revenue - expenses);
  const marginPct = revenue > 0 ? round2((profit / revenue) * 100) : 0;

  return {
    projectId,
    costCenterId,
    revenue,
    expenses,
    profit,
    budget: round2(budget),
    actualCost: expenses,
    committedCost: round2(committedCost),
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    marginPct,
  };
}

export function buildDashboardKpis(input: {
  revenue: number;
  expenses: number;
  receivables: number;
  payables: number;
  bankBalance: number;
  vatDue: number;
  cashFlow: number;
  projectProfit: number;
  budgetPct: number;
}): FinancialDashboardKpis {
  return {
    revenue: round2(input.revenue),
    expenses: round2(input.expenses),
    profit: round2(input.revenue - input.expenses),
    cashFlow: round2(input.cashFlow),
    receivables: round2(input.receivables),
    payables: round2(input.payables),
    bankBalance: round2(input.bankBalance),
    vatDue: round2(input.vatDue),
    projectProfitability: round2(input.projectProfit),
    budgetStatusPct: round2(input.budgetPct),
    currency: "SAR",
    asOf: new Date().toISOString().slice(0, 10),
  };
}
