import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '@/lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { documentToFlowBlocks } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import {
  EXISTING_REPORT_IMAGE_FRAME,
  getExistingReportDesignSystemCss,
} from '@/lib/projects/engineering-report-engine/renderer/existing-report-design-system';
import {
  buildFireAlarmNarrative,
  buildFireProtectionNarrative,
  buildEngineeringActionsNarrative,
  buildEngineeringReferences,
  buildLifeSafetyNarrative,
  buildElectricalSafetyNarrative,
  EXISTING_REPORT_CHECKLIST_LABELS,
} from '@/lib/projects/existing-report-engineering-narrative';
import {
  buildSiteBoundariesNarrative,
  buildSiteIntroNarrative,
} from '@/lib/projects/existing-report-presentation';
import { buildExistingReportSiteProfile } from '@/lib/projects/existing-technical-report-profile';
import { buildExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const designCss = getExistingReportDesignSystemCss();

const client: ClientRecord = {
  id: 'engineering-narrative-polish-test',
  client_code: 'LD-ENP-01',
  name: 'مشروع Engineering Narrative Polish',
  business_name: 'منشأة Engineering Narrative Polish',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'النرجس',
  street: 'شارع ENP',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'engineering-narrative-polish-test',
    projectId: 'p-enp',
    projectCode: 'PRJ-ENP-01',
    projectClassification: 'EXISTING',
  },
};

function svgDataUrl(width: number, height: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#cfe8ef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#123d4c">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function polishFixture() {
  return parseProjectEngineeringData({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'TR-ENP-01',
      report_date: '2026-08-29',
      location_description: 'موقع Engineering Narrative Polish.',
      maps_url: 'https://maps.google.com/?q=24.8123,46.7123',
      gps_lat: '46262.26',
      gps_lng: '654546.455',
      site_surroundings: { north: 'شارع الأمل', east: 'شارع بعرض 20 مترًا', west: 'مبنى قائم' },
      facade_photo: { id: 'f-wide', dataUrl: svgDataUrl(2000, 500, 'FACADE') },
      earth_photo: { id: 'f-tall', dataUrl: svgDataUrl(500, 1600, 'AERIAL') },
      components: [{
        id: 'c-ground',
        part_name: 'دور أرضي',
        use: 'إداري',
        area_m2: '520',
        floors_count: '1',
        height: '5',
        capacity: '120',
        description: 'خرساني',
        structure: 'خرساني',
        classification: 'عادي',
      }],
      evidence: {
        version: 1,
        civil_defense: {
          center_name: 'مركز الدفاع المدني',
          distance_value: 2,
          distance_unit: 'km',
          travel_time_minutes: 7,
          route_description: 'مسار الوصول من الشارع الرئيسي.',
          source_label: 'مهندس',
          engineer_confirmed_at: '2026-08-20',
          route_evidence_id: 'r1',
        },
        items: [{
          id: 'r1',
          kind: 'civil_defense_route',
          title: 'مسار',
          category: 'civil_defense_route',
          display_order: 1,
          include_in_report: true,
          created_at: '2026-08-20T00:00:00.000Z',
          file: { id: 'f', dataUrl: svgDataUrl(1400, 900, 'ROUTE'), mimeType: 'image/svg+xml', fileName: 'route.svg' },
        }],
      },
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      northing: '2391979.9527',
      easting: '513415.8874',
      building_permit_number: 'BP-ENP-01',
      occupancy_classification: 'مكاتب',
    },
    design_center: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
      space_safety: {
        source: 'project_engineering',
        floors: [{
          id: 'floor-1',
          label: 'الدور الأرضي',
          repeat_count: 1,
          areas: [{
            id: 'area-1',
            label: 'مكاتب إدارية',
            area_m2: 850,
            hazard_suggested: 'ordinary_hazard_group_1',
            suppression_suggested: ['رش آلي'],
            quantities: {
              sprinklers: 147,
              smoke_detectors: 18,
              heat_detectors: 4,
              fire_alarm_panels: 2,
              alarm_panel_locations: ['المدخل الرئيسي'],
              signs: 6,
              emergency_lights: 8,
              emergency_exits: 4,
              alarm_bells: 5,
              emergency_stairs: 2,
              manual_extinguishers: 8,
              elevators: 0,
              public_facilities: 0,
            },
          }],
        }],
      },
    },
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
        type: 'UL',
        capacity: { value: 350, unit: 'GPM', source: 'engineer_input' },
        pressure: { value: 7, unit: 'bar', source: 'engineer_input' },
      },
      diesel_pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.diesel_pump,
        capacity: { value: 350, unit: 'GPM', source: 'engineer_input' },
        pressure: { value: 7, unit: 'bar', source: 'engineer_input' },
      },
      jockey_pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.jockey_pump,
        capacity: { value: 35, unit: 'GPM', source: 'engineer_input' },
        pressure: { value: 12, unit: 'bar', source: 'engineer_input' },
      },
      sprinkler: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
        k_factor: '6.5',
        system_type: 'Wet Pipe',
      },
      fire_alarm: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.fire_alarm,
        control_panel: '2 لوحات',
        manual_call_points: '8',
        voice_alarm: 'متوفر',
      },
    },
    existing_assessment: {
      version: 1,
      systems: {
        fire_truck_access: {
          applicable: true,
          existing_presence: 'PRESENT',
          compliance_status: 'NEEDS_COMPLETION',
          action_text: 'استكمال بيانات الوصول.',
          requirement_reference: 'متطلبات الدفاع المدني',
        },
        fire_tank: {
          applicable: true,
          existing_presence: 'PRESENT',
          observed_configuration: 'خزان مياه حريق',
          observed_specs: [{ id: 'v', label: 'السعة', value: '79.493 m³' }],
          compliance_status: 'COMPLIANT',
          required_text: 'سعة خزان مطابقة.',
          requirement_reference: 'SBC 801',
        },
        sprinkler_system: {
          applicable: true,
          existing_presence: 'PRESENT',
          compliance_status: 'NON_COMPLIANT',
          action_text: 'إجراء رش.',
          priority: 'HIGH',
          requirement_reference: 'SBC 801',
        },
        smoke_detectors: {
          applicable: true,
          existing_presence: 'PRESENT',
          compliance_status: 'COMPLIANT',
          requirement_reference: 'SBC 801',
        },
      },
    },
  });
}

function buildReport(data = polishFixture()) {
  const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
  const document = buildExistingFinalTechnicalReportDocument(model);
  const html = buildExistingFinalTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });
  const { blocks } = documentToFlowBlocks(document);
  return { model, document, html, blocks, data };
}

function checklistLabelCount(html: string, label: string): number {
  return (html.match(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

describe('EXISTING report engineering narrative polish', () => {
  it('A — removes repeated checklist labels from rendered HTML', () => {
    const { html } = buildReport();
    for (const label of EXISTING_REPORT_CHECKLIST_LABELS) {
      expect(checklistLabelCount(html, label)).toBeLessThanOrEqual(1);
    }
    expect(html).not.toContain('existing-report-assessment-unit');
    expect(html).toContain('existing-report-engineering-item');
  });

  it('B — fire protection narrative includes canonical tank and sprinkler values', () => {
    const { model } = buildReport();
    const fireGroup = model.assessment_sections.find((section) => section.id === 'firefighting');
    const blocks = buildFireProtectionNarrative(fireGroup!.systems, model.engineering_sections);
    const text = JSON.stringify(blocks);
    expect(text).toContain('79.493');
    expect(text).toContain('147');
    expect(text).toContain('6.5');
  });

  it('C — alarm narrative includes registered detector counts', () => {
    const { model } = buildReport();
    const alarmGroup = model.assessment_sections.find((section) => section.id === 'alarm');
    const blocks = buildFireAlarmNarrative(alarmGroup?.systems || [], model.engineering_sections);
    const text = JSON.stringify(blocks);
    expect(text).toContain('18');
    expect(text).toContain('4');
  });

  it('D — missing site boundary side is not invented in narrative', () => {
    const data = polishFixture();
    data.technical_report.site_surroundings = { north: 'A' };
    const site = buildExistingReportSiteProfile(client, data, null);
    expect(buildSiteBoundariesNarrative(site)).toBe('يحد الموقع من جهة الشمال A.');
    expect(buildSiteIntroNarrative(site, null)).toBe('موقع Engineering Narrative Polish.');
  });

  it('E — only real actions appear in consolidated actions section', () => {
    const { model, document } = buildReport();
    const actionsSection = document.sections.find((section) => section.id === 'existing_recommendations');
    const actionsText = JSON.stringify(actionsSection?.presentation_blocks || []);
    expect(actionsText).toContain('إجراء رش.');
    expect(actionsText).toContain('استكمال بيانات الوصول.');
    expect(actionsText).not.toContain('لم يُسجل إجراء مطلوب');
    const compliantOnly = buildEngineeringActionsNarrative({
      ...model,
      assessment_sections: model.assessment_sections.map((group) => ({
        ...group,
        systems: group.systems.filter((system) => system.compliance_status === 'COMPLIANT'),
      })),
      recommendations: [],
    });
    expect(JSON.stringify(compliantOnly)).toContain('لم تُسجل إجراءات تصحيحية إضافية');
  });

  it('F — references are deduplicated in dedicated section', () => {
    const { model, document } = buildReport();
    const refs = buildEngineeringReferences(model);
    const refSection = document.sections.find((section) => section.id === 'code_evidence_references');
    expect(refSection?.title_ar).toBe('المراجع وأساس التقييم');
    const items = refs.flatMap((block) => (block.type === 'reference_list' ? block.items : []));
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBe(new Set(items).size);
    const registered = new Set<string>();
    for (const basis of model.assessment_basis) {
      const reference = basis.reference?.trim();
      if (reference) registered.add(reference);
    }
    for (const group of model.assessment_sections) {
      for (const system of group.systems) {
        const reference = system.requirement_reference?.trim();
        if (reference) registered.add(reference);
      }
    }
    expect(items.every((item) => registered.has(item))).toBe(true);
  });

  it('G — page 3 remains establishment data + facade image', () => {
    const { document, html } = buildReport();
    const facility = document.sections.find((section) => section.id === 'facility_data');
    expect(facility?.tables?.[0]?.caption_ar).toBe('بيانات المنشأة');
    expect(html).toContain('id="sec-facility_data"');
    expect(html).toContain('existing-report-image-block');
  });

  it('H — page 4 remains site narrative + aerial image', () => {
    const { document, html } = buildReport();
    const site = document.sections.find((section) => section.id === 'site_information');
    expect(site?.presentation_blocks?.length).toBeGreaterThan(0);
    expect(html).toContain('id="sec-site_information"');
    expect(html).toContain('513415.8874');
  });

  it('I — page 5 remains civil defense access + route image', () => {
    const { document, html } = buildReport();
    const cd = document.sections.find((section) => section.id === 'fire_truck_access');
    expect(cd?.presentation_blocks?.length).toBeGreaterThan(0);
    expect(html).toContain('id="sec-fire_truck_access"');
    expect(html).toContain('تمت دراسة إمكانية وصول آليات الدفاع المدني');
  });

  it('J — page 6 remains project components', () => {
    const { document, html } = buildReport();
    const components = document.sections.find((section) => section.id === 'project_components');
    expect(components?.tables?.[0]?.caption_ar).toBe('مكونات المشروع');
    expect(html).toContain('id="sec-project_components"');
  });

  it('K — assessments begin after page 6 in flow', () => {
    const { blocks } = buildReport();
    const componentsIndex = blocks.findIndex((block) => block.kind === 'chapter' && block.id === 'project_components');
    const breakIndex = blocks.findIndex((block) => block.kind === 'page_break');
    const nextAssessmentIndex = blocks.findIndex((block) => block.kind === 'chapter' && block.id.startsWith('existing_assessment_'));
    expect(componentsIndex).toBeGreaterThanOrEqual(0);
    expect(breakIndex).toBeGreaterThan(componentsIndex);
    expect(nextAssessmentIndex).toBeGreaterThan(breakIndex);
  });

  it('L — no blank pages in generated artifact when present', () => {
    const resultPath = resolve(root, 'artifacts/existing-report-engineering-narrative-polish/result.json');
    if (!existsSync(resultPath)) return;
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as { blankPages?: number[] };
    expect(result.blankPages || []).toEqual([]);
  });

  it('M — Arabic RTL visual rendering', () => {
    const { html } = buildReport();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('Noto Naskh Arabic');
    expect(html).toContain('79.493');
  });

  it('N — preview / print / PDF parity via single renderer', () => {
    const template = read('lib/projects/engineering-report-engine/renderer/existing-final-technical-template.ts');
    expect(template).toContain('getEmbeddedArabicFontCss');
    expect(read('lib/print/chromium-html-to-pdf.server.ts')).toContain('materializeEmbeddedFontsForPrint');
    expect(read('components/projects/TechnicalReportPrint.tsx')).toContain('buildExistingFinalTechnicalReportHtml');
  });

  it('life safety and electrical narrative builders stay deterministic', () => {
    const { model } = buildReport();
    const lifeSafety = model.assessment_sections.find((section) => section.id === 'life_safety');
    const electrical = model.assessment_sections.find((section) => section.id === 'electrical');
    expect(JSON.stringify(buildLifeSafetyNarrative(lifeSafety?.systems || []))).toContain('سلامة الحياة');
    expect(JSON.stringify(buildElectricalSafetyNarrative(electrical?.systems || []))).not.toContain('spacing');
  });

  it('IMAGE FRAME preserved', () => {
    const { html } = buildReport();
    expect(designCss).toContain(`height:${EXISTING_REPORT_IMAGE_FRAME.height}`);
    expect(designCss).toContain('object-fit:cover');
    expect(html).toContain('existing-report-image-slot');
  });
});
