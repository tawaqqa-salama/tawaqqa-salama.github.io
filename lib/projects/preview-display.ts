const ENGINEERING_VALUE_LABELS: Record<string, string> = {
  ordinary_hazard_group_1: 'خطورة عادية — المجموعة الأولى',
  ordinary_hazard_group_2: 'خطورة عادية — المجموعة الثانية',
  light_hazard: 'خطورة خفيفة',
  extra_hazard_group_1: 'خطورة إضافية — المجموعة الأولى',
  extra_hazard_group_2: 'خطورة إضافية — المجموعة الثانية',
  dry_chemical: 'مسحوق كيميائي جاف',
  dry_powder_abc: 'مسحوق جاف ABC',
  carbon_dioxide: 'ثاني أكسيد الكربون',
  foam: 'رغوة',
  wet_chemical: 'مادة كيميائية رطبة',
  clean_agent: 'عامل نظيف',
  water: 'ماء',
  Wet: 'رطب (Wet Pipe)',
  'Wet Pipe': 'رطب (Wet Pipe)',
  wet_pipe: 'رطب (Wet Pipe)',
  Dry: 'نظام جاف (Dry Pipe)',
  'Dry Pipe': 'نظام جاف (Dry Pipe)',
  dry_pipe: 'نظام جاف (Dry Pipe)',
  Upright: 'رشاش رأسي (Upright)',
  Pendent: 'رشاش متدلٍ (Pendent)',
  Sidewall: 'رشاش جانبي (Sidewall)',
  required: 'مطلوب',
  not_required: 'غير مطلوب',
  yes: 'نعم',
  no: 'لا',
  unknown: 'غير محدد',
  Addressable: 'معنون (Addressable)',
  FACP: 'لوحة التحكم بإنذار الحريق (FACP)',
  'FACP Addressable': 'معنونة (FACP Addressable)',
  'Addressable smoke detectors': 'كواشف دخان معنونة (Addressable)',
  'Heat detectors': 'كواشف حرارة',
  'Manual call points': 'نقاط نداء يدوية',
  'Audible and visual notification devices': 'أجهزة تنبيه مرئية وصوتية',
};

const INLINE_ENGINEERING_VALUE_LABELS: Record<string, string> = {
  ordinary_hazard_group_1: 'خطورة عادية — المجموعة الأولى',
  ordinary_hazard_group_2: 'خطورة عادية — المجموعة الثانية',
  light_hazard: 'خطورة خفيفة',
  extra_hazard_group_1: 'خطورة إضافية — المجموعة الأولى',
  extra_hazard_group_2: 'خطورة إضافية — المجموعة الثانية',
  dry_chemical: 'مسحوق كيميائي جاف',
  dry_powder_abc: 'مسحوق جاف ABC',
  carbon_dioxide: 'ثاني أكسيد الكربون',
  'Wet Pipe': 'رطب (Wet Pipe)',
  wet_pipe: 'رطب (Wet Pipe)',
  Upright: 'رشاش رأسي (Upright)',
  'Addressable smoke detectors': 'كواشف دخان معنونة (Addressable)',
  'Heat detectors': 'كواشف حرارة',
  'Manual call points': 'نقاط نداء يدوية',
  'Audible and visual notification devices': 'أجهزة تنبيه مرئية وصوتية',
};

const USER_FACING_SOURCE_LABELS: Array<[RegExp, string]> = [
  [/^fire_protection_design(?:\.|$)/, 'التصميم الفني لأنظمة الحريق'],
  [/^design_center\.space_safety(?:\.|$)/, 'مركز التصاميم — متطلبات السلامة'],
  [/^building_plan(?:\.|$)/, 'بيانات ومخططات المبنى'],
  [/^hydraulic(?:\.|_|\s|$)/i, 'الحسابات الهيدروليكية'],
  [/^project_drawings(?:\.|$)/, 'المخططات المعتمدة'],
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatKnownMeasurement(value: string): string | null {
  const unitFirst = value.match(/^(GPM|L\/min|bar|m3|m³)\s+([0-9]+(?:\.[0-9]+)?)$/i);
  if (unitFirst) return `${unitFirst[2]} ${unitFirst[1] === 'm3' ? 'm³' : unitFirst[1]}`;

  const valueFirst = value.match(/^([0-9]+(?:\.[0-9]+)?)\s+(GPM|L\/min|bar|m3|m³)$/i);
  if (valueFirst) return `${valueFirst[1]} ${valueFirst[2] === 'm3' ? 'm³' : valueFirst[2]}`;

  return null;
}

/**
 * Humanizes known canonical engineering values for user-facing previews only.
 * Unknown values deliberately remain unchanged: no translation or engineering
 * conclusion is invented, and the canonical value is never mutated.
 */
export function humanizeEngineeringDisplayValue(value: string | null | undefined): string | null {
  const clean = normalizeWhitespace(value || '');
  if (!clean) return null;
  if (ENGINEERING_VALUE_LABELS[clean]) return ENGINEERING_VALUE_LABELS[clean];

  const measurement = formatKnownMeasurement(clean);
  if (measurement) return measurement;

  if (clean.includes(' · ')) {
    return clean.split(' · ').map((item) => humanizeEngineeringDisplayValue(item) || item.trim()).join(' · ');
  }

  const inlineValues = Object.entries(INLINE_ENGINEERING_VALUE_LABELS)
    .sort(([left], [right]) => right.length - left.length);
  const withKnownTerms = inlineValues.reduce(
    (result, [canonical, label]) => result.replaceAll(canonical, label),
    clean
  );
  return withKnownTerms.replace(/\bm3\b/g, 'm³');
}

/** Converts internal provenance paths into trusted reader-facing source labels. */
export function userFacingSourceLabel(value: string | null | undefined): string | null {
  const clean = normalizeWhitespace(value || '');
  if (!clean) return null;
  const mapped = USER_FACING_SOURCE_LABELS.find(([pattern]) => pattern.test(clean));
  return mapped ? mapped[1] : clean;
}
