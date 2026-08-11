/**
 * SBC 201-2024 — Chapter 10 Means of Egress — code / threshold database.
 *
 * SOURCE OF TRUTH: Saudi Building Code SBC 201-2024 (Chapter 10).
 *
 * CRITICAL:
 * - No numeric cells are invented here.
 * - No SBC 2018 / IBC substitute values.
 * - Every threshold row starts as CODE_TABLE_REQUIRED until a verified
 *   edition=2024 section/table cell is encoded by maintainers from the
 *   official adopted text.
 * - Engine logic must resolve thresholds from this module (or complete
 *   project_adopted_mapping with edition 2024) — never hard-code in engine.ts.
 */

import type { ProjectCodeMapping } from '@/lib/projects/compliance/types';

export type CodeTableStatus = 'VERIFIED' | 'CODE_TABLE_REQUIRED';

export type Sbc201EgressThresholdRow = {
  sourceCode: 'SBC 201';
  edition: '2024';
  section: string;
  table: string | null;
  rowCondition: string;
  occupancy: string | null;
  sprinklerStatus: 'sprinklered' | 'non_sprinklered' | 'any' | null;
  /** null until verified from official SBC 201-2024 */
  requiredValue: number | null;
  unit: string | null;
  status: CodeTableStatus;
};

export type Sbc201EgressRuleDef = {
  ruleId: string;
  title: string;
  title_ar: string;
  sourceCode: 'SBC 201';
  edition: '2024';
  section: string;
  table: string | null;
  occupancyDependencies: boolean;
  sprinklerDependencies: boolean;
  requiredInputs: string[];
  calculation: string;
  thresholdSource: string;
  passCondition: string;
  failCondition: string;
  needsDataCondition: string;
  blockedCondition: string;
  evidenceRequired: string[];
  compareMode: 'lte' | 'gte' | 'eq' | 'boolean' | 'documentation' | 'calculate_then_compare';
  /** Platform-verified rows — empty / CODE_TABLE_REQUIRED until official 2024 cells encoded */
  thresholds: Sbc201EgressThresholdRow[];
};

function slot(
  section: string,
  table: string | null,
  rowCondition: string,
  unit: string | null = null
): Sbc201EgressThresholdRow {
  return {
    sourceCode: 'SBC 201',
    edition: '2024',
    section,
    table,
    rowCondition,
    occupancy: null,
    sprinklerStatus: 'any',
    requiredValue: null,
    unit,
    status: 'CODE_TABLE_REQUIRED',
  };
}

/**
 * Chapter 10 rule catalog — structural metadata only.
 * Verified numeric thresholds: 0 (all CODE_TABLE_REQUIRED).
 */
export const SBC201_EGRESS_RULES: Sbc201EgressRuleDef[] = [
  {
    ruleId: 'SBC201-EGR-001',
    title: 'Occupant Load',
    title_ar: 'حمل الشاغلين',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1004',
    table: 'Table 1004.5 (adopted edition — cells not verified in platform)',
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: [
      'occupancyGroup',
      'spaceUse',
      'grossArea',
      'netArea',
      'applicableAreaBasis',
      'occupantLoadFactor',
      'calculatedOccupantLoad',
      'designOccupantLoad',
      'storyOccupantLoad',
      'buildingOccupantLoad',
    ],
    calculation: 'calculatedOccupantLoad = applicableArea / occupantLoadFactor (factor must be from verified SBC 201-2024 table row)',
    thresholdSource: 'SBC 201-2024 §1004 / Table 1004.5 — CODE_TABLE_REQUIRED until verified',
    passCondition: 'factor mapping verified AND calculated load documented AND design load ≥ calculated (or equal per project policy mapping)',
    failCondition: 'designOccupantLoad < calculatedOccupantLoad when both documented against verified factor',
    needsDataCondition: 'occupancy/space/area/factor/loads incomplete',
    blockedCondition: 'CODE_TABLE_REQUIRED — occupant-load factor row not verified from SBC 201-2024',
    evidenceRequired: ['calculation', 'drawing', 'document'],
    compareMode: 'calculate_then_compare',
    thresholds: [slot('1004', 'Table 1004.5', 'occupant load factor by occupancy/use', 'm2/person')],
  },
  {
    ruleId: 'SBC201-EGR-002',
    title: 'Number of Exits',
    title_ar: 'عدد المخارج',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1006',
    table: 'Table 1006.2.1 / 1006.3.2 (adopted — not verified)',
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: [
      'storyOccupantLoad',
      'occupancyGroup',
      'storyLevel',
      'sprinklerStatus',
      'exitsProvided',
      'exitAccessDoorways',
      'specialOccupancyCondition',
    ],
    calculation: 'requiredExitCount from verified SBC 201-2024 §1006 table row; compare exitsProvided',
    thresholdSource: 'SBC 201-2024 §1006 — CODE_TABLE_REQUIRED',
    passCondition: 'exitsProvided >= requiredExitCount',
    failCondition: 'exitsProvided < requiredExitCount',
    needsDataCondition: 'story load / occupancy / story / sprinkler / exits missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — required exit-count row not verified',
    evidenceRequired: ['drawing', 'calculation'],
    compareMode: 'gte',
    thresholds: [slot('1006', 'Table 1006.2.1', 'required exits by occupant load / occupancy', 'exits')],
  },
  {
    ruleId: 'SBC201-EGR-003',
    title: 'Single Exit / Single Access',
    title_ar: 'مخرج واحد / وصول واحد',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1006',
    table: 'Single-exit exceptions (adopted — not verified)',
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: [
      'occupancy',
      'story',
      'occupantLoad',
      'sprinklerStatus',
      'travelDistance',
      'commonPath',
      'applicableTableException',
    ],
    calculation: 'single-exit permitted only when verified exception row matches occupancy/story/load/sprinkler/distances',
    thresholdSource: 'SBC 201-2024 §1006 exceptions — CODE_TABLE_REQUIRED',
    passCondition: 'exception verified AND measured distances/load within exception limits',
    failCondition: 'exception verified AND conditions exceeded',
    needsDataCondition: 'occupancy/story/load/sprinkler/distances/exception identity missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — single-exit exception not verified (do not assume low load allows one exit)',
    evidenceRequired: ['drawing', 'document'],
    compareMode: 'lte',
    thresholds: [slot('1006', null, 'single exit / single access exception row', null)],
  },
  {
    ruleId: 'SBC201-EGR-004',
    title: 'Egress Capacity',
    title_ar: 'سعة المخارج',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1005',
    table: 'Capacity factors (adopted — not verified)',
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: [
      'occupantLoadServed',
      'exitComponentType',
      'clearWidth',
      'applicableCapacityFactor',
      'sprinklerCondition',
      'applicableTableSection',
    ],
    calculation: 'providedCapacity = clearWidth / factor; requiredCapacity = occupantLoadServed; compare',
    thresholdSource: 'SBC 201-2024 §1005 capacity factors — CODE_TABLE_REQUIRED',
    passCondition: 'providedEgressCapacity >= requiredEgressCapacity',
    failCondition: 'providedEgressCapacity < requiredEgressCapacity',
    needsDataCondition: 'load / component / clear width / factor / sprinkler / table ref missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — capacity factor not verified from SBC 201-2024',
    evidenceRequired: ['calculation', 'measurement'],
    compareMode: 'gte',
    thresholds: [slot('1005', null, 'egress capacity factor by component / sprinkler', 'mm/person')],
  },
  {
    ruleId: 'SBC201-EGR-005',
    title: 'Exit Separation',
    title_ar: 'تباعد المخارج',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1007',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: [
      'requiredExitCount',
      'areaDimensions',
      'diagonalDimension',
      'exitToExitDistance',
      'sprinklerStatus',
      'applicableException',
    ],
    calculation: 'required separation from verified §1007 equation/exception (not assumed 1/3 or 1/2 without documentation)',
    thresholdSource: 'SBC 201-2024 §1007 — CODE_TABLE_REQUIRED',
    passCondition: 'exitToExitDistance >= requiredSeparation',
    failCondition: 'exitToExitDistance < requiredSeparation',
    needsDataCondition: 'exit count / geometry / distance / sprinkler / exception missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — separation equation/exception not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1007', null, 'exit remoteness / separation equation or exception', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-006',
    title: 'Common Path of Egress Travel',
    title_ar: 'المسار المشترك',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1016.2',
    table: 'Common path limits (adopted — not verified)',
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: ['occupancy', 'occupantLoad', 'sprinklerStatus', 'commonPathDistance', 'applicableTableSection'],
    calculation: 'commonPathDistance <= verified limit for occupancy/load/sprinkler',
    thresholdSource: 'SBC 201-2024 §1016.2 — CODE_TABLE_REQUIRED',
    passCondition: 'actual <= required',
    failCondition: 'actual > required',
    needsDataCondition: 'occupancy / load / sprinkler / distance / table ref missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — common-path limit not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'lte',
    thresholds: [slot('1016.2', null, 'common path by occupancy / sprinkler', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-007',
    title: 'Exit Access Travel Distance',
    title_ar: 'مسافة السفر',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1017',
    table: 'Table 1017.2 (adopted — not verified)',
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: ['occupancy', 'sprinklerStatus', 'travelDistance', 'specialCondition', 'applicableException'],
    calculation: 'travelDistance <= verified Table 1017.2 / exception row',
    thresholdSource: 'SBC 201-2024 §1017 / Table 1017.2 — CODE_TABLE_REQUIRED',
    passCondition: 'actual <= required',
    failCondition: 'actual > required',
    needsDataCondition: 'occupancy / sprinkler / travel / special / exception missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — travel-distance row not verified (no single building-wide value)',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'lte',
    thresholds: [slot('1017', 'Table 1017.2', 'travel distance by occupancy / sprinkler', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-008',
    title: 'Corridor Width',
    title_ar: 'عرض الممر',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1020',
    table: 'Corridor width (adopted — not verified)',
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: ['occupancy', 'occupantLoadServed', 'corridorType', 'clearWidth', 'applicableTableSection'],
    calculation: 'clearWidth (net) >= verified minimum for occupancy / load / corridor type',
    thresholdSource: 'SBC 201-2024 §1020 — CODE_TABLE_REQUIRED',
    passCondition: 'clearWidth >= required',
    failCondition: 'clearWidth < required',
    needsDataCondition: 'occupancy / load / type / clear width / table ref missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — corridor clear-width minimum not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1020', null, 'corridor clear width by occupancy / load', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-009',
    title: 'Dead-End Corridor',
    title_ar: 'طريق مسدود',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1020',
    table: 'Dead-end limits (adopted — not verified)',
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: [
      'occupancy',
      'sprinklerStatus',
      'deadEndLength',
      'corridorConfiguration',
      'applicableException',
    ],
    calculation: 'deadEndLength <= verified occupancy/sprinkler/exception limit (no universal value)',
    thresholdSource: 'SBC 201-2024 §1020 dead ends — CODE_TABLE_REQUIRED',
    passCondition: 'actual <= required',
    failCondition: 'actual > required',
    needsDataCondition: 'occupancy / sprinkler / length / configuration / exception missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — dead-end limit not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'lte',
    thresholds: [slot('1020', null, 'dead-end corridor by occupancy / sprinkler', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-010',
    title: 'Door Clear Width',
    title_ar: 'عرض فتحة الباب الصافية',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1010',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: [
      'doorType',
      'clearOpeningWidth',
      'leafWidth',
      'occupantLoadServed',
      'egressDirection',
      'doorLocation',
    ],
    calculation: 'clearOpeningWidth >= verified §1010 minimum (leaf width alone never suffices)',
    thresholdSource: 'SBC 201-2024 §1010 — CODE_TABLE_REQUIRED',
    passCondition: 'clearOpeningWidth >= required',
    failCondition: 'clearOpeningWidth < required',
    needsDataCondition: 'door type / clear opening / leaf / load / direction / location missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — door clear-opening minimum not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1010', null, 'door clear opening width', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-011',
    title: 'Door Swing',
    title_ar: 'اتجاه فتح الباب',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1010',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: [
      'occupantLoad',
      'occupancy',
      'doorLocation',
      'doorSwingDirection',
      'egressCondition',
      'applicableSection',
    ],
    calculation: 'swing direction complies with verified §1010 applicability (not one rule for all doors)',
    thresholdSource: 'SBC 201-2024 §1010 door swing — CODE_TABLE_REQUIRED',
    passCondition: 'documented swing matches verified requirement',
    failCondition: 'documented swing conflicts with verified requirement',
    needsDataCondition: 'load / occupancy / location / swing / egress condition / section missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — door-swing applicability not verified',
    evidenceRequired: ['drawing', 'document'],
    compareMode: 'boolean',
    thresholds: [slot('1010', null, 'door swing direction applicability', null)],
  },
  {
    ruleId: 'SBC201-EGR-012',
    title: 'Panic / Fire Exit Hardware',
    title_ar: 'أجهزة الذعر / خروج الحريق',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1010',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: [
      'occupancy',
      'occupantLoad',
      'doorType',
      'lockingType',
      'panicHardware',
      'fireExitHardware',
      'applicableSection',
    ],
    calculation: 'hardware required/provided per verified §1010 occupancy/load applicability',
    thresholdSource: 'SBC 201-2024 §1010 panic/fire exit hardware — CODE_TABLE_REQUIRED',
    passCondition: 'required hardware provided per verified applicability',
    failCondition: 'required hardware missing per verified applicability',
    needsDataCondition: 'occupancy / load / door / locking / hardware / section missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — panic/fire-exit hardware applicability not verified',
    evidenceRequired: ['document', 'drawing'],
    compareMode: 'boolean',
    thresholds: [slot('1010', null, 'panic / fire exit hardware applicability', null)],
  },
  {
    ruleId: 'SBC201-EGR-013',
    title: 'Stair Width',
    title_ar: 'عرض السلم',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1011',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: [
      'occupantLoadServed',
      'stairCount',
      'clearWidth',
      'occupancy',
      'sprinklerStatus',
      'applicableSectionTable',
    ],
    calculation: 'stair clearWidth >= verified minimum (no universal minimum)',
    thresholdSource: 'SBC 201-2024 §1011 — CODE_TABLE_REQUIRED',
    passCondition: 'clearWidth >= required',
    failCondition: 'clearWidth < required',
    needsDataCondition: 'load / stair count / clear width / occupancy / sprinkler / section missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — stair width minimum not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1011', null, 'stair clear width', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-014',
    title: 'Stair Riser',
    title_ar: 'ارتفاع درجة السلم',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1011',
    table: null,
    occupancyDependencies: false,
    sprinklerDependencies: false,
    requiredInputs: ['riserHeight', 'stairType', 'applicableSectionTable'],
    calculation: 'riserHeight within verified §1011 limits for stair type',
    thresholdSource: 'SBC 201-2024 §1011 riser — CODE_TABLE_REQUIRED',
    passCondition: 'riser within verified min/max',
    failCondition: 'riser outside verified min/max',
    needsDataCondition: 'riser / stair type / section missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — riser limits not verified',
    evidenceRequired: ['measurement'],
    compareMode: 'lte',
    thresholds: [slot('1011', null, 'maximum riser height by stair type', 'mm')],
  },
  {
    ruleId: 'SBC201-EGR-015',
    title: 'Stair Tread',
    title_ar: 'عمق درجة السلم',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1011',
    table: null,
    occupancyDependencies: false,
    sprinklerDependencies: false,
    requiredInputs: ['treadDepth', 'stairType', 'applicableSectionTable'],
    calculation: 'treadDepth >= verified §1011 minimum for stair type',
    thresholdSource: 'SBC 201-2024 §1011 tread — CODE_TABLE_REQUIRED',
    passCondition: 'tread >= required',
    failCondition: 'tread < required',
    needsDataCondition: 'tread / stair type / section missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — tread minimum not verified',
    evidenceRequired: ['measurement'],
    compareMode: 'gte',
    thresholds: [slot('1011', null, 'minimum tread depth by stair type', 'mm')],
  },
  {
    ruleId: 'SBC201-EGR-016',
    title: 'Stair Headroom',
    title_ar: 'ارتفاع خلوص السلم',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1011',
    table: null,
    occupancyDependencies: false,
    sprinklerDependencies: false,
    requiredInputs: ['headroom', 'stairType', 'applicableSectionTable'],
    calculation: 'headroom >= verified §1011 minimum',
    thresholdSource: 'SBC 201-2024 §1011 headroom — CODE_TABLE_REQUIRED',
    passCondition: 'headroom >= required',
    failCondition: 'headroom < required',
    needsDataCondition: 'headroom / stair type / section missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — headroom minimum not verified',
    evidenceRequired: ['measurement'],
    compareMode: 'gte',
    thresholds: [slot('1011', null, 'minimum stair headroom', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-017',
    title: 'Stair Landing',
    title_ar: 'بسطة السلم',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1011',
    table: null,
    occupancyDependencies: false,
    sprinklerDependencies: false,
    requiredInputs: ['landingWidth', 'landingDepth', 'stairWidth', 'doorSwing', 'applicableSectionTable'],
    calculation: 'landing dimensions comply with verified §1011 relative to stair width / door swing',
    thresholdSource: 'SBC 201-2024 §1011 landings — CODE_TABLE_REQUIRED',
    passCondition: 'landing width/depth meet verified requirements',
    failCondition: 'landing dimensions below verified requirements',
    needsDataCondition: 'landing / stair width / door swing / section missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — landing requirements not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1011', null, 'stair landing dimensions', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-018',
    title: 'Ramp',
    title_ar: 'المنحدر',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1012',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: [
      'rampWidth',
      'slope',
      'rise',
      'run',
      'landing',
      'handrail',
      'occupancy',
      'egressUse',
      'applicableSectionTable',
    ],
    calculation: 'ramp geometry/slope within verified §1012 limits for egress use (no fixed slope without applicability)',
    thresholdSource: 'SBC 201-2024 §1012 — CODE_TABLE_REQUIRED',
    passCondition: 'ramp meets verified slope/width/landing/handrail requirements',
    failCondition: 'ramp exceeds verified limits',
    needsDataCondition: 'width/slope/rise/run/landing/handrail/occupancy/use/section missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — ramp criteria not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'lte',
    thresholds: [slot('1012', null, 'maximum ramp slope for egress use', 'ratio')],
  },
  {
    ruleId: 'SBC201-EGR-019',
    title: 'Exit Signs',
    title_ar: 'لافتات المخارج',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1013',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: [
      'exitSignRequired',
      'signProvided',
      'visibility',
      'directionalSign',
      'emergencyPower',
      'applicableCondition',
    ],
    calculation: 'signs provided where verified §1013 requires them, with visibility / emergency power as applicable',
    thresholdSource: 'SBC 201-2024 §1013 — CODE_TABLE_REQUIRED',
    passCondition: 'required signs documented as provided per verified applicability',
    failCondition: 'required signs missing per verified applicability',
    needsDataCondition: 'requirement / provided / visibility / directional / power / condition missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — exit-sign applicability not verified',
    evidenceRequired: ['drawing', 'document'],
    compareMode: 'boolean',
    thresholds: [slot('1013', null, 'exit sign requirement applicability', null)],
  },
  {
    ruleId: 'SBC201-EGR-020',
    title: 'Handrails',
    title_ar: 'درابزين اليد',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1014',
    table: null,
    occupancyDependencies: false,
    sprinklerDependencies: false,
    requiredInputs: [
      'handrailRequired',
      'height',
      'continuity',
      'extensions',
      'clearance',
      'sides',
      'stairOrRampType',
    ],
    calculation: 'handrail geometry meets verified §1014 criteria when required',
    thresholdSource: 'SBC 201-2024 §1014 — CODE_TABLE_REQUIRED',
    passCondition: 'handrail height/continuity/extensions/clearance meet verified limits',
    failCondition: 'handrail fails verified limits',
    needsDataCondition: 'required flag / height / continuity / extensions / clearance / sides / type missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — handrail criteria not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1014', null, 'handrail height / geometry', 'mm')],
  },
  {
    ruleId: 'SBC201-EGR-021',
    title: 'Guards',
    title_ar: 'حواجز الحماية',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1015',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: ['guardRequired', 'height', 'openingSize', 'location', 'occupancyUse', 'applicableCondition'],
    calculation: 'guard height/openings meet verified §1015 for location/use',
    thresholdSource: 'SBC 201-2024 §1015 — CODE_TABLE_REQUIRED',
    passCondition: 'guard meets verified height/opening limits',
    failCondition: 'guard fails verified limits',
    needsDataCondition: 'required / height / opening / location / use / condition missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — guard criteria not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1015', null, 'guard height / opening limits', 'mm')],
  },
  {
    ruleId: 'SBC201-EGR-022',
    title: 'Exit Access Configuration',
    title_ar: 'تكوين مسار الوصول للمخرج',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1016',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: [
      'pathGeometry',
      'interveningRooms',
      'accessPath',
      'exitAccessCondition',
      'applicableExceptions',
    ],
    calculation: 'exit access path complies with verified §1016 configuration / exceptions',
    thresholdSource: 'SBC 201-2024 §1016 — CODE_TABLE_REQUIRED',
    passCondition: 'configuration documented compliant per verified criteria',
    failCondition: 'configuration fails verified criteria',
    needsDataCondition: 'path / rooms / access / condition / exceptions missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — exit-access configuration criteria not verified',
    evidenceRequired: ['drawing', 'document'],
    compareMode: 'boolean',
    thresholds: [slot('1016', null, 'exit access configuration / exceptions', null)],
  },
  {
    ruleId: 'SBC201-EGR-023',
    title: 'Exit Access Stairways / Ramps',
    title_ar: 'سلالم/منحدرات الوصول للمخرج',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1019',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: [
      'componentType',
      'storiesConnected',
      'enclosureCondition',
      'sprinklerStatus',
      'occupancy',
      'applicableSection',
    ],
    calculation: 'exit access stair/ramp conditions per verified §1019 (distinct from interior exit stairway §1023)',
    thresholdSource: 'SBC 201-2024 §1019 — CODE_TABLE_REQUIRED',
    passCondition: 'component meets verified §1019 conditions',
    failCondition: 'component fails verified §1019 conditions',
    needsDataCondition: 'type / stories / enclosure / sprinkler / occupancy / section missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — §1019 criteria not verified',
    evidenceRequired: ['drawing', 'document'],
    compareMode: 'boolean',
    thresholds: [slot('1019', null, 'exit access stairway / ramp conditions', null)],
  },
  {
    ruleId: 'SBC201-EGR-024',
    title: 'Interior Exit Stairway',
    title_ar: 'سلم الخروج الداخلي',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1023',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: true,
    requiredInputs: [
      'enclosure',
      'fireResistance',
      'openingProtection',
      'penetrations',
      'continuity',
      'discharge',
      'smokeProtectionIfRequired',
    ],
    calculation: 'interior exit stairway enclosure/protection per verified §1023',
    thresholdSource: 'SBC 201-2024 §1023 — CODE_TABLE_REQUIRED',
    passCondition: 'enclosure/protection documented per verified requirements',
    failCondition: 'enclosure/protection fails verified requirements',
    needsDataCondition: 'enclosure / FRR / openings / penetrations / continuity / discharge / smoke missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — interior exit stairway criteria not verified',
    evidenceRequired: ['drawing', 'document'],
    compareMode: 'boolean',
    thresholds: [slot('1023', null, 'interior exit stairway enclosure / FRR', 'hours')],
  },
  {
    ruleId: 'SBC201-EGR-025',
    title: 'Exit Passageway',
    title_ar: 'ممر الخروج',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1024',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: ['width', 'occupantLoad', 'fireResistance', 'openingProtection', 'continuity', 'discharge'],
    calculation: 'exit passageway width/protection per verified §1024',
    thresholdSource: 'SBC 201-2024 §1024 — CODE_TABLE_REQUIRED',
    passCondition: 'width/protection meet verified requirements',
    failCondition: 'width/protection fail verified requirements',
    needsDataCondition: 'width / load / FRR / openings / continuity / discharge missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — exit passageway criteria not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1024', null, 'exit passageway width / FRR', 'm')],
  },
  {
    ruleId: 'SBC201-EGR-026',
    title: 'Horizontal Exit',
    title_ar: 'مخرج أفقي',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1026',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: [
      'horizontalExit',
      'occupancy',
      'occupantLoad',
      'refugeArea',
      'fireBarrier',
      'openingProtection',
      'capacity',
    ],
    calculation: 'horizontal exit refuge/capacity/barrier per verified §1026',
    thresholdSource: 'SBC 201-2024 §1026 — CODE_TABLE_REQUIRED',
    passCondition: 'refuge/capacity/barrier meet verified requirements',
    failCondition: 'refuge/capacity/barrier fail verified requirements',
    needsDataCondition: 'horizontal exit flag / occupancy / load / refuge / barrier / openings / capacity missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — horizontal exit criteria not verified',
    evidenceRequired: ['calculation', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1026', null, 'horizontal exit refuge / capacity', 'persons')],
  },
  {
    ruleId: 'SBC201-EGR-027',
    title: 'Exit Discharge',
    title_ar: 'تصريف الخروج',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1028',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: [
      'exitDischarge',
      'dischargePath',
      'width',
      'publicWay',
      'obstruction',
      'levelChange',
      'doorCondition',
    ],
    calculation: 'exit discharge path to public way per verified §1028',
    thresholdSource: 'SBC 201-2024 §1028 — CODE_TABLE_REQUIRED',
    passCondition: 'discharge path/width/public way meet verified requirements',
    failCondition: 'discharge path fails verified requirements',
    needsDataCondition: 'discharge / path / width / public way / obstruction / level / door missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — exit discharge criteria not verified',
    evidenceRequired: ['drawing', 'document'],
    compareMode: 'boolean',
    thresholds: [slot('1028', null, 'exit discharge to public way', null)],
  },
  {
    ruleId: 'SBC201-EGR-028',
    title: 'Egress Court',
    title_ar: 'فناء المخارج',
    sourceCode: 'SBC 201',
    edition: '2024',
    section: '1029',
    table: null,
    occupancyDependencies: true,
    sprinklerDependencies: false,
    requiredInputs: ['courtWidth', 'courtLength', 'obstruction', 'exitAccess', 'dischargeRelationship'],
    calculation: 'egress court dimensions/relationships per verified §1029',
    thresholdSource: 'SBC 201-2024 §1029 — CODE_TABLE_REQUIRED',
    passCondition: 'court width/length/relationships meet verified requirements',
    failCondition: 'court fails verified requirements',
    needsDataCondition: 'width / length / obstruction / exit access / discharge relationship missing',
    blockedCondition: 'CODE_TABLE_REQUIRED — egress court criteria not verified',
    evidenceRequired: ['measurement', 'drawing'],
    compareMode: 'gte',
    thresholds: [slot('1029', null, 'egress court minimum width', 'm')],
  },
];

export function getSbc201EgressRuleDef(ruleId: string): Sbc201EgressRuleDef | undefined {
  return SBC201_EGRESS_RULES.find((r) => r.ruleId === ruleId);
}

export function listSbc201EgressRuleIds(): string[] {
  return SBC201_EGRESS_RULES.map((r) => r.ruleId);
}

export function countSbc201VerifiedThresholds(): number {
  return SBC201_EGRESS_RULES.reduce(
    (n, r) => n + r.thresholds.filter((t) => t.status === 'VERIFIED' && t.requiredValue != null).length,
    0
  );
}

export function countSbc201CodeTableRequired(): number {
  return SBC201_EGRESS_RULES.reduce(
    (n, r) => n + r.thresholds.filter((t) => t.status === 'CODE_TABLE_REQUIRED' || t.requiredValue == null).length,
    0
  );
}

/** Only accept mappings explicitly claiming SBC 201 edition 2024. */
export function isSbc2012024Mapping(m: ProjectCodeMapping | null | undefined): boolean {
  if (!m) return false;
  if (!(m.value > 0) || !Number.isFinite(m.value)) return false;
  const code = String(m.source_code || '').trim().toUpperCase();
  if (!code.includes('SBC') || !code.includes('201')) return false;
  if (String(m.source_edition || '').trim() !== '2024') return false;
  if (!String(m.source_section || '').trim()) return false;
  // Reject known wrong editions if somehow labeled
  if (/2018|ibc/i.test(String(m.applicability || ''))) return false;
  return true;
}

export function resolveSbc201Threshold(params: {
  ruleId: string;
  occupancy?: string | null;
  sprinklerStatus?: 'sprinklered' | 'non_sprinklered' | null;
  projectMapping?: ProjectCodeMapping | null;
}): {
  value: number | null;
  unit: string | null;
  section: string;
  table: string | null;
  status: CodeTableStatus | 'PROJECT_ADOPTED';
  sourceCode: string;
  edition: string;
  rowCondition: string;
} | null {
  const def = getSbc201EgressRuleDef(params.ruleId);
  if (!def) return null;

  const verified = def.thresholds.find(
    (t) =>
      t.status === 'VERIFIED' &&
      t.requiredValue != null &&
      t.requiredValue > 0 &&
      (!params.occupancy || !t.occupancy || t.occupancy === params.occupancy) &&
      (!params.sprinklerStatus ||
        !t.sprinklerStatus ||
        t.sprinklerStatus === 'any' ||
        t.sprinklerStatus === params.sprinklerStatus)
  );
  if (verified && verified.requiredValue != null) {
    return {
      value: verified.requiredValue,
      unit: verified.unit,
      section: verified.section,
      table: verified.table,
      status: 'VERIFIED',
      sourceCode: verified.sourceCode,
      edition: verified.edition,
      rowCondition: verified.rowCondition,
    };
  }

  if (isSbc2012024Mapping(params.projectMapping)) {
    const m = params.projectMapping!;
    return {
      value: m.value,
      unit: m.unit,
      section: m.source_section,
      table: m.source_table ?? null,
      status: 'PROJECT_ADOPTED',
      sourceCode: m.source_code,
      edition: m.source_edition,
      rowCondition: m.applicability || 'project_adopted_mapping SBC 201-2024',
    };
  }

  const placeholder = def.thresholds[0];
  return {
    value: null,
    unit: placeholder?.unit ?? null,
    section: def.section,
    table: def.table,
    status: 'CODE_TABLE_REQUIRED',
    sourceCode: 'SBC 201',
    edition: '2024',
    rowCondition: placeholder?.rowCondition || 'unverified',
  };
}
