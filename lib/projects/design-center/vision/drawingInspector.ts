/**
 * Drawing Exploration & Metadata Inspection Engine
 * Read-only: extracts structural metadata from CAD vision / title-block text
 * without modifying any drawing geometry or raster pixels.
 */

import { detectScaleFromText } from '@/lib/projects/design-center/vision/drawingSanitizer';
import { classifyLabelText } from '@/lib/projects/design-center/vision/zoneAnalyzer';
import type {
  CADAnalysisResult,
  DetectedZone,
  ScaleCalibration,
  TitleBlockMetadata,
  ZoneClassification,
} from '@/lib/projects/design-center/vision/types';

/** Drawing discipline categories (inspection-only taxonomy) */
export type DrawingTypeId =
  | 'architectural'
  | 'fire_alarm'
  | 'fire_fighting'
  | 'mechanical_hvac'
  | 'combined_site'
  | 'unknown';

export type DrawingFloorKind =
  | 'basement'
  | 'ground'
  | 'mezzanine'
  | 'typical'
  | 'roof'
  | 'other';

export type DetectedFloorLevel = {
  kind: DrawingFloorKind;
  label_ar: string;
  label_en: string;
  /** Mentions / repeat hint when text says "typical × N" */
  count_hint: number;
  area_m2: number | null;
  source: 'title_block' | 'sheet_index' | 'zone_label' | 'inferred';
};

export type BuildingMetricsInspection = {
  total_area_m2: number | null;
  floors_count: number | null;
  floors: DetectedFloorLevel[];
  floor_area_breakdown: Array<{
    label_ar: string;
    label_en: string;
    area_m2: number | null;
  }>;
  scale: {
    ratio_text: string | null;
    scale_denominator: number | null;
    source: ScaleCalibration['source'] | 'unknown';
  };
  occupancy: string | null;
  notes_ar: string[];
  notes_en: string[];
};

export type ZoneDetailInspection = {
  zone_id: string;
  label: string | null;
  label_ar: string | null;
  label_en: string | null;
  use: ZoneClassification | 'unknown';
  area_m2: number | null;
  confidence: number;
  needs_engineer_label: boolean;
};

export type DrawingTypeInspection = {
  type: DrawingTypeId;
  label_ar: string;
  label_en: string;
  confidence: number;
  signals: string[];
};

export type DrawingInspectionReport = {
  inspected_at: string;
  /** Inspection never mutates the drawing */
  mode: 'inspection_only';
  drawing_type: DrawingTypeInspection;
  building: BuildingMetricsInspection;
  zones: ZoneDetailInspection[];
  source: {
    file_name: string | null;
    sheet_number: string | null;
    drawing_title: string | null;
    has_scale: boolean;
    zones_count: number;
  };
};

const DRAWING_TYPE_LABELS: Record<
  DrawingTypeId,
  { label_ar: string; label_en: string }
> = {
  architectural: { label_ar: 'معماري', label_en: 'Architectural' },
  fire_alarm: { label_ar: 'إنذار حريق', label_en: 'Fire Alarm System' },
  fire_fighting: {
    label_ar: 'إطفاء حريق',
    label_en: 'Fire Fighting / Sprinkler',
  },
  mechanical_hvac: {
    label_ar: 'ميكانيك / تكييف',
    label_en: 'Mechanical / HVAC',
  },
  combined_site: {
    label_ar: 'مخطط عام',
    label_en: 'Combined / Overall Site Plan',
  },
  unknown: { label_ar: 'غير محدد', label_en: 'Unknown / Needs review' },
};

type TypeRule = {
  type: DrawingTypeId;
  weight: number;
  re: RegExp;
  signal: string;
};

const DRAWING_TYPE_RULES: TypeRule[] = [
  {
    type: 'fire_alarm',
    weight: 4,
    re: /fire\s*alarm|إنذار\s*الحريق|إنذار\s*حريق|smoke\s*detect|FAS\b|FACP|manual\s*call|كشف\s*دخان/i,
    signal: 'fire_alarm_keywords',
  },
  {
    type: 'fire_fighting',
    weight: 4,
    re: /sprinkler|fire\s*fight|إطفاء|رش\s*آلي|رشاش|hose\s*reel|خرطوم|hydrant|صنبور\s*حريق|FF\b|FAS\s*\/\s*FF/i,
    signal: 'fire_fighting_keywords',
  },
  {
    type: 'mechanical_hvac',
    weight: 3.5,
    re: /hvac|mechanical|ميكانيك|تكييف|duct|مجرى\s*هواء|AHU|chiller|ventilation|تهوية/i,
    signal: 'mechanical_hvac_keywords',
  },
  {
    type: 'combined_site',
    weight: 3,
    re: /site\s*plan|master\s*plan|overall|مخطط\s*عام|مخطط\s*الموقع|key\s*plan|موقع\s*عام/i,
    signal: 'site_plan_keywords',
  },
  {
    type: 'architectural',
    weight: 2.5,
    re: /architect|معماري|floor\s*plan|مخطط\s*دور|furniture|تشطيب|partition|تقسيمات|A[-_]?\d{2,}/i,
    signal: 'architectural_keywords',
  },
];

const FLOOR_PATTERNS: Array<{
  kind: DrawingFloorKind;
  re: RegExp;
  label_ar: string;
  label_en: string;
  count_from_match?: (m: RegExpMatchArray) => number;
}> = [
  {
    kind: 'basement',
    re: /basement|بدروم|قبو|سرداب|B\s*[-.]?\s*(\d+)/i,
    label_ar: 'بدروم',
    label_en: 'Basement',
    count_from_match: (m) => (m[1] ? Math.max(1, Number(m[1]) || 1) : 1),
  },
  {
    kind: 'ground',
    re: /ground\s*floor|G\.?\s*F\.?|الدور\s*الأرضي|أرضي|ارضي/i,
    label_ar: 'أرضي',
    label_en: 'Ground Floor',
  },
  {
    kind: 'mezzanine',
    re: /mezzanine|ميزانين|ميزاني[نه]/i,
    label_ar: 'ميزانين',
    label_en: 'Mezzanine',
  },
  {
    kind: 'typical',
    re: /typical\s+floors?\s*[x×*]\s*(\d+)|متكرر\s*[x×*]\s*(\d+)|typical\s+floors?|متكرر|أدوار\s*متكررة/i,
    label_ar: 'متكرر',
    label_en: 'Typical Floors',
    count_from_match: (m) => {
      const n = Number(m[1] || m[2] || 0);
      return Number.isFinite(n) && n > 0 ? n : 1;
    },
  },
  {
    kind: 'roof',
    re: /roof\s*floor|دور\s*الروف|روف|سطح|ملحق\s*سطح/i,
    label_ar: 'دور الروف',
    label_en: 'Roof Floor',
  },
  {
    kind: 'other',
    re: /(?:first|1st|الأول|اول)\s*floor|الدور\s*الأول/i,
    label_ar: 'أول',
    label_en: 'First Floor',
  },
  {
    kind: 'other',
    re: /(?:second|2nd|الثاني)\s*floor|الدور\s*الثاني/i,
    label_ar: 'ثاني',
    label_en: 'Second Floor',
  },
  {
    kind: 'other',
    re: /(?:third|3rd|الثالث)\s*floor|الدور\s*الثالث/i,
    label_ar: 'ثالث',
    label_en: 'Third Floor',
  },
];

function corpusFrom(
  text: string,
  title?: TitleBlockMetadata | null,
  anchors?: Array<{ text: string }>
): string {
  const parts = [
    text,
    title?.raw_text || '',
    title?.drawing_title || '',
    title?.project_name || '',
    title?.occupancy || '',
    title?.sheet_number || '',
    ...(anchors || []).map((a) => a.text),
  ];
  return parts.filter(Boolean).join('\n');
}

/**
 * Scan title blocks, text layers, and symbol/keyword signatures
 * to categorize drawing discipline. Inspection-only — no mutations.
 */
export function detectDrawingType(
  text: string,
  titleBlock?: TitleBlockMetadata | null,
  textAnchors?: Array<{ text: string }>
): DrawingTypeInspection {
  const corpus = corpusFrom(text, titleBlock, textAnchors);
  if (!corpus.trim()) {
    const labels = DRAWING_TYPE_LABELS.unknown;
    return {
      type: 'unknown',
      label_ar: labels.label_ar,
      label_en: labels.label_en,
      confidence: 0,
      signals: ['empty_corpus'],
    };
  }

  const scores = new Map<DrawingTypeId, number>();
  const signals: string[] = [];
  for (const rule of DRAWING_TYPE_RULES) {
    if (rule.re.test(corpus)) {
      scores.set(rule.type, (scores.get(rule.type) || 0) + rule.weight);
      signals.push(rule.signal);
    }
  }

  // Sheet number heuristics (A- = arch, FA-/FA = alarm, FF-/SP = fire fighting, M- = mech)
  const sheet = String(titleBlock?.sheet_number || '');
  if (/^A[-_]?\d/i.test(sheet) || /\bA[-_]\d{2,}/i.test(corpus)) {
    scores.set('architectural', (scores.get('architectural') || 0) + 1.5);
    signals.push('sheet_prefix_A');
  }
  if (/^(FA|FAS|AL)[-_]?\d/i.test(sheet)) {
    scores.set('fire_alarm', (scores.get('fire_alarm') || 0) + 2);
    signals.push('sheet_prefix_FA');
  }
  if (/^(FF|FP|SP|SPR)[-_]?\d/i.test(sheet)) {
    scores.set('fire_fighting', (scores.get('fire_fighting') || 0) + 2);
    signals.push('sheet_prefix_FF');
  }
  if (/^M[-_]?\d/i.test(sheet) || /\bM[-_]\d{2,}/i.test(corpus)) {
    scores.set('mechanical_hvac', (scores.get('mechanical_hvac') || 0) + 1.5);
    signals.push('sheet_prefix_M');
  }

  let best: DrawingTypeId = 'unknown';
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }

  // Combined alarm+sprinkler sheets often share a single drawing
  const alarm = scores.get('fire_alarm') || 0;
  const fighting = scores.get('fire_fighting') || 0;
  if (alarm >= 3 && fighting >= 3 && Math.abs(alarm - fighting) < 1.5) {
    // Prefer fire fighting as primary when both strong (life-safety pack)
    // but keep signals for both
    best = fighting >= alarm ? 'fire_fighting' : 'fire_alarm';
    signals.push('mixed_life_safety_sheet');
  }

  const labels = DRAWING_TYPE_LABELS[best];
  const confidence =
    best === 'unknown' ? 0 : Math.min(0.95, 0.35 + bestScore * 0.12);

  return {
    type: best,
    label_ar: labels.label_ar,
    label_en: labels.label_en,
    confidence: Math.round(confidence * 100) / 100,
    signals,
  };
}

function parseFloorsCountMention(text: string): number | null {
  const patterns = [
    /(?:عدد\s*الأدوار|عدد\s*الطوابق|floors?\s*count|no\.?\s*of\s*floors?|stories?)\s*[=:]?\s*(\d{1,2})/i,
    /(\d{1,2})\s*(?:floors?|stories?|أدوار|طوابق)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 60) return n;
    }
  }
  return null;
}

function detectFloorsFromText(text: string): DetectedFloorLevel[] {
  const found: DetectedFloorLevel[] = [];
  const seen = new Set<string>();
  for (const row of FLOOR_PATTERNS) {
    const m = text.match(row.re);
    if (!m) continue;
    const key = `${row.kind}:${row.label_en}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const count = row.count_from_match?.(m) ?? 1;
    found.push({
      kind: row.kind,
      label_ar: row.label_ar,
      label_en: row.label_en,
      count_hint: count,
      area_m2: null,
      source: /sheet|index|جدول|فهرس/i.test(text.slice(0, 200))
        ? 'sheet_index'
        : 'title_block',
    });
  }
  return found;
}

function attachFloorAreasFromText(
  floors: DetectedFloorLevel[],
  text: string
): DetectedFloorLevel[] {
  return floors.map((floor) => {
    const labelRe = floor.label_ar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const enRe = floor.label_en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const areaRe = new RegExp(
      `(?:${labelRe}|${enRe})[^\\n]{0,40}?([\\d,.]+)\\s*(?:m2|m²|متر)`,
      'i'
    );
    const m = text.match(areaRe);
    if (!m) return floor;
    const area = Number(String(m[1]).replace(/,/g, ''));
    if (!Number.isFinite(area) || area <= 0) return floor;
    return { ...floor, area_m2: Math.round(area * 100) / 100 };
  });
}

/**
 * Extract GFA, floor breakdown, floors count, and drawing scale.
 */
export function extractBuildingMetrics(params: {
  text?: string;
  titleBlock?: TitleBlockMetadata | null;
  scale?: ScaleCalibration | null;
  zones?: DetectedZone[];
  grossFloorAreaM2?: number | null;
}): BuildingMetricsInspection {
  const text = corpusFrom(params.text || '', params.titleBlock);
  const notes_ar: string[] = [];
  const notes_en: string[] = [];

  const scaleFromText = detectScaleFromText(text);
  const scale = {
    ratio_text:
      params.scale?.ratio_text ||
      params.titleBlock?.scale_text ||
      scaleFromText.ratio_text,
    scale_denominator:
      params.scale?.scale_denominator || scaleFromText.scale_denominator,
    source: (params.scale?.source ||
      (scaleFromText.ratio_text ? 'drawing_text' : 'unknown')) as BuildingMetricsInspection['scale']['source'],
  };

  let floors = attachFloorAreasFromText(detectFloorsFromText(text), text);

  // Infer ground from zones when title block is silent
  if (!floors.length && (params.zones?.length || 0) > 0) {
    floors = [
      {
        kind: 'ground',
        label_ar: 'أرضي',
        label_en: 'Ground Floor',
        count_hint: 1,
        area_m2: params.grossFloorAreaM2 ?? params.titleBlock?.area_m2 ?? null,
        source: 'inferred',
      },
    ];
    notes_ar.push('لم يُذكر عدد الأدوار صراحة — افتُرض دور واحد من الفراغات المكتشفة.');
    notes_en.push('No explicit floor count — inferred one level from detected zones.');
  }

  const mentionCount = parseFloorsCountMention(text);
  const sumHints = floors.reduce((s, f) => s + Math.max(1, f.count_hint || 1), 0);
  const floors_count =
    mentionCount ?? (floors.length ? sumHints : null);

  const zoneSum =
    params.zones
      ?.map((z) => z.area_m2)
      .filter((a): a is number => typeof a === 'number' && a > 0)
      .reduce((s, a) => s + a, 0) || null;

  const total_area_m2 =
    (params.grossFloorAreaM2 != null && params.grossFloorAreaM2 > 0
      ? params.grossFloorAreaM2
      : null) ??
    (params.titleBlock?.area_m2 != null && params.titleBlock.area_m2 > 0
      ? params.titleBlock.area_m2
      : null) ??
    (zoneSum != null && zoneSum > 0 ? Math.round(zoneSum * 100) / 100 : null);

  if (!scale.ratio_text) {
    notes_ar.push('مقياس الرسم غير معروف — تحقق هندسي مطلوب للأبعاد.');
    notes_en.push('Drawing scale unknown — engineer verification required for dimensions.');
  }
  if (total_area_m2 == null) {
    notes_ar.push('المساحة الإجمالية غير متاحة — Needs Engineer Input.');
    notes_en.push('Total gross area unavailable — Needs Engineer Input.');
  }

  const floor_area_breakdown = floors.map((f) => ({
    label_ar: f.label_ar,
    label_en: f.label_en,
    area_m2: f.area_m2,
  }));

  // If single inferred floor and we have total area, attach it
  if (
    floor_area_breakdown.length === 1 &&
    floor_area_breakdown[0].area_m2 == null &&
    total_area_m2 != null
  ) {
    floor_area_breakdown[0] = { ...floor_area_breakdown[0], area_m2: total_area_m2 };
    floors = floors.map((f, i) =>
      i === 0 ? { ...f, area_m2: total_area_m2 } : f
    );
  }

  return {
    total_area_m2,
    floors_count,
    floors,
    floor_area_breakdown,
    scale,
    occupancy: params.titleBlock?.occupancy || null,
    notes_ar,
    notes_en,
  };
}

const USE_LABEL_AR: Partial<Record<ZoneClassification, string>> = {
  warehouse: 'مستودع',
  electrical_room: 'غرفة كهرباء',
  kitchen: 'مطبخ',
  office: 'مكاتب',
  server_room: 'غرفة خوادم',
  stairwell: 'درج',
  corridor: 'ممر',
  assembly: 'تجمع',
  unknown: 'غير مصنّف',
  manual: 'يدوي',
};

/**
 * List detected rooms/spaces with area and labeled use.
 */
export function extractZoneDetails(zones: DetectedZone[] | null | undefined): ZoneDetailInspection[] {
  if (!zones?.length) return [];
  return zones.map((z) => {
    const classified = z.classification
      ? {
          classification: z.classification,
          label: z.label,
          label_ar: z.label_ar || USE_LABEL_AR[z.classification] || null,
          confidence: z.label_confidence ?? z.confidence,
        }
      : classifyLabelText(z.label || z.nearby_text || z.label_ar || '');
    const use = (z.classification || classified.classification || 'unknown') as ZoneClassification;
    const label_en = classified.label || z.label || use;
    const label_ar =
      z.label_ar || classified.label_ar || USE_LABEL_AR[use] || z.label || null;
    return {
      zone_id: z.id,
      label: z.label,
      label_ar,
      label_en,
      use,
      area_m2: z.area_m2,
      confidence: Math.round((classified.confidence || z.confidence || 0) * 100) / 100,
      needs_engineer_label: Boolean(
        z.needs_engineer_label || use === 'unknown' || !(z.label || z.label_ar)
      ),
    };
  });
}

/** Full inspection report from a CAD vision result (read-only). */
export function inspectDrawing(
  result: Pick<
    CADAnalysisResult,
    | 'extracted_text'
    | 'title_block'
    | 'scale'
    | 'zones'
    | 'text_anchors'
    | 'gross_floor_area_m2'
    | 'file_name'
    | 'occupancy'
  >
): DrawingInspectionReport {
  const text = result.extracted_text || result.title_block?.raw_text || '';
  const drawing_type = detectDrawingType(text, result.title_block, result.text_anchors);
  const building = extractBuildingMetrics({
    text,
    titleBlock: result.title_block,
    scale: result.scale,
    zones: result.zones,
    grossFloorAreaM2: result.gross_floor_area_m2,
  });
  if (!building.occupancy && result.occupancy) {
    building.occupancy = result.occupancy;
  }
  const zones = extractZoneDetails(result.zones);

  return {
    inspected_at: new Date().toISOString(),
    mode: 'inspection_only',
    drawing_type,
    building,
    zones,
    source: {
      file_name: result.file_name,
      sheet_number: result.title_block?.sheet_number || null,
      drawing_title: result.title_block?.drawing_title || null,
      has_scale: Boolean(building.scale.ratio_text),
      zones_count: zones.length,
    },
  };
}

/** Map inspection → building_plan fields for Applicability Engine feed. */
export function buildingPlanPatchFromInspection(
  report: DrawingInspectionReport,
  current: Record<string, unknown> = {}
): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...current };
  if (report.building.total_area_m2 != null && report.building.total_area_m2 > 0) {
    patch.total_site_area_m2 = String(report.building.total_area_m2);
  }
  if (report.building.floors.length) {
    patch.floors_description = report.building.floors
      .map((f) =>
        f.count_hint > 1 ? `${f.label_ar} ×${f.count_hint}` : f.label_ar
      )
      .join(' · ');
  }
  if (report.building.occupancy) {
    patch.occupancy_classification = report.building.occupancy;
  }
  const basement = report.building.floors.find((f) => f.kind === 'basement');
  if (basement) {
    patch.basement_floors_count = String(Math.max(1, basement.count_hint || 1));
    patch.underground_building = 'نعم';
  }
  if (report.drawing_type.type === 'fire_alarm') {
    patch.fire_alarm_system = 'نعم';
  }
  if (report.drawing_type.type === 'fire_fighting') {
    patch.sprinkler_system = 'نعم';
  }
  if (
    report.drawing_type.type === 'fire_alarm' ||
    report.drawing_type.type === 'fire_fighting'
  ) {
    // Mixed life-safety sheets often carry both systems
    if (report.drawing_type.signals.includes('mixed_life_safety_sheet')) {
      patch.fire_alarm_system = 'نعم';
      patch.sprinkler_system = 'نعم';
    }
  }
  return patch;
}

/** Compact client-field hints (floors_count / building_area) for callers that can write client rows. */
export function clientFieldHintsFromInspection(report: DrawingInspectionReport): {
  building_area?: number;
  floors_count?: number;
} {
  const out: { building_area?: number; floors_count?: number } = {};
  if (report.building.total_area_m2 != null && report.building.total_area_m2 > 0) {
    out.building_area = report.building.total_area_m2;
  }
  if (report.building.floors_count != null && report.building.floors_count > 0) {
    out.floors_count = report.building.floors_count;
  }
  return out;
}
