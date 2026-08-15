import { useMemo, useState } from 'react';
import type { BuildingPermitExtraction, BuildingPermitHydration } from '@/lib/projects/building-permit-ocr';

type ReviewKey = keyof BuildingPermitHydration;

type Props = {
  extraction: BuildingPermitExtraction;
  fields: BuildingPermitHydration;
  onApprove: (accepted: BuildingPermitHydration) => void;
  onReject: () => void;
};

const FIELD_LABELS: Array<{ key: ReviewKey; label: string; evidenceKey: string }> = [
  { key: 'owner_name', label: 'اسم المالك', evidenceKey: 'ownerName' },
  { key: 'building_permit_number', label: 'رقم الرخصة', evidenceKey: 'permitNumber' },
  { key: 'building_permit_date', label: 'تاريخ الرخصة', evidenceKey: 'permitDateGregorian' },
  { key: 'building_permit_date_hijri', label: 'التاريخ الهجري', evidenceKey: 'permitDateHijri' },
  { key: 'district', label: 'الحي', evidenceKey: 'district' },
  { key: 'city', label: 'المدينة', evidenceKey: 'city' },
  { key: 'street', label: 'الشارع', evidenceKey: 'street' },
  { key: 'plot_number', label: 'رقم القطعة', evidenceKey: 'plotNumber' },
  { key: 'municipality', label: 'البلدية', evidenceKey: 'municipality' },
  { key: 'land_area', label: 'مساحة الأرض', evidenceKey: 'landAreaM2' },
  { key: 'building_area', label: 'مساحة المبنى', evidenceKey: 'buildingAreaM2' },
  { key: 'floors_count', label: 'عدد الأدوار', evidenceKey: 'floorsCount' },
  { key: 'activity_type', label: 'تصنيف النشاط', evidenceKey: 'activityType' },
  { key: 'usage_label', label: 'استخدام المبنى', evidenceKey: 'usageLabel' },
  { key: 'national_address', label: 'العنوان الوطني', evidenceKey: 'nationalAddress' },
  { key: 'floor_levels', label: 'تفاصيل الأدوار', evidenceKey: 'floors' },
];

function confidenceFor(extraction: BuildingPermitExtraction, key: string) {
  const evidence = extraction.fieldEvidence?.[key];
  if (evidence) return evidence;
  return { value: null, confidence: 0, needs_review: true, source: null };
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.map((item) => `${item.label || 'دور'}: ${item.area_m2 || 0} م²`).join(' · ');
  return String(value);
}

export default function PermitReviewPanel({ extraction, fields, onApprove, onReject }: Props) {
  const initial = useMemo(() => new Set(FIELD_LABELS.filter(({ key }) => fields[key] != null && fields[key] !== '').map(({ key }) => key)), [fields]);
  const [accepted, setAccepted] = useState<Set<ReviewKey>>(initial);

  const approve = () => {
    const output: BuildingPermitHydration = {};
    for (const { key } of FIELD_LABELS) {
      if (accepted.has(key) && fields[key] != null && fields[key] !== '') output[key] = fields[key] as never;
    }
    onApprove(output);
  };

  const isServer = Boolean(extraction.fieldEvidence);
  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4" aria-label="مراجعة مسودة OCR">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-indigo-950">مراجعة مسودة رخصة البناء</p>
          <p className="mt-1 text-[11px] text-indigo-800/80">لا يتم تعديل النموذج أو حفظ قاعدة البيانات حتى تعتمد القيم المحددة.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isServer ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {isServer ? 'SERVER OCR' : 'LOCAL OCR / REQUIRES REVIEW'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {FIELD_LABELS.map(({ key, label, evidenceKey }) => {
          const value = fields[key];
          if (value == null || value === '') return null;
          const evidence = confidenceFor(extraction, evidenceKey);
          const low = evidence.needs_review || evidence.confidence < 0.75;
          return (
            <label key={String(key)} className={`flex cursor-pointer items-start gap-2 rounded-xl border bg-white p-2.5 ${low ? 'border-amber-300' : 'border-indigo-100'}`}>
              <input
                type="checkbox"
                checked={accepted.has(key)}
                onChange={(event) => setAccepted((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(key); else next.delete(key);
                  return next;
                })}
                className="mt-1"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-[11px] font-semibold text-gray-700">
                  <span>{label}</span>
                  <span className={low ? 'text-amber-700' : 'text-emerald-700'}>{Math.round(evidence.confidence * 100)}%</span>
                </span>
                <span className="mt-1 block break-words text-xs font-bold text-gray-900">{displayValue(value)}</span>
                <span className="mt-1 block text-[10px] text-gray-500">
                  {low ? 'تحتاج مراجعة يدوية' : 'مصدر واضح'}{evidence.source?.page ? ` · الصفحة ${evidence.source.page}` : ''}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onReject} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700">رفض المسودة</button>
        <button type="button" onClick={approve} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white">اعتماد المحدد وتعبئة الحقول</button>
      </div>
      <p className="mt-2 text-[10px] text-gray-500">الاعتماد هنا ليس VERIFIED؛ يلزم الضغط على زر الحفظ الحالي لاعتماد السجل.</p>
    </section>
  );
}
