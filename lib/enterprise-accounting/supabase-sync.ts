/**
 * Live Supabase sync for Enterprise Accounting (acc_* tables from 027).
 * Falls back gracefully when tables are missing or demo mode is active.
 */

import { isDemoMode, supabase } from '@/lib/supabase';
import { BUILTIN_ACCOUNTING_RULES } from './rules-catalog';
import type { EnterpriseAccountingState } from './store';
import { createDemoState } from './store';
import type { AccountingRule } from './types';

export type EnterpriseDataSource = 'supabase' | 'demo';

function mapRules(rows: Record<string, unknown>[]): AccountingRule[] {
  if (!rows.length) return BUILTIN_ACCOUNTING_RULES;
  return rows.map((r) => ({
    id: String(r.id),
    code: String(r.rule_code),
    nameAr: String(r.title_ar || r.rule_code),
    nameEn: String(r.title_en || r.rule_code),
    category: (r.category as AccountingRule['category']) || 'journal_validation',
    severity: (r.severity as AccountingRule['severity']) || 'error',
    enabled: r.is_active !== false,
    descriptionAr: String(r.title_ar || ''),
    descriptionEn: String(r.title_en || ''),
    ifrsReference: Array.isArray(r.ifrs_refs) ? (r.ifrs_refs as string[])[0] : undefined,
    socpaReference: Array.isArray(r.socpa_refs) ? (r.socpa_refs as string[])[0] : undefined,
    zatcaReference: Array.isArray(r.zatca_refs) ? (r.zatca_refs as string[])[0] : undefined,
    vatReference: Array.isArray(r.vat_refs) ? (r.vat_refs as string[])[0] : undefined,
    checkId: String(r.rule_code),
  }));
}

/** Load enterprise overlays (AR/AP/bank/assets/budgets/rules) from Supabase when available. */
export async function loadEnterpriseStateLive(): Promise<{
  state: EnterpriseAccountingState;
  source: EnterpriseDataSource;
  warnings: string[];
}> {
  const base = createDemoState();
  const warnings: string[] = [];

  if (isDemoMode) {
    const { isDemoAllowed } = await import('@/lib/runtime/mode');
    if (!isDemoAllowed()) {
      return {
        state: base,
        source: 'demo',
        warnings: ['إنتاج بدون Supabase — اضبط المفاتيح أو ALLOW_DEMO_MODE=true'],
      };
    }
    return { state: base, source: 'demo', warnings: ['وضع تجريبي — لا يوجد اتصال Supabase'] };
  }

  try {
    const [arRes, apRes, bankRes, assetRes, budgetRes, rulesRes, journalsRes] = await Promise.all([
      supabase
        .from('acc_ar_invoices')
        .select('id, invoice_number, due_date, total_amount, amount_paid, status, client_id, clients(name)')
        .is('deleted_at', null)
        .limit(200),
      supabase
        .from('acc_ap_bills')
        .select('id, bill_number, due_date, total_amount, amount_paid, status, vendor_name')
        .is('deleted_at', null)
        .limit(200),
      supabase.from('acc_bank_accounts').select('*').eq('is_active', true).limit(50),
      supabase
        .from('acc_fixed_assets')
        .select('*')
        .is('deleted_at', null)
        .limit(100),
      supabase.from('acc_budgets').select('*').limit(20),
      supabase
        .from('acc_accounting_rules')
        .select('*')
        .eq('is_active', true)
        .is('deleted_at', null)
        .limit(100),
      supabase
        .from('journal_entries')
        .select('id, entry_number, entry_date, description, status, created_at, cost_center_id, journal_entry_lines(account_id, debit, credit, description, chart_of_accounts(code))')
        .is('deleted_at', null)
        .order('entry_date', { ascending: false })
        .limit(100),
    ]);

    const tableMissing = (err: { message?: string; code?: string } | null) =>
      Boolean(err?.message?.match(/does not exist|schema cache|Could not find/i) || err?.code === '42P01');

    if (arRes.error && tableMissing(arRes.error)) {
      warnings.push('جداول المحاسبة المؤسسية (027) غير مطبّقة بعد — استخدم: npm run db:apply-dds');
      return { state: base, source: 'demo', warnings };
    }

    const state: EnterpriseAccountingState = { ...base };

    if (!arRes.error && arRes.data) {
      state.arOpen = arRes.data
        .map((row) => {
          const clients = row.clients as { name?: string } | { name?: string }[] | null;
          const clientName = Array.isArray(clients)
            ? clients[0]?.name
            : clients?.name;
          const balance = Number(row.total_amount || 0) - Number(row.amount_paid || 0);
          return {
            id: String(row.id),
            partyName: clientName || String(row.invoice_number),
            dueDate: String(row.due_date || new Date().toISOString().slice(0, 10)),
            balance,
          };
        })
        .filter((r) => r.balance > 0);
    } else if (arRes.error) {
      warnings.push(`AR: ${arRes.error.message}`);
    }

    if (!apRes.error && apRes.data) {
      state.apOpen = apRes.data
        .map((row) => ({
          id: String(row.id),
          partyName: String(row.vendor_name || row.bill_number),
          dueDate: String(row.due_date || new Date().toISOString().slice(0, 10)),
          balance: Number(row.total_amount || 0) - Number(row.amount_paid || 0),
        }))
        .filter((r) => r.balance > 0);
    }

    if (!bankRes.error && bankRes.data?.length) {
      state.bankAccounts = bankRes.data.map((b) => ({
        id: String(b.id),
        nameAr: String(b.name),
        nameEn: String(b.name),
        balance: Number(b.opening_balance || 0),
        currency: String(b.currency_code || 'SAR'),
      }));
    }

    if (!assetRes.error && assetRes.data?.length) {
      state.assets = assetRes.data.map((a) => ({
        id: String(a.id),
        code: String(a.asset_code),
        nameAr: String(a.name),
        nameEn: String(a.name),
        cost: Number(a.acquisition_cost || 0),
        accumDep: Number(a.accumulated_depreciation || 0),
        usefulLifeMonths: Number(a.useful_life_months || 60),
      }));
    }

    if (!budgetRes.error && budgetRes.data?.length) {
      state.budgets = budgetRes.data.map((b) => {
        const lines = (b.lines as { amount?: number; actual?: number }[]) || [];
        const amount = lines.reduce((s, l) => s + Number(l.amount || 0), 0) || Number(b.version_no || 0);
        const actual = lines.reduce((s, l) => s + Number(l.actual || 0), 0);
        return {
          id: String(b.id),
          nameAr: String(b.name),
          nameEn: String(b.name),
          amount: amount || 1,
          actual,
          status: (b.status as 'draft' | 'approved' | 'revised') || 'draft',
        };
      });
    }

    if (!rulesRes.error && rulesRes.data?.length) {
      state.rules = mapRules(rulesRes.data as Record<string, unknown>[]);
    }

    if (!journalsRes.error && journalsRes.data?.length) {
      state.journals = journalsRes.data.map((j) => {
        const linesRaw = (j.journal_entry_lines || []) as {
          debit?: number;
          credit?: number;
          description?: string;
          chart_of_accounts?: { code?: string } | { code?: string }[] | null;
        }[];
        return {
          id: String(j.id),
          entryNumber: String(j.entry_number || j.id),
          entryDate: String(j.entry_date),
          entryType: 'manual' as const,
          description: String(j.description || ''),
          status: String(j.status || 'posted'),
          createdAt: String(j.created_at || j.entry_date),
          costCenterId: j.cost_center_id ? String(j.cost_center_id) : null,
          lines: linesRaw.map((l) => {
            const coa = l.chart_of_accounts;
            const code = Array.isArray(coa) ? coa[0]?.code : coa?.code;
            return {
              accountCode: code || '',
              debit: Number(l.debit || 0),
              credit: Number(l.credit || 0),
              description: l.description || undefined,
            };
          }),
        };
      });
    }

    return {
      state,
      source: 'supabase',
      warnings,
    };
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : 'تعذر تحميل البيانات الحية');
    return { state: base, source: 'demo', warnings };
  }
}

/** Seed built-in rules into acc_accounting_rules when table is empty. */
export async function syncBuiltinRulesToSupabase(): Promise<{ ok: boolean; upserted: number; error?: string }> {
  if (isDemoMode) return { ok: false, upserted: 0, error: 'demo mode' };
  try {
    const { count } = await supabase
      .from('acc_accounting_rules')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    if ((count || 0) > 0) return { ok: true, upserted: 0 };

    const rows = BUILTIN_ACCOUNTING_RULES.map((r) => ({
      rule_code: r.code,
      category: r.category,
      title_en: r.nameEn,
      title_ar: r.nameAr,
      severity: r.severity,
      when_conditions: { checkId: r.checkId },
      constraint_body: r.config || {},
      ifrs_refs: r.ifrsReference ? [r.ifrsReference] : [],
      socpa_refs: r.socpaReference ? [r.socpaReference] : [],
      zatca_refs: r.zatcaReference ? [r.zatcaReference] : [],
      vat_refs: r.vatReference ? [r.vatReference] : [],
      is_active: r.enabled,
      version_label: '1.0',
    }));

    const { error } = await supabase.from('acc_accounting_rules').insert(rows);
    if (error) return { ok: false, upserted: 0, error: error.message };
    return { ok: true, upserted: rows.length };
  } catch (e) {
    return { ok: false, upserted: 0, error: e instanceof Error ? e.message : 'sync failed' };
  }
}
