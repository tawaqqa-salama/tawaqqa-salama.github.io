'use client';

import {
  TANK_VOLUME_FORMULA_AR,
  TANK_VOLUME_FORMULA_EN,
  barToPsi,
  gpmToLpm,
  lpmToGpm,
  psiToBar,
  type FireProtectionDesign,
  type FlowUnit,
  type PressureUnit,
  type PumpCertification,
  type YesNoUnknown,
} from '@/lib/types/fire-protection-design';
import {
  getTankVolumeCheck,
  refreshDerivedDesign,
} from '@/lib/projects/admin-uc-report/design';

type Props = {
  design: FireProtectionDesign;
  onChange: (next: FireProtectionDesign) => void;
  highlighted?: boolean;
};

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function FireProtectionDesignSection({
  design,
  onChange,
  highlighted,
}: Props) {
  const patch = (partial: Partial<FireProtectionDesign>) => {
    onChange(refreshDerivedDesign({ ...design, ...partial }));
  };

  const tankCheck = getTankVolumeCheck(design);
  const electricCap = design.pump.capacity;
  const electricPress = design.pump.pressure;
  const dieselCap = design.diesel_pump.capacity;
  const dieselPress = design.diesel_pump.pressure;

  const altFlow = (cap: typeof electricCap) =>
    cap.value != null
      ? cap.unit === 'GPM'
        ? `${gpmToLpm(cap.value)} L/min (عرض فقط)`
        : `${lpmToGpm(cap.value)} GPM (عرض فقط)`
      : null;
  const altPress = (press: typeof electricPress) =>
    press.value != null
      ? press.unit === 'bar'
        ? `${barToPsi(press.value)} psi (عرض فقط)`
        : `${psiToBar(press.value)} bar (عرض فقط)`
      : null;

  return (
    <div
      className={`rounded-2xl border p-4 space-y-4 ${
        highlighted
          ? 'border-emerald-300 bg-emerald-50/40'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div>
        <h3 className="text-base font-bold text-gray-900">أنظمة مكافحة الحريق والتصميم الهيدروليكي</h3>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          تُدخل مواصفات نظام الرش ومجموعة المضخات والخزان مباشرة في المصدر الفني الكانوني. كميات الأجهزة وتوزيعها حسب الدور والمساحة تبقى في مركز التصاميم ولا تُنسخ هنا.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select
          label="هل توجد مجموعة مضخات حريق؟"
          value={design.pump.exists}
          onChange={(exists) =>
            patch({
              pump: { ...design.pump, exists: exists as YesNoUnknown, source: 'engineer_input' },
              diesel_pump: {
                ...design.diesel_pump,
                exists: exists === 'no' ? 'no' : design.diesel_pump.exists,
              },
              jockey_pump: {
                ...design.jockey_pump,
                exists: exists === 'no' ? 'no' : design.jockey_pump.exists,
              },
            })
          }
          options={[
            { value: 'unknown', label: 'لم يُحدَّد بعد' },
            { value: 'yes', label: 'نعم (ثلاثية)' },
            { value: 'no', label: 'لا' },
          ]}
        />
        <Select
          label="نوع المضخة (الاعتماد)"
          value={design.pump.type}
          onChange={(type) =>
            patch({
              pump: {
                ...design.pump,
                type: type as PumpCertification,
                source: 'engineer_input',
              },
            })
          }
          options={[
            { value: '', label: '—' },
            { value: 'UL', label: 'UL' },
            { value: 'non UL', label: 'non UL' },
          ]}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-3">
        <h4 className="text-sm font-bold text-gray-900">1) مضخة كهرباء (Electric)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MeasuredFlow
            label="سعة مضخة الكهرباء"
            value={electricCap.value}
            unit={electricCap.unit}
            onValue={(value) =>
              patch({
                pump: {
                  ...design.pump,
                  capacity: {
                    ...electricCap,
                    value,
                    input_unit: electricCap.unit,
                    source: 'engineer_input',
                  },
                  source: 'engineer_input',
                },
              })
            }
            onUnit={(unit) =>
              patch({
                pump: {
                  ...design.pump,
                  capacity: {
                    ...electricCap,
                    unit,
                    input_unit: unit,
                    source: 'engineer_input',
                  },
                },
              })
            }
            hint={altFlow(electricCap)}
          />
          <MeasuredPressure
            label="ضغط مضخة الكهرباء"
            value={electricPress.value}
            unit={electricPress.unit}
            onValue={(value) =>
              patch({
                pump: {
                  ...design.pump,
                  pressure: {
                    ...electricPress,
                    value,
                    input_unit: electricPress.unit,
                    source: 'engineer_input',
                  },
                  source: 'engineer_input',
                },
              })
            }
            onUnit={(unit) =>
              patch({
                pump: {
                  ...design.pump,
                  pressure: {
                    ...electricPress,
                    unit,
                    input_unit: unit,
                    source: 'engineer_input',
                  },
                },
              })
            }
            hint={altPress(electricPress)}
          />
          <MeasuredPressure
            label="ضغط التشغيل المطلوب (Rated Pressure)"
            value={design.pump.rated_pressure.value}
            unit={design.pump.rated_pressure.unit}
            onValue={(value) =>
              patch({
                pump: {
                  ...design.pump,
                  rated_pressure: {
                    ...design.pump.rated_pressure,
                    value,
                    source: 'engineer_input',
                  },
                },
              })
            }
            onUnit={(unit) =>
              patch({
                pump: {
                  ...design.pump,
                  rated_pressure: {
                    ...design.pump.rated_pressure,
                    unit,
                    input_unit: unit,
                    source: 'engineer_input',
                  },
                },
              })
            }
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-3">
        <h4 className="text-sm font-bold text-gray-900">2) مضخة ديزل (Diesel)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MeasuredFlow
            label="سعة مضخة الديزل"
            value={dieselCap.value}
            unit={dieselCap.unit}
            onValue={(value) =>
              patch({
                diesel_pump: {
                  ...design.diesel_pump,
                  exists: 'yes',
                  capacity: {
                    ...dieselCap,
                    value,
                    input_unit: dieselCap.unit,
                    source: 'engineer_input',
                  },
                  source: 'engineer_input',
                },
              })
            }
            onUnit={(unit) =>
              patch({
                diesel_pump: {
                  ...design.diesel_pump,
                  capacity: {
                    ...dieselCap,
                    unit,
                    input_unit: unit,
                    source: 'engineer_input',
                  },
                },
              })
            }
            hint={altFlow(dieselCap)}
          />
          <MeasuredPressure
            label="ضغط مضخة الديزل"
            value={dieselPress.value}
            unit={dieselPress.unit}
            onValue={(value) =>
              patch({
                diesel_pump: {
                  ...design.diesel_pump,
                  exists: 'yes',
                  pressure: {
                    ...dieselPress,
                    value,
                    input_unit: dieselPress.unit,
                    source: 'engineer_input',
                  },
                  source: 'engineer_input',
                },
              })
            }
            onUnit={(unit) =>
              patch({
                diesel_pump: {
                  ...design.diesel_pump,
                  pressure: {
                    ...dieselPress,
                    unit,
                    input_unit: unit,
                    source: 'engineer_input',
                  },
                },
              })
            }
            hint={altPress(dieselPress)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-3">
        <h4 className="text-sm font-bold text-gray-900">3) مضخة جوكي (Jockey)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MeasuredFlow
            label="سعة الجوكي"
            value={design.jockey_pump.capacity.value}
            unit={design.jockey_pump.capacity.unit}
            onValue={(value) =>
              patch({
                jockey_pump: {
                  ...design.jockey_pump,
                  exists: 'yes',
                  capacity: {
                    ...design.jockey_pump.capacity,
                    value,
                    source: 'engineer_input',
                  },
                  source: 'engineer_input',
                },
              })
            }
            onUnit={(unit) =>
              patch({
                jockey_pump: {
                  ...design.jockey_pump,
                  capacity: {
                    ...design.jockey_pump.capacity,
                    unit,
                    input_unit: unit,
                    source: 'engineer_input',
                  },
                },
              })
            }
          />
          <MeasuredPressure
            label="ضغط الجوكي"
            value={design.jockey_pump.pressure.value}
            unit={design.jockey_pump.pressure.unit}
            onValue={(value) =>
              patch({
                jockey_pump: {
                  ...design.jockey_pump,
                  exists: 'yes',
                  pressure: {
                    ...design.jockey_pump.pressure,
                    value,
                    source: 'engineer_input',
                  },
                  source: 'engineer_input',
                },
              })
            }
            onUnit={(unit) =>
              patch({
                jockey_pump: {
                  ...design.jockey_pump,
                  pressure: {
                    ...design.jockey_pump.pressure,
                    unit,
                    input_unit: unit,
                    source: 'engineer_input',
                  },
                },
              })
            }
          />
        </div>
      </div>

      <div className="border-t border-emerald-100 pt-3 space-y-3">
        <h4 className="text-sm font-bold text-gray-900">نظام الرش الآلي</h4>
        <p className="text-xs leading-relaxed text-gray-600">
          خصائص نظام الرش التالية تخص التصميم الفني فقط. لا تُدخل أعداد المرشات هنا؛ فهي محفوظة حسب الدور والمساحة في مركز التصاميم.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Select
            label="هل نظام الرش مطلوب؟"
            value={design.sprinkler.required}
            onChange={(required) =>
              patch({
                sprinkler: {
                  ...design.sprinkler,
                  required: required as YesNoUnknown,
                  source: 'engineer_input',
                },
              })
            }
            options={[
              { value: 'unknown', label: 'لم يُحدَّد بعد' },
              { value: 'yes', label: 'نعم' },
              { value: 'no', label: 'لا' },
            ]}
          />
          <Field
            label="عدد المناطق"
            value={design.sprinkler.zones_count}
            onChange={(zones_count) =>
              patch({
                sprinkler: { ...design.sprinkler, zones_count, source: 'engineer_input' },
              })
            }
          />
          <Field
            label="نوع النظام"
            value={design.sprinkler.system_type}
            onChange={(system_type) =>
              patch({
                sprinkler: { ...design.sprinkler, system_type, source: 'engineer_input' },
              })
            }
          />
          <Field
            label="نوع الرشاش"
            value={design.sprinkler.sprinkler_type}
            onChange={(sprinkler_type) =>
              patch({
                sprinkler: { ...design.sprinkler, sprinkler_type, source: 'engineer_input' },
              })
            }
          />
          <Field
            label="K-Factor"
            value={design.sprinkler.k_factor}
            onChange={(k_factor) =>
              patch({
                sprinkler: { ...design.sprinkler, k_factor, source: 'engineer_input' },
              })
            }
          />
          <Field
            label="الضغط التصميمي"
            value={design.sprinkler.design_pressure}
            onChange={(design_pressure) =>
              patch({
                sprinkler: { ...design.sprinkler, design_pressure, source: 'engineer_input' },
              })
            }
          />
          <Field
            label="التدفق التصميمي"
            value={design.sprinkler.design_flow}
            onChange={(design_flow) =>
              patch({
                sprinkler: { ...design.sprinkler, design_flow, source: 'engineer_input' },
              })
            }
          />
        </div>
      </div>

      <div className="border-t border-emerald-100 pt-3 space-y-3">
        <h4 className="text-sm font-bold text-gray-900">خزان مياه الإطفاء — حساب تلقائي (الدفاع المدني)</h4>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm space-y-1">
          <div className="font-bold text-emerald-950">المعادلة المعتمدة</div>
          <div className="font-semibold text-gray-900" dir="rtl">
            {TANK_VOLUME_FORMULA_AR}
          </div>
          <div className="text-xs text-gray-600" dir="ltr">
            {TANK_VOLUME_FORMULA_EN}
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Q = أعلى تدفق تصميمي لمضخات الكهرباء/الديزل (لتر/دقيقة)، T = مدة التشغيل التصميمية
            (افتراضي 60 دقيقة وفق اشتراطات الدفاع المدني ما لم يُعدَّل)، V = سعة الخزان المطلوبة بالمتر المكعب.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field
            label="الطلب المائي Q (L/min) — يُحسب من المضخات أو يُعدَّل"
            value={design.water_tank.water_demand_lpm.value ?? ''}
            onChange={(v) =>
              patch({
                water_tank: {
                  ...design.water_tank,
                  water_demand_lpm: {
                    ...design.water_tank.water_demand_lpm,
                    value: numOrNull(v),
                    unit: 'L/min',
                    source: 'engineer_input',
                  },
                  source: 'engineer_input',
                },
              })
            }
          />
          <Field
            label="مدة التشغيل T (min)"
            value={design.water_tank.duration_min.value ?? ''}
            onChange={(v) =>
              patch({
                water_tank: {
                  ...design.water_tank,
                  duration_min: {
                    ...design.water_tank.duration_min,
                    value: numOrNull(v),
                    unit: 'min',
                    source: 'engineer_input',
                  },
                  source: 'engineer_input',
                },
              })
            }
          />
          <label className="text-sm block">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">
              سعة الخزان V (m³) — تلقائي
            </span>
            <input
              type="text"
              readOnly
              dir="ltr"
              value={
                design.water_tank.calculated_required_volume_m3 != null
                  ? design.water_tank.calculated_required_volume_m3
                  : ''
              }
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-gray-50 font-bold text-emerald-900"
            />
            <span className="text-[11px] text-gray-500 mt-1 block">
              مصدر: {design.water_tank.capacity_m3.source === 'calculated' ? 'محسوب' : 'مدخل مهندس'}
            </span>
          </label>
        </div>
        <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-sm">
          <div className="font-semibold text-gray-800">تطبيق المعادلة</div>
          <div className="text-emerald-900 font-bold mt-0.5 text-xs sm:text-sm" dir="ltr">
            {design.water_tank.formula_ar || TANK_VOLUME_FORMULA_AR}
          </div>
          <div className="text-xs text-amber-800 mt-1 font-semibold">{tankCheck.label_ar}</div>
          <p className="text-[11px] text-gray-500 mt-1">
            تحقق أولي وفق اشتراطات الدفاع المدني / SBC — ليس اعتماد NFPA تلقائياً؛ يلزم ربط الحساب
            الهيدروليكي المعتمد.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-emerald-100 pt-3">
        <Field
          label="مصدر المياه"
          value={design.water_supply.water_source || ''}
          onChange={(water_source) =>
            patch({ water_supply: { ...design.water_supply, water_source } })
          }
        />
        <Select
          label="نوع الخزان"
          value={design.water_supply.tank_type || ''}
          onChange={(tank_type) =>
            patch({ water_supply: { ...design.water_supply, tank_type } })
          }
          options={[
            { value: '', label: '—' },
            { value: 'أرضي', label: 'أرضي' },
            { value: 'علوي', label: 'علوي' },
            { value: 'حسب التصميم', label: 'حسب التصميم' },
          ]}
        />
        <Select
          label="مادة الخزان"
          value={design.water_supply.tank_material || ''}
          onChange={(tank_material) =>
            patch({ water_supply: { ...design.water_supply, tank_material } })
          }
          options={[
            { value: '', label: '—' },
            { value: 'خرسانة', label: 'خرسانة' },
            { value: 'فولاذ', label: 'فولاذ' },
            { value: 'أخرى', label: 'أخرى' },
          ]}
        />
      </div>

    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm block">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 text-sm"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="text-sm block">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
      >
        {options.map((o) => (
          <option key={o.value || 'empty'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MeasuredFlow({
  label,
  value,
  unit,
  onValue,
  onUnit,
  hint,
}: {
  label: string;
  value: number | null;
  unit: FlowUnit;
  onValue: (v: number | null) => void;
  onUnit: (u: FlowUnit) => void;
  hint?: string | null;
}) {
  return (
    <label className="text-sm block">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          dir="ltr"
          value={value ?? ''}
          onChange={(e) => onValue(numOrNull(e.target.value))}
          className="flex-1 border rounded-xl px-3 py-2.5 text-sm"
        />
        <select
          value={unit}
          onChange={(e) => onUnit(e.target.value as FlowUnit)}
          className="w-28 border rounded-xl px-2 py-2.5 text-sm bg-white"
        >
          <option value="GPM">GPM</option>
          <option value="L/min">L/min</option>
        </select>
      </div>
      {hint ? <span className="text-[11px] text-gray-500 mt-1 block" dir="ltr">{hint}</span> : null}
    </label>
  );
}

function MeasuredPressure({
  label,
  value,
  unit,
  onValue,
  onUnit,
  hint,
}: {
  label: string;
  value: number | null;
  unit: PressureUnit;
  onValue: (v: number | null) => void;
  onUnit: (u: PressureUnit) => void;
  hint?: string | null;
}) {
  return (
    <label className="text-sm block">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          dir="ltr"
          value={value ?? ''}
          onChange={(e) => onValue(numOrNull(e.target.value))}
          className="flex-1 border rounded-xl px-3 py-2.5 text-sm"
        />
        <select
          value={unit}
          onChange={(e) => onUnit(e.target.value as PressureUnit)}
          className="w-24 border rounded-xl px-2 py-2.5 text-sm bg-white"
        >
          <option value="bar">bar</option>
          <option value="psi">psi</option>
        </select>
      </div>
      {hint ? <span className="text-[11px] text-gray-500 mt-1 block" dir="ltr">{hint}</span> : null}
    </label>
  );
}
