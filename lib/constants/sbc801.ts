/**
 * موجز تنفيذي من كود البناء السعودي للحماية من الحريق (SBC 801)
 * ومخطط متطلبات SBC 201 / 801 — للاستخدام داخل المنصة وربطه بالأنشطة.
 * المصدر: docs/ekb/sources/
 */

export type SbcOccupancyCode =
  | 'assembly'
  | 'business'
  | 'mercantile'
  | 'educational'
  | 'industrial_moderate'
  | 'industrial_low'
  | 'high_hazard'
  | 'institutional'
  | 'residential'
  | 'storage_moderate'
  | 'storage_low'
  | 'parking'
  | 'special_fuel';

export type SbcRiskLevel = 'low' | 'moderate' | 'high' | 'very_high';

export type SbcOccupancyDef = {
  code: SbcOccupancyCode;
  label_ar: string;
  risk: SbcRiskLevel;
  examples: string[];
  /** عتبة مساحة قسم حريق للرشاشات (م²) إن وُجدت */
  sprinkler_fire_area_m2?: number;
  /** عتبة مجموع أقسام الحريق للرشاشات (م²) */
  sprinkler_total_area_m2?: number;
  /** رشاشات إلزامية دائماً لهذا الإشغال */
  sprinkler_always?: boolean;
  /** إنذار عند تجاوز شاغلين في المبنى */
  alarm_occupants_building?: number;
  /** إنذار عند تجاوز شاغلين في أي طابق غير الأرضي */
  alarm_occupants_floor?: number;
  /** إنذار دائماً */
  alarm_always?: boolean;
  /** كشف + إنذار */
  detection_required?: boolean;
  notes?: string[];
  sbc_refs: string[];
};

export const SBC_OCCUPANCIES: Record<SbcOccupancyCode, SbcOccupancyDef> = {
  assembly: {
    code: 'assembly',
    label_ar: 'تجمعات',
    risk: 'moderate',
    examples: ['مطاعم', 'صالات أفراح', 'سينما', 'مساجد', 'معارض', 'قاعات محاضرات'],
    sprinkler_always: false,
    alarm_occupants_building: 300,
    notes: [
      'مرشات تلقائية إذا تجاوز عدد الشاغلين 300، مع طابق التجمع والطوابق حتى منفذ الخروج',
      'إنذار صوتي إذا تجاوز الإشغال 1000 شخص',
    ],
    sbc_refs: ['SBC-801-OCC-ASM', 'SBC-801-SPR', 'SBC-801-ALM'],
  },
  business: {
    code: 'business',
    label_ar: 'مكاتب',
    risk: 'low',
    examples: ['مكاتب شركات', 'مصارف', 'عيادات', 'إدارات عامة'],
    alarm_occupants_building: 500,
    alarm_occupants_floor: 100,
    sbc_refs: ['SBC-801-OCC-BUS', 'SBC-801-ALM'],
  },
  mercantile: {
    code: 'mercantile',
    label_ar: 'تجاري',
    risk: 'moderate',
    examples: ['محلات', 'صيدليات', 'أسواق', 'مجمعات تجارية'],
    sprinkler_fire_area_m2: 1115,
    sprinkler_total_area_m2: 2230,
    alarm_occupants_building: 500,
    alarm_occupants_floor: 100,
    notes: ['الأسواق المغطاة > 4645 م² تتطلب إنذاراً صوتياً', 'نظام مواسير فئة 1 في الأسواق المغطاة'],
    sbc_refs: ['SBC-801-OCC-MER', 'SBC-801-SPR', 'SBC-801-ALM', 'SBC-201-402'],
  },
  educational: {
    code: 'educational',
    label_ar: 'تعليمي',
    risk: 'moderate',
    examples: ['مدارس', 'حضانات'],
    sprinkler_fire_area_m2: 1115,
    alarm_occupants_building: 50,
    notes: ['مرشات في الطوابق السفلية، وفي العلوية إذا تجاوز قسم الحريق 1115 م²'],
    sbc_refs: ['SBC-801-OCC-EDU', 'SBC-801-SPR', 'SBC-801-ALM'],
  },
  industrial_moderate: {
    code: 'industrial_moderate',
    label_ar: 'صناعي متوسط الخطورة',
    risk: 'high',
    examples: ['مصانع غذائية', 'ملابس', 'خشب', 'بلاستيك', 'سيارات'],
    sprinkler_fire_area_m2: 1115,
    sprinkler_total_area_m2: 2230,
    notes: [
      'إنذار للمباني من دورين فأكثر أو عند تجاوز 500 شاغل في الطوابق غير الأرضية',
      'أقسام حريق بمعايرة 3 ساعات غالباً',
    ],
    sbc_refs: ['SBC-801-OCC-IND-M', 'SBC-801-SPR', 'SBC-801-ALM'],
  },
  industrial_low: {
    code: 'industrial_low',
    label_ar: 'صناعي منخفض الخطورة',
    risk: 'moderate',
    examples: ['طوب', 'سيراميك', 'ثلج', 'جبس', 'زجاج'],
    sbc_refs: ['SBC-801-OCC-IND-L'],
  },
  high_hazard: {
    code: 'high_hazard',
    label_ar: 'عالي الخطورة',
    risk: 'very_high',
    examples: ['مواد كيميائية خطرة', 'سوائل قابلة للاشتعال بكميات عالية'],
    sprinkler_always: true,
    alarm_always: true,
    notes: ['مرشات وإنذار إلزاميان', 'أقسام حريق بمعايرة 4 ساعات'],
    sbc_refs: ['SBC-801-OCC-HH', 'SBC-801-Ch50+'],
  },
  institutional: {
    code: 'institutional',
    label_ar: 'رعاية / مؤسسات',
    risk: 'high',
    examples: ['مستشفيات', 'سجون', 'دور رعاية'],
    sprinkler_always: true,
    alarm_always: true,
    detection_required: true,
    sbc_refs: ['SBC-801-OCC-INS', 'SBC-201-407', 'SBC-201-408'],
  },
  residential: {
    code: 'residential',
    label_ar: 'سكني / فندقي',
    risk: 'moderate',
    examples: ['شقق', 'فنادق', 'مفروشات', 'مهاجع عمال'],
    sprinkler_always: true,
    alarm_always: true,
    detection_required: true,
    notes: ['فصل الوحدات السكنية بجدران مقاومة ساعتين عن باقي المبنى'],
    sbc_refs: ['SBC-801-OCC-RES', 'SBC-201-420', 'SBC-801-SPR', 'SBC-801-ALM'],
  },
  storage_moderate: {
    code: 'storage_moderate',
    label_ar: 'تخزين متوسط الخطورة',
    risk: 'high',
    examples: ['ملابس', 'أثاث', 'ورق', 'سيارات', 'حبوب'],
    sprinkler_fire_area_m2: 1115,
    sprinkler_total_area_m2: 2230,
    sbc_refs: ['SBC-801-OCC-ST-M', 'SBC-801-SPR'],
  },
  storage_low: {
    code: 'storage_low',
    label_ar: 'تخزين منخفض الخطورة',
    risk: 'low',
    examples: ['زجاج', 'أسمنت', 'مواد غذائية', 'بورسلين'],
    sbc_refs: ['SBC-801-OCC-ST-L'],
  },
  parking: {
    code: 'parking',
    label_ar: 'مواقف سيارات',
    risk: 'moderate',
    examples: ['مواقف مقفلة', 'مواقف تحت إشغال آخر'],
    sprinkler_always: true,
    notes: ['تهوية تغيير هواء 10 مرات/ساعة للمواقف المقفلة', 'فصل عن المبنى بجدران ساعتين'],
    sbc_refs: ['SBC-801-OCC-PKG', 'SBC-201-406', 'SBC-801-SPR'],
  },
  special_fuel: {
    code: 'special_fuel',
    label_ar: 'محطات محروقات (استخدام خاص)',
    risk: 'very_high',
    examples: ['محطات وقود'],
    sprinkler_always: true,
    alarm_always: true,
    notes: ['SBC 801 Chapter 23 — استخدامات خاصة'],
    sbc_refs: ['SBC-801-Ch23', 'CA-CD-FUEL'],
  },
};

/** استخدامات خاصة من خريطة SBC 801 */
export const SBC_SPECIAL_USES: { chapter: string; label_ar: string }[] = [
  { chapter: '20', label_ar: 'مرافق الطيران' },
  { chapter: '22', label_ar: 'نواتج الغبار' },
  { chapter: '23', label_ar: 'محطات المحروقات' },
  { chapter: '28', label_ar: 'المناجر ومصانع الأخشاب' },
  { chapter: '29', label_ar: 'مصانع الدهانات' },
  { chapter: '30', label_ar: 'الأفران الصناعية' },
  { chapter: '32', label_ar: 'التخزين العالي' },
  { chapter: '34', label_ar: 'تخزين وتدوير الإطارات' },
];

/** قواعد هيكلية/أدوار مبسطة من الموجز */
export const SBC_STRUCTURE_RULES = {
  high_rise_floor_height_m: 23,
  standpipe_height_m: 9,
  stair_2h_above_floors: 3,
  type_ia_floors_range: [2, 3] as const,
  type_ib_above_floors: 3,
};

export const RISK_LABEL_AR: Record<SbcRiskLevel, string> = {
  low: 'منخفض',
  moderate: 'متوسط',
  high: 'عالٍ',
  very_high: 'عالٍ جداً',
};
