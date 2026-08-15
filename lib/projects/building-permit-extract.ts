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
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  classifyFloorName,
  mapPermitUsageToActivityType,
  type PermitFloorRow,
} from '@/lib/projects/permit-floors-activity';

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
    planNumber: pickStr(overlay.planNumber, base.planNumber),
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
    fieldEvidence: overlay.fieldEvidence || base.fieldEvidence,
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
  storageBucket?: string | null;
  storagePath?: string | null;
  clientId?: string | null;
};

type ServerField<T> = {
  value: T | null;
  confidence: number;
  needs_review: boolean;
  source?: { page?: number; text?: string; x?: number; y?: number; width?: number; height?: number; row_text?: string; column_text?: string } | null;
};

type ServerOcrResponse = {
  ok?: boolean;
  status?: 'review_required';
  source?: 'server';
  fields?: Record<string, ServerField<unknown>>;
};

function serverValue<T>(fields: Record<string, ServerField<unknown>>, key: string): T | null {
  const field = fields[key];
  return field && field.value != null ? field.value as T : null;
}

function serverExtractionToLocal(response: ServerOcrResponse): BuildingPermitExtraction | null {
  if (!response.ok || response.source !== 'server' || !response.fields) return null;
  const fields = response.fields;
  const rawFloors = serverValue<Array<Record<string, unknown>>>(fields, 'floorLevels') || serverValue<Array<Record<string, unknown>>>(fields, 'floors');
  const floors: PermitFloorRow[] = [];
  for (const raw of rawFloors || []) {
    const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
    const area = typeof raw?.area_m2 === 'number' ? raw.area_m2 : Number(raw?.area_m2);
    if (!label || !Number.isFinite(area) || area <= 0) continue;
    const classified = classifyFloorName(label) || { kind: 'custom' as const, label };
    const activity = typeof raw?.activity_type === 'string' ? raw.activity_type.trim() : '';
    floors.push({
      // Preserve the server's source label; classification only supplies kind.
      label,
      kind: classified.kind,
      area_m2: area,
      repeat_count: 1,
      activity_type: activity ? mapPermitUsageToActivityType(activity, activity) || activity : null,
    });
  }
  const permitNumber = serverValue<string>(fields, 'permitNumber');
  const permitDateGregorian = serverValue<string>(fields, 'permitDateGregorian');
  const permitDateHijri = serverValue<string>(fields, 'permitDateHijri');
  const ownerName = serverValue<string>(fields, 'ownerName');
  const district = serverValue<string>(fields, 'district');
  const city = serverValue<string>(fields, 'city');
  const street = serverValue<string>(fields, 'street');
  const plotNumber = serverValue<string>(fields, 'plotNumber');
  const planNumber = serverValue<string>(fields, 'planNumber');
  const municipality = serverValue<string>(fields, 'municipality');
  const landAreaM2 = serverValue<number>(fields, 'landAreaM2');
  const buildingAreaM2 = serverValue<number>(fields, 'buildingAreaM2');
  const floorsCount = serverValue<number>(fields, 'licensedFloorCount') ?? serverValue<number>(fields, 'floorsCount');
  const usageLabel = serverValue<string>(fields, 'usageLabel');
  const activityType = serverValue<string>(fields, 'activityType');
  const nationalAddress = serverValue<string>(fields, 'nationalAddress');
  const rawTextPreview = serverValue<string>(fields, 'rawTextPreview');
  const hits = [permitNumber, permitDateGregorian || permitDateHijri, ownerName, district || city, landAreaM2, buildingAreaM2, floorsCount, usageLabel || activityType].filter((value) => value != null).length;
  return {
    permitNumber,
    permitDateGregorian,
    permitDateHijri,
    ownerName,
    district,
    city,
    street,
    plotNumber,
    planNumber,
    municipality,
    commercialRegister: serverValue<string>(fields, 'commercialRegister'),
    phone: serverValue<string>(fields, 'phone'),
    landAreaM2: landAreaM2 == null ? null : String(landAreaM2),
    buildingAreaM2: buildingAreaM2 == null ? null : String(buildingAreaM2),
    floorsCount,
    licensedFloorCount: floorsCount,
    usageLabel,
    activityType: activityType || (usageLabel ? mapPermitUsageToActivityType(usageLabel, usageLabel) : null),
    floors: floors.length ? floors : null,
    floorLevels: floors.length ? floors : null,
    nationalAddress,
    locationSummary: rawTextPreview,
    rawTextPreview: rawTextPreview || undefined,
    fieldEvidence: Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, {
      value: field.value,
      confidence: field.confidence,
      needs_review: field.needs_review,
      source: field.source || null,
    }])),
    source: 'vision',
    confidence: hits >= 5 ? 'high' : hits >= 3 ? 'medium' : 'low',
  };
}

async function extractWithSupabaseServer(file: File, options: ExtractPermitOptions): Promise<BuildingPermitExtraction | null> {
  if (!isSupabaseConfigured || !options.storagePath) return null;
  options.onProgress?.('جاري معالجة الرخصة عبر SERVER OCR...');
  const { data, error } = await supabase.functions.invoke('building-permit-ocr', {
    body: {
      bucket: options.storageBucket || 'project-files',
      path: options.storagePath,
      clientId: options.clientId || null,
      fileName: file.name,
      mimeType: file.type || null,
    },
  });
  if (error || !data) return null;
  return serverExtractionToLocal(data as ServerOcrResponse);
}

export async function extractBuildingPermitFromFile(
  file: File,
  options: ExtractPermitOptions = {}
): Promise<BuildingPermitExtraction> {
  // Production order: Storage upload → Supabase Edge Function → structured validation → Review.
  // The browser never sends the document to OpenAI and never runs Tesseract first.
  if (isSupabaseConfigured && options.storagePath) {
    try {
      const server = await extractWithSupabaseServer(file, options);
      if (server) return server;
      options.onProgress?.('SERVER OCR تعذر — LOCAL OCR / REQUIRES REVIEW');
    } catch {
      options.onProgress?.('SERVER OCR تعذر — LOCAL OCR / REQUIRES REVIEW');
    }
  }

  // Local extraction is fallback only and must remain explicitly unverified.
  options.onProgress?.('LOCAL OCR / REQUIRES REVIEW');
  let result = await extractLocally(file);
  const shouldOcr = canRunClientOcr(file) && (!hasUsefulPermitExtraction(result) || result.source === 'filename' || needsFloorsOrActivityOcr(result));
  if (shouldOcr) {
    try {
      const ocr = await extractBuildingPermitWithTesseract(file, options.onProgress);
      if (hasUsefulPermitExtraction(ocr) || ocr.floorsCount || ocr.buildingAreaM2 || ocr.floors?.length) result = mergePermitExtractions(result, ocr);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل التعرف على نص الرخصة';
      options.onProgress?.(`LOCAL OCR / REQUIRES REVIEW: ${msg}`);
    }
  }

  return hasUsefulPermitExtraction(result) || result.floorsCount || result.buildingAreaM2
    ? result
    : emptyExtraction(result.source);
}
