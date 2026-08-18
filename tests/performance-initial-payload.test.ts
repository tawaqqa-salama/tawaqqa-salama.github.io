import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeProjectEngineeringData } from '@/lib/projects/merge-engineering-data';
import {
  CLIENT_BASIC_COLUMNS,
  CLIENT_QUOTATION_COLUMNS,
  PROJECT_LIST_COLUMNS,
} from '@/lib/data/query-config';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const fetchers = read('lib/data/fetchers.ts');
const projectsPage = read('app/projects/page.tsx');
const basicPage = read('app/sales/client-basic-data/page.tsx');
const quotationPage = read('app/sales/client-quotation/page.tsx');
const modal = read('components/clients/ClientDetailModal.tsx');
const safeWrite = read('lib/supabase/safe-client-write.ts');
const salesPage = read('app/sales/page.tsx');
const authProvider = read('lib/auth/AuthProvider.tsx');
const companyProfile = read('lib/company-profile.ts');
const activityLogger = read('lib/activity/logger.ts');

const heavyFields = [
  'project_engineering_data',
  'project_engineering_live',
  'quotation_documents',
  'attachments',
  'report_snapshots',
  'design_center',
  'technical_report',
  'dataUrl',
  'base64',
];

describe('Initial payload performance boundaries', () => {
  it('keeps the Project list projection free of full engineering and attachment payloads', () => {
    for (const field of heavyFields) {
      expect(PROJECT_LIST_COLUMNS).not.toContain(field);
    }
    expect(fetchers).toContain('includeEngineering: false');
    expect(projectsPage).not.toContain('getProjectReportProgress');
    expect(projectsPage).not.toContain('parseProjectEngineeringData');
  });

  it('loads full engineering only when an explicit project detail scope is requested', () => {
    expect(fetchers).toContain("scope: ClientDetailScope = 'project'");
    expect(fetchers).toContain("return scope === 'project' ? attachEngineeringLiveToClient(merged) : merged;");
    expect(fetchers).toContain('fetchClientEngineeringLive');
  });

  it('uses explicit Basic and Quotation projections without select star', () => {
    for (const columns of [CLIENT_BASIC_COLUMNS, CLIENT_QUOTATION_COLUMNS]) {
      expect(columns.split(',')).not.toContain('*');
      expect(columns).not.toContain('project_engineering_data');
      expect(columns).not.toContain('report_snapshots');
      expect(columns).not.toContain('design_center');
    }
    expect(basicPage).toContain("useClientDetail(clientId || null, 'basic')");
    expect(quotationPage).toContain("useClientDetail(clientId || null, 'quotation')");
    expect(fetchers).toContain('fetchClientQuotationDocuments');
    expect(modal).toContain('quotationDocumentsLoaded');
    expect(modal).toContain("...(quotationDocumentsLoaded ? { quotation_documents: quotationDocuments } : {})");
  });

  it('renders Basic Data before engineering live resolves and preserves unseen live fields on save', () => {
    expect(modal).toContain("import('@/lib/data/fetchers')");
    expect(modal).toContain('engineeringBasicLoading');
    expect(modal).toContain('project_engineering_patch');
    expect(safeWrite).toContain('loadEngineeringLive(clientId)');
    expect(safeWrite).toContain('mergeProjectEngineeringData(existingLive, rawEngineeringPatch');
    const remoteClientUpdate = safeWrite.slice(
      safeWrite.indexOf("supabase.from('clients').update(current)"),
      safeWrite.indexOf("supabase.from('clients').update(current)") + 80
    );
    expect(remoteClientUpdate).not.toContain('project_engineering_data');
  });

  it('deep-merges a partial Basic Data permit patch without losing heavy engineering stages', () => {
    const current = {
      building_plan: { building_permit_number: 'old', plan_number: 'keep-plan' },
      technical_report: { building_permit_number: 'old', report_snapshot: { retained: true } },
      design_center: { drawings: [{ id: 'retained-design' }] },
      completion_certificate: { status: 'retained' },
    };
    const next = mergeProjectEngineeringData(current, {
      building_plan: { building_permit_number: 'updated' },
      technical_report: { building_permit_number: 'updated' },
    });

    expect(next.building_plan.building_permit_number).toBe('updated');
    expect(next.building_plan.plan_number).toBe('keep-plan');
    expect((next.technical_report as unknown as Record<string, unknown>).report_snapshot).toEqual({ retained: true });
    const nextRecord = next as unknown as Record<string, unknown>;
    expect(nextRecord.design_center).toEqual(current.design_center);
    expect(nextRecord.completion_certificate).toEqual(current.completion_certificate);
  });

  it('keeps company logos and duplicated auth/profile work out of the critical path', () => {
    expect(companyProfile).toContain(".select('price_per_m2')");
    expect(modal).toContain('loadCompanyPricing');
    expect(authProvider).toContain('result.profile !== undefined');
    expect(activityLogger).toContain('void resolveIp()');
    expect(activityLogger).toContain('remoteActivityUnavailable');
  });

  it('marks Sales list data start and first usability only after the real list resolves', () => {
    expect(salesPage).toContain("import { markPageLoad } from '@/lib/performance/page-load-marks'");
    expect(salesPage).toContain("markPageLoad('page-data-start')");
    expect(salesPage).toContain("markPageLoad('page-data-ready')");
    expect(salesPage).toContain("markPageLoad('first-usable')");

    const listReadyEffect = salesPage.slice(
      salesPage.indexOf("const clients = useMemo"),
      salesPage.indexOf("const filteredDocuments")
    );
    expect(listReadyEffect).toContain("if (tab !== 'sales' || loading) return;");
    expect(listReadyEffect.indexOf("markPageLoad('page-data-ready')")).toBeGreaterThan(0);
    expect(listReadyEffect.indexOf("markPageLoad('first-usable')")).toBeGreaterThan(0);
  });

  it('provides privacy-safe marks only in development or opt-in measurement mode', () => {
    const marks = read('lib/performance/page-load-marks.ts');
    expect(marks).toContain("'auth-ready'");
    expect(marks).toContain("'page-data-start'");
    expect(marks).toContain("'page-data-ready'");
    expect(marks).toContain("'first-usable'");
    expect(marks).toContain("get('performance') === '1'");
  });
});
