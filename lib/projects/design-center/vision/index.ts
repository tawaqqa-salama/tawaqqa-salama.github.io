export type {
  CADAnalysisResult,
  CadVisionAnalyzeOptions,
  CadVisionSourceKind,
  CadVisionStatus,
  DetectedWallSegment,
  DetectedZone,
  EgressAnalysisSummary,
  EgressComplianceStatus,
  EgressZoneAssessment,
  Point2D,
  ScaleCalibration,
  TextAnchor,
  TitleBlockMetadata,
  TravelDistanceLimit,
  ZoneClassification,
  ZoneManualOverride,
  ZoneSystemRequirement,
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

export {
  classifyLabelText,
  enrichZonesWithLabels,
  partitionDistinctZones,
  bindZoneToSystems,
  collectZoneSystemRequirements,
  applyManualZoneOverride,
  zoneAreaM2,
  polygonAreaPx,
  zonesImplyKitchen,
  zonesImplySpecialSuppression,
} from '@/lib/projects/design-center/vision/zoneAnalyzer';

export {
  longestDiagonal,
  sbc801TravelDistanceLimit,
  assessZoneTravelDistance,
  runEgressAnalysis,
  extractExitPoints,
} from '@/lib/projects/design-center/vision/egressEngine';

export {
  applyZoneOverridesToCadResult,
  cadResultFromAnalysisJob,
} from '@/lib/projects/design-center/vision/recompute';
