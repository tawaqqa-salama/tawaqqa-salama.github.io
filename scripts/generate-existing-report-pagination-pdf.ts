import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_COMPANY_PROFILE } from '../lib/company-profile';
import { parseProjectEngineeringData } from '../lib/business/project-reports';
import { buildExistingFinalTechnicalReportDocument } from '../lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '../lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { documentToFlowBlocks } from '../lib/projects/engineering-report-engine/renderer/flow-document';
import { buildExistingTechnicalReportModel } from '../lib/projects/existing-technical-report-model';
import { renderHtmlToPdfBuffer } from '../lib/print/chromium-html-to-pdf.server';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '../lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '../lib/types/project-reports';
import type { ClientRecord } from '../lib/types/client';

const outDir = join(process.cwd(), 'artifacts/existing-report-pagination');
mkdirSync(outDir, { recursive: true });

const client: ClientRecord = {
  id: 'pagination-artifact',
  client_code: 'LD-PAG-ART',
  name: 'artifact pagination',
  business_name: 'منشأة artifact',
  owner_name: 'مالك',
  city: 'الرياض',
  district: 'النرجس',
  street: '1',
  building_area: 920,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'pagination-artifact',
    projectId: 'p1',
    projectCode: 'PRJ-PAG-ART',
    projectClassification: 'EXISTING',
  },
};

const svg = (w: number, h: number, label: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#cfe8ef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="22">${label}</text></svg>`)}`;

const data = parseProjectEngineeringData({
  ...EMPTY_PROJECT_ENGINEERING_DATA,
  technical_report: {
    ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
    outgoing_number: 'TR-PAG-ART',
    report_date: '2026-08-29',
    location_description: 'artifact pagination',
    site_surroundings: { north: 'A', south: 'B', east: 'C', west: 'D' },
    facade_photo: { id: 'f1', dataUrl: svg(2000, 500, 'FACADE-WIDE') },
    earth_photo: { id: 'e1', dataUrl: svg(500, 1400, 'AERIAL-TALL') },
    components: Array.from({ length: 28 }, (_, i) => ({
      id: `c${i}`, part_name: `مكون ${i + 1}`, use: 'إداري', area_m2: '100', floors_count: '2', height: '10', capacity: '50', description: 'وصف عربي طويل للتحقق من اللف داخل الخلية'.repeat(3), structure: 'خرساني', classification: 'عادي',
    })),
    evidence: {
      version: 1,
      civil_defense: {
        center_name: 'مركز الدفاع المدني',
        distance_value: 2,
        distance_unit: 'km',
        travel_time_minutes: 7,
        route_description: 'مسار',
        source_label: 'مهندس',
        engineer_confirmed_at: '2026-08-20',
        route_evidence_id: 'r1',
      },
      items: [{
        id: 'r1', kind: 'civil_defense_route', title: 'مسار', category: 'civil_defense_route', display_order: 1, include_in_report: true, created_at: '2026-08-20T00:00:00.000Z',
        file: { id: 'f', dataUrl: svg(1400, 900, 'ROUTE'), mimeType: 'image/svg+xml', fileName: 'route.svg' },
      }],
    },
  },
  building_plan: { ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan, building_permit_number: 'BP-1', occupancy_classification: 'مكاتب' },
  fire_protection_design: { ...EMPTY_FIRE_PROTECTION_DESIGN },
  existing_assessment: {
    version: 1,
    systems: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${i}`, { applicable: true, existing_presence: 'PRESENT', compliance_status: 'NON_COMPLIANT', action_text: `إجراء ${i}`, observation: 'ملاحظة '.repeat(20) }])),
  },
});

async function extractPdfPages(pdfPath: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim());
  }
  return pages;
}

function cleanPdfText(value: string): string {
  return value
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\s\u0640]+/g, '')
    .replace(/[\u202B\u202C]/g, '');
}

function detectSectionPageMap(pages: string[], chapters: { id: string; title: string }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const chapter of [...chapters, { id: 'approvals', title: 'الاعتماد والتوقيعات' }]) {
    const prefix = `SECTION_PAGE_${chapter.id}`;
    const pageIndex = pages.findIndex((rawPage, index) => {
      if (index < 1) return false;
      const page = cleanPdfText(rawPage);
      const start = page.indexOf(prefix);
      return start >= 0 && page.indexOf('MARKEREND', start + prefix.length) >= 0;
    });
    if (pageIndex < 0) throw new Error(`تعذر اكتشاف الصفحة للقسم: ${chapter.id}`);
    map[chapter.id] = pageIndex + 1;
  }
  return map;
}

async function main() {
  if (!existsSync('/usr/bin/google-chrome') && !existsSync('/usr/local/bin/google-chrome') && !existsSync('/usr/bin/chromium')) {
    throw new Error('Chromium غير متاح — لا يمكن توليد PDF artifact.');
  }

  const model = buildExistingTechnicalReportModel(client, data, DEFAULT_COMPANY_PROFILE);
  const document = buildExistingFinalTechnicalReportDocument(model);
  const { chapters } = documentToFlowBlocks(document);
  const html = buildExistingFinalTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE, includeDetectionMarkers: true });
  writeFileSync(join(outDir, 'official-technical-report.html'), html, 'utf8');

  const pdfPath = join(outDir, 'official-technical-report.pdf');
  writeFileSync(pdfPath, renderHtmlToPdfBuffer(html));
  const pages = await extractPdfPages(pdfPath);
  const blankPages = pages.flatMap((page, index) => (page ? [] : [index + 1]));
  const pageMap = detectSectionPageMap(pages, chapters);

  if (blankPages.includes(3)) throw new Error(`Blank page after TOC detected on page 3: ${JSON.stringify(blankPages)}`);
  if (pageMap.facility_data !== 3) throw new Error(`facility_data expected page 3, got ${pageMap.facility_data}`);
  if (pageMap.site_information !== 4) throw new Error(`site_information expected page 4, got ${pageMap.site_information}`);
  if (pageMap.fire_truck_access !== 5) throw new Error(`fire_truck_access expected page 5, got ${pageMap.fire_truck_access}`);
  if (pageMap.project_components !== 6) throw new Error(`project_components expected page 6, got ${pageMap.project_components}`);

  writeFileSync(join(outDir, 'result.json'), JSON.stringify({ pageMap, blankPages, pageCount: pages.length, bytes: readFileSync(pdfPath).length }, null, 2));
  console.log(`Wrote ${pdfPath} (${readFileSync(pdfPath).length} bytes)`);
  console.log(JSON.stringify({ pageMap, blankPages, pageCount: pages.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
