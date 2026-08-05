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
  QUOTATION_DOCUMENT_SLOTS,
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

  const coreSlots = QUOTATION_DOCUMENT_SLOTS.filter((s) => s.group === 'core');
  const supportingSlots = QUOTATION_DOCUMENT_SLOTS.filter((s) => s.group === 'supporting');

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-700">مستندات العميل والمبيعات</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          رخصة البناء إلزامية قبل إصدار العرض. بقية المرفقات (إيجار، تمديدات كهرباء، صيانة، EIA، وغيرها)
          اختيارية وتُحفظ مع ملف العميل.
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

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          أساسية
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {coreSlots.map((slot) => (
            <SlotCard
              key={slot.kind}
              slot={slot}
              file={value[slot.key]}
              busy={uploading === slot.kind || (slot.kind === 'building_permit' && scanning)}
              disabled={disabled || Boolean(uploading) || scanning}
              onPick={(files) => void setFile(files, slot.kind, slot.key)}
              onRemove={() => remove(slot.key)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          مستندات داعمة (تمديدات · صيانة · إيجار · EIA · أخرى)
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {supportingSlots.map((slot) => (
            <SlotCard
              key={slot.kind}
              slot={slot}
              file={value[slot.key]}
              busy={uploading === slot.kind}
              disabled={disabled || Boolean(uploading) || scanning}
              onPick={(files) => void setFile(files, slot.kind, slot.key)}
              onRemove={() => remove(slot.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SlotCard({
  slot,
  file,
  busy,
  disabled,
  onPick,
  onRemove,
}: {
  slot: (typeof QUOTATION_DOCUMENT_SLOTS)[number];
  file: QuotationDocumentFile | null;
  busy: boolean;
  disabled?: boolean;
  onPick: (files: FileList | null) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        slot.required && !file ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'
      }`}
    >
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

      {file ? (
        <FileRow file={file} onRemove={onRemove} disabled={disabled} />
      ) : (
        <label className="flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-2 py-3 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40">
          <span className="text-[11px] font-semibold text-slate-600">اختر ملفاً أو اسحبه هنا</span>
          <span className="mt-0.5 text-[10px] text-slate-400">PDF / صورة</span>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            disabled={disabled}
            className="sr-only"
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}

      {busy ? <p className="text-[11px] text-gray-500">جاري الرفع/الاستخراج...</p> : null}
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
