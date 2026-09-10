/**
 * Rasterize a single PDF page to PNG using poppler `pdftoppm`.
 * Only the requested page is rendered — never the full document.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PDF_RASTER_DPI } from './limits.js';
import { OcrHttpError } from './types.js';

const execFileAsync = promisify(execFile);

export type PdfRasterDeps = {
  execFileFn?: typeof execFileAsync;
  mkdtempFn?: typeof fs.mkdtemp;
  readFileFn?: typeof fs.readFile;
  rmFn?: typeof fs.rm;
  writeFileFn?: typeof fs.writeFile;
  pdfInfoFn?: (pdfPath: string) => Promise<number>;
};

async function defaultPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [pdfPath], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    const m = /Pages:\s+(\d+)/i.exec(stdout);
    if (!m) throw new Error('pages_missing');
    return Number(m[1]);
  } catch {
    throw new OcrHttpError(400, 'pdf_info_failed');
  }
}

export async function rasterizePdfPageToPng(
  pdfBytes: Buffer,
  pageNumber: number,
  deps: PdfRasterDeps = {}
): Promise<{ pngBytes: Buffer; pageCount: number }> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new OcrHttpError(400, 'invalid_page_number');
  }

  const exec = deps.execFileFn || execFileAsync;
  const mkdtemp = deps.mkdtempFn || fs.mkdtemp;
  const readFile = deps.readFileFn || fs.readFile;
  const rm = deps.rmFn || fs.rm;
  const writeFile = deps.writeFileFn || fs.writeFile;
  const pdfInfo = deps.pdfInfoFn || defaultPdfPageCount;

  const dir = await mkdtemp(join(tmpdir(), 'saudi-ocr-pdf-'));
  const pdfPath = join(dir, 'input.pdf');
  const outPrefix = join(dir, 'page');

  try {
    await writeFile(pdfPath, pdfBytes);
    const pageCount = await pdfInfo(pdfPath);
    if (!Number.isFinite(pageCount) || pageCount < 1) {
      throw new OcrHttpError(400, 'pdf_page_count_invalid');
    }
    if (pageNumber > pageCount) {
      throw new OcrHttpError(400, 'page_number_out_of_range');
    }

    try {
      await exec(
        'pdftoppm',
        [
          '-f',
          String(pageNumber),
          '-l',
          String(pageNumber),
          '-png',
          '-r',
          String(PDF_RASTER_DPI),
          '-singlefile',
          pdfPath,
          outPrefix,
        ],
        { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/ENOENT/i.test(message)) {
        throw new OcrHttpError(500, 'pdftoppm_not_installed');
      }
      throw new OcrHttpError(500, 'pdf_rasterize_failed');
    }

    const pngPath = `${outPrefix}.png`;
    let pngBytes: Buffer;
    try {
      pngBytes = await readFile(pngPath);
    } catch {
      throw new OcrHttpError(500, 'pdf_raster_output_missing');
    }
    if (!pngBytes.byteLength) {
      throw new OcrHttpError(500, 'pdf_raster_output_empty');
    }
    return { pngBytes, pageCount };
  } finally {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}
