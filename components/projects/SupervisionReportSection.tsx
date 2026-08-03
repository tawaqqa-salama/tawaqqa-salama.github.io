'use client';

import { useEffect } from 'react';
import type { ClientRecord } from '@/lib/types/client';
import type {
  ProjectEngineeringData,
  SupervisionProgressStatus,
  SupervisionReport,
  SupervisionTaskRow,
  SupervisionWorkType,
} from '@/lib/types/project-reports';
import type { CompanyProfile } from '@/lib/company-profile';
import {
  SUPERVISION_LEGEND,
  addSupervisionMonth,
  calcOverallProgress,
  calcTaskTotalPercent,
  removeSupervisionMonth,
  resolveOverallProgress,
  seedSupervisionReport,
  statusCellColor,
} from '@/lib/projects/supervision-report';
import { printSupervisionReport } from '@/components/projects/SupervisionReportPrint';

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;
const WORK_TYPES: SupervisionWorkType[] = ['توريد', 'تركيب', 'توريد وتركيب', ''];
const CELL_STATUSES: { value: SupervisionProgressStatus; label: string }[] = [
  { value: '', label: '—' },
  { value: 'late', label: 'متأخر' },
  { value: 'on_time', label: 'في الوقت' },
  { value: 'not_due', label: 'لم يحن' },
];

type SupervisionReportSectionProps = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company: CompanyProfile | null;
  saving: boolean;
  onChange: (report: SupervisionReport) => void;
  onSave: () => void;
};

export default function SupervisionReportSection({
  client,
  data,
  company,
  saving,
  onChange,
  onSave,
}: SupervisionReportSectionProps) {
  const report = data.supervision_report;

  useEffect(() => {
    const seeded = seedSupervisionReport(client, data, company, report);
    const needsSeed =
      !report.owner_name ||
      !report.supervising_office ||
      !(report.months?.length) ||
      !(report.tasks?.length);
    if (needsSeed) onChange(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed when section opens / company loads
  }, [client.id, company?.legal_name, company?.name]);

  const patch = (partial: Partial<SupervisionReport>) => {
    const next = { ...report, ...partial };
    if (!next.overall_progress_manual) {
      next.overall_progress_percent = calcOverallProgress(next.tasks || []);
    }
    onChange(next);
  };

  const updateTask = (taskId: string, updater: (task: SupervisionTaskRow) => SupervisionTaskRow) => {
    const tasks = (report.tasks || []).map((t) => (t.id === taskId ? updater(t) : t));
    patch({ tasks });
  };

  const refreshFromProject = () => {
    onChange(seedSupervisionReport(client, data, company, report));
  };

  const addTask = () => {
    const months = report.months || [];
    const row: SupervisionTaskRow = {
      id: `task-manual-${Date.now()}`,
      category_id: 'manual',
      category_label: 'بند إضافي',
      description: '',
      work_type: 'توريد وتركيب',
      month_progress: Object.fromEntries(months.map((m) => [m.id, { percent: null, status: '' as const }])),
      total_percent: null,
    };
    patch({ tasks: [...(report.tasks || []), row] });
  };

  const removeTask = (taskId: string) => {
    patch({ tasks: (report.tasks || []).filter((t) => t.id !== taskId) });
  };

  const overall = resolveOverallProgress(report);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        تقرير الإشراف الدوري ومتابعة الإنجاز — يسحب البيانات تلقائياً من التسويق/المبيعات والتقرير الفني، والطباعة A4 أفقية متعددة الصفحات.
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={refreshFromProject}
          className="px-3 py-2 rounded-xl border text-sm bg-white hover:bg-gray-50"
        >
          تحديث من بيانات المشروع
        </button>
        <button
          type="button"
          onClick={() => printSupervisionReport(client, report, company)}
          className="px-3 py-2 rounded-xl border border-emerald-600 text-emerald-800 text-sm bg-white hover:bg-emerald-50"
        >
          معاينة / طباعة A4 أفقي
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">حالة التقرير</span>
          <select
            value={report.status}
            onChange={(e) => patch({ status: e.target.value as SupervisionReport['status'] })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          >
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="تاريخ التقرير"
          type="date"
          value={report.report_date || ''}
          onChange={(v) => patch({ report_date: v })}
        />
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">من التسويق / المبيعات</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="المستثمر / المالك" value={report.owner_name || ''} onChange={(v) => patch({ owner_name: v })} />
          <Field label="المشروع" value={report.project_name || ''} onChange={(v) => patch({ project_name: v })} />
          <Field label="نوع المبنى" value={report.building_type || ''} onChange={(v) => patch({ building_type: v })} />
          <Field label="المساحة (م²)" value={report.area_m2 || ''} onChange={(v) => patch({ area_m2: v })} />
          <Field
            label="المؤسسة / الشركة القائمة بأعمال التنفيذ"
            value={report.contractor_name || ''}
            onChange={(v) => patch({ contractor_name: v })}
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">من التقرير الفني والمكتب</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            label="رقم التقرير واستمارة الكشف"
            value={report.inspection_form_number || ''}
            onChange={(v) => patch({ inspection_form_number: v })}
            dir="ltr"
          />
          <Field
            label="رقم الدراسة"
            value={report.study_number || ''}
            onChange={(v) => patch({ study_number: v })}
            dir="ltr"
          />
          <Field
            label="المكتب المشرف"
            value={report.supervising_office || ''}
            onChange={(v) => patch({ supervising_office: v })}
          />
          <Field
            label="اسم مدير الفرع"
            value={report.branch_manager_name || ''}
            onChange={(v) => patch({ branch_manager_name: v })}
          />
          <Field
            label="مهندس السلامة"
            value={report.safety_engineer_name || ''}
            onChange={(v) => patch({ safety_engineer_name: v })}
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">متابعة التنفيذ</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            label="مدة التنفيذ الكلية"
            value={report.total_duration || ''}
            onChange={(v) => patch({ total_duration: v })}
            placeholder="مثال: 90 يوماً"
          />
          <Field
            label="تاريخ البدء"
            type="date"
            value={report.start_date || ''}
            onChange={(v) => patch({ start_date: v })}
          />
          <label className="text-sm md:col-span-2">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">نسبة الإنجاز الكلي %</span>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={0}
                max={100}
                value={overall ?? ''}
                disabled={!report.overall_progress_manual}
                onChange={(e) => {
                  const n = e.target.value === '' ? null : Number(e.target.value);
                  patch({ overall_progress_percent: n, overall_progress_manual: true });
                }}
                className="w-28 border rounded-xl px-3 py-2.5 text-sm disabled:bg-gray-100"
              />
              <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={!!report.overall_progress_manual}
                  onChange={(e) => {
                    const manual = e.target.checked;
                    patch({
                      overall_progress_manual: manual,
                      overall_progress_percent: manual
                        ? report.overall_progress_percent ?? calcOverallProgress(report.tasks || [])
                        : calcOverallProgress(report.tasks || []),
                    });
                  }}
                />
                إدخال يدوي (وإلا تُحسب من بنود الجدول)
              </label>
              {!report.overall_progress_manual && (
                <span className="text-xs text-emerald-700">محسوبة تلقائياً: {overall ?? '—'}%</span>
              )}
            </div>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-gray-700 border rounded-xl p-3 bg-gray-50">
        {SUPERVISION_LEGEND.map((item) => (
          <div key={item.status} className="inline-flex items-center gap-2">
            <span
              className="inline-block w-3.5 h-3.5 border border-slate-400"
              style={{ background: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-gray-800 grow">جدول متابعة الأعمال</p>
        <button
          type="button"
          onClick={() => onChange(addSupervisionMonth(report))}
          className="px-3 py-1.5 rounded-lg border text-xs bg-white"
        >
          + إضافة شهر
        </button>
        <button type="button" onClick={addTask} className="px-3 py-1.5 rounded-lg border text-xs bg-white">
          + إضافة بند
        </button>
      </div>

      <div className="overflow-x-auto border rounded-xl">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-emerald-900 text-white">
              <th className="p-2 border border-emerald-800">الأعمال</th>
              <th className="p-2 border border-emerald-800">الملاحظات</th>
              <th className="p-2 border border-emerald-800">نوع العمل</th>
              {(report.months || []).map((m) => (
                <th key={m.id} className="p-2 border border-emerald-800 min-w-[88px]">
                  <div className="flex flex-col gap-1 items-center">
                    <input
                      value={m.label}
                      onChange={(e) => {
                        const months = (report.months || []).map((x) =>
                          x.id === m.id ? { ...x, label: e.target.value } : x
                        );
                        patch({ months });
                      }}
                      className="w-full text-center text-[11px] rounded px-1 py-0.5 text-gray-900"
                    />
                    {(report.months?.length || 0) > 1 && (
                      <button
                        type="button"
                        className="text-[10px] text-red-200 hover:text-white"
                        onClick={() => onChange(removeSupervisionMonth(report, m.id))}
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="p-2 border border-emerald-800">نسبة الإنجاز %</th>
              <th className="p-2 border border-emerald-800 no-print">حذف</th>
            </tr>
          </thead>
          <tbody>
            {(report.tasks || []).map((task) => (
              <tr key={task.id} className="bg-white odd:bg-slate-50">
                <td className="p-1.5 border align-top">
                  <input
                    value={task.category_label}
                    onChange={(e) =>
                      updateTask(task.id, (t) => ({ ...t, category_label: e.target.value }))
                    }
                    className="w-28 border rounded px-1.5 py-1"
                  />
                </td>
                <td className="p-1.5 border align-top">
                  <input
                    value={task.description}
                    onChange={(e) =>
                      updateTask(task.id, (t) => ({ ...t, description: e.target.value }))
                    }
                    className="w-40 border rounded px-1.5 py-1"
                  />
                </td>
                <td className="p-1.5 border align-top">
                  <select
                    value={task.work_type || ''}
                    onChange={(e) =>
                      updateTask(task.id, (t) => ({
                        ...t,
                        work_type: e.target.value as SupervisionWorkType,
                      }))
                    }
                    className="border rounded px-1.5 py-1"
                  >
                    {WORK_TYPES.map((w) => (
                      <option key={w || 'empty'} value={w}>
                        {w || '—'}
                      </option>
                    ))}
                  </select>
                </td>
                {(report.months || []).map((m) => {
                  const cell = task.month_progress?.[m.id] || { percent: null, status: '' as const };
                  return (
                    <td
                      key={m.id}
                      className="p-1.5 border align-top"
                      style={{ background: statusCellColor(cell.status) }}
                    >
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={cell.percent ?? ''}
                        onChange={(e) => {
                          const percent = e.target.value === '' ? null : Number(e.target.value);
                          updateTask(task.id, (t) => ({
                            ...t,
                            month_progress: {
                              ...t.month_progress,
                              [m.id]: { ...cell, percent },
                            },
                            total_percent: null,
                          }));
                        }}
                        className="w-14 border rounded px-1 py-1 text-center bg-white/80"
                        placeholder="%"
                      />
                      <select
                        value={cell.status}
                        onChange={(e) => {
                          const status = e.target.value as SupervisionProgressStatus;
                          updateTask(task.id, (t) => ({
                            ...t,
                            month_progress: {
                              ...t.month_progress,
                              [m.id]: { ...cell, status },
                            },
                          }));
                        }}
                        className="mt-1 w-full border rounded px-1 py-0.5 text-[10px] bg-white/80"
                      >
                        {CELL_STATUSES.map((s) => (
                          <option key={s.value || 'empty'} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
                <td className="p-1.5 border align-top text-center font-semibold">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={task.total_percent ?? calcTaskTotalPercent(task) ?? ''}
                    onChange={(e) => {
                      const total_percent = e.target.value === '' ? null : Number(e.target.value);
                      updateTask(task.id, (t) => ({ ...t, total_percent }));
                    }}
                    className="w-14 border rounded px-1 py-1 text-center"
                    title="اتركه فارغاً ليُحسب من الأشهر، أو أدخل قيمة يدوية"
                  />
                </td>
                <td className="p-1.5 border align-top text-center">
                  <button
                    type="button"
                    onClick={() => removeTask(task.id)}
                    className="text-red-600 hover:underline text-[11px]"
                  >
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <textarea
        rows={3}
        placeholder="ملاحظات عامة"
        value={report.notes || ''}
        onChange={(e) => patch({ notes: e.target.value })}
        className="w-full p-2.5 border rounded-xl text-sm"
      />

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm disabled:opacity-50"
      >
        {saving ? 'جاري الحفظ...' : 'حفظ تقرير الإشراف'}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <label className="text-sm block">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        dir={dir}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 text-sm"
      />
    </label>
  );
}
