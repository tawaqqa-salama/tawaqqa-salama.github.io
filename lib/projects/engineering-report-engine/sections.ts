import type { EngineeringStudySectionId } from '@/lib/projects/engineering-report-engine/types';

/** Fixed professional structure — aligned with consultancy study layout (e.g. قاعة نسائم style). */
export const ENGINEERING_STUDY_SECTIONS: {
  id: EngineeringStudySectionId;
  number: number;
  title_ar: string;
  title_en: string;
  /** Skip body generation — structural pages */
  structural?: boolean;
}[] = [
  { id: 'cover', number: 1, title_ar: 'صفحة الغلاف', title_en: 'Cover Page', structural: true },
  { id: 'toc', number: 2, title_ar: 'فهرس المحتويات', title_en: 'Table of Contents', structural: true },
  { id: 'introduction', number: 3, title_ar: 'المقدمة', title_en: 'Introduction' },
  { id: 'project_description', number: 4, title_ar: 'وصف المشروع', title_en: 'Project Description' },
  { id: 'owner_information', number: 5, title_ar: 'بيانات المالك', title_en: 'Owner Information' },
  { id: 'building_information', number: 6, title_ar: 'بيانات المبنى', title_en: 'Building Information' },
  { id: 'site_information', number: 7, title_ar: 'بيانات الموقع', title_en: 'Site Information' },
  { id: 'applicable_codes', number: 8, title_ar: 'الكودات والمراجع المعتمدة', title_en: 'Applicable Codes' },
  {
    id: 'occupancy_classification',
    number: 9,
    title_ar: 'تصنيف الإشغال',
    title_en: 'Occupancy Classification',
  },
  {
    id: 'hazard_classification',
    number: 10,
    title_ar: 'تصنيف الخطورة',
    title_en: 'Hazard Classification',
  },
  { id: 'means_of_egress', number: 11, title_ar: 'دراسة مسالك الهروب', title_en: 'Means of Egress Study' },
  { id: 'fire_truck_access', number: 12, title_ar: 'وصول آليات الإطفاء', title_en: 'Fire Truck Access' },
  { id: 'fire_water_supply', number: 13, title_ar: 'إمداد مياه الإطفاء', title_en: 'Fire Water Supply' },
  { id: 'fire_pump_analysis', number: 14, title_ar: 'تحليل مضخات الحريق', title_en: 'Fire Pump Analysis' },
  { id: 'water_tank_analysis', number: 15, title_ar: 'تحليل خزان مياه الإطفاء', title_en: 'Water Tank Analysis' },
  { id: 'sprinkler_system', number: 16, title_ar: 'دراسة نظام المرشات', title_en: 'Sprinkler System Study' },
  { id: 'hose_reel_study', number: 17, title_ar: 'دراسة بكرات الخراطيم', title_en: 'Hose Reel Study' },
  {
    id: 'portable_extinguishers',
    number: 18,
    title_ar: 'دراسة الطفايات اليدوية',
    title_en: 'Portable Extinguishers Study',
  },
  { id: 'fire_alarm_study', number: 19, title_ar: 'دراسة نظام الإنذار', title_en: 'Fire Alarm Study' },
  { id: 'voice_evacuation', number: 20, title_ar: 'دراسة الإنذار الصوتي / الإخلاء', title_en: 'Voice Evacuation Study' },
  {
    id: 'emergency_lighting',
    number: 21,
    title_ar: 'دراسة الإنارة الطارئة',
    title_en: 'Emergency Lighting Study',
  },
  { id: 'exit_signs', number: 22, title_ar: 'دراسة لوحات مخارج الطوارئ', title_en: 'Exit Signs Study' },
  { id: 'smoke_control', number: 23, title_ar: 'التحكم بالدخان', title_en: 'Smoke Control' },
  {
    id: 'mechanical_ventilation',
    number: 24,
    title_ar: 'التهوية الميكانيكية',
    title_en: 'Mechanical Ventilation',
  },
  { id: 'electrical_safety', number: 25, title_ar: 'السلامة الكهربائية', title_en: 'Electrical Safety' },
  { id: 'emergency_power', number: 26, title_ar: 'الطاقة الاحتياطية للطوارئ', title_en: 'Emergency Power' },
  {
    id: 'civil_defense_requirements',
    number: 27,
    title_ar: 'متطلبات الدفاع المدني',
    title_en: 'Civil Defense Requirements',
  },
  {
    id: 'engineering_compliance_review',
    number: 28,
    title_ar: 'مراجعة الامتثال الهندسي',
    title_en: 'Engineering Compliance Review',
  },
  { id: 'summary', number: 29, title_ar: 'الملخص', title_en: 'Summary' },
  {
    id: 'engineering_recommendations',
    number: 30,
    title_ar: 'التوصيات الهندسية',
    title_en: 'Engineering Recommendations',
  },
  { id: 'conclusion', number: 31, title_ar: 'الخاتمة', title_en: 'Conclusion' },
];
