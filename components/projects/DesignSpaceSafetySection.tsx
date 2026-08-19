import { useMemo } from 'react';
import type { ClientRecord } from '@/lib/types/client';
import type {
  DesignSpaceSafetyArea,
  DesignSpaceSafetyFloor,
  DesignSpaceSafetyQuantities,
  DesignSpaceSafetyWorkingCopy,
} from '@/lib/projects/design-center/types';
import {
  createProjectArea,
  createProjectFloor,
  nonNegativeInteger,
  optionalNonNegativeNumber,
  floorSafetyTotals,
  projectSafetyTotals,
  safetyTotals,
  suggestAreaSafety,
} from '@/lib/projects/design-center/space-safety';

const SUPPRESSION_OPTIONS = ['رش آلي', 'طفايات', 'خراطيم Hose Reel', 'Standpipe', 'أنظمة إطفاء خاصة'];

const QUANTITY_FIELDS: Array<{
  key: Exclude<keyof DesignSpaceSafetyQuantities, 'alarm_panel_locations'>;
  label: string;
}> = [
  { key: 'sprinklers', label: 'عدد المرشات' },
  { key: 'smoke_detectors', label: 'عدد كواشف الدخان' },
  { key: 'fire_alarm_panels', label: 'عدد لوحات الإنذار' },
  { key: 'signs', label: 'عدد اللوحات الإرشادية' },
  { key: 'emergency_lights', label: 'عدد كشافات الطوارئ' },
  { key: 'emergency_exits', label: 'عدد مخارج الطوارئ' },
  { key: 'alarm_bells', label: 'عدد الأجراس / أجهزة التنبيه' },
  { key: 'emergency_stairs', label: 'عدد سلالم الطوارئ' },
  { key: 'elevators', label: 'عدد المصاعد' },
  { key: 'public_facilities', label: 'عدد المرافق العامة' },
];

type Props = {
  client: ClientRecord;
  value: DesignSpaceSafetyWorkingCopy;
  saving: boolean;
  onChange: (next: DesignSpaceSafetyWorkingCopy) => void;
};

function copyWithTimestamp(value: DesignSpaceSafetyWorkingCopy): DesignSpaceSafetyWorkingCopy {
  return { ...value, updated_at: new Date().toISOString() };
}

function totalsRows(total: ReturnType<typeof safetyTotals>) {
  return [
    ['المساحة', `${total.total_area_m2.toLocaleString('ar-SA')} م²`],
    ['المساحات', String(total.areas_count)],
    ['الشاغلون التقديريون', String(total.estimated_occupants)],
    ['أقصى مسافة سفر', total.max_travel_distance_m === null ? 'غير مدخلة' : `${total.max_travel_distance_m.toLocaleString('ar-SA')} م`],
    ['المرشات', String(total.sprinklers)],
    ['كواشف الدخان', String(total.smoke_detectors)],
    ['لوحات الإنذار', String(total.fire_alarm_panels)],
    ['اللوحات الإرشادية', String(total.signs)],
    ['الأجراس', String(total.alarm_bells)],
    ['كشافات الطوارئ', String(total.emergency_lights)],
    ['المخارج', String(total.emergency_exits)],
    ['سلالم الطوارئ', String(total.emergency_stairs)],
    ['المصاعد', String(total.elevators)],
    ['المرافق العامة', String(total.public_facilities)],
  ];
}

export default function DesignSpaceSafetySection({ client, value, saving, onChange }: Props) {
  const projectTotals = useMemo(() => projectSafetyTotals(value), [value]);

  const updateArea = (floorId: string, areaId: string, patch: Partial<DesignSpaceSafetyArea>) => {
    onChange(
      copyWithTimestamp({
        ...value,
        source: 'project_engineering',
        floors: value.floors.map((floor) =>
          floor.id !== floorId
            ? floor
            : {
                ...floor,
                areas: floor.areas.map((area) => (area.id === areaId ? { ...area, ...patch } : area)),
              }
        ),
      })
    );
  };

  const updateQuantities = (
    floorId: string,
    areaId: string,
    patch: Partial<DesignSpaceSafetyQuantities>
  ) => {
    const floor = value.floors.find((entry) => entry.id === floorId);
    const area = floor?.areas.find((entry) => entry.id === areaId);
    if (!area) return;
    updateArea(floorId, areaId, { quantities: { ...area.quantities, ...patch } });
  };

  const updateFloor = (floorId: string, patch: Partial<DesignSpaceSafetyFloor>) => {
    onChange(
      copyWithTimestamp({
        ...value,
        source: 'project_engineering',
        floors: value.floors.map((floor) => (floor.id === floorId ? { ...floor, ...patch } : floor)),
      })
    );
  };

  const removeArea = (floorId: string, areaId: string) => {
    onChange(
      copyWithTimestamp({
        ...value,
        source: 'project_engineering',
        floors: value.floors.map((floor) =>
          floor.id === floorId ? { ...floor, areas: floor.areas.filter((area) => area.id !== areaId) } : floor
        ),
      })
    );
  };

  const removeFloor = (floorId: string) => {
    onChange(copyWithTimestamp({ ...value, source: 'project_engineering', floors: value.floors.filter((floor) => floor.id !== floorId) }));
  };

  return (
    <div className="space-y-5" data-design-space-safety>
      <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <h3 className="font-bold">بيانات المساحات وأنظمة السلامة</h3>
        <p className="mt-1 text-xs leading-relaxed">
          هذه نسخة عمل هندسية للمشروع جرى توريثها مرة واحدة من البيانات الأساسية في المبيعات. تعديلها لا يغير بيانات Sales Basic Data الأصلية، ويمكن استخدامها لاحقًا كمصدر مساعد لجدول الكميات دون إنشاء BOQ تلقائيًا.
        </p>
        <p className="mt-2 text-[11px] text-sky-800">
          العميل: {client.business_name || client.name} · الحفظ الحالي: {saving ? 'جاري الحفظ...' : 'محفوظ داخل ملف المشروع'}
        </p>
      </section>

      {!value.floors.length ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
          <p className="text-sm font-semibold text-slate-800">لا توجد أدوار موروثة بعد.</p>
          <p className="mt-1 text-xs text-slate-500">يمكن للمهندس إضافة دور أو منطقة للمشروع دون تعديل بيانات المبيعات.</p>
        </section>
      ) : null}

      <div className="space-y-5">
        {value.floors.map((floor) => {
          const floorTotals = floorSafetyTotals(floor);
          return (
            <section key={floor.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="block text-xs font-semibold text-slate-600">اسم الدور / المنطقة</label>
                  <input
                    value={floor.label}
                    onChange={(event) => updateFloor(floor.id, { label: event.target.value })}
                    className="mt-1 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">عدد التكرارات: {Math.max(1, floor.repeat_count || 1)}</p>
                  <div className="mt-3 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                    <MetricField
                      label="عدد الشاغلين التقديري للدور"
                      value={floor.estimated_occupants}
                      step="1"
                      onChange={(value) => updateFloor(floor.id, { estimated_occupants: value })}
                    />
                    <MetricField
                      label="أقصى مسافة سفر للدور (م)"
                      value={floor.max_travel_distance_m}
                      step="0.1"
                      onChange={(value) => updateFloor(floor.id, { max_travel_distance_m: value })}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFloor(floor.id)}
                  className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  حذف الدور من نسخة المشروع
                </button>
              </header>

              <div className="space-y-4 p-4">
                {floor.areas.map((area) => (
                  <AreaEditor
                    key={area.id}
                    area={area}
                    onChange={(patch) => updateArea(floor.id, area.id, patch)}
                    onQuantities={(patch) => updateQuantities(floor.id, area.id, patch)}
                    onDelete={() => removeArea(floor.id, area.id)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => updateFloor(floor.id, { areas: [...floor.areas, createProjectArea()] })}
                  className="rounded-lg border border-dashed border-sky-400 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                >
                  + إضافة مساحة داخل هذا الدور
                </button>
              </div>

              <FloorSummary total={floorTotals} />
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onChange(copyWithTimestamp({ ...value, source: 'project_engineering', floors: [...value.floors, createProjectFloor()] }))}
        className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700"
      >
        + إضافة دور / منطقة للمشروع
      </button>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="text-sm font-bold text-emerald-950">ملخص المشروع</h3>
        <SummaryGrid total={projectTotals} />
        {projectTotals.alarm_panel_locations.length ? (
          <p className="mt-3 text-xs text-emerald-900">
            مواقع لوحات الإنذار: {projectTotals.alarm_panel_locations.join(' · ')}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function AreaEditor({
  area,
  onChange,
  onQuantities,
  onDelete,
}: {
  area: DesignSpaceSafetyArea;
  onChange: (patch: Partial<DesignSpaceSafetyArea>) => void;
  onQuantities: (patch: Partial<DesignSpaceSafetyQuantities>) => void;
  onDelete: () => void;
}) {
  const activeSystems = area.suppression_approved ?? area.suppression_suggested;
  const panelLocations = area.quantities.alarm_panel_locations;

  const setSystems = (system: string, checked: boolean) => {
    const current = activeSystems || [];
    const next = checked ? [...new Set([...current, system])] : current.filter((entry) => entry !== system);
    onChange({ suppression_approved: next });
  };

  const setLocation = (index: number, text: string) => {
    const next = panelLocations.map((location, locationIndex) => (locationIndex === index ? text : location));
    onQuantities({ alarm_panel_locations: next });
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="مسمى المساحة" value={area.label} onChange={(value) => onChange({ label: value })} />
          <Field
            label="النشاط / التصنيف"
            value={area.activity_type || ''}
            onChange={(value) => {
              const activity_type = value || null;
              onChange({ activity_type, ...suggestAreaSafety({ ...area, activity_type }) });
            }}
          />
          <NumberField
            label="المساحة م²"
            value={area.area_m2}
            onChange={(value) => {
              const area_m2 = Math.max(0, Number(value) || 0);
              onChange({ area_m2, ...suggestAreaSafety({ ...area, area_m2 }) });
            }}
          />
          <MetricField
            label="عدد الشاغلين التقديري"
            value={area.estimated_occupants}
            step="1"
            onChange={(estimated_occupants) => onChange({ estimated_occupants })}
          />
          <MetricField
            label="أقصى مسافة سفر (م)"
            value={area.max_travel_distance_m}
            step="0.1"
            onChange={(max_travel_distance_m) => onChange({ max_travel_distance_m })}
          />
        </div>
        <button type="button" onClick={onDelete} className="rounded-lg border border-rose-200 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">
          حذف المساحة
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-950">درجة الخطورة</p>
          <p className="mt-1 text-sm text-amber-900">المقترحة: {area.hazard_suggested || 'تتطلب مراجعة مهندس'}</p>
          <p className="mt-1 text-[11px] text-amber-800">{area.hazard_source || 'لا توجد قاعدة اقتراح مرتبطة بعد'}</p>
          <label className="mt-2 block text-[11px] font-semibold text-amber-900">القيمة المعتمدة من المهندس</label>
          <input
            value={area.hazard_approved || ''}
            placeholder="اتركها فارغة لاعتماد المقترح بعد المراجعة"
            onChange={(event) => onChange({ hazard_approved: event.target.value || null })}
            className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
          />
        </section>

        <section className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs font-bold text-rose-950">نظام الإطفاء</p>
          <p className="mt-1 text-[11px] text-rose-800">المقترح: {area.suppression_suggested.join(' · ') || 'تتطلب مراجعة مهندس'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUPPRESSION_OPTIONS.map((system) => (
              <label key={system} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-950">
                <input type="checkbox" checked={activeSystems.includes(system)} onChange={(event) => setSystems(system, event.target.checked)} />
                {system}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-rose-800">{area.suppression_source || 'يمكن للمهندس اعتماد أو تعديل النظام المقترح.'}</p>
        </section>
      </div>

      <section className="mt-4">
        <h4 className="text-xs font-bold text-slate-800">كميات أنظمة السلامة للمساحة</h4>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUANTITY_FIELDS.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              value={area.quantities[key]}
              onChange={(value) => onQuantities({ [key]: nonNegativeInteger(value) })}
            />
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-800">مواقع لوحات الإنذار</h4>
            <p className="text-[11px] text-slate-500">يسمح بأكثر من موقع عند وجود أكثر من لوحة.</p>
          </div>
          <button type="button" onClick={() => onQuantities({ alarm_panel_locations: [...panelLocations, ''] })} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
            + موقع
          </button>
        </div>
        {panelLocations.length ? (
          <div className="mt-2 space-y-2">
            {panelLocations.map((location, index) => (
              <div key={`${area.id}-panel-${index}`} className="flex gap-2">
                <input
                  value={location}
                  placeholder="مثال: بجوار المدخل الرئيسي — غرفة الأمن"
                  onChange={(event) => setLocation(index, event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => onQuantities({ alarm_panel_locations: panelLocations.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg border border-rose-200 px-2 text-xs text-rose-700">
                  حذف
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">لم تُسجل مواقع لوحات إنذار لهذه المساحة.</p>
        )}
      </section>
    </article>
  );
}

function FloorSummary({ total }: { total: ReturnType<typeof safetyTotals> }) {
  return (
    <footer className="border-t border-slate-100 bg-slate-50 p-4">
      <h4 className="text-xs font-bold text-slate-800">ملخص الدور</h4>
      <SummaryGrid total={total} />
    </footer>
  );
}

function SummaryGrid({ total }: { total: ReturnType<typeof safetyTotals> }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
      {totalsRows(total).map(([label, value]) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <dt className="text-slate-500">{label}</dt>
          <dd className="mt-0.5 font-bold text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
    </label>
  );
}

function MetricField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  step: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <input
        type="number"
        min="0"
        step={step}
        value={value ?? ''}
        placeholder="غير مدخل"
        onChange={(event) => onChange(optionalNonNegativeNumber(event.target.value))}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
      />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <input type="number" min="0" step="1" value={Math.max(0, Number(value) || 0)} onChange={(event) => onChange(nonNegativeInteger(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
    </label>
  );
}
