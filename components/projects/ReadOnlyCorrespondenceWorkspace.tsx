'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import {
  buildLegacyStage6DocumentSummaries,
  loadReadOnlyCorrespondenceWorkspace,
  RELATIONAL_CORRESPONDENCE_STATUS_LABELS,
  RELATIONAL_CORRESPONDENCE_TYPE_LABELS,
  type ReadOnlyCorrespondenceRecord,
  type ReadOnlyCorrespondenceWorkspaceLoad,
  type RelationalCorrespondenceStatus,
  type RelationalCorrespondenceType,
} from '@/lib/projects/read-only-correspondence-workspace';

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
};

const ALL = 'all' as const;

type TypeFilter = typeof ALL | RelationalCorrespondenceType;
type StatusFilter = typeof ALL | RelationalCorrespondenceStatus;

function displayDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function statusClass(status: RelationalCorrespondenceStatus): string {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-900';
  if (status === 'ready') return 'bg-sky-100 text-sky-900';
  if (status === 'preparing') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-800';
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-slate-800">{value}</dd>
    </div>
  );
}

function CorrespondenceCard({ record }: { record: ReadOnlyCorrespondenceRecord }) {
  return (
    <article className="min-w-0 border border-slate-200 bg-white p-4 sm:p-5" aria-label="مراسلة مسجلة">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">سجل مراسلات جديد</p>
          <h4 className="mt-1 break-words text-base font-bold leading-7 text-slate-950">{record.subject}</h4>
          <p className="mt-1 text-sm text-slate-600">
            {RELATIONAL_CORRESPONDENCE_TYPE_LABELS[record.correspondenceType]}
          </p>
        </div>
        <span className={`inline-flex w-fit shrink-0 px-2.5 py-1 text-xs font-bold ${statusClass(record.documentStatus)}`}>
          {RELATIONAL_CORRESPONDENCE_STATUS_LABELS[record.documentStatus]}
        </span>
      </div>

      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="المرجع" value={record.referenceNumber} />
        <Detail label="التاريخ" value={record.correspondenceDate ? displayDate(record.correspondenceDate) : null} />
        <Detail label="جهة الاستلام" value={record.recipientName} />
        <Detail label="مهندس المسؤولية" value={record.responsibleEngineerName} />
        <Detail label="مدير المسؤولية" value={record.responsibleManagerName} />
        <Detail label="تاريخ الاعتماد" value={record.approvedAt ? displayDate(record.approvedAt) : null} />
        <Detail label="آخر تحديث" value={record.updatedAt ? displayDate(record.updatedAt) : null} />
      </dl>
    </article>
  );
}

export default function ReadOnlyCorrespondenceWorkspace({ client, data }: Props) {
  const [load, setLoad] = useState<ReadOnlyCorrespondenceWorkspaceLoad | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL);
  const [dateFilter, setDateFilter] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadReadOnlyCorrespondenceWorkspace(client.id, client.primary_engineering_project_identity)
      .then((next) => {
        if (!cancelled) setLoad(next);
      });
    return () => {
      cancelled = true;
    };
  }, [client.id, client.primary_engineering_project_identity]);

  const legacySummaries = useMemo(() => buildLegacyStage6DocumentSummaries(data), [data]);
  const records = useMemo(() => load?.records || [], [load]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ar-SA');
    return records.filter((record) => {
      if (typeFilter !== ALL && record.correspondenceType !== typeFilter) return false;
      if (statusFilter !== ALL && record.documentStatus !== statusFilter) return false;
      if (dateFilter && record.correspondenceDate !== dateFilter) return false;
      if (!normalizedQuery) return true;
      return [record.subject, record.referenceNumber || '']
        .join(' ')
        .toLocaleLowerCase('ar-SA')
        .includes(normalizedQuery);
    });
  }, [dateFilter, query, records, statusFilter, typeFilter]);

  const approvedCount = records.filter((record) => record.documentStatus === 'approved').length;
  const readyCount = records.filter((record) => record.documentStatus === 'ready').length;

  return (
    <section className="space-y-5 border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-labelledby="correspondence-workspace-title">
      <header className="min-w-0 border-b border-slate-200 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">Stage 6</p>
        <h3 id="correspondence-workspace-title" className="mt-1 text-lg font-bold text-slate-950">
          مساحة المراسلات
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          عرض معلوماتي فقط لسجل المراسلات الجديد وحالة النموذجين الحاليين. لا تنشئ هذه المساحة سجلات ولا
          تنقل أو تعتمد أي مرحلة، وتبقى النماذج المعتمدة أدناه متاحة في أقسامها الحالية.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">إجمالي السجلات المسجلة</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{records.length}</p>
        </div>
        <div className="border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">جاهزة للاعتماد</p>
          <p className="mt-1 text-2xl font-bold text-sky-800">{readyCount}</p>
        </div>
        <div className="border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">معتمدة</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{approvedCount}</p>
        </div>
      </div>

      <section className="border border-amber-200 bg-amber-50 p-4" aria-labelledby="legacy-summary-title">
        <div className="min-w-0">
          <p className="text-xs font-bold text-amber-800">النموذجان المعتمدان</p>
          <h4 id="legacy-summary-title" className="mt-1 text-base font-bold text-amber-950">
            حالة النموذج الحالي
          </h4>
          <p className="mt-1 text-sm leading-6 text-amber-950">
            هذه المعلومات تخص النماذج الحالية وليست سجلات مراسلات جديدة، ولم يتم ترحيل أي منها إلى مساحة المراسلات.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {legacySummaries.map((summary) => (
            <article key={summary.key} className="min-w-0 border border-amber-200 bg-white p-3">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-800">{summary.provenanceLabel}</p>
                  <h5 className="mt-1 break-words font-bold text-slate-950">{summary.label}</h5>
                </div>
                <span className={`w-fit px-2.5 py-1 text-xs font-bold ${summary.complete ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
                  {summary.complete ? 'مكتمل وفق عقد المرحلة' : 'يحتاج استكمال عقد المرحلة'}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <Detail label="الحالة" value={summary.status || (summary.available ? 'غير محددة' : 'غير متوفر')} />
                <Detail label="المرجع" value={summary.referenceNumber} />
                <Detail label="التاريخ" value={summary.documentDate ? displayDate(summary.documentDate) : null} />
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="relational-records-title">
        <div className="min-w-0">
          <p className="text-xs font-bold text-indigo-700">سجل المراسلات الجديد</p>
          <h4 id="relational-records-title" className="mt-1 text-base font-bold text-slate-950">
            المراسلات المسجلة
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            يظهر كل سجل علائقي كما هو. عند وجود نموذج حالي وسجل مراسلة معًا، يعرض كل منهما كمصدر مستقل من دون دمج أو إخفاء تلقائي.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="min-w-0 text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">النوع</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} className="w-full min-w-0 border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value={ALL}>كل الأنواع</option>
              {Object.entries(RELATIONAL_CORRESPONDENCE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">الحالة</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="w-full min-w-0 border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value={ALL}>كل الحالات</option>
              {Object.entries(RELATIONAL_CORRESPONDENCE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">التاريخ</span>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="w-full min-w-0 border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <label className="min-w-0 text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">الموضوع أو المرجع</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في الموضوع أو المرجع" className="w-full min-w-0 border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
        </div>

        {!load && (
          <div className="border border-slate-200 bg-white p-5 text-sm text-slate-600">يجري تحميل سجل المراسلات…</div>
        )}

        {load?.kind === 'identity-unavailable' && (
          <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            لا تتوفر هوية المشروع الكانونية لعرض سجل المراسلات حاليًا. لا يؤثر ذلك في النموذجين الحاليين أو بوابة المرحلة.
          </div>
        )}

        {load?.kind === 'load-error' && (
          <div className="border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
            تعذر تحميل سجل المراسلات الجديد حاليًا. لم يتم إنشاء أو تعديل أي سجل، وتبقى النماذج الحالية أدناه متاحة كما هي.
          </div>
        )}

        {load?.kind === 'ready' && records.length === 0 && (
          <div className="border border-dashed border-slate-300 bg-white p-5 text-sm leading-7 text-slate-700">
            <p className="font-bold text-slate-900">لا توجد مراسلات مسجلة في مساحة المراسلات الجديدة حتى الآن.</p>
            <p className="mt-1">تظل وثائق Stage 6 المعتمدة متاحة في أقسامها الحالية، ولم يتم ترحيلها أو تحويلها إلى سجلات مراسلات.</p>
          </div>
        )}

        {load?.kind === 'ready' && records.length > 0 && filtered.length === 0 && (
          <div className="border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700">
            لا توجد نتائج مطابقة للمرشحات الحالية.
          </div>
        )}

        {load?.kind === 'ready' && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((record, index) => (
              <CorrespondenceCard key={`${record.correspondenceType}-${record.updatedAt || record.subject}-${index}`} record={record} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
