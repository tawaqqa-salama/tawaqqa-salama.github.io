/**
 * System Tesseract OCR (ara+eng). No LLM post-correction.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getOcrTimeoutMs } from './limits.js';
import { OcrHttpError } from './types.js';

const execFileAsync = promisify(execFile);

export type TesseractDeps = {
  execFileFn?: typeof execFileAsync;
  mkdtempFn?: typeof fs.mkdtemp;
  writeFileFn?: typeof fs.writeFile;
  readFileFn?: typeof fs.readFile;
  rmFn?: typeof fs.rm;
  /** Test hook: bypass binary and return text. */
  recognizeFn?: (imagePath: string) => Promise<string>;
};

export async function runTesseractAraEng(
  imageBytes: Buffer,
  extension: string,
  deps: TesseractDeps = {}
): Promise<string> {
  const timeoutMs = getOcrTimeoutMs();
  const mkdtemp = deps.mkdtempFn || fs.mkdtemp;
  const writeFile = deps.writeFileFn || fs.writeFile;
  const readFile = deps.readFileFn || fs.readFile;
  const rm = deps.rmFn || fs.rm;
  const exec = deps.execFileFn || execFileAsync;

  const dir = await mkdtemp(join(tmpdir(), 'saudi-ocr-tess-'));
  const ext = extension.replace(/^\./, '') || 'png';
  const imagePath = join(dir, `page.${ext}`);
  const outBase = join(dir, 'out');

  try {
    await writeFile(imagePath, imageBytes);

    if (deps.recognizeFn) {
      return (await deps.recognizeFn(imagePath)).trim();
    }

    try {
      await exec(
        'tesseract',
        [
          imagePath,
          outBase,
          '-l',
          'ara+eng',
          '--psm',
          '6',
          '-c',
          'preserve_interword_spaces=1',
        ],
        { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const anyErr = err as { killed?: boolean; signal?: string; code?: string };
      if (/ENOENT/i.test(message)) {
        throw new OcrHttpError(500, 'tesseract_not_installed');
      }
      if (
        /ETIMEDOUT|timeout/i.test(message) ||
        anyErr.killed ||
        anyErr.signal === 'SIGTERM' ||
        anyErr.code === 'ETIMEDOUT'
      ) {
        throw new OcrHttpError(504, 'ocr_timeout');
      }
      throw new OcrHttpError(500, 'tesseract_failed');
    }

    let text: string;
    try {
      text = await readFile(`${outBase}.txt`, 'utf8');
    } catch {
      throw new OcrHttpError(500, 'tesseract_output_missing');
    }
    return text.replace(/\r/g, '').trim();
  } finally {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
