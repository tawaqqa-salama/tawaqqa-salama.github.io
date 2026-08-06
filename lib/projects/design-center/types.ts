/**
 * Design Center — project-scoped engineering design state.
 * Persisted inside project_engineering_data.design_center (tied to client/project id).
 * AI / calculation engines are plugged in via API; no fabricated results.
 */

import type { PlanAttachmentFile, ReportMeta } from '@/lib/types/project-reports';

export type DesignCenterTabId =
  | 'drawings'
  | 'ai_center'
  | 'smart_design'
  | 'calculations'
  | 'review'
  | 'exports';

export type DesignDrawingFormat = 'pdf' | 'dwg' | 'dxf' | 'ifc' | 'rvt' | 'other';

export type DesignJobStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'unavailable';

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
  /** Artifact refs from real engine only */
  artifactRefs?: string[];
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
  /** Populated only by calculation engine */
  values?: Record<string, number | string> | null;
};

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

export type DesignComplianceState = {
  status: DesignJobStatus;
  matchPercent?: number | null;
  findings: ComplianceFinding[];
  recommendations: ComplianceRecommendation[];
  standards: Array<'NFPA' | 'SBC'>;
  checkedAt?: string | null;
  error?: string | null;
  error_code?: string | null;
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
  ui?: DesignCenterUiPrefs;
};

export const DESIGN_ANALYSIS_STEPS: Omit<DesignAnalysisStep, 'status'>[] = [
  { id: 'analyze_plan', label_ar: 'تحليل المخطط', label_en: 'Analyze plan' },
  { id: 'detect_rooms', label_ar: 'التعرف على الغرف', label_en: 'Detect rooms' },
  { id: 'detect_walls', label_ar: 'التعرف على الجدران', label_en: 'Detect walls' },
  { id: 'extract_dimensions', label_ar: 'استخراج الأبعاد', label_en: 'Extract dimensions' },
  { id: 'extract_areas', label_ar: 'استخراج المساحات', label_en: 'Extract areas' },
  { id: 'occupancy_type', label_ar: 'تحديد نوع الإشغال', label_en: 'Occupancy type' },
  { id: 'detect_stairs', label_ar: 'اكتشاف السلالم', label_en: 'Detect stairs' },
  { id: 'detect_exits', label_ar: 'اكتشاف المخارج', label_en: 'Detect exits' },
  { id: 'read_space_names', label_ar: 'قراءة أسماء الفراغات', label_en: 'Read space names' },
  { id: 'build_digital_model', label_ar: 'إنشاء نموذج رقمي للمبنى', label_en: 'Build digital model' },
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
  { id: 'drawings', label_ar: 'إدارة المخططات', label_en: 'Drawing Management' },
  { id: 'ai_center', label_ar: 'مركز الذكاء التصميمي', label_en: 'AI Design Center' },
  { id: 'smart_design', label_ar: 'التصميم الذكي', label_en: 'Smart Design' },
  { id: 'calculations', label_ar: 'الحسابات الهندسية', label_en: 'Engineering Calculations' },
  { id: 'review', label_ar: 'مراجعة التصميم', label_en: 'Design Review' },
  { id: 'exports', label_ar: 'المخرجات', label_en: 'Outputs' },
];

export const ENGINE_NOT_CONFIGURED = 'ENGINE_NOT_CONFIGURED' as const;
