/** Engineering Report Generation Engine — domain types */

export type ReportLocale = 'ar' | 'en';

export type EngineeringStudySectionId =
  | 'cover'
  | 'toc'
  | 'introduction'
  | 'project_description'
  | 'owner_information'
  | 'building_information'
  | 'site_information'
  | 'applicable_codes'
  | 'occupancy_classification'
  | 'hazard_classification'
  | 'means_of_egress'
  | 'fire_truck_access'
  | 'fire_water_supply'
  | 'fire_pump_analysis'
  | 'water_tank_analysis'
  | 'sprinkler_system'
  | 'hose_reel_study'
  | 'portable_extinguishers'
  | 'fire_alarm_study'
  | 'voice_evacuation'
  | 'emergency_lighting'
  | 'exit_signs'
  | 'smoke_control'
  | 'mechanical_ventilation'
  | 'electrical_safety'
  | 'emergency_power'
  | 'civil_defense_requirements'
  | 'engineering_compliance_review'
  | 'summary'
  | 'engineering_recommendations'
  | 'conclusion';

export type EngineeringStudyParagraph = {
  text: string;
  /** Code / EKB references validated against Knowledge Base */
  citations: string[];
  incomplete?: boolean;
};

export type EngineeringStudyImage = {
  src: string;
  caption_ar: string;
  caption_en: string;
};

export type EngineeringStudySection = {
  id: EngineeringStudySectionId;
  number: number;
  title_ar: string;
  title_en: string;
  paragraphs: EngineeringStudyParagraph[];
  /** Embedded photos (site / system items / subsection proofs) — rendered in print HTML */
  images?: EngineeringStudyImage[];
  /** Tables rendered as HTML rows (optional) */
  tables?: {
    caption_ar: string;
    caption_en: string;
    headers_ar: string[];
    headers_en: string[];
    rows: string[][];
  }[];
};

export type EngineeringStudyDocument = {
  locale: ReportLocale;
  title_ar: string;
  title_en: string;
  generated_at: string;
  report_number: string;
  report_date: string;
  project_name: string;
  client_code: string;
  /** Cover / page-1 project facade */
  cover_image?: EngineeringStudyImage | null;
  sections: EngineeringStudySection[];
  rules_gate_ok: boolean;
  rules_summary_ar: string;
  rules_summary_en: string;
  missing_inputs: string[];
};

export const MISSING_SECTION_AR =
  'يلزم استكمال معلومات هندسية إضافية قبل إتمام هذا القسم.';
export const MISSING_SECTION_EN =
  'Additional engineering information is required before completing this section.';
