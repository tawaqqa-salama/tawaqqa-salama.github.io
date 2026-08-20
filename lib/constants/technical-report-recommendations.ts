import type {
  TechnicalRecommendationPriority,
  TechnicalRecommendationSourceType,
  TechnicalRecommendationTrigger,
} from '@/lib/types/project-reports';

/**
 * Phase 4C static recommendation manifest. Text is normalized only from the
 * existing technical-report catalogs; it is not a code-requirement catalog.
 */
export const TECHNICAL_RECOMMENDATION_LIBRARY_VERSION = '2026.08.20.1' as const;

export type TechnicalRecommendationDomain =
  | 'general_safety'
  | 'means_of_egress'
  | 'fire_department_access'
  | 'fire_department_parking'
  | 'fdc'
  | 'fire_pump'
  | 'fire_water_hose_cabinets'
  | 'portable_extinguishers'
  | 'special_suppression'
  | 'fire_alarm'
  | 'detectors'
  | 'alarm_notification'
  | 'emergency_lighting'
  | 'exit_signage'
  | 'electrical_safety'
  | 'maintenance'
  | 'inspection_testing';

export type TechnicalRecommendationProvenance = {
  source_type: TechnicalRecommendationSourceType;
  source_document_key: string;
  source_section: string;
  source_page?: number | null;
  source_text_marker: string;
};

export type RecommendationLibraryItem = {
  id: string;
  version: typeof TECHNICAL_RECOMMENDATION_LIBRARY_VERSION;
  text_ar: string;
  domain: TechnicalRecommendationDomain;
  activity_ids: readonly string[];
  occupancy_codes: readonly string[];
  hazard_classes: readonly string[];
  system_keys: readonly string[];
  condition_keys: readonly string[];
  trigger: TechnicalRecommendationTrigger;
  priority: TechnicalRecommendationPriority;
  active: boolean;
  source: TechnicalRecommendationProvenance;
};

const OFFICE_TEMPLATE = (source_section: string, source_text_marker: string): TechnicalRecommendationProvenance => ({
  source_type: 'office_template',
  source_document_key: 'technical-report-platform-catalog-v1',
  source_section,
  source_page: null,
  source_text_marker,
});

/**
 * Initial source-supported corpus. Do not add text here from general knowledge
 * or unverified standards. The absence of activity-specific content is reported
 * as a coverage gap rather than filled with invented recommendations.
 */
export const TECHNICAL_RECOMMENDATION_LIBRARY: readonly RecommendationLibraryItem[] = [
  {
    id: 'rec-lib-follow-approved-design',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'الالتزام بالتنفيذ وفق التصاميم والمخططات المعتمدة بالكامل.',
    domain: 'general_safety',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: [],
    trigger: 'data_based', priority: 'high', active: true,
    source: OFFICE_TEMPLATE('التوصيات العامة', 'rec_follow_design'),
  },
  {
    id: 'rec-lib-approved-contractor',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'تنفيذ الأعمال بواسطة جهة معتمدة من الدفاع المدني عند انطباق متطلبات المشروع.',
    domain: 'general_safety',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: [],
    trigger: 'manual_review', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('التوصيات العامة', 'rec_approved_contractor'),
  },
  {
    id: 'rec-lib-approved-materials',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'استخدام المواد والأجزاء المعتمدة بحسب متطلبات المشروع والجهات ذات العلاقة.',
    domain: 'general_safety',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: [],
    trigger: 'manual_review', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('التوصيات العامة', 'rec_approved_materials'),
  },
  {
    id: 'rec-lib-maintenance-plan',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'إعداد برنامج صيانة دورية لأنظمة السلامة بعد التشغيل.',
    domain: 'maintenance',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: [],
    trigger: 'manual_review', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('التوصيات العامة', 'rec_maintenance_plan'),
  },
  {
    id: 'rec-lib-evacuation-training',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'تدريب العاملين على خطة الإخلاء واستخدام معدات الإطفاء الأولية.',
    domain: 'general_safety',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: [],
    trigger: 'manual_review', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('التوصيات العامة', 'rec_training'),
  },
  {
    id: 'rec-lib-egress-obstruction',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'إبقاء مسارات الهروب خالية من العوائق.',
    domain: 'means_of_egress',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: ['obstructed'],
    trigger: 'observation_based', priority: 'high', active: true,
    source: OFFICE_TEMPLATE('مخارج ومسالك الهروب', 'ex_routes: إبقاء مسارات الهروب خالية من العوائق'),
  },
  {
    id: 'rec-lib-fdc-access',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'ضمان خلو المسار المؤدي إلى وصلات الدفاع المدني من العوائق.',
    domain: 'fdc',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: ['inaccessible'],
    trigger: 'observation_based', priority: 'high', active: true,
    source: OFFICE_TEMPLATE('وصلات الدفاع المدني', 'ff_cd_connections: ضمان خلو المسار المؤدي للوصلات من العوائق'),
  },
  {
    id: 'rec-lib-civil-defense-parking',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'إبقاء موقف آليات الدفاع المدني خالياً مع وضع لوحات منع الوقوف عند تخصيصه للمشروع.',
    domain: 'fire_department_parking',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: ['inaccessible'],
    trigger: 'observation_based', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('مواقف الدفاع المدني', 'ff_cd_parking: إبقاء الموقف خالياً بشكل دائم مع لوحات منع الوقوف'),
  },
  {
    id: 'rec-lib-alarm-system-link',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'ربط نظام الإطفاء بنظام الإنذار عن الحريق عند انطباقه على التصميم المعتمد.',
    domain: 'fire_alarm',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: ['fire_alarm', 'sprinkler'], condition_keys: [],
    trigger: 'data_based', priority: 'high', active: true,
    source: OFFICE_TEMPLATE('التوصيات العامة', 'rec_link_systems'),
  },
  {
    id: 'rec-lib-alarm-devices-and-signage',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'تزويد المشروع بالكواشف والكواسر والأجراس واللوحات الإرشادية حسب المخططات المعتمدة.',
    domain: 'fire_alarm',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: ['fire_alarm'], condition_keys: [],
    trigger: 'data_based', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('التوصيات العامة', 'rec_detectors_signage'),
  },
  {
    id: 'rec-lib-fire-resistant-alarm-cables',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'استخدام أسلاك نظام الإنذار من المواد غير القابلة للاشتعال وفق متطلبات المشروع.',
    domain: 'electrical_safety',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: ['fire_alarm'], condition_keys: [],
    trigger: 'manual_review', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('التوصيات العامة', 'rec_fire_cables'),
  },
  {
    id: 'rec-lib-emergency-directional-signage',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'توفير لوحات مخارج طوارئ مضيئة عند المخارج وفق المخططات المعتمدة.',
    domain: 'exit_signage',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: [],
    trigger: 'manual_review', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('اللوحات الإرشادية', 'al_signs: لوحات مخارج طوارئ مضيئة عند كل مخرج'),
  },
  {
    id: 'rec-lib-emergency-lighting',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'توفير كشافات طوارئ على مسارات الهروب وضمان عمل الإنارة عند انقطاع التيار وفق التصميم.',
    domain: 'emergency_lighting',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: [],
    trigger: 'manual_review', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('كشافات الطوارئ', 'al_emergency_lights: كشافات طوارئ على مسارات الهروب'),
  },
  {
    id: 'rec-lib-special-suppression-review',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'مراجعة الحاجة إلى نظام إطفاء خاص للفراغات ذات الاستخدامات الحساسة وفق النشاط والتصميم المعتمد.',
    domain: 'special_suppression',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: ['fm200', 'co2', 'kitchen_hood', 'clean_agent'], condition_keys: ['special_suppression_review'],
    trigger: 'manual_review', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('أنظمة الإطفاء الخاصة', 'ff_special: نظام إطفاء خاص لغرف البيانات أو المطابخ حسب النشاط'),
  },
  {
    id: 'rec-lib-portable-extinguisher-maintenance',
    version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
    text_ar: 'صيانة الطفايات اليدوية وتعبئتها دورياً مع بطاقة متابعة.',
    domain: 'portable_extinguishers',
    activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: ['fire_extinguisher'], condition_keys: ['maintenance_required'],
    trigger: 'observation_based', priority: 'medium', active: true,
    source: OFFICE_TEMPLATE('أنظمة طفايات الحريق اليدوية', 'ff_extinguishers: صيانة دورية وتعبئة الطفايات مع بطاقة متابعة'),
  },
] as const;

export const TECHNICAL_RECOMMENDATION_CONDITION_KEYS = [
  'obstructed',
  'maintenance_required',
  'inaccessible',
  'incorrect_location',
  'insufficient',
  'unverified',
  'random_storage',
  'signage_missing',
  'fire_resistance_review',
  'special_suppression_review',
] as const;
