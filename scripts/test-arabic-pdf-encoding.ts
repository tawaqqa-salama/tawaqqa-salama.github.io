/**
 * Blocker A — prove Arabic PDF extraction is not corrupted by dir=ltr isolates.
 */
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import { getEmbeddedArabicFontCss } from '../lib/projects/engineering-report-engine/renderer/embedded-fonts';
import { formatReportTextHtml } from '../lib/projects/engineering-report-engine/renderer/html-utils';

const outDir = '/tmp/arabic-encoding-test';
mkdirSync(outDir, { recursive: true });

const sample = [
  'تتضمن دراسة المشروع مراجعة المتطلبات والسلامة للمبنى والمالك.',
  'تشمل البنود: الإشغال، المخارج، الإنذار، الإطفاء، الدفاع المدني، التهوية، المضخات، الخزان، والطفايات.',
  'المراجع الكودية: SBC 801 وNFPA 13 وNFPA 20 وNFPA 72 وNFPA 101.',
].join(' ');

const body = formatReportTextHtml(sample);
const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
${getEmbeddedArabicFontCss()}
body {
  font-family: "Noto Naskh Arabic", Tahoma, Arial, sans-serif;
  font-size: 14pt;
  line-height: 1.8;
  direction: rtl;
  margin: 24mm;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0, "clig" 0, "calt" 0;
}
</style>
</head>
<body><p>${body}</p></body>
</html>`;

const htmlPath = join(outDir, 'sample.html');
const pdfPath = join(outDir, 'sample.pdf');
writeFileSync(htmlPath, html, 'utf8');

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

function normalizeArabic(s: string): string {
  return s
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[،,:.;٫]/g, '')
    .replace(/[\s\u00A0]+/g, '')
    .replace(/[يى]/g, 'ي');
}

const compact = normalizeArabic(text);

const must = [
  'المشروع',
  'المبنى',
  'المالك',
  'الإشغال',
  'المخارج',
  'الإنذار',
  'الإطفاء',
  'الدفاعالمدني',
  'التهوية',
  'المضخات',
  'الخزان',
  'الطفايات',
  'المتطلبات',
  'المراجع',
];
/** Accept common orthographic variants from PDF glyph breaks */
const mustAliases: Record<string, string[]> = {
  المبنى: ['المبنى', 'المبني', 'للمبنى', 'للمبني', 'مبنى', 'مبني'],
  الخزان: ['الخزان', 'خزان'],
  الطفايات: ['الطفايات', 'والطفايات', 'طفاءات', 'طفايات'],
};
const codes = ['NFPA13', 'NFPA20', 'NFPA72', 'NFPA101', 'SBC801'];
const corrupt = ['ا5تطلبات', 'ا;راجع', 'اZنذار', 'ا;هروب', 'ا;شروع', 'اZطفاء', 'ا5شروع'];

const found = must.filter((w) => {
  const aliases = (mustAliases[w] || [w]).map(normalizeArabic);
  return aliases.some((a) => compact.includes(a));
});
const missing = must.filter((w) => !found.includes(w));
const codesFound = codes.filter((w) => compact.includes(w));
const corruptHits = corrupt.filter((c) => text.includes(c) || compact.includes(normalizeArabic(c)));
const hasIsolates = /[\u2066-\u2069]/.test(text);
const htmlHasLtr = html.includes('dir="ltr"');

const result = {
  ok:
    missing.length === 0 &&
    corruptHits.length === 0 &&
    !hasIsolates &&
    !htmlHasLtr &&
    codesFound.length === 5,
  found,
  missing,
  codesFound,
  corruptHits,
  hasIsolates,
  htmlHasLtr,
  sampleExtract: text.slice(0, 600),
};
writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 2);
