/**
 * Client-side OCR for building permit images / scanned PDFs.
 * Works on static GitHub Pages without API routes.
 *
 * Balady A4 scans are dense: full-page tesseract.js often misses the header
 * (permit number / owner). We OCR a top identity crop first, then merge with
 * a downscaled full-page pass for floors/areas when needed.
 */

import type { BuildingPermitExtraction } from '@/lib/projects/building-permit-ocr';
import {
  emptyExtraction,
  hasUsefulPermitExtraction,
  parseBuildingPermitText,
} from '@/lib/projects/building-permit-ocr';
import { isPdfPermitFile, pdfFileToOcrImage } from '@/lib/projects/building-permit-pdf-image';

function isImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const mime = file.type || '';
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(name);
}

function isBrowserDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

/** Top band of the permit (header + owner + location row). */
async function cropTopIdentityBand(source: Blob | File): Promise<Blob | File> {
  if (!isBrowserDom() || typeof createImageBitmap === 'undefined') return source;
  try {
    const bitmap = await createImageBitmap(source);
    const bandRatio = 0.5;
    const cropH = Math.max(200, Math.round(bitmap.height * bandRatio));
    const maxW = 1800;
    const scale = Math.min(1, maxW / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(cropH * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return source;
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, bitmap.width, cropH, 0, 0, w, h);
    bitmap.close();
    return (await canvasToJpeg(canvas)) || source;
  } catch {
    return source;
  }
}

/** Crop the Balady contents table where floor names and areas are printed. */
async function cropContentsTable(source: Blob | File): Promise<Blob | File> {
  if (!isBrowserDom() || typeof createImageBitmap === 'undefined') return source;
  try {
    const bitmap = await createImageBitmap(source);
    const topRatio = 0.30;
    const bottomRatio = 0.76;
    const cropY = Math.round(bitmap.height * topRatio);
    const cropH = Math.max(240, Math.round(bitmap.height * (bottomRatio - topRatio)));
    const maxW = 2200;
    const scale = Math.min(1, maxW / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(cropH * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return source;
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, cropY, bitmap.width, cropH, 0, 0, w, h);
    bitmap.close();
    return (await canvasToJpeg(canvas, 0.92)) || source;
  } catch {
    return source;
  }
}

/** Downscaled full page for floors / totals. */
async function downscaleFullPage(source: Blob | File): Promise<Blob | File> {
  if (!isBrowserDom() || typeof createImageBitmap === 'undefined') return source;
  try {
    const bitmap = await createImageBitmap(source);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return source;
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return (await canvasToJpeg(canvas, 0.85)) || source;
  } catch {
    return source;
  }
}

/**
 * Prefer File/Blob in the browser. In Node, pass Buffer —
 * URL.createObjectURL produces blob:nodedata URLs that workers cannot open.
 */
async function blobToOcrInput(source: Blob | File): Promise<Blob | File | Buffer> {
  if (isBrowserDom()) return source;
  return Buffer.from(await source.arrayBuffer());
}

/** Node/CI fallback: ffmpeg crop + system tesseract (much more accurate on Balady scans). */
async function recognizeViaSystemTesseract(source: Blob | File): Promise<string | null> {
  if (isBrowserDom()) return null;
  try {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permit-ocr-'));
    const full = path.join(dir, 'full.jpg');
    const top = path.join(dir, 'top.jpg');
    const outBase = path.join(dir, 'out');
    fs.writeFileSync(full, Buffer.from(await source.arrayBuffer()));
    execFileSync(
      'ffmpeg',
      ['-y', '-i', full, '-vf', 'crop=in_w:in_h*0.5:0:0,scale=1800:-1', top],
      { stdio: 'ignore' }
    );
    // PSM 4 = single column of variable sizes — best for Balady header tables
    execFileSync('tesseract', [top, outBase, '-l', 'ara+eng', '--psm', '4'], {
      stdio: 'ignore',
    });
    const text = fs.readFileSync(`${outBase}.txt`, 'utf8');
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function recognizeWithWorker(
  image: Blob | File,
  psm: number,
  onProgress?: (message: string) => void
): Promise<string> {
  const Tesseract = await import('tesseract.js');
  const input = await blobToOcrInput(image);
  const worker = await Tesseract.createWorker('ara+eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        const pct = Math.round(m.progress * 100);
        onProgress?.(`جاري استخراج بيانات الرخصة تلقائياً... ${pct}%`);
      }
    },
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: psm as never,
      preserve_interword_spaces: '1',
    });
    const result = await worker.recognize(input as Parameters<typeof worker.recognize>[0]);
    return String(result.data?.text || '').trim();
  } finally {
    await worker.terminate();
  }
}

async function recognizeArabicForm(
  image: Blob | File,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('جاري تحميل محرك التعرف على النص...');

  // Node/CI: prefer system tesseract on identity crop (matches production quality better)
  const cli = await recognizeViaSystemTesseract(image);
  if (cli && (cli.match(/\d/g) || []).length >= 8) {
    return cli;
  }

  onProgress?.('جاري استخراج بيانات الرخصة (رأس الصفحة)...');
  const identity = await cropTopIdentityBand(image);
  // PSM 4 works best on Balady header tables; fall back to sparse
  let text = await recognizeWithWorker(identity, 4, onProgress);
  if ((text.match(/\d/g) || []).length < 8) {
    text = await recognizeWithWorker(identity, 11, onProgress);
  }

  // If identity crop missed digits, try downscaled full page
  if ((text.match(/\d/g) || []).length < 8) {
    onProgress?.('جاري استخراج بيانات الرخصة (الصفحة كاملة)...');
    const full = await downscaleFullPage(image);
    const fullText = await recognizeWithWorker(full, 11, onProgress);
    if ((fullText.match(/\d/g) || []).length >= (text.match(/\d/g) || []).length) {
      text = fullText;
    }
  } else {
    // Read the structured contents table before the noisy full-page pass.
    try {
      onProgress?.('جاري قراءة جدول الأدوار والمساحات من الرخصة...');
      const table = await cropContentsTable(image);
      const tableText = await recognizeWithWorker(table, 6, onProgress);
      if (tableText.length > 20) {
        text = `${text}\n\n${tableText}`;
      }
    } catch {
      /* continue with full-page OCR */
    }

    // Merge a light full-page pass for remaining fields.
    try {
      const full = await downscaleFullPage(image);
      const fullText = await recognizeWithWorker(full, 11, onProgress);
      if (fullText.length > 40) {
        text = `${text}\n\n${fullText}`;
      }
    } catch {
      /* identity/table OCR may still be enough */
    }
  }

  return text;
}

export async function extractTextWithTesseract(
  file: File,
  onProgress?: (message: string) => void
): Promise<string> {
  if (isImageFile(file)) {
    return recognizeArabicForm(file, onProgress);
  }
  if (isPdfPermitFile(file)) {
    const image = await pdfFileToOcrImage(file, onProgress);
    if (!image) {
      throw new Error('تعذر استخراج صورة من ملف PDF — جرّب رفع صورة JPG/PNG للرخصة');
    }
    return recognizeArabicForm(image, onProgress);
  }
  return '';
}

export async function extractBuildingPermitWithTesseract(
  file: File,
  onProgress?: (message: string) => void
): Promise<BuildingPermitExtraction> {
  if (!isImageFile(file) && !isPdfPermitFile(file)) {
    return emptyExtraction('none');
  }

  const text = await extractTextWithTesseract(file, onProgress);
  if (!text || text.length < 8) {
    return emptyExtraction('none');
  }
  const parsed = parseBuildingPermitText(text, 'tesseract');
  if (hasUsefulPermitExtraction(parsed)) return parsed;
  return { ...parsed, rawTextPreview: text.slice(0, 1200), source: 'tesseract' };
}

export function canRunClientOcr(file: File): boolean {
  return isImageFile(file) || isPdfPermitFile(file);
}
