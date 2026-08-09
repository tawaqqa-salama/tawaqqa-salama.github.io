/**
 * In-house client-side CAD/PDF vision types.
 * Results are produced entirely in-browser (Canvas / pdf.js / optional OCR).
 */

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

/** Closed room / zone polygon detected from drawing contours */
export type DetectedZone = {
  id: string;
  label: string | null;
  /** Polygon in raster pixel coordinates */
  polygon: Point2D[];
  /** Area in square pixels */
  area_px: number;
  /** Area in m² when scale is known; otherwise null */
  area_m2: number | null;
  confidence: number;
  bounds: { x: number; y: number; w: number; h: number };
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
  onProgress?: (message_ar: string, message_en: string) => void;
};
