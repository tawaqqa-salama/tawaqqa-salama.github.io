export type {
  CADAnalysisResult,
  CadVisionAnalyzeOptions,
  CadVisionSourceKind,
  CadVisionStatus,
  AlarmBatteryPreCalculation,
  ComplianceChecklistItem,
  ComplianceItemStatus,
  ComplianceReport,
  CoverageAuditResult,
  CoverageIssue,
  DetectedMepDevice,
  DetectedWallSegment,
  DetectedZone,
  EgressAnalysisSummary,
  EgressComplianceStatus,
  EgressZoneAssessment,
  HazardClass,
  HydraulicPreCalculation,
  MepDeviceKind,
  Point2D,
  PreCalculationBundle,
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

export {
  runCoverageAudit,
  detectDevicesFromAnchors,
  sprinklerMaxSpacingM,
  smokeMaxSpacingM,
  inferHazardClass,
} from '@/lib/projects/design-center/vision/coverageAuditor';

export {
  runPreCalculations,
  estimateHydraulicDemand,
  estimateAlarmBattery,
  densityForHazard,
  pickHydraulicallyRemoteZone,
} from '@/lib/projects/design-center/vision/preCalculations';

export {
  buildComplianceReport,
  complianceReportFromCad,
} from '@/lib/projects/design-center/vision/complianceReport';

export {
  buildPreDesignAuditHtml,
  downloadPreDesignAuditHtml,
  openPreDesignAuditPrint,
} from '@/lib/projects/design-center/vision/auditExport';

export type {
  BuildingMetricsInspection,
  DetectedFloorLevel,
  DrawingFloorKind,
  DrawingInspectionReport,
  DrawingTypeId,
  DrawingTypeInspection,
  ZoneDetailInspection,
} from '@/lib/projects/design-center/vision/drawingInspector';

export {
  buildingPlanPatchFromInspection,
  clientFieldHintsFromInspection,
  detectDrawingType,
  extractBuildingMetrics,
  extractZoneDetails,
  inspectDrawing,
} from '@/lib/projects/design-center/vision/drawingInspector';
