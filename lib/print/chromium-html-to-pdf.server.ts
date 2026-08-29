import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function resolveChromeBinary(): string {
  if (process.env.CHROME_BIN?.trim()) return process.env.CHROME_BIN.trim();
  if (existsSync('/usr/bin/google-chrome')) return 'google-chrome';
  if (existsSync('/usr/local/bin/google-chrome')) return '/usr/local/bin/google-chrome';
  return 'chromium';
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

  writeFileSync(htmlPath, html, 'utf8');

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
    rmSync(workDir, { recursive: true, force: true });
  }
}
