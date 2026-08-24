import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import {
  buildAdminUcReportHtml,
  buildAdminUcTechnicalReportPayload,
  generateAdminUcReport,
  mergeFireProtectionDesign,
} from '@/lib/projects/admin-uc-report';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  EMPTY_TECHNICAL_REPORT,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const client = {
  id: 'visual-fidelity-client',
  client_code: 'VIS-2026-001',
  name: 'منشأة اختبار الإخراج',
  business_name: 'منشأة اختبار الإخراج',
  owner_name: 'مالك الاختبار',
  activity_type: 'administrative',
  project_status: 'تحت الإنشاء',
  city: 'الرياض',
  district: 'العليا',
} as ClientRecord;

function engineeringData(): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      fire_alarm_system: 'نعم',
      sprinkler_system: 'نعم',
    },
    fire_protection_design: mergeFireProtectionDesign({
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      lifecycle_mode: 'under_construction',
      building_kind: 'administrative',
      pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
        exists: 'yes',
        capacity: { value: 1403, unit: 'GPM', input_unit: 'GPM', source: 'engineer_input' },
        pressure: { value: 14, unit: 'bar', input_unit: 'bar', source: 'engineer_input' },
        source: 'engineer_input',
      },
      diesel_pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.diesel_pump,
        exists: 'yes',
        capacity: { value: 1403, unit: 'GPM', input_unit: 'GPM', source: 'engineer_input' },
        pressure: { value: 14, unit: 'bar', input_unit: 'bar', source: 'engineer_input' },
        source: 'engineer_input',
      },
      jockey_pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.jockey_pump,
        exists: 'yes',
        capacity: { value: 50, unit: 'GPM', input_unit: 'GPM', source: 'engineer_input' },
        pressure: { value: 15, unit: 'bar', input_unit: 'bar', source: 'engineer_input' },
        source: 'engineer_input',
      },
      water_tank: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.water_tank,
        exists: 'yes',
        capacity_m3: { value: 79.493, unit: 'm³', source: 'engineer_input' },
        water_demand_lpm: { value: 1324.89, unit: 'L/min', source: 'engineer_input' },
        duration_min: { value: 60, unit: 'min', source: 'engineer_input' },
        source: 'engineer_input',
      },
      sprinkler: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
        system_type: 'wet',
        sprinkler_type: 'upright',
      },
      extinguishers: [
        { id: 'ext-1', type: 'dry_chemical', count: '4', location: 'الممرات', rating: '6 كجم' },
      ],
    }),
  };
}

describe('technical report final visual and print fidelity', () => {
  it('renders the administrative cover as a full A4 branded page while preserving canonical report values', () => {
    const data = engineeringData();
    const document = generateAdminUcReport({
      client,
      report: {
        ...EMPTY_TECHNICAL_REPORT,
        building_status: 'تحت الإنشاء',
        outgoing_number: 'OUT-2026-014',
        report_date: '2026-08-24',
      },
      engineeringData: data,
      company: DEFAULT_COMPANY_PROFILE,
    });
    const html = buildAdminUcReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });

    expect(html).toContain('class="page cover"');
    expect(html).toContain('class="cover-grid"');
    expect(html).toContain('min-height: 297mm');
    expect(html).toContain('التقرير الفني');
    expect(html).toContain('OUT-2026-014');
    expect(html).toContain('1403 GPM');
    expect(html).toContain('14 bar');
    expect(html).toContain('79.493 m³');
    expect(html).toContain('unicode-bidi: plaintext');
    expect(html).not.toContain('class="attachments-section"');
    expect(html).toContain('رطب (Wet Pipe)');
    expect(html).toContain('رأسي (Upright)');
    expect(html).toContain('مسحوق كيميائي جاف (Dry Chemical)');
    expect(html).toContain('لم تُدخل بيانات النظام');
  });

  it('keeps raw compliance diagnostics out of the official administrative payload', () => {
    const payload = buildAdminUcTechnicalReportPayload({
      client,
      report: { ...EMPTY_TECHNICAL_REPORT, building_status: 'تحت الإنشاء' },
      engineeringData: engineeringData(),
      company: DEFAULT_COMPANY_PROFILE,
    });

    expect(payload.html).not.toContain('ملحق — مصفوفة تقييم المطابقة الكودية');
    expect(payload.html).not.toContain('RULE_NOT_CONFIGURED');
    expect(payload.html).not.toContain('NEEDS_DATA');
    expect(payload.html).not.toContain('BLOCKED');
    expect(payload.downloadFormat).toBe('pdf');
  });

  it('preserves the single payload path for preview, print, and PDF download', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/projects/TechnicalReportPrint.tsx'),
      'utf8'
    );
    expect(source).toContain('buildTechnicalReportDocumentPayload');
    expect(source).toContain('openDocumentPreview(await buildTechnicalReportDocumentPayload(params))');
    expect(source).toContain('printDocumentHtml(await buildTechnicalReportDocumentPayload(params))');
    expect(source).toContain('downloadPdfDocument(payload.html, payload.fileName || payload.title)');
  });

  it('uses administrative semantic boundaries for cover, TOC, chapters, and tables in PDF pagination', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/print/html-to-pdf.ts'), 'utf8');
    expect(source).toContain("'.cover'");
    expect(source).toContain("'.toc-block'");
    expect(source).toContain("'.chapter'");
    expect(source).toContain("'.tbl'");
    expect(source).toContain("'.attachments-section'");
    expect(source).toContain("element.matches('.official-table-wrap, .tbl')");
  });
});
