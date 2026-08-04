'use client';

import { useState } from 'react';
import { extractBuildingPermitFromFile } from '@/lib/projects/building-permit-extract';
import {
  extractionToHydration,
  hasUsefulPermitExtraction,
  type BuildingPermitExtraction,
} from '@/lib/projects/building-permit-ocr';
import { uploadPlanAttachment } from '@/lib/storage/project-files';
import type { BuildingPlanReport, PlanAttachmentFile } from '@/lib/types/project-reports';

export type PermitClientHydration = {
  owner_name?: string;
  district?: string;
  city?: string;
};

type Props = {
  clientId?: string | null;
  report: BuildingPlanReport;
  disabled?: boolean;
  onReportPatch: (partial: Partial<BuildingPlanReport>) => void;
  onClientHydrate?: (fields: PermitClientHydration) => void;
};

export default function BuildingPermitOcrUpload({
  clientId,
  report,
  disabled,
  onReportPatch,
  onClientHydrate,
}: Props) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const applyExtraction = (
    fileMeta: PlanAttachmentFile,
    extraction: BuildingPermitExtraction
  ) => {
    const hydration = extractionToHydration(extraction);
    const useful = hasUsefulPermitExtraction(extraction);
    const successMsg = useful
      ? hydration.building_permit_number &&
        (hydration.building_permit_date || hydration.building_permit_date_hijri)
        ? '✓ تم استخراج رقم وتاريخ الرخصة بنجاح'
        : hydration.building_permit_number
          ? '✓ تم استخراج رقم الرخصة — راجع التاريخ يدوياً إن لزم'
          : '✓ تم استخراج تاريخ الرخصة — راجع الرقم يدوياً إن لزم'
      : 'تعذر استخراج البيانات، يرجى إدخال البيانات يدوياً أو إعادة رفع صورة/PDF أوضح';

    onReportPatch({
      building_permit_file: fileMeta,
      building_permit_number: hydration.building_permit_number || report.building_permit_number,
      building_permit_date: hydration.building_permit_date || report.building_permit_date,
      building_permit_date_hijri:
        hydration.building_permit_date_hijri || report.building_permit_date_hijri,
      report_date: hydration.report_date || report.report_date,
      building_permit_ocr_status: useful
        ? extraction.confidence === 'low'
          ? 'partial'
          : 'success'
        : 'failed',
      building_permit_ocr_message: successMsg,
    });

    const clientPatch: PermitClientHydration = {};
    if (hydration.owner_name) clientPatch.owner_name = hydration.owner_name;
    if (hydration.district) clientPatch.district = hydration.district;
    if (hydration.city) clientPatch.city = hydration.city;
    if (Object.keys(clientPatch).length) onClientHydrate?.(clientPatch);
  };

  const runExtract = async (file: File, uploaded?: PlanAttachmentFile) => {
    setError(null);
    setScanning(true);
    setProgress('جاري استخراج بيانات الرخصة تلقائياً...');
    onReportPatch({
      building_permit_ocr_status: 'scanning',
      building_permit_ocr_message: 'جاري استخراج بيانات الرخصة تلقائياً...',
    });

    try {
      const fileMeta =
        uploaded ||
        report.building_permit_file ||
        (await uploadPlanAttachment(file, 'building_permit', { clientId }));
      const extraction = await extractBuildingPermitFromFile(file, {
        onProgress: (msg) => {
          setProgress(msg);
          onReportPatch({
            building_permit_ocr_status: 'scanning',
            building_permit_ocr_message: msg,
          });
        },
      });
      applyExtraction(fileMeta, extraction);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'فشل رفع أو استخراج الرخصة';
      setError(msg);
      onReportPatch({
        building_permit_ocr_status: 'failed',
        building_permit_ocr_message: msg,
      });
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  const onUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setLastFile(file);
    setScanning(true);
    try {
      const uploaded = await uploadPlanAttachment(file, 'building_permit', { clientId });
      await runExtract(file, uploaded);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'فشل رفع الرخصة';
      setError(msg);
      onReportPatch({
        building_permit_ocr_status: 'failed',
        building_permit_ocr_message: msg,
      });
      setScanning(false);
    }
  };

  const clearFile = () => {
    setLastFile(null);
    onReportPatch({
      building_permit_file: null,
      building_permit_ocr_status: 'idle',
      building_permit_ocr_message: null,
    });
  };

  const status = report.building_permit_ocr_status;
  const message = report.building_permit_ocr_message;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
      <div>
        <p className="text-sm font-bold text-gray-900">إرفاق رخصة البناء (استخراج تلقائي)</p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          ارفع PDF أو صورة واضحة (PNG/JPG) — يُستخرج رقم الرخصة والتاريخ والمالك والموقع داخل المتصفح
        </p>
      </div>

      {report.building_permit_file ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-xs">
          <span className="truncate" title={report.building_permit_file.fileName}>
            {report.building_permit_file.fileName}
            <span className="ms-1 text-gray-400">
              · {(report.building_permit_file.sizeBytes / 1024).toFixed(0)} KB
            </span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {lastFile ? (
              <button
                type="button"
                disabled={disabled || scanning}
                onClick={() => void runExtract(lastFile)}
                className="text-sky-700 disabled:opacity-50"
              >
                إعادة الاستخراج
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled || scanning}
              onClick={clearFile}
              className="text-rose-600 disabled:opacity-50"
            >
              حذف
            </button>
          </div>
        </div>
      ) : (
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
          disabled={disabled || scanning}
          onChange={(e) => {
            void onUpload(e.target.files);
            e.target.value = '';
          }}
          className="w-full text-xs"
        />
      )}

      {scanning || status === 'scanning' ? (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
          {progress || 'جاري استخراج بيانات الرخصة تلقائياً...'}
        </div>
      ) : null}

      {!scanning && status === 'success' && message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      {!scanning && status === 'partial' && message ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {message}
        </div>
      ) : null}

      {!scanning && (status === 'failed' || error) ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error || message}
        </div>
      ) : null}

      {(report.building_permit_date_hijri || report.building_permit_date) &&
      (status === 'success' || status === 'partial') ? (
        <p className="text-[11px] text-gray-500">
          {report.building_permit_number ? `الرقم: ${report.building_permit_number}` : null}
          {report.building_permit_number && report.building_permit_date ? ' · ' : null}
          {report.building_permit_date ? `ميلادي: ${report.building_permit_date}` : null}
          {report.building_permit_date && report.building_permit_date_hijri ? ' · ' : null}
          {report.building_permit_date_hijri ? `هجري: ${report.building_permit_date_hijri}` : null}
        </p>
      ) : null}
    </div>
  );
}
