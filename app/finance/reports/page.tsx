'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildIncomeStatement,
  buildTrialBalance,
  buildVatSummary,
  fetchAccounts,
  fetchVouchers,
} from '@/lib/business/accounting-service';
import PageHeader from '@/components/shared/PageHeader';
import { formatCurrency } from '@/lib/format/currency';
import { VAT_RATE } from '@/lib/constants/clients';
import type { JournalEntryLine, TrialBalanceRow, VatSummary } from '@/lib/types/accounting';
import type { IncomeStatementSummary } from '@/lib/types/accounting';
import { supabase } from '@/lib/supabase';
import { exportVatReturnCsv, vatSummaryToReturn } from '@/lib/finance/vat-export';

export default function FinancialReportsPage() {
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [income, setIncome] = useState<IncomeStatementSummary | null>(null);
  const [vat, setVat] = useState<VatSummary | null>(null);
  const [inputVat, setInputVat] = useState(0);
  const [loading, setLoading] = useState(true);

  const periodLabel = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const vatReturn = useMemo(
    () => (vat ? vatSummaryToReturn(vat, periodLabel, inputVat, inputVat / VAT_RATE) : null),
    [vat, periodLabel, inputVat]
  );

  useEffect(() => {
    Promise.all([
      fetchAccounts(),
      fetchVouchers(undefined, 80),
      // حد أعلى لبنود القيود — يكفي التقارير التشغيلية دون مسح الجدول كاملاً
      supabase
        .from('journal_entry_lines')
        .select('id, journal_entry_id, account_id, debit, credit, cost_center_id')
        .limit(500),
    ])
      .then(([accounts, vouchers, linesRes]) => {
        const lines = (linesRes.data || []) as JournalEntryLine[];
        setTrialBalance(buildTrialBalance(accounts, lines));
        setIncome(buildIncomeStatement(accounts, lines));
        setVat(buildVatSummary(vouchers));
        const paymentVat = vouchers
          .filter((v) => v.voucher_type === 'payment')
          .reduce((s, v) => s + Number(v.vat_amount || 0), 0);
        setInputVat(Math.round(paymentVat * 100) / 100);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="التقارير المالية والإقرار الضريبي"
        description="ميزان المراجعة، قائمة الدخل، وملخص ضريبة القيمة المضافة 15% لتراخيص السلامة"
      />

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري إعداد التقارير...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ReportCard title="إجمالي الإيرادات" value={formatCurrency(income?.revenue || 0)} accent="emerald" />
            <ReportCard title="إجمالي المصروفات" value={formatCurrency(income?.expenses || 0)} accent="rose" />
            <ReportCard title="صافي الدخل" value={formatCurrency(income?.netIncome || 0)} accent="blue" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="p-4 border-b font-semibold">ميزان المراجعة</div>
              <table className="w-full text-right text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3">الرمز</th>
                    <th className="p-3">الحساب</th>
                    <th className="p-3">مدين</th>
                    <th className="p-3">دائن</th>
                    <th className="p-3">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {trialBalance.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد حركات</td></tr>
                  ) : (
                    trialBalance.map((row) => (
                      <tr key={row.accountId} className="border-b">
                        <td className="p-3 font-mono text-blue-600">{row.accountCode}</td>
                        <td className="p-3">{row.accountName}</td>
                        <td className="p-3 font-mono">{formatCurrency(row.debit)}</td>
                        <td className="p-3 font-mono">{formatCurrency(row.credit)}</td>
                        <td className="p-3 font-mono font-semibold">{formatCurrency(row.balance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <h3 className="font-bold text-gray-800 mb-4">قائمة الدخل</h3>
                <div className="space-y-3 text-sm">
                  <Row label="الإيرادات" value={income?.revenue || 0} />
                  <Row label="المصروفات" value={income?.expenses || 0} negative />
                  <div className="border-t pt-3 flex justify-between font-bold">
                    <span>صافي الدخل</span>
                    <span className="font-mono">{formatCurrency(income?.netIncome || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h3 className="font-bold text-gray-800">ملخص الإقرار الضريبي (VAT {VAT_RATE * 100}%)</h3>
                  <button
                    type="button"
                    disabled={!vatReturn}
                    onClick={() => vatReturn && exportVatReturnCsv(vatReturn)}
                    className="px-3 py-1.5 rounded-lg bg-[#1f4d3a] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    تصدير CSV للإقرار
                  </button>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">الفترة</span>
                    <span className="font-mono font-semibold">{periodLabel}</span>
                  </div>
                  <Row label="عدد سندات القبض" value={vat?.voucherCount || 0} plain />
                  <Row label="الإيرادات الخاضعة للضريبة" value={vat?.taxableRevenue || 0} />
                  <Row label="ضريبة القيمة المضافة OUTPUT" value={vat?.outputVat || 0} />
                  <Row label="ضريبة المدخلات (سندات الصرف)" value={inputVat} />
                  <Row label="صافي الضريبة المستحقة" value={vatReturn?.netVatDue || 0} />
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-amber-900 text-xs leading-relaxed">
                    يشمل هذا الملخص ضريبة مخرجات خدمات تراخيص السلامة والاستشارات الهندسية وفق نسبة {VAT_RATE * 100}%.
                    ملف CSV جاهز للمراجعة الداخلية قبل رفع الإقرار على بوابة الهيئة.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportCard({ title, value, accent }: { title: string; value: string; accent: 'emerald' | 'rose' | 'blue' }) {
  const colors = {
    emerald: 'from-emerald-50 to-emerald-100 text-emerald-800 border-emerald-100',
    rose: 'from-rose-50 to-rose-100 text-rose-800 border-rose-100',
    blue: 'from-blue-50 to-blue-100 text-blue-800 border-blue-100',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-l p-5 ${colors[accent]}`}>
      <p className="text-sm opacity-80 mb-1">{title}</p>
      <p className="text-2xl font-bold font-mono">{value}</p>
    </div>
  );
}

function Row({ label, value, negative = false, plain = false }: { label: string; value: number; negative?: boolean; plain?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`font-mono font-semibold ${negative ? 'text-rose-700' : ''}`}>
        {plain ? value : formatCurrency(value)}
      </span>
    </div>
  );
}
