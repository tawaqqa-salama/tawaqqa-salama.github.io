export type ComplianceStandard = 'SBC' | 'NFPA';

export type ComplianceSeverity = 'info' | 'pass' | 'warning' | 'fail';

export type SupportedEngineeringFormat =
  | 'dwg'
  | 'rvt'
  | 'ifc'
  | 'pdf'
  | 'xlsx'
  | 'docx'
  | 'unknown';

export type ComplianceFinding = {
  id: string;
  standard: ComplianceStandard;
  code: string;
  severity: ComplianceSeverity;
  title: string;
  detail: string;
  refs: string[];
  ekbTopicIds?: string[];
};

export type ComplianceValidateInput = {
  activityType?: string | null;
  floorsCount?: number | null;
  buildingArea?: number | null;
  landArea?: number | null;
  occupants?: number | null;
  hasSprinklers?: boolean | null;
  hasFireAlarm?: boolean | null;
  hasDetection?: boolean | null;
  travelDistanceM?: number | null;
  fileName?: string | null;
  fileType?: SupportedEngineeringFormat | null;
  notes?: string | null;
};

export type ComplianceValidationResult = {
  ok: boolean;
  score: number;
  summary: string;
  findings: ComplianceFinding[];
  standards: ComplianceStandard[];
  ekbHints: string[];
  parsedFile?: ParsedEngineeringFile | null;
  /**
   * Always false — lib/compliance is advisory only.
   * Workflow gates must use lib/projects/compliance exclusively.
   */
  authoritative?: false;
};

export type ParsedEngineeringFile = {
  fileName: string;
  format: SupportedEngineeringFormat;
  mimeHint: string;
  sizeBytes?: number;
  parseable: boolean;
  message: string;
  metadata: Record<string, unknown>;
};

export type EkbTopic = {
  id: string;
  title: string;
  standard: ComplianceStandard | 'BOTH';
  summary: string;
  tags: string[];
};
