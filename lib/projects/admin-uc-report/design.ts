import {
  EMPTY_FIRE_PROTECTION_DESIGN,
  calcRequiredTankVolumeM3,
  compareTankVolume,
  type FireProtectionDesign,
  type MeasuredValue,
  type YesNoUnknown,
} from '@/lib/types/fire-protection-design';

function mergeMeasured<U extends string>(
  base: MeasuredValue<U>,
  patch?: Partial<MeasuredValue<U>> | null
): MeasuredValue<U> {
  if (!patch) return { ...base };
  return {
    ...base,
    ...patch,
    unit: (patch.unit || base.unit) as U,
    input_unit: (patch.input_unit || patch.unit || base.input_unit || base.unit) as U,
    source: patch.source || base.source,
    value: patch.value === undefined ? base.value : patch.value,
  };
}

function asYesNo(v: unknown): YesNoUnknown {
  if (v === 'yes' || v === 'no' || v === 'unknown') return v;
  if (v === true || v === 'نعم') return 'yes';
  if (v === false || v === 'لا') return 'no';
  return 'unknown';
}

/** Deep-merge persisted JSON into a complete FireProtectionDesign and refresh derived volume. */
export function mergeFireProtectionDesign(
  raw?: Partial<FireProtectionDesign> | null
): FireProtectionDesign {
  const base = EMPTY_FIRE_PROTECTION_DESIGN;
  const next: FireProtectionDesign = {
    ...base,
    ...raw,
    lifecycle_mode: raw?.lifecycle_mode || base.lifecycle_mode,
    building_kind: raw?.building_kind || base.building_kind,
    occupancy: { ...base.occupancy, ...raw?.occupancy },
    applicable_codes: Array.isArray(raw?.applicable_codes)
      ? raw!.applicable_codes.filter(Boolean)
      : [...base.applicable_codes],
    egress: {
      metrics: Array.isArray(raw?.egress?.metrics) ? raw!.egress!.metrics : [],
      notes: raw?.egress?.notes ?? '',
    },
    fire_truck_access: { ...base.fire_truck_access, ...raw?.fire_truck_access },
    water_supply: { ...base.water_supply, ...raw?.water_supply },
    pump: {
      ...base.pump,
      ...raw?.pump,
      exists: asYesNo(raw?.pump?.exists ?? base.pump.exists),
      type: (raw?.pump?.type as FireProtectionDesign['pump']['type']) || '',
      capacity: mergeMeasured(base.pump.capacity, raw?.pump?.capacity),
      pressure: mergeMeasured(base.pump.pressure, raw?.pump?.pressure),
      rated_flow: mergeMeasured(base.pump.rated_flow, raw?.pump?.rated_flow),
      rated_pressure: mergeMeasured(base.pump.rated_pressure, raw?.pump?.rated_pressure),
      source: raw?.pump?.source || base.pump.source,
    },
    jockey_pump: {
      ...base.jockey_pump,
      ...raw?.jockey_pump,
      exists: asYesNo(raw?.jockey_pump?.exists ?? base.jockey_pump.exists),
      capacity: mergeMeasured(base.jockey_pump.capacity, raw?.jockey_pump?.capacity),
      pressure: mergeMeasured(base.jockey_pump.pressure, raw?.jockey_pump?.pressure),
      source: raw?.jockey_pump?.source || base.jockey_pump.source,
    },
    water_tank: {
      ...base.water_tank,
      ...raw?.water_tank,
      exists: asYesNo(raw?.water_tank?.exists ?? base.water_tank.exists),
      capacity_m3: mergeMeasured(base.water_tank.capacity_m3, raw?.water_tank?.capacity_m3),
      water_demand_lpm: mergeMeasured(
        base.water_tank.water_demand_lpm,
        raw?.water_tank?.water_demand_lpm
      ),
      duration_min: mergeMeasured(base.water_tank.duration_min, raw?.water_tank?.duration_min),
      source: raw?.water_tank?.source || base.water_tank.source,
      calculated_required_volume_m3: null,
    },
    sprinkler: { ...base.sprinkler, ...raw?.sprinkler, required: asYesNo(raw?.sprinkler?.required) },
    standpipe: { ...base.standpipe, ...raw?.standpipe, required: asYesNo(raw?.standpipe?.required) },
    extinguishers: Array.isArray(raw?.extinguishers) ? raw!.extinguishers : [],
    fire_alarm: { ...base.fire_alarm, ...raw?.fire_alarm },
    supporting_systems: {
      emergency_lighting: {
        ...base.supporting_systems.emergency_lighting,
        ...raw?.supporting_systems?.emergency_lighting,
      },
      exit_signs: {
        ...base.supporting_systems.exit_signs,
        ...raw?.supporting_systems?.exit_signs,
      },
      smoke_control: {
        ...base.supporting_systems.smoke_control,
        ...raw?.supporting_systems?.smoke_control,
      },
      ventilation: {
        ...base.supporting_systems.ventilation,
        ...raw?.supporting_systems?.ventilation,
      },
      electrical_safety: {
        ...base.supporting_systems.electrical_safety,
        ...raw?.supporting_systems?.electrical_safety,
      },
      emergency_power: {
        ...base.supporting_systems.emergency_power,
        ...raw?.supporting_systems?.emergency_power,
      },
    },
    review_rows: Array.isArray(raw?.review_rows) ? raw!.review_rows : [],
    recommendations: Array.isArray(raw?.recommendations) ? raw!.recommendations : [],
    summary_text: raw?.summary_text ?? '',
    study_limits_text: raw?.study_limits_text ?? '',
    attachments: Array.isArray(raw?.attachments) ? raw!.attachments : [],
  };

  next.water_tank.calculated_required_volume_m3 = calcRequiredTankVolumeM3(
    next.water_tank.water_demand_lpm.value,
    next.water_tank.duration_min.value
  );

  return next;
}

export function refreshDerivedDesign(design: FireProtectionDesign): FireProtectionDesign {
  return mergeFireProtectionDesign(design);
}

export function getTankVolumeCheck(design: FireProtectionDesign) {
  return compareTankVolume(
    design.water_tank.capacity_m3.value,
    design.water_tank.calculated_required_volume_m3
  );
}

/** Build default review rows from current design inputs (regenerated on each report issue). */
export function buildDefaultReviewRows(design: FireProtectionDesign) {
  const tank = getTankVolumeCheck(design);
  const pumpCap = design.pump.capacity.value;
  const pumpPress = design.pump.pressure.value;
  return [
    {
      id: 'egress',
      item: 'مخارج الطوارئ',
      status: design.egress.metrics.length ? 'مدخلة' : 'يحتاج تحقق',
      note: design.egress.notes || '—',
      action: 'مراجعة المخطط',
    },
    {
      id: 'pump',
      item: 'مضخة الحريق',
      status: pumpCap != null ? 'مدخلة' : 'لم يتم إدخال القيمة',
      note:
        pumpCap != null
          ? `${pumpCap} ${design.pump.capacity.unit} / ${pumpPress ?? '—'} ${design.pump.pressure.unit}`
          : '—',
      action: 'مطابقة الحسابات الهيدروليكية',
    },
    {
      id: 'tank',
      item: 'خزان الإطفاء',
      status: design.water_tank.capacity_m3.value != null ? 'مدخل' : 'لم يتم إدخال القيمة',
      note:
        design.water_tank.capacity_m3.value != null
          ? `${design.water_tank.capacity_m3.value} m³ — ${tank.label_ar}`
          : '—',
      action: 'التحقق بالحسابات',
    },
    {
      id: 'sprinkler',
      item: 'نظام الرش',
      status:
        design.sprinkler.required === 'yes'
          ? 'مطلوب'
          : design.sprinkler.required === 'no'
            ? 'غير مطلوب'
            : 'حسب التصميم',
      note: design.sprinkler.system_type || '—',
      action: 'استكمال التصميم',
    },
    {
      id: 'alarm',
      item: 'الإنذار',
      status: design.fire_alarm.control_panel ? 'مدخل' : 'مطلوب',
      note: design.fire_alarm.notes || '—',
      action: 'استكمال المخططات',
    },
  ];
}
