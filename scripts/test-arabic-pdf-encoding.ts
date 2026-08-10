/**
 * GATE TEST — Arabic PDF encoding before regenerating the full 24-page report.
 * Fail here ⇒ do not treat the full report as ready.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import { getEmbeddedArabicFontCss } from '../lib/projects/engineering-report-engine/renderer/embedded-fonts';
import { formatReportTextHtml } from '../lib/projects/engineering-report-engine/renderer/html-utils';

const outDir = '/tmp/arabic-gate-test';
mkdirSync(outDir, { recursive: true });

const lines = [
  'المشروع',
  'المبنى',
  'المالك',
  'الإشغال',
  'المخارج',
  'مسالك الهروب',
  'الإنذار',
  'الإطفاء',
  'الدفاع المدني',
  'المتطلبات',
  'المراجع',
  'التوصيات',
  'NFPA 10',
  'NFPA 13',
  'NFPA 20',
  'NFPA 72',
  'NFPA 101',
  'SBC 201',
  'SBC 801',
];

const body = lines.map((line) => `<p>${formatReportTextHtml(line)}</p>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>Arabic gate test</title>
<style>
${getEmbeddedArabicFontCss()}
@page {
  size: A4;
  margin: 18mm;
  /* no browser URL — headless uses --no-pdf-header-footer */
}
body {
  font-family: "Noto Naskh Arabic", Tahoma, Arial, sans-serif;
  font-size: 16pt;
  line-height: 1.9;
  direction: rtl;
  font-variant-ligatures: common-ligatures;
  font-feature-settings: "liga" 1, "calt" 1;
}
p { margin: 0 0 8px; }
</style>
</head>
<body>${body}</body>
</html>`;

const htmlPath = join(outDir, 'gate.html');
const pdfPath = join(outDir, 'gate.pdf');
writeFileSync(htmlPath, html, 'utf8');

if (html.includes('dir="ltr"') || html.includes('tawaqqa-salama.github.io')) {
  console.error('GATE FAIL: forbidden tokens in HTML');
  process.exit(2);
}

const chrome = spawnSync(
  'google-chrome',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ],
  { encoding: 'utf8', timeout: 90000 }
);
if (chrome.status !== 0) {
  console.error(chrome.stderr || chrome.stdout);
  process.exit(1);
}

const extracted = spawnSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
const text = extracted.stdout || '';

function fold(s: string): string {
  return s
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\s\u00A0،,:.;]+/g, '')
    .replace(/[يى]/g, 'ي');
}

const compact = fold(text);
const mustArabic = [
  'المشروع',
  'المبنى',
  'المالك',
  'الإشغال',
  'المخارج',
  'مسالكالهروب',
  'الإنذار',
  'الإطفاء',
  'الدفاعالمدني',
  'المتطلبات',
  'المراجع',
  'التوصيات',
];
const mustCodes = ['NFPA10', 'NFPA13', 'NFPA20', 'NFPA72', 'NFPA101', 'SBC201', 'SBC801'];
const corrupt = ['ا5تطلبات', 'ا;راجع', 'اZنذار', 'ا;هروب', 'ا;شروع', 'اٮ', 'الحرٮ', 'اZطفاء'];

const foundAr = mustArabic.filter((w) => compact.includes(fold(w)) || compact.includes(fold(w).replace(/^ال/, '')));
const missingAr = mustArabic.filter((w) => !foundAr.includes(w));
const foundCodes = mustCodes.filter((w) => compact.includes(w));
const missingCodes = mustCodes.filter((w) => !foundCodes.includes(w));
const corruptHits = corrupt.filter((c) => text.includes(c));
const urlHit = /tawaqqa-salama\.github\.io/.test(text) || /tawaqqa-salama\.github\.io/.test(html);

const ok =
  missingAr.length === 0 &&
  missingCodes.length === 0 &&
  corruptHits.length === 0 &&
  !urlHit;

const result = {
  ok,
  foundAr,
  missingAr,
  foundCodes,
  missingCodes,
  corruptHits,
  urlHit,
  sampleExtract: text.slice(0, 800),
  pdfPath,
};
writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(ok ? 0 : 2);
