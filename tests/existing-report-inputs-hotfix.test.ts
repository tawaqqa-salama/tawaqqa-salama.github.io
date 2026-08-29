import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ExistingTechnicalReportInputsSection from '@/components/projects/ExistingTechnicalReportInputsSection';
import { buildExistingFinalTechnicalReportDocument } from '@/lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { buildExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import {
  EXISTING_AERIAL_MISSING_LABEL,
  EXISTING_CD_ROUTE_MISSING_LABEL,
  EXISTING_FACADE_MISSING_LABEL,
} from '@/lib/projects/existing-technical-report-profile';
import { buildExistingTechnicalReportMissingData } from '@/lib/projects/existing-technical-report-missing-data';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const client: ClientRecord = {
  id: 'existing-inputs-test',
  client_code: 'LD-INPUTS-01',
  name: 'مشروع اختبار',
  business_name: 'منشأة اختبار',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'حي',
  street: 'شارع',
  building_area: 500,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'existing-inputs-test',
    projectId: 'p1',
    projectCode: 'PRJ-1',
    projectClassification: 'EXISTING',
  },
};

describe('EXISTING report inputs hotfix', () => {
  it('wires inputs section into ProjectReportModal for EXISTING only', () => {
    const modal = read('components/projects/ProjectReportModal.tsx');
    expect(modal).toContain('ExistingTechnicalReportInputsSection');
    expect(modal).toContain("projectClassification === 'EXISTING'");
    expect(modal).not.toContain('<TechnicalReportSection');
  });

  it('renders upload fields and dynamic components table', () => {
    const html = renderToStaticMarkup(
      createElement(ExistingTechnicalReportInputsSection, {
        client,
        data: EMPTY_PROJECT_ENGINEERING_DATA,
        report: EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
        saving: false,
        onChange: () => {},
      })
    );
    expect(html).toContain('بيانات التقرير الفني للموقع القائم');
    expect(html).toContain('صورة واجهة المشروع');
    expect(html).toContain('الصورة الجوية للموقع');
    expect(html).toContain('صورة مسار أقرب مركز دفاع مدني');
    expect(html).toContain('+ إضافة مكون');
    expect(html).toContain('قائمة البيانات الناقصة قبل الاعتماد');
    expect(html).toContain('رؤوس وتذييلات الصفحة');
  });

  it('uses updated missing-media labels in sparse PDF html', () => {
    const data = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
        outgoing_number: 'TR-SPARSE-2',
      },
    };
    const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
    const document = buildExistingFinalTechnicalReportDocument(model);
    const html = buildExistingFinalTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });
    expect(html).toContain(EXISTING_FACADE_MISSING_LABEL);
    expect(html).toContain(EXISTING_AERIAL_MISSING_LABEL);
    expect(html).toContain(EXISTING_CD_ROUTE_MISSING_LABEL);
    expect(html).not.toMatch(/official-mandatory-page[^}]*break-after:page/);
  });

  it('tracks missing checklist items without requiring DB migration fields', () => {
    const missing = buildExistingTechnicalReportMissingData(client, EMPTY_PROJECT_ENGINEERING_DATA);
    expect(missing.some((item) => item.id === 'facade_photo' && !item.complete)).toBe(true);
    expect(missing.some((item) => item.id === 'aerial_photo' && !item.complete)).toBe(true);
    expect(missing.some((item) => item.id === 'cd_route_photo' && !item.complete)).toBe(true);
  });
});
