export type SourceRegion = {
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
};

export type Confidence = number;

export type ExtractedField<T> = {
  value: T | null;
  confidence: Confidence;
  source: SourceRegion | null;
  needs_review: boolean;
};

export type PermitFloor = {
  label: ExtractedField<string>;
  area_m2: ExtractedField<number>;
  activity_type: ExtractedField<string>;
};

export type BuildingPermitOcrFields = {
  permitNumber: ExtractedField<string>;
  permitDateGregorian: ExtractedField<string>;
  permitDateHijri: ExtractedField<string>;
  permitType: ExtractedField<string>;
  ownerName: ExtractedField<string>;
  plotNumber: ExtractedField<string>;
  planNumber: ExtractedField<string>;
  district: ExtractedField<string>;
  city: ExtractedField<string>;
  municipality: ExtractedField<string>;
  street: ExtractedField<string>;
  usageLabel: ExtractedField<string>;
  activityType: ExtractedField<string>;
  landAreaM2: ExtractedField<number>;
  buildingAreaM2: ExtractedField<number>;
  floorsCount: ExtractedField<number>;
  floors: ExtractedField<PermitFloor[]>;
  buildingHeightM: ExtractedField<number>;
  nationalAddress: ExtractedField<string>;
  rawTextPreview: ExtractedField<string>;
};

export type BuildingPermitOcrResponse = {
  ok: true;
  status: 'review_required';
  source: 'server';
  extractor: 'openai-vision';
  fields: BuildingPermitOcrFields;
  document: {
    bucket: string;
    path: string;
    file_name: string | null;
    mime_type: string;
  };
  warnings: string[];
};

export type OcrErrorResponse = {
  ok: false;
  error: string;
  code: string;
};

const LOW_CONFIDENCE_THRESHOLD = 0.75;
const MAX_CONFIDENCE = 1;

export const FIELD_NAMES = [
  'permitNumber',
  'permitDateGregorian',
  'permitDateHijri',
  'permitType',
  'ownerName',
  'plotNumber',
  'planNumber',
  'district',
  'city',
  'municipality',
  'street',
  'usageLabel',
  'activityType',
  'landAreaM2',
  'buildingAreaM2',
  'floorsCount',
  'floors',
  'buildingHeightM',
  'nationalAddress',
  'rawTextPreview',
] as const;

export function emptyField<T>(): ExtractedField<T> {
  return {
    value: null,
    confidence: 0,
    source: null,
    needs_review: true,
  };
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function normalizeSource(value: unknown): SourceRegion | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const source: SourceRegion = {};
  for (const key of ['page', 'x', 'y', 'width', 'height'] as const) {
    const number = finiteNumber(raw[key]);
    if (number == null || number < 0) continue;
    if (key === 'page') source.page = number;
    else if (key === 'x') source.x = number;
    else if (key === 'y') source.y = number;
    else if (key === 'width') source.width = number;
    else source.height = number;
  }
  if (typeof raw.text === 'string' && raw.text.trim()) {
    source.text = raw.text.trim().slice(0, 500);
  }
  return Object.keys(source).length ? source : null;
}

export function normalizeField<T>(raw: unknown, fallback?: T | null): ExtractedField<T> {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let confidence = finiteNumber(input.confidence) ?? 0;
  confidence = Math.max(0, Math.min(MAX_CONFIDENCE, confidence));
  const value = (input.value as T | null | undefined) ?? fallback ?? null;
  const source = normalizeSource(input.source);
  const needsReview = Boolean(input.needs_review) || value == null || confidence < LOW_CONFIDENCE_THRESHOLD;
  return {
    value,
    confidence,
    source,
    needs_review: needsReview,
  };
}

function normalizeTextField(raw: unknown): ExtractedField<string> {
  const field = normalizeField<string>(raw);
  if (typeof field.value !== 'string' || !field.value.trim()) return emptyField<string>();
  return { ...field, value: field.value.trim() };
}

function normalizeNumberField(raw: unknown): ExtractedField<number> {
  const field = normalizeField<number>(raw);
  if (typeof field.value !== 'number' || !Number.isFinite(field.value) || field.value < 0) {
    return emptyField<number>();
  }
  return field;
}

function normalizeFloors(raw: unknown): ExtractedField<PermitFloor[]> {
  const field = normalizeField<unknown[]>(raw);
  if (!Array.isArray(field.value)) return emptyField<PermitFloor[]>();
  const floors: PermitFloor[] = [];
  for (const item of field.value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    floors.push({
      label: normalizeTextField(row.label),
      area_m2: normalizeNumberField(row.area_m2),
      activity_type: normalizeTextField(row.activity_type),
    });
  }
  if (!floors.length) return emptyField<PermitFloor[]>();
  return { ...field, value: floors };
}

export function normalizeOcrFields(raw: unknown): BuildingPermitOcrFields {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    permitNumber: normalizeTextField(input.permitNumber),
    permitDateGregorian: normalizeTextField(input.permitDateGregorian),
    permitDateHijri: normalizeTextField(input.permitDateHijri),
    permitType: normalizeTextField(input.permitType),
    ownerName: normalizeTextField(input.ownerName),
    plotNumber: normalizeTextField(input.plotNumber),
    planNumber: normalizeTextField(input.planNumber),
    district: normalizeTextField(input.district),
    city: normalizeTextField(input.city),
    municipality: normalizeTextField(input.municipality),
    street: normalizeTextField(input.street),
    usageLabel: normalizeTextField(input.usageLabel),
    activityType: normalizeTextField(input.activityType),
    landAreaM2: normalizeNumberField(input.landAreaM2),
    buildingAreaM2: normalizeNumberField(input.buildingAreaM2),
    floorsCount: normalizeNumberField(input.floorsCount),
    floors: normalizeFloors(input.floors),
    buildingHeightM: normalizeNumberField(input.buildingHeightM),
    nationalAddress: normalizeTextField(input.nationalAddress),
    rawTextPreview: normalizeTextField(input.rawTextPreview),
  };
}

function markReview<T>(field: ExtractedField<T>) {
  field.needs_review = true;
}

function isGregorianDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function looksLikePermitNumber(value: string): boolean {
  const normalized = value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/\s+/g, '');
  return /\d{3,}/.test(normalized) && !/^\d{1,2}$/.test(normalized);
}

export function validateOcrFields(fields: BuildingPermitOcrFields): string[] {
  const warnings: string[] = [];
  const numericChecks: Array<[string, ExtractedField<number>]> = [
    ['landAreaM2', fields.landAreaM2],
    ['buildingAreaM2', fields.buildingAreaM2],
    ['buildingHeightM', fields.buildingHeightM],
  ];
  for (const [name, field] of numericChecks) {
    if (field.value != null && (!Number.isFinite(field.value) || field.value <= 0)) {
      markReview(field);
      warnings.push(`${name}: non-positive or invalid value requires review`);
    }
  }
  if (fields.permitNumber.value && !looksLikePermitNumber(fields.permitNumber.value)) {
    markReview(fields.permitNumber);
    warnings.push('permitNumber has an invalid format');
  }
  if (fields.permitDateGregorian.value && !isGregorianDate(fields.permitDateGregorian.value)) {
    markReview(fields.permitDateGregorian);
    warnings.push('permitDateGregorian has an invalid date');
  }
  if (fields.permitDateHijri.value && !/(?:13|14|15)\d{2}/.test(fields.permitDateHijri.value)) {
    markReview(fields.permitDateHijri);
    warnings.push('permitDateHijri has an invalid year format');
  }
  if (fields.landAreaM2.value != null && fields.buildingAreaM2.value != null && fields.buildingAreaM2.value < fields.landAreaM2.value * 0.05) {
    markReview(fields.buildingAreaM2);
    warnings.push('buildingAreaM2 is unusually small compared with landAreaM2');
  }
  if (fields.floorsCount.value != null && (!Number.isInteger(fields.floorsCount.value) || fields.floorsCount.value < 1 || fields.floorsCount.value > 100)) {
    markReview(fields.floorsCount);
    warnings.push('floorsCount is impossible or not an integer');
  }
  if (fields.buildingHeightM.value != null && fields.buildingHeightM.value > 1000) {
    markReview(fields.buildingHeightM);
    warnings.push('buildingHeightM is obviously invalid');
  }
  if (fields.floors.value && fields.floors.value.length > 100) {
    markReview(fields.floors);
    warnings.push('too many floor rows were returned');
  }
  return warnings;
}

export function hasReviewRequired(fields: BuildingPermitOcrFields): boolean {
  return FIELD_NAMES.some((name) => {
    const field = fields[name];
    return field.needs_review;
  });
}

export const EXTRACTION_JSON_SHAPE = {
  permitNumber: 'string|null',
  permitDateGregorian: 'YYYY-MM-DD|null',
  permitDateHijri: 'string|null',
  permitType: 'string|null',
  ownerName: 'string|null',
  plotNumber: 'string|null',
  planNumber: 'string|null',
  district: 'string|null',
  city: 'string|null',
  municipality: 'string|null',
  street: 'string|null',
  usageLabel: 'string|null',
  activityType: 'string|null',
  landAreaM2: 'number|null',
  buildingAreaM2: 'number|null',
  floorsCount: 'number|null',
  floors: '[{label,area_m2,activity_type}]|null',
  buildingHeightM: 'number|null',
  nationalAddress: 'string|null',
  rawTextPreview: 'string|null',
};

export const LOW_CONFIDENCE_REVIEW_THRESHOLD = LOW_CONFIDENCE_THRESHOLD;
