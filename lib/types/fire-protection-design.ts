/**
 * Engineering design inputs for technical reports (esp. admin building under construction).
 * Values are Design Inputs — not automatic approvals.
 */

export type ValueSource =
  | 'engineer_input'
  | 'hydraulic_calc'
  | 'project_drawings'
  | 'rule_requirement'
  | 'approved_value'
  | 'calculated'
  | 'unknown';

export type ProjectLifecycleMode = 'under_construction' | 'existing_building';

export type FlowUnit = 'GPM' | 'L/min';
export type PressureUnit = 'bar' | 'psi';

export type MeasuredValue<U extends string> = {
  value: number | null;
  unit: U;
  /** Original unit as entered by the engineer (display conversion never overwrites this). */
  input_unit?: U;
  source: ValueSource;
};

export type YesNoUnknown = 'yes' | 'no' | 'unknown';

/** Pump set certification (UL listed vs non-UL). Legacy Electric/Diesel/Other migrated away. */
export type PumpCertification = '' | 'UL' | 'non UL';

export type PumpUnitInputs = {
  exists: YesNoUnknown;
  capacity: MeasuredValue<FlowUnit>;
  pressure: MeasuredValue<PressureUnit>;
  source: ValueSource;
};

export type SupportingSystemState = {
  status: 'required' | 'not_required' | 'by_design' | 'unknown';
  note?: string;
  recommendation?: string;
  source?: ValueSource;
};

export type EgressMetric = {
  label: string;
  value: string;
  note?: string;
  source?: ValueSource;
};

export type ReviewRow = {
  id: string;
  item: string;
  status: string;
  note: string;
  action: string;
};

export type ReportAttachmentRef = {
  id: string;
  label: string;
  kind?: string;
  /** Optional preview URL — rendered only in attachments appendix */
  dataUrl?: string | null;
  fileName?: string;
};

export type FireProtectionDesign = {
  /** Explicit lifecycle for report wording */
  lifecycle_mode: ProjectLifecycleMode;
  /** Building kind for template selection */
  building_kind: 'administrative' | string;

  occupancy: {
    occupancy_type: string;
    hazard_class: string;
    floors_count: string;
    area_m2: string;
    source: ValueSource;
  };

  applicable_codes: string[];

  egress: {
    metrics: EgressMetric[];
    notes?: string;
  };

  fire_truck_access: {
    site_entrance?: string;
    fire_road?: string;
    road_width_m?: string;
    building_access?: string;
    staging_area?: string;
    civil_defense_connection?: string;
    connection_location?: string;
    notes?: string;
    source?: ValueSource;
  };

  water_supply: {
    water_source?: string;
    tank_type?: '' | 'أرضي' | 'علوي' | 'حسب التصميم' | string;
    tank_material?: '' | 'خرسانة' | 'فولاذ' | 'أخرى' | string;
  };

  /**
   * Fire pump set — always triple: Electric + Diesel + Jockey.
   * `type` = UL / non UL certification for the set (not drive type).
   * Capacity/pressure on `pump` = Electric unit (backward compatible).
   */
  pump: {
    exists: YesNoUnknown;
    type: PumpCertification;
    capacity: MeasuredValue<FlowUnit>;
    pressure: MeasuredValue<PressureUnit>;
    rated_flow: MeasuredValue<FlowUnit>;
    rated_pressure: MeasuredValue<PressureUnit>;
    source: ValueSource;
  };

  diesel_pump: PumpUnitInputs;
  jockey_pump: PumpUnitInputs;

  water_tank: {
    exists: YesNoUnknown;
    capacity_m3: MeasuredValue<'m³'>;
    water_demand_lpm: MeasuredValue<'L/min'>;
    duration_min: MeasuredValue<'min'>;
    /**
     * Civil Defense preliminary tank volume:
     * V (m³) = Q (L/min) × T (min) / 1000
     */
    calculated_required_volume_m3: number | null;
    /** Human-readable equation snapshot for UI/report */
    formula_ar?: string;
    source: ValueSource;
  };

  sprinkler: {
    required: YesNoUnknown;
    system_type: string;
    zones_count: string;
    sprinkler_type: string;
    k_factor: string;
    design_pressure: string;
    design_flow: string;
    source: ValueSource;
  };

  standpipe: {
    required: YesNoUnknown;
    notes: string;
    source: ValueSource;
  };

  extinguishers: Array<{
    id: string;
    type: string;
    count: string;
    location: string;
    rating: string;
  }>;

  fire_alarm: {
    control_panel: string;
    smoke_detectors: string;
    heat_detectors: string;
    manual_call_points: string;
    bells: string;
    voice_alarm: string;
    integration: string;
    notes: string;
    source: ValueSource;
  };

  supporting_systems: {
    emergency_lighting: SupportingSystemState;
    exit_signs: SupportingSystemState;
    smoke_control: SupportingSystemState;
    ventilation: SupportingSystemState;
    electrical_safety: SupportingSystemState;
    emergency_power: SupportingSystemState;
  };

  review_rows: ReviewRow[];
  recommendations: string[];
  summary_text?: string;
  study_limits_text?: string;

  /** Named attachments listed after the core report (not part of ~11 pages) */
  attachments: ReportAttachmentRef[];
};

export const VALUE_SOURCE_LABEL_AR: Record<ValueSource, string> = {
  engineer_input: 'إدخال المهندس',
  hydraulic_calc: 'الحساب الهيدروليكي المعتمد',
  project_drawings: 'مخططات المشروع',
  rule_requirement: 'متطلب كودي / قاعدة',
  approved_value: 'قيمة معتمدة',
  calculated: 'محسوب من المدخلات',
  unknown: 'غير معروف',
};

const measured = <U extends string>(unit: U, source: ValueSource = 'engineer_input'): MeasuredValue<U> => ({
  value: null,
  unit,
  input_unit: unit,
  source,
});

/** Civil Defense / SBC fire-tank sizing equation (preliminary). */
export const TANK_VOLUME_FORMULA_AR =
  'V (م³) = Q (لتر/دقيقة) × T (دقيقة) ÷ 1000';
export const TANK_VOLUME_FORMULA_EN = 'V (m³) = Q (L/min) × T (min) / 1000';
/** Default operating duration used when engineer has not overridden (minutes). */
export const DEFAULT_CD_TANK_DURATION_MIN = 60;

export function gpmToLpm(gpm: number): number {
  return Math.round(gpm * 3.785411784 * 100) / 100;
}

export function lpmToGpm(lpm: number): number {
  return Math.round((lpm / 3.785411784) * 100) / 100;
}

export const EMPTY_FIRE_PROTECTION_DESIGN: FireProtectionDesign = {
  lifecycle_mode: 'under_construction',
  building_kind: 'administrative',
  occupancy: {
    occupancy_type: 'مبنى إداري',
    hazard_class: '',
    floors_count: '',
    area_m2: '',
    source: 'engineer_input',
  },
  applicable_codes: [
    'SBC 201',
    'SBC 801',
    'NFPA 10',
    'NFPA 13',
    'NFPA 14',
    'NFPA 20',
    'NFPA 22',
    'NFPA 72',
    'NFPA 101',
  ],
  egress: { metrics: [], notes: '' },
  fire_truck_access: { source: 'engineer_input' },
  water_supply: {
    water_source: '',
    tank_type: '',
    tank_material: '',
  },
  pump: {
    exists: 'yes',
    type: '',
    capacity: measured('GPM'),
    pressure: measured('bar'),
    rated_flow: measured('GPM'),
    rated_pressure: measured('bar'),
    source: 'engineer_input',
  },
  diesel_pump: {
    exists: 'yes',
    capacity: measured('GPM'),
    pressure: measured('bar'),
    source: 'engineer_input',
  },
  jockey_pump: {
    exists: 'yes',
    capacity: measured('GPM'),
    pressure: measured('bar'),
    source: 'engineer_input',
  },
  water_tank: {
    exists: 'yes',
    capacity_m3: measured('m³'),
    water_demand_lpm: measured('L/min'),
    duration_min: { value: 60, unit: 'min', input_unit: 'min', source: 'rule_requirement' },
    calculated_required_volume_m3: null,
    formula_ar: TANK_VOLUME_FORMULA_AR,
    source: 'engineer_input',
  },
  sprinkler: {
    required: 'unknown',
    system_type: '',
    zones_count: '',
    sprinkler_type: '',
    k_factor: '',
    design_pressure: '',
    design_flow: '',
    source: 'engineer_input',
  },
  standpipe: { required: 'unknown', notes: '', source: 'engineer_input' },
  extinguishers: [],
  fire_alarm: {
    control_panel: '',
    smoke_detectors: '',
    heat_detectors: '',
    manual_call_points: '',
    bells: '',
    voice_alarm: '',
    integration: '',
    notes: '',
    source: 'engineer_input',
  },
  supporting_systems: {
    emergency_lighting: { status: 'unknown' },
    exit_signs: { status: 'unknown' },
    smoke_control: { status: 'unknown' },
    ventilation: { status: 'unknown' },
    electrical_safety: { status: 'unknown' },
    emergency_power: { status: 'unknown' },
  },
  review_rows: [],
  recommendations: [],
  summary_text: '',
  study_limits_text: '',
  attachments: [],
};

/** Missing engineer input — never invent a value; never say «غير محدد» for enterable fields. */
export const NOT_ENTERED_AR = 'لم يتم إدخال القيمة';
/** Truly unavailable project fact (e.g. no permit number on file). */
export const NOT_AVAILABLE_AR = 'غير متوفر';

export function normalizePumpCertification(raw: unknown): PumpCertification {
  if (raw === 'UL' || raw === 'non UL') return raw;
  // Legacy drive-type values — certification must be re-selected
  if (raw === 'Electric' || raw === 'Diesel' || raw === 'Other' || raw === 'nano UL') return '';
  if (typeof raw === 'string' && /non\s*ul/i.test(raw)) return 'non UL';
  if (typeof raw === 'string' && /^ul$/i.test(raw.trim())) return 'UL';
  return '';
}

export function flowToLpm(m: MeasuredValue<FlowUnit> | null | undefined): number | null {
  if (!m || m.value == null || !Number.isFinite(m.value)) return null;
  return m.unit === 'GPM' ? gpmToLpm(m.value) : m.value;
}

/** Design demand Q = max(electric, diesel) in L/min. */
export function designPumpDemandLpm(design: Pick<FireProtectionDesign, 'pump' | 'diesel_pump'>): number | null {
  const electric = flowToLpm(design.pump.capacity);
  const diesel = flowToLpm(design.diesel_pump?.capacity);
  if (electric == null && diesel == null) return null;
  return Math.max(electric ?? 0, diesel ?? 0);
}

export function formatTankFormulaFilled(demandLpm: number | null, durationMin: number | null, volumeM3: number | null): string {
  const q = demandLpm != null ? String(demandLpm) : 'Q';
  const t = durationMin != null ? String(durationMin) : 'T';
  const v = volumeM3 != null ? String(volumeM3) : 'V';
  return `${TANK_VOLUME_FORMULA_AR}  ←  ${v} = ${q} × ${t} ÷ 1000`;
}

export function calcRequiredTankVolumeM3(
  demandLpm: number | null | undefined,
  durationMin: number | null | undefined
): number | null {
  if (demandLpm == null || durationMin == null) return null;
  if (!Number.isFinite(demandLpm) || !Number.isFinite(durationMin)) return null;
  if (demandLpm < 0 || durationMin < 0) return null;
  return Math.round((demandLpm * durationMin) / 1000 * 1000) / 1000;
}

export type TankVolumeCheck = {
  entered_m3: number | null;
  theoretical_m3: number | null;
  status: 'incomplete' | 'needs_review' | 'preliminary_ok';
  label_ar: string;
};

/** Preliminary engineering check only — not an NFPA approval verdict. */
export function compareTankVolume(
  enteredM3: number | null | undefined,
  theoreticalM3: number | null | undefined
): TankVolumeCheck {
  const entered = enteredM3 ?? null;
  const theoretical = theoreticalM3 ?? null;
  if (entered == null || theoretical == null) {
    return {
      entered_m3: entered,
      theoretical_m3: theoretical,
      status: 'incomplete',
      label_ar: 'بيانات غير مكتملة للمقارنة الأولية',
    };
  }
  if (entered + 1e-9 < theoretical) {
    return {
      entered_m3: entered,
      theoretical_m3: theoretical,
      status: 'needs_review',
      label_ar: 'يحتاج مراجعة هندسية',
    };
  }
  return {
    entered_m3: entered,
    theoretical_m3: theoretical,
    status: 'preliminary_ok',
    label_ar: 'المدخلات تغطي الحجم النظري الأولي (تحقق أولي — ليس اعتماد NFPA)',
  };
}

export function barToPsi(bar: number): number {
  return Math.round(bar * 14.5037738 * 100) / 100;
}

export function psiToBar(psi: number): number {
  return Math.round((psi / 14.5037738) * 100) / 100;
}

export function formatMeasured<U extends string>(
  m: MeasuredValue<U> | null | undefined,
  opts?: { empty?: string }
): string {
  const empty = opts?.empty ?? NOT_ENTERED_AR;
  if (!m || m.value == null || Number.isNaN(m.value)) return empty;
  return `${m.value} ${m.unit}`;
}

export function formatDisplayOrNotEntered(value: string | number | null | undefined): string {
  if (value == null) return NOT_ENTERED_AR;
  const text = String(value).trim();
  return text ? text : NOT_ENTERED_AR;
}

export function formatFactOrUnavailable(value: string | number | null | undefined): string {
  if (value == null) return NOT_AVAILABLE_AR;
  const text = String(value).trim();
  return text ? text : NOT_AVAILABLE_AR;
}
