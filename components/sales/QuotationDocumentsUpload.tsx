'use client';

import { useState } from 'react';
import { isDemoMode } from '@/lib/supabase';
import { uploadQuotationDocument } from '@/lib/storage/quotation-documents';
import {
  QUOTATION_DOCUMENT_LABELS,
  type QuotationDocumentFile,
  type QuotationDocumentKind,
  type QuotationDocumentsState,
} from '@/lib/types/quotation-documents';

type Props = {
  value: QuotationDocumentsState;
  onChange: (next: QuotationDocumentsState) => void;
  clientId?: string | null;
  disabled?: boolean;
};

const SLOTS: {
  kind: QuotationDocumentKind;
  key: keyof QuotationDocumentsState;
  required: boolean;
  hint: string;
}[] = [
  {
    kind: 'building_permit',
    key: 'building_permit',
    required: true,
    hint: 'إلزامي — أرفق الملف لمراجعته يدويًا وإدخال بياناته في الحقول أدناه',
  },
  {
    kind: 'owner_id',
    key: 'owner_id',
    required: false,
    hint: 'اختياري — هوية المالك',
  },
  {
    kind: 'commercial_register',
    key: 'commercial_register',
    required: false,
    hint: 'اختياري — السجل التجاري للمنشأة',
  },
];

export default function QuotationDocumentsUpload({
  value,
  onChange,
  clientId,
  disabled,
}: Props) {
  const [uploading, setUploading] = useState<QuotationDocumentKind | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const setFile = async (
    files: FileList | null,
    kind: QuotationDocumentKind,
    key: keyof QuotationDocumentsState
  ) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(kind);
    setHint(null);
    try {
      const att = await uploadQuotationDocument(file, kind, { clientId });
      onChange({ ...value, [key]: att });

      if (kind === 'building_permit') {
        setHint('تم إرفاق رخصة البناء. افتح الملف وراجع البيانات ثم أدخلها يدويًا في الحقول الحالية.');
      } else if (isDemoMode) {
        setHint('وضع تجريبي — الملفات تُحفظ محلياً مع بيانات العميل');
      } else if (att.storagePath) {
        setHint(`تم رفع «${QUOTATION_DOCUMENT_LABELS[kind]}» إلى التخزين`);
      } else {
        setHint('لم يتوفر Storage — حُفظت معاينة صغيرة داخل البيانات إن أمكن');
      }
    } finally {
      setUploading(null);
    }
  };

  const remove = (key: keyof QuotationDocumentsState) => {
    onChange({ ...value, [key]: null });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700">مستندات إصدار عرض السعر — رخصة البناء</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          أرفق رخصة البناء لفتحها ومراجعتها يدويًا، ثم أدخل بياناتها في الحقول الحالية.
        </p>
      </div>

      {hint ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {hint}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SLOTS.map((slot) => {
          const file = value[slot.key];
          const busy = uploading === slot.kind;
          return (
            <div
              key={slot.kind}
              className={`rounded-xl border p-3 space-y-2 ${
                slot.required && !file
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {QUOTATION_DOCUMENT_LABELS[slot.kind]}
                    {slot.required ? (
                      <span className="ms-1 text-rose-600" aria-label="إلزامي">
                        *
                      </span>
                    ) : (
                      <span className="ms-1 text-[10px] font-normal text-gray-400">(اختياري)</span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-500">{slot.hint}</p>
                </div>
              </div>

              {file ? (
                <FileRow
                  file={file}
                  onRemove={() => remove(slot.key)}
                  disabled={disabled || Boolean(uploading)}
                />
              ) : (
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  disabled={disabled || Boolean(uploading)}
                  onChange={(e) => {
                    void setFile(e.target.files, slot.kind, slot.key);
                    e.target.value = '';
                  }}
                  className="w-full text-xs"
                />
              )}

              {busy ? <p className="text-[11px] text-gray-500">جاري رفع المرفق...</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FileRow({
  file,
  onRemove,
  disabled,
}: {
  file: QuotationDocumentFile;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-slate-50 px-2 py-1.5 text-xs">
      <span className="min-w-0 truncate" title={file.fileName}>
        {file.fileName}
        <span className="ms-1 text-gray-400">· {(file.sizeBytes / 1024).toFixed(0)} KB</span>
        {file.storagePath ? (
          <span className="ms-1 text-emerald-700">☁</span>
        ) : file.dataUrl ? (
          <span className="ms-1 text-gray-400">محلي</span>
        ) : null}
      </span>
      <button
        type="button"
        disabled={disabled}
        className="shrink-0 text-rose-600 disabled:opacity-50"
        onClick={onRemove}
      >
        حذف
      </button>
    </div>
  );
}
