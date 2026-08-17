import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');
const migration = read('scripts/sql/050_accounting_tenant_scope.sql');
const service = read('lib/business/accounting-service.ts');

describe('accounting tenant RLS hardening', () => {
  it('adds and safely backfills company ownership without hardcoded UUIDs', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS company_id uuid');
    expect(migration).toContain("WHERE code = 'TWAQQA'");
    expect(migration).toContain('company_count <> 1');
    expect(migration).toContain('INTO STRICT target_company_id');
    expect(migration).toContain('WHERE company_id IS NULL');
    expect(migration).toContain('SET company_id = target_company_id');
    expect(migration).toContain('company_id SET NOT NULL');
    expect(migration).not.toMatch(/\b(min|max)\s*\(\s*id\s*\)/i);
    expect(migration).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    expect(migration).not.toMatch(/LIMIT\s+1/i);
  });

  it('protects zero and multiple company matches before selecting a UUID', () => {
    const countGuard = migration.indexOf('IF company_count <> 1 THEN');
    const strictSelection = migration.indexOf('INTO STRICT target_company_id');
    expect(countGuard).toBeGreaterThan(-1);
    expect(strictSelection).toBeGreaterThan(countGuard);
  });

  it('replaces global uniqueness with tenant-local uniqueness and RLS', () => {
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS chart_of_accounts_code_key');
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS cost_centers_code_key');
    expect(migration).toContain('chart_of_accounts_company_code_key UNIQUE (company_id, code)');
    expect(migration).toContain('cost_centers_company_code_key UNIQUE (company_id, code)');
    expect(migration).toContain('chart_of_accounts_tenant_isolation');
    expect(migration).toContain('cost_centers_tenant_isolation');
    expect(migration).toContain('company_id = public.current_app_company_id()');
    expect(migration).toContain('WITH CHECK');
    expect(migration).not.toContain('USING (true)');
  });

  it('stamps master and document rows to the current tenant', () => {
    expect(migration).toContain('tg_stamp_accounting_master_company_id');
    expect(migration).toContain('tg_stamp_accounting_document_company_id');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.chart_of_accounts');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.cost_centers');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.journal_entries');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.vouchers');
    expect(migration).toContain('NEW.company_id := public.current_app_company_id()');
  });

  it('protects journal lines from foreign-company accounts and cost centers', () => {
    expect(migration).toContain('assert_accounting_line_tenant');
    expect(migration).toContain('Journal line account must belong to the journal company');
    expect(migration).toContain('Journal line cost center must belong to the journal company');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.journal_entry_lines');
  });

  it('owns journal entries and vouchers by company', () => {
    expect(migration).toContain('ALTER TABLE public.journal_entries');
    expect(migration).toContain('ALTER TABLE public.vouchers');
    expect(migration).toContain('journal_entries_company_fk');
    expect(migration).toContain('vouchers_company_fk');
    expect(migration).toContain('journal_entries_tenant_isolation');
    expect(migration).toContain('vouchers_tenant_isolation');
  });

  it('allows the same code in two tenants while keeping lookup scoped', () => {
    const fixture = [
      { company_id: 'company-a', code: '4100', name: 'Sales Revenue A' },
      { company_id: 'company-b', code: '4100', name: 'Sales Revenue B' },
      { company_id: 'company-a', code: 'CC-001' },
      { company_id: 'company-b', code: 'CC-001' },
    ];
    expect(new Set(fixture.map((row) => `${row.company_id}:${row.code}`)).size).toBe(fixture.length);
    expect(migration).toContain('UNIQUE (company_id, code)');
  });

  it('uses explicit tenant and active-account scope for quotation automation', () => {
    expect(service).toContain("import { resolveFetchCompanyId } from '@/lib/data/fetchers';");
    expect(service).toContain(".eq('company_id', companyId)");
    expect(service).toContain(".eq('is_active', true)");
    expect(service).toContain('company_id: companyId');
    expect(service).toContain('تعذر الوصول إلى إعدادات الحسابات المحاسبية للشركة. يرجى مراجعة إعدادات المحاسبة.');
    expect(service).not.toContain('يرجى تشغيل سكربت الإعداد');
  });
});
