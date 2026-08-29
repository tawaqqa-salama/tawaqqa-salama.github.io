'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  applyTechnicalReportSourceOverride,
  buildTechnicalReportSourceData,
  type TechnicalReportBridgeValue,
  type TechnicalReportSourceField,
} from '@/lib/projects/technical-report-source-data';
import {
  buildExistingTechnicalReportMissingData,
  existingTechnicalReportMissingCount,
} from '@/lib/projects/existing-technical-report-missing-data';
import { isFieldEditable, sourceBadge, sourceLabel } from '@/lib/projects/technical-report-ui';
import {
  normalizeTechnicalEvidenceState,
  uploadTechnicalEvidenceFile,
  validateTechnicalEvidenceUpload,
} from '@/lib/projects/technical-report-evidence';
import {
  resolveTechnicalReportPhotoSrc,
  uploadTechnicalReportPhoto,
} from '@/lib/projects/technical-report-photos';
import type { ClientRecord } from '@/lib/types/client';
import type {
  CivilDefenseLocationEvidence,
  ProjectEngineeringData,
  TechnicalEvidenceItem,
  TechnicalEvidenceState,
  TechnicalReport,
  TechnicalReportComponentRow,
  TechnicalReportPhoto,
  TechnicalReportSiteSurroundings,
} from '@/lib/types/project-reports';

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  report: TechnicalReport;
  saving: boolean;
  onChange: (next: TechnicalReport) => void;
};

const CONTROL =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100';

function rowId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function emptyComponentRow(): TechnicalReportComponentRow {
  return {
    id: rowId('component'),
    part_name: '',
    structure: '',
    classification: '',
    area_m2: '',
    use: '',
    floors_count: '',
    height: '',
    capacity: '',
    description: '',
  };
}

export default function ExistingTechnicalReportInputsSection({
  client,
  data,
  report,
  saving,
  onChange,
}: Props) {
  const source = useMemo(
    () => buildTechnicalReportSourceData({ client, engineeringData: { ...data, technical_report: report } }),
    [client, data, report]
  );
  const missingItems = useMemo(() => buildExistingTechnicalReportMissingData(client, data), [client, data]);
  const missingCount = existingTechnicalReportMissingCount(client, data);
  const evidence = useMemo(() => normalizeTechnicalEvidenceState(report.evidence), [report.evidence]);
  const civilDefense = evidence.civil_defense || {};
  const surroundings = report.site_surroundings || {};
  const components = report.components || [];

  const patch = (partial: Partial<TechnicalReport>) => onChange({ ...report, ...partial });
  const setOverride = (fieldKey: string, value: TechnicalReportBridgeValue) =>
    onChange(applyTechnicalReportSourceOverride({ report, fieldKey, value, approvedAt: nowIso() }));
  const clearOverride = (fieldKey: string) => {
    const sourceOverrides = { ...(report.source_overrides || {}) };
    delete sourceOverrides[fieldKey];
    patch({ source_overrides: Object.keys(sourceOverrides).length ? sourceOverrides : undefined });
  };

  const replaceEvidence = (next: TechnicalEvidenceState) => patch({ evidence: next });

  const updateCivilDefense = (partial: Partial<CivilDefenseLocationEvidence>) => {
    replaceEvidence({
      ...evidence,
      civil_defense: { ...(evidence.civil_defense || {}), ...partial },
    });
  };

  const patchSurroundings = (partial: Partial<TechnicalReportSiteSurroundings>) => {
    patch({ site_surroundings: { ...surroundings, ...partial } });
  };

  const upsertComponent = (id: string, partial: Partial<TechnicalReportComponentRow>) => {
    const rows = components.some((row) => row.id === id)
      ? components.map((row) => (row.id === id ? { ...row, ...partial } : row))
      : [...components, { ...emptyComponentRow(), id, ...partial }];
    patch({ components: rows });
  };

  const removeComponent = (id: string) => patch({ components: components.filter((row) => row.id !== id) });

  return (
    <section dir="rtl" className="space-y-5" aria-label="بيانات التقرير الفني للموقع القائم">
      <header className="rounded-2xl border border-teal-100 bg-teal-50/80 p-4">
        <h3 className="text-lg font-bold text-teal-950">بيانات التقرير الفني للموقع القائم</h3>
        <p className="mt-2 text-xs leading-6 text-teal-900">
          تُستخدم هذه البيانات في صفحات 3–6 من التقرير النهائي. الحقول الموروثة من «البيانات الأساسية» تظهر
          تلقائيًا ويمكن تعديلها وفق نمط المنصة. اضغط «حفظ المرحلة» بعد أي تعديل.
        </p>
        <p className="mt-2 text-xs leading-6 text-slate-700">
          عند الطباعة من المتصفح مباشرة قد يظهر الرابط والتاريخ في أسفل الصفحة — هذا من إعدادات المتصفح. عطّل
          «رؤوس وتذييلات الصفحة» في نافذة الطباعة، أو استخدم «تحميل PDF» للنسخة الرسمية.
        </p>
      </header>

      <MissingDataChecklist items={missingItems} missingCount={missingCount} />

      <Group title="أ) بيانات المنشأة">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <BridgeValue label="اسم المنشأة / المشروع" field={source.project.project_name} fieldKey="project.project_name" setOverride={setOverride} clearOverride={clearOverride} />
          <BridgeValue label="النشاط / الاستخدام" field={source.project.activity} fieldKey="project.activity" setOverride={setOverride} clearOverride={clearOverride} />
          <BridgeValue label="اسم المالك / المستثمر" field={source.project.owner_name} fieldKey="project.owner_name" setOverride={setOverride} clearOverride={clearOverride} />
          <BridgeValue label="رقم رخصة البناء" field={source.project.building_permit_number} fieldKey="project.building_permit_number" setOverride={setOverride} clearOverride={clearOverride} />
          <BridgeValue label="تاريخ رخصة البناء" field={source.project.building_permit_date} fieldKey="project.building_permit_date" setOverride={setOverride} clearOverride={clearOverride} />
          <BridgeValue label="مساحة الموقع العام m²" field={source.project.land_area_m2} fieldKey="project.land_area_m2" setOverride={setOverride} clearOverride={clearOverride} type="number" suffix="م²" />
          <BridgeValue label="مساحة البناء m²" field={source.project.building_area_m2} fieldKey="project.building_area_m2" setOverride={setOverride} clearOverride={clearOverride} type="number" suffix="م²" />
          <BridgeValue label="عدد الأدوار" field={source.project.floors_count} fieldKey="project.floors_count" setOverride={setOverride} clearOverride={clearOverride} type="number" />
          <ManualField label="وصف الأدوار" value={report.floors_description || source.plan.floors_description.value?.toString() || ''} onChange={(value) => patch({ floors_description: value })} />
          <ManualField label="تصنيف المبنى" value={report.building_classification || ''} onChange={(value) => patch({ building_classification: value })} />
          <BridgeValue label="تصنيف الإشغال" field={source.plan.occupancy_classification} fieldKey="plan.occupancy_classification" setOverride={setOverride} clearOverride={clearOverride} />
          <ManualField label="درجة الخطورة" value={report.risk_class || ''} onChange={(value) => patch({ risk_class: value })} />
          <BridgeValue label="المدينة" field={source.project.city} fieldKey="project.city" setOverride={setOverride} clearOverride={clearOverride} />
          <BridgeValue label="الحي" field={source.project.district} fieldKey="project.district" setOverride={setOverride} clearOverride={clearOverride} />
          <BridgeValue label="الشارع" field={source.project.street} fieldKey="project.street" setOverride={setOverride} clearOverride={clearOverride} />
          <ManualField label="رابط الموقع Google Maps" value={report.maps_url || ''} onChange={(value) => patch({ maps_url: value })} placeholder="https://maps.google.com/..." />
          <ManualField label="Latitude" value={report.gps_lat || ''} onChange={(value) => patch({ gps_lat: value })} placeholder="24.xxxx" />
          <ManualField label="Longitude" value={report.gps_lng || ''} onChange={(value) => patch({ gps_lng: value })} placeholder="46.xxxx" />
        </div>
      </Group>

      <Group title="ب) صورة واجهة المشروع">
        <PhotoField label="صورة واجهة المشروع" clientId={client.id} photo={report.facade_photo} disabled={saving} onChange={(facade_photo) => patch({ facade_photo })} />
      </Group>

      <Group title="ج) الموقع">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ManualField label="وصف الموقع" value={report.location_description || ''} onChange={(value) => patch({ location_description: value })} multiline />
          <ManualField label="الشارع" value={source.project.street.value?.toString() || ''} onChange={(value) => setOverride('project.street', value || null)} hint="موروث من البيانات الأساسية — عدّل هنا إن لزم" />
          <ManualField label="الحي" value={source.project.district.value?.toString() || ''} onChange={(value) => setOverride('project.district', value || null)} />
          <ManualField label="المدينة" value={source.project.city.value?.toString() || ''} onChange={(value) => setOverride('project.city', value || null)} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ManualField label="شمالاً" value={surroundings.north || ''} onChange={(north) => patchSurroundings({ north })} />
          <ManualField label="جنوباً" value={surroundings.south || ''} onChange={(south) => patchSurroundings({ south })} />
          <ManualField label="شرقاً" value={surroundings.east || ''} onChange={(east) => patchSurroundings({ east })} />
          <ManualField label="غرباً" value={surroundings.west || ''} onChange={(west) => patchSurroundings({ west })} />
        </div>
        <div className="mt-4">
          <PhotoField label="الصورة الجوية للموقع" clientId={client.id} photo={report.earth_photo} disabled={saving} onChange={(earth_photo) => patch({ earth_photo })} />
        </div>
      </Group>

      <Group title="د) وصول آليات الدفاع المدني">
        <p className="mb-3 text-xs leading-6 text-slate-600">أدخل المسافة والزمن يدويًا — لا يحسبها النظام تلقائيًا.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ManualField label="اسم أقرب مركز دفاع مدني" value={civilDefense.center_name || ''} onChange={(center_name) => updateCivilDefense({ center_name: center_name || null })} />
          <ManualField label="المسافة km" value={civilDefense.distance_value == null ? '' : String(civilDefense.distance_value)} onChange={(value) => updateCivilDefense({ distance_value: value === '' ? null : Number(value), distance_unit: 'km' })} type="number" />
          <ManualField label="زمن الوصول بالدقائق" value={civilDefense.travel_time_minutes == null ? '' : String(civilDefense.travel_time_minutes)} onChange={(value) => updateCivilDefense({ travel_time_minutes: value === '' ? null : Number(value) })} type="number" />
          <ManualField label="وصف مسار الوصول" value={civilDefense.route_description || ''} onChange={(route_description) => updateCivilDefense({ route_description: route_description || null })} multiline />
          <ManualField label="تاريخ التحقق" value={civilDefense.engineer_confirmed_at || ''} onChange={(engineer_confirmed_at) => updateCivilDefense({ engineer_confirmed_at: engineer_confirmed_at || null })} type="date" />
          <ManualField label="مصدر المعلومة" value={civilDefense.source_label || ''} onChange={(source_label) => updateCivilDefense({ source_label: source_label || null })} />
          <ManualField label="رابط الخرائط / المصدر" value={civilDefense.maps_source_url || ''} onChange={(maps_source_url) => updateCivilDefense({ maps_source_url: maps_source_url || null })} placeholder="https://..." />
        </div>
        <div className="mt-4">
          <CivilDefenseRoutePhotoField clientId={client.id} evidence={evidence} disabled={saving} onChange={replaceEvidence} />
        </div>
      </Group>

      <Group title="هـ) مكونات المشروع">
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-xs">
              <tr>
                {['اسم المكون', 'الاستخدام', 'المساحة m²', 'عدد الأدوار', 'الارتفاع', 'السعة / الحمولة', 'الوصف', 'تصنيف الخطورة', 'نوع الإنشاء', ''].map((heading) => (
                  <th key={heading || 'actions'} className="px-2 py-2 text-start font-bold text-slate-700">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {components.length ? components.map((row) => (
                <tr key={row.id} className="border-t border-slate-200">
                  {([['part_name'], ['use'], ['area_m2'], ['floors_count'], ['height'], ['capacity'], ['description'], ['classification'], ['structure']] as const).map(([key]) => (
                    <td key={key} className="px-1 py-1">
                      <input className={CONTROL} value={row[key] || ''} onChange={(event) => upsertComponent(row.id, { [key]: event.target.value })} />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <button type="button" disabled={saving} onClick={() => removeComponent(row.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-800 disabled:opacity-40">حذف</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-xs text-slate-500">لا توجد مكونات بعد. اضغط «+ إضافة مكون».</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button type="button" disabled={saving} onClick={() => patch({ components: [...components, emptyComponentRow()] })} className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800">+ إضافة مكون</button>
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-900">{title}</h4>
      {children}
    </section>
  );
}

function MissingDataChecklist({ items, missingCount }: { items: ReturnType<typeof buildExistingTechnicalReportMissingData>; missingCount: number }) {
  return (
    <div className={`rounded-2xl border p-4 ${missingCount ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900">قائمة البيانات الناقصة قبل الاعتماد</h4>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${missingCount ? 'bg-amber-200 text-amber-950' : 'bg-emerald-200 text-emerald-950'}`}>{missingCount ? `${missingCount} بند ناقص` : 'جاهز للاعتماد'}</span>
      </div>
      <ul className="mt-3 space-y-1 text-xs leading-6">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <span aria-hidden="true">{item.complete ? '✓' : '○'}</span>
            <span className={item.complete ? 'text-emerald-900' : 'text-amber-950'}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ManualField({ label, value, onChange, multiline = false, placeholder, hint, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string; hint?: string; type?: 'text' | 'number' | 'date' }) {
  return (
    <label className="block rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <span className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">{label}<span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600">إدخال يدوي</span></span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${CONTROL} min-h-24`} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={CONTROL} />}
      {hint ? <p className="mt-1 text-[10px] text-slate-500">{hint}</p> : null}
    </label>
  );
}

function BridgeValue({ label, field, fieldKey, setOverride, clearOverride, type = 'text', suffix }: { label: string; field: TechnicalReportSourceField; fieldKey: string; setOverride: (key: string, value: TechnicalReportBridgeValue) => void; clearOverride: (key: string) => void; type?: 'text' | 'number'; suffix?: string }) {
  const editable = isFieldEditable(field);
  const display = field.value === null || field.value === '' ? '—' : String(field.value);
  const commit = (value: string) => setOverride(fieldKey, type === 'number' ? (value === '' ? null : Number(value)) : value || null);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{sourceBadge(field)} · {sourceLabel(field)}</span>
      </div>
      {editable ? <input type={type} value={typeof field.value === 'boolean' ? String(field.value) : field.value ?? ''} onChange={(event) => commit(event.target.value)} className={CONTROL} /> : <p className="min-h-9 rounded-lg border border-transparent bg-white px-2.5 py-2 text-sm font-semibold text-slate-800">{display}{suffix ? ` ${suffix}` : ''}</p>}
      {field.engineer_override ? <button type="button" onClick={() => clearOverride(fieldKey)} className="mt-2 text-[11px] font-semibold text-slate-500 underline">استعادة القيمة الموروثة</button> : null}
    </div>
  );
}

function PhotoField({ label, clientId, photo, disabled, onChange }: { label: string; clientId: string; photo: TechnicalReportPhoto | null | undefined; disabled: boolean; onChange: (photo: TechnicalReportPhoto | null) => void }) {
  const [preview, setPreview] = useState<string | null>(photo?.dataUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (photo?.dataUrl) { setPreview(photo.dataUrl); return; }
      const src = await resolveTechnicalReportPhotoSrc(photo);
      if (!cancelled) setPreview(src);
    })();
    return () => { cancelled = true; };
  }, [photo]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png)$/i.test(file.type)) { setError('يُقبل JPEG أو PNG فقط.'); return; }
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadTechnicalReportPhoto({ clientId, file, caption: label });
      onChange(uploaded);
      setPreview(uploaded.dataUrl || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر رفع الصورة.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-bold text-slate-900">{label}</p><p className="mt-1 text-xs text-slate-600">JPEG أو PNG · تُحفظ في Storage مع بيانات المشروع</p></div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900">{uploading ? 'جاري الرفع...' : photo ? 'استبدال' : 'رفع صورة'}<input type="file" accept="image/jpeg,image/png" className="hidden" disabled={disabled || uploading} onChange={(event) => void onFile(event)} /></label>
          {photo ? <button type="button" disabled={disabled || uploading} onClick={() => { onChange(null); setPreview(null); }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">حذف</button> : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-2">{preview ? <img src={preview} alt={label} className="mx-auto max-h-64 w-full object-contain" /> : <p className="py-10 text-center text-xs text-slate-500">لا توجد صورة مرفوعة بعد.</p>}</div>
    </div>
  );
}

function CivilDefenseRoutePhotoField({ clientId, evidence, disabled, onChange }: { clientId: string; evidence: TechnicalEvidenceState; disabled: boolean; onChange: (next: TechnicalEvidenceState) => void }) {
  const routeId = evidence.civil_defense?.route_evidence_id;
  const routeItem = (routeId ? evidence.items.find((item) => item.id === routeId) : undefined) || evidence.items.find((item) => item.kind === 'civil_defense_route');
  const [preview, setPreview] = useState<string | null>(routeItem?.file.dataUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setPreview(routeItem?.file.dataUrl || null); }, [routeItem?.file.dataUrl, routeItem?.id]);

  const upload = async (file: File) => {
    const validation = validateTechnicalEvidenceUpload(file);
    if (!validation.ok) { setError(validation.error); return; }
    setUploading(true);
    setError(null);
    try {
      const id = rowId('cd-route');
      const outcome = await uploadTechnicalEvidenceFile({ clientId, evidenceId: id, kind: 'civil_defense_route', file });
      const withoutOld = evidence.items.filter((item) => item.kind !== 'civil_defense_route' && item.id !== routeId);
      const item: TechnicalEvidenceItem = {
        id, kind: 'civil_defense_route', category: 'civil_defense_route', title: 'صورة مسار أقرب مركز دفاع مدني', caption: null, engineering_observation: null,
        display_order: withoutOld.length + 1, include_in_report: true, association: null, file: outcome.file, code_reference: null, created_at: nowIso(),
      };
      onChange({ ...evidence, civil_defense: { ...(evidence.civil_defense || {}), route_evidence_id: id }, items: [...withoutOld, item] });
      setPreview(outcome.file.dataUrl || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر رفع الصورة.');
    } finally {
      setUploading(false);
    }
  };

  const remove = () => {
    onChange({ ...evidence, civil_defense: { ...(evidence.civil_defense || {}), route_evidence_id: null }, items: evidence.items.filter((item) => item.id !== routeItem?.id) });
    setPreview(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-bold text-slate-900">صورة مسار أقرب مركز دفاع مدني</p><p className="mt-1 text-xs text-slate-600">توثّق الخريطة والمسار والوقت كما في نموذج التقرير</p></div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900">{uploading ? 'جاري الرفع...' : routeItem ? 'استبدال' : 'رفع صورة'}<input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" disabled={disabled || uploading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} /></label>
          {routeItem ? <button type="button" disabled={disabled || uploading} onClick={remove} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">حذف</button> : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-2">{preview ? <img src={preview} alt="مسار الدفاع المدني" className="mx-auto max-h-64 w-full object-contain" /> : <p className="py-10 text-center text-xs text-slate-500">لم يتم إرفاق صورة مسار الدفاع المدني.</p>}</div>
    </div>
  );
}
