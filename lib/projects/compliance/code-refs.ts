/**
 * Precise code citations for compliance rules.
 * SBC 201 / SBC 801 are primary. NFPA is complementary design reference only
 * (never claimed as a substitute for adopted Saudi code / AHJ).
 *
 * If a numeric table cell is not encoded in-platform → rule must return NEEDS_DATA
 * rather than inventing a threshold.
 */

export type StandardFamily =
  | 'SBC 201'
  | 'SBC 801'
  | 'NFPA 13'
  | 'NFPA 14'
  | 'NFPA 20'
  | 'NFPA 22'
  | 'NFPA 72'
  | 'NFPA 10'
  | 'PLATFORM';

export type CodeCitation = {
  /** Primary standard family shown on the rule */
  primary: StandardFamily;
  /** Human-readable precise citation (chapter/section/table when known) */
  citation: string;
  /** Complementary standards (design aids) — never primary authority alone */
  complementary?: StandardFamily[];
  /** True when a numeric table value is encoded in-platform for automated compare */
  hasPlatformNumericTable: boolean;
  notes_ar?: string;
};

/**
 * Rule-level official citations (chapter/section granularity available in-repo).
 * Generic marketing phrases are intentionally avoided.
 */
export const RULE_CODE_REFS: Record<string, CodeCitation> = {
  'OCC-01': {
    primary: 'SBC 201',
    citation: 'SBC 201 Chapter 3 — Occupancy Classification',
    hasPlatformNumericTable: false,
    notes_ar: 'وجود تصنيف موثّق؛ ليس حكمًا على صحة التصنيف مقابل جدول الكود.',
  },
  'OCC-02': {
    primary: 'SBC 201',
    citation: 'SBC 201 Chapter 3 — Occupancy Groups',
    hasPlatformNumericTable: false,
  },
  'OCC-03': {
    primary: 'SBC 201',
    citation: 'SBC 201 Chapter 6 — Types of Construction',
    hasPlatformNumericTable: false,
  },
  'OCC-04': {
    primary: 'SBC 201',
    citation: 'SBC 201 Chapter 5 — General Building Heights and Areas (building area)',
    hasPlatformNumericTable: false,
  },
  'OCC-05': {
    primary: 'SBC 201',
    citation: 'SBC 201 Chapter 5 — Height and Number of Stories',
    hasPlatformNumericTable: false,
  },
  'OCC-06': {
    primary: 'SBC 201',
    citation: 'SBC 201 / platform SBC_STRUCTURE_RULES.high_rise_floor_height_m (EKB structural summary)',
    hasPlatformNumericTable: true,
    notes_ar: 'عتبة الارتفاع العالي من موجز المنصة (SBC_STRUCTURE_RULES) — تحقق من الطبعة المعتمدة.',
  },
  'OCC-07': {
    primary: 'SBC 201',
    citation: 'SBC 201 Chapter 5 — Mixed Occupancy / Separated Occupancies',
    hasPlatformNumericTable: false,
  },
  'OCC-08': {
    primary: 'SBC 201',
    citation: 'SBC 201 Chapter 4 — Special Detailed Requirements Based on Occupancy and Use',
    hasPlatformNumericTable: false,
  },
  'EGR-01': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1004 — Occupant Load',
    hasPlatformNumericTable: false,
  },
  'EGR-02': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1006 — Number of Exits and Exit Access Doorways (platform bands SBC-201-1004)',
    hasPlatformNumericTable: true,
  },
  'EGR-03': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1005 — Means of Egress Sizing (capacity ≥ occupant load)',
    hasPlatformNumericTable: false,
    notes_ar: 'المقارنة سعة≥حمل؛ معاملات العرض التفصيلية غير مرمّزة بالكامل.',
  },
  'EGR-04': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1016 — Exit Access',
    hasPlatformNumericTable: false,
  },
  'EGR-05': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1007 — Exit and Exit Access Doorway Configuration (remoteness / separation)',
    hasPlatformNumericTable: false,
    notes_ar: 'لا توجد معادلة تباعد مرمّزة في المنصة — إدخال required_* للمشروع ≠ الكود تلقائيًا.',
  },
  'EGR-06': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1017 — Exit Access Travel Distance (occupancy tables in adopted edition)',
    complementary: ['SBC 801'],
    hasPlatformNumericTable: false,
    notes_ar: 'جدول مسافة السفر حسب الإشغال غير مرمّز كقيم دقيقة — لا استخدام 45/60 كـ PASS آلي.',
  },
  'EGR-07': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1016.2 — Common Path of Egress Travel',
    hasPlatformNumericTable: false,
  },
  'EGR-08': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1020.4 — Dead Ends',
    hasPlatformNumericTable: false,
  },
  'EGR-09': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1020.2 — Corridor Width',
    hasPlatformNumericTable: false,
  },
  'EGR-10': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1010.1.1 — Size of Doors (clear width)',
    hasPlatformNumericTable: false,
  },
  'EGR-11': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1011.2 — Stairway Width',
    hasPlatformNumericTable: false,
  },
  'EGR-12': {
    primary: 'SBC 201',
    citation: 'SBC 201 §1028 — Exit Discharge',
    hasPlatformNumericTable: false,
  },
  'FAC-01': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Fire Apparatus Access Roads (adopted access chapter / AHJ)',
    hasPlatformNumericTable: false,
  },
  'FAC-02': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Fire Apparatus Access Road Width (adopted table / AHJ)',
    hasPlatformNumericTable: false,
    notes_ar: 'لا افتراض 6 م — required_* للمشروع ≠ قيمة كودية تلقائية.',
  },
  'FAC-03': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Access road clearance / fire apparatus staging',
    hasPlatformNumericTable: false,
  },
  'FAC-04': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Turning radius / access geometry for fire apparatus',
    hasPlatformNumericTable: false,
  },
  'FAC-05': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Fire Department Connection (FDC) accessibility',
    complementary: ['NFPA 13', 'NFPA 14'],
    hasPlatformNumericTable: false,
  },
  'FP-01': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Automatic Sprinkler Systems (occupancy thresholds in lib/constants/sbc801.ts / EKB)',
    complementary: ['NFPA 13'],
    hasPlatformNumericTable: true,
  },
  'FP-02': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Hazard / Commodity Classification (design basis)',
    complementary: ['NFPA 13'],
    hasPlatformNumericTable: false,
  },
  'FP-03': {
    primary: 'SBC 801',
    citation: 'SBC 801 sprinkler design basis; density/area tables per adopted edition',
    complementary: ['NFPA 13'],
    hasPlatformNumericTable: false,
    notes_ar: 'كثافة/مساحة التصميم بدون جدول كثافة مرمّز → NEEDS_DATA.',
  },
  'FP-04': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Sprinkler system demand (hydraulic design demand ≠ pump rated flow)',
    complementary: ['NFPA 13'],
    hasPlatformNumericTable: false,
  },
  'FP-05': {
    primary: 'SBC 801',
    citation: 'SBC 801 / hose stream allowance (design); complementary NFPA 13 hose allowance tables',
    complementary: ['NFPA 13'],
    hasPlatformNumericTable: false,
  },
  'FP-06': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Standpipe systems; platform standpipe_height_m in SBC_STRUCTURE_RULES',
    complementary: ['NFPA 14'],
    hasPlatformNumericTable: true,
  },
  'FP-07': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Fire pump when required by water supply design',
    complementary: ['NFPA 20'],
    hasPlatformNumericTable: false,
    notes_ar: 'مقارنة تدفق المضخة بطلب المرشات = تحقق تصميمي؛ منحنيات NFPA 20 مكملة.',
  },
  'FP-08': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Water supply / fire tank duration & volume (project calculation)',
    complementary: ['NFPA 22'],
    hasPlatformNumericTable: false,
    notes_ar: 'الحجم المطلوب المحسوب = قيمة تصميم مشروع؛ ليس جدول كود مرمّز كاملًا.',
  },
  'FP-09': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Fire Department Connection requirement with sprinkler/standpipe',
    complementary: ['NFPA 13', 'NFPA 14'],
    hasPlatformNumericTable: false,
  },
  'FP-10': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Portable fire extinguishers (distribution per adopted rules)',
    complementary: ['NFPA 10'],
    hasPlatformNumericTable: false,
  },
  'HYD-01': {
    primary: 'SBC 801',
    citation: 'SBC 801 hydraulic design documentation; network calc foundation',
    complementary: ['NFPA 13'],
    hasPlatformNumericTable: false,
    notes_ar: 'اكتمال حقول الشبكة شرط توثيقي؛ المرفقات وحدها لا تكفي.',
  },
  'FA-01': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Fire Alarm and Detection (occupancy thresholds in sbc801.ts / EKB)',
    complementary: ['NFPA 72'],
    hasPlatformNumericTable: true,
  },
  'FA-02': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Fire alarm control unit / panel',
    complementary: ['NFPA 72'],
    hasPlatformNumericTable: false,
  },
  'FA-03': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Detection devices',
    complementary: ['NFPA 72'],
    hasPlatformNumericTable: false,
  },
  'FA-04': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Manual fire alarm boxes / call points',
    complementary: ['NFPA 72'],
    hasPlatformNumericTable: false,
  },
  'FA-05': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Occupant notification',
    complementary: ['NFPA 72'],
    hasPlatformNumericTable: false,
  },
  'FA-06': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Emergency power for fire alarm',
    complementary: ['NFPA 72'],
    hasPlatformNumericTable: false,
  },
  'FA-07': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Fire alarm interfaces / Cause & Effect matrix',
    complementary: ['NFPA 72'],
    hasPlatformNumericTable: false,
  },
  'SMK-01': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Smoke control / smoke management (not HVAC ventilation alone)',
    hasPlatformNumericTable: false,
  },
  'EGR-TRAVEL-DISTANCE': {
    primary: 'SBC 201',
    citation: 'SBC 201:2024 §1017 — Exit Access Travel Distance (Table 1017.2 cells not encoded)',
    complementary: ['SBC 801'],
    hasPlatformNumericTable: false,
    notes_ar: 'مصفوفة: بدون صف مرمّز أو project_adopted_mapping → BLOCKED؛ بدون مدخلات → NEEDS_DATA.',
  },
  'EGR-COMMON-PATH': {
    primary: 'SBC 201',
    citation: 'SBC 201:2024 §1016.2 — Common Path of Egress Travel',
    hasPlatformNumericTable: false,
  },
  'EGR-DEAD-END': {
    primary: 'SBC 201',
    citation: 'SBC 201:2024 §1020.4 — Dead Ends (occupancy-specific; no universal value)',
    hasPlatformNumericTable: false,
  },
  'EGR-CORRIDOR-WIDTH': {
    primary: 'SBC 201',
    citation: 'SBC 201:2024 §1020.2 — Corridor Width (net clear width)',
    hasPlatformNumericTable: false,
  },
  'EGR-DOOR-WIDTH': {
    primary: 'SBC 201',
    citation: 'SBC 201:2024 §1010.1.1 — Size of Doors (clear opening width)',
    hasPlatformNumericTable: false,
  },
  'EGR-STAIR-WIDTH': {
    primary: 'SBC 201',
    citation: 'SBC 201:2024 §1011.2 — Stairway Width (occupancy-specific)',
    hasPlatformNumericTable: false,
  },
  'FAC-CLEARANCE': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Access clearance / staging (linked project citation FAC-03)',
    hasPlatformNumericTable: false,
    notes_ar: 'لا FAC code مخترع — مرتبط بـ FAC-03. بلا مصدر رقمي → BLOCKED + CODE_REFERENCE_REQUIRED.',
  },
  'FAC-TURNING': {
    primary: 'SBC 801',
    citation: 'SBC 801 — Turning radius / access geometry (linked project citation FAC-04)',
    hasPlatformNumericTable: false,
    notes_ar: 'لا FAC code مخترع — مرتبط بـ FAC-04.',
  },
  'FP-SPRINKLER-DENSITY': {
    primary: 'NFPA 13',
    citation: 'NFPA 13 — Density/Area tables (adopted edition; complementary to SBC 801)',
    complementary: ['SBC 801'],
    hasPlatformNumericTable: false,
    notes_ar: 'ممنوع كثافة عامة ثابتة — يلزم صف جدول بـ edition/section/table.',
  },
  'FP-HOSE-ALLOWANCE': {
    primary: 'NFPA 13',
    citation: 'NFPA 13 — Hose stream allowance tables (adopted edition)',
    complementary: ['SBC 801'],
    hasPlatformNumericTable: false,
    notes_ar: 'ممنوع 250/500 gpm كافتراض عام.',
  },
  'FP-FIRE-WATER-TANK': {
    primary: 'NFPA 22',
    citation: 'NFPA 22 / SBC 801 — Fire water supply duration & usable fire volume',
    complementary: ['SBC 801', 'NFPA 13', 'NFPA 14'],
    hasPlatformNumericTable: false,
    notes_ar: 'الحجم = الطلب المنطبق × المدة — بلا حجم خزان ثابت.',
  },
  'FP-EXTINGUISHER': {
    primary: 'NFPA 10',
    citation: 'NFPA 10 — Portable extinguishers (class-specific rating / travel / placement)',
    complementary: ['SBC 801'],
    hasPlatformNumericTable: false,
    notes_ar: 'Class C ليست فئة تحجيم مستقلة؛ ممنوع 75 ft كحد عام لكل الطفايات.',
  },
};

export function citationFor(ruleId: string): string {
  return RULE_CODE_REFS[ruleId]?.citation || ruleId;
}

export function primaryStandardFor(ruleId: string): StandardFamily {
  return RULE_CODE_REFS[ruleId]?.primary || 'PLATFORM';
}
