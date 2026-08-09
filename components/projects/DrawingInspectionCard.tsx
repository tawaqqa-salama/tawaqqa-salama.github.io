'use client';

import type { DrawingInspectionReport } from '@/lib/projects/design-center/vision/drawingInspector';

type Props = {
  report: DrawingInspectionReport | null;
  preferAr?: boolean;
  dark?: boolean;
  busy?: boolean;
  onFeedToAnalysis?: () => void;
};

function fmtArea(v: number | null | undefined, ar: boolean): string {
  if (v == null || !(v > 0)) return ar ? 'غير متاح' : 'N/A';
  return `${v.toLocaleString(ar ? 'ar-SA' : 'en-US')} m²`;
}

export default function DrawingInspectionCard({
  report,
  preferAr = true,
  dark = false,
  busy = false,
  onFeedToAnalysis,
}: Props) {
  const ar = preferAr;
  const card = dark
    ? 'rounded-xl border border-slate-700 bg-slate-900/60'
    : 'rounded-xl border border-slate-200 bg-white';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const row = dark
    ? 'flex justify-between gap-3 border-b border-slate-800 py-2 text-sm last:border-0'
    : 'flex justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0';

  if (!report) {
    return (
      <section className={`${card} p-4`}>
        <h3 className="font-bold text-sm">
          {ar ? 'استكشاف المخطط والبيانات الوصفية' : 'Drawing exploration & metadata'}
        </h3>
        <p className={`text-xs mt-2 ${muted}`}>
          {ar
            ? 'شغّل التحليل المحلي على PDF/صورة لاستخراج نوع المخطط، الأدوار، المساحة، المقياس، وتوزيع الغرف — دون تعديل عناصر الرسم.'
            : 'Run local analysis on a PDF/image to extract drawing type, floors, area, scale, and room breakdown — without modifying drawing elements.'}
        </p>
      </section>
    );
  }

  const zones = report.zones.slice(0, 12);
  const extraZones = Math.max(0, report.zones.length - zones.length);

  return (
    <section className={`${card} p-4 space-y-3`} data-drawing-inspection>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={`text-[11px] uppercase tracking-wide font-semibold ${muted}`}>
            {ar ? 'فحص وصفي فقط' : 'Inspection only'}
          </p>
          <h3 className="font-bold text-sm mt-0.5">
            {ar ? 'ملخص استكشاف المخطط' : 'Drawing inspection summary'}
          </h3>
        </div>
        {onFeedToAnalysis ? (
          <button
            type="button"
            disabled={busy}
            onClick={onFeedToAnalysis}
            className="rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-2"
          >
            {busy
              ? ar
                ? 'جاري التغذية...'
                : 'Feeding...'
              : ar
                ? 'تغذية البيانات للتحليل'
                : 'Feed data to analysis'}
          </button>
        ) : null}
      </div>

      <div className="space-y-0">
        <div className={row}>
          <span className={muted}>{ar ? 'نوع المخطط' : 'Drawing type'}</span>
          <span className="font-semibold text-end">
            {ar ? report.drawing_type.label_ar : report.drawing_type.label_en}
            <span className={`ms-2 text-[11px] font-normal ${muted}`}>
              {Math.round(report.drawing_type.confidence * 100)}%
            </span>
          </span>
        </div>
        <div className={row}>
          <span className={muted}>{ar ? 'عدد الأدوار' : 'Number of floors'}</span>
          <span className="font-semibold">
            {report.building.floors_count ?? (ar ? 'غير متاح' : 'N/A')}
          </span>
        </div>
        <div className={row}>
          <span className={muted}>{ar ? 'المساحة الإجمالية' : 'Total gross area'}</span>
          <span className="font-semibold font-mono">
            {fmtArea(report.building.total_area_m2, ar)}
          </span>
        </div>
        <div className={row}>
          <span className={muted}>{ar ? 'مقياس الرسم المكتشف' : 'Detected scale'}</span>
          <span className="font-semibold font-mono">
            {report.building.scale.ratio_text || (ar ? 'غير معروف' : 'Unknown')}
          </span>
        </div>
        {report.building.occupancy ? (
          <div className={row}>
            <span className={muted}>{ar ? 'الإشغال' : 'Occupancy'}</span>
            <span className="font-semibold text-end">{report.building.occupancy}</span>
          </div>
        ) : null}
      </div>

      {report.building.floors.length ? (
        <div>
          <p className={`text-xs font-semibold mb-1 ${muted}`}>
            {ar ? 'الأدوار المكتشفة' : 'Detected floors'}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {report.building.floors.map((f) => (
              <li
                key={`${f.kind}-${f.label_en}`}
                className={`text-[11px] rounded-md px-2 py-1 ${
                  dark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'
                }`}
              >
                {ar ? f.label_ar : f.label_en}
                {f.count_hint > 1 ? ` ×${f.count_hint}` : ''}
                {f.area_m2 != null ? ` · ${f.area_m2} m²` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className={`text-xs font-semibold mb-1 ${muted}`}>
          {ar ? 'توزيع الغرف والمساحات المكتشفة' : 'Detected rooms & areas'}
        </p>
        {zones.length === 0 ? (
          <p className={`text-xs ${muted}`}>
            {ar ? 'لا توجد فراغات مكتشفة بعد.' : 'No rooms detected yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className={muted}>
                  <th className="text-start font-semibold py-1">{ar ? 'الغرفة / الاستخدام' : 'Room / use'}</th>
                  <th className="text-end font-semibold py-1">{ar ? 'المساحة' : 'Area'}</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.zone_id} className={dark ? 'border-t border-slate-800' : 'border-t border-slate-100'}>
                    <td className="py-1.5 pe-2">
                      {ar ? z.label_ar || z.label_en || z.use : z.label_en || z.label_ar || z.use}
                      {z.needs_engineer_label ? (
                        <span className="ms-1 text-amber-600">*</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-end font-mono">{fmtArea(z.area_m2, ar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {extraZones > 0 ? (
              <p className={`text-[11px] mt-1 ${muted}`}>
                {ar ? `+${extraZones} فراغ إضافي` : `+${extraZones} more spaces`}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {(report.building.notes_ar.length > 0 || report.building.notes_en.length > 0) && (
        <p className={`text-[11px] ${muted}`}>
          {(ar ? report.building.notes_ar : report.building.notes_en).join(' · ')}
        </p>
      )}
    </section>
  );
}
