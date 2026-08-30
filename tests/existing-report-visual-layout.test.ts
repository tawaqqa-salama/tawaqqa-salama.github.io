import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '@/lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import {
  EXISTING_REPORT_IMAGE_FRAME,
  EXISTING_REPORT_IMAGE_SLOT_CLASS,
  EXISTING_REPORT_TABLE_CLASS,
  buildExistingReportTableColgroup,
  existingReportTableLayoutClass,
  getExistingReportDesignSystemCss,
  renderExistingReportImageSlotHtml,
  resolveExistingReportTableLayout,
} from '@/lib/projects/engineering-report-engine/renderer/existing-report-design-system';
import {
  EXISTING_AERIAL_MISSING_LABEL,
  EXISTING_CD_ROUTE_MISSING_LABEL,
  EXISTING_FACADE_MISSING_LABEL,
} from '@/lib/projects/existing-technical-report-profile';
import { buildExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { documentToFlowBlocks } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const client: ClientRecord = {
  id: 'visual-layout-test',
  client_code: 'LD-VIS-01',
  name: 'مشروع تنسيق بصري',
  business_name: 'منشأة تنسيق بصري',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'النرجس',
  street: 'شارع التنسيق',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'visual-layout-test',
    projectId: 'p-visual',
    projectCode: 'PRJ-VIS-01',
    projectClassification: 'EXISTING',
  },
};

function svgDataUrl(width: number, height: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#cfe8ef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#123d4c">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function richFixture() {
  return parseProjectEngineeringData({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'TR-VIS-01',
      report_date: '2026-08-29',
      location_description: 'موقع تجريبي للتنسيق البصري.',
      maps_url: 'https://maps.google.com/example',
      gps_lat: '24.8123',
      gps_lng: '46.7123',
      site_surroundings: { north: 'شارع A', south: 'مبنى B', east: 'موقف C', west: 'حديقة D' },
      facade_photo: { id: 'f-landscape', caption: 'واجهة', dataUrl: svgDataUrl(1600, 400, 'LANDSCAPE') },
      earth_photo: { id: 'f-portrait', caption: 'جوية', dataUrl: svgDataUrl(400, 1600, 'PORTRAIT') },
      components: [{
        id: 'c1',
        part_name: 'المبنى الرئيسي',
        use: 'إداري',
        area_m2: '920',
        floors_count: '2',
        height: '12',
        capacity: '350',
        description: 'هيكل خرساني',
        structure: 'خرساني',
        classification: 'خطر عادي',
      }],
      evidence: {
        version: 1,
        civil_defense: {
          center_name: 'مركز الدفاع المدني — النرجس',
          distance_value: 2.4,
          distance_unit: 'km',
          travel_time_minutes: 8,
          route_description: 'طريق خدمة ثم شارع رئيسي',
          source_label: 'سجل المهندس',
          engineer_confirmed_at: '2026-08-20',
          route_evidence_id: 'cd-route-01',
        },
        items: [{
          id: 'cd-route-01',
          kind: 'civil_defense_route',
          title: 'خريطة مسار الوصول',
          category: 'civil_defense_route',
          display_order: 1,
          include_in_report: true,
          created_at: '2026-08-20T00:00:00.000Z',
          file: {
            id: 'cd-file',
            dataUrl: svgDataUrl(1200, 1200, 'SQUARE'),
            mimeType: 'image/svg+xml',
            fileName: 'square.svg',
          },
        }],
      },
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      building_use: 'مبنى إداري قائم',
      occupancy_classification: 'مكاتب إدارية',
      building_permit_number: 'BP-VIS-01',
    },
    fire_protection_design: { ...EMPTY_FIRE_PROTECTION_DESIGN },
    existing_assessment: {
      version: 1,
      systems: {
        sprinkler_system: {
          existing_presence: 'PRESENT',
          compliance_status: 'NON_COMPLIANT',
          action_text: 'إجراء مطلوب.',
          priority: 'HIGH',
        },
      },
    },
  });
}

function buildHtml(data = richFixture()) {
  const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
  const document = buildExistingFinalTechnicalReportDocument(model);
  const html = buildExistingFinalTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });
  return { model, document, html };
}

describe('EXISTING report visual layout finalization', () => {
  it('exports shared table and image design system classes', () => {
    expect(EXISTING_REPORT_TABLE_CLASS).toBe('existing-report-table');
    expect(EXISTING_REPORT_IMAGE_SLOT_CLASS).toBe('existing-report-image-slot');
    expect(resolveExistingReportTableLayout('بيانات المنشأة', ['البند', 'البيان'])).toBe('key-value');
    expect(resolveExistingReportTableLayout('مكونات المشروع', ['م', 'اسم المكون'])).toBe('components');
    expect(buildExistingReportTableColgroup('components', 9)).toContain('colgroup');
    const css = getExistingReportDesignSystemCss();
    expect(css).toContain('object-fit:cover');
    expect(css).toContain(`height:${EXISTING_REPORT_IMAGE_FRAME.height}`);
  });

  it('renders all primary images inside the unified fixed frame with cover crop', () => {
    const slot = renderExistingReportImageSlotHtml({
      title: 'صورة واجهة المشروع',
      src: svgDataUrl(2000, 500, 'WIDE'),
      variant: 'photo',
    });
    expect(slot).toContain('existing-report-image-slot');
    expect(getExistingReportDesignSystemCss()).toContain('object-fit:cover');
    expect(slot).toContain('<img src=');
  });

  it('uses placeholder frame for missing facade/aerial/cd images', () => {
    const sparse = parseProjectEngineeringData({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: { ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report, outgoing_number: 'TR-SPARSE-VIS' },
    });
    const { html } = buildHtml(sparse);
    expect(html).toContain(EXISTING_FACADE_MISSING_LABEL);
    expect(html).toContain(EXISTING_AERIAL_MISSING_LABEL);
    expect(html).toContain(EXISTING_CD_ROUTE_MISSING_LABEL);
    expect(html).toContain('existing-report-image-slot is-missing');
    expect(html).toContain(`class="${EXISTING_REPORT_TABLE_CLASS}`);
  });

  it('applies shared table classes and components column layout in rendered HTML', () => {
    const { html, document } = buildHtml();
    expect(html).toContain('existing-report-table--key-value');
    expect(html).toContain('existing-report-table--components');
    expect(html).toContain('اسم المكون');
    expect(html).toContain('يحد الموقع');
    expect(html).toContain('خريطة مسار الوصول');
    const components = document.sections.find((section) => section.id === 'project_components');
    expect(components?.tables?.[0]?.headers_ar?.[0]).toBe('م');
  });

  it('keeps long Arabic cell text wrapped without shrinking below readable print size', () => {
    const css = getExistingReportDesignSystemCss();
    expect(css).toContain('overflow-wrap:anywhere');
    expect(css).toContain(`${EXISTING_REPORT_TABLE_CLASS} { width:100%`);
    expect(css).toContain('font-size:10px');
    const longText = 'نص عربي طويل '.repeat(20);
    const tableHtml = `<table class="${existingReportTableLayoutClass('key-value')}"><tbody><tr><td>${longText}</td><td>${longText}</td></tr></tbody></table>`;
    expect(tableHtml).toContain(longText);
  });

  it('renders landscape/portrait/square/small/large fixtures through the same image slot markup', () => {
    const variants = [
      svgDataUrl(1600, 400, 'LANDSCAPE'),
      svgDataUrl(400, 1600, 'PORTRAIT'),
      svgDataUrl(800, 800, 'SQUARE'),
      svgDataUrl(80, 80, 'SMALL'),
      svgDataUrl(2400, 1800, 'LARGE'),
    ];
    for (const src of variants) {
      const html = renderExistingReportImageSlotHtml({ title: 'صورة', src, variant: 'photo' });
      expect(html).toContain('existing-report-image-slot');
      expect(html).toContain('existing-report-image-block');
      expect(html).not.toContain('object-fit:contain');
    }
  });

  it('writes visual layout HTML artifact for manual/PDF inspection', () => {
    const { html } = buildHtml();
    const outDir = resolve(root, 'artifacts/existing-report-visual-layout');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'official-technical-report.html'), html, 'utf8');
    const { blocks } = documentToFlowBlocks(buildHtml().document);
    const blankLike = blocks.filter((block) => block.kind === 'paragraph' && block.text.trim() === '');
    expect(blankLike).toHaveLength(0);
    expect(html).toContain('existing-report-table-wrap');
  });
});
