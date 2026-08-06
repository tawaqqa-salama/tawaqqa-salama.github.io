/**
 * Client/server helper: extract building permit fields from an uploaded file.
 * Order: PDF text → client Tesseract (images/scanned PDFs) → Vision API → filename.
 * Scanned Balady PDFs often have an empty text layer but an embedded JPEG —
 * always run OCR when floors / building area / activity are still missing.
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

/** True when identity fields exist but floors/activity still need OCR. */
export function needsFloorsOrActivityOcr(result: BuildingPermitExtraction): boolean {
  const missingFloors =
    result.floorsCount == null && (!result.floors || result.floors.length === 0);
  const missingArea = !result.buildingAreaM2;
  const missingActivity = !result.activityType;
  return missingFloors || missingArea || missingActivity;
}

function pickStr(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  return left || right || null;
}

/** Merge OCR/vision on top of a partial PDF-text extraction. */
export function mergePermitExtractions(
  base: BuildingPermitExtraction,
  overlay: BuildingPermitExtraction
): BuildingPermitExtraction {
  const floors =
    (overlay.floors && overlay.floors.length > 0 ? overlay.floors : null) ||
    (base.floors && base.floors.length > 0 ? base.floors : null);
  const floorsCount = overlay.floorsCount ?? base.floorsCount;
  const buildingAreaM2 = pickStr(overlay.buildingAreaM2, base.buildingAreaM2);
  const activityType = pickStr(overlay.activityType, base.activityType);
  const usageLabel = pickStr(overlay.usageLabel, base.usageLabel);

  const merged: BuildingPermitExtraction = {
    ...base,
    permitNumber: pickStr(overlay.permitNumber, base.permitNumber),
    permitDateGregorian: pickStr(overlay.permitDateGregorian, base.permitDateGregorian),
    permitDateHijri: pickStr(overlay.permitDateHijri, base.permitDateHijri),
    ownerName: pickStr(overlay.ownerName, base.ownerName),
    district: pickStr(overlay.district, base.district),
    city: pickStr(overlay.city, base.city),
    street: pickStr(overlay.street, base.street),
    plotNumber: pickStr(overlay.plotNumber, base.plotNumber),
    municipality: pickStr(overlay.municipality, base.municipality),
    commercialRegister: pickStr(overlay.commercialRegister, base.commercialRegister),
    phone: pickStr(overlay.phone, base.phone),
    landAreaM2: pickStr(overlay.landAreaM2, base.landAreaM2),
    buildingAreaM2,
    floorsCount,
    usageLabel,
    activityType,
    floors,
    nationalAddress: pickStr(overlay.nationalAddress, base.nationalAddress),
    locationSummary: pickStr(overlay.locationSummary, base.locationSummary),
    rawTextPreview: pickStr(overlay.rawTextPreview, base.rawTextPreview) || undefined,
    source: overlay.source !== 'none' ? overlay.source : base.source,
    confidence:
      overlay.confidence === 'high' || base.confidence === 'high'
        ? 'high'
        : overlay.confidence === 'medium' || base.confidence === 'medium'
          ? 'medium'
          : 'low',
  };
  return merged;
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
  let result = await extractLocally(file);

  // 2) Client OCR for images / scanned PDFs — required for floors & areas on Balady scans
  const shouldOcr =
    canRunClientOcr(file) &&
    (!hasUsefulPermitExtraction(result) ||
      result.source === 'filename' ||
      needsFloorsOrActivityOcr(result));

  if (shouldOcr) {
    try {
      const ocr = await extractBuildingPermitWithTesseract(file, onProgress);
      if (
        hasUsefulPermitExtraction(ocr) ||
        ocr.floorsCount ||
        ocr.buildingAreaM2 ||
        ocr.floors?.length
      ) {
        result = mergePermitExtractions(result, ocr);
      }
    } catch (error) {
      // Surface failure to caller via empty result + progress; do not swallow without signal
      const msg = error instanceof Error ? error.message : 'فشل التعرف على نص الرخصة';
      onProgress?.(`⚠️ ${msg}`);
      if (!hasUsefulPermitExtraction(result)) {
        return {
          ...emptyExtraction('none'),
          rawTextPreview: msg,
        };
      }
    }
  }

  // 3) Optional Vision API when Node API is available (not on static Pages)
  if (needsFloorsOrActivityOcr(result) || !hasUsefulPermitExtraction(result)) {
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
          localText: result.rawTextPreview || '',
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          ok?: boolean;
          result?: BuildingPermitExtraction;
        };
        if (json.ok && json.result) {
          result = mergePermitExtractions(result, json.result);
        }
      }
    } catch {
      // static export / offline — ignore
    }
  }

  return hasUsefulPermitExtraction(result) || result.floorsCount || result.buildingAreaM2
    ? result
    : emptyExtraction(result.source);
}
