/**
 * Headless PDF smoke test for the Nasaim engineering report pipeline.
 * Verifies Arabic text extraction, no generic bridge, no system jargon, no project URL.
 */
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import { generateEngineeringStudy } from '../lib/projects/engineering-report-engine/generate';
import { buildNasaimReportHtml } from '../lib/projects/engineering-report-engine/renderer/nasaim-template';
import { documentToFlowBlocks } from '../lib/projects/engineering-report-engine/renderer/flow-document';
import { EMPTY_TECHNICAL_REPORT } from '../lib/types/project-reports';
import type { ClientRecord } from '../lib/types/client';
import type { CompanyProfile } from '../lib/company-profile';

const outDir = '/tmp/report-pdf-test';
mkdirSync(outDir, { recursive: true });

const PIXEL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';
const pixel = (n: number) => PIXEL.replace('/9k=', `/9k=${n}`);

const client = {
  id: 'c-pdf',
  client_code: 'PDF-01',
  name: 'قاعة نسائم الاختبار',
  business_name: 'قاعة نسائم الشرق',
  owner_name: 'مالك الاختبار',
  city: 'جدة',
  district: 'الشاطئ',
  region: 'مكة',
  activity_type: 'assembly',
  building_area: 3200,
} as unknown as ClientRecord;

const company = {
  name: 'توقع سلامة',
  legal_name: 'منصة توقع سلامة للاستشارات الهندسية والسلامة',
  logo_url: '',
  tagline: 'للاستشارات الهندسية والسلامة',
  address: 'جدة',
  city: 'جدة',
  phone: '920000000',
  stamp_text: 'توقع سلامة',
} as CompanyProfile;

const report = {
  ...EMPTY_TECHNICAL_REPORT,
  outgoing_number: 'TR-2026-PDF',
  report_date: '2026-08-10',
  location_description: 'جدة — الشاطئ',
  gps_lat: '21.5',
  gps_lng: '39.1',
  facade_photo: { id: 'f1', caption: 'واجهة', dataUrl: pixel(1) },
  earth_photo: { id: 'e1', caption: 'موقع المشروع', dataUrl: pixel(2) },
  overview_text: 'دراسة هندسية لاختبار تدفق التقرير والصور والترميز العربي.',
  firefighting_items: [
    {
      id: 'ff_pumps',
      enabled: true,
      notes: 'غرفة مضخات قائمة',
      selectedOptions: ['مضخة رئيسية: قدرة وضغط وفق الحساب الهيدروليكي', 'غرفة مضخات محمية ومعتمدة'],
      photos: [
        { id: 'p1', caption: 'غرفة المضخات', dataUrl: pixel(3) },
        { id: 'p2', caption: 'لوحة المضخات', dataUrl: pixel(4) },
      ],
    },
    {
      id: 'ff_water',
      enabled: true,
      notes: '',
      selectedOptions: ['خزان إطفاء بسعة تغطي مدة التشغيل المطلوبة'],
      photos: [{ id: 'w1', caption: 'الخزان', dataUrl: pixel(5) }],
    },
    {
      id: 'ff_extinguishers',
      enabled: true,
      notes: '',
      selectedOptions: ['توزيع طفايات يدوية مناسبة لنوع المخاطر'],
      photos: [{ id: 'e1x', caption: 'طفايات', dataUrl: pixel(6) }],
    },
    {
      id: 'ff_cd_connections',
      enabled: true,
      notes: '',
      selectedOptions: ['توفير وصلات دفاع مدني في موقع يسهل الوصول إليه'],
      photos: [{ id: 'cd1', caption: 'وصلة', dataUrl: pixel(7) }],
    },
    {
      id: 'ff_cd_parking',
      enabled: true,
      notes: '',
      selectedOptions: [],
      photos: [{ id: 'cd2', caption: 'موقف', dataUrl: pixel(8) }],
    },
    {
      id: 'ff_special',
      enabled: true,
      notes: '',
      selectedOptions: [],
      photos: [{ id: 'sp1', caption: 'خاص', dataUrl: pixel(9) }],
    },
  ],
  ventilation_items: [
    {
      id: 'vent_main',
      enabled: true,
      notes: '',
      selectedOptions: [],
      photos: [{ id: 'v1', caption: 'تهوية', dataUrl: pixel(10) }],
    },
  ],
  alarm_items: [
    {
      id: 'al_panel',
      enabled: true,
      notes: '',
      selectedOptions: ['تركيب لوحة إنذار رئيسية في مكان مأهول (الاستقبال/الحراسة)'],
      photos: [{ id: 'a1', caption: 'لوحة', dataUrl: pixel(11) }],
    },
    {
      id: 'al_detectors',
      enabled: true,
      notes: '',
      selectedOptions: ['توزيع كواشف الدخان وفق المخططات'],
      photos: [{ id: 'a2', caption: 'كواشف', dataUrl: pixel(12) }],
    },
    {
      id: 'al_breakglass',
      enabled: true,
      notes: '',
      selectedOptions: [],
      photos: [{ id: 'a3', caption: 'كواسر', dataUrl: pixel(13) }],
    },
    {
      id: 'al_bells',
      enabled: true,
      notes: '',
      selectedOptions: ['ضمان سماع الإنذار في جميع الفراغات'],
      photos: [{ id: 'a4', caption: 'أجراس', dataUrl: pixel(14) }],
    },
    {
      id: 'al_emergency_lights',
      enabled: true,
      notes: '',
      selectedOptions: [],
      photos: [{ id: 'a5', caption: 'كشافات', dataUrl: pixel(15) }],
    },
    {
      id: 'al_signs',
      enabled: true,
      notes: '',
      selectedOptions: [],
      photos: [{ id: 'a6', caption: 'لوحات', dataUrl: pixel(16) }],
    },
  ],
  general_recommendations: [
    { id: 'rec_maintenance_plan', checked: true },
    { id: 'rec_training', checked: true },
    { id: 'rec_sbc_compliance', checked: true },
  ],
};

async function main() {
const doc = generateEngineeringStudy({ client, report: report as never, locale: 'ar' });
const { blocks, chapters } = documentToFlowBlocks(doc);
const html = buildNasaimReportHtml({ document: doc, company });

const htmlPath = join(outDir, 'report.html');
const pdfPath = join(outDir, 'report.pdf');
writeFileSync(htmlPath, html, 'utf8');

const flatFigs = (() => {
  const out: { kind: string; figureNo?: number }[] = [];
  const walk = (list: typeof blocks) => {
    for (const b of list) {
      if (b.kind === 'figure') out.push(b);
      if (b.kind === 'unit') walk(b.blocks);
    }
  };
  walk(blocks);
  return out;
})();

const chrome = spawnSync(
  'google-chrome',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--allow-file-access-from-files',
    `--print-to-pdf=${pdfPath}`,
    '--no-pdf-header-footer',
    '--print-to-pdf-no-header',
    pathToFileURL(htmlPath).href,
  ],
  { encoding: 'utf8', timeout: 120000 }
);

if (chrome.status !== 0) {
  console.error(chrome.stderr || chrome.stdout);
  process.exit(1);
}

// Extract text with pdfjs
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(readFileSync(pdfPath));
const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
const pages: string[] = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
  pages.push(text);
}
const all = pages.join('\n');

const mustWords = [
  'المشروع',
  'المبنى',
  'المالك',
  'الإشغال',
  'الإنذار',
  'الإطفاء',
  'الدفاع المدني',
  'التهوية',
  'المضخات',
  'الطفايات',
];
const codeWords = ['NFPA 13', 'NFPA 20', 'NFPA 72', 'NFPA 101', 'SBC 801'];
const corruptRe = /ا[5Z;m]|ا5تطلبات|اZنذار|ا;راجع|اmنذار|اZطفاء/;
const forbidden = [
  'محرك القواعد',
  'محرك القرار',
  'Decision Engine',
  'Knowledge Base',
  'تُراجع المتطلبات الهندسية ذات الصلة',
  'projects/file/?id=',
  'IMG_999',
  '\u2066',
];

const foundWords = mustWords.filter((w) => all.includes(w) || html.includes(w));
const foundCodes = codeWords.filter((w) => all.includes(w) || html.includes(w));
const corruptHits = all.match(corruptRe) || [];
const forbiddenHits = forbidden.filter((f) => all.includes(f) || html.includes(f));
const bridgeInHtml = html.includes('تُراجع المتطلبات الهندسية ذات الصلة');
const detectorScope = html.includes('يتم توزيع كواشف الحريق');
const hasUnit = html.includes('class="unit keep"');
const hasFooterUrl = /tawaqqa-salama\.github\.io\/projects\/file/.test(html);

const result = {
  pages: pdf.numPages,
  chapters: chapters.length,
  figures: flatFigs.length,
  figureNos: flatFigs.map((f) => f.figureNo),
  arabicWordsFoundInPdfOrHtml: foundWords,
  arabicWordsMissing: mustWords.filter((w) => !foundWords.includes(w)),
  codesFound: foundCodes,
  corruptHits: [...new Set(corruptHits)].slice(0, 20),
  forbiddenHits,
  bridgeInHtml,
  detectorScope,
  hasUnit,
  hasFooterUrl,
  pdfPath,
  htmlPath,
  samplePdfText: all.slice(0, 1200),
};

writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
