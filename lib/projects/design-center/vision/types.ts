/**
 * In-house client-side CAD/PDF vision types.
 * Results are produced entirely in-browser (Canvas / pdf.js / optional OCR).
 */

import type { FireSystemKind } from '@/lib/projects/design-center/types';

export type CadVisionSourceKind = 'pdf' | 'image' | 'unsupported';

export type CadVisionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'unsupported'
  | 'password_protected';

export type Point2D = { x: number; y: number };

export type ZoneClassification =
  | 'electrical_room'
  | 'server_room'
  | 'kitchen'
  | 'warehouse'
  | 'stairwell'
  | 'corridor'
  | 'office'
  | 'assembly'
  | 'unknown'
  | 'manual';

export type TextAnchor = {
  text: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
};

/** Closed room / zone polygon detected from drawing contours */
export type DetectedZone = {
  id: string;
  label: string | null;
  label_ar?: string | null;
  /** Polygon in raster pixel coordinates */
  polygon: Point2D[];
  /** Area in square pixels */
  area_px: number;
  /** Area in m² when scale is known; otherwise null */
  area_m2: number | null;
  confidence: number;
  bounds: { x: number; y: number; w: number; h: number };
  classification?: ZoneClassification;
  label_source?: 'text_anchor' | 'manual' | 'unknown';
  label_confidence?: number;
  needs_engineer_label?: boolean;
  nearby_text?: string | null;
  manual_override?: boolean;
  /** Populated by egress engine */
  travel_distance_m?: number | null;
  egress_status?: EgressComplianceStatus | null;
};

export type DetectedWallSegment = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length_px: number;
  length_m: number | null;
};

export type TitleBlockMetadata = {
  project_name: string | null;
  sheet_number: string | null;
  drawing_title: string | null;
  occupancy: string | null;
  area_m2: number | null;
  scale_text: string | null;
  revision: string | null;
  raw_text: string;
  source: 'pdf_text' | 'ocr' | 'mixed' | 'none';
};

export type ScaleCalibration = {
  /** e.g. "1:100" */
  ratio_text: string | null;
  /** Real-world meters represented by one drawing unit on paper at 1:S */
  scale_denominator: number | null;
  /** Meters per raster pixel at the render DPI */
  meters_per_pixel: number | null;
  source: 'title_block' | 'drawing_text' | 'manual' | 'unknown';
  dpi: number;
};

export type EgressComplianceStatus =
  | 'within_limit'
  | 'exceeds_limit'
  | 'scale_unknown'
  | 'needs_engineer_review';

export type TravelDistanceLimit = {
  code: 'SBC-801';
  max_m_without_sprinkler: number;
  max_m_with_sprinkler: number;
  applied_max_m: number;
  has_sprinkler: boolean;
  note_ar: string;
  note_en: string;
};

export type EgressZoneAssessment = {
  zone_id: string;
  zone_label: string | null;
  travel_distance_px: number;
  travel_distance_m: number | null;
  limit_m: number;
  status: EgressComplianceStatus;
  method: 'longest_diagonal' | 'centroid_to_exit' | 'longest_diagonal_vs_exit';
  vector: { from: Point2D; to: Point2D };
  diagonal: { from: Point2D; to: Point2D; length_px: number } | null;
  nearest_exit: { x: number; y: number; dist_px: number } | null;
  note_ar: string;
  note_en: string;
};

export type EgressAnalysisSummary = {
  limit: TravelDistanceLimit;
  exits: Point2D[];
  assessments: EgressZoneAssessment[];
  max_travel_m: number | null;
  overall_status: EgressComplianceStatus;
};

export type ZoneSystemRequirement = {
  zone_id: string;
  zone_label: string | null;
  classification: ZoneClassification;
  systems: FireSystemKind[];
  primary_codes: string[];
  related_codes: string[];
  note_ar: string;
  note_en: string;
  sprinkler_density_hint: 'ESFR_OR_HIGH_DENSITY' | null;
};

export type MepDeviceKind = 'sprinkler' | 'smoke_detector' | 'manual_call_point';

export type DetectedMepDevice = {
  id: string;
  kind: MepDeviceKind;
  x: number;
  y: number;
  label: string | null;
  source: 'text_anchor' | 'symbol_hint';
  confidence: number;
};

export type HazardClass = 'light' | 'ordinary' | 'extra';

export type CoverageIssueKind = 'over_spaced' | 'uncovered_zone' | 'no_devices' | 'scale_unknown';

export type CoverageIssue = {
  id: string;
  kind: CoverageIssueKind;
  device_kind: MepDeviceKind;
  zone_id: string | null;
  message_ar: string;
  message_en: string;
  /** Pixel points for overlay (device pairs or uncovered samples) */
  points: Point2D[];
  distance_m: number | null;
  limit_m: number | null;
};

export type CoverageAuditResult = {
  devices: DetectedMepDevice[];
  hazard_class: HazardClass;
  sprinkler_max_spacing_m: number;
  smoke_max_spacing_m: number;
  issues: CoverageIssue[];
  uncovered_samples: Array<{ zone_id: string; x: number; y: number; device_kind: MepDeviceKind }>;
  summary_ar: string;
  summary_en: string;
};

export type HydraulicPreCalculation = {
  remote_zone_id: string | null;
  remote_zone_label: string | null;
  remote_area_m2: number | null;
  hazard_class: HazardClass;
  density_gpm_per_ft2: number;
  estimated_flow_gpm: number | null;
  estimated_duration_min: number;
  estimated_volume_gal: number | null;
  note_ar: string;
  note_en: string;
  status: 'estimated' | 'needs_engineer_review' | 'not_available';
};

export type AlarmBatteryPreCalculation = {
  smoke_count: number;
  mcp_count: number;
  other_notification_estimate: number;
  standby_current_a: number | null;
  alarm_current_a: number | null;
  standby_hours: number;
  alarm_hours: number;
  estimated_ah: number | null;
  note_ar: string;
  note_en: string;
  status: 'estimated' | 'needs_engineer_review' | 'not_available';
};

export type PreCalculationBundle = {
  hydraulic: HydraulicPreCalculation;
  alarm_battery: AlarmBatteryPreCalculation;
};

export type ComplianceItemStatus =
  | 'COMPLIANT'
  | 'NEEDS_ENGINEER_REVIEW'
  | 'CRITICAL_NON_COMPLIANCE';

export type ComplianceChecklistItem = {
  id: string;
  category: 'egress' | 'coverage' | 'special_suppression' | 'pre_calculation' | 'data';
  title_ar: string;
  title_en: string;
  detail_ar: string;
  detail_en: string;
  status: ComplianceItemStatus;
  code_refs: string[];
};

export type ComplianceReport = {
  generated_at: string;
  overall_status: ComplianceItemStatus;
  items: ComplianceChecklistItem[];
  counts: {
    compliant: number;
    needs_engineer_review: number;
    critical: number;
  };
};

export type CADAnalysisResult = {
  status: CadVisionStatus;
  engine: 'local_client';
  source_kind: CadVisionSourceKind;
  file_name: string | null;
  processed_at: string;
  width_px: number;
  height_px: number;
  dpi: number;
  scale: ScaleCalibration;
  title_block: TitleBlockMetadata;
  zones: DetectedZone[];
  walls: DetectedWallSegment[];
  text_anchors: TextAnchor[];
  /** Downscaled JPEG data URL for overlay UI (local only) */
  preview_data_url: string | null;
  egress: EgressAnalysisSummary | null;
  zone_system_requirements: ZoneSystemRequirement[];
  coverage: CoverageAuditResult | null;
  pre_calculations: PreCalculationBundle | null;
  compliance_report: ComplianceReport | null;
  /** Sum of zone areas in m² when scale known */
  gross_floor_area_m2: number | null;
  /** Heuristic door/exit glyph or text hits — may be null */
  exits_count: number | null;
  doors_count: number | null;
  occupancy: string | null;
  /** pdf.js / OCR text corpus used for scale + title block */
  extracted_text: string;
  warnings_ar: string[];
  warnings_en: string[];
  error: string | null;
  error_code: string | null;
  /** Processing stayed in local memory */
  privacy: 'local_only';
};

export type CadVisionAnalyzeOptions = {
  /** Target raster DPI (default 300, may be capped for memory) */
  dpi?: number;
  /** Max canvas edge in pixels (default 4200) */
  maxEdgePx?: number;
  /** Manual meters-per-pixel override */
  manualMetersPerPixel?: number | null;
  /** Enable Tesseract OCR on title-block crop (browser only; slower) */
  enableOcr?: boolean;
  /** Declared sprinkler presence for SBC travel-distance limit selection */
  hasSprinkler?: boolean;
  /** Declared fire alarm presence for compliance consistency checks */
  hasFireAlarm?: boolean;
  onProgress?: (message_ar: string, message_en: string) => void;
};

export type ZoneManualOverride = {
  zone_id: string;
  label?: string | null;
  classification?: ZoneClassification;
  dimensionScale?: number;
  area_m2?: number | null;
};
