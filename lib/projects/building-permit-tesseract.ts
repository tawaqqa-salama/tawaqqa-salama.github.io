/**
 * Client-side OCR for building permit images / scanned PDFs.
 * Works on static GitHub Pages without API routes.
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

/** Downscale large images for faster OCR while keeping text readable */
async function prepareImageForOcr(source: Blob | File): Promise<Blob | File> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    return source;
  }
  try {
    const bitmap = await createImageBitmap(source);
    const maxSide = 2000;
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
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    );
    return blob || source;
  } catch {
    return source;
  }
}

async function blobToOcrInput(source: Blob | File): Promise<Blob | File | string> {
  // Browser: object URL is the most reliable input for tesseract.js workers
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(source);
  }
  // Node / workers: pass raw bytes
  const buf = new Uint8Array(await source.arrayBuffer());
  return new Blob([buf], { type: source.type || 'image/jpeg' });
}

async function recognizeArabicForm(
  image: Blob | File,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('جاري تحميل محرك التعرف على النص...');
  const Tesseract = await import('tesseract.js');
  const prepared = await prepareImageForOcr(image);
  const input = await blobToOcrInput(prepared);
  const revoke =
    typeof input === 'string' && typeof URL !== 'undefined' && URL.revokeObjectURL
      ? () => URL.revokeObjectURL(input)
      : () => undefined;

  onProgress?.('جاري استخراج بيانات الرخصة تلقائياً...');
  // SPARSE_TEXT is best for Balady table forms (رقم الرخصة / التاريخ in cells)
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
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    });
    const sparse = await worker.recognize(input);
    const sparseText = String(sparse.data?.text || '').trim();
    if ((sparseText.match(/\d/g) || []).length >= 8) {
      return sparseText;
    }
    // Fallback AUTO if sparse missed digits
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    });
    const auto = await worker.recognize(input);
    return String(auto.data?.text || sparseText).trim();
  } finally {
    revoke();
    await worker.terminate();
  }
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
    if (!image) return '';
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

  try {
    const text = await extractTextWithTesseract(file, onProgress);
    if (!text || text.length < 8) {
      return emptyExtraction('none');
    }
    const parsed = parseBuildingPermitText(text, 'tesseract');
    if (hasUsefulPermitExtraction(parsed)) return parsed;
    return { ...parsed, rawTextPreview: text.slice(0, 1200), source: 'tesseract' };
  } catch {
    return emptyExtraction('none');
  }
}

export function canRunClientOcr(file: File): boolean {
  return isImageFile(file) || isPdfPermitFile(file);
}
