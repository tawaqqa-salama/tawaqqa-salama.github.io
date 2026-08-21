'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { buildRemediationCases } from '@/lib/projects/field-visit-remediation';
import type {
  FieldVisitObservationSeverity,
  FieldVisitObservationStatus,
  FieldVisitReport,
  SupervisionReport,
  TechnicalNotesReport,
} from '@/lib/types/project-reports';
import {
  FIELD_VISIT_OBSERVATION_SEVERITIES,
  FIELD_VISIT_OBSERVATION_STATUSES,
  observationLabel,
} from '@/lib/projects/field-visit-observations';

type Props = {
  visits: FieldVisitReport[];
  supervision: SupervisionReport;
  technicalNotes: TechnicalNotesReport;
};

const STATUS_ORDER: FieldVisitObservationStatus[] = ['open', 'in_progress', 'resolved', 'verified'];

export default function RemediationFollowUpPanel({ visits, supervision, technicalNotes }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [status, setStatus] = useState<FieldVisitObservationStatus | ''>('');
  const [severity, setSeverity] = useState<FieldVisitObservationSeverity | ''>('');
  const [responsible, setResponsible] = useState('');
  const [dueOnOrBefore, setDueOnOrBefore] = useState('');

  const cases = useMemo(
    () => buildRemediationCases({ visits, supervision, technicalNotes }),
    [visits, supervision, technicalNotes]
  );
  const counts = useMemo(
    () =>
      STATUS_ORDER.reduce<Record<FieldVisitObservationStatus, number>>(
        (result, key) => ({ ...result, [key]: cases.filter((item) => item.current.observation.status === key).length }),
        { open: 0, in_progress: 0, resolved: 0, verified: 0 }
      ),
    [cases]
  );
  const filtered = cases.filter((item) => {
    const current = item.current.observation;
    if (status && current.status !== status) return false;
    if (severity && item.root.observation.severity !== severity) return false;
    if (responsible.trim() && !current.responsible_party.toLowerCase().includes(responsible.trim().toLowerCase())) return false;
    if (dueOnOrBefore && (!current.due_date || current.due_date > dueOnOrBefore)) return false;
    return true;
  });

  return (
    <section className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-3 sm:p-4" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-cyan-950">متابعة المعالجات</h3>
          <p className="mt-1 text-xs leading-5 text-cyan-900">
            عرض متابعة مشتق من الزيارات والملاحظات والأدلة وبنود الإشراف. لا ينفذ انتقال Workflow ولا ينسخ الأدلة أو يحفظ روابط تخزين.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="shrink-0 rounded-lg border border-cyan-300 bg-white px-3 py-2 text-xs font-semibold text-cyan-900"
          aria-expanded={expanded}
        >
          {expanded ? 'إخفاء المتابعة' : 'إظهار المتابعة'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUS_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus((value) => (value === key ? '' : key))}
            className={`rounded-lg border px-3 py-2 text-right text-xs ${status === key ? 'border-cyan-600 bg-cyan-100 text-cyan-950' : 'border-cyan-200 bg-white text-cyan-900'}`}
          >
            <span className="block font-semibold">{observationLabel(FIELD_VISIT_OBSERVATION_STATUSES, key)}</span>
            <span className="mt-1 block text-lg font-bold leading-none">{counts[key]}</span>
          </button>
        ))}
      </div>

      {expanded ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect label="الحالة" value={status} onChange={(value) => setStatus(value as FieldVisitObservationStatus | '')}>
              <option value="">كل الحالات</option>
              {FIELD_VISIT_OBSERVATION_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </FilterSelect>
            <FilterSelect label="الخطورة" value={severity} onChange={(value) => setSeverity(value as FieldVisitObservationSeverity | '')}>
              <option value="">كل درجات الخطورة</option>
              {FIELD_VISIT_OBSERVATION_SEVERITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </FilterSelect>
            <label className="block text-xs font-semibold text-cyan-950">
              <span className="mb-1 block">المسؤول</span>
              <input value={responsible} onChange={(event) => setResponsible(event.target.value)} className="w-full rounded-lg border border-cyan-200 bg-white px-2.5 py-2 text-sm font-normal text-slate-900" placeholder="تصفية بالجهة المسؤولة" />
            </label>
            <label className="block text-xs font-semibold text-cyan-950">
              <span className="mb-1 block">تاريخ الاستحقاق حتى</span>
              <input type="date" value={dueOnOrBefore} onChange={(event) => setDueOnOrBefore(event.target.value)} className="w-full rounded-lg border border-cyan-200 bg-white px-2.5 py-2 text-sm font-normal text-slate-900" />
            </label>
          </div>

          {filtered.length ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-cyan-200 bg-white">
              <table className="min-w-[920px] w-full text-right text-xs">
                <thead className="bg-cyan-950 text-white">
                  <tr>
                    <th className="p-2">الملاحظة الأصلية</th>
                    <th className="p-2">أول زيارة / آخر متابعة</th>
                    <th className="p-2">الحالة والخطورة</th>
                    <th className="p-2">المسؤول / الاستحقاق</th>
                    <th className="p-2">الأدلة</th>
                    <th className="p-2">الروابط الهندسية</th>
                    <th className="p-2">تحقق المهندس</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const root = item.root.observation;
                    const current = item.current.observation;
                    return (
                      <tr key={`${item.root.ref.visit_number}-${item.root.ref.observation_id}`} className="border-t border-cyan-100 align-top">
                        <td className="p-2 leading-5"><strong>{root.location || 'بدون موقع'}</strong><br />{root.description || 'بدون وصف'}</td>
                        <td className="p-2 leading-5">زيارة #{item.root.ref.visit_number}<br />{item.followUps.length ? `زيارة #${item.current.ref.visit_number} (${item.followUps.length} متابعة)` : 'لا توجد متابعة لاحقة'}</td>
                        <td className="p-2 leading-5">{observationLabel(FIELD_VISIT_OBSERVATION_STATUSES, current.status)}<br />{observationLabel(FIELD_VISIT_OBSERVATION_SEVERITIES, root.severity)}</td>
                        <td className="p-2 leading-5">{current.responsible_party || '—'}<br />{current.due_date || '—'}</td>
                        <td className="p-2 leading-5">{item.evidence.length} دليل<br />قبل: {item.beforeEvidenceCount} · بعد: {item.afterEvidenceCount}</td>
                        <td className="p-2 leading-5">إشراف: {item.linkedSupervisionTaskIds.length}<br />ملاحظات فنية: {item.linkedDeficiencies.length}</td>
                        <td className="p-2 leading-5">{current.status === 'verified' ? `تم التحقق: ${current.verified_by || 'مهندس'}${current.verified_at ? ` — ${current.verified_at.slice(0, 10)}` : ''}` : 'لم يكتمل التحقق'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-cyan-200 bg-white/80 px-3 py-3 text-xs text-cyan-900">لا توجد نتائج توافق المرشحات الحالية.</p>
          )}
        </>
      ) : null}
    </section>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-cyan-950">
      <span className="mb-1 block">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-cyan-200 bg-white px-2.5 py-2 text-sm font-normal text-slate-900">{children}</select>
    </label>
  );
}
