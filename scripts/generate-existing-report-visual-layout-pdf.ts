import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_COMPANY_PROFILE } from '../lib/company-profile';
import { parseProjectEngineeringData } from '../lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '../lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '../lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { buildExistingTechnicalReportModel } from '../lib/projects/existing-technical-report-model';
import { renderHtmlToPdfBuffer } from '../lib/print/chromium-html-to-pdf.server';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '../lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '../lib/types/project-reports';
import type { ClientRecord } from '../lib/types/client';

const outDir = join(process.cwd(), 'artifacts/existing-report-visual-layout');
mkdirSync(outDir, { recursive: true });

const client: ClientRecord = {
  id: 'visual-layout-pdf',
  client_code: 'LD-VIS-PDF',
  name: 'تنسيق بصري',
  business_name: 'منشأة تنسيق بصري',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'النرجس',
  street: 'شارع 1',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'visual-layout-pdf',
    projectId: 'p1',
    projectCode: 'PRJ-VIS-PDF',
    projectClassification: 'EXISTING',
  },
};

const svg = (w: number, h: number, label: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#cfe8ef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="22">${label}</text></svg>`)}`;

const data = parseProjectEngineeringData({
  ...EMPTY_PROJECT_ENGINEERING_DATA,
  technical_report: {
    ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
    outgoing_number: 'TR-VIS-PDF',
    report_date: '2026-08-29',
    location_description: 'موقع اختبار التنسيق البصري.',
    site_surroundings: { north: 'A', south: 'B', east: 'C', west: 'D' },
    facade_photo: { id: 'f1', dataUrl: svg(1600, 500, 'FACADE') },
    earth_photo: { id: 'e1', dataUrl: svg(500, 1400, 'AERIAL') },
    components: [{
      id: 'c1', part_name: 'المبنى', use: 'إداري', area_m2: '920', floors_count: '2', height: '12', capacity: '300', description: 'خرساني', structure: 'خرساني', classification: 'عادي',
    }],
    evidence: {
      version: 1,
      civil_defense: {
        center_name: 'مركز الدفاع المدني',
        distance_value: 2,
        distance_unit: 'km',
        travel_time_minutes: 7,
        route_description: 'مسار اختبار',
        source_label: 'مهندس',
        engineer_confirmed_at: '2026-08-20',
        route_evidence_id: 'r1',
      },
      items: [{
        id: 'r1', kind: 'civil_defense_route', title: 'مسار', category: 'civil_defense_route', display_order: 1, include_in_report: true, created_at: '2026-08-20T00:00:00.000Z',
        file: { id: 'f', dataUrl: svg(1000, 1000, 'ROUTE'), mimeType: 'image/svg+xml', fileName: 'route.svg' },
      }],
    },
  },
  building_plan: { ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan, building_permit_number: 'BP-1', occupancy_classification: 'مكاتب' },
  fire_protection_design: { ...EMPTY_FIRE_PROTECTION_DESIGN },
  existing_assessment: {
    version: 1,
    systems: {
      sprinkler_system: { existing_presence: 'PRESENT', compliance_status: 'NON_COMPLIANT', action_text: 'إجراء.', priority: 'HIGH' },
    },
  },
});

const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
const document = buildExistingFinalTechnicalReportDocument(model);
const html = buildExistingFinalTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });
writeFileSync(join(outDir, 'official-technical-report.html'), html, 'utf8');

async function main() {
  const pdf = await renderHtmlToPdfBuffer(html);
  writeFileSync(join(outDir, 'official-technical-report.pdf'), pdf);
  writeFileSync(join(outDir, 'result.json'), JSON.stringify({ pages: 'generated', bytes: pdf.length }, null, 2));
  console.log(`Wrote ${outDir}/official-technical-report.pdf (${pdf.length} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
