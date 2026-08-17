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
    expect(migration).toContain('WHERE company_id IS NULL');
    expect(migration).toContain('SET company_id = target_company_id');
    expect(migration).toContain('company_id SET NOT NULL');
    expect(migration).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });

  it('enforces tenant-local uniqueness and RLS for both tables', () => {
    expect(migration).toContain('uq_cost_centers_company_code');
    expect(migration).toContain('ON public.cost_centers (company_id, code)');
    expect(migration).toContain('chart_of_accounts_tenant_isolation');
    expect(migration).toContain('cost_centers_tenant_isolation');
    expect(migration).toContain('company_id = public.current_app_company_id()');
    expect(migration).toContain('WITH CHECK');
    expect(migration).not.toContain('USING (true)');
  });

  it('stamps inserts and updates to the current tenant', () => {
    expect(migration).toContain('tg_stamp_accounting_company_id');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.chart_of_accounts');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.cost_centers');
    expect(migration).toContain('NEW.company_id := public.current_app_company_id()');
  });

  it('uses explicit tenant and active-account scope for quotation automation', () => {
    expect(service).toContain("import { resolveFetchCompanyId } from '@/lib/data/fetchers';");
    expect(service).toContain(".eq('company_id', companyId)");
    expect(service).toContain(".eq('is_active', true)");
    expect(service).toContain('تعذر الوصول إلى إعدادات الحسابات المحاسبية للشركة. يرجى مراجعة إعدادات المحاسبة.');
    expect(service).not.toContain('يرجى تشغيل سكربت الإعداد');
  });
});
