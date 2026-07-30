import type { SbcOccupancyCode, SbcRiskLevel } from '@/lib/constants/sbc801';

/** أنظمة إطفاء مخصصة — يُختار تلقائياً حسب نوع المنطقة/التخزين */
export type SuppressionSystemDef = {
  id: string;
  label: string;
  short: string;
  /** هل يُعد نظاماً خاصاً (غير الرش المائي العام) */
  is_special: boolean;
};

export const SUPPRESSION_SYSTEMS: SuppressionSystemDef[] = [
  { id: 'wet_sprinkler', label: 'مرشات مائية (Wet Sprinkler)', short: 'مرشات مائية', is_special: false },
  { id: 'esfr', label: 'مرشات ESFR للتخزين العالي', short: 'ESFR', is_special: false },
  { id: 'dry_sprinkler', label: 'مرشات جافة (Dry) للمناطق الباردة/المفتوحة', short: 'مرشات جافة', is_special: false },
  { id: 'preaction', label: 'نظام Pre-Action للأصول الحساسة', short: 'Pre-Action', is_special: true },
  { id: 'clean_agent', label: 'عامل نظيف (Clean Agent)', short: 'عامل نظيف', is_special: true },
  { id: 'co2', label: 'ثاني أكسيد الكربون CO₂ (فراغات غير مأهولة)', short: 'CO₂', is_special: true },
  { id: 'foam', label: 'رغوة (Foam) للسوائل القابلة للاشتعال', short: 'رغوة', is_special: true },
  { id: 'wet_chemical', label: 'نظام رطب كيميائي لأغطية المطابخ', short: 'Wet Chemical', is_special: true },
  { id: 'water_mist', label: 'رذاذ ماء (Water Mist)', short: 'رذاذ ماء', is_special: true },
  { id: 'portable_only', label: 'طفايات يدوية مساندة فقط (حسب التقييم)', short: 'طفايات', is_special: false },
];

export function getSuppression(id?: string | null): SuppressionSystemDef {
  return SUPPRESSION_SYSTEMS.find((s) => s.id === id) || SUPPRESSION_SYSTEMS[0];
}

export type ZoneSubtypeDef = {
  id: string;
  label: string;
  /** تجاوز تصنيف الإشغال إن لزم */
  occupancy?: SbcOccupancyCode;
  risk?: SbcRiskLevel;
  default_suppression: string;
  /** خيارات إضافية يختار منها المهندس */
  optionChoices: string[];
  notes?: string;
};

export type ZoneUseDef = {
  id: string;
  label: string;
  occupancy: SbcOccupancyCode;
  occupant_load_factor_m2?: number;
  notes?: string;
  /** أنواع فرعية (تخزين / مصنع / ورشة…) */
  subtypes: ZoneSubtypeDef[];
  /** خيارات عامة للمنطقة حتى بدون نوع فرعي */
  optionChoices: string[];
  default_suppression: string;
};

export const ZONE_USE_OPTIONS: ZoneUseDef[] = [
  {
    id: 'offices',
    label: 'مكاتب / إداري',
    occupancy: 'business',
    occupant_load_factor_m2: 9.3,
    default_suppression: 'wet_sprinkler',
    optionChoices: [
      'مكاتب مفتوحة',
      'مكاتب مغلقة / حجرات',
      'قاعة اجتماعات',
      'أرشيف ورقي ملحق',
    ],
    subtypes: [
      {
        id: 'open_office',
        label: 'مكاتب مفتوحة',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['كثافة شاغلين متوسطة', 'مسارات هروب واضحة'],
      },
      {
        id: 'closed_office',
        label: 'مكاتب مغلقة',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['أبواب مقاومة عند اللزوم', 'كشف دخان مناسب'],
      },
      {
        id: 'meeting',
        label: 'قاعات اجتماعات',
        occupancy: 'assembly',
        risk: 'moderate',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['مراجعة حمل الإشغال', 'مخارج إضافية إن لزم'],
      },
    ],
  },
  {
    id: 'retail',
    label: 'محلات / تجاري',
    occupancy: 'mercantile',
    occupant_load_factor_m2: 5.6,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['بيع بالتجزئة', 'صيدلية', 'سوبرماركت صغير', 'محلات متعددة'],
    subtypes: [
      { id: 'shop', label: 'محل تجزئة', default_suppression: 'wet_sprinkler', optionChoices: ['عرض بضائع', 'تخزين خلفي محدود'] },
      { id: 'pharmacy', label: 'صيدلية', default_suppression: 'wet_sprinkler', optionChoices: ['فصل مواد خاصة إن وجدت'] },
      { id: 'supermarket', label: 'سوبرماركت', default_suppression: 'wet_sprinkler', optionChoices: ['مراجعة عتبة المرشات حسب المساحة'] },
    ],
  },
  {
    id: 'showroom',
    label: 'معرض / صالة عرض',
    occupancy: 'mercantile',
    occupant_load_factor_m2: 5.6,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['سيارات', 'أثاث', 'أجهزة', 'معرض متعدد'],
    subtypes: [
      { id: 'car_show', label: 'معرض سيارات', default_suppression: 'wet_sprinkler', optionChoices: ['فصل ورشة الصيانة إن وجدت'] },
      { id: 'furniture_show', label: 'معرض أثاث', default_suppression: 'wet_sprinkler', optionChoices: ['حمل حريق متوسط'] },
      { id: 'electronics_show', label: 'معرض أجهزة', default_suppression: 'wet_sprinkler', optionChoices: ['حماية الأصول الإلكترونية عند اللزوم'] },
    ],
  },
  {
    id: 'seating',
    label: 'منطقة جلوس / استقبال',
    occupancy: 'assembly',
    occupant_load_factor_m2: 1.4,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['استقبال', 'انتظار', 'صالة جلوس عامة'],
    subtypes: [
      { id: 'lobby', label: 'استقبال / لوبي', default_suppression: 'wet_sprinkler', optionChoices: ['لوحة إنذار ظاهرة'] },
      { id: 'waiting', label: 'انتظار', default_suppression: 'wet_sprinkler', optionChoices: ['مراجعة حمل الإشغال'] },
    ],
  },
  {
    id: 'restaurant',
    label: 'مطعم / مقهى',
    occupancy: 'assembly',
    occupant_load_factor_m2: 1.4,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['صالة طعام', 'مقهى', 'خدمة سريعة'],
    subtypes: [
      { id: 'dining', label: 'صالة طعام', default_suppression: 'wet_sprinkler', optionChoices: ['عتبة 300 شاغل للمرشات'] },
      { id: 'cafe', label: 'مقهى', default_suppression: 'wet_sprinkler', optionChoices: ['معدات حرارية محدودة'] },
    ],
  },
  {
    id: 'storage',
    label: 'مخزن',
    occupancy: 'storage_moderate',
    occupant_load_factor_m2: 27.9,
    default_suppression: 'wet_sprinkler',
    notes: 'بعد اختيار المخزن حدّد نوع التخزين؛ نظام الإطفاء يُقترح تلقائياً',
    optionChoices: [
      'تخزين أرضي',
      'تخزين على رفوف',
      'تخزين عالٍ',
      'فصل عن الإشغالات الأخرى',
    ],
    subtypes: [
      {
        id: 'clothes',
        label: 'ملابس / منسوجات',
        occupancy: 'storage_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['ارتفاع تخزين محدود', 'ممرات واضحة تحت الرشاشات', 'كثافة رش مناسبة للملابس'],
      },
      {
        id: 'furniture',
        label: 'أثاث / خشب مصنّع',
        occupancy: 'storage_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['منع حجب الرشاشات', 'فصل عن مصادر الاشتعال'],
      },
      {
        id: 'paper',
        label: 'ورق / كرتون / أرشيف',
        occupancy: 'storage_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['خلايا فصل عند اللزوم', 'مراقبة رطوبة/حرارة'],
      },
      {
        id: 'food_low',
        label: 'مواد غذائية / غير قابلة للاشتعال نسبياً',
        occupancy: 'storage_low',
        risk: 'low',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['تغليف غير قابل للاشتعال غالباً', 'مراجعة إن وُجدت عبوات بلاستيكية كثيفة'],
      },
      {
        id: 'cars_parts',
        label: 'قطع غيار / إطارات',
        occupancy: 'storage_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['تخزين إطارات بضوابط خاصة', 'مراجعة كثافة الرش'],
        notes: 'تخزين الإطارات قد يتطلب اشتراطات خاصة',
      },
      {
        id: 'high_rack',
        label: 'تخزين عالٍ (High-Piled / رفوف عالية)',
        occupancy: 'storage_moderate',
        risk: 'high',
        default_suppression: 'esfr',
        optionChoices: ['تصنيف ارتفاع التخزين', 'ESFR أو كثافة معتمدة', 'عدم تجاوز حد الارتفاع تحت الرؤوس'],
        notes: 'غالباً ESFR أو تصميم كثافة خاص',
      },
      {
        id: 'flammable_liquids',
        label: 'سوائل قابلة للاشتعال',
        occupancy: 'high_hazard',
        risk: 'very_high',
        default_suppression: 'foam',
        optionChoices: ['حاجز انسكاب', 'تهوية', 'فصل عن باقي التخزين', 'SDS للمواد'],
      },
      {
        id: 'chemicals',
        label: 'كيماويات',
        occupancy: 'high_hazard',
        risk: 'very_high',
        default_suppression: 'foam',
        optionChoices: ['مصفوفة توافق المواد', 'عامل إطفاء حسب SDS', 'فصل أحماض/قواعد/مؤكسدات'],
      },
      {
        id: 'general_moderate',
        label: 'تخزين عام متوسط الخطورة',
        occupancy: 'storage_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['تصنيف السلعة', 'ارتفاع التخزين', 'طريقة الرص'],
      },
    ],
  },
  {
    id: 'factory',
    label: 'مصنع',
    occupancy: 'industrial_moderate',
    occupant_load_factor_m2: 9.3,
    default_suppression: 'wet_sprinkler',
    notes: 'حدّد نوع المصنع لضبط التصنيف ونظام الإطفاء',
    optionChoices: ['خطوط إنتاج', 'تخزين مواد أولية ملحق', 'فصل مناطق الخطر'],
    subtypes: [
      {
        id: 'food_factory',
        label: 'مصنع غذائي',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['زيوت/قلي إن وجد → نظام مطبخ', 'نظافة خطوط الإنتاج', 'مرشات للمناطق الصناعية'],
      },
      {
        id: 'textile_factory',
        label: 'مصنع ملابس / منسوجات',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['غبار ألياف', 'كشف مناسب', 'كثافة رش للمنسوجات'],
      },
      {
        id: 'wood_factory',
        label: 'مصنع خشب / نجارة صناعية',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['شفط غبار', 'منع تراكم نشارة', 'فصل التشطيب/الدهانات'],
      },
      {
        id: 'plastic_factory',
        label: 'مصنع بلاستيك',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['حمل حريق مرتفع', 'تهوية أبخرة', 'مراجعة المواد الخام'],
      },
      {
        id: 'auto_factory',
        label: 'تصنيع / تجميع سيارات',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['خط طلاء منفصل', 'رغوة لمناطق السوائل إن وجدت'],
      },
      {
        id: 'paint_factory',
        label: 'مصنع دهانات / مذيبات',
        occupancy: 'high_hazard',
        risk: 'very_high',
        default_suppression: 'foam',
        optionChoices: ['تصنيف عالي الخطورة', 'تهوية انفجارية حسب التصميم', 'عامل إطفاء مناسب'],
      },
      {
        id: 'ceramics_low',
        label: 'طوب / سيراميك / زجاج (منخفض نسبياً)',
        occupancy: 'industrial_low',
        risk: 'moderate',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['حمل حريق منخفض للمواد', 'مراجعة مناطق التعبئة البلاستيكية'],
      },
      {
        id: 'general_factory',
        label: 'مصنع عام / متوسط الخطورة',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['إنذار متعدد الأدوار', 'أقسام حريق', 'مرشات حسب المساحة'],
      },
    ],
  },
  {
    id: 'workshop',
    label: 'ورشة',
    occupancy: 'industrial_moderate',
    occupant_load_factor_m2: 9.3,
    default_suppression: 'wet_sprinkler',
    notes: 'حدّد نوع الورشة',
    optionChoices: ['أعمال ساخنة بتصريح', 'طفايات مناسبة', 'فصل التخزين'],
    subtypes: [
      {
        id: 'carpentry',
        label: 'ورشة نجارة',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['شفط نشارة', 'منع التراكم', 'أعمال ساخنة مضبوطة'],
      },
      {
        id: 'auto_repair',
        label: 'ورشة صيانة سيارات',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['زيوت ووقود بكميات محدودة', 'تهوية', 'طفايات فئة B'],
      },
      {
        id: 'welding',
        label: 'ورشة لحام / حدادة',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['تصاريح أعمال ساخنة', 'إبعاد المواد القابلة للاشتعال', 'طفايات مناسبة'],
      },
      {
        id: 'paint_booth',
        label: 'ورشة دهان / كابينة رش',
        occupancy: 'high_hazard',
        risk: 'very_high',
        default_suppression: 'foam',
        optionChoices: ['تهوية معتمدة', 'منع مصادر اشتعال', 'نظام إطفاء للكابينة'],
      },
      {
        id: 'electrical_shop',
        label: 'ورشة كهرباء / لوحات',
        occupancy: 'industrial_moderate',
        risk: 'moderate',
        default_suppression: 'clean_agent',
        optionChoices: ['حماية اللوحات الحساسة', 'CO₂ أو عامل نظيف حسب الفراغ'],
      },
      {
        id: 'general_workshop',
        label: 'ورشة عامة',
        occupancy: 'industrial_moderate',
        risk: 'high',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['تصنيف الأدوات والمواد', 'مسارات هروب خالية'],
      },
    ],
  },
  {
    id: 'parking',
    label: 'مواقف سيارات',
    occupancy: 'parking',
    occupant_load_factor_m2: 19,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['موقف مقفل', 'موقف مفتوح', 'تحت إشغال آخر'],
    subtypes: [
      {
        id: 'closed_parking',
        label: 'مواقف مقفلة',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['تهوية 10 تغيرات/ساعة', 'مرشات إلزامية', 'فصل بجدران ساعتين'],
      },
      {
        id: 'open_parking',
        label: 'مواقف مفتوحة / شبه مفتوحة',
        default_suppression: 'wet_sprinkler',
        optionChoices: ['مراجعة اشتراط المرشات حسب التصنيف', 'وصول آليات الدفاع المدني'],
      },
    ],
  },
  {
    id: 'electrical',
    label: 'غرفة كهرباء',
    occupancy: 'high_hazard',
    default_suppression: 'clean_agent',
    notes: 'نظام إطفاء خاص غالباً',
    optionChoices: ['محولات', 'لوحات رئيسية', 'UPS'],
    subtypes: [
      { id: 'transformer', label: 'غرفة محولات', default_suppression: 'co2', optionChoices: ['فراغ غير مأهول غالباً', 'إنذار قبل الصرف'] },
      { id: 'main_panel', label: 'لوحة رئيسية', default_suppression: 'clean_agent', optionChoices: ['عامل نظيف أو CO₂ حسب التصميم'] },
      { id: 'ups_room', label: 'غرفة UPS / بطاريات', default_suppression: 'clean_agent', optionChoices: ['كشف حراري/دخان مناسب', 'إجراءات بطاريات الليثيوم إن وجدت'] },
    ],
  },
  {
    id: 'data_room',
    label: 'غرفة بيانات / سيرفر',
    occupancy: 'high_hazard',
    default_suppression: 'clean_agent',
    optionChoices: ['إحكام الغرفة', 'إنذار قبل الصرف', 'كشف مبكر'],
    subtypes: [
      { id: 'server', label: 'غرفة سيرفر', default_suppression: 'clean_agent', optionChoices: ['Clean Agent', 'اختبار إحكام'] },
      { id: 'network', label: 'غرفة شبكات', default_suppression: 'clean_agent', optionChoices: ['Pre-Action مائي كبديل معتمد أحياناً'] },
    ],
  },
  {
    id: 'kitchen',
    label: 'مطبخ',
    occupancy: 'assembly',
    default_suppression: 'wet_chemical',
    optionChoices: ['قلي', 'شواية', 'تحضير فقط'],
    subtypes: [
      { id: 'fryer', label: 'مطبخ قلي / تجاري', default_suppression: 'wet_chemical', optionChoices: ['نظام غطاء مرتبط بفصل الحرارة', 'تنظيف شفاطات دوري'] },
      { id: 'prep', label: 'تحضير دون قلي', default_suppression: 'wet_sprinkler', optionChoices: ['طفايات مناسبة', 'مرشات عامة'] },
    ],
  },
  {
    id: 'clinic',
    label: 'عيادة / صحي',
    occupancy: 'business',
    occupant_load_factor_m2: 9.3,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['عيادات خارجية', 'مختبر صغير', 'أشعة'],
    subtypes: [
      { id: 'outpatient', label: 'عيادات خارجية', default_suppression: 'wet_sprinkler', optionChoices: ['إخلاء المرضى بمساعدة'] },
      { id: 'lab', label: 'مختبر', occupancy: 'high_hazard', risk: 'high', default_suppression: 'clean_agent', optionChoices: ['مواد كيميائية محدودة', 'SDS'] },
    ],
  },
  {
    id: 'club',
    label: 'نادي / رياضي',
    occupancy: 'assembly',
    occupant_load_factor_m2: 1.4,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['صالة رياضية', 'غرفة ملابس', 'مسبح ملحق'],
    subtypes: [
      { id: 'gym', label: 'صالة رياضية', default_suppression: 'wet_sprinkler', optionChoices: ['حمل إشغال مرتفع'] },
      { id: 'locker', label: 'غرف تبديل', default_suppression: 'wet_sprinkler', optionChoices: ['كشف مناسب للرطوبة'] },
    ],
  },
  {
    id: 'residential',
    label: 'سكني / غرف',
    occupancy: 'residential',
    occupant_load_factor_m2: 18.6,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['شقق', 'غرف فندقية', 'مهاجع'],
    subtypes: [
      { id: 'apartments', label: 'شقق', default_suppression: 'wet_sprinkler', optionChoices: ['مرشات وإنذار إلزاميان غالباً', 'فواصل بين الوحدات'] },
      { id: 'hotel_rooms', label: 'غرف فندقية', default_suppression: 'wet_sprinkler', optionChoices: ['إنذار غرف', 'دهاليز محمية'] },
      { id: 'dorms', label: 'مهاجع عمال', default_suppression: 'wet_sprinkler', optionChoices: ['كثافة شاغلين', 'مخارج كافية'] },
    ],
  },
  {
    id: 'educational',
    label: 'تعليمي / فصول',
    occupancy: 'educational',
    occupant_load_factor_m2: 1.9,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['فصول', 'مختبرات مدرسية', 'مكتبة'],
    subtypes: [
      { id: 'classroom', label: 'فصول دراسية', default_suppression: 'wet_sprinkler', optionChoices: ['إنذار مبكر', 'مخارج واضحة'] },
      { id: 'school_lab', label: 'مختبر مدرسي', occupancy: 'educational', risk: 'moderate', default_suppression: 'wet_sprinkler', optionChoices: ['مواد محدودة', 'تهوية'] },
    ],
  },
  {
    id: 'corridor',
    label: 'ممرات / خدمات',
    occupancy: 'business',
    occupant_load_factor_m2: 9.3,
    default_suppression: 'wet_sprinkler',
    optionChoices: ['ممر هروب', 'خدمات', 'سلم'],
    subtypes: [
      { id: 'egress', label: 'ممر هروب', default_suppression: 'wet_sprinkler', optionChoices: ['خالٍ من العوائق', 'إنارة طوارئ'] },
      { id: 'service', label: 'منطقة خدمات', default_suppression: 'wet_sprinkler', optionChoices: ['فصل عن المخازن'] },
    ],
  },
  {
    id: 'custom',
    label: 'أخرى (مخصص)',
    occupancy: 'business',
    default_suppression: 'wet_sprinkler',
    optionChoices: ['وصف مخصص من المهندس', 'مراجعة يدوية للتصنيف'],
    subtypes: [
      { id: 'custom_general', label: 'استخدام مخصص', default_suppression: 'wet_sprinkler', optionChoices: ['تحديد الإشغال يدوياً عبر الخيارات'] },
    ],
  },
];

export function getZoneUse(id: string | undefined | null): ZoneUseDef {
  if (id === 'industrial') {
    return ZONE_USE_OPTIONS.find((z) => z.id === 'factory') || ZONE_USE_OPTIONS[0];
  }
  return ZONE_USE_OPTIONS.find((z) => z.id === id) || ZONE_USE_OPTIONS[ZONE_USE_OPTIONS.length - 1];
}

export function getZoneSubtype(useId: string | undefined | null, subtypeId?: string | null): ZoneSubtypeDef | null {
  const use = getZoneUse(useId);
  if (!use.subtypes.length) return null;
  return use.subtypes.find((s) => s.id === subtypeId) || use.subtypes[0];
}

export function defaultZoneUseForActivity(activityType?: string | null): string {
  switch (activityType) {
    case 'gas_station':
      return 'parking';
    case 'restaurant':
      return 'restaurant';
    case 'warehouse':
      return 'storage';
    case 'factory':
      return 'factory';
    case 'office':
      return 'offices';
    case 'school':
      return 'educational';
    case 'parking':
      return 'parking';
    case 'residential_building':
    case 'hotel':
      return 'residential';
    case 'commercial_complex':
      return 'retail';
    default:
      return 'offices';
  }
}

/** خيارات المهندس المدمجة (عامة + نوع فرعي) */
export function zoneOptionChoices(useId: string, subtypeId?: string | null): string[] {
  const use = getZoneUse(useId);
  const subtype = getZoneSubtype(useId, subtypeId);
  const merged = [...use.optionChoices, ...(subtype?.optionChoices || [])];
  return [...new Set(merged)];
}
