'use client';

import { useMemo } from 'react';
import {
  derivePlanInfoFromSpaceSafety,
  getBuildingPlanGeneralInfo,
  resolveBuildingPlanWithSpaceSafety,
} from '@/lib/projects/building-plan';
import { printBuildingPlanReport, exportBuildingPlanReport } from '@/components/projects/BuildingPlanPrint';
import {
  normalizeConstructionValue,
  normalizeOccupancyValue,
  recommendSbcClassification,
  SBC_CONSTRUCTION_TYPE_OPTIONS,
  SBC_OCCUPANCY_OPTIONS,
} from '@/lib/projects/sbc-recommendation';
import type { ClientRecord } from '@/lib/types/client';
import type { BuildingPlanReport, YesNoValue } from '@/lib/types/project-reports';
import type { DesignSpaceSafetyWorkingCopy } from '@/lib/projects/design-center/types';
import { normalizeQuotationDocuments } from '@/lib/business/quotation-documents';

interface BuildingPlanReportSectionProps {
  client: ClientRecord;
  report: BuildingPlanReport;
  spaceSafety?: DesignSpaceSafetyWorkingCopy | null;
  saving: boolean;
  onChange: (report: BuildingPlanReport) => void;
  onSave: (report: BuildingPlanReport, message: string) => void;
}

const YES_NO_OPTIONS: { value: YesNoValue; label: string }[] = [
  { value: '', label: '—' },
  { value: 'نعم', label: 'نعم' },
  { value: 'لا', label: 'لا' },
];

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

export default function BuildingPlanReportSection({
  client,
  report,
  spaceSafety,
  saving,
  onChange,
  onSave,
}: BuildingPlanReportSectionProps) {
  const general = getBuildingPlanGeneralInfo(client);
  const salesDocs = normalizeQuotationDocuments(client.quotation_documents);
  const salesPermitFile = salesDocs.building_permit;
  const derived = useMemo(() => derivePlanInfoFromSpaceSafety(spaceSafety), [spaceSafety]);
  const reportForOutput = useMemo(
    () => resolveBuildingPlanWithSpaceSafety(report, derived),
    [report, derived]
  );

  const patch = (partial: Partial<BuildingPlanReport>) => onChange({ ...report, ...partial });

  const recommendation = useMemo(
    () =>
      recommendSbcClassification({
        activityType: client.activity_type,
        activityName:
          general.activity_type_label !== '—'
            ? general.activity_type_label
            : client.business_name || client.name,
        buildingAreaM2: client.building_area,
      }),
    [client.activity_type, client.building_area, client.business_name, client.name, general.activity_type_label]
  );

  const occupancyValue = normalizeOccupancyValue(report.occupancy_classification);
  const constructionValue = normalizeConstructionValue(report.building_type_code);
  const recommendationApplied =
    occupancyValue === recommendation.occupancyValue &&
    constructionValue === recommendation.constructionValue;

  const applyRecommendation = () =>
    patch({
      occupancy_classification: recommendation.occupancyValue,
      building_type_code: recommendation.constructionValue,
    });

  const saveDraft = () => onSave({ ...report, status: 'مسودة' }, 'تم حفظ التقرير كمسودة.');
  const saveApproved = () => onSave({ ...report, status: 'معتمد' }, 'تم اعتماد تقرير معلومات المخطط نهائياً.');

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
        🔗 الحقول العامة وبيانات رخصة البناء تُجلب من المبيعات (للعرض فقط). الحقول الفنية يعبئها المهندس بعد الزيارة الميدانية.
      </div>

      {/* Read-only general inputs */}
      <section>
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="text-gray-400">🔒</span> المدخلات العامة (Auto-fill)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ReadOnlyField label="اسم المنشأة / المبنى" value={general.business_name} />
          <ReadOnlyField label="اسم المالك" value={general.owner_name} />
          <ReadOnlyField label="نوع النشاط التجاري" value={general.activity_type_label} />
          <ReadOnlyField label="المدينة" value={general.city} />
          <ReadOnlyField label="الموقع (مدينة — حي)" value={general.location_summary} />
          <ReadOnlyField label="الحي والشارع" value={`${general.district} — ${general.street}`} />
          <ReadOnlyField label="مساحة الأرض" value={general.land_area} />
          <ReadOnlyField label="مساحة المبنى" value={general.building_area} />
          <ReadOnlyField label="عدد الأدوار (مسجل)" value={general.floors_count} />
          <ReadOnlyField label="رقم القطعة" value={general.plot_number} />
          <ReadOnlyField label="العنوان الوطني" value={general.national_address} />
        </div>
      </section>

      {derived.hasSource ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
          <p className="font-bold">بيانات هندسية مساندة من المساحات وأنظمة السلامة</p>
          <p className="mt-1 leading-relaxed">
            تظهر القيم المشتقة أسفل الحقول ذات الصلة وفي الطباعة إذا ترك المهندس الحقل فارغًا. أي قيمة يكتبها المهندس في تقرير معلومات المخطط تبقى هي المرجع ولا تُستبدل تلقائيًا.
          </p>
        </section>
      ) : null}

      {/* Building permit — read-only from Sales (no upload here) */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span className="text-gray-400">🔒</span> بيانات رخصة البناء (من المبيعات)
          </h3>
          <p className="text-[11px] text-gray-500 mt-1">
            إدخال وإرفاق رخصة البناء يتم من صفحة المبيعات فقط. لا يُرفع الملف من المشاريع.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <ReadOnlyField label="رقم رخصة البناء" value={report.building_permit_number || '—'} />
          <ReadOnlyField label="تاريخ الرخصة (ميلادي)" value={report.building_permit_date || '—'} />
          <ReadOnlyField
            label="تاريخ الرخصة (هجري)"
            value={report.building_permit_date_hijri || '—'}
          />
          <ReadOnlyField
            label="مرفق الرخصة في المبيعات"
            value={
              salesPermitFile?.fileName
                ? `${salesPermitFile.fileName}${
                    salesPermitFile.sizeBytes
                      ? ` · ${(salesPermitFile.sizeBytes / 1024).toFixed(0)} KB`
                      : ''
                  }`
                : 'لا يوجد مرفق في المبيعات'
            }
          />
        </div>
      </section>

      {/* Engineer report header */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <EditableField label="تاريخ التقرير" type="date" value={report.report_date || ''} onChange={(v) => patch({ report_date: v })} />
        <div>
          <label className="block text-xs font-semibold mb-1">حالة التقرير</label>
          <select value={report.status} onChange={(e) => patch({ status: e.target.value as BuildingPlanReport['status'] })} className="w-full p-2.5 border rounded-xl text-sm bg-white">
            {REPORT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </section>

      {/* Engineering checklist */}
      <section>
        <h3 className="text-sm font-bold text-gray-800 mb-3">المواصفات الهندسية (SBC)</h3>

        <div className="mb-3 rounded-xl border border-amber-200 bg-gradient-to-l from-amber-50 to-emerald-50 p-3 space-y-2">
          <p className="text-sm text-emerald-950">
            <span className="me-1" aria-hidden>
              💡
            </span>
            <strong>التوصية المقترحة حسب كود البناء السعودي (SBC):</strong>
            <span className="mx-1">الإشغال:</span>
            <strong>{recommendation.occupancyValue}</strong>
            <span className="text-gray-600 text-xs mx-1">
              ({recommendation.occupancyLabelAr.replace(/^Group [^—]+ — /, '')})
            </span>
            <span className="mx-1">|</span>
            <span className="mx-1">نوع البناء:</span>
            <strong>{recommendation.constructionValue}</strong>
          </p>
          <p className="text-[11px] text-gray-600 leading-relaxed">{recommendation.rationaleAr}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyRecommendation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#635bdb] text-white text-xs font-semibold hover:bg-[#4943b5] transition"
            >
              تطبيق التوصية الموصى بها
            </button>
            {recommendationApplied ? (
              <span className="text-[11px] font-semibold text-emerald-700">✓ مطبّقة على الحقول</span>
            ) : null}
            <span className="text-[10px] text-gray-400">
              ثقة: {recommendation.confidence === 'high' ? 'عالية' : recommendation.confidence === 'medium' ? 'متوسطة' : 'منخفضة'}
              {recommendation.buildingAreaM2 > 0
                ? ` · المساحة ${recommendation.buildingAreaM2.toLocaleString('ar-SA')} م²`
                : ''}
            </span>
          </div>
        </div>

        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-right text-sm">
            <thead className="bg-[#6b8f4e] text-white text-xs">
              <tr>
                <th className="p-2 w-[30%]">البند</th>
                <th className="p-2">القيمة</th>
                <th className="p-2 w-24">نعم/لا</th>
              </tr>
            </thead>
            <tbody>
              <EngineerSelectRow
                label="تصنيف الإشغال"
                value={occupancyValue}
                onValue={(v) => patch({ occupancy_classification: v })}
                options={SBC_OCCUPANCY_OPTIONS.map((o) => ({ value: o.value, label: o.label_ar }))}
                recommendedValue={recommendation.occupancyValue}
              />
              <EngineerSelectRow
                label="نوع البناء"
                value={constructionValue}
                onValue={(v) => patch({ building_type_code: v })}
                options={SBC_CONSTRUCTION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label_ar }))}
                recommendedValue={recommendation.constructionValue}
              />
              <EngineerRow label="المبنى عالي" yesNo={report.high_rise_building} onYesNo={(v) => patch({ high_rise_building: v })} />
              <EngineerRow label="مساحة الموقع (م²)" value={report.total_site_area_m2 || ''} onValue={(v) => patch({ total_site_area_m2: v })} />
              <EngineerRow label="يوجد بهو" yesNo={report.atrium_exists} onYesNo={(v) => patch({ atrium_exists: v })} />
              <EngineerRow label="عدد الأدوار (وصف)" value={report.floors_description || ''} onValue={(v) => patch({ floors_description: v })} placeholder={general.floors_count} />
              <EngineerRow label="المبنى تحت الأرض" yesNo={report.underground_building} onYesNo={(v) => patch({ underground_building: v })} />
              <EngineerRow label="الارتفاع (m)" value={report.building_height_m || ''} onValue={(v) => patch({ building_height_m: v })} />
              <EngineerRow label="بلا نوافذ" yesNo={report.windowless_building} onYesNo={(v) => patch({ windowless_building: v })} />
              <EngineerRow label="أدوار القبو" value={report.basement_floors_count || ''} onValue={(v) => patch({ basement_floors_count: v })} />
              <EngineerRow label="تأريض كهربائي" yesNo={report.electrical_grounding} onYesNo={(v) => patch({ electrical_grounding: v })} />
              <EngineerRow label="عمق تحت الأرض (m)" value={report.underground_depth_m || ''} onValue={(v) => patch({ underground_depth_m: v })} />
              <EngineerRow label="حماية صواعق" yesNo={report.lightning_protection} onYesNo={(v) => patch({ lightning_protection: v })} />
              <EngineerRow
                label="عدد المخارج"
                value={report.exits_count || ''}
                onValue={(v) => patch({ exits_count: v })}
                derivedValue={derived.exitsCount === null ? undefined : String(derived.exitsCount)}
              />
              <EngineerRow label="مولد احتياطي" yesNo={report.backup_generator} onYesNo={(v) => patch({ backup_generator: v })} />
              <EngineerRow
                label="عدد السلالم"
                value={report.stairs_count || ''}
                onValue={(v) => patch({ stairs_count: v })}
                derivedValue={derived.stairsCount === null ? undefined : String(derived.stairsCount)}
              />
              <EngineerRow label="استثناءات الكود" yesNo={report.sbc_code_exceptions} onYesNo={(v) => patch({ sbc_code_exceptions: v })} />
              <EngineerRow label="سلالم كهربائية" value={report.escalators_count || ''} onValue={(v) => patch({ escalators_count: v })} />
              <EngineerRow label="فرق إطفاء خاصة" yesNo={report.special_rescue_team_required} onYesNo={(v) => patch({ special_rescue_team_required: v })} />
              <EngineerRow label="عدد المصاعد" value={report.elevators_count || ''} onValue={(v) => patch({ elevators_count: v })} />
            </tbody>
          </table>
        </div>
      </section>

      {/* Fire safety & approval */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-gray-800">أنظمة السلامة والاعتماد</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <YesNoField
            label="نظام إنذار حريق"
            value={report.fire_alarm_system}
            onChange={(v) => patch({ fire_alarm_system: v })}
            derivedValue={derived.fireAlarmSystem || undefined}
          />
          <YesNoField
            label="نظام رش آلي"
            value={report.sprinkler_system}
            onChange={(v) => patch({ sprinkler_system: v })}
            derivedValue={derived.sprinklerSystem || undefined}
          />
        </div>
        {derived.hasSource ? (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 md:grid-cols-2">
            <DerivedReadOnlyField
              label="إجمالي الشاغلين التقديريين"
              value={derived.estimatedOccupants === null ? '—' : String(derived.estimatedOccupants)}
            />
            <DerivedReadOnlyField label="ملخص الكميات المسجلة" value={derived.quantitiesSummary || '—'} />
            <div className="md:col-span-2">
              <DerivedReadOnlyField label="ملخص درجات الخطورة (SBC)" value={derived.hazardSummary || '—'} />
            </div>
          </div>
        ) : null}
        <EditableField label="متطلبات كود البناء SBC" value={report.sbc_requirements || ''} onChange={(v) => patch({ sbc_requirements: v })} multiline />
        <EditableField label="أبواب ومخارج الطوارئ" value={report.emergency_exits_doors || ''} onChange={(v) => patch({ emergency_exits_doors: v })} multiline />
        <EditableField label="حالة اعتماد المخطط" value={report.plan_approval_status || ''} onChange={(v) => patch({ plan_approval_status: v })} />
        <EditableField label="ملاحظات المعاينة الفنية" value={report.technical_inspection_notes || ''} onChange={(v) => patch({ technical_inspection_notes: v })} multiline />
      </section>

      {/* Office certification */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-4">
        <EditableField label="اسم المكتب الاستشاري" value={report.office_name || ''} onChange={(v) => patch({ office_name: v })} />
        <EditableField label="السجل التجاري" value={report.commercial_registration || ''} onChange={(v) => patch({ commercial_registration: v })} />
        <EditableField label="ممثل المكتب / المهندس" value={report.engineer_representative || client.assigned_engineer || ''} onChange={(v) => patch({ engineer_representative: v })} />
        <EditableField label="رقم العضوية الهندسية" value={report.engineering_membership_no || ''} onChange={(v) => patch({ engineering_membership_no: v })} />
        <EditableField label="تاريخ الاعتماد" type="date" value={report.certification_date || ''} onChange={(v) => patch({ certification_date: v })} />
      </section>

      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={saveDraft} disabled={saving} className="px-4 py-2 bg-gray-600 text-white rounded-xl text-sm disabled:opacity-50">
          {saving ? 'جاري الحفظ...' : 'حفظ كمسودة'}
        </button>
        <button type="button" onClick={saveApproved} disabled={saving} className="px-4 py-2 bg-[#635bdb] text-white rounded-xl text-sm disabled:opacity-50">
          اعتماد نهائي
        </button>
        <button type="button" onClick={() => printBuildingPlanReport(client, reportForOutput)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">
          طباعة
        </button>
        <button type="button" onClick={() => exportBuildingPlanReport(client, reportForOutput)} className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-sm">
          تصدير HTML
        </button>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
      <p className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">🔒 {label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      {multiline ? (
        <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
      )}
    </div>
  );
}

function DerivedReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-emerald-900">{label}</p>
      <p className="mt-1 text-sm text-emerald-950">{value}</p>
      <p className="mt-1 text-[10px] text-emerald-700">مشتق من بيانات المساحات وأنظمة السلامة</p>
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  derivedValue,
}: {
  label: string;
  value?: YesNoValue;
  onChange: (v: YesNoValue) => void;
  derivedValue?: YesNoValue;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value as YesNoValue)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
        {YES_NO_OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
      </select>
      {!value && derivedValue ? (
        <p className="mt-1 text-[10px] font-medium text-emerald-700">مشتق من بيانات المساحات: {derivedValue}</p>
      ) : null}
      {value && derivedValue ? (
        <p className="mt-1 text-[10px] text-slate-500">قيمة المهندس اليدوية لها الأولوية على القيمة المشتقة: {derivedValue}</p>
      ) : null}
    </div>
  );
}

function EngineerRow({
  label,
  value,
  onValue,
  yesNo,
  onYesNo,
  placeholder,
  derivedValue,
}: {
  label: string;
  value?: string;
  onValue?: (v: string) => void;
  yesNo?: YesNoValue;
  onYesNo?: (v: YesNoValue) => void;
  placeholder?: string;
  derivedValue?: string;
}) {
  return (
    <tr className="border-b">
      <td className="p-2 bg-[#eef5e6] text-xs font-semibold">{label}</td>
      <td className="p-2">
        {onValue ? (
          <>
            <input value={value || ''} placeholder={placeholder} onChange={(e) => onValue(e.target.value)} className="w-full p-1.5 border rounded text-sm" />
            {!value && derivedValue ? <p className="mt-1 text-[10px] font-medium text-emerald-700">مشتق من بيانات المساحات: {derivedValue}</p> : null}
            {value && derivedValue ? <p className="mt-1 text-[10px] text-slate-500">القيمة اليدوية لها الأولوية على: {derivedValue}</p> : null}
          </>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        )}
      </td>
      <td className="p-2">
        {onYesNo ? (
          <select value={yesNo || ''} onChange={(e) => onYesNo(e.target.value as YesNoValue)} className="w-full p-1.5 border rounded text-sm bg-white">
            {YES_NO_OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
          </select>
        ) : null}
      </td>
    </tr>
  );
}

function EngineerSelectRow({
  label,
  value,
  onValue,
  options,
  recommendedValue,
}: {
  label: string;
  value: string;
  onValue: (v: string) => void;
  options: { value: string; label: string }[];
  recommendedValue?: string;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <tr className="border-b">
      <td className="p-2 bg-[#eef5e6] text-xs font-semibold">{label}</td>
      <td className="p-2">
        <select
          value={known ? value : value ? '__legacy__' : ''}
          onChange={(e) => {
            const next = e.target.value;
            if (next === '__legacy__') return;
            onValue(next);
          }}
          className="w-full p-1.5 border rounded text-sm bg-white"
        >
          <option value="">— اختر —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {recommendedValue === o.value ? ' ★ موصى به' : ''}
            </option>
          ))}
          {!known && value ? <option value="__legacy__">{value} (قيمة سابقة)</option> : null}
        </select>
      </td>
      <td className="p-2" />
    </tr>
  );
}
