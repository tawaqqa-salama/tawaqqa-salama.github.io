'use client';

import {
  barToPsi,
  gpmToLpm,
  lpmToGpm,
  psiToBar,
  type FireProtectionDesign,
  type FlowUnit,
  type PressureUnit,
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
  const cap = design.pump.capacity;
  const press = design.pump.pressure;
  const altFlow =
    cap.value != null
      ? cap.unit === 'GPM'
        ? `${gpmToLpm(cap.value)} L/min (عرض فقط)`
        : `${lpmToGpm(cap.value)} GPM (عرض فقط)`
      : null;
  const altPress =
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
        <h3 className="text-base font-bold text-gray-900">التصميم الهيدروليكي</h3>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          مدخلات مضخة الحريق والخزان — Design Inputs تظهر مباشرة في التقرير الفني للمبنى
          الإداري تحت الإنشاء. التحويل بين الوحدات للعرض فقط ويُحتفظ بالقيمة والوحدة الأصلية.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select
          label="هل توجد مضخة حريق؟"
          value={design.pump.exists}
          onChange={(exists) =>
            patch({ pump: { ...design.pump, exists: exists as YesNoUnknown, source: 'engineer_input' } })
          }
          options={[
            { value: 'unknown', label: 'لم يُحدَّد بعد' },
            { value: 'yes', label: 'نعم' },
            { value: 'no', label: 'لا' },
          ]}
        />
        <Select
          label="نوع المضخة"
          value={design.pump.type}
          onChange={(type) =>
            patch({
              pump: {
                ...design.pump,
                type: type as FireProtectionDesign['pump']['type'],
                source: 'engineer_input',
              },
            })
          }
          options={[
            { value: '', label: '—' },
            { value: 'Electric', label: 'Electric' },
            { value: 'Diesel', label: 'Diesel' },
            { value: 'Other', label: 'Other' },
          ]}
        />
        <MeasuredFlow
          label="سعة المضخة (Pump Capacity)"
          value={cap.value}
          unit={cap.unit}
          onValue={(value) =>
            patch({
              pump: {
                ...design.pump,
                capacity: {
                  ...cap,
                  value,
                  input_unit: cap.unit,
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
                capacity: { ...cap, unit, input_unit: unit, source: 'engineer_input' },
              },
            })
          }
          hint={altFlow}
        />
        <MeasuredPressure
          label="ضغط المضخة (Pump Pressure)"
          value={press.value}
          unit={press.unit}
          onValue={(value) =>
            patch({
              pump: {
                ...design.pump,
                pressure: {
                  ...press,
                  value,
                  input_unit: press.unit,
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
                pressure: { ...press, unit, input_unit: unit, source: 'engineer_input' },
              },
            })
          }
          hint={altPress}
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
        <Select
          label="Jockey Pump"
          value={design.jockey_pump.exists}
          onChange={(exists) =>
            patch({
              jockey_pump: {
                ...design.jockey_pump,
                exists: exists as YesNoUnknown,
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
        <MeasuredFlow
          label="سعة Jockey Pump"
          value={design.jockey_pump.capacity.value}
          unit={design.jockey_pump.capacity.unit}
          onValue={(value) =>
            patch({
              jockey_pump: {
                ...design.jockey_pump,
                capacity: {
                  ...design.jockey_pump.capacity,
                  value,
                  source: 'engineer_input',
                },
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
          label="ضغط Jockey"
          value={design.jockey_pump.pressure.value}
          unit={design.jockey_pump.pressure.unit}
          onValue={(value) =>
            patch({
              jockey_pump: {
                ...design.jockey_pump,
                pressure: {
                  ...design.jockey_pump.pressure,
                  value,
                  source: 'engineer_input',
                },
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

      <div className="border-t border-emerald-100 pt-3 space-y-3">
        <h4 className="text-sm font-bold text-gray-900">خزان مياه الإطفاء (Tank)</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field
            label="سعة خزان مياه الإطفاء (m³)"
            value={design.water_tank.capacity_m3.value ?? ''}
            onChange={(v) =>
              patch({
                water_tank: {
                  ...design.water_tank,
                  capacity_m3: {
                    ...design.water_tank.capacity_m3,
                    value: numOrNull(v),
                    unit: 'm³',
                    source: 'engineer_input',
                  },
                  source: 'engineer_input',
                },
              })
            }
          />
          <Field
            label="الطلب المائي (L/min)"
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
            label="مدة التشغيل التصميمية (min)"
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
        </div>
        <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-sm">
          <div className="font-semibold text-gray-800">الحجم النظري المطلوب (Q × T / 1000)</div>
          <div className="text-emerald-800 font-bold mt-0.5" dir="ltr">
            {design.water_tank.calculated_required_volume_m3 != null
              ? `${design.water_tank.calculated_required_volume_m3} m³`
              : '—'}
          </div>
          <div className="text-xs text-amber-800 mt-1 font-semibold">{tankCheck.label_ar}</div>
          <p className="text-[11px] text-gray-500 mt-1">
            تحقق أولي فقط (Preliminary Engineering Check) — ليس اعتماد NFPA تلقائياً.
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-emerald-100 pt-3">
        <Field
          label="درجة الخطورة (قابلة للتعديل)"
          value={design.occupancy.hazard_class}
          onChange={(hazard_class) =>
            patch({
              occupancy: { ...design.occupancy, hazard_class, source: 'engineer_input' },
            })
          }
        />
        <Field
          label="عدد مخارج الطوارئ (اختياري)"
          value={design.egress.metrics.find((m) => m.label === 'عدد المخارج')?.value || ''}
          onChange={(v) => {
            const others = design.egress.metrics.filter((m) => m.label !== 'عدد المخارج');
            patch({
              egress: {
                ...design.egress,
                metrics: v.trim()
                  ? [
                      ...others,
                      {
                        label: 'عدد المخارج',
                        value: v,
                        note: 'مطابق للمخطط / إدخال المهندس',
                        source: 'engineer_input',
                      },
                    ]
                  : others,
              },
            });
          }}
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
