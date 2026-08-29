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
  | 'building_requirements'
  | 'fire_resistance'
  | 'exterior_wall_protection'
  | 'special_hazard_areas'
  | 'occupant_load'
  | 'exit_capacity'
  | 'travel_distance'
  | 'fire_compartments'
  | 'occupancy_classification'
  | 'hazard_classification'
  | 'means_of_egress'
  | 'fire_truck_access'
  | 'mechanical_fire_safety'
  | 'electrical_fire_safety'
  | 'fire_water_supply'
  | 'fire_pump_analysis'
  | 'water_tank_analysis'
  | 'special_suppression'
  | 'sprinkler_system'
  | 'hose_reel_study'
  | 'portable_extinguishers'
  | 'fire_alarm_study'
  | 'fire_alarm_control_panel'
  | 'detection_devices'
  | 'alarm_devices'
  | 'voice_evacuation'
  | 'emergency_lighting'
  | 'exit_signs'
  | 'smoke_control'
  | 'mechanical_ventilation'
  | 'electrical_safety'
  | 'emergency_power'
  | 'civil_defense_requirements'
  | 'engineering_compliance_review'
  | 'site_access_evidence'
  | 'existing_condition_evidence'
  | 'safety_system_evidence'
  | 'code_evidence_references'
  | 'summary'
  | 'engineering_recommendations'
  | 'existing_recommendations'
  | 'conclusion'
  | 'facility_data'
  | 'project_components'
  | 'existing_assessment_site'
  | 'existing_assessment_firefighting'
  | 'existing_assessment_alarm'
  | 'existing_assessment_life_safety'
  | 'existing_assessment_electrical';

export type EngineeringStudyParagraph = {
  text: string;
  /** Code / EKB references validated against Knowledge Base */
  citations: string[];
  incomplete?: boolean;
};

export type ImageLayoutType = 'single' | 'double' | 'full_width' | 'gallery';

export type ImageType =
  | 'facade'
  | 'site'
  | 'site_map'
  | 'system'
  | 'code_proof'
  | 'drawing'
  | 'other';

export type EngineeringStudyImage = {
  src: string;
  caption_ar: string;
  caption_en: string;
  /** Stable id for placement engine */
  image_id?: string;
  /** Owning study section */
  section_id?: EngineeringStudySectionId;
  /** Technical-report item id (e.g. al_detectors) — binds image to subsection */
  item_id?: string;
  /** Sort key within section (1-based, global figure order source) */
  image_order?: number;
  /** Order of the subsection inside the parent section (1-based) */
  subsection_order?: number;
  image_type?: ImageType;
  layout_type?: ImageLayoutType;
  /** Print-only intrinsic media metadata; never persisted to project evidence. */
  intrinsic_width?: number | null;
  intrinsic_height?: number | null;
  aspect_ratio?: number | null;
  presentation_state?: 'ready' | 'tiny' | 'unavailable' | 'unmeasured';
  /** Sub-topic under the section (e.g. لوحة التحكم) — for in-flow placement */
  subsection_ar?: string;
  subsection_en?: string;
  /** Engineering description for this subsection (from options/notes — not a filename) */
  description_ar?: string;
  description_en?: string;
  /** Selected requirement phrases from the technical report item */
  selected_options?: string[];
  /** Free-text engineer notes for the item */
  item_notes?: string;
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
  /** Owner / client display name for cover */
  owner_name?: string;
  /** Prepared-by name for the official approval page. */
  prepared_by?: string;
  /** Executive office approval name for the official approval page. */
  executive_director?: string;
  /** Cover / page-1 project facade */
  cover_image?: EngineeringStudyImage | null;
  /** Unified location string for cover, facility table, and site pages. */
  location_display?: string;
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
