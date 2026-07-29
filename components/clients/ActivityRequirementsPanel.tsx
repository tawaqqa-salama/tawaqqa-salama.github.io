'use client';

import { deriveActivityRequirements } from '@/lib/business/sbc-requirements';

interface ActivityRequirementsPanelProps {
  activityType?: string | null;
  floorsCount?: number | null;
  buildingArea?: number | null;
  landArea?: number | null;
}

const SEVERITY_STYLES = {
  info: 'border-sky-200 bg-sky-50 text-sky-950',
  required: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
} as const;

const SEVERITY_BADGE = {
  info: 'معلومة',
  required: 'إلزامي',
  warning: 'تنبيه',
} as const;

export default function ActivityRequirementsPanel({
  activityType,
  floorsCount,
  buildingArea,
  landArea,
}: ActivityRequirementsPanelProps) {
  const result = deriveActivityRequirements({
    activity_type: activityType,
    floors_count: floorsCount,
    building_area: buildingArea,
    land_area: landArea,
  });

  if (!activityType) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
        اختر نوع النشاط لعرض اشتراطات SBC 801/201 المرتبطة بالخيارات.
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        نوع النشاط غير مربوط بعد بتصنيف إشغال في الكود.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500">اشتراطات مربوطة بالخيارات</p>
          <h3 className="font-bold text-gray-900 mt-0.5">
            {result.activityLabel} — {result.occupancy.label_ar}
          </h3>
          <p className="text-xs text-gray-600 mt-1">
            الخطر: {result.riskLabel} · الأدوار: {result.floorsCount || '—'} · مساحة المبنى:{' '}
            {result.buildingArea ? `${result.buildingArea.toLocaleString('ar-SA')} م²` : '—'}
          </p>
        </div>
        <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-[#1f4d3a]/10 text-[#1f4d3a]">
          SBC 801 / 201
        </span>
      </div>

      <ul className="space-y-2">
        {result.requirements.map((item) => (
          <li
            key={item.id}
            className={`rounded-lg border p-3 text-sm ${SEVERITY_STYLES[item.severity]}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70">
                {SEVERITY_BADGE[item.severity]}
              </span>
              <p className="font-semibold">{item.title}</p>
            </div>
            <p className="text-xs leading-relaxed opacity-90">{item.detail}</p>
            {item.refs.length > 0 && (
              <p className="text-[10px] mt-1.5 opacity-70 font-mono">
                {item.refs.join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-gray-500 leading-relaxed">
        المرجع التنفيذي: موجز SBC 801 وخريطة متطلبات SBC 201/801 داخل وثائق المنصة. يُراجع المهندس
        النص الكامل للكود عند الإعداد النهائي للتقرير.
      </p>
    </div>
  );
}
