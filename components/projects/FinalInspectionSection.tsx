'use client';

import { useMemo, useState } from 'react';
import type { ClientRecord } from '@/lib/types/client';
import type {
  FinalInspectionReport,
  FinalReportObservation,
  ProjectEngineeringData,
  TechnicalReportPhoto,
} from '@/lib/types/project-reports';
import {
  collectFinalReportObservations,
  markObservationFixed,
  mergeSystemCompletion,
  overallSystemsPercent,
  seedFinalInspectionReport,
} from '@/lib/projects/final-safety-report';
import { printFinalSafetyReport } from '@/components/projects/FinalSafetyReportPrint';
import type { CompanyProfile } from '@/lib/company-profile';

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

type FinalInspectionSectionProps = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company: CompanyProfile | null;
  saving: boolean;
  onChange: (report: FinalInspectionReport) => void;
  onSave: () => void;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

export default function FinalInspectionSection({
  client,
  data,
  company,
  saving,
  onChange,
  onSave,
}: FinalInspectionSectionProps) {
  const report = data.final_inspection;
  const [busyUpload, setBusyUpload] = useState<string | null>(null);

  const observations = report.observations || [];
  const systems = report.system_completion || [];
  const overall = overallSystemsPercent(systems);
  const fixedCount = observations.filter((o) => o.status === 'fixed').length;

  const patch = (partial: Partial<FinalInspectionReport>) => {
    onChange({ ...report, ...partial });
  };

  const patchObservation = (id: string, next: FinalReportObservation) => {
    const list = observations.map((row) => (row.id === id ? next : row));
    patch({
      observations: list,
      system_completion: mergeSystemCompletion(systems, list),
      overall_result:
        list.length && list.every((o) => o.status === 'fixed')
          ? 'مطابق — جاهز للتسليم'
          : report.overall_result,
    });
  };

  const refreshFromProject = () => {
    const seeded = seedFinalInspectionReport(client, data, report);
    onChange(seeded);
  };

  const addManual = () => {
    const row: FinalReportObservation = {
      id: `manual-${Date.now()}`,
      title: 'ملاحظة جديدة',
      description: '',
      source: 'manual',
      source_ref: `manual-${Date.now()}`,
      before_photo: null,
      after_photo: null,
      status: 'pending',
      completion_percent: 0,
    };
    const list = [...observations, row];
    patch({
      observations: list,
      system_completion: mergeSystemCompletion(systems, list),
    });
  };

  const uploadAfter = async (obs: FinalReportObservation, file: File | null) => {
    if (!file) return;
    setBusyUpload(obs.id);
    try {
      const dataUrl = await fileToDataUrl(file);
      const photo: TechnicalReportPhoto = {
        id: `after-${Date.now()}`,
        caption: `بعد — ${obs.title}`,
        dataUrl,
      };
      patchObservation(obs.id, markObservationFixed(obs, photo));
    } finally {
      setBusyUpload(null);
    }
  };

  const uploadBefore = async (obs: FinalReportObservation, file: File | null) => {
    if (!file) return;
    setBusyUpload(obs.id);
    try {
      const dataUrl = await fileToDataUrl(file);
      const photo: TechnicalReportPhoto = {
        id: `before-${Date.now()}`,
        caption: `قبل — ${obs.title}`,
        dataUrl,
      };
      patchObservation(obs.id, { ...obs, before_photo: photo });
    } finally {
      setBusyUpload(null);
    }
  };

  const handlePrint = () => {
    if (!company) return;
    const ready = {
      ...report,
      observations: collectFinalReportObservations(data, report.observations),
      system_completion: mergeSystemCompletion(report.system_completion, report.observations),
    };
    printFinalSafetyReport({
      client,
      data: { ...data, final_inspection: ready },
      report: ready,
      company,
    });
  };

  const summaryHint = useMemo(() => {
    if (!observations.length) return 'لا توجد ملاحظات بعد — اضغط مزامنة لجلب الملاحظات من الزيارات والتقرير الفني.';
    return `${fixedCount} من ${observations.length} ملاحظة مُصلَحة · متوسط الأنظمة ${overall}%`;
  }, [observations.length, fixedCount, overall]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        تقرير نهائي بنمط باندا — صور <strong>قبل</strong> تُجلب تلقائياً من الزيارات/الملاحظات/التقرير الفني، وصور{' '}
        <strong>بعد</strong> يرفعها المهندس كإثبات تصحيح.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">حالة التقرير</span>
          <select
            value={report.status}
            onChange={(e) =>
              patch({ status: e.target.value as FinalInspectionReport['status'] })
            }
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          >
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">تاريخ المعاينة</span>
          <input
            type="date"
            value={report.inspection_date || ''}
            onChange={(e) => patch({ inspection_date: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">المفتش / المهندس</span>
          <input
            value={report.inspector_name || ''}
            onChange={(e) => patch({ inspector_name: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">الفرع / الموقع</span>
          <input
            value={report.branch_name || ''}
            onChange={(e) => patch({ branch_name: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">النتيجة العامة</span>
          <input
            value={report.overall_result || ''}
            onChange={(e) => patch({ overall_result: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-xs font-semibold text-gray-600 mb-1 block">الملخص التنفيذي</span>
        <textarea
          rows={3}
          value={report.executive_summary || report.compliance_summary || ''}
          onChange={(e) =>
            patch({ executive_summary: e.target.value, compliance_summary: e.target.value })
          }
          className="w-full border rounded-xl px-3 py-2.5 text-sm"
        />
      </label>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-bold text-gray-800">نسب اكتمال الأنظمة</p>
          <span className="text-xs font-semibold text-emerald-700">{overall}% إجمالي</span>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-center border-collapse text-xs min-w-[480px]">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-300 p-2">النظام</th>
                <th className="border border-gray-300 p-2">نسبة الاكتمال</th>
                <th className="border border-gray-300 p-2">التحقق</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((sys) => (
                <tr key={sys.id}>
                  <td className="border border-gray-300 p-2 font-bold text-right">{sys.label}</td>
                  <td className="border border-gray-300 p-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={sys.percent}
                      onChange={(e) => {
                        const percent = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                        patch({
                          system_completion: systems.map((row) =>
                            row.id === sys.id
                              ? { ...row, percent, verified: percent === 100 }
                              : row
                          ),
                        });
                      }}
                      className="w-20 border rounded-lg px-2 py-1 text-center"
                    />
                    %
                  </td>
                  <td className="border border-gray-300 p-2">
                    {sys.verified || sys.percent >= 100 ? '✓ مكتمل' : 'قيد العمل'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <p className="text-sm font-bold text-gray-800">ملاحظات قبل / بعد</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{summaryHint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshFromProject}
              className="px-3 py-1.5 rounded-lg border text-xs font-semibold"
            >
              مزامنة من الزيارات والتقارير
            </button>
            <button
              type="button"
              onClick={addManual}
              className="px-3 py-1.5 rounded-lg border text-xs font-semibold"
            >
              + ملاحظة يدوية
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {observations.map((obs) => (
            <div key={obs.id} className="rounded-xl border bg-white p-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <input
                    value={obs.title}
                    onChange={(e) => patchObservation(obs.id, { ...obs, title: e.target.value })}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm font-semibold"
                  />
                  <textarea
                    rows={2}
                    value={obs.description || ''}
                    onChange={(e) =>
                      patchObservation(obs.id, { ...obs, description: e.target.value })
                    }
                    placeholder="وصف الملاحظة"
                    className="w-full border rounded-lg px-2 py-1.5 text-xs"
                  />
                  <p className="text-[10px] text-gray-400">
                    المصدر: {obs.source}
                    {obs.source_ref ? ` · ${obs.source_ref}` : ''}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <select
                    value={obs.status}
                    onChange={(e) => {
                      const status = e.target.value as FinalReportObservation['status'];
                      patchObservation(obs.id, {
                        ...obs,
                        status,
                        completion_percent: status === 'fixed' ? 100 : 0,
                      });
                    }}
                    className={`text-xs font-semibold rounded-lg border px-2 py-1.5 ${
                      obs.status === 'fixed'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    <option value="pending">قيد المعالجة</option>
                    <option value="fixed">تم الإصلاح (100%)</option>
                  </select>
                  <span className="text-[11px] text-center font-mono">{obs.completion_percent}%</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PhotoSlot
                  label="صورة قبل"
                  photo={obs.before_photo}
                  busy={busyUpload === obs.id}
                  onUpload={(file) => void uploadBefore(obs, file)}
                  onClear={() => patchObservation(obs.id, { ...obs, before_photo: null })}
                />
                <PhotoSlot
                  label="صورة بعد"
                  photo={obs.after_photo}
                  busy={busyUpload === obs.id}
                  accent
                  onUpload={(file) => void uploadAfter(obs, file)}
                  onClear={() =>
                    patchObservation(obs.id, {
                      ...obs,
                      after_photo: null,
                      status: 'pending',
                      completion_percent: 0,
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          حفظ التقرير النهائي
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!company}
          className="px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
        >
          معاينة وطباعة التقرير (A4)
        </button>
      </div>
    </div>
  );
}

function PhotoSlot({
  label,
  photo,
  busy,
  accent,
  onUpload,
  onClear,
}: {
  label: string;
  photo?: TechnicalReportPhoto | null;
  busy?: boolean;
  accent?: boolean;
  onUpload: (file: File | null) => void;
  onClear: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-2 ${
        accent ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-700">{label}</p>
        {photo?.dataUrl ? (
          <button type="button" onClick={onClear} className="text-[10px] text-rose-600 underline">
            حذف
          </button>
        ) : null}
      </div>
      {photo?.dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.dataUrl}
          alt={label}
          className="w-full h-36 object-cover rounded-lg border bg-white"
        />
      ) : (
        <label className="flex h-36 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
          {busy ? 'جاري الرفع...' : `رفع ${label}`}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => onUpload(e.target.files?.[0] || null)}
          />
        </label>
      )}
    </div>
  );
}
