'use client';

import { useState } from 'react';
import {
  SUPPORTED_ENGINEERING_EXTENSIONS,
  detectEngineeringFormat,
  parseEngineeringFileMeta,
} from '@/lib/compliance/file-parser';
import type { ParsedEngineeringFile } from '@/lib/compliance/types';

type BlueprintViewerProps = {
  projectName?: string;
};

/**
 * حاوية عارض المخططات / BIM-CAD — تسجّل الملفات بأمان وتعرض بيانات وصفية.
 * لا تُنفَّذ محتويات الملفات الثنائية داخل المتصفح.
 */
export default function BlueprintViewer({ projectName }: BlueprintViewerProps) {
  const [files, setFiles] = useState<ParsedEngineeringFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const next: ParsedEngineeringFile[] = [];

    for (const file of Array.from(list)) {
      const format = detectEngineeringFormat(file.name);
      if (format === 'unknown') {
        setError(`تم تجاهل ${file.name}: صيغة غير مدعومة`);
        continue;
      }

      let rawText: string | null = null;
      if (format === 'pdf' || format === 'docx' || format === 'xlsx') {
        // لا نقرأ الثنائي كاملاً — عيّنة نصية صغيرة فقط إن أمكن
        try {
          if (file.size < 1.5 * 1024 * 1024 && (format === 'docx' || file.type.includes('text'))) {
            rawText = await file.text();
          }
        } catch {
          rawText = null;
        }
      }

      next.push(
        parseEngineeringFileMeta({
          fileName: file.name,
          sizeBytes: file.size,
          rawText,
        })
      );
    }

    setFiles((prev) => [...next, ...prev].slice(0, 20));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4">
        <h2 className="text-lg font-bold text-[var(--erp-text)]">عارض المخططات / BIM-CAD</h2>
        <p className="text-sm text-[var(--erp-muted)] mt-1">
          {projectName ? `المشروع: ${projectName}` : 'ارفع ملفات DWG / RVT / IFC / PDF / XLSX / DOCX للتسجيل والمعاينة الوصفية.'}
        </p>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
          الأمان: الملفات الثنائية لا تُنفَّذ في المتصفح. يُحفظ الوصف فقط للربط مع محرك الامتثال.
        </p>

        <label className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--erp-border)] bg-[var(--erp-page)] px-4 py-8 cursor-pointer hover:border-[var(--erp-primary)]/40">
          <span className="text-sm font-semibold text-[var(--erp-primary)]">اختر ملفات هندسية</span>
          <span className="text-xs text-[var(--erp-muted)]">
            {SUPPORTED_ENGINEERING_EXTENSIONS.map((e) => e.toUpperCase()).join(' · ')}
          </span>
          <input
            type="file"
            className="hidden"
            multiple
            accept=".dwg,.rvt,.ifc,.pdf,.xlsx,.xls,.docx,.doc"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
        {error ? <p className="text-sm text-rose-600 mt-2">{error}</p> : null}
      </div>

      <div className="grid gap-3">
        {files.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-sm text-gray-500 text-center">
            لا توجد ملفات بعد — ارفع مخططاً لعرض الحاوية.
          </div>
        ) : (
          files.map((file) => (
            <div key={`${file.fileName}-${file.sizeBytes}`} className="rounded-xl border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-800">{file.fileName}</p>
                  <p className="text-xs text-gray-500 mt-1">{file.message}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-800">
                  {file.format.toUpperCase()}
                </span>
              </div>
              <div className="mt-3 h-40 rounded-lg bg-gradient-to-br from-slate-100 to-indigo-50 border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-500">
                حاوية معاينة {file.format === 'ifc' ? 'IFC/BIM' : file.format === 'pdf' ? 'PDF' : 'CAD'} — جاهزة للربط بعارض خارجي
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
