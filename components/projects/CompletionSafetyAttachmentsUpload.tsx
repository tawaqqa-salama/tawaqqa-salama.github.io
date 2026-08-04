'use client';

import { useMemo, useState } from 'react';
import {
  listCompletionAttachmentSlots,
  type CompletionAttachmentSlot,
} from '@/lib/projects/completion-attachments';
import { uploadPlanAttachment } from '@/lib/storage/project-files';
import { isDemoMode } from '@/lib/supabase';
import type { CompletionAttachmentKind } from '@/lib/types/completion-attachments';
import type { CompletionAttachmentsState } from '@/lib/types/project-reports';
import { EMPTY_COMPLETION_ATTACHMENTS } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  value?: CompletionAttachmentsState | null;
  onChange: (next: CompletionAttachmentsState) => void;
  disabled?: boolean;
};

function StatusBadge({ status }: { status: CompletionAttachmentSlot['status'] }) {
  if (status === 'uploaded') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
        <span aria-hidden>🟢</span> تم الإرفاق
      </span>
    );
  }
  if (status === 'required') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
        <span aria-hidden>🔴</span> مطلوب وإلزامي
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
      <span aria-hidden>⚪</span> غير منطبق على المشروع
    </span>
  );
}

export default function CompletionSafetyAttachmentsUpload({
  client,
  data,
  value,
  onChange,
  disabled,
}: Props) {
  const docs = value || data.completion_attachments || EMPTY_COMPLETION_ATTACHMENTS;
  const [uploading, setUploading] = useState<CompletionAttachmentKind | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const slots = useMemo(
    () => listCompletionAttachmentSlots(client, data, docs),
    [client, data, docs]
  );

  const missing = slots.filter((s) => s.status === 'required');

  const setFile = async (files: FileList | null, kind: CompletionAttachmentKind) => {
    const file = files?.[0];
    if (!file) return;

    if (kind === 'electrical_safety_certificate') {
      const ok =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!ok) {
        setHint('شهادة سلامة التمديدات الكهربائية تقبل ملف PDF فقط');
        return;
      }
    }

    setUploading(kind);
    setHint(null);
    try {
      const att = await uploadPlanAttachment(file, kind, { clientId: client.id });
      onChange({ ...docs, [kind]: att });
      if (isDemoMode) {
        setHint('وضع تجريبي — الملفات تُحفظ محلياً مع بيانات المشروع');
      } else if (att.storagePath) {
        setHint('تم رفع الملف إلى التخزين');
      } else {
        setHint('لم يتوفر Storage — حُفظت معاينة صغيرة داخل البيانات إن أمكن');
      }
    } finally {
      setUploading(null);
    }
  };

  const remove = (kind: CompletionAttachmentKind) => {
    onChange({ ...docs, [kind]: null });
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900">
          عقود الصيانة والشهادات الفنية المطلوبة (Maintenance Contracts & Certificates)
        </h3>
        <p className="mt-0.5 text-[11px] text-gray-500">
          مستندات إلزامية قبل إصدار شهادة إنهاء الأعمال — بعضها يظهر حسب المصاعد أو نشاط الأغذية
        </p>
      </div>

      {missing.length ? (
        <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          {missing.map((slot) => (
            <p key={slot.kind} className="text-xs text-amber-900">
              ⚠️ يرجى إرفاق {slot.label} أولاً لإكمال إصدار شهادة إنهاء الأعمال.
            </p>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          ✓ اكتملت المرفقات الإلزامية والمنطبقة على هذا المشروع
        </div>
      )}

      {hint ? (
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {hint}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {slots.map((slot) => {
          const file = docs[slot.kind];
          const busy = uploading === slot.kind;
          const na = slot.status === 'not_applicable';

          return (
            <div
              key={slot.kind}
              className={`rounded-xl border p-3 space-y-2 ${
                na
                  ? 'border-slate-200 bg-slate-100/70 opacity-80'
                  : slot.status === 'required'
                    ? 'border-rose-200 bg-rose-50/40'
                    : 'border-emerald-200 bg-white'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{slot.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{slot.hint}</p>
                </div>
                <StatusBadge status={slot.status} />
              </div>

              {na ? (
                <p className="text-[11px] text-slate-500">لا يلزم إرفاق هذا المستند لهذا المشروع.</p>
              ) : file ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-white px-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate" title={file.fileName}>
                    {file.fileName}
                    <span className="ms-1 text-gray-400">
                      · {(file.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={disabled || Boolean(uploading)}
                    className="shrink-0 text-rose-600 disabled:opacity-50"
                    onClick={() => remove(slot.kind)}
                  >
                    حذف
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept={slot.accept}
                  disabled={disabled || Boolean(uploading)}
                  onChange={(e) => {
                    void setFile(e.target.files, slot.kind);
                    e.target.value = '';
                  }}
                  className="w-full text-xs"
                />
              )}

              {busy ? <p className="text-[11px] text-gray-500">جاري الرفع...</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
