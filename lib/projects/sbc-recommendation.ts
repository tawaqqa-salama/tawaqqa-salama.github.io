/**
 * Smart SBC recommendation for Stage 2 engineering specs.
 * Maps project activity + building area → occupancy group + construction type.
 */

import { ACTIVITY_RULES } from '@/lib/constants/activity-rules';
import { SBC_OCCUPANCIES, type SbcOccupancyCode } from '@/lib/constants/sbc801';

export type SbcOccupancyOption = {
  value: string;
  label_ar: string;
  label_en: string;
  group: string;
  occupancyCode?: SbcOccupancyCode;
};

export type SbcConstructionOption = {
  value: string;
  label_ar: string;
  label_en: string;
  category: 'fire_resistive' | 'non_combustible' | 'ordinary';
};

/** Standard SBC occupancy dropdown (Stage 2) */
export const SBC_OCCUPANCY_OPTIONS: SbcOccupancyOption[] = [
  {
    value: 'Group A',
    group: 'A',
    label_ar: 'Group A — تجمعات / Assembly',
    label_en: 'Group A — Assembly',
    occupancyCode: 'assembly',
  },
  {
    value: 'Group B',
    group: 'B',
    label_ar: 'Group B — تجاري ومكاتب / Business',
    label_en: 'Group B — Business',
    occupancyCode: 'business',
  },
  {
    value: 'Group E',
    group: 'E',
    label_ar: 'Group E — تعليمي / Educational',
    label_en: 'Group E — Educational',
    occupancyCode: 'educational',
  },
  {
    value: 'Group F-1',
    group: 'F-1',
    label_ar: 'Group F-1 — صناعي (خطورة متوسطة) / Factory Industrial',
    label_en: 'Group F-1 — Factory Industrial',
    occupancyCode: 'industrial_moderate',
  },
  {
    value: 'Group F-2',
    group: 'F-2',
    label_ar: 'Group F-2 — صناعي (خطورة منخفضة) / Factory Low Hazard',
    label_en: 'Group F-2 — Factory Low Hazard',
    occupancyCode: 'industrial_low',
  },
  {
    value: 'Group H',
    group: 'H',
    label_ar: 'Group H — مواد خطرة / High Hazard',
    label_en: 'Group H — High Hazard',
    occupancyCode: 'high_hazard',
  },
  {
    value: 'Group M',
    group: 'M',
    label_ar: 'Group M — متاجر وأسواق / Mercantile',
    label_en: 'Group M — Mercantile',
    occupancyCode: 'mercantile',
  },
  {
    value: 'Group S-1',
    group: 'S-1',
    label_ar: 'Group S-1 — مستودعات وتخزين (متوسط) / Storage',
    label_en: 'Group S-1 — Storage (moderate)',
    occupancyCode: 'storage_moderate',
  },
  {
    value: 'Group S-2',
    group: 'S-2',
    label_ar: 'Group S-2 — مستودعات وتخزين (منخفض) / Storage',
    label_en: 'Group S-2 — Storage (low)',
    occupancyCode: 'storage_low',
  },
  {
    value: 'Group R',
    group: 'R',
    label_ar: 'Group R — سكني / Residential',
    label_en: 'Group R — Residential',
    occupancyCode: 'residential',
  },
];

/** Standard SBC construction type dropdown (Stage 2) */
export const SBC_CONSTRUCTION_TYPE_OPTIONS: SbcConstructionOption[] = [
  {
    value: 'Type I-A',
    label_ar: 'Type I-A — مقاوم للحريق / Fire-resistive',
    label_en: 'Type I-A — Fire-resistive',
    category: 'fire_resistive',
  },
  {
    value: 'Type I-B',
    label_ar: 'Type I-B — مقاوم للحريق / Fire-resistive',
    label_en: 'Type I-B — Fire-resistive',
    category: 'fire_resistive',
  },
  {
    value: 'Type II-A',
    label_ar: 'Type II-A — غير قابل للاشتعال / Non-combustible',
    label_en: 'Type II-A — Non-combustible',
    category: 'non_combustible',
  },
  {
    value: 'Type II-B',
    label_ar: 'Type II-B — غير قابل للاشتعال / Non-combustible',
    label_en: 'Type II-B — Non-combustible',
    category: 'non_combustible',
  },
  {
    value: 'Type III',
    label_ar: 'Type III — إنشاءات ثقيلة / Ordinary (exterior protected)',
    label_en: 'Type III — Ordinary (exterior protected)',
    category: 'ordinary',
  },
  {
    value: 'Type IV',
    label_ar: 'Type IV — محمي (أخشاب ثقيلة) / Heavy Timber',
    label_en: 'Type IV — Heavy Timber',
    category: 'ordinary',
  },
  {
    value: 'Type V',
    label_ar: 'Type V — عادي / Wood-frame',
    label_en: 'Type V — Wood-frame',
    category: 'ordinary',
  },
];

export type SbcRecommendation = {
  occupancyValue: string;
  occupancyLabelAr: string;
  constructionValue: string;
  constructionLabelAr: string;
  activityLabel: string;
  buildingAreaM2: number;
  rationaleAr: string;
  rationaleEn: string;
  confidence: 'high' | 'medium' | 'low';
  sbcRefs: string[];
};

const KEYWORD_OCCUPANCY: { pattern: RegExp; code: SbcOccupancyCode }[] = [
  { pattern: /محطة\s*وقود|gas\s*station|fuel/i, code: 'special_fuel' },
  { pattern: /مواد\s*خطرة|chemical|hazard|دهان|solvent/i, code: 'high_hazard' },
  {
    pattern: /مصنع|صناع|كفرات|إطارات|factory|industrial|workshop|ورشة|بلاستيك|خشب|ملابس|غذائ/i,
    code: 'industrial_moderate',
  },
  { pattern: /طوب|سيراميك|زجاج|جبس|ثلج|ceramic|glass/i, code: 'industrial_low' },
  { pattern: /مستودع|مخزن|warehouse|storage|تخزين/i, code: 'storage_moderate' },
  { pattern: /سوق|متجر|مول|تجار|mercantile|retail|صيدل/i, code: 'mercantile' },
  { pattern: /مدرس|تعليم|حضان|school|education/i, code: 'educational' },
  { pattern: /مطعم|مقهى|سينما|قاعة|تجمع|restaurant|assembly|مسجد|أفراح/i, code: 'assembly' },
  { pattern: /سكن|شقق|فندق|hotel|residential|مهاجع/i, code: 'residential' },
  { pattern: /مكتب|إدار|عياد|office|business|مصرف/i, code: 'business' },
  { pattern: /موقف|parking/i, code: 'parking' },
];

function occupancyCodeToOptionValue(code: SbcOccupancyCode): string {
  const letter = SBC_OCCUPANCIES[code].group_letter;
  // Prefer explicit F-1 / S-1 style values from options
  const match = SBC_OCCUPANCY_OPTIONS.find(
    (o) => o.occupancyCode === code || o.group === letter
  );
  if (match) return match.value;
  return `Group ${letter}`;
}

function resolveOccupancyCode(
  activityType?: string | null,
  activityName?: string | null
): { code: SbcOccupancyCode; source: 'activity_rule' | 'keyword' | 'default'; label: string } {
  const key = (activityType || '').trim();
  if (key && ACTIVITY_RULES[key]) {
    return {
      code: ACTIVITY_RULES[key].occupancy,
      source: 'activity_rule',
      label: ACTIVITY_RULES[key].label,
    };
  }

  const text = `${activityType || ''} ${activityName || ''}`.trim();
  for (const row of KEYWORD_OCCUPANCY) {
    if (row.pattern.test(text)) {
      return {
        code: row.code,
        source: 'keyword',
        label: activityName || activityType || SBC_OCCUPANCIES[row.code].label_ar,
      };
    }
  }

  // Match ACTIVITY_RULES labels in free text
  for (const rule of Object.values(ACTIVITY_RULES)) {
    if (rule.label && text.includes(rule.label)) {
      return { code: rule.occupancy, source: 'keyword', label: rule.label };
    }
  }

  return {
    code: 'business',
    source: 'default',
    label: activityName || activityType || 'غير محدد',
  };
}

/**
 * Construction type heuristic from SBC occupancy risk + building area.
 * Example: مصنع كفرات @ 1000 m² → Group F-1 + Type II-B
 */
export function recommendConstructionType(
  occupancyCode: SbcOccupancyCode,
  buildingAreaM2: number
): string {
  const occ = SBC_OCCUPANCIES[occupancyCode];
  const area = Math.max(0, buildingAreaM2);

  if (occ.risk === 'very_high' || occupancyCode === 'special_fuel' || occupancyCode === 'high_hazard') {
    return area >= 2000 ? 'Type I-A' : 'Type I-B';
  }

  if (
    occupancyCode === 'industrial_moderate' ||
    occupancyCode === 'storage_moderate'
  ) {
    if (area >= 5000) return 'Type I-B';
    if (area >= 500) return 'Type II-B';
    return 'Type II-A';
  }

  if (occupancyCode === 'industrial_low' || occupancyCode === 'storage_low' || occupancyCode === 'parking') {
    if (area >= 3000) return 'Type II-A';
    if (area >= 500) return 'Type II-B';
    return 'Type III';
  }

  if (occupancyCode === 'residential' || occupancyCode === 'institutional') {
    if (area >= 3000) return 'Type I-B';
    if (area >= 1000) return 'Type II-A';
    return 'Type III';
  }

  if (occupancyCode === 'mercantile' || occupancyCode === 'assembly' || occupancyCode === 'educational') {
    if (area >= 4000) return 'Type I-B';
    if (area >= 1115) return 'Type II-B';
    if (area >= 500) return 'Type III';
    return 'Type V';
  }

  // business / default
  if (area >= 5000) return 'Type I-B';
  if (area >= 1500) return 'Type II-B';
  if (area >= 400) return 'Type III';
  return 'Type V';
}

export function recommendSbcClassification(input: {
  activityType?: string | null;
  activityName?: string | null;
  buildingAreaM2?: number | null;
}): SbcRecommendation {
  const area = Math.max(0, Number(input.buildingAreaM2) || 0);
  const resolved = resolveOccupancyCode(input.activityType, input.activityName);
  const occ = SBC_OCCUPANCIES[resolved.code];
  const occupancyValue = occupancyCodeToOptionValue(resolved.code);
  const occupancyOpt = SBC_OCCUPANCY_OPTIONS.find((o) => o.value === occupancyValue);
  const constructionValue = recommendConstructionType(resolved.code, area);
  const constructionOpt = SBC_CONSTRUCTION_TYPE_OPTIONS.find((o) => o.value === constructionValue);

  const confidence: SbcRecommendation['confidence'] =
    resolved.source === 'activity_rule' ? 'high' : resolved.source === 'keyword' ? 'medium' : 'low';

  return {
    occupancyValue,
    occupancyLabelAr: occupancyOpt?.label_ar || `Group ${occ.group_letter} (${occ.label_ar})`,
    constructionValue,
    constructionLabelAr: constructionOpt?.label_ar || constructionValue,
    activityLabel: resolved.label,
    buildingAreaM2: area,
    rationaleAr:
      `بناءً على النشاط «${resolved.label}»` +
      (area > 0 ? ` ومساحة المبنى ${area.toLocaleString('ar-SA')} م²` : '') +
      ` → إشغال ${occupancyValue} (${occ.label_ar}) ونوع بناء ${constructionValue} وفق إرشادات SBC 801/201.`,
    rationaleEn:
      `Based on activity “${resolved.label}”` +
      (area > 0 ? ` and building area ${area.toLocaleString('en-SA')} m²` : '') +
      ` → occupancy ${occupancyValue} and construction ${constructionValue} per SBC 801/201 guidance.`,
    confidence,
    sbcRefs: occ.sbc_refs.slice(0, 4),
  };
}

/** Normalize legacy free-text values into dropdown values when possible */
export function normalizeOccupancyValue(raw?: string | null): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const exact = SBC_OCCUPANCY_OPTIONS.find((o) => o.value === text);
  if (exact) return exact.value;
  const upper = text.toUpperCase().replace(/\s+/g, ' ');
  for (const opt of SBC_OCCUPANCY_OPTIONS) {
    if (upper.includes(opt.group.toUpperCase()) || upper.includes(opt.value.toUpperCase())) {
      return opt.value;
    }
  }
  const m = upper.match(/GROUP\s*([A-Z]-?\d?)/);
  if (m) {
    const hit = SBC_OCCUPANCY_OPTIONS.find((o) => o.group.toUpperCase() === m[1]);
    if (hit) return hit.value;
  }
  return text;
}

export function normalizeConstructionValue(raw?: string | null): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const exact = SBC_CONSTRUCTION_TYPE_OPTIONS.find((o) => o.value === text);
  if (exact) return exact.value;
  const compact = text.toUpperCase().replace(/\s+/g, '').replace(/TYPE/, 'TYPE ');
  const normalized = compact
    .replace(/TYPE\s*IA/, 'Type I-A')
    .replace(/TYPE\s*IB/, 'Type I-B')
    .replace(/TYPE\s*IIA/, 'Type II-A')
    .replace(/TYPE\s*IIB/, 'Type II-B')
    .replace(/TYPE\s*III/, 'Type III')
    .replace(/TYPE\s*IV/, 'Type IV')
    .replace(/TYPE\s*V(?![A-Z0-9])/, 'Type V');
  const hit = SBC_CONSTRUCTION_TYPE_OPTIONS.find(
    (o) => o.value.toUpperCase() === normalized.toUpperCase() || text.toUpperCase().includes(o.value.toUpperCase())
  );
  return hit?.value || text;
}
