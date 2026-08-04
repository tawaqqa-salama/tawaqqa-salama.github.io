/**
 * Client-side OCR for building permit images (PNG/JPG).
 * Works on static GitHub Pages without API routes.
 */

import type { BuildingPermitExtraction } from '@/lib/projects/building-permit-ocr';
import {
  emptyExtraction,
  hasUsefulPermitExtraction,
  parseBuildingPermitText,
} from '@/lib/projects/building-permit-ocr';

function isImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const mime = file.type || '';
  return (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|webp|bmp|gif)$/i.test(name)
  );
}

/** Downscale large images for faster OCR while keeping text readable */
async function prepareImageForOcr(file: File): Promise<Blob | File> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 0.95) {
      bitmap.close();
      return file;
    }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    );
    return blob || file;
  } catch {
    return file;
  }
}

export async function extractTextWithTesseract(
  file: File,
  onProgress?: (message: string) => void
): Promise<string> {
  if (!isImageFile(file)) return '';

  onProgress?.('جاري تحميل محرك التعرف على النص...');
  const Tesseract = await import('tesseract.js');
  const image = await prepareImageForOcr(file);

  onProgress?.('جاري استخراج بيانات الرخصة تلقائياً...');
  const result = await Tesseract.recognize(image, 'ara+eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        const pct = Math.round(m.progress * 100);
        onProgress?.(`جاري استخراج بيانات الرخصة تلقائياً... ${pct}%`);
      }
    },
  });

  return String(result.data?.text || '').trim();
}

export async function extractBuildingPermitWithTesseract(
  file: File,
  onProgress?: (message: string) => void
): Promise<BuildingPermitExtraction> {
  if (!isImageFile(file)) {
    return emptyExtraction('none');
  }

  try {
    const text = await extractTextWithTesseract(file, onProgress);
    if (!text || text.length < 8) {
      return emptyExtraction('none');
    }
    const parsed = parseBuildingPermitText(text, 'tesseract');
    if (hasUsefulPermitExtraction(parsed)) return parsed;
    // Still return partial text for debugging / manual cues
    return { ...parsed, rawTextPreview: text.slice(0, 1200), source: 'tesseract' };
  } catch {
    return emptyExtraction('none');
  }
}

export function canRunClientOcr(file: File): boolean {
  return isImageFile(file);
}
