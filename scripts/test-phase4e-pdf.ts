import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import type { CompanyProfile } from '../lib/company-profile';
import { buildEngineeringStudyHtml } from '../lib/projects/engineering-report-engine/print-html';
import { documentToFlowBlocks } from '../lib/projects/engineering-report-engine/renderer/flow-document';
import { generateTechnicalReportDocument } from '../lib/projects/technical-report-document';
import type { ClientRecord } from '../lib/types/client';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '../lib/types/project-reports';

const outDir = '/tmp/phase4e-pdf-fixtures';
const assetDir = join(outDir, 'assets');
mkdirSync(outDir, { recursive: true });

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl3bx0AAAAASUVORK5CYII=';

function ensureQaAssets() {
  const generated = spawnSync('python3', ['scripts/generate-phase4e-qa-assets.py', assetDir], {
    encoding: 'utf8',
    timeout: 120000,
  });
  if (generated.status !== 0) throw new Error(generated.stderr || generated.stdout || 'تعذر إنشاء أصول QA المحلية.');
}

function localQaImage(name: string): string {
  const data = readFileSync(join(assetDir, name));
  return `data:image/png;base64,${data.toString('base64')}`;
}
const client: ClientRecord = {
  id: 'fixture-phase4e', client_code: 'P4E-FIX', name: 'منشأة اختبار Phase 4E', business_name: 'منشأة اختبار Phase 4E', owner_name: 'مالك الاختبار', city: 'الرياض', building_area: 220, floors_count: 1,
};
const company = { name: 'توقع سلامة', legal_name: 'توقع سلامة للاستشارات', stamp_text: 'ختم اختبار' } as CompanyProfile;

function evidence(
  id: string,
  kind: 'site_general' | 'satellite_image' | 'existing_condition' | 'safety_system' | 'code_excerpt',
  order: number,
  options: {
    included?: boolean;
    image?: boolean;
    title?: string;
    asset?: string;
    tiny?: boolean;
    unavailable?: boolean;
    caption?: string;
    note?: string;
  } = {}
) {
  const code = kind === 'code_excerpt';
  const pdfOnly = options.image === false;
  const unavailable = Boolean(options.unavailable);
  return {
    id,
    kind,
    category: kind,
    title: options.title || `دليل اختبار ${id}`,
    caption: options.caption || `وصف مهندس تفصيلي للمرفق ${id} ضمن اختبار تخطيط التقرير الفني.`,
    engineering_observation: options.note || `ملاحظة مهندس طويلة محفوظة للمرفق ${id} للتحقق من تدفق النص وتماسك التعليق مع الوسيط.`,
    display_order: order,
    include_in_report: options.included ?? true,
    association: null,
    file: {
      id,
      fileName: `${id}.${pdfOnly ? 'pdf' : 'png'}`,
      mimeType: pdfOnly ? 'application/pdf' : 'image/png',
      dataUrl: pdfOnly || unavailable ? null : options.tiny ? PIXEL : localQaImage(options.asset || 'safety-landscape.png'),
      storagePath: pdfOnly || unavailable ? `fixture/technical-evidence/${id}.${pdfOnly ? 'pdf' : 'png'}` : null,
    },
    code_reference: code ? { source_standard: 'SBC 801', edition: '2024', chapter: '8', clause: '8.2.1', page_number: 12 } : null,
    created_at: '2026-08-20T00:00:00.000Z',
  };
}

function baseReport() {
  return {
    ...EMPTY_TECHNICAL_REPORT,
    outgoing_number: 'P4E-FIX-01',
    report_date: '2026-08-20',
    location_description: 'بيانات Fixture فقط',
    floor_uses: [{ id: 'floor-1', floor_name: 'الأرضي', floor_area_m2: '220', structure: '', classification: 'B', zones: [{ id: 'space-1', label: 'مكاتب', use_code: 'مكاتب', area_m2: '220', occupancy_code: 'B' }] }],
  };
}

function makeCases() {
  const none = baseReport();
  const approved = {
    ...baseReport(),
    recommendations_v2: {
      version: 1 as const,
      items: [
        { id: 'approved', library_item_id: 'rec-1', library_version: 'fixture', status: 'approved' as const, effective_text_ar: 'توصية معتمدة للاختبار فقط.', manual_override: false, sort_order: 2, fingerprint: 'approved', affected_scopes: [], evidence_ids: [], code_evidence_ids: [], source: 'office_template' as const, approved_at: '2026-08-20T00:00:00.000Z' },
        { id: 'edited', library_item_id: 'rec-2', library_version: 'fixture', status: 'edited' as const, effective_text_ar: 'نص مهندس معدل معتمد للاختبار فقط.', manual_override: true, sort_order: 1, fingerprint: 'edited', affected_scopes: [], evidence_ids: [], code_evidence_ids: [], source: 'engineer_manual' as const, approved_at: '2026-08-20T00:00:00.000Z' },
        { id: 'suggested', library_item_id: 'rec-3', library_version: 'fixture', status: 'suggested' as const, effective_text_ar: 'مقترح مستبعد من PDF.', manual_override: false, sort_order: 3, fingerprint: 'suggested', affected_scopes: [], evidence_ids: [], code_evidence_ids: [], source: 'office_template' as const },
        { id: 'rejected', library_item_id: 'rec-4', library_version: 'fixture', status: 'rejected' as const, effective_text_ar: 'توصية مرفوضة يجب ألا تظهر في PDF.', manual_override: false, sort_order: 4, fingerprint: 'rejected', affected_scopes: [], evidence_ids: [], code_evidence_ids: [], source: 'office_template' as const },
        { id: 'manual-unapproved', library_item_id: 'manual-fixture', library_version: 'fixture', status: 'suggested' as const, effective_text_ar: 'توصية يدوية غير معتمدة يجب ألا تظهر في PDF.', manual_override: true, sort_order: 5, fingerprint: 'manual-unapproved', affected_scopes: [], evidence_ids: [], code_evidence_ids: [], source: 'engineer_manual' as const },
      ],
    },
  };
  const siteCivil = {
    ...baseReport(),
    evidence: {
      version: 1 as const,
      civil_defense: { center_name: 'مركز دفاع مدني Fixture', distance_value: 2.5, distance_unit: 'km' as const, travel_time_minutes: 6, source_label: 'مدخل من المهندس للاختبار' },
      items: [
        evidence('site', 'site_general', 1, { asset: 'site-landscape.png' }),
        evidence('satellite', 'satellite_image', 2, { asset: 'satellite-map.png' }),
      ],
    },
  };
  const existingSafety = {
    ...baseReport(),
    evidence: {
      version: 1 as const,
      civil_defense: null,
      items: [
        evidence('existing-1', 'existing_condition', 1, { asset: 'existing-portrait.png' }),
        evidence('existing-2', 'existing_condition', 2, { asset: 'existing-portrait.png' }),
        evidence('system-1', 'safety_system', 3, { asset: 'safety-landscape.png' }),
        evidence('system-2', 'safety_system', 4, { asset: 'safety-landscape.png' }),
      ],
    },
  };
  const codeStress = {
    ...baseReport(),
    evidence: {
      version: 1 as const,
      civil_defense: null,
      items: [
        evidence('code-one', 'code_excerpt', 1, { asset: 'code-excerpt.png', title: 'مقتطف كودي واحد' }),
        evidence('code-two', 'code_excerpt', 2, { asset: 'code-excerpt.png', title: 'مقتطف كودي ثانٍ' }),
        evidence('code-three', 'code_excerpt', 3, { asset: 'code-excerpt.png', title: 'مقتطف كودي ثالث مع وصف طويل للحفاظ على اختبار التماسك' }),
        evidence('code-pdf', 'code_excerpt', 4, { image: false, title: 'مرجع PDF دون معاينة' }),
      ],
    },
  };
  const mediaFallback = {
    ...baseReport(),
    evidence: {
      version: 1 as const,
      civil_defense: null,
      items: [
        evidence('tiny', 'existing_condition', 1, { tiny: true, title: 'وسيط صغير جدًا' }),
        evidence('unavailable', 'safety_system', 2, { unavailable: true, title: 'وسيط تعذر تحميله' }),
        evidence('excluded', 'safety_system', 3, { included: false, asset: 'safety-landscape.png', title: 'وسيط مستبعد من التقرير' }),
      ],
    },
  };
  const legacy = {
    ...baseReport(),
    facade_photo: { id: 'legacy-facade', caption: 'واجهة تاريخية', dataUrl: localQaImage('site-landscape.png') },
    earth_photo: { id: 'legacy-earth', caption: 'خريطة تاريخية', dataUrl: localQaImage('satellite-map.png') },
  };
  const long = {
    ...approved,
    evidence: {
      version: 1 as const,
      civil_defense: null,
      items: [
        evidence('long-site-1', 'site_general', 1, { asset: 'site-landscape.png', title: 'صورة الموقع العام' }),
        evidence('long-map-1', 'satellite_image', 2, { asset: 'satellite-map.png', title: 'خريطة الموقع والمسار' }),
        evidence('long-existing-1', 'existing_condition', 3, { asset: 'existing-portrait.png', title: 'الحالة القائمة للمخرج الرئيسي' }),
        evidence('long-system-1', 'safety_system', 4, { asset: 'safety-landscape.png', title: 'لوحة نظام الإنذار' }),
        evidence('long-code-1', 'code_excerpt', 5, { asset: 'code-excerpt.png', title: 'مقتطف SBC 801 المرجعي' }),
        evidence('long-existing-2', 'existing_condition', 6, { asset: 'existing-portrait.png', title: 'حالة قائمة إضافية' }),
        evidence('long-system-2', 'safety_system', 7, { asset: 'safety-landscape.png', title: 'نظام سلامة إضافي' }),
        evidence('long-existing-3', 'existing_condition', 8, { asset: 'existing-portrait.png', title: 'توثيق باب الهروب' }),
        evidence('long-system-3', 'safety_system', 9, { asset: 'safety-landscape.png', title: 'توثيق لوحة إنذار إضافية' }),
        evidence('long-code-2', 'code_excerpt', 10, { asset: 'code-excerpt.png', title: 'مقتطف كودي ثانٍ' }),
        evidence('long-tiny-1', 'existing_condition', 11, { tiny: true, title: 'مرفق معاينته صغيرة جدًا' }),
        evidence('long-unavailable-1', 'safety_system', 12, { unavailable: true, title: 'مرفق تعذر تحميل معاينته' }),
        evidence('long-site-2', 'site_general', 13, { asset: 'site-landscape.png', title: 'صورة موقع إضافية' }),
        evidence('long-map-2', 'satellite_image', 14, { asset: 'satellite-map.png', title: 'خريطة وصول إضافية' }),
        evidence('long-existing-4', 'existing_condition', 15, { asset: 'existing-portrait.png', title: 'توثيق الحالة القائمة النهائي' }),
        evidence('long-system-4', 'safety_system', 16, { asset: 'safety-landscape.png', title: 'توثيق نظام السلامة النهائي' }),
        evidence('long-code-3', 'code_excerpt', 17, { asset: 'code-excerpt.png', title: 'مقتطف كودي نهائي' }),
        evidence('long-pdf-reference', 'code_excerpt', 18, { image: false, title: 'مرجع PDF دون معاينة' }),
      ],
    },
  };
  return {
    fixture_a_base: none,
    fixture_b_approved: approved,
    fixture_c_site_civil: siteCivil,
    fixture_d_existing_safety: existingSafety,
    fixture_e_code_stress: codeStress,
    fixture_f_full_long: long,
    fixture_g_media_fallback: mediaFallback,
    fixture_h_legacy: legacy,
  };
}

function flattenFigures(blocks: ReturnType<typeof documentToFlowBlocks>['blocks']) {
  const result: number[] = [];
  const walk = (items: typeof blocks) => {
    for (const item of items) {
    if (item.kind === 'figure') result.push(item.figureNo);
    if (item.kind === 'figure_row') result.push(...item.figures.map((figure) => figure.figureNo));
    if (item.kind === 'code_sequence') result.push(...item.figures.map((figure) => figure.figureNo));
    if (item.kind === 'unit') walk(item.blocks);
    }
  };
  walk(blocks);
  return result;
}

async function renderCase(name: string, report: ReturnType<typeof baseReport>) {
  const document = generateTechnicalReportDocument({
    client,
    report: report as never,
    engineeringData: { ...EMPTY_PROJECT_ENGINEERING_DATA, technical_report: report as never },
  });
  const html = buildEngineeringStudyHtml({ document, company });
  const htmlPath = join(outDir, `${name}.html`);
  const pdfPath = join(outDir, `${name}.pdf`);
  writeFileSync(htmlPath, html, 'utf8');
  const chrome = spawnSync('chromium', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
    `--print-to-pdf=${pdfPath}`, '--no-pdf-header-footer', '--print-to-pdf-no-header', pathToFileURL(htmlPath).href,
  ], { encoding: 'utf8', timeout: 120000 });
  if (chrome.status !== 0) throw new Error(chrome.stderr || chrome.stdout || `تعذر طباعة fixture ${name}`);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim());
  }
  const flow = documentToFlowBlocks(document);
  return {
    name,
    pdfPath,
    htmlPath,
    pages: pdf.numPages,
    blankPages: pages.reduce<number[]>((result, page, index) => (page.length ? result : [...result, index + 1]), []),
    sections: document.sections.map((section) => section.id),
    toc: flow.chapters.map((chapter) => chapter.id),
    figures: flattenFigures(flow.blocks),
    tables: flow.blocks.filter((block) => block.kind === 'table').map((block) => block.kind === 'table' ? block.tableNo : 0),
    references: flow.blocks.filter((block) => block.kind === 'reference_note').map((block) => block.kind === 'reference_note' ? block.referenceNo : 0),
    text: pages.join('\n'),
  };
}

async function main() {
  ensureQaAssets();
  const cases = makeCases();
  const requestedNames = process.argv.slice(2);
  const selectedCases = requestedNames.length
    ? requestedNames.map((name) => {
        const report = cases[name as keyof typeof cases];
        if (!report) throw new Error(`Fixture غير معروف: ${name}`);
        return [name, report] as const;
      })
    : Object.entries(cases);
  const output = [];
  for (const [name, report] of selectedCases) {
    output.push(await renderCase(name, report));
  }
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
