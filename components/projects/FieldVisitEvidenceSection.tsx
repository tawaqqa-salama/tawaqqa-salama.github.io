'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  deleteFieldVisitEvidenceSafely,
  evidenceLabel,
  FIELD_VISIT_EVIDENCE_CATEGORIES,
  FIELD_VISIT_EVIDENCE_TIMINGS,
  normalizeFieldVisitEvidenceForVisit,
  reorderFieldVisitEvidence,
  resolveFieldVisitEvidenceSrc,
  retryPendingFieldVisitEvidenceCleanup,
  uploadFieldVisitEvidenceFile,
} from '@/lib/projects/field-visit-evidence';
import type {
  FieldVisitEvidence,
  FieldVisitEvidenceCategory,
  FieldVisitEvidenceTiming,
  FieldVisitReport,
} from '@/lib/types/project-reports';

const CONTROL = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100';

type UploadFailure = { id: string; file: File; error: string };

type Props = {
  clientId: string;
  visit: FieldVisitReport;
  disabled?: boolean;
  onChange: (nextVisit: FieldVisitReport) => void;
  /** Persists only the Stage-5 visit payload before a storage delete is allowed. */
  onPersistMetadata: (nextVisit: FieldVisitReport) => Promise<void>;
  requestedObservationId?: string | null;
  onRequestedObservationHandled?: () => void;
};

function formatSize(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(item: FieldVisitEvidence) {
  return item.kind === 'photo' && /^image\/(jpeg|png)$/i.test(item.file.mimeType);
}

function titleForObservation(visit: FieldVisitReport, observationId: string | null | undefined) {
  if (!observationId) return 'غير مرتبط بملاحظة منظمة';
  const index = (visit.observations || []).findIndex((item) => item.id === observationId);
  return index >= 0 ? `مرتبط بالملاحظة رقم ${index + 1}` : 'غير مرتبط بملاحظة منظمة';
}

export default function FieldVisitEvidenceSection({
  clientId,
  visit,
  disabled = false,
  onChange,
  onPersistMetadata,
  requestedObservationId = null,
  onRequestedObservationHandled,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queuedObservationId, setQueuedObservationId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [failures, setFailures] = useState<Record<string, UploadFailure>>({});
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const current = useMemo(() => normalizeFieldVisitEvidenceForVisit(visit), [visit]);

  useEffect(() => {
    if (!requestedObservationId || disabled) return;
    setQueuedObservationId(requestedObservationId);
    fileInputRef.current?.click();
    onRequestedObservationHandled?.();
  }, [requestedObservationId, disabled, onRequestedObservationHandled]);
  const evidence = current.evidence || [];
  const pendingCleanup = current.evidence_cleanup_pending || [];
  const linkedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    evidence.forEach((item) => {
      if (item.observation_id) counts[item.observation_id] = (counts[item.observation_id] || 0) + 1;
    });
    return counts;
  }, [evidence]);

  const replaceEvidence = (nextEvidence: FieldVisitEvidence[]) => {
    onChange({ ...current, evidence: nextEvidence });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files || []);
    if (!selected.length || disabled) return;
    setError(null);
    setNotice(null);
    let nextEvidence = [...evidence];
    let succeeded = 0;
    for (const file of selected) {
      const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setUploading((state) => ({ ...state, [id]: true }));
      try {
        const item = await uploadFieldVisitEvidenceFile({ clientId, visitNumber: current.visit_number, file });
        nextEvidence = [...nextEvidence, { ...item, observation_id: queuedObservationId, display_order: nextEvidence.length + 1 }];
        succeeded += 1;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'تعذر رفع الملف.';
        setFailures((state) => ({ ...state, [id]: { id, file, error: message } }));
        setError(`${file.name}: ${message}`);
      } finally {
        setUploading((state) => ({ ...state, [id]: false }));
      }
    }
    if (succeeded) {
      replaceEvidence(nextEvidence);
      setQueuedObservationId(null);
      setNotice(`تم رفع ${succeeded} ملف/ملفات إلى التخزين. ما زالت بيانات الأدلة بحاجة إلى «حفظ الزيارة كـ PDF مرفق» لتثبيت metadata الزيارة.`);
    }
  };

  const retryUpload = async (failure: UploadFailure) => {
    setFailures((state) => {
      const next = { ...state };
      delete next[failure.id];
      return next;
    });
    await uploadFiles([failure.file]);
  };

  const patchItem = (id: string, partial: Partial<FieldVisitEvidence>) => {
    replaceEvidence(evidence.map((item) => item.id === id ? { ...item, ...partial, updated_at: new Date().toISOString() } : item));
  };

  const move = (id: string, direction: -1 | 1) => {
    replaceEvidence(reorderFieldVisitEvidence(evidence, id, direction));
  };

  const loadPreview = async (item: FieldVisitEvidence, openDocument = false) => {
    const src = await resolveFieldVisitEvidenceSrc({ clientId, visitNumber: current.visit_number, item });
    if (!src) {
      setError('تعذر تحميل معاينة آمنة لهذا الدليل. تحقّق من المسار والصلاحيات ثم أعد المحاولة.');
      return;
    }
    if (openDocument) {
      window.open(src, '_blank', 'noopener,noreferrer');
      return;
    }
    setPreviews((state) => ({ ...state, [item.id]: src }));
  };

  const requestDelete = async (item: FieldVisitEvidence) => {
    if (!window.confirm(`هل تريد حذف الدليل «${item.title}»؟ سيُحفظ حذف بياناته أولًا قبل محاولة تنظيف التخزين.`)) return;
    setDeleting(item.id);
    setError(null);
    try {
      const result = await deleteFieldVisitEvidenceSafely({
        clientId,
        visitNumber: current.visit_number,
        visit: current,
        evidenceId: item.id,
        persistVisitMetadata: onPersistMetadata,
      });
      onChange(result.visit);
      setNotice(result.cleanupPending ? 'حُذفت بيانات الدليل وحُفظت. تعذر حذف الملف حاليًا وسيسجل للتنظيف الآمن لاحقًا.' : 'حُذفت بيانات الدليل ثم نُظف التخزين بأمان.');
      if (result.error && !result.cleanupPending) setError(result.error);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حذف الدليل.');
    } finally {
      setDeleting(null);
    }
  };

  const retryCleanup = async () => {
    if (!pendingCleanup.length) return;
    setError(null);
    try {
      const next = await retryPendingFieldVisitEvidenceCleanup({ clientId, visitNumber: current.visit_number, visit: current });
      await onPersistMetadata(next);
      onChange(next);
      setNotice(next.evidence_cleanup_pending?.length ? 'بقيت عمليات تنظيف لم تكتمل؛ ستظل محفوظة لإعادة المحاولة.' : 'اكتمل تنظيف الملفات المعلّقة بأمان.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إعادة محاولة تنظيف التخزين.');
    }
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!disabled) void uploadFiles(event.dataTransfer.files);
  };

  return (
    <section className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 sm:p-4" dir="rtl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h5 className="text-sm font-bold text-indigo-950">الصور والمرفقات الميدانية</h5>
          <p className="mt-1 text-xs leading-5 text-indigo-900">توثيق للزيارة أو للملاحظة المنظمة فقط. الصور والمرفقات لا تعتمد الزيارة، ولا تغلق الملاحظة، ولا تغيّر بوابات Stage 5 أو Stage 6.</p>
        </div>
        <span className="shrink-0 rounded-full border border-indigo-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-800">{evidence.length} دليل</span>
      </div>

      {error ? <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900">{error}</div> : null}
      {queuedObservationId ? <div className="mt-3 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-indigo-900">سيُربط الرفع التالي تلقائيًا بـ{titleForObservation(current, queuedObservationId)}، ويمكن فك الارتباط من بيانات الدليل لاحقًا.</div> : null}
      {notice ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">{notice}</div> : null}

      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className={`mt-3 flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center ${disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : 'cursor-pointer border-indigo-200 bg-white text-indigo-900 hover:border-indigo-500'}`}
      >
        <span className="text-sm font-bold">{Object.values(uploading).some(Boolean) ? 'جاري رفع الملفات…' : 'اسحب الصور أو المرفقات هنا أو اخترها للرفع'}</span>
        <span className="text-xs leading-5 text-slate-600">JPEG أو PNG أو PDF فقط. يفتح اختيار الملفات مكتبة الصور أو الكاميرا حيث يدعمها الجهاز، من دون طلب إذن كاميرا مسبق.</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          multiple
          disabled={disabled}
          aria-label="رفع صور ومرفقات ميدانية"
          className="hidden"
          onChange={(event) => {
            void uploadFiles(event.target.files || []);
            event.target.value = '';
          }}
        />
      </label>

      {Object.values(failures).map((failure) => (
        <article key={failure.id} className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 break-words text-xs leading-5 text-rose-900"><strong>{failure.file.name}</strong> — فشل الرفع، ولم تؤثر المحاولة في الملفات الأخرى أو metadata الزيارة.</p>
            <button type="button" disabled={disabled || Boolean(uploading[failure.id])} onClick={() => void retryUpload(failure)} className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-60">إعادة المحاولة</button>
          </div>
        </article>
      ))}

      {pendingCleanup.length ? <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-amber-900">توجد {pendingCleanup.length} عملية تنظيف Storage مؤجلة بعد حذف metadata بنجاح. لا تشير الزيارة إلى هذه الملفات.</p><button type="button" disabled={disabled} onClick={() => void retryCleanup()} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900">إعادة محاولة التنظيف</button></div> : null}

      {evidence.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-indigo-200 bg-white/80 px-3 py-3 text-xs leading-5 text-indigo-900">لا توجد أدلة لهذه الزيارة. تبقى الزيارة صالحة بلا صور أو مرفقات، كما تبقى الملاحظات النصية من Phase 5B مستقلة.</p> : <div className="mt-3 space-y-3">{evidence.map((item, index) => (
        <EvidenceCard
          key={item.id}
          item={item}
          visit={current}
          preview={previews[item.id] || null}
          busy={disabled || deleting === item.id}
          canMoveUp={index > 0}
          canMoveDown={index < evidence.length - 1}
          onPatch={(partial) => patchItem(item.id, partial)}
          onMove={(direction) => move(item.id, direction)}
          onPreview={() => void loadPreview(item)}
          onOpenDocument={() => void loadPreview(item, true)}
          onDelete={() => void requestDelete(item)}
        />
      ))}</div>}

      <p className="mt-3 text-[11px] leading-5 text-slate-600">حالة «تم رفع الملف» تعني أن Storage استلم الملف فقط؛ احفظ الزيارة لتثبيت metadata. لا تحفظ الواجهة روابط موقعة أو روابط متصفح أو data URL داخل بيانات المشروع.</p>
      {(visit.observations || []).length ? <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">{visit.observations!.map((observation, index) => <span key={observation.id} className="ml-3 inline-block">الملاحظة #{index + 1}: {linkedCounts[observation.id] || 0} دليل</span>)}</div> : null}
    </section>
  );
}

function EvidenceCard({
  item,
  visit,
  preview,
  busy,
  canMoveUp,
  canMoveDown,
  onPatch,
  onMove,
  onPreview,
  onOpenDocument,
  onDelete,
}: {
  item: FieldVisitEvidence;
  visit: FieldVisitReport;
  preview: string | null;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (partial: Partial<FieldVisitEvidence>) => void;
  onMove: (direction: -1 | 1) => void;
  onPreview: () => void;
  onOpenDocument: () => void;
  onDelete: () => void;
}) {
  const image = isImage(item);
  const patchText = (key: 'title' | 'description' | 'engineer_note', value: string) => onPatch({ [key]: value } as Partial<FieldVisitEvidence>);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{item.title || item.file.fileName}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{item.file.fileName} · {formatSize(item.file.sizeBytes)} · {titleForObservation(visit, item.observation_id)}</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !canMoveUp} onClick={() => onMove(-1)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs disabled:opacity-40">لأعلى</button><button type="button" disabled={busy || !canMoveDown} onClick={() => onMove(1)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs disabled:opacity-40">لأسفل</button><button type="button" disabled={busy} onClick={onDelete} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">حذف</button></div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[160px_minmax(0,1fr)]">
        <div className="flex min-h-36 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2">
          {image && preview ? <img src={preview} alt={item.title || item.file.fileName} className="max-h-36 w-full object-contain" /> : image ? <button type="button" disabled={busy} onClick={onPreview} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-800">تحميل معاينة آمنة</button> : <button type="button" disabled={busy} onClick={onOpenDocument} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800">PDF — فتح مرفق آمن</button>}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="العنوان"><input disabled={busy} value={item.title} onChange={(event) => patchText('title', event.target.value)} className={CONTROL} /></Field>
          <Field label="الفئة"><select disabled={busy} value={item.category} onChange={(event) => onPatch({ category: event.target.value as FieldVisitEvidenceCategory })} className={CONTROL}>{FIELD_VISIT_EVIDENCE_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <Field label="التوقيت"><select disabled={busy} value={item.timing} onChange={(event) => onPatch({ timing: event.target.value as FieldVisitEvidenceTiming })} className={CONTROL}>{FIELD_VISIT_EVIDENCE_TIMINGS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <Field label="الارتباط بالملاحظة"><select disabled={busy} value={item.observation_id || ''} onChange={(event) => onPatch({ observation_id: event.target.value || null })} className={CONTROL}><option value="">غير مرتبط بملاحظة</option>{(visit.observations || []).map((observation, index) => <option key={observation.id} value={observation.id}>الملاحظة #{index + 1} — {observation.location || observation.description || 'بدون وصف'}</option>)}</select></Field>
          <Field label="تاريخ الالتقاط"><input disabled={busy} type="datetime-local" value={item.captured_at ? item.captured_at.slice(0, 16) : ''} onChange={(event) => onPatch({ captured_at: event.target.value ? new Date(event.target.value).toISOString() : null })} className={CONTROL} /></Field>
          <label className="flex items-end gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900"><input disabled={busy} type="checkbox" checked={item.include_in_visit_pdf} onChange={(event) => onPatch({ include_in_visit_pdf: event.target.checked })} />إدراج في تقرير الزيارة PDF</label>
          <Field label="الوصف"><textarea disabled={busy} value={item.description} onChange={(event) => patchText('description', event.target.value)} className={`${CONTROL} min-h-20`} /></Field>
          <Field label="ملاحظة المهندس"><textarea disabled={busy} value={item.engineer_note} onChange={(event) => patchText('engineer_note', event.target.value)} className={`${CONTROL} min-h-20`} /></Field>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">{evidenceLabel(FIELD_VISIT_EVIDENCE_CATEGORIES, item.category)} · {evidenceLabel(FIELD_VISIT_EVIDENCE_TIMINGS, item.timing)} · {item.include_in_visit_pdf ? 'مختار للطباعة' : 'غير مدرج في PDF'}</p>
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 text-xs font-semibold text-slate-700"><span className="mb-1 block">{label}</span>{children}</label>;
}
