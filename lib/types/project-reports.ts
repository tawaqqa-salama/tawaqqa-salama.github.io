export interface ReportMeta {
  status: 'مسودة' | 'قيد الإعداد' | 'مكتمل' | 'معتمد';
  updated_at?: string | null;
}

/** Read-only snapshot derived from client record (marketing/sales). */
export interface BuildingPlanGeneralInfo {
  business_name: string;
  owner_name: string;
  activity_type_label: string;
  city: string;
  region: string;
  district: string;
  street: string;
  plot_number: string;
  land_area: string;
  building_area: string;
  floors_count: string;
  location_summary: string;
  national_address: string;
}

export type YesNoValue = 'نعم' | 'لا' | '';

/** Engineer-editable fields stored in project_engineering_data.building_plan */
export interface BuildingPlanReport extends ReportMeta {
  report_date?: string;
  building_permit_number?: string;

  occupancy_classification?: string;
  building_type_code?: string;
  sbc_requirements?: string;
  sbc_code_exceptions?: YesNoValue;

  high_rise_building?: YesNoValue;
  total_site_area_m2?: string;
  atrium_exists?: YesNoValue;
  floors_description?: string;
  underground_building?: YesNoValue;
  building_height_m?: string;
  windowless_building?: YesNoValue;
  basement_floors_count?: string;
  electrical_grounding?: YesNoValue;
  underground_depth_m?: string;
  lightning_protection?: YesNoValue;
  exits_count?: string;
  backup_generator?: YesNoValue;
  stairs_count?: string;
  escalators_count?: string;
  elevators_count?: string;
  special_rescue_team_required?: YesNoValue;

  fire_alarm_system?: YesNoValue;
  sprinkler_system?: YesNoValue;
  emergency_exits_doors?: string;

  plan_approval_status?: string;
  technical_inspection_notes?: string;

  office_name?: string;
  commercial_registration?: string;
  engineer_representative?: string;
  engineering_membership_no?: string;
  certification_date?: string;
}

export interface BoqLineItem {
  id: string;
  item: string;
  unit: string;
  quantity: number;
  unit_price: number;
}

export interface BoqReport extends ReportMeta {
  items: BoqLineItem[];
  total_amount?: number;
  notes?: string;
}

export interface TimelineMilestone {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
}

export interface TimelineReport extends ReportMeta {
  milestones: TimelineMilestone[];
  project_start?: string;
  project_end?: string;
  notes?: string;
}

export interface FieldVisitReport extends ReportMeta {
  visit_number: number;
  visit_date?: string;
  engineer_name?: string;
  location?: string;
  findings?: string;
  recommendations?: string;
  photos_note?: string;
  checklist?: { id: string; label: string; checked: boolean }[];
}

export interface TechnicalNotesReport extends ReportMeta {
  deficiencies: { id: string; description: string; severity: string; resolved: boolean }[];
  recommendations?: string;
  compliance_status?: string;
}

/** خيار نطاق أعمال نظام السلامة في خطاب التسليم */
export type SafetyScopeOption =
  | 'new_design'
  | 'modify_existing'
  | 'approve_existing'
  | 'not_required'
  | '';

export type SafetyScopeRow = {
  id: 'firefighting' | 'alarm' | 'smoke_control' | 'emergency_exits' | 'supervision_contract';
  label: string;
  option: SafetyScopeOption;
  /** عمود نعم / لا */
  applicable: 'نعم' | 'لا';
};

export interface EngineeringDeliveryReport extends ReportMeta {
  delivery_date?: string;
  /** الجهة المسلَّم إليها — مثال: الإدارة العامة للدفاع المدني بمحافظة ... */
  delivered_to?: string;
  /** صورة إلى: مركز السلامة / المالك */
  copy_to?: string;
  study_summary?: string;
  notes?: string;
  attachments_note?: string;
  attachments_count?: number | string;
  outgoing_number?: string;
  /** تاريخ هجري اختياري (نص) — يُولَّد تلقائياً إن تُرك فارغاً */
  hijri_date?: string;
  civil_defense_city?: string;
  /** رقم رخصة البناء المعروض في خطاب التسليم */
  building_permit_number?: string;
  safety_engineer_name?: string;
  safety_engineer_title?: string;
  safety_engineer_phone?: string;
  manager_name?: string;
  manager_title?: string;
  manager_phone?: string;
  /** مصفوفة نطاق أعمال أنظمة السلامة */
  safety_scope?: SafetyScopeRow[];
}

/** خطاب تسليم الدفاع المدني — توريد CD بالمخططات والتقرير الفني (A4 عمودي) */
export interface CdCoverLetterReport extends ReportMeta {
  letter_date?: string;
  outgoing_number?: string;
  /** جهة التوجيه */
  addressee?: string;
  /** صورة / مركز إقليمي إن وُجد */
  copy_to?: string;
  /** مبنى قائم | تحت الإنشاء */
  building_status?: string;
  manager_name?: string;
  manager_title?: string;
  safety_engineer_name?: string;
  safety_engineer_title?: string;
}

export interface FinalInspectionReport extends ReportMeta {
  inspection_date?: string;
  inspector_name?: string;
  overall_result?: string;
  compliance_summary?: string;
  license_recommendation?: string;
  /** فرع / موقع المنشأة المعروض في غلاف تقرير باندا */
  branch_name?: string;
  /** ملاحظات الملخص التنفيذي */
  executive_summary?: string;
  /** نسب اكتمال الأنظمة المعتمدة */
  system_completion?: FinalReportSystemRow[];
  /** ملاحظات المقارنة قبل/بعد */
  observations?: FinalReportObservation[];
}

/** صف نسبة اكتمال نظام في جدول الملخص التنفيذي */
export type FinalReportSystemRow = {
  id: string;
  label: string;
  /** 0–100 */
  percent: number;
  verified: boolean;
};

export type FinalObservationStatus = 'pending' | 'fixed';

/** ملاحظة ميدانية مع صورة قبل (تلقائية) وصورة بعد (يدوية) */
export type FinalReportObservation = {
  id: string;
  title: string;
  description?: string;
  system_id?: string;
  source: 'field_visit' | 'technical_notes' | 'technical_report' | 'checklist' | 'manual';
  source_ref?: string;
  before_photo?: TechnicalReportPhoto | null;
  after_photo?: TechnicalReportPhoto | null;
  status: FinalObservationStatus;
  /** 100 عند الإصلاح مع صورة بعد */
  completion_percent: number;
};

export interface CompletionCertificateReport extends ReportMeta {
  certificate_number?: string;
  issue_date?: string;
  project_name?: string;
  owner_name?: string;
  scope_of_work?: string;
  completion_date?: string;
  engineer_name?: string;
  notes?: string;

  /** بيانات الدراسة التي بُني عليها الإشراف */
  study_office_name?: string;
  study_report_number?: string;
  study_date?: string;

  /** بيانات المنشأة */
  facility_name?: string;
  activity_label?: string;
  activity_classification?: string;
  district?: string;
  street?: string;
  land_area?: string;
  building_components?: string;
  building_structural_class?: string;
  owner_contact?: string;

  /** مقاول التنفيذ */
  contractor_name?: string;
  contractor_license?: string;
  contractor_license_expiry?: string;

  /** ترخيص مكتب الاستشارات (قابل للتجاوز يدوياً) */
  office_license_number?: string;
  office_license_expiry?: string;

  /** مالك المكتب للتوقيع */
  office_owner_name?: string;

  /** نص تذييل الغرفة / التحقق */
  chamber_footer_note?: string;
}

/** حالة خلية إنجاز شهرية في تقرير الإشراف */
export type SupervisionProgressStatus = 'late' | 'on_time' | 'not_due' | '';

export type SupervisionWorkType = 'توريد' | 'تركيب' | 'توريد وتركيب' | '';

export type SupervisionMonthColumn = {
  id: string;
  label: string;
};

export type SupervisionProgressCell = {
  /** نسبة إنجاز الشهر (0–100) — فارغ إن لم يُدخل */
  percent: number | null;
  status: SupervisionProgressStatus;
};

export type SupervisionTaskRow = {
  id: string;
  /** مفتاح المجموعة لدمج عمود «الأعمال» */
  category_id: string;
  category_label: string;
  description: string;
  work_type: SupervisionWorkType;
  /** تقدم كل شهر بمفتاح معرف العمود */
  month_progress: Record<string, SupervisionProgressCell>;
  /** نسبة الإنجاز الكلية للبند — محسوبة أو يدوية */
  total_percent: number | null;
};

/** تقرير الإشراف الدوري ومتابعة الإنجاز (TEEM) */
export interface SupervisionReport extends ReportMeta {
  /** من التسويق / المبيعات */
  owner_name?: string;
  project_name?: string;
  building_type?: string;
  area_m2?: string;
  contractor_name?: string;

  /** من التقرير الفني والمكتب */
  inspection_form_number?: string;
  study_number?: string;
  supervising_office?: string;
  branch_manager_name?: string;
  safety_engineer_name?: string;

  /** مدخلات المتابعة */
  report_date?: string;
  total_duration?: string;
  start_date?: string;
  /** نسبة الإنجاز الكلي — تُحسب من البنود ما لم تُفعَّل اليدوية */
  overall_progress_percent?: number | null;
  overall_progress_manual?: boolean;

  months: SupervisionMonthColumn[];
  tasks: SupervisionTaskRow[];
  notes?: string;
}

/** صورة مرفقة داخل التقرير الفني */
export interface TechnicalReportPhoto {
  id: string;
  caption?: string;
  /** Data URL مؤقت للمعاينة/الطباعة — لاحقاً يُستبدل بتخزين Supabase */
  dataUrl?: string;
}

export interface TechnicalReportComponentRow {
  id: string;
  part_name: string;
  structure: string;
  classification: string;
  area_m2: string;
}

/** منطقة استخدام داخل دور */
export interface TechnicalReportZone {
  id: string;
  use_code: string;
  label: string;
  area_m2: string;
  /** نوع فرعي: نوع التخزين / المصنع / الورشة… */
  subtype_code?: string;
  subtype_label?: string;
  /** نظام الإطفاء المخصص (تلقائي قابل للتعديل) */
  suppression_code?: string;
  suppression_label?: string;
  /** اختيارات إضافية للمهندس ضمن المنطقة */
  selected_options?: string[];
  /** صورة مقطع كود خاصة بهذه المنطقة */
  code_proof_photo?: TechnicalReportPhoto | null;
  occupancy_code?: string;
  group_letter?: string;
  risk_level?: string;
  risk_label?: string;
}

/** دور مع مناطق استخدام — مجموع مساحات المناطق = مساحة الدور */
export interface TechnicalReportFloorUse {
  id: string;
  floor_name: string;
  floor_area_m2: string;
  structure: string;
  classification: string;
  zones: TechnicalReportZone[];
}

export interface TechnicalReportSectionItem {
  id: string;
  enabled: boolean;
  notes: string;
  selectedOptions: string[];
  photos: TechnicalReportPhoto[];
}

export interface TechnicalReportRecommendation {
  id: string;
  checked: boolean;
}

/** التقرير الفني لأنظمة السلامة والوقاية من الحريق */
export interface TechnicalReport extends ReportMeta {
  report_date?: string;
  outgoing_number?: string;
  civil_defense_branch?: string;
  deed_number?: string;
  deed_date?: string;
  building_permit_number?: string;
  building_permit_date?: string;
  building_status?: string;
  /** مثل GROUP B,M — يُحسب تلقائياً من مناطق الأدوار */
  building_classification?: string;
  /** ملخص الخطورة من المناطق / النشاط */
  risk_class?: string;
  overview_text?: string;
  location_description?: string;
  floors_description?: string;
  earth_photo?: TechnicalReportPhoto | null;
  facade_photo?: TechnicalReportPhoto | null;
  site_photo?: TechnicalReportPhoto | null;
  /** صور مقاطع من الكود مربوطة بمفتاح الإثبات (occ-class, risk-class, spr-…, zone:id) */
  code_proofs_by_key: Record<string, TechnicalReportPhoto[]>;
  /** صور مقاطع من الكود (قائمة عامة احتياطية) */
  code_proof_photos: TechnicalReportPhoto[];
  /** أدوار ومناطق الاستخدام */
  floor_uses: TechnicalReportFloorUse[];
  components: TechnicalReportComponentRow[];
  firefighting_items: TechnicalReportSectionItem[];
  ventilation_items: TechnicalReportSectionItem[];
  alarm_items: TechnicalReportSectionItem[];
  exits_items: TechnicalReportSectionItem[];
  general_recommendations: TechnicalReportRecommendation[];
  safety_engineer_name?: string;
  executive_director_name?: string;
}

/** نوع ملف مخطط السلامة / المعماري */
export type SafetyBlueprintKind =
  | 'architectural_base'
  | 'fire_fighting_file'
  | 'fire_alarm_file'
  | 'life_safety_file';

export type BlueprintAuditStatus = 'idle' | 'scanning' | 'pass' | 'warn' | 'fail';

export type BlueprintAuditFinding = {
  id: string;
  standard: 'SBC' | 'NFPA';
  code: string;
  severity: 'info' | 'pass' | 'warning' | 'fail';
  title: string;
  detail: string;
  refs: string[];
  checkpoint:
    | 'life_safety'
    | 'fire_alarm'
    | 'fire_fighting'
    | 'general'
    | 'file';
};

export type BlueprintAiAuditResult = {
  ok: boolean;
  score: number;
  summary: string;
  status: Exclude<BlueprintAuditStatus, 'idle' | 'scanning'>;
  findings: BlueprintAuditFinding[];
  standards: Array<'SBC' | 'NFPA'>;
  ekbHints: string[];
  auditedAt: string;
  blueprintKind: SafetyBlueprintKind;
  fileName: string;
};

export type SafetyBlueprintFile = {
  id: string;
  kind: SafetyBlueprintKind;
  fileName: string;
  format: string;
  sizeBytes: number;
  mimeType?: string | null;
  /** معاينة اختيارية للملفات الصغيرة (PDF/صور) — لا تُخزَّن الملفات الثنائية الكبيرة */
  dataUrl?: string | null;
  uploadedAt: string;
  auditStatus: BlueprintAuditStatus;
  auditResult?: BlueprintAiAuditResult | null;
};

/** مخططات معمارية + سلامة داخل ملف المشروع */
export type SafetyBlueprintsState = {
  architectural_base: SafetyBlueprintFile | null;
  fire_fighting_file: SafetyBlueprintFile | null;
  fire_alarm_file: SafetyBlueprintFile | null;
  life_safety_file: SafetyBlueprintFile | null;
};

/** مرفق مخطط / حساب هيدروليكي لمرحلة المخططات */
export type PlanAttachmentFile = {
  id: string;
  fileName: string;
  format: string;
  sizeBytes: number;
  mimeType?: string | null;
  /** Inline preview or public URL — prefer storagePath for large files */
  dataUrl?: string | null;
  /** Supabase Storage object path when uploaded to project-files bucket */
  storagePath?: string | null;
  storageBucket?: string | null;
  uploadedAt: string;
  kind: 'engineering_drawing' | 'hydraulic_calculation';
};

export type PlanAttachmentsState = {
  engineering_drawings: PlanAttachmentFile[];
  hydraulic_calculations: PlanAttachmentFile[];
};

/** المرحلة 1 — العقد والتعاقد */
export interface ContractOnboardingReport extends ReportMeta {
  contract_status?: 'draft' | 'signed' | 'approved' | string;
  scope_of_work?: string;
  contract_value?: number | null;
  client_name_snapshot?: string;
  project_name_snapshot?: string;
  signed_at?: string | null;
  notes?: string;
}

/** حالة مسار المراحل التسعة المتسلسل */
export type ProjectWorkflowState = {
  active_stage?: string;
  last_approved_stage?: string;
  approved_at?: Record<string, string>;
  inherited_at?: string;
};

export interface ProjectEngineeringData {
  technical_report: TechnicalReport;
  building_plan: BuildingPlanReport;
  safety_blueprints: SafetyBlueprintsState;
  /** مرفقات المخططات والحسابات الهيدروليكية (مرحلة 2) */
  plan_attachments: PlanAttachmentsState;
  /** مرحلة العقد والتعاقد (مرحلة 1) */
  contract_onboarding: ContractOnboardingReport;
  boq: BoqReport;
  timeline: TimelineReport;
  field_visits: FieldVisitReport[];
  technical_notes: TechnicalNotesReport;
  engineering_delivery: EngineeringDeliveryReport;
  /** خطاب تسليم CD للدفاع المدني */
  cd_cover_letter: CdCoverLetterReport;
  final_inspection: FinalInspectionReport;
  completion_certificate: CompletionCertificateReport;
  supervision_report: SupervisionReport;
  workflow?: ProjectWorkflowState;
}

export const EMPTY_BUILDING_PLAN: BuildingPlanReport = {
  status: 'مسودة',
  sbc_code_exceptions: '',
  high_rise_building: '',
  atrium_exists: '',
  underground_building: '',
  windowless_building: '',
  electrical_grounding: '',
  lightning_protection: '',
  backup_generator: '',
  special_rescue_team_required: '',
  fire_alarm_system: '',
  sprinkler_system: '',
};

export const EMPTY_TECHNICAL_REPORT: TechnicalReport = {
  status: 'مسودة',
  components: [],
  floor_uses: [],
  code_proof_photos: [],
  code_proofs_by_key: {},
  firefighting_items: [],
  ventilation_items: [],
  alarm_items: [],
  exits_items: [],
  general_recommendations: [],
  earth_photo: null,
  facade_photo: null,
  site_photo: null,
};

export const EMPTY_SAFETY_BLUEPRINTS: SafetyBlueprintsState = {
  architectural_base: null,
  fire_fighting_file: null,
  fire_alarm_file: null,
  life_safety_file: null,
};

export const EMPTY_PLAN_ATTACHMENTS: PlanAttachmentsState = {
  engineering_drawings: [],
  hydraulic_calculations: [],
};

export const EMPTY_CONTRACT_ONBOARDING: ContractOnboardingReport = {
  status: 'مسودة',
  contract_status: 'draft',
  scope_of_work: '',
  contract_value: null,
};

export const EMPTY_SUPERVISION_REPORT: SupervisionReport = {
  status: 'مسودة',
  months: [],
  tasks: [],
  overall_progress_percent: null,
  overall_progress_manual: false,
};

export const EMPTY_PROJECT_ENGINEERING_DATA: ProjectEngineeringData = {
  technical_report: { ...EMPTY_TECHNICAL_REPORT },
  building_plan: { ...EMPTY_BUILDING_PLAN },
  safety_blueprints: { ...EMPTY_SAFETY_BLUEPRINTS },
  plan_attachments: { ...EMPTY_PLAN_ATTACHMENTS },
  contract_onboarding: { ...EMPTY_CONTRACT_ONBOARDING },
  boq: { status: 'مسودة', items: [] },
  timeline: { status: 'مسودة', milestones: [] },
  field_visits: [],
  technical_notes: { status: 'مسودة', deficiencies: [] },
  engineering_delivery: {
    status: 'مسودة',
    safety_scope: [
      { id: 'firefighting', label: 'نظام الإطفاء', option: '', applicable: 'نعم' },
      { id: 'alarm', label: 'نظام الإنذار', option: '', applicable: 'نعم' },
      { id: 'smoke_control', label: 'نظام سحب والتحكم بالدخان', option: '', applicable: 'نعم' },
      { id: 'emergency_exits', label: 'مخارج الطوارئ', option: '', applicable: 'نعم' },
      { id: 'supervision_contract', label: 'عقد الإشراف', option: '', applicable: 'نعم' },
    ],
  },
  cd_cover_letter: { status: 'مسودة' },
  final_inspection: { status: 'مسودة' },
  completion_certificate: { status: 'مسودة' },
  supervision_report: { ...EMPTY_SUPERVISION_REPORT },
  workflow: {},
};
