'use client';

import { useMemo, useState } from 'react';
import { isDemoMode } from '@/lib/supabase';
import { uploadCompletionAttachment } from '@/lib/storage/project-files';
import {
  normalizeCompletionAttachments,
  resolveCompletionAttachmentSlots,
  type CompletionAttachmentFile,
  type CompletionAttachmentKind,
  type CompletionAttachmentsState,
} from '@/lib/projects/completion-certificate-attachments';

type Props = {
  value: CompletionAttachmentsState | null | undefined;
  onChange: (next: CompletionAttachmentsState) => void;
  clientId?: string | null;
  activityType?: string | null;
  activityLabel?: string | null;
  elevatorsCount?: string | number | null;
  hasElevator?: 'نعم' | 'لا' | '' | null;
  disabled?: boolean;
};

export default function CompletionAttachmentsUpload({
  value,
  onChange,
  clientId,
  activityType,
  activityLabel,
  elevatorsCount,
  hasElevator,
  disabled,
}: Props) {
  const attachments = useMemo(() => normalizeCompletionAttachments(value), [value]);
  const slots = useMemo(
    () =>
      resolveCompletionAttachmentSlots({
        activityType,
        activityLabel,
        elevatorsCount,
        hasElevator,
      }),
    [activityType, activityLabel, elevatorsCount, hasElevator]
  );
  const [uploading, setUploading] = useState<CompletionAttachmentKind | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const setSingle = async (files: FileList | null, kind: CompletionAttachmentKind) => {
    const file = files?.[0];
    if (!file || kind === 'other') return;
    setUploading(kind);
    setHint(null);
    try {
      const att = await uploadCompletionAttachment(file, kind, { clientId });
      onChange({ ...attachments, [kind]: att });
      setHint(
        isDemoMode
          ? 'وضع تجريبي — حُفظ الملف محلياً مع الشهادة'
          : att.storagePath
            ? `تم رفع «${att.fileName}»`
            : 'حُفظت معاينة صغيرة (Storage غير متاح)'
      );
    } finally {
      setUploading(null);
    }
  };

  const addOther = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading('other');
    setHint(null);
    try {
      const next: CompletionAttachmentFile[] = [...(attachments.other || [])];
      for (const file of Array.from(files)) {
        next.push(await uploadCompletionAttachment(file, 'other', { clientId }));
      }
      onChange({ ...attachments, other: next });
      setHint(`تم إرفاق ${files.length} ملف/ملفات إضافية`);
    } finally {
      setUploading(null);
    }
  };

  const removeSingle = (kind: Exclude<CompletionAttachmentKind, 'other'>) => {
    onChange({ ...attachments, [kind]: null });
  };

  const removeOther = (id: string) => {
    onChange({
      ...attachments,
      other: (attachments.other || []).filter((f) => f.id !== id),
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        لا تُصدر شهادة إنهاء الأعمال إلا بعد إرفاق كل المستندات الإلزامية الظاهرة حسب النشاط
        {hasElevator === 'نعم' || Number(elevatorsCount) > 0 ? ' ووجود المصعد' : ''}.
      </div>

      {hint ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {hint}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          if (slot.kind === 'other') {
            return (
              <div key={slot.kind} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 sm:col-span-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {slot.label}
                    <span className="ms-1 text-[10px] font-normal text-gray-400">(اختياري)</span>
                  </p>
                  <p className="text-[11px] text-gray-500">{slot.hint}</p>
                </div>
                <label className="flex min-h-[4rem] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-2 py-3 text-center hover:border-emerald-400">
                  <span className="text-[11px] font-semibold text-slate-600">اختر ملفاً أو اسحبه هنا</span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    multiple
                    disabled={disabled || Boolean(uploading)}
                    className="sr-only"
                    onChange={(e) => {
                      void addOther(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                <ul className="space-y-1 text-xs">
                  {(attachments.other || []).map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-slate-50 px-2 py-1.5"
                    >
                      <span className="truncate">{f.fileName}</span>
                      <button
                        type="button"
                        disabled={disabled}
                        className="text-rose-600 disabled:opacity-50"
                        onClick={() => removeOther(f.id)}
                      >
                        حذف
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }

          const file = attachments[slot.key as Exclude<keyof CompletionAttachmentsState, 'other'>];
          const missing = slot.required && !file;
          return (
            <div
              key={slot.kind}
              className={`rounded-xl border p-3 space-y-2 ${
                missing ? 'border-rose-200 bg-rose-50/40' : 'border-gray-200 bg-white'
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {slot.label}
                  {slot.required ? <span className="ms-1 text-rose-600">*</span> : null}
                </p>
                <p className="text-[11px] text-gray-500">{slot.hint}</p>
                {missing ? (
                  <p className="mt-1 text-[11px] font-semibold text-rose-700">مطلوب قبل الإصدار</p>
                ) : null}
              </div>
              {file ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-slate-50 px-2 py-1.5 text-xs">
                  <span className="truncate" title={file.fileName}>
                    {file.fileName}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    className="shrink-0 text-rose-600 disabled:opacity-50"
                    onClick={() => removeSingle(slot.kind as Exclude<CompletionAttachmentKind, 'other'>)}
                  >
                    حذف
                  </button>
                </div>
              ) : (
                <label className="flex min-h-[4rem] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-2 py-3 text-center hover:border-emerald-400">
                  <span className="text-[11px] font-semibold text-slate-600">اختر ملفاً أو اسحبه هنا</span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    disabled={disabled || Boolean(uploading)}
                    className="sr-only"
                    onChange={(e) => {
                      void setSingle(e.target.files, slot.kind);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              {uploading === slot.kind ? (
                <p className="text-[11px] text-gray-500">جاري الرفع...</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
