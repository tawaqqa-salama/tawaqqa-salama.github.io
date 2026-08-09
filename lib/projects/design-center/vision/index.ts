export type {
  CADAnalysisResult,
  CadVisionAnalyzeOptions,
  CadVisionSourceKind,
  CadVisionStatus,
  DetectedWallSegment,
  DetectedZone,
  Point2D,
  ScaleCalibration,
  TitleBlockMetadata,
} from '@/lib/projects/design-center/vision/types';

export {
  analyzeCadDrawing,
  cadVisionEngine,
  resolveDrawingBlobForVision,
} from '@/lib/projects/design-center/vision/cadVisionEngine';

export {
  buildScaleCalibration,
  countEgressMentions,
  detectScaleFromText,
  metersPerPixelFromScale,
  parseTitleBlockText,
  otsuThreshold,
  thresholdBinary,
  detectRoomZones,
  detectWallSegments,
  toGrayscale,
  convexHull,
  simplifyPolygon,
} from '@/lib/projects/design-center/vision/drawingSanitizer';
