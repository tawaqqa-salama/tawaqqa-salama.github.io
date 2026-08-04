'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { formatCurrency } from '@/lib/format/currency';
import {
  deriveAging,
  deriveAudit,
  deriveDashboard,
  journalsToPostedLines,
  loadEnterpriseState,
  suggestJournalFromTransaction,
  buildTrialBalance,
  buildIncomeStatement,
  buildBalanceSheet,
  buildCashFlowStatement,
  buildEquityChanges,
  projectProfitabilityReport,
  monthlyDepreciation,
  type EnterpriseAccountingState,
  type EnterpriseFinanceTab,
  type CopilotSuggestion,
} from '@/lib/enterprise-accounting';
import { getEnabledRules } from '@/lib/enterprise-accounting/rules-catalog';
import { VAT_CATEGORY_LABELS, buildVatReturn } from '@/lib/enterprise-accounting/vat';
import { auditReportSummary } from '@/lib/enterprise-accounting/audit';

const TABS: { id: EnterpriseFinanceTab; ar: string; en: string }[] = [
  { id: 'dashboard', ar: 'لوحة المؤشرات', en: 'Dashboard' },
  { id: 'coa', ar: 'دليل الحسابات', en: 'Chart of Accounts' },
  { id: 'gl', ar: 'دفتر الأستاذ', en: 'General Ledger' },
  { id: 'ar', ar: 'الذمم المدينة', en: 'Receivables' },
  { id: 'ap', ar: 'الذمم الدائنة', en: 'Payables' },
  { id: 'banking', ar: 'البنوك', en: 'Banking' },
  { id: 'assets', ar: 'الأصول الثابتة', en: 'Fixed Assets' },
  { id: 'projects', ar: 'محاسبة المشاريع', en: 'Project Accounting' },
  { id: 'vat', ar: 'ضريبة القيمة المضافة', en: 'VAT' },
  { id: 'zatca', ar: 'زاتكا / فوترة', en: 'ZATCA' },
  { id: 'statements', ar: 'القوائم المالية', en: 'Statements' },
  { id: 'budgeting', ar: 'الموازنات', en: 'Budgeting' },
  { id: 'rules', ar: 'محرك القواعد', en: 'Rules Engine' },
  { id: 'copilot', ar: 'مساعد المحاسبة', en: 'AI Copilot' },
  { id: 'audit', ar: 'التدقيق الداخلي', en: 'Internal Audit' },
  { id: 'security', ar: 'الأمان والصلاحيات', en: 'Security' },
];

function Kpi({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-900/10 bg-gradient-to-br from-white to-emerald-50/40 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-emerald-950 tabular-nums">{value}</div>
    </div>
  );
}

export default function EnterpriseAccountingModule() {
  const { lang, t } = useLanguage();
  const isAr = lang !== 'en';
  const [tab, setTab] = useState<EnterpriseFinanceTab>('dashboard');
  const [state, setState] = useState<EnterpriseAccountingState | null>(null);
  const [copilot, setCopilot] = useState<CopilotSuggestion | null>(null);
  const [txAmount, setTxAmount] = useState('100000');
  const [txDirection, setTxDirection] = useState<'sale' | 'purchase' | 'expense' | 'receipt' | 'payment'>('sale');

  useEffect(() => {
    setState(loadEnterpriseState());
  }, []);

  const kpis = useMemo(() => (state ? deriveDashboard(state) : null), [state]);
  const aging = useMemo(() => (state ? deriveAging(state) : null), [state]);
  const findings = useMemo(() => (state ? deriveAudit(state) : []), [state]);
  const auditSummary = useMemo(() => auditReportSummary(findings), [findings]);

  const statements = useMemo(() => {
    if (!state) return null;
    const lines = journalsToPostedLines(state.journals);
    const tb = buildTrialBalance(state.accounts, lines);
    const is = buildIncomeStatement(tb);
    const bs = buildBalanceSheet(tb);
    const cashCodes = state.accounts
      .filter((a) => a.mappingKey === 'cash' || a.mappingKey === 'bank')
      .map((a) => a.code);
    const cf = buildCashFlowStatement(lines, cashCodes);
    const ni = is.find((l) => l.code === 'NI')?.amount ?? 0;
    const eq = buildEquityChanges(500000, ni, 0, 0);
    const projects = projectProfitabilityReport(state.projects, state.costCenters, lines);
    return { tb, is, bs, cf, eq, projects };
  }, [state]);

  const runCopilot = () => {
    if (!state) return;
    const amount = Number(txAmount) || 0;
    const result = suggestJournalFromTransaction(
      {
        descriptionAr: 'معاملة مقترحة من المساعد',
        descriptionEn: 'Copilot suggested transaction',
        amount,
        direction: txDirection,
        vatCategory: 'standard_15',
        includeVat: txDirection === 'sale' || txDirection === 'purchase',
        projectId: txDirection === 'sale' || txDirection === 'expense' ? 'prj-1' : null,
        costCenterId:
          state.costCenters.find((c) => c.projectId === 'prj-1')?.id ?? null,
        entryDate: new Date().toISOString().slice(0, 10),
      },
      state.accounts,
      state.fiscalYear
    );
    setCopilot(result);
  };

  if (!state || !kpis) {
    return (
      <div className="text-center text-gray-400 py-20">
        {t('finance.page.dashboardLoading')}
      </div>
    );
  }

  const L = (ar: string, en: string) => (isAr ? ar : en);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-900/10 bg-[radial-gradient(ellipse_at_top_right,_#d8f3e3_0%,_#f7faf8_45%,_#eef6f1_100%)] p-6">
        <div className="absolute inset-0 opacity-[0.07] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><path d=%22M0 40L40 0H20L0 20zm40 0V20L20 40z%22 fill=%22%221f4d3a%22/></svg>')]" />
        <div className="relative">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-emerald-800/70 mb-2">
            Tawaqqa ERP
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-emerald-950">
            {L('المحاسبة والمالية المؤسسية', 'Enterprise Accounting & Finance')}
          </h1>
          <p className="mt-2 text-sm text-emerald-900/70 max-w-2xl">
            {L(
              'IFRS · SOCPA · ضريبة القيمة المضافة السعودية · ZATCA FATOORA — محرك قواعد يمنع الترحيل غير الصالح',
              'IFRS · SOCPA · Saudi VAT · ZATCA FATOORA — rules engine blocks invalid postings'
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === item.id
                ? 'bg-[#1f4d3a] text-white'
                : 'bg-white border text-gray-600 hover:bg-emerald-50'
            }`}
          >
            {isAr ? item.ar : item.en}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <Kpi label={L('الإيرادات', 'Revenue')} value={formatCurrency(kpis.revenue)} />
          <Kpi label={L('المصروفات', 'Expenses')} value={formatCurrency(kpis.expenses)} />
          <Kpi label={L('الربح', 'Profit')} value={formatCurrency(kpis.profit)} />
          <Kpi label={L('التدفق النقدي', 'Cash Flow')} value={formatCurrency(kpis.cashFlow)} />
          <Kpi label={L('الذمم المدينة', 'Receivables')} value={formatCurrency(kpis.receivables)} />
          <Kpi label={L('الذمم الدائنة', 'Payables')} value={formatCurrency(kpis.payables)} />
          <Kpi label={L('رصيد البنوك', 'Bank Balance')} value={formatCurrency(kpis.bankBalance)} />
          <Kpi label={L('ضريبة مستحقة', 'VAT Due')} value={formatCurrency(kpis.vatDue)} />
          <Kpi
            label={L('ربحية المشاريع', 'Project Profit')}
            value={formatCurrency(kpis.projectProfitability)}
          />
          <Kpi
            label={L('حالة الموازنة', 'Budget Status')}
            value={`${kpis.budgetStatusPct.toFixed(1)}%`}
          />
        </div>
      )}

      {tab === 'coa' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b flex justify-between items-center">
            <h2 className="font-bold text-gray-900">
              {L('دليل الحسابات متعدد المستويات', 'Multi-level Chart of Accounts')}
            </h2>
            <span className="text-xs text-gray-500">
              {state.accounts.length} {L('حساب', 'accounts')}
            </span>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-gray-500 text-xs">
                  <th className="text-start p-2">{L('الرمز', 'Code')}</th>
                  <th className="text-start p-2">{L('الاسم', 'Name')}</th>
                  <th className="text-start p-2">{L('النوع', 'Type')}</th>
                  <th className="text-start p-2">{L('ضريبة', 'VAT')}</th>
                  <th className="text-start p-2">{L('ترحيل', 'Postable')}</th>
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((a) => (
                  <tr key={a.id} className="border-t hover:bg-emerald-50/40">
                    <td className="p-2 font-mono text-xs" style={{ paddingInlineStart: 8 + a.level * 12 }}>
                      {a.code}
                    </td>
                    <td className="p-2">{isAr ? a.nameAr : a.nameEn}</td>
                    <td className="p-2 text-xs text-gray-500">{a.accountType}</td>
                    <td className="p-2 text-xs">
                      {isAr
                        ? VAT_CATEGORY_LABELS[a.vatCategory].ar
                        : VAT_CATEGORY_LABELS[a.vatCategory].en}
                    </td>
                    <td className="p-2 text-xs">
                      {a.isPostable ? (isAr ? 'نعم' : 'Yes') : isAr ? 'تجميعي' : 'Header'}
                      {a.isLocked ? ` · ${L('مقفل', 'Locked')}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'gl' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-bold">
            {L('القيود اليومية — يدوي / آلي / عكسي / افتتاحي / إقفال', 'Journals — manual / auto / reversing / opening / closing')}
          </h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-start p-2">{L('الرقم', 'No.')}</th>
                  <th className="text-start p-2">{L('التاريخ', 'Date')}</th>
                  <th className="text-start p-2">{L('النوع', 'Type')}</th>
                  <th className="text-start p-2">{L('الوصف', 'Description')}</th>
                  <th className="text-start p-2">{L('الحالة', 'Status')}</th>
                  <th className="text-start p-2">{L('المبلغ', 'Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {state.journals.map((j) => {
                  const amt = j.lines.reduce((s, l) => s + l.debit, 0);
                  return (
                    <tr key={j.id} className="border-t">
                      <td className="p-2 font-mono text-xs">{j.entryNumber}</td>
                      <td className="p-2">{j.entryDate}</td>
                      <td className="p-2 text-xs">{j.entryType}</td>
                      <td className="p-2">{j.description}</td>
                      <td className="p-2 text-xs">{j.status}</td>
                      <td className="p-2 tabular-nums">{formatCurrency(amt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">
            {L(
              'الترحيل يمر عبر محرك القواعد + اعتماد Maker/Checker + مسار تدقيق ومرفقات.',
              'Posting goes through Rules Engine + Maker/Checker + audit trail & attachments.'
            )}
          </p>
        </div>
      )}

      {tab === 'ar' && aging && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label={L('حالي', 'Current')} value={formatCurrency(aging.ar.current)} />
            <Kpi label="1–30" value={formatCurrency(aging.ar.days1to30)} />
            <Kpi label="31–60" value={formatCurrency(aging.ar.days31to60)} />
            <Kpi label="61–90" value={formatCurrency(aging.ar.days61to90)} />
            <Kpi label="90+" value={formatCurrency(aging.ar.over90)} />
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h2 className="font-bold mb-2">{L('أعمار الديون — العملاء', 'AR Aging')}</h2>
            <ul className="text-sm space-y-1">
              {aging.ar.rows.map((r) => (
                <li key={r.id} className="flex justify-between border-b py-2">
                  <span>
                    {r.partyName}{' '}
                    <span className="text-xs text-gray-400">
                      ({r.bucket} · {r.daysPastDue}d)
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(r.balance)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'ap' && aging && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi label={L('إجمالي الدائن', 'Total AP')} value={formatCurrency(aging.ap.total)} />
            <Kpi label={L('متأخر 1–30', '1–30 overdue')} value={formatCurrency(aging.ap.days1to30)} />
            <Kpi label="90+" value={formatCurrency(aging.ap.over90)} />
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h2 className="font-bold mb-2">{L('فواتير الموردين والاستحقاق', 'Supplier bills & due dates')}</h2>
            <ul className="text-sm space-y-1">
              {aging.ap.rows.map((r) => (
                <li key={r.id} className="flex justify-between border-b py-2">
                  <span>
                    {r.partyName} — {L('استحقاق', 'Due')} {r.dueDate}
                  </span>
                  <span className="font-semibold">{formatCurrency(r.balance)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'banking' && (
        <div className="grid md:grid-cols-2 gap-3">
          {state.bankAccounts.map((b) => (
            <div key={b.id} className="rounded-xl border bg-white p-4">
              <div className="text-sm text-gray-500">{isAr ? b.nameAr : b.nameEn}</div>
              <div className="text-2xl font-bold text-emerald-950 mt-1">
                {formatCurrency(b.balance)}
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {L('مطابقة ذكية · استيراد كشوف · شيكات · تحويلات', 'Smart match · statement import · cheques · transfers')}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'assets' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-start p-2">{L('الأصل', 'Asset')}</th>
                <th className="text-start p-2">{L('التكلفة', 'Cost')}</th>
                <th className="text-start p-2">{L('مجمع الإهلاك', 'Accum. Dep.')}</th>
                <th className="text-start p-2">{L('إهلاك شهري', 'Monthly dep.')}</th>
              </tr>
            </thead>
            <tbody>
              {state.assets.map((a) => {
                const monthly = monthlyDepreciation({
                  cost: a.cost,
                  salvageValue: 0,
                  usefulLifeMonths: a.usefulLifeMonths,
                  method: 'straight_line',
                  accumulatedDepreciation: a.accumDep,
                });
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-2">
                      <span className="font-mono text-xs me-2">{a.code}</span>
                      {isAr ? a.nameAr : a.nameEn}
                    </td>
                    <td className="p-2">{formatCurrency(a.cost)}</td>
                    <td className="p-2">{formatCurrency(a.accumDep)}</td>
                    <td className="p-2">{formatCurrency(monthly)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'projects' && statements && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-bold">
            {L('كل مشروع = مركز تكلفة تلقائي', 'Every project auto-creates a cost center')}
          </h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-start p-2">{L('المشروع', 'Project')}</th>
                  <th className="text-start p-2">{L('إيراد', 'Revenue')}</th>
                  <th className="text-start p-2">{L('تكلفة', 'Cost')}</th>
                  <th className="text-start p-2">{L('ربح', 'Profit')}</th>
                  <th className="text-start p-2">{L('هامش', 'Margin')}</th>
                  <th className="text-start p-2">{L('موازنة', 'Budget')}</th>
                </tr>
              </thead>
              <tbody>
                {statements.projects.map((p) => {
                  const meta = state.projects.find((x) => x.id === p.projectId);
                  return (
                    <tr key={p.projectId} className="border-t">
                      <td className="p-2">{isAr ? meta?.nameAr : meta?.nameEn}</td>
                      <td className="p-2">{formatCurrency(p.revenue)}</td>
                      <td className="p-2">{formatCurrency(p.actualCost)}</td>
                      <td className="p-2 font-semibold">{formatCurrency(p.profit)}</td>
                      <td className="p-2">{p.marginPct}%</td>
                      <td className="p-2">{formatCurrency(p.budget)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'vat' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-bold">{L('امتثال ضريبة القيمة المضافة السعودية', 'Saudi VAT compliance')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {Object.entries(VAT_CATEGORY_LABELS).map(([k, v]) => (
              <div key={k} className="rounded-lg border p-3">
                <div className="font-semibold">{isAr ? v.ar : v.en}</div>
                <div className="text-xs text-gray-500">{(v.rate * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
          {(() => {
            const vat = buildVatReturn(
              [
                {
                  netAmount: 100000,
                  vatAmount: 15000,
                  category: 'standard_15',
                  direction: 'sale',
                },
                {
                  netAmount: 40000,
                  vatAmount: 6000,
                  category: 'standard_15',
                  direction: 'purchase',
                },
              ],
              L('الفترة الحالية', 'Current period')
            );
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label={L('مبيعات خاضعة', 'Taxable sales')} value={formatCurrency(vat.standardRatedSales)} />
                <Kpi label={L('ضريبة مخرجات', 'Output VAT')} value={formatCurrency(vat.outputVat)} />
                <Kpi label={L('ضريبة مدخلات', 'Input VAT')} value={formatCurrency(vat.inputVat)} />
                <Kpi label={L('صافي المستحق', 'Net VAT due')} value={formatCurrency(vat.netVatDue)} />
              </div>
            );
          })()}
        </div>
      )}

      {tab === 'zatca' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-bold">{L('تكامل ZATCA FATOORA — المرحلة 1 و 2', 'ZATCA FATOORA — Phase 1 & 2')}</h2>
          <ul className="grid sm:grid-cols-2 gap-2 text-sm">
            {[
              ['QR Code', 'رمز الاستجابة السريعة'],
              ['XML Invoice (UBL)', 'فاتورة XML'],
              ['UUID', 'المعرّف الفريد'],
              ['Digital Signature', 'التوقيع الرقمي'],
              ['Clearance / Reporting', 'الاعتماد / الإبلاغ'],
              ['Validation · Retry Queue', 'التحقق · قائمة إعادة المحاولة'],
            ].map(([en, ar]) => (
              <li key={en} className="rounded-lg border px-3 py-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                {isAr ? ar : en}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">
            {L(
              'يستخدم محرك ZATCA الحالي في النظام (/settings/zatca) مع طابور إعادة المحاولة في قاعدة البيانات.',
              'Uses the existing ZATCA engine (/settings/zatca) plus DB retry queue.'
            )}
          </p>
        </div>
      )}

      {tab === 'statements' && statements && (
        <div className="grid md:grid-cols-2 gap-3">
          {[
            { title: L('ميزان المراجعة', 'Trial Balance'), rows: statements.tb.slice(0, 8).map((r) => ({
              label: isAr ? r.accountNameAr : r.accountNameEn,
              amount: r.closingDebit || r.closingCredit,
            })) },
            { title: L('قائمة الدخل', 'Income Statement'), rows: statements.is.map((r) => ({
              label: isAr ? r.labelAr : r.labelEn,
              amount: r.amount,
            })) },
            { title: L('الميزانية العمومية', 'Balance Sheet'), rows: statements.bs.map((r) => ({
              label: isAr ? r.labelAr : r.labelEn,
              amount: r.amount,
            })) },
            { title: L('التدفقات النقدية', 'Cash Flow'), rows: statements.cf.map((r) => ({
              label: isAr ? r.labelAr : r.labelEn,
              amount: r.amount,
            })) },
            { title: L('التغير في حقوق الملكية', 'Changes in Equity'), rows: statements.eq.map((r) => ({
              label: isAr ? r.labelAr : r.labelEn,
              amount: r.amount,
            })) },
          ].map((block) => (
            <div key={block.title} className="rounded-xl border bg-white p-4">
              <h3 className="font-bold mb-2">{block.title}</h3>
              <ul className="text-sm space-y-1">
                {block.rows.map((r) => (
                  <li key={r.label} className="flex justify-between gap-2">
                    <span className="text-gray-600">{r.label}</span>
                    <span className="tabular-nums font-medium">{formatCurrency(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'budgeting' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          {state.budgets.map((b) => {
            const pct = b.amount ? (b.actual / b.amount) * 100 : 0;
            return (
              <div key={b.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold">{isAr ? b.nameAr : b.nameEn}</span>
                  <span className="text-gray-500">
                    {formatCurrency(b.actual)} / {formatCurrency(b.amount)} · {b.status}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-700 transition-all duration-700"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-xs text-gray-500">
            {L('تخطيط · اعتماد · مراجعة · موازنة مقابل فعلي · تنبؤ', 'Planning · approval · revision · budget vs actual · forecast')}
          </p>
        </div>
      )}

      {tab === 'rules' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-bold">
              {L('محرك القواعد المحاسبية — يرفض القيود غير الصالحة', 'Accounting Rules Engine — rejects invalid entries')}
            </h2>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 text-xs text-gray-500">
                <tr>
                  <th className="text-start p-2">Code</th>
                  <th className="text-start p-2">{L('القاعدة', 'Rule')}</th>
                  <th className="text-start p-2">{L('الفئة', 'Category')}</th>
                  <th className="text-start p-2">{L('الخطورة', 'Severity')}</th>
                  <th className="text-start p-2">IFRS / SOCPA / ZATCA</th>
                </tr>
              </thead>
              <tbody>
                {getEnabledRules(state.rules).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{r.code}</td>
                    <td className="p-2">{isAr ? r.nameAr : r.nameEn}</td>
                    <td className="p-2 text-xs">{r.category}</td>
                    <td className="p-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          r.severity === 'error'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {r.severity}
                      </span>
                    </td>
                    <td className="p-2 text-[11px] text-gray-500">
                      {[r.ifrsReference, r.socpaReference, r.zatcaReference, r.vatReference]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'copilot' && (
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <div>
            <h2 className="font-bold">
              {L('مساعد المحاسبة الذكي', 'AI Accounting Copilot')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {L(
                'لا يُنشئ قيوداً بحرية. يقرأ المعاملة → يتحقق من محرك القواعد وIFRS/SOCPA/ZATCA/VAT → ثم يقترح فقط.',
                'Never creates free-form entries. Reads transaction → validates Rules/IFRS/SOCPA/ZATCA/VAT → then suggests only.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm">
              <span className="text-gray-500 text-xs block mb-1">{L('المبلغ', 'Amount')}</span>
              <input
                className="border rounded-lg px-3 py-2 w-36"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500 text-xs block mb-1">{L('النوع', 'Type')}</span>
              <select
                className="border rounded-lg px-3 py-2"
                value={txDirection}
                onChange={(e) => setTxDirection(e.target.value as typeof txDirection)}
              >
                <option value="sale">{L('مبيعات', 'Sale')}</option>
                <option value="purchase">{L('مشتريات', 'Purchase')}</option>
                <option value="expense">{L('مصروف', 'Expense')}</option>
                <option value="receipt">{L('قبض', 'Receipt')}</option>
                <option value="payment">{L('صرف', 'Payment')}</option>
              </select>
            </label>
            <button
              type="button"
              onClick={runCopilot}
              className="px-4 py-2 rounded-lg bg-[#1f4d3a] text-white text-sm font-semibold hover:bg-[#163828]"
            >
              {L('اقترح قيداً', 'Suggest journal')}
            </button>
          </div>
          {copilot && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 space-y-2 text-sm">
              <p>{isAr ? copilot.explanationAr : copilot.explanationEn}</p>
              {copilot.blockedReasonAr && (
                <p className="text-rose-700">
                  {isAr ? copilot.blockedReasonAr : copilot.blockedReasonEn}
                </p>
              )}
              {copilot.suggestedEntry && (
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-start p-1">{L('حساب', 'Account')}</th>
                        <th className="text-start p-1">{L('مدين', 'Debit')}</th>
                        <th className="text-start p-1">{L('دائن', 'Credit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {copilot.suggestedEntry.lines.map((l, i) => (
                        <tr key={i} className="border-t border-emerald-100">
                          <td className="p-1 font-mono">{l.accountCode}</td>
                          <td className="p-1">{l.debit || '—'}</td>
                          <td className="p-1">{l.credit || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-[11px] text-gray-600">
                {[...copilot.ifrsReferences, ...copilot.socpaReferences, ...copilot.zatcaReferences, ...copilot.vatReferences].map(
                  (ref) => (
                    <span key={ref} className="px-2 py-0.5 rounded bg-white border">
                      {ref}
                    </span>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label={L('إجمالي الملاحظات', 'Total findings')} value={String(auditSummary.total)} />
            <Kpi label={L('حرج', 'Critical')} value={String(auditSummary.critical)} />
            <Kpi label={L('أخطاء', 'Errors')} value={String(auditSummary.errors)} />
            <Kpi label={L('تحذيرات', 'Warnings')} value={String(auditSummary.warnings)} />
          </div>
          <div className="rounded-xl border bg-white divide-y">
            {findings.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">
                {L('لا توجد ملاحظات تدقيق على البيانات التجريبية.', 'No audit findings on demo data.')}
              </p>
            ) : (
              findings.map((f) => (
                <div key={f.id} className="p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{isAr ? f.titleAr : f.titleEn}</span>
                    <span className="text-xs text-gray-400">{f.findingType}</span>
                  </div>
                  <p className="text-gray-600 mt-1">{isAr ? f.descriptionAr : f.descriptionEn}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            [L('صلاحيات حسب الدور', 'Role-based permissions'), L('مرتبط بـ RBAC في المنصة', 'Tied to platform RBAC')],
            [L('صانع / مراجع', 'Maker / Checker'), L('حد اعتماد عبر محرك القواعد', 'Approval threshold via rules')],
            [L('مصفوفة الاعتماد', 'Approval matrix'), L('قيود كبيرة تتطلب مراجعاً', 'Large journals need checker')],
            [L('سجلات التدقيق', 'Audit logs'), L('مسار كامل للمعاملات', 'Full transaction history')],
            [L('حذف ناعم', 'Soft delete'), L('deleted_at على الجداول', 'deleted_at on tables')],
            [L('قفل الفترة', 'Period lock'), L('acc_fiscal_periods.is_locked', 'acc_fiscal_periods.is_locked')],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-xl border bg-white p-4">
              <div className="font-semibold text-emerald-950">{title}</div>
              <div className="text-xs text-gray-500 mt-1">{desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
