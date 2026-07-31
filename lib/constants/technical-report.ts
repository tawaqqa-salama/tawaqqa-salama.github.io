/** كتالوج التقرير الفني — العناوين الرئيسية ثابتة، والفرعية اختيارات للمهندس */

export type TechReportChapterId =
  | 'facility'
  | 'firefighting'
  | 'ventilation'
  | 'alarm'
  | 'exits'
  | 'recommendations';

export type TechReportItemCatalog = {
  id: string;
  chapter: Exclude<TechReportChapterId, 'facility' | 'recommendations'>;
  title: string;
  /** خيارات فرعية يختار منها المهندس (تظهر في التقرير إن اختيرت) */
  optionChoices: string[];
  /** نص افتراضي مساعد يمكن للمهندس تعديله */
  defaultNotes?: string;
};

export const TECH_REPORT_CHAPTERS: { id: TechReportChapterId; title: string; color: string }[] = [
  { id: 'facility', title: 'الباب الأول: عن المنشأة', color: '#c0392b' },
  { id: 'firefighting', title: 'مكافحة الحريق', color: '#1f4d3a' },
  { id: 'ventilation', title: 'التهوية الميكانيكية', color: '#1f4d3a' },
  { id: 'alarm', title: 'الإنذار المبكر', color: '#1f4d3a' },
  { id: 'exits', title: 'مخارج الهروب', color: '#1f4d3a' },
  { id: 'recommendations', title: 'التوصيات العامة', color: '#1f4d3a' },
];

export const TECH_REPORT_ITEMS: TechReportItemCatalog[] = [
  {
    id: 'ff_pumps',
    chapter: 'firefighting',
    title: 'مضخات الحريق',
    defaultNotes: '',
    optionChoices: [
      'مضخة رئيسية: قدرة وضغط وفق الحساب الهيدروليكي',
      'مضخة ديزل / كهرباء حسب الاعتماد',
      'مضخة جوكي (Jockey) للمحافظة على الضغط',
      'غرفة مضخات محمية ومعتمدة',
      'ربط المضخات بلوحة التحكم والإنذار',
    ],
  },
  {
    id: 'ff_water',
    chapter: 'firefighting',
    title: 'مصدر الإمداد بالماء',
    defaultNotes: '',
    optionChoices: [
      'خزان إطفاء بسعة تغطي مدة التشغيل المطلوبة',
      'مادة التخزين: خرسانة / صلب معتمد',
      'خزان أرضي معتمد لمياه الإطفاء',
      'خزان علوي احتياطي إن لزم',
      'ضمان استمرارية الإمداد أثناء الطوارئ',
    ],
  },
  {
    id: 'ff_cabinets',
    chapter: 'firefighting',
    title: 'صناديق الحريق',
    optionChoices: [
      'توزيع صناديق حريق حسب المخططات المعتمدة',
      'توفير بكرات خراطيم وطفايات مساندة داخل الصناديق',
      'وضع لوحات إرشادية واضحة على الصناديق',
    ],
  },
  {
    id: 'ff_piping',
    chapter: 'firefighting',
    title: 'شبكة الأنابيب والرش',
    optionChoices: [
      'تنفيذ شبكة أنابيب حسب التصاميم الهيدروليكية',
      'تركيب مرشات حريق (Sprinklers) في الفراغات المطلوبة',
      'استخدام مواد وأنابيب معتمدة غير قابلة للاشتعال',
    ],
  },
  {
    id: 'ff_cd_connections',
    chapter: 'firefighting',
    title: 'وصلات الدفاع المدني',
    optionChoices: [
      'توفير وصلات دفاع مدني في موقع يسهل الوصول إليه',
      'وضع لوحات إرشادية لوصلات الدفاع المدني',
      'ضمان خلو المسار المؤدي للوصلات من العوائق',
    ],
  },
  {
    id: 'ff_cd_parking',
    chapter: 'firefighting',
    title: 'مواقف الدفاع المدني',
    optionChoices: [
      'تخصيص موقف لآليات الدفاع المدني أمام المبنى',
      'إبقاء الموقف خالياً بشكل دائم مع لوحات منع الوقوف',
    ],
  },
  {
    id: 'ff_special',
    chapter: 'firefighting',
    title: 'أنظمة الإطفاء الخاصة',
    optionChoices: [
      'نظام إطفاء خاص لغرفة الكهرباء/المحولات إن وجدت',
      'نظام إطفاء خاص لغرف البيانات أو المطابخ حسب النشاط',
      'نظام رغوة لمناطق السوائل القابلة للاشتعال',
      'نظام Wet Chemical لأغطية القلي',
      'عامل نظيف (Clean Agent) للفراغات الحساسة',
      'تنفيذ أنظمة الإطفاء الخاصة وفق المناطق المحددة في التقرير',
    ],
  },
  {
    id: 'ff_extinguishers',
    chapter: 'firefighting',
    title: 'أنظمة طفايات الحريق اليدوية',
    optionChoices: [
      'توزيع طفايات يدوية مناسبة لنوع المخاطر',
      'صيانة دورية وتعبئة الطفايات مع بطاقة متابعة',
    ],
  },
  {
    id: 'vent_main',
    chapter: 'ventilation',
    title: 'أنظمة التهوية الميكانيكية',
    optionChoices: [
      'تهوية ميكانيكية للفراغات المغلقة حسب الكود',
      'نظام شفط دخان للسلالم أو الممرات عند الاشتراط',
      'ضمان عمل التهوية عند الإنذار والإطفاء حسب التصميم',
    ],
  },
  {
    id: 'al_panel',
    chapter: 'alarm',
    title: 'لوحة التحكم الرئيسية',
    optionChoices: [
      'تركيب لوحة إنذار رئيسية في مكان مأهول (الاستقبال/الحراسة)',
      'ربط اللوحة بأنظمة الإطفاء الخاصة والتهوية',
      'توفير تغذية كهربائية احتياطية للوحة',
    ],
  },
  {
    id: 'al_detectors',
    chapter: 'alarm',
    title: 'كواشف الدخان وكواشف الحرارة',
    optionChoices: [
      'توزيع كواشف الدخان وفق المخططات',
      'توزيع كواشف الحرارة في المواقع المناسبة',
      'الالتزام بمسافات التغطية المعتمدة',
    ],
  },
  {
    id: 'al_breakglass',
    chapter: 'alarm',
    title: 'الكواسر الزجاجية',
    optionChoices: [
      'توفير كواسر زجاجية بعدد كافٍ حسب المخططات',
      'تركيبها على ارتفاع ومواقع يسهل الوصول إليها',
    ],
  },
  {
    id: 'al_bells',
    chapter: 'alarm',
    title: 'أجراس الإنذار',
    optionChoices: [
      'توفير أجراس/صافرات إنذار بعدد كافٍ',
      'ضمان سماع الإنذار في جميع الفراغات',
    ],
  },
  {
    id: 'al_emergency_lights',
    chapter: 'alarm',
    title: 'كشافات الطوارئ',
    optionChoices: [
      'توفير كشافات طوارئ على مسارات الهروب',
      'ضمان عمل الإنارة عند انقطاع التيار',
    ],
  },
  {
    id: 'al_signs',
    chapter: 'alarm',
    title: 'اللوحات الإرشادية',
    optionChoices: [
      'لوحات مخارج طوارئ مضيئة عند كل مخرج',
      'لوحات إرشادية ثنائية اللغة عند الحاجة',
    ],
  },
  {
    id: 'ex_routes',
    chapter: 'exits',
    title: 'مخارج ومسالك الهروب',
    optionChoices: [
      'تأمين عدد كافٍ من مخارج الطوارئ حسب الإشغال',
      'إبقاء مسارات الهروب خالية من العوائق',
      'أبواب تفتح باتجاه الهروب مع قضبان ذعر عند اللزوم',
      'توفير سلالم طوارئ محمية حسب تصنيف المبنى',
    ],
  },
];

/** توصيات عامة — اختيارات فقط وليست كتابة حرة */
export const TECH_REPORT_GENERAL_RECOMMENDATIONS: { id: string; label: string }[] = [
  {
    id: 'rec_detectors_signage',
    label: 'تزويد المشروع بالكواشف والكواسر والأجراس واللوحات الإرشادية حسب المخططات',
  },
  {
    id: 'rec_link_systems',
    label: 'ربط نظام الإطفاء بنظام الإنذار عن الحريق',
  },
  {
    id: 'rec_fire_cables',
    label: 'أن تكون أسلاك نظام الإنذار من مواد غير قابلة للاشتعال',
  },
  {
    id: 'rec_follow_design',
    label: 'الالتزام بالتنفيذ وفق التصاميم والمخططات المعتمدة بالكامل',
  },
  {
    id: 'rec_bilingual_signs',
    label: 'توفير لوحات تحذيرية ثنائية اللغة (مثل: ممنوع التدخين / خطر سريع الاشتعال)',
  },
  {
    id: 'rec_approved_contractor',
    label: 'أن يتم التنفيذ عبر مؤسسة معتمدة من الدفاع المدني',
  },
  {
    id: 'rec_approved_materials',
    label: 'أن تكون جميع المواد والأجزاء معتمدة من الدفاع المدني وهيئة المواصفات',
  },
  {
    id: 'rec_sbc_compliance',
    label: 'الالتزام بمتطلبات كود البناء السعودي (SBC) والأنظمة ذات العلاقة',
  },
  {
    id: 'rec_maintenance_plan',
    label: 'إعداد برنامج صيانة دورية لأنظمة السلامة بعد التشغيل',
  },
  {
    id: 'rec_training',
    label: 'تدريب العاملين على خطة الإخلاء واستخدام معدات الإطفاء الأولية',
  },
];

export const BUILDING_STATUS_OPTIONS = ['تحت الإنشاء', 'قائم', 'تشطيب', 'تشغيل'] as const;

export const STRUCTURE_OPTIONS = ['خرسانة + بلوك', 'خرسانة مسلحة', 'هيكلي معدني', 'أخرى'] as const;

export const STRUCTURAL_CLASS_OPTIONS = ['TYPE I A', 'TYPE I B', 'TYPE II A', 'TYPE II B', 'TYPE III', 'TYPE V'] as const;
