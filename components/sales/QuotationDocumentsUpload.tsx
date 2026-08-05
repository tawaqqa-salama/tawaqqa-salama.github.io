'use client';

import { useState } from 'react';
import { extractBuildingPermitFromFile } from '@/lib/projects/building-permit-extract';
import {
  extractionToHydration,
  hasUsefulPermitExtraction,
  type BuildingPermitHydration,
} from '@/lib/projects/building-permit-ocr';
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
  /** يُستدعى بعد استخراج بيانات رخصة البناء تلقائياً */
  onPermitExtracted?: (fields: BuildingPermitHydration) => void;
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
    hint: 'إلزامي — يستخرج المالك والحي والشارع والعنوان ورقم الرخصة',
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
  onPermitExtracted,
}: Props) {
  const [uploading, setUploading] = useState<QuotationDocumentKind | null>(null);
  const [scanning, setScanning] = useState(false);
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
        setScanning(true);
        setHint('جاري استخراج بيانات الرخصة تلقائياً...');
        try {
          const extraction = await extractBuildingPermitFromFile(file, {
            onProgress: (msg) => setHint(msg),
          });
          const hydration = extractionToHydration(extraction);
          if (hasUsefulPermitExtraction(extraction)) {
            onPermitExtracted?.(hydration);
            {
              const extracted = [
                hydration.building_permit_number ? 'رقم الرخصة' : null,
                hydration.owner_name ? 'المالك' : null,
                hydration.activity_type ? 'النشاط' : null,
                hydration.floors_count != null ? `الأدوار (${hydration.floors_count})` : null,
                hydration.building_area ? `مساحة البناء ${hydration.building_area} م²` : null,
                hydration.district ? 'الحي' : null,
                hydration.street ? 'الشارع' : null,
                hydration.plot_number ? 'القطعة' : null,
              ].filter(Boolean);
              setHint(
                extracted.length > 0
                  ? `✓ تم استخراج: ${extracted.join(' · ')}`
                  : '✓ تم استخراج جزء من بيانات الرخصة — راجع الحقول'
              );
            }
          } else {
            setHint('تعذر استخراج رقم/تاريخ الرخصة من الملف — يمكنك التعبئة يدوياً');
          }
        } catch {
          setHint('تم رفع الرخصة لكن فشل الاستخراج التلقائي — عبّئ الرقم والتاريخ يدوياً');
        } finally {
          setScanning(false);
        }
        return;
      }

      if (isDemoMode) {
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
          أرفق رخصة البناء من المبيعات لاستخراج المالك والحي والشارع والعنوان تلقائياً · الهوية والسجل اختياريان
        </p>
      </div>

      {hint ? (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            scanning
              ? 'border-sky-200 bg-sky-50 text-sky-900'
              : hint.startsWith('✓')
                ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
                : hint.includes('تعذر') || hint.includes('فشل')
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-100 bg-emerald-50 text-emerald-900'
          }`}
        >
          {scanning ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
              {hint}
            </span>
          ) : (
            hint
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SLOTS.map((slot) => {
          const file = value[slot.key];
          const busy = uploading === slot.kind || (slot.kind === 'building_permit' && scanning);
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
                  disabled={disabled || Boolean(uploading) || scanning}
                />
              ) : (
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  disabled={disabled || Boolean(uploading) || scanning}
                  onChange={(e) => {
                    void setFile(e.target.files, slot.kind, slot.key);
                    e.target.value = '';
                  }}
                  className="w-full text-xs"
                />
              )}

              {busy ? <p className="text-[11px] text-gray-500">جاري الرفع/الاستخراج...</p> : null}
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
