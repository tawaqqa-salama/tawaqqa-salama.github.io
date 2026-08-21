'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  deriveStage5TraceabilityFromProject,
  type Stage5TraceabilityItem,
  type Stage5TraceabilitySnapshot,
} from '@/lib/projects/stage5-traceability';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

const STATUS_LABELS: Record<string, string> = {
  open: 'مفتوحة',
  in_progress: 'قيد المعالجة',
  resolved: 'تمت المعالجة',
  verified: 'تم التحقق',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  critical: 'حرجة',
};

const DUE_LABELS: Record<string, string> = {
  not_set: 'بلا استحقاق',
  upcoming: 'غير متأخرة',
  overdue: 'متأخرة',
  verified: 'متحقق منها',
};

type Props = {
  data: Pick<ProjectEngineeringData, 'field_visits' | 'supervision_report' | 'technical_notes' | 'report_pdf_archive'>;
  onOpenSnapshot: (snapshot: Stage5TraceabilitySnapshot) => void;
};

/**
 * A read-only current-state projection of the existing Stage 5 data.
 * It intentionally contains no callbacks for saving, editing, lifecycle changes,
 * evidence mutation, approval, or workflow transition.
 */
export default function Stage5TraceabilityPanel({ data, onOpenSnapshot }: Props) {
  const [visitNumber, setVisitNumber] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [responsible, setResponsible] = useState('');
  const [dueState, setDueState] = useState('');
  const [verification, setVerification] = useState('');
  const [pdfPresence, setPdfPresence] = useState('');

  const workspace = useMemo(
    () => deriveStage5TraceabilityFromProject(data),
    [data.field_visits, data.supervision_report, data.technical_notes, data.report_pdf_archive]
  );
  const visits = workspace.visitSummaries;
  const filteredItems = workspace.items.filter((item) => {
    if (visitNumber && !item.chainVisitNumbers.includes(Number(visitNumber))) return false;
    if (status && item.currentStatus !== status) return false;
    if (severity && item.severity !== severity) return false;
    if (responsible.trim() && !item.responsibleParty.toLocaleLowerCase('ar').includes(responsible.trim().toLocaleLowerCase('ar'))) return false;
    if (dueState && item.dueState !== dueState) return false;
    if (verification && item.verificationState !== verification) return false;
    if (pdfPresence === 'available' && item.pdfSnapshots.length === 0) return false;
    if (pdfPresence === 'missing' && item.pdfSnapshots.length > 0) return false;
    return true;
  });

  const clearFilters = () => {
    setVisitNumber('');
    setStatus('');
    setSeverity('');
    setResponsible('');
    setDueState('');
    setVerification('');
    setPdfPresence('');
  };

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:p-4" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-sky-950">مساحة مراجعة التتبع والأرشيف — Stage 5</h3>
          <p className="mt-1 text-xs leading-5 text-sky-900">
            عرض قراءة فقط مشتق من الحالة الحالية للزيارات والملاحظات والأدلة والمعالجات وروابط الإشراف والأرشيف.
          </p>
          <p className="mt-1 text-[11px] leading-5 text-sky-800">
            هذا ليس سجل تدقيق غير قابل للتعديل؛ لا يدّعي عرض كل التعديلات التاريخية أو هوية من غيّر الحقول سابقًا.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:flex sm:flex-wrap">
          <Summary label="سلاسل الملاحظات" value={workspace.items.length} />
          <Summary label="الزيارات" value={visits.length} />
          <Summary label="PDF الإشراف" value={workspace.supervisionPdfSnapshots.length} />
          <Summary label="أرشيف غير مرتبط" value={workspace.unassignedPdfSnapshots.length} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="الزيارة" value={visitNumber} onChange={setVisitNumber}>
          <option value="">كل الزيارات</option>
          {visits.map((visit) => <option key={visit.visitNumber} value={String(visit.visitNumber)}>زيارة #{visit.visitNumber}</option>)}
        </FilterSelect>
        <FilterSelect label="الحالة" value={status} onChange={setStatus}>
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FilterSelect>
        <FilterSelect label="الخطورة" value={severity} onChange={setSeverity}>
          <option value="">كل الدرجات</option>
          {Object.entries(SEVERITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FilterSelect>
        <label className="block text-xs font-semibold text-sky-950">
          <span className="mb-1 block">الجهة المسؤولة</span>
          <input value={responsible} onChange={(event) => setResponsible(event.target.value)} className="w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-sm font-normal text-slate-900" placeholder="تصفية بالمسؤول" />
        </label>
        <FilterSelect label="الاستحقاق" value={dueState} onChange={setDueState}>
          <option value="">كل الحالات</option>
          {Object.entries(DUE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </FilterSelect>
        <FilterSelect label="التحقق" value={verification} onChange={setVerification}>
          <option value="">الكل</option>
          <option value="verified">تم التحقق</option>
          <option value="pending">لم يكتمل التحقق</option>
        </FilterSelect>
        <FilterSelect label="توفر PDF" value={pdfPresence} onChange={setPdfPresence}>
          <option value="">الكل</option>
          <option value="available">له snapshot مرتبط</option>
          <option value="missing">لا يوجد snapshot مرتبط</option>
        </FilterSelect>
        <div className="flex items-end">
          <button type="button" onClick={clearFilters} className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-900">
            مسح المرشحات
          </button>
        </div>
      </div>

      {workspace.items.length === 0 ? (
        <EmptyState visits={visits.length} />
      ) : filteredItems.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-sky-200 bg-white/80 px-3 py-3 text-xs leading-5 text-sky-900">
          لا توجد سلاسل ملاحظات توافق المرشحات الحالية. لا يعني ذلك حذفًا أو فقدانًا للبيانات؛ عدّل المرشحات لعرض الحالة الحالية.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filteredItems.map((item) => <TraceabilityCard key={item.key} item={item} onOpenSnapshot={onOpenSnapshot} />)}
        </div>
      )}

      {visits.length > 0 ? (
        <div className="mt-4 border-t border-sky-200 pt-3">
          <h4 className="text-xs font-bold text-sky-950">سياق الزيارات والأرشيف الموجود</h4>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {visits.map((visit) => (
              <article key={visit.visitNumber} className="rounded-lg border border-sky-200 bg-white p-3 text-xs text-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-sky-950">زيارة #{visit.visitNumber}</strong>
                  <span>{visit.visitDate || 'بدون تاريخ'}</span>
                </div>
                <p className="mt-1 leading-5">{visit.location || 'الموقع غير مسجل'}</p>
                <p className="mt-1 text-slate-500">ملاحظات: {visit.observationCount} · أدلة: {visit.evidenceCount} · PDFs: {visit.pdfSnapshots.length}</p>
                <SnapshotList snapshots={visit.pdfSnapshots} onOpenSnapshot={onOpenSnapshot} compact />
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {workspace.supervisionPdfSnapshots.length > 0 || workspace.unassignedPdfSnapshots.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ArchiveBlock title="إصدارات تقرير الإشراف" snapshots={workspace.supervisionPdfSnapshots} onOpenSnapshot={onOpenSnapshot} />
          <ArchiveBlock title="أرشيف قائم بلا سياق ملاحظة" snapshots={workspace.unassignedPdfSnapshots} onOpenSnapshot={onOpenSnapshot} />
        </div>
      ) : null}
    </section>
  );
}

function TraceabilityCard({ item, onOpenSnapshot }: { item: Stage5TraceabilityItem; onOpenSnapshot: (snapshot: Stage5TraceabilitySnapshot) => void }) {
  const currentStatusLabel = STATUS_LABELS[item.currentStatus] || item.currentStatus || '—';
  const severityLabel = SEVERITY_LABELS[item.severity] || item.severity || '—';

  return (
    <article className="min-w-0 rounded-xl border border-sky-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-sky-950">زيارة #{item.firstVisitNumber}{item.followUpCount ? ` ← ${item.followUpCount} متابعة` : ''}</p>
          <p className="mt-1 break-words text-sm font-semibold leading-6 text-slate-900">{item.observationLocation || 'موقع غير مسجل'}</p>
          <p className="mt-1 break-words text-xs leading-5 text-slate-600">{item.observationDescription || 'بدون وصف منظم للملاحظة'}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          <Badge tone={severityTone(item.severity)}>{severityLabel}</Badge>
          <Badge tone={statusTone(item.currentStatus)}>{currentStatusLabel}</Badge>
          <Badge tone={item.verificationState === 'verified' ? 'emerald' : 'slate'}>{item.verificationState === 'verified' ? 'تحقق مهندس' : 'بانتظار التحقق'}</Badge>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <Meta label="الزيارة الأولى" value={`#${item.firstVisitNumber}${item.firstVisitDate ? ` · ${item.firstVisitDate}` : ''}`} />
        <Meta label="سلسلة الزيارات" value={item.chainVisitNumbers.map((visit) => `#${visit}`).join(' ← ')} />
        <Meta label="آخر حالة" value={`زيارة #${item.visitNumber}${item.visitDate ? ` · ${item.visitDate}` : ''}`} />
        <Meta label="المسؤول" value={item.responsibleParty || 'غير محدد'} />
        <Meta label="الاستحقاق" value={`${DUE_LABELS[item.dueState] || '—'}${item.dueDate ? ` · ${item.dueDate}` : ''}`} />
        <Meta label="المعالجة" value={item.resolvedAt ? `سجلت ${item.resolvedAt.slice(0, 10)}` : 'غير مسجلة'} />
        <Meta label="التحقق" value={item.verifiedAt ? `${item.verifiedBy || 'مهندس'} · ${item.verifiedAt.slice(0, 10)}` : 'غير مكتمل'} />
      </div>

      {item.requiredAction ? <p className="mt-3 rounded-lg bg-sky-50 px-2.5 py-2 text-xs leading-5 text-sky-950"><strong>الإجراء المطلوب:</strong> {item.requiredAction}</p> : null}

      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
        <Counter label="قبل" value={item.beforeEvidenceCount} />
        <Counter label="بعد" value={item.afterEvidenceCount} />
        <Counter label="عام" value={item.generalEvidenceCount} />
        <Counter label="مستبعد" value={item.excludedEvidenceCount} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-700 sm:grid-cols-2">
        <Meta label="روابط الإشراف" value={item.supervisionTaskIds.length ? `${item.supervisionTaskIds.length} بند` : 'لا يوجد'} />
        <Meta label="ملاحظات فنية" value={item.technicalDeficiencyIds.length ? `${item.technicalDeficiencyIds.length} ملاحظة` : 'لا يوجد'} />
      </div>

      <SnapshotList snapshots={item.pdfSnapshots} onOpenSnapshot={onOpenSnapshot} />
    </article>
  );
}

function SnapshotList({ snapshots, onOpenSnapshot, compact = false }: { snapshots: Stage5TraceabilitySnapshot[]; onOpenSnapshot: (snapshot: Stage5TraceabilitySnapshot) => void; compact?: boolean }) {
  if (!snapshots.length) return <p className="mt-3 text-xs text-slate-500">لا توجد نسخة PDF ثابتة مرتبطة حاليًا.</p>;
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <p className="text-xs font-semibold text-slate-800">نسخ PDF المرتبطة ({snapshots.length})</p>
      <div className="mt-2 space-y-1.5">
        {snapshots.slice(0, compact ? 2 : 4).map((snapshot) => (
          <div key={`${snapshot.id}:${snapshot.created_at}`} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px]">
            <span className="min-w-0 break-all text-slate-700">{snapshot.kind === 'supervision' ? 'إشراف' : `زيارة #${snapshot.visit_number ?? '—'}`} · {snapshot.fileName}</span>
            {snapshot.storageAvailable ? (
              <button type="button" onClick={() => onOpenSnapshot(snapshot)} className="shrink-0 font-semibold text-[#635bdb]">فتح PDF</button>
            ) : <span className="shrink-0 text-amber-700">غير متاح</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchiveBlock({ title, snapshots, onOpenSnapshot }: { title: string; snapshots: Stage5TraceabilitySnapshot[]; onOpenSnapshot: (snapshot: Stage5TraceabilitySnapshot) => void }) {
  if (!snapshots.length) return null;
  return <article className="rounded-lg border border-sky-200 bg-white p-3"><h4 className="text-xs font-bold text-sky-950">{title}</h4><SnapshotList snapshots={snapshots} onOpenSnapshot={onOpenSnapshot} /></article>;
}

function EmptyState({ visits }: { visits: number }) {
  return <p className="mt-3 rounded-lg border border-dashed border-sky-200 bg-white/80 px-3 py-3 text-xs leading-5 text-sky-900">{visits ? 'توجد زيارات محفوظة، لكنها لا تحتوي ملاحظات منظمة قابلة للاشتقاق. لا تُنشئ هذه الشاشة بيانات أو قيمًا بديلة.' : 'لا توجد بيانات Stage 5 قابلة للمراجعة في المشروع الحالي.'}</p>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-sky-950"><span className="mb-1 block">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-sm font-normal text-slate-900">{children}</select></label>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <p className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5 leading-5"><span className="font-semibold text-slate-800">{label}: </span><span className="break-words text-slate-600">{value}</span></p>;
}

function Counter({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-sky-100 bg-sky-50 px-2 py-1.5"><span className="block text-sky-800">{label}</span><strong className="mt-0.5 block text-base text-sky-950">{value}</strong></div>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-sky-200 bg-white px-2 py-2"><span className="block text-[10px] text-sky-800">{label}</span><strong className="mt-0.5 block text-base text-sky-950">{value}</strong></div>;
}

function Badge({ tone, children }: { tone: 'red' | 'amber' | 'emerald' | 'slate' | 'blue'; children: ReactNode }) {
  const palette = { red: 'border-red-200 bg-red-50 text-red-800', amber: 'border-amber-200 bg-amber-50 text-amber-800', emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800', slate: 'border-slate-200 bg-slate-50 text-slate-700', blue: 'border-sky-200 bg-sky-50 text-sky-800' };
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${palette[tone]}`}>{children}</span>;
}

function severityTone(severity: string): 'red' | 'amber' | 'blue' | 'slate' {
  if (severity === 'critical') return 'red';
  if (severity === 'high') return 'amber';
  if (severity === 'medium') return 'blue';
  return 'slate';
}

function statusTone(status: string): 'red' | 'amber' | 'emerald' | 'slate' | 'blue' {
  if (status === 'verified') return 'emerald';
  if (status === 'resolved') return 'blue';
  if (status === 'in_progress') return 'amber';
  if (status === 'open') return 'red';
  return 'slate';
}
