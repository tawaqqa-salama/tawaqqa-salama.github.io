'use client';

import { useMemo, useState } from 'react';
import {
  BUILDING_STATUS_OPTIONS,
  TECH_REPORT_GENERAL_RECOMMENDATIONS,
  TECH_REPORT_ITEMS,
  type TechReportChapterId,
} from '@/lib/constants/technical-report';
import {
  applyTechnicalReportSourceOverride,
  buildTechnicalReportSourceData,
  type TechnicalReportBridgeValue,
  type TechnicalReportSourceField,
} from '@/lib/projects/technical-report-source-data';
import {
  buildTechnicalReportUiModel,
  isFieldEditable,
  sectionStatusLabel,
  sourceBadge,
  sourceLabel,
  TECHNICAL_REPORT_UI_SECTIONS,
  type TechnicalReportUiSectionId,
} from '@/lib/projects/technical-report-ui';
import type { ClientRecord } from '@/lib/types/client';
import type {
  ProjectEngineeringData,
  TechnicalEvidenceState,
  TechnicalReport,
  TechnicalReportRecommendation,
  TechnicalReportSectionItem,
} from '@/lib/types/project-reports';
import TechnicalEvidenceManager from '@/components/projects/TechnicalEvidenceManager';
import TechnicalRecommendationReview from '@/components/projects/TechnicalRecommendationReview';
import FireProtectionDesignSection from '@/components/projects/FireProtectionDesignSection';
import FireAlarmAndSupportingSystemsSection from '@/components/projects/FireAlarmAndSupportingSystemsSection';
import type { FireProtectionDesign } from '@/lib/types/fire-protection-design';

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

const SECTION_CHAPTER: Partial<Record<TechnicalReportUiSectionId, TechReportChapterId>> = {
  project_summary: 'facility',
  fire_fighting: 'firefighting',
  mechanical: 'ventilation',
  alarm_evacuation: 'alarm',
  egress: 'exits',
  observations: 'recommendations',
};

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  report: TechnicalReport;
  onChange: (next: TechnicalReport) => void;
  onSave: () => void;
  onPreview: () => void;
  onPrint: () => void;
  onDownload: () => void;
  saving: boolean;
  onPersistEvidenceMetadata: (next: TechnicalEvidenceState) => Promise<void>;
  /** The same canonical project-level state previously rendered above this report. */
  fireProtectionDesign: FireProtectionDesign;
  fireProtectionHighlighted?: boolean;
  onFireProtectionDesignChange: (next: FireProtectionDesign) => void;
  /** Preserved workflow marker; it does not control accordion visibility. */
  chapter?: TechReportChapterId;
  onChapterChange?: (chapter: TechReportChapterId) => void;
};

export default function TechnicalReportSection({
  client,
  data,
  report,
  onChange,
  onSave,
  onPreview,
  onPrint,
  onDownload,
  saving,
  onPersistEvidenceMetadata,
  fireProtectionDesign,
  fireProtectionHighlighted,
  onFireProtectionDesignChange,
  chapter,
  onChapterChange,
}: Props) {
  const [openSections, setOpenSections] = useState<TechnicalReportUiSectionId[]>(['project_summary', 'occupancy_spaces']);
  const ui = useMemo(() => buildTechnicalReportUiModel({ client, data: { ...data, technical_report: report } }), [client, data, report]);
  const source = ui.source;

  const patch = (partial: Partial<TechnicalReport>) => onChange({ ...report, ...partial });
  const setOverride = (fieldKey: string, value: TechnicalReportBridgeValue) =>
    onChange(applyTechnicalReportSourceOverride({ report, fieldKey, value, approvedAt: new Date().toISOString() }));
  const clearOverride = (fieldKey: string) => {
    const sourceOverrides = { ...(report.source_overrides || {}) };
    delete sourceOverrides[fieldKey];
    patch({ source_overrides: Object.keys(sourceOverrides).length ? sourceOverrides : undefined });
  };
  const toggle = (id: TechnicalReportUiSectionId) => {
    setOpenSections((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    const nextChapter = SECTION_CHAPTER[id];
    if (nextChapter && onChapterChange) onChapterChange(nextChapter);
  };

  const updateItems = (
    key: 'firefighting_items' | 'ventilation_items' | 'alarm_items' | 'exits_items',
    itemId: string,
    updater: (item: TechnicalReportSectionItem) => TechnicalReportSectionItem
  ) => patch({ [key]: report[key].map((item) => (item.id === itemId ? updater(item) : item)) });

  return (
    <div className="space-y-4" dir="rtl">
      <header className="sticky top-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900">التقرير الفني والدراسة</h3>
              <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">مصدر موحّد للمراحل السابقة</span>
              {chapter ? <span className="text-[11px] text-slate-500">باب المسار: {chapter}</span> : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">تُعرض القيم الموروثة بمصدرها وحالتها. لا يعيد التقرير الكتابة إلى البيانات الأساسية أو مركز التصاميم أو معلومات المخطط.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={report.status} onChange={(e) => patch({ status: e.target.value as TechnicalReport['status'] })} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
              {REPORT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <button type="button" onClick={onPreview} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">معاينة</button>
            <button type="button" onClick={onPrint} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">طباعة A4</button>
            <button type="button" onClick={onDownload} className="rounded-xl border border-slate-800 bg-slate-800 px-3 py-2 text-sm font-semibold text-white">تحميل PDF</button>
            <button type="button" disabled={saving} onClick={onSave} className="rounded-xl bg-[#635bdb] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'جاري الحفظ...' : 'حفظ التقرير'}</button>
          </div>
        </div>
      </header>

      <div className="space-y-3">
        {TECHNICAL_REPORT_UI_SECTIONS.map((section) => {
          const isOpen = openSections.includes(section.id);
          const stats = ui.sections[section.id];
          return (
            <section key={section.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button type="button" onClick={() => toggle(section.id)} className="flex w-full items-start justify-between gap-3 p-4 text-right transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#635bdb]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{section.title}</span>
                    <StatusPill status={stats.status} />
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{isOpen ? section.description : sectionSummary(section.id, source, report, stats.missing)}</p>
                </div>
                <div className="shrink-0 text-left text-xs leading-5 text-slate-500">
                  <span className="block">موروث {stats.autoFilled}</span>
                  <span className="block">مراجعة {stats.engineerReview + stats.manual}</span>
                  <span className="block">ناقص {stats.missing}</span>
                  <span className="block text-lg text-slate-400">{isOpen ? '⌃' : '⌄'}</span>
                </div>
              </button>
              {isOpen ? (
                <div className="border-t border-slate-100 p-4">
                  <SectionBody
                    id={section.id}
                    source={source}
                    report={report}
                    setOverride={setOverride}
                    clearOverride={clearOverride}
                    patch={patch}
                    updateItems={updateItems}
                    client={client}
                    clientId={client.id}
                    data={data}
                    saving={saving}
                    onPersistEvidenceMetadata={onPersistEvidenceMetadata}
                    fireProtectionDesign={fireProtectionDesign}
                    fireProtectionHighlighted={fireProtectionHighlighted}
                    onFireProtectionDesignChange={onFireProtectionDesignChange}
                  />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'COMPLETE' | 'NEEDS_REVIEW' | 'MISSING_DATA' }) {
  const style = status === 'COMPLETE' ? 'bg-emerald-50 text-emerald-800' : status === 'NEEDS_REVIEW' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style}`}>{sectionStatusLabel(status)}</span>;
}

function BridgeValue({
  label,
  field,
  fieldKey,
  setOverride,
  clearOverride,
  type = 'text',
  suffix,
}: {
  label: string;
  field: TechnicalReportSourceField;
  fieldKey: string;
  setOverride: (key: string, value: TechnicalReportBridgeValue) => void;
  clearOverride: (key: string) => void;
  type?: 'text' | 'number';
  suffix?: string;
}) {
  const editable = isFieldEditable(field);
  const display = field.value === null || field.value === '' ? '—' : String(field.value);
  const commit = (value: string) => setOverride(fieldKey, type === 'number' ? (value === '' ? null : Number(value)) : value || null);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{sourceBadge(field)} · {sourceLabel(field)}</span>
      </div>
      {editable ? (
        <input type={type} value={typeof field.value === 'boolean' ? String(field.value) : field.value ?? ''} onChange={(event) => commit(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800" />
      ) : (
        <p className="min-h-9 rounded-lg border border-transparent bg-white px-2.5 py-2 text-sm font-semibold text-slate-800">{display}{suffix ? ` ${suffix}` : ''}</p>
      )}
      {field.classification === 'AUTO_SUGGEST' && field.value !== null ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => setOverride(fieldKey, field.value)} className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700">اعتماد الاقتراح</button>
          <span className="self-center text-[11px] text-slate-500">عدّل القيمة أعلاه لتسجيل قرار المهندس.</span>
        </div>
      ) : null}
      {field.engineer_override ? <button type="button" onClick={() => clearOverride(fieldKey)} className="mt-2 text-[11px] font-semibold text-slate-500 underline">استعادة القيمة الموروثة</button> : null}
    </div>
  );
}

function ManualField({ label, value, onChange, multiline = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string }) {
  return (
    <label className="block rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <span className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">{label}<span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600">إدخال يدوي</span></span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" />}
    </label>
  );
}

function SectionBody({
  id,
  source,
  report,
  setOverride,
  clearOverride,
  patch,
  updateItems,
  client,
  clientId,
  data,
  saving,
  onPersistEvidenceMetadata,
  fireProtectionDesign,
  fireProtectionHighlighted,
  onFireProtectionDesignChange,
}: {
  id: TechnicalReportUiSectionId;
  source: ReturnType<typeof buildTechnicalReportSourceData>;
  report: TechnicalReport;
  setOverride: (key: string, value: TechnicalReportBridgeValue) => void;
  clearOverride: (key: string) => void;
  patch: (partial: Partial<TechnicalReport>) => void;
  updateItems: (key: 'firefighting_items' | 'ventilation_items' | 'alarm_items' | 'exits_items', itemId: string, updater: (item: TechnicalReportSectionItem) => TechnicalReportSectionItem) => void;
  client: ClientRecord;
  clientId: string;
  data: ProjectEngineeringData;
  saving: boolean;
  onPersistEvidenceMetadata: (next: TechnicalEvidenceState) => Promise<void>;
  fireProtectionDesign: FireProtectionDesign;
  fireProtectionHighlighted?: boolean;
  onFireProtectionDesignChange: (next: FireProtectionDesign) => void;
}) {
  if (id === 'project_summary') return <ProjectSummary source={source} setOverride={setOverride} clearOverride={clearOverride} />;
  if (id === 'occupancy_spaces') return <OccupancySpaces source={source} setOverride={setOverride} clearOverride={clearOverride} />;
  if (id === 'structural') return <Structural source={source} setOverride={setOverride} clearOverride={clearOverride} fireProtectionDesign={fireProtectionDesign} onFireProtectionDesignChange={onFireProtectionDesignChange} />;
  if (id === 'egress') return <Egress source={source} report={report} setOverride={setOverride} clearOverride={clearOverride} updateItems={updateItems} fireProtectionDesign={fireProtectionDesign} onFireProtectionDesignChange={onFireProtectionDesignChange} />;
  if (id === 'civil_defense') return <CivilDefense source={source} report={report} patch={patch} />;
  if (id === 'fire_fighting') return <div className="space-y-5"><FireProtectionDesignSection design={fireProtectionDesign} highlighted={fireProtectionHighlighted} onChange={onFireProtectionDesignChange} /><SafetySystems source={source} report={report} setOverride={setOverride} clearOverride={clearOverride} updateItems={updateItems} kind="fire" /></div>;
  if (id === 'alarm_evacuation') return <div className="space-y-5"><FireAlarmAndSupportingSystemsSection design={fireProtectionDesign} onChange={onFireProtectionDesignChange} /><SafetySystems source={source} report={report} setOverride={setOverride} clearOverride={clearOverride} updateItems={updateItems} kind="alarm" /></div>;
  if (id === 'electrical') return <Electrical source={source} report={report} patch={patch} />;
  if (id === 'mechanical') return <Mechanical report={report} updateItems={updateItems} />;
  if (id === 'evidence') return <Evidence clientId={clientId} data={data} report={report} saving={saving} patch={patch} onPersistEvidenceMetadata={onPersistEvidenceMetadata} />;
  if (id === 'observations') return <Observations report={report} patch={patch} updateItems={updateItems} />;
  if (id === 'recommendation_review') return <TechnicalRecommendationReview client={client} report={report} source={source} saving={saving} onChange={(next) => patch(next)} />;
  return <Approval report={report} patch={patch} />;
}

function ProjectSummary({ source, setOverride, clearOverride }: Pick<Parameters<typeof SectionBody>[0], 'source' | 'setOverride' | 'clearOverride'>) {
  const p = source.project;
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <BridgeValue label="اسم المشروع / المنشأة" field={p.project_name} fieldKey="project.project_name" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="المالك" field={p.owner_name} fieldKey="project.owner_name" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="النشاط" field={p.activity} fieldKey="project.activity" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="المدينة" field={p.city} fieldKey="project.city" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="الحي" field={p.district} fieldKey="project.district" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="الشارع" field={p.street} fieldKey="project.street" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="العنوان الوطني" field={p.national_address} fieldKey="project.national_address" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="رقم القطعة" field={p.plot_number} fieldKey="project.plot_number" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="رخصة البناء" field={p.building_permit_number} fieldKey="project.building_permit_number" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="تاريخ الرخصة" field={p.building_permit_date} fieldKey="project.building_permit_date" setOverride={setOverride} clearOverride={clearOverride} />
    <BridgeValue label="مساحة الأرض" field={p.land_area_m2} fieldKey="project.land_area_m2" setOverride={setOverride} clearOverride={clearOverride} type="number" suffix="م²" />
    <BridgeValue label="مساحة البناء" field={p.building_area_m2} fieldKey="project.building_area_m2" setOverride={setOverride} clearOverride={clearOverride} type="number" suffix="م²" />
    <BridgeValue label="عدد الأدوار" field={p.floors_count} fieldKey="project.floors_count" setOverride={setOverride} clearOverride={clearOverride} type="number" />
    <BridgeValue label="حالة المبنى" field={p.building_status} fieldKey="project.building_status" setOverride={setOverride} clearOverride={clearOverride} />
  </div>;
}

function OccupancySpaces({ source, setOverride, clearOverride }: Pick<Parameters<typeof SectionBody>[0], 'source' | 'setOverride' | 'clearOverride'>) {
  if (!source.floors.length) return <EmptyState text="لا تتوفر أدوار ومساحات موثقة بعد. ستظهر هنا تلقائيًا عند توفرها في بيانات المساحات وأنظمة السلامة أو التقرير القديم." />;
  return <div className="space-y-4">{source.floors.map((floor) => <article key={floor.id} className="rounded-xl border border-slate-200 p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><strong className="text-slate-900">{floor.name.value || 'دور غير مسمى'}</strong><p className="text-xs text-slate-500">تكرار: {floor.repeat_count.value ?? 1} · المساحة الكلية: {floor.total_area_m2.value ?? '—'} م²</p></div><span className="text-xs text-slate-500">{sourceBadge(floor.name)} · {sourceLabel(floor.name)}</span></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><BridgeValue label="الشاغلون" field={floor.occupants} fieldKey={`floors.${floor.id}.occupants`} setOverride={setOverride} clearOverride={clearOverride} type="number" /><BridgeValue label="المخارج" field={floor.exits} fieldKey={`floors.${floor.id}.exits`} setOverride={setOverride} clearOverride={clearOverride} type="number" /><BridgeValue label="أقصى مسافة سفر" field={floor.travel_distance_m} fieldKey={`floors.${floor.id}.travel_distance_m`} setOverride={setOverride} clearOverride={clearOverride} type="number" suffix="م" /></div>
    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">{floor.spaces.map((space) => <div key={space.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="mb-2 flex justify-between gap-2"><strong className="text-sm">{space.name.value || 'مساحة غير مسماة'}</strong><span className="text-[10px] text-slate-500">{sourceBadge(space.name)}</span></div><div className="grid grid-cols-2 gap-2 text-xs"><BridgeValue label="النشاط" field={space.activity_use} fieldKey={`floors.${floor.id}.spaces.${space.id}.activity_use`} setOverride={setOverride} clearOverride={clearOverride} /><BridgeValue label="الإشغال" field={space.occupancy} fieldKey={`floors.${floor.id}.spaces.${space.id}.occupancy`} setOverride={setOverride} clearOverride={clearOverride} /><BridgeValue label="المساحة" field={space.area_m2} fieldKey={`floors.${floor.id}.spaces.${space.id}.area_m2`} setOverride={setOverride} clearOverride={clearOverride} type="number" suffix="م²" /><BridgeValue label="الخطورة" field={space.hazard_classification} fieldKey={`floors.${floor.id}.spaces.${space.id}.hazard_classification`} setOverride={setOverride} clearOverride={clearOverride} /><BridgeValue label="الشاغلون" field={space.occupants} fieldKey={`floors.${floor.id}.spaces.${space.id}.occupants`} setOverride={setOverride} clearOverride={clearOverride} type="number" /><BridgeValue label="المخارج" field={space.exits} fieldKey={`floors.${floor.id}.spaces.${space.id}.exits`} setOverride={setOverride} clearOverride={clearOverride} type="number" /><BridgeValue label="مسافة السفر" field={space.travel_distance_m} fieldKey={`floors.${floor.id}.spaces.${space.id}.travel_distance_m`} setOverride={setOverride} clearOverride={clearOverride} type="number" suffix="م" /></div></div>)}</div>
  </article>)}</div>;
}

function Structural({ source, setOverride, clearOverride, fireProtectionDesign, onFireProtectionDesignChange }: Pick<Parameters<typeof SectionBody>[0], 'source' | 'setOverride' | 'clearOverride' | 'fireProtectionDesign' | 'onFireProtectionDesignChange'>) {
  const p = source.plan;
  return <div className="space-y-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"><BridgeValue label="تصنيف الإشغال" field={p.occupancy_classification} fieldKey="plan.occupancy_classification" setOverride={setOverride} clearOverride={clearOverride} /><BridgeValue label="نوع البناء / الهيكل" field={p.construction_type} fieldKey="plan.construction_type" setOverride={setOverride} clearOverride={clearOverride} /><BridgeValue label="ارتفاع المبنى" field={p.building_height_m} fieldKey="plan.building_height_m" setOverride={setOverride} clearOverride={clearOverride} suffix="م" /><BridgeValue label="مبنى مرتفع" field={p.high_rise_building} fieldKey="plan.high_rise_building" setOverride={setOverride} clearOverride={clearOverride} /><BridgeValue label="أتريوم" field={p.atrium_exists} fieldKey="plan.atrium_exists" setOverride={setOverride} clearOverride={clearOverride} /><BridgeValue label="عدد الأقبية" field={p.basement_floors_count} fieldKey="plan.basement_floors_count" setOverride={setOverride} clearOverride={clearOverride} /><BridgeValue label="عمق تحت الأرض" field={p.underground_depth_m} fieldKey="plan.underground_depth_m" setOverride={setOverride} clearOverride={clearOverride} suffix="م" /><BridgeValue label="مبنى بلا نوافذ" field={p.windowless_building} fieldKey="plan.windowless_building" setOverride={setOverride} clearOverride={clearOverride} /></div><ManualField label="درجة الخطورة للتصميم الفني" value={fireProtectionDesign.occupancy.hazard_class} onChange={(hazard_class) => onFireProtectionDesignChange({ ...fireProtectionDesign, occupancy: { ...fireProtectionDesign.occupancy, hazard_class, source: 'engineer_input' } })} placeholder="تصنيف الخطورة المعتمد للتصميم" /></div>;
}

function Egress({ source, report, setOverride, clearOverride, updateItems, fireProtectionDesign, onFireProtectionDesignChange }: Pick<Parameters<typeof SectionBody>[0], 'source' | 'report' | 'setOverride' | 'clearOverride' | 'updateItems' | 'fireProtectionDesign' | 'onFireProtectionDesignChange'>) {
  const engineeringExitCount = fireProtectionDesign.egress.metrics.find((metric) => metric.label === 'عدد المخارج')?.value ?? '';
  const setEngineeringExitCount = (value: string) => {
    const others = fireProtectionDesign.egress.metrics.filter((metric) => metric.label !== 'عدد المخارج');
    onFireProtectionDesignChange({
      ...fireProtectionDesign,
      egress: {
        ...fireProtectionDesign.egress,
        metrics: value.trim() ? [...others, { label: 'عدد المخارج', value, note: 'مطابق للمخطط / إدخال المهندس', source: 'engineer_input' }] : others,
      },
    });
  };
  return <div className="space-y-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"><BridgeValue label="إجمالي الشاغلين" field={source.aggregates.total_occupants} fieldKey="aggregates.total_occupants" setOverride={setOverride} clearOverride={clearOverride} type="number" /><BridgeValue label="إجمالي المخارج" field={source.aggregates.total_exits} fieldKey="aggregates.total_exits" setOverride={setOverride} clearOverride={clearOverride} type="number" /><BridgeValue label="أقصى مسافة سفر" field={source.aggregates.maximum_travel_distance_m} fieldKey="aggregates.maximum_travel_distance_m" setOverride={setOverride} clearOverride={clearOverride} type="number" suffix="م" /><BridgeValue label="المخارج المتاحة بالمخطط" field={source.plan.exits_count} fieldKey="plan.exits_count" setOverride={setOverride} clearOverride={clearOverride} /><BridgeValue label="السلالم بالمخطط" field={source.plan.stairs_count} fieldKey="plan.stairs_count" setOverride={setOverride} clearOverride={clearOverride} /></div><ManualField label="عدد مخارج الطوارئ للتصميم الفني" value={engineeringExitCount} onChange={setEngineeringExitCount} placeholder="مطابق للمخطط / إدخال المهندس" /><ItemNotes title="ملاحظات المهندس على الإخلاء ومسارات الهروب" items={report.exits_items} keyName="exits_items" updateItems={updateItems} /></div>;
}

function CivilDefense({ source, report, patch }: Pick<Parameters<typeof SectionBody>[0], 'source' | 'report' | 'patch'>) { return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><ReadOnlyBridge label="قسم الدفاع المدني المختص — المصدر" field={source.plan.civil_defense_branch} /><ReadOnlyBridge label="فريق إنقاذ خاص مطلوب" field={source.plan.special_rescue_team_required} /><ManualField label="القسم المختص / فرع الدفاع المدني" value={report.civil_defense_branch || ''} onChange={(value) => patch({ civil_defense_branch: value })} /><ManualField label="ملاحظات الوصول والآليات وFDC" value={report.location_description || ''} onChange={(value) => patch({ location_description: value })} multiline /></div>; }

function SafetySystems({ source, report, setOverride, clearOverride, updateItems, kind }: Pick<Parameters<typeof SectionBody>[0], 'source' | 'report' | 'setOverride' | 'clearOverride' | 'updateItems'> & { kind: 'fire' | 'alarm' }) {
  const fields = source.floors.flatMap((floor) => floor.spaces.map((space) => ({ floor, space })));
  const configs = kind === 'fire' ? [ ['المرشات', 'sprinklers'], ['المخارج', 'emergency_exits'], ['السلالم', 'emergency_stairs'], ['الطفايات اليدوية', 'manual_extinguishers'], ['نوع الطفاية', 'manual_extinguisher_type'], ['سعة الطفاية', 'manual_extinguisher_size'] ] as const : [ ['لوحات الإنذار', 'fire_alarm_panels'], ['مواقع اللوحات', 'alarm_panel_locations'], ['كواشف الدخان', 'smoke_detectors'], ['كواشف الحرارة', 'heat_detectors'], ['الأجراس / التنبيه', 'alarm_bells'], ['الإنارة الطارئة', 'emergency_lights'], ['اللوحات الإرشادية', 'signs'] ] as const;
  const keyName = kind === 'fire' ? 'firefighting_items' : 'alarm_items';
  const notes = kind === 'fire' ? report.firefighting_items : report.alarm_items;
  return <div className="space-y-4"><div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{fields.map(({ floor, space }) => <article key={`${floor.id}-${space.id}`} className="rounded-xl border border-slate-200 p-3"><div className="mb-3"><strong className="text-sm">{floor.name.value || 'دور'} — {space.name.value || 'مساحة'}</strong><p className="text-xs text-slate-500">{sourceLabel(space.name)} · {sourceBadge(space.name)}</p></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{configs.map(([label, key]) => <BridgeValue key={key} label={label} field={space.quantities[key]} fieldKey={`floors.${floor.id}.spaces.${space.id}.quantities.${key}`} setOverride={setOverride} clearOverride={clearOverride} type={key.includes('type') || key.includes('size') || key.includes('locations') ? 'text' : 'number'} />)}</div></article>)}</div><ItemNotes title={kind === 'fire' ? 'ملاحظات المهندس على أنظمة مكافحة الحريق' : 'ملاحظات المهندس على أنظمة الإنذار والإخلاء'} items={notes} keyName={keyName} updateItems={updateItems} /></div>;
}

function Electrical({ source, report, patch }: Pick<Parameters<typeof SectionBody>[0], 'source' | 'report' | 'patch'>) { return <div className="space-y-3"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><ReadOnlyBridge label="التأريض" field={source.plan.electrical_grounding} /><ReadOnlyBridge label="مانع الصواعق" field={source.plan.lightning_protection} /><ReadOnlyBridge label="المولد الاحتياطي" field={source.plan.backup_generator} /></div><ManualField label="ملاحظات وتوصيات السلامة الكهربائية" value={report.overview_text || ''} onChange={(value) => patch({ overview_text: value })} multiline /></div>; }

function Mechanical({ report, updateItems }: Pick<Parameters<typeof SectionBody>[0], 'report' | 'updateItems'>) { return <ItemNotes title="التهوية وHVAC والتحكم بالدخان" items={report.ventilation_items} keyName="ventilation_items" updateItems={updateItems} empty="لا توجد متطلبات ميكانيكية مسجلة بعد. أضف ملاحظة هندسية عند الحاجة فقط." />; }

function Evidence({ clientId, data, report, saving, patch, onPersistEvidenceMetadata }: Pick<Parameters<typeof SectionBody>[0], 'clientId' | 'data' | 'report' | 'saving' | 'patch' | 'onPersistEvidenceMetadata'>) { return <TechnicalEvidenceManager clientId={clientId} data={data} report={report} saving={saving} onChange={(next) => patch(next)} onPersistEvidenceMetadata={onPersistEvidenceMetadata} />; }

function Observations({ report, patch, updateItems }: Pick<Parameters<typeof SectionBody>[0], 'report' | 'patch' | 'updateItems'>) { const entries = [ ...report.firefighting_items.map((item) => ({ section: 'مكافحة الحريق', item })), ...report.alarm_items.map((item) => ({ section: 'الإنذار والإخلاء', item })), ...report.exits_items.map((item) => ({ section: 'الإخلاء والمخارج', item })), ...report.ventilation_items.map((item) => ({ section: 'السلامة الميكانيكية', item })) ].filter(({ item }) => item.notes || item.selectedOptions.length); const recommendations = report.general_recommendations || []; return <div className="space-y-4"><div className="grid grid-cols-1 gap-3 md:grid-cols-2">{entries.length ? entries.map(({ section, item }) => <article key={`${section}-${item.id}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{section}</strong><span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{item.enabled ? 'قيد المراجعة' : 'غير منطبق'}</span></div><p className="mt-2 whitespace-pre-wrap text-slate-700">{item.notes || item.selectedOptions.join('، ')}</p><p className="mt-2 text-[10px] text-slate-500">المصدر: إدخال مهندس</p></article>) : <EmptyState text="لا توجد ملاحظات مسجلة بعد." />}</div><div className="space-y-2"><p className="font-bold text-slate-800">التوصيات العامة</p>{TECH_REPORT_GENERAL_RECOMMENDATIONS.map((recommendation) => { const current = recommendations.find((value) => value.id === recommendation.id); const checked = Boolean(current?.checked); return <label key={recommendation.id} className="flex gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={checked} onChange={() => patch({ general_recommendations: toggleRecommendation(recommendations, recommendation.id, checked) })} /><span>{recommendation.label}</span></label>; })}</div></div>; }

function Approval({ report, patch }: Pick<Parameters<typeof SectionBody>[0], 'report' | 'patch'>) { return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><ManualField label="تاريخ التقرير" value={report.report_date || ''} onChange={(value) => patch({ report_date: value })} /><ManualField label="مهندس السلامة" value={report.safety_engineer_name || ''} onChange={(value) => patch({ safety_engineer_name: value })} /><ManualField label="المدير التنفيذي" value={report.executive_director_name || ''} onChange={(value) => patch({ executive_director_name: value })} /><ManualField label="رقم الصادر" value={report.outgoing_number || ''} onChange={(value) => patch({ outgoing_number: value })} placeholder="يصدر تلقائيًا عند الحفظ" /><label className="block rounded-xl border border-slate-200 bg-slate-50/60 p-3"><span className="mb-2 block text-xs font-semibold text-slate-700">حالة التقرير</span><select value={report.status} onChange={(event) => patch({ status: event.target.value as TechnicalReport['status'] })} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm">{REPORT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><ManualField label="نبذة التقرير" value={report.overview_text || ''} onChange={(value) => patch({ overview_text: value })} multiline /></div>; }

function ReadOnlyBridge({ label, field }: { label: string; field: TechnicalReportSourceField }) { return <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"><p className="text-xs font-semibold text-slate-700">{label}</p><p className="mt-2 text-sm font-bold text-slate-800">{field.value ?? '—'}</p><p className="mt-1 text-[10px] text-slate-500">{sourceBadge(field)} · {sourceLabel(field)}</p></div>; }

function ItemNotes({ title, items, keyName, updateItems, empty }: { title: string; items: TechnicalReportSectionItem[]; keyName: 'firefighting_items' | 'ventilation_items' | 'alarm_items' | 'exits_items'; updateItems: Pick<Parameters<typeof SectionBody>[0], 'updateItems'>['updateItems']; empty?: string }) { if (!items.length) return <EmptyState text={empty || 'لا توجد بنود فنية مسجلة بعد.'} />; return <div className="space-y-3"><p className="font-bold text-slate-800">{title}</p>{items.map((item) => { const catalog = TECH_REPORT_ITEMS.find((value) => value.id === item.id); return <article key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={item.enabled} onChange={(event) => updateItems(keyName, item.id, (value) => ({ ...value, enabled: event.target.checked }))} />{catalog?.title || item.id}</label><span className="text-[10px] text-slate-500">إدخال مهندس</span></div>{item.enabled ? <textarea value={item.notes} onChange={(event) => updateItems(keyName, item.id, (value) => ({ ...value, notes: event.target.value }))} placeholder="ملاحظة المهندس / التوصية" className="mt-3 min-h-20 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" /> : null}</article>; })}</div>; }


function EmptyState({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-500">{text}</div>; }

function toggleRecommendation(current: TechnicalReportRecommendation[], id: string, checked: boolean): TechnicalReportRecommendation[] { const found = current.some((item) => item.id === id); return found ? current.map((item) => item.id === id ? { ...item, checked: !checked } : item) : [...current, { id, checked: true }]; }

function sectionSummary(id: TechnicalReportUiSectionId, source: ReturnType<typeof buildTechnicalReportSourceData>, report: TechnicalReport, missing: number): string {
  if (id === 'project_summary') return `${source.project.project_name.value || 'مشروع'} · ${source.project.city.value || 'موقع غير محدد'} · ${missing} حقول ناقصة`;
  if (id === 'occupancy_spaces') return `${source.floors.length} أدوار · ${source.aggregates.total_floor_area_m2.value ?? '—'} م² · ${source.aggregates.total_occupants.value ?? '—'} شاغل`;
  if (id === 'fire_fighting') return `مرشات: ${source.aggregates.total_sprinklers.value ?? '—'} · طفايات: ${source.aggregates.total_extinguishers.value ?? '—'} · ${missing} حقول ناقصة`;
  if (id === 'alarm_evacuation') return `دخان: ${source.aggregates.total_smoke_detectors.value ?? '—'} · حرارة: ${source.aggregates.total_heat_detectors.value ?? '—'} · تنبيه: ${source.aggregates.total_alarm_devices.value ?? '—'}`;
  if (id === 'egress') return `مخارج: ${source.aggregates.total_exits.value ?? '—'} · مسافة السفر: ${source.aggregates.maximum_travel_distance_m.value ?? '—'} م`;
  if (id === 'evidence') return `${report.evidence?.items.length || 0} أدلة جديدة · ${[report.facade_photo, report.earth_photo, report.site_photo].filter(Boolean).length + (report.code_proof_photos || []).length} مرفقات سابقة`;
  if (id === 'observations') return `${report.general_recommendations.filter((item) => item.checked).length} توصيات معتمدة`;
  if (id === 'recommendation_review') {
    const items = report.recommendations_v2?.items || [];
    return `مقترحة: ${items.filter((item) => item.status === 'suggested').length} · بانتظار قرار المهندس`;
  }
  return `${missing} حقول ناقصة`;
}
