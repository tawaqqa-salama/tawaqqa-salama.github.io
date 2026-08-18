/**
 * Design Center — project-scoped engineering design state.
 * Persisted inside project_engineering_data.design_center (tied to client/project id).
 * AI / calculation engines are plugged in via API; no fabricated results.
 */

import type { PlanAttachmentFile, ReportMeta } from '@/lib/types/project-reports';

export type DesignCenterTabId =
  | 'space_safety'
  | 'drawings'
  | 'ai_center'
  | 'smart_design'
  | 'calculations'
  | 'audit'
  | 'review'
  | 'exports';

export type DesignDrawingFormat = 'pdf' | 'dwg' | 'dxf' | 'ifc' | 'rvt' | 'other';

export type DesignJobStatus =
  | 'idle'
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'estimated'
  | 'failed'
  | 'unavailable'
  | 'not_available'
  | 'needs_engineer_review';

/**
 * Calculation authority — estimates must never create authoritative compliance PASS.
 * Only `verified` (after engineer review + compliance context) may feed gate PASS.
 */
export type CalcAuthority = 'estimate' | 'advisory' | 'engineer_input' | 'verified';

/** Drawing file version — stored on the project record */
export type DesignDrawingVersion = {
  id: string;
  version: number;
  label: string;
  file: PlanAttachmentFile;
  uploadedAt: string;
  notes?: string;
};

export type DesignDrawingSheet = {
  id: string;
  title: string;
  format: DesignDrawingFormat;
  discipline?: string;
  versions: DesignDrawingVersion[];
  activeVersionId?: string | null;
  createdAt: string;
};

export type DesignAnalysisStepId =
  | 'analyze_plan'
  | 'detect_rooms'
  | 'detect_walls'
  | 'extract_dimensions'
  | 'extract_areas'
  | 'occupancy_type'
  | 'detect_stairs'
  | 'detect_exits'
  | 'read_space_names'
  | 'ceiling_analysis'
  | 'mep_coordination'
  | 'build_digital_model';

export type DesignAnalysisStep = {
  id: DesignAnalysisStepId;
  status: DesignJobStatus;
  label_ar: string;
  label_en: string;
};

/** Real model payload is filled only by a connected AI engine */
export type DesignBuildingModel = {
  rooms?: unknown[];
  walls?: unknown[];
  dimensions?: unknown;
  areas?: unknown;
  occupancy?: string | null;
  stairs?: unknown[];
  exits?: unknown[];
  space_names?: unknown[];
  raw?: unknown;
};

export type DesignAnalysisJob = {
  id: string;
  status: DesignJobStatus;
  /** 0–100 while running; stays 0 when engine unavailable */
  progress: number;
  steps: DesignAnalysisStep[];
  sourceSheetId?: string | null;
  sourceVersionId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
  error_code?: string | null;
  result?: DesignBuildingModel | null;
};

export type FireSystemKind =
  | 'fire_alarm'
  | 'sprinkler'
  | 'hose_reel'
  | 'fire_extinguisher'
  | 'fm200'
  | 'co2'
  | 'kitchen_hood'
  | 'clean_agent';

export type DesignSystemGeneration = {
  kind: FireSystemKind;
  status: DesignJobStatus;
  generatedAt?: string | null;
  designId?: string | null;
  error?: string | null;
  error_code?: string | null;
  /**
   * Legacy flat lines for exports — populated from structured standards snapshot only.
   * Do not dump project-wide sales codes here.
   */
  artifactRefs?: string[];
  /** Dynamic applicability result (Primary / Saudi / Related / Conditional) */
  standards?: import('@/lib/projects/design-center/standards/types').SystemStandardsSnapshot | null;
};

export type EngineeringCalcKind =
  | 'hydraulic'
  | 'battery'
  | 'voltage_drop'
  | 'pipe_sizing'
  | 'water_demand'
  | 'pump'
  | 'tank_size'
  | 'pressure_loss';

export type EngineeringCalcResult = {
  kind: EngineeringCalcKind;
  status: DesignJobStatus;
  updatedAt?: string | null;
  error?: string | null;
  error_code?: string | null;
  /** Populated only by calculation engine — inputs/estimates, not a code dump */
  values?: Record<string, number | string> | null;
  /** Dynamic standards for this calc’s linked system (not project-wide dump) */
  standards?: import('@/lib/projects/design-center/standards/types').SystemStandardsSnapshot | null;
  /**
   * Authority of this calc result.
   * `estimate` / `advisory` must NOT produce authoritative compliance PASS.
   */
  authority?: CalcAuthority | null;
};

/** True only when a calc may feed authoritative compliance measured inputs. */
export function isAuthoritativeCalcResult(
  calc: Pick<EngineeringCalcResult, 'status' | 'authority' | 'values'> | null | undefined
): boolean {
  if (!calc) return false;
  if (calc.status === 'estimated') return false;
  if (calc.authority === 'estimate' || calc.authority === 'advisory') return false;
  if (calc.values) {
    if (calc.values.estimated_demand_lpm != null || calc.values.estimated_volume_m3 != null) {
      return false;
    }
    if (String(calc.values.estimate_label_ar || '').trim()) return false;
  }
  return calc.authority === 'verified';
}

export type ComplianceFinding = {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  code: string;
  category: 'nfpa' | 'sbc' | 'conflict' | 'coverage' | 'design_error' | 'other';
  message_ar: string;
  message_en: string;
};

export type ComplianceRecommendation = {
  id: string;
  text_ar: string;
  text_en: string;
};

export type DesignKnowledgeCitation = {
  document_id: string;
  title: string;
  excerpt: string;
  code_reference?: string | null;
  confidence?: number | null;
  page_number?: number | null;
};

/** Links company Design Intelligence KB + sales scope into the project Design Center */
export type DesignKnowledgeLinks = {
  /**
   * Codes discovered from sales/KB linkage — Project References only.
   * Never display these as "applicable standards" for a fire system.
   */
  applicable_codes: string[];
  /** Alias clarity for UI: same as applicable_codes (project-discovered refs) */
  project_references?: string[];
  sales_services: string[];
  linked_document_ids: string[];
  linked_document_titles: string[];
  citations: DesignKnowledgeCitation[];
  last_synced_at?: string | null;
  source?: 'sales_projects_bridge' | 'manual' | string | null;
};

/** Persisted Design Readiness snapshot (recomputed on analyze / system resolve / approve) */
export type DesignReadinessSnapshot = {
  level:
    | 'NOT_READY'
    | 'READY_FOR_AI_ANALYSIS'
    | 'READY_FOR_PRELIMINARY_DESIGN'
    | 'READY_FOR_ENGINEER_REVIEW'
    | 'APPROVED';
  updatedAt: string;
  reasons_ar: string[];
  reasons_en: string[];
};

export type DesignComplianceState = {
  status: DesignJobStatus;
  matchPercent?: number | null;
  findings: ComplianceFinding[];
  recommendations: ComplianceRecommendation[];
  standards: Array<'NFPA' | 'SBC'>;
  checkedAt?: string | null;
  error?: string | null;
  error_code?: string | null;
  /** Citations from company knowledge base (Civil Defense uploads) */
  knowledge_citations?: DesignKnowledgeCitation[];
  /**
   * Always false for Design Center / DI soft compliance.
   * Must NEVER unlock workflow stages or override lib/projects/compliance.
   */
  authoritative?: false;
};

export type DesignExportKind =
  | 'dwg'
  | 'pdf'
  | 'boq'
  | 'mto'
  | 'calculation_report'
  | 'design_report'
  | 'compliance_report';

export type DesignExportJob = {
  kind: DesignExportKind;
  status: DesignJobStatus;
  file?: PlanAttachmentFile | null;
  error?: string | null;
  error_code?: string | null;
  updatedAt?: string | null;
};

/**
 * Project-scoped engineering working copy of Sales floor/usage data.
 * It is inherited once from Basic Data and never writes back to Sales.
 */
export type DesignSpaceSafetyQuantities = {
  sprinklers: number;
  smoke_detectors: number;
  fire_alarm_panels: number;
  alarm_panel_locations: string[];
  signs: number;
  emergency_lights: number;
  emergency_exits: number;
  alarm_bells: number;
  emergency_stairs: number;
  elevators: number;
  public_facilities: number;
};

export type DesignSpaceSafetyArea = {
  id: string;
  source_usage_id?: string | null;
  label: string;
  activity_type?: string | null;
  area_m2: number;
  hazard_suggested: string;
  hazard_approved?: string | null;
  hazard_source?: string | null;
  suppression_suggested: string[];
  suppression_approved?: string[] | null;
  suppression_source?: string | null;
  quantities: DesignSpaceSafetyQuantities;
};

export type DesignSpaceSafetyFloor = {
  id: string;
  source_floor_id?: string | null;
  label: string;
  kind?: string | null;
  repeat_count: number;
  areas: DesignSpaceSafetyArea[];
};

export type DesignSpaceSafetyWorkingCopy = {
  inherited_from_sales_at?: string | null;
  source: 'sales_basic_data' | 'project_engineering';
  updated_at?: string | null;
  floors: DesignSpaceSafetyFloor[];
};

export type DesignCenterUiPrefs = {
  dark_mode?: boolean;
  active_tab?: DesignCenterTabId;
  compare_version_a?: string | null;
  compare_version_b?: string | null;
  viewer_sheet_id?: string | null;
};

/** Full Design Center blob inside project_engineering_data */
export type DesignCenterState = ReportMeta & {
  sheets: DesignDrawingSheet[];
  analysis: DesignAnalysisJob | null;
  systems: DesignSystemGeneration[];
  calculations: EngineeringCalcResult[];
  compliance: DesignComplianceState;
  exports: DesignExportJob[];
  knowledge_links?: DesignKnowledgeLinks;
  readiness?: DesignReadinessSnapshot | null;
  /** Independent, editable project copy seeded once from Sales Basic Data. */
  space_safety?: DesignSpaceSafetyWorkingCopy | null;
  ui?: DesignCenterUiPrefs;
};

export const DESIGN_ANALYSIS_STEPS: Omit<DesignAnalysisStep, 'status'>[] = [
  { id: 'analyze_plan', label_ar: 'تحليل CAD/PDF', label_en: 'CAD/PDF analysis' },
  { id: 'detect_rooms', label_ar: 'التعرف على الغرف', label_en: 'Room detection' },
  { id: 'detect_walls', label_ar: 'التعرف على الجدران', label_en: 'Wall detection' },
  { id: 'extract_dimensions', label_ar: 'استخراج الأبعاد', label_en: 'Dimension extraction' },
  { id: 'extract_areas', label_ar: 'استخراج المساحات', label_en: 'Area extraction' },
  { id: 'occupancy_type', label_ar: 'تصنيف الإشغال', label_en: 'Occupancy classification' },
  { id: 'detect_stairs', label_ar: 'اكتشاف السلالم (Egress)', label_en: 'Egress — stairs' },
  { id: 'detect_exits', label_ar: 'اكتشاف المخارج (Egress)', label_en: 'Egress — exits' },
  { id: 'read_space_names', label_ar: 'أسماء الفراغات', label_en: 'Space names' },
  { id: 'ceiling_analysis', label_ar: 'تحليل الأسقف', label_en: 'Ceiling analysis' },
  { id: 'mep_coordination', label_ar: 'تنسيق MEP', label_en: 'MEP coordination' },
  { id: 'build_digital_model', label_ar: 'نموذج رقمي للمبنى', label_en: 'Digital building model' },
];

export const FIRE_SYSTEM_DEFS: {
  kind: FireSystemKind;
  label_ar: string;
  label_en: string;
}[] = [
  { kind: 'fire_alarm', label_ar: 'نظام الإنذار', label_en: 'Fire Alarm' },
  { kind: 'sprinkler', label_ar: 'نظام الرش الآلي', label_en: 'Sprinkler' },
  { kind: 'hose_reel', label_ar: 'نظام Hose Reel', label_en: 'Hose Reel' },
  { kind: 'fire_extinguisher', label_ar: 'نظام Fire Extinguisher', label_en: 'Fire Extinguisher' },
  { kind: 'fm200', label_ar: 'نظام FM200', label_en: 'FM200' },
  { kind: 'co2', label_ar: 'نظام CO2', label_en: 'CO2' },
  { kind: 'kitchen_hood', label_ar: 'نظام Kitchen Hood', label_en: 'Kitchen Hood' },
  { kind: 'clean_agent', label_ar: 'نظام Clean Agent', label_en: 'Clean Agent' },
];

export const ENGINEERING_CALC_DEFS: {
  kind: EngineeringCalcKind;
  label_ar: string;
  label_en: string;
}[] = [
  { kind: 'hydraulic', label_ar: 'Hydraulic Calculation', label_en: 'Hydraulic Calculation' },
  { kind: 'battery', label_ar: 'Battery Calculation', label_en: 'Battery Calculation' },
  { kind: 'voltage_drop', label_ar: 'Voltage Drop', label_en: 'Voltage Drop' },
  { kind: 'pipe_sizing', label_ar: 'Pipe Sizing', label_en: 'Pipe Sizing' },
  { kind: 'water_demand', label_ar: 'Water Demand', label_en: 'Water Demand' },
  { kind: 'pump', label_ar: 'Pump Calculation', label_en: 'Pump Calculation' },
  { kind: 'tank_size', label_ar: 'Tank Size', label_en: 'Tank Size' },
  { kind: 'pressure_loss', label_ar: 'Pressure Loss', label_en: 'Pressure Loss' },
];

export const DESIGN_EXPORT_DEFS: {
  kind: DesignExportKind;
  label_ar: string;
  label_en: string;
}[] = [
  { kind: 'dwg', label_ar: 'DWG', label_en: 'DWG' },
  { kind: 'pdf', label_ar: 'PDF', label_en: 'PDF' },
  { kind: 'boq', label_ar: 'BOQ', label_en: 'BOQ' },
  { kind: 'mto', label_ar: 'Material Take-Off', label_en: 'Material Take-Off' },
  { kind: 'calculation_report', label_ar: 'Calculation Report', label_en: 'Calculation Report' },
  { kind: 'design_report', label_ar: 'Design Report', label_en: 'Design Report' },
  { kind: 'compliance_report', label_ar: 'Compliance Report', label_en: 'Compliance Report' },
];

export const DESIGN_CENTER_TABS: {
  id: DesignCenterTabId;
  label_ar: string;
  label_en: string;
}[] = [
  { id: 'space_safety', label_ar: 'بيانات المساحات وأنظمة السلامة', label_en: 'Space & Safety Data' },
  { id: 'ai_center', label_ar: 'مركز الذكاء التصميمي', label_en: 'AI Design Center' },
  { id: 'smart_design', label_ar: 'التصميم الذكي', label_en: 'Smart Design' },
  { id: 'calculations', label_ar: 'الحسابات الهندسية', label_en: 'Engineering Calculations' },
  {
    id: 'audit',
    label_ar: 'تفريغ الحسابات والمطابقة',
    label_en: 'Pre-Design Audit',
  },
  { id: 'review', label_ar: 'مراجعة التصميم', label_en: 'Design Review' },
  { id: 'exports', label_ar: 'المخرجات', label_en: 'Outputs' },
  { id: 'drawings', label_ar: 'المخططات', label_en: 'Drawings' },
];

export const ENGINE_NOT_CONFIGURED = 'ENGINE_NOT_CONFIGURED' as const;
