import {
  DEFAULT_CD_TANK_DURATION_MIN,
  EMPTY_FIRE_PROTECTION_DESIGN,
  TANK_VOLUME_FORMULA_AR,
  calcRequiredTankVolumeM3,
  compareTankVolume,
  designPumpDemandLpm,
  formatTankFormulaFilled,
  normalizePumpCertification,
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

function migrateLegacyDiesel(
  raw: Partial<FireProtectionDesign> | null | undefined,
  base: FireProtectionDesign
): FireProtectionDesign['diesel_pump'] {
  const fromRaw = raw?.diesel_pump;
  if (fromRaw) {
    return {
      ...base.diesel_pump,
      ...fromRaw,
      exists: asYesNo(fromRaw.exists ?? base.diesel_pump.exists),
      capacity: mergeMeasured(base.diesel_pump.capacity, fromRaw.capacity),
      pressure: mergeMeasured(base.diesel_pump.pressure, fromRaw.pressure),
      source: fromRaw.source || base.diesel_pump.source,
    };
  }
  // Legacy: pump.type === 'Diesel' meant the main capacity was the diesel unit
  const legacyType = (raw?.pump as { type?: string } | undefined)?.type || '';
  if (legacyType === 'Diesel' && raw?.pump?.capacity) {
    return {
      exists: 'yes',
      capacity: mergeMeasured(base.diesel_pump.capacity, raw.pump.capacity),
      pressure: mergeMeasured(base.diesel_pump.pressure, raw.pump.pressure),
      source: 'engineer_input',
    };
  }
  return { ...base.diesel_pump };
}

/** Apply Civil Defense tank auto-sizing: Q from pumps, default T, V = Q×T/1000. */
export function applyCivilDefenseTankSizing(design: FireProtectionDesign): FireProtectionDesign {
  const next: FireProtectionDesign = {
    ...design,
    water_tank: { ...design.water_tank },
  };

  const demandFromPumps = designPumpDemandLpm(next);
  const demandManual =
    next.water_tank.water_demand_lpm.source === 'engineer_input' &&
    next.water_tank.water_demand_lpm.value != null;

  if (!demandManual && demandFromPumps != null) {
    next.water_tank.water_demand_lpm = {
      value: demandFromPumps,
      unit: 'L/min',
      input_unit: 'L/min',
      source: 'calculated',
    };
  }

  if (next.water_tank.duration_min.value == null) {
    next.water_tank.duration_min = {
      value: DEFAULT_CD_TANK_DURATION_MIN,
      unit: 'min',
      input_unit: 'min',
      source: 'rule_requirement',
    };
  }

  const q = next.water_tank.water_demand_lpm.value;
  const t = next.water_tank.duration_min.value;
  const volume = calcRequiredTankVolumeM3(q, t);
  next.water_tank.calculated_required_volume_m3 = volume;
  next.water_tank.formula_ar = formatTankFormulaFilled(q, t, volume);

  // Auto-fill design tank capacity from CD equation (engineer can override manually)
  const capacityManual =
    next.water_tank.capacity_m3.source === 'engineer_input' &&
    next.water_tank.capacity_m3.value != null &&
    next.water_tank.capacity_m3.value !== volume;

  // Prefer calculated capacity when not explicitly overridden to a different value
  if (volume != null && !capacityManual) {
    next.water_tank.capacity_m3 = {
      value: volume,
      unit: 'm³',
      input_unit: 'm³',
      source: 'calculated',
    };
    next.water_tank.exists = next.water_tank.exists === 'no' ? 'no' : 'yes';
    next.water_tank.source = 'calculated';
  } else if (volume != null && next.water_tank.capacity_m3.value == null) {
    next.water_tank.capacity_m3 = {
      value: volume,
      unit: 'm³',
      input_unit: 'm³',
      source: 'calculated',
    };
  }

  return next;
}

/** Deep-merge persisted JSON into a complete FireProtectionDesign and refresh derived volume. */
export function mergeFireProtectionDesign(
  raw?: Partial<FireProtectionDesign> | null
): FireProtectionDesign {
  const base = EMPTY_FIRE_PROTECTION_DESIGN;
  // Persisted JSON may still carry legacy drive-type strings (Electric/Diesel/Other)
  const rawPumpType = (raw?.pump as { type?: string } | undefined)?.type || '';
  const migrateDieselDrive = rawPumpType === 'Diesel' && !raw?.diesel_pump;
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
      type: normalizePumpCertification(rawPumpType),
      // Legacy Diesel capacity lived on pump — clear electric capacity if migrating
      capacity: migrateDieselDrive
        ? { ...base.pump.capacity }
        : mergeMeasured(base.pump.capacity, raw?.pump?.capacity),
      pressure: migrateDieselDrive
        ? { ...base.pump.pressure }
        : mergeMeasured(base.pump.pressure, raw?.pump?.pressure),
      rated_flow: mergeMeasured(base.pump.rated_flow, raw?.pump?.rated_flow),
      rated_pressure: mergeMeasured(base.pump.rated_pressure, raw?.pump?.rated_pressure),
      source: raw?.pump?.source || base.pump.source,
    },
    diesel_pump: migrateLegacyDiesel(raw, base),
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
      formula_ar: raw?.water_tank?.formula_ar || TANK_VOLUME_FORMULA_AR,
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

  return applyCivilDefenseTankSizing(next);
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
  const dieselCap = design.diesel_pump.capacity.value;
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
      item: 'مجموعة مضخات الحريق (كهرباء / ديزل / جوكي)',
      status:
        pumpCap != null || dieselCap != null
          ? `مدخلة — ${design.pump.type || 'اعتماد غير محدد'}`
          : 'لم يتم إدخال القيمة',
      note:
        pumpCap != null || dieselCap != null
          ? `كهرباء ${pumpCap ?? '—'} ${design.pump.capacity.unit} / ديزل ${dieselCap ?? '—'} ${design.diesel_pump.capacity.unit} / ${pumpPress ?? '—'} ${design.pump.pressure.unit}`
          : '—',
      action: 'مطابقة الحسابات الهيدروليكية',
    },
    {
      id: 'tank',
      item: 'خزان الإطفاء',
      status: design.water_tank.capacity_m3.value != null ? 'محسوب / مدخل' : 'لم يتم إدخال القيمة',
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
