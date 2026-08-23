'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import {
  attachmentErrorMessage,
  CorrespondenceAttachmentError,
  createUploadIdempotencyKey,
  listCorrespondenceAttachments,
  matchingRetryFile,
  prepareCorrespondenceAttachment,
  requestCorrespondenceAttachmentDownload,
  type CorrespondenceAttachmentMetadata,
  uploadRawCorrespondenceAttachment,
  validateAttachmentForUpload,
} from '@/lib/projects/correspondence-attachment-broker';
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
type AttachmentLoad =
  | { kind: 'loading'; attachments: CorrespondenceAttachmentMetadata[] }
  | { kind: 'ready'; attachments: CorrespondenceAttachmentMetadata[] }
  | { kind: 'error'; attachments: CorrespondenceAttachmentMetadata[]; message: string };

type UploadRuntime = { busy: boolean; message: string | null };

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

function displaySize(value: number): string {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} كيلوبايت`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} ميغابايت`;
}

function statusClass(status: RelationalCorrespondenceStatus): string {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-900';
  if (status === 'ready') return 'bg-sky-100 text-sky-900';
  if (status === 'preparing') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-800';
}

function attachmentStateLabel(state: CorrespondenceAttachmentMetadata['state']): string {
  if (state === 'available') return 'متاح للتنزيل';
  if (state === 'pending_upload') return 'رفع غير مكتمل';
  if (state === 'pending_delete') return 'قيد الحذف';
  return 'يتطلب معالجة من مسؤول النظام';
}

function attachmentStateClass(state: CorrespondenceAttachmentMetadata['state']): string {
  if (state === 'available') return 'bg-emerald-100 text-emerald-900';
  if (state === 'pending_upload') return 'bg-amber-100 text-amber-950';
  if (state === 'pending_delete') return 'bg-slate-200 text-slate-800';
  return 'bg-rose-100 text-rose-950';
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

function AttachmentSection({
  record,
  load,
  upload,
  canView,
  canUpload,
  onUpload,
  onRetry,
  onDownload,
}: {
  record: ReadOnlyCorrespondenceRecord;
  load: AttachmentLoad | undefined;
  upload: UploadRuntime | undefined;
  canView: boolean;
  canUpload: boolean;
  onUpload: (files: FileList | null) => void;
  onRetry: (attachment: CorrespondenceAttachmentMetadata, files: FileList | null) => void;
  onDownload: (attachmentId: string) => void;
}) {
  const attachments = load?.attachments || [];
  const uploadAllowed = canUpload && record.documentStatus !== 'approved';
  const disabled = upload?.busy === true;

  return (
    <section className="mt-5 min-w-0 border-t border-slate-100 pt-4" aria-label="مرفقات المراسلة">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h5 className="text-sm font-bold text-slate-950">مرفقات سجل المراسلات الجديد</h5>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            تظهر المرفقات لهذا السجل فقط ولا تغيّر النموذج الحالي أو الاعتماد أو مسار المرحلة.
          </p>
        </div>
        <span className="w-fit shrink-0 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
          {canView ? attachments.length : '—'} مرفق
        </span>
      </div>

      {!canView && (
        <div className="mt-3 border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          لا تملك صلاحية عرض مرفقات هذه المراسلة.
        </div>
      )}

      {canView && load?.kind === 'loading' && (
        <div className="mt-3 border border-slate-200 bg-white p-3 text-sm text-slate-600">يجري تحميل المرفقات…</div>
      )}

      {canView && load?.kind === 'error' && (
        <div className="mt-3 border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900">{load.message}</div>
      )}

      {canView && load?.kind === 'ready' && attachments.length === 0 && (
        <div className="mt-3 border border-dashed border-slate-300 bg-white p-3 text-sm leading-6 text-slate-700">
          لا توجد مرفقات مسجلة لهذه المراسلة حتى الآن.
        </div>
      )}

      {canView && attachments.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="قائمة مرفقات المراسلة">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="min-w-0 border border-slate-200 bg-white p-3">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold leading-6 text-slate-950">{attachment.displayFileName}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {attachment.mimeType} · {displaySize(attachment.sizeBytes)}{attachment.createdAt ? ` · ${displayDate(attachment.createdAt)}` : ''}
                  </p>
                </div>
                <span className={`w-fit shrink-0 px-2.5 py-1 text-xs font-bold ${attachmentStateClass(attachment.state)}`}>
                  {attachmentStateLabel(attachment.state)}
                </span>
              </div>

              {attachment.state === 'available' && canView && (
                <button
                  type="button"
                  onClick={() => onDownload(attachment.id)}
                  disabled={disabled}
                  className="mt-3 w-full border border-indigo-700 px-3 py-2 text-sm font-bold text-indigo-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  تنزيل مؤقت
                </button>
              )}

              {attachment.state === 'pending_upload' && uploadAllowed && (
                <label className={`mt-3 inline-flex w-full cursor-pointer items-center justify-center border border-amber-700 px-3 py-2 text-sm font-bold text-amber-950 sm:w-auto ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
                  إعادة اختيار الملف المطابق للرفع اليدوي
                  <input
                    type="file"
                    className="sr-only"
                    accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                    disabled={disabled}
                    onChange={(event) => {
                      onRetry(attachment, event.target.files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              )}

              {attachment.state === 'pending_upload' && !uploadAllowed && (
                <p className="mt-3 text-sm leading-6 text-amber-950">رفع غير مكتمل؛ لا تملك صلاحية استئناف الرفع حاليًا.</p>
              )}
              {attachment.state === 'pending_delete' && (
                <p className="mt-3 text-sm leading-6 text-slate-700">هذه الحالة للعرض فقط؛ لا تتوفر إجراءات حذف ضمن هذه المرحلة.</p>
              )}
              {attachment.state === 'cleanup_required' && (
                <p className="mt-3 text-sm leading-6 text-rose-900">يتطلب معالجة من مسؤول النظام.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {uploadAllowed && (
        <label className={`mt-4 inline-flex w-full cursor-pointer items-center justify-center border border-indigo-700 bg-indigo-700 px-3 py-2 text-sm font-bold text-white sm:w-auto ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
          إضافة مرفقات
          <input
            type="file"
            multiple
            className="sr-only"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            disabled={disabled}
            onChange={(event) => {
              onUpload(event.target.files);
              event.currentTarget.value = '';
            }}
          />
        </label>
      )}
      {uploadAllowed && <p className="mt-2 text-xs leading-5 text-slate-600">الحد الأقصى للملف الواحد: 20 MB. الأنواع المسموحة: PDF وJPEG وPNG.</p>}
      {record.documentStatus === 'approved' && <p className="mt-3 text-sm leading-6 text-emerald-900">المراسلة معتمدة، والمرفقات المتاحة للعرض والتنزيل فقط.</p>}
      {upload?.busy && <p className="mt-3 text-sm font-semibold text-indigo-800" role="status">جارٍ رفع الملف…</p>}
      {upload?.message && <p className="mt-3 text-sm leading-6 text-rose-900" role="alert">{upload.message}</p>}
    </section>
  );
}

function CorrespondenceCard({
  record,
  attachmentLoad,
  upload,
  canView,
  canUpload,
  onUpload,
  onRetry,
  onDownload,
}: {
  record: ReadOnlyCorrespondenceRecord;
  attachmentLoad: AttachmentLoad | undefined;
  upload: UploadRuntime | undefined;
  canView: boolean;
  canUpload: boolean;
  onUpload: (files: FileList | null) => void;
  onRetry: (attachment: CorrespondenceAttachmentMetadata, files: FileList | null) => void;
  onDownload: (attachmentId: string) => void;
}) {
  return (
    <article className="min-w-0 border border-slate-200 bg-white p-4 sm:p-5" aria-label="مراسلة مسجلة">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">سجل مراسلات جديد</p>
          <h4 className="mt-1 break-words text-base font-bold leading-7 text-slate-950">{record.subject}</h4>
          <p className="mt-1 text-sm text-slate-600">{RELATIONAL_CORRESPONDENCE_TYPE_LABELS[record.correspondenceType]}</p>
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

      <AttachmentSection
        record={record}
        load={attachmentLoad}
        upload={upload}
        canView={canView}
        canUpload={canUpload}
        onUpload={onUpload}
        onRetry={onRetry}
        onDownload={onDownload}
      />
    </article>
  );
}

export default function ReadOnlyCorrespondenceWorkspace({ client, data }: Props) {
  const { has, loading: authLoading } = useAuth();
  const [load, setLoad] = useState<ReadOnlyCorrespondenceWorkspaceLoad | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL);
  const [dateFilter, setDateFilter] = useState('');
  const [query, setQuery] = useState('');
  const [attachmentLoads, setAttachmentLoads] = useState<Record<string, AttachmentLoad>>({});
  const [uploadRuntime, setUploadRuntime] = useState<Record<string, UploadRuntime>>({});
  const uploadKeysRef = useRef<Record<string, string>>({});
  const uploadInFlightRef = useRef<Set<string>>(new Set());

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
  const canViewAttachments = !authLoading && has('documents.view');
  const canUploadAttachments = !authLoading && has('documents.upload');

  const refreshAttachments = async (correspondenceId: string) => {
    if (!canViewAttachments) return;
    setAttachmentLoads((current) => ({ ...current, [correspondenceId]: { kind: 'loading', attachments: current[correspondenceId]?.attachments || [] } }));
    try {
      const attachments = await listCorrespondenceAttachments(correspondenceId);
      setAttachmentLoads((current) => ({ ...current, [correspondenceId]: { kind: 'ready', attachments } }));
    } catch (error) {
      const message = error instanceof CorrespondenceAttachmentError
        ? attachmentErrorMessage(error.code)
        : 'تعذر تحميل مرفقات هذه المراسلة حاليًا.';
      setAttachmentLoads((current) => ({ ...current, [correspondenceId]: { kind: 'error', attachments: current[correspondenceId]?.attachments || [], message } }));
    }
  };

  useEffect(() => {
    if (!canViewAttachments || load?.kind !== 'ready') return;
    records.forEach((record) => { void refreshAttachments(record.id); });
  // refresh depends only on the current permission and correspondence IDs; intentional not to refetch on local state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAttachments, load?.kind, records.map((record) => record.id).join('|')]);

  const setUpload = (correspondenceId: string, next: UploadRuntime) => {
    setUploadRuntime((current) => ({ ...current, [correspondenceId]: next }));
  };

  const uploadPreparedFile = async (record: ReadOnlyCorrespondenceRecord, file: File, existing?: CorrespondenceAttachmentMetadata): Promise<boolean> => {
    if (uploadInFlightRef.current.has(record.id)) return false;
    uploadInFlightRef.current.add(record.id);
    setUpload(record.id, { busy: true, message: null });
    try {
      validateAttachmentForUpload(file);
      let attachmentId = existing?.id;
      if (!attachmentId) {
        const operationKey = `${record.id}:${file.name}:${file.type}:${file.size}`;
        const idempotencyKey = uploadKeysRef.current[operationKey] || createUploadIdempotencyKey();
        uploadKeysRef.current[operationKey] = idempotencyKey;
        const prepared = await prepareCorrespondenceAttachment({ correspondenceId: record.id, file, idempotencyKey });
        attachmentId = prepared.id;
      }
      await uploadRawCorrespondenceAttachment(file, attachmentId);
      await refreshAttachments(record.id);
      setUpload(record.id, { busy: false, message: null });
      return true;
    } catch (error) {
      await refreshAttachments(record.id);
      const message = error instanceof CorrespondenceAttachmentError
        ? attachmentErrorMessage(error.code)
        : attachmentErrorMessage('NETWORK_UNCERTAINTY');
      setUpload(record.id, { busy: false, message });
      return false;
    } finally {
      uploadInFlightRef.current.delete(record.id);
    }
  };

  const uploadSelected = (record: ReadOnlyCorrespondenceRecord, files: FileList | null) => {
    if (!files || record.documentStatus === 'approved' || !canUploadAttachments) return;
    void (async () => {
      for (const file of Array.from(files)) {
        const succeeded = await uploadPreparedFile(record, file);
        if (!succeeded) break;
      }
    })();
  };

  const retrySelected = (record: ReadOnlyCorrespondenceRecord, attachment: CorrespondenceAttachmentMetadata, files: FileList | null) => {
    const file = files?.item(0);
    if (!file || !matchingRetryFile(attachment, file) || record.documentStatus === 'approved' || !canUploadAttachments) {
      setUpload(record.id, { busy: false, message: 'اختر الملف الأصلي المطابق للاسم والنوع والحجم لاستئناف الرفع يدويًا.' });
      return;
    }
    void uploadPreparedFile(record, file, attachment);
  };

  const downloadAttachment = (record: ReadOnlyCorrespondenceRecord, attachmentId: string) => {
    if (!canViewAttachments) return;
    setUpload(record.id, { busy: true, message: null });
    void requestCorrespondenceAttachmentDownload(attachmentId)
      .then((signedUrl) => {
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
        setUpload(record.id, { busy: false, message: null });
      })
      .catch((error) => {
        const message = error instanceof CorrespondenceAttachmentError
          ? attachmentErrorMessage(error.code)
          : 'تعذر تجهيز رابط تنزيل مؤقت.';
        setUpload(record.id, { busy: false, message });
      });
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ar-SA');
    return records.filter((record) => {
      if (typeFilter !== ALL && record.correspondenceType !== typeFilter) return false;
      if (statusFilter !== ALL && record.documentStatus !== statusFilter) return false;
      if (dateFilter && record.correspondenceDate !== dateFilter) return false;
      if (!normalizedQuery) return true;
      return [record.subject, record.referenceNumber || ''].join(' ').toLocaleLowerCase('ar-SA').includes(normalizedQuery);
    });
  }, [dateFilter, query, records, statusFilter, typeFilter]);

  const approvedCount = records.filter((record) => record.documentStatus === 'approved').length;
  const readyCount = records.filter((record) => record.documentStatus === 'ready').length;

  return (
    <section className="space-y-5 border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-labelledby="correspondence-workspace-title">
      <header className="min-w-0 border-b border-slate-200 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">Stage 6</p>
        <h3 id="correspondence-workspace-title" className="mt-1 text-lg font-bold text-slate-950">مساحة المراسلات</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          عرض معلوماتي لسجل المراسلات الجديد وحالة النموذجين الحاليين. المرفقات ترتبط بسجل المراسلات فقط ولا تنشئ أو تعدل أو تعتمد مرحلة.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-500">إجمالي السجلات المسجلة</p><p className="mt-1 text-2xl font-bold text-slate-950">{records.length}</p></div>
        <div className="border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-500">جاهزة للاعتماد</p><p className="mt-1 text-2xl font-bold text-sky-800">{readyCount}</p></div>
        <div className="border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-500">معتمدة</p><p className="mt-1 text-2xl font-bold text-emerald-800">{approvedCount}</p></div>
      </div>

      <section className="border border-amber-200 bg-amber-50 p-4" aria-labelledby="legacy-summary-title">
        <div className="min-w-0">
          <p className="text-xs font-bold text-amber-800">النموذجان المعتمدان</p>
          <h4 id="legacy-summary-title" className="mt-1 text-base font-bold text-amber-950">حالة النموذج الحالي</h4>
          <p className="mt-1 text-sm leading-6 text-amber-950">هذه المعلومات تخص النماذج الحالية وليست سجلات مراسلات جديدة، ولم يتم ترحيل أي منها إلى مساحة المراسلات أو مرفقاتها.</p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {legacySummaries.map((summary) => (
            <article key={summary.key} className="min-w-0 border border-amber-200 bg-white p-3">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="text-xs font-semibold text-amber-800">{summary.provenanceLabel}</p><h5 className="mt-1 break-words font-bold text-slate-950">{summary.label}</h5></div>
                <span className={`w-fit px-2.5 py-1 text-xs font-bold ${summary.complete ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{summary.complete ? 'مكتمل وفق عقد المرحلة' : 'يحتاج استكمال عقد المرحلة'}</span>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-3"><Detail label="الحالة" value={summary.status || (summary.available ? 'غير محددة' : 'غير متوفر')} /><Detail label="المرجع" value={summary.referenceNumber} /><Detail label="التاريخ" value={summary.documentDate ? displayDate(summary.documentDate) : null} /></dl>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="relational-records-title">
        <div className="min-w-0"><p className="text-xs font-bold text-indigo-700">سجل المراسلات الجديد</p><h4 id="relational-records-title" className="mt-1 text-base font-bold text-slate-950">المراسلات المسجلة</h4><p className="mt-1 text-sm leading-6 text-slate-600">تظهر كل مراسلة ومرفقاتها كمصدر مستقل، ولا تغيّر أي مرفقات بيانات النموذج الحالي أو عداده أو ملاحظاته.</p></div>
        <div className="grid grid-cols-1 gap-3 border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="min-w-0 text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">النوع</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} className="w-full min-w-0 border border-slate-300 bg-white px-3 py-2 text-sm"><option value={ALL}>كل الأنواع</option>{Object.entries(RELATIONAL_CORRESPONDENCE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="min-w-0 text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">الحالة</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="w-full min-w-0 border border-slate-300 bg-white px-3 py-2 text-sm"><option value={ALL}>كل الحالات</option>{Object.entries(RELATIONAL_CORRESPONDENCE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="min-w-0 text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">التاريخ</span><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="w-full min-w-0 border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
          <label className="min-w-0 text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">الموضوع أو المرجع</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في الموضوع أو المرجع" className="w-full min-w-0 border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
        </div>

        {!load && <div className="border border-slate-200 bg-white p-5 text-sm text-slate-600">يجري تحميل سجل المراسلات…</div>}
        {load?.kind === 'identity-unavailable' && <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">لا تتوفر هوية المشروع الكانونية لعرض سجل المراسلات حاليًا. لا يؤثر ذلك في النموذجين الحاليين أو بوابة المرحلة.</div>}
        {load?.kind === 'load-error' && <div className="border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">تعذر تحميل سجل المراسلات الجديد حاليًا. لم يتم إنشاء أو تعديل أي سجل، وتبقى النماذج الحالية أدناه متاحة كما هي.</div>}
        {load?.kind === 'ready' && records.length === 0 && <div className="border border-dashed border-slate-300 bg-white p-5 text-sm leading-7 text-slate-700"><p className="font-bold text-slate-900">لا توجد مراسلات مسجلة في مساحة المراسلات الجديدة حتى الآن.</p><p className="mt-1">تظل وثائق Stage 6 المعتمدة متاحة في أقسامها الحالية، ولم يتم ترحيلها أو تحويلها إلى سجلات مراسلات.</p></div>}
        {load?.kind === 'ready' && records.length > 0 && filtered.length === 0 && <div className="border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700">لا توجد نتائج مطابقة للمرشحات الحالية.</div>}
        {load?.kind === 'ready' && filtered.length > 0 && <div className="space-y-3">{filtered.map((record) => <CorrespondenceCard key={record.id} record={record} attachmentLoad={attachmentLoads[record.id]} upload={uploadRuntime[record.id]} canView={canViewAttachments} canUpload={canUploadAttachments} onUpload={(files) => uploadSelected(record, files)} onRetry={(attachment, files) => retrySelected(record, attachment, files)} onDownload={(attachmentId) => downloadAttachment(record, attachmentId)} />)}</div>}
      </section>
    </section>
  );
}
