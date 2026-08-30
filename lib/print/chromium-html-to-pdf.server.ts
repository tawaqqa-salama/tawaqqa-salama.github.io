import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  NOTO_NASKH_ARABIC_BOLD_BASE64,
  NOTO_NASKH_ARABIC_REGULAR_BASE64,
} from '@/lib/projects/engineering-report-engine/renderer/embedded-font-data';

function resolveChromeBinary(): string {
  if (process.env.CHROME_BIN?.trim()) return process.env.CHROME_BIN.trim();
  if (existsSync('/usr/bin/google-chrome')) return 'google-chrome';
  if (existsSync('/usr/local/bin/google-chrome')) return '/usr/local/bin/google-chrome';
  return 'chromium';
}

/**
 * Chromium print-to-PDF embeds file:// TTF fonts more reliably than long data: URLs,
 * improving Arabic ToUnicode mapping for copy/search without rasterizing text.
 */
function materializeEmbeddedFontsForPrint(html: string, workDir: string): string {
  const regularPath = join(workDir, 'NotoNaskhArabic-Regular.ttf');
  const boldPath = join(workDir, 'NotoNaskhArabic-Bold.ttf');
  writeFileSync(regularPath, Buffer.from(NOTO_NASKH_ARABIC_REGULAR_BASE64, 'base64'));
  writeFileSync(boldPath, Buffer.from(NOTO_NASKH_ARABIC_BOLD_BASE64, 'base64'));
  const regularUrl = pathToFileURL(regularPath).href;
  const boldUrl = pathToFileURL(boldPath).href;
  return html
    .split(`url(data:font/ttf;base64,${NOTO_NASKH_ARABIC_REGULAR_BASE64})`).join(`url("${regularUrl}")`)
    .split(`url(data:font/ttf;base64,${NOTO_NASKH_ARABIC_BOLD_BASE64})`).join(`url("${boldUrl}")`);
}

/**
 * Render trusted RTL report HTML to a vector PDF with embedded Arabic fonts.
 * Uses headless Chromium print-to-PDF (same path validated by arabic gate tests).
 */
export function renderHtmlToPdfBuffer(html: string): Buffer {
  if (!html.trim()) throw new Error('HTML فارغ — لا يمكن إنشاء PDF.');

  const workDir = mkdtempSync(join(tmpdir(), 'existing-report-pdf-'));
  const htmlPath = join(workDir, 'report.html');
  const pdfPath = join(workDir, 'report.pdf');
  const profileDir = join(workDir, 'chrome-profile');
  const printableHtml = materializeEmbeddedFontsForPrint(html, workDir);

  writeFileSync(htmlPath, printableHtml, 'utf8');

  const chrome = resolveChromeBinary();
  const result = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${profileDir}`,
      '--allow-file-access-from-files',
      `--print-to-pdf=${pdfPath}`,
      '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      pathToFileURL(htmlPath).href,
    ],
    { encoding: 'utf8', timeout: 180000 }
  );

  try {
    if (result.status !== 0 || !existsSync(pdfPath)) {
      throw new Error(result.stderr || result.stdout || 'تعذر إنشاء PDF عبر Chromium.');
    }
    return readFileSync(pdfPath);
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Best-effort cleanup — do not fail PDF generation after a successful render.
    }
  }
}
