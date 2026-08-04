/**
 * Client/server helper: extract building permit fields from an uploaded file.
 * Order: PDF text → client Tesseract (images) → Vision API (when available) → filename.
 * Tesseract path works on static GitHub Pages without API routes.
 */

import {
  emptyExtraction,
  extractTextFromPermitFile,
  hasUsefulPermitExtraction,
  parseBuildingPermitText,
  parsePermitFromFilename,
  type BuildingPermitExtraction,
} from '@/lib/projects/building-permit-ocr';
import {
  canRunClientOcr,
  extractBuildingPermitWithTesseract,
} from '@/lib/projects/building-permit-tesseract';

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function extractLocally(file: File): Promise<BuildingPermitExtraction> {
  const { text, source } = await extractTextFromPermitFile(file);
  const parsed = parseBuildingPermitText(text, source);
  if (hasUsefulPermitExtraction(parsed)) return parsed;
  return parsePermitFromFilename(file.name);
}

export type ExtractPermitOptions = {
  onProgress?: (message: string) => void;
};

export async function extractBuildingPermitFromFile(
  file: File,
  options?: ExtractPermitOptions
): Promise<BuildingPermitExtraction> {
  const onProgress = options?.onProgress;

  // 1) PDF/text layer (fast)
  onProgress?.('جاري قراءة ملف الرخصة...');
  const local = await extractLocally(file);
  if (hasUsefulPermitExtraction(local) && local.source !== 'filename') {
    return local;
  }

  // 2) Client-side OCR for images (works on GitHub Pages)
  if (canRunClientOcr(file)) {
    const ocr = await extractBuildingPermitWithTesseract(file, onProgress);
    if (hasUsefulPermitExtraction(ocr)) return ocr;
  }

  // 3) Optional Vision API when Node API is available (not on static Pages)
  try {
    onProgress?.('جاري محاولة الاستخراج عبر الخادم...');
    const base64 = await fileToBase64(file);
    const res = await fetch('/api/ocr/building-permit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
        localText: local.rawTextPreview || '',
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        ok?: boolean;
        result?: BuildingPermitExtraction;
      };
      if (json.ok && json.result && hasUsefulPermitExtraction(json.result)) {
        return json.result;
      }
      if (json.ok && json.result) return json.result;
    }
  } catch {
    // static export / offline — ignore
  }

  return hasUsefulPermitExtraction(local) ? local : emptyExtraction(local.source);
}
