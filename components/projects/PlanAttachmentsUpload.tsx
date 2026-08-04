'use client';

import { useState } from 'react';
import { uploadPlanAttachment } from '@/lib/storage/project-files';
import { isDemoMode } from '@/lib/supabase';
import type { PlanAttachmentFile, PlanAttachmentsState } from '@/lib/types/project-reports';

type Props = {
  value: PlanAttachmentsState;
  onChange: (next: PlanAttachmentsState) => void;
  clientId?: string | null;
};

export default function PlanAttachmentsUpload({ value, onChange, clientId }: Props) {
  const [uploading, setUploading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const addFiles = async (
    files: FileList | null,
    kind: PlanAttachmentFile['kind'],
    key: keyof PlanAttachmentsState
  ) => {
    if (!files?.length) return;
    setUploading(true);
    setHint(null);
    try {
      const nextFiles: PlanAttachmentFile[] = [];
      for (const file of Array.from(files)) {
        const att = await uploadPlanAttachment(file, kind, { clientId });
        nextFiles.push(att);
      }
      onChange({
        ...value,
        [key]: [...(value[key] || []), ...nextFiles],
      });
      const stored = nextFiles.filter((f) => f.storagePath).length;
      if (isDemoMode) {
        setHint('وضع تجريبي — الملفات تُحفظ محلياً داخل بيانات المشروع');
      } else if (stored) {
        setHint(`تم رفع ${stored} ملف/ملفات إلى Supabase Storage (project-files)`);
      } else {
        setHint(
          'لم يتوفر Storage — حُفظت معاينات صغيرة داخل البيانات. أنشئ bucket: project-files'
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const remove = (key: keyof PlanAttachmentsState, id: string) => {
    onChange({
      ...value,
      [key]: (value[key] || []).filter((f) => f.id !== id),
    });
  };

  return (
    <div className="space-y-4">
      {hint ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {hint}
        </div>
      ) : null}
      {uploading ? (
        <div className="text-xs text-gray-500">جاري الرفع...</div>
      ) : null}

      <div className="rounded-xl border p-4 space-y-2">
        <h4 className="text-sm font-bold text-gray-900">المخططات الهندسية (DWG / PDF)</h4>
        <input
          type="file"
          accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg"
          multiple
          disabled={uploading}
          onChange={(e) => void addFiles(e.target.files, 'engineering_drawing', 'engineering_drawings')}
          className="w-full text-sm"
        />
        <FileList files={value.engineering_drawings || []} onRemove={(id) => remove('engineering_drawings', id)} />
      </div>

      <div className="rounded-xl border p-4 space-y-2">
        <h4 className="text-sm font-bold text-gray-900">الحسابات الهيدروليكية (PDF / CALC)</h4>
        <input
          type="file"
          accept=".pdf,.calc,.xlsx,.xls,.csv"
          multiple
          disabled={uploading}
          onChange={(e) =>
            void addFiles(e.target.files, 'hydraulic_calculation', 'hydraulic_calculations')
          }
          className="w-full text-sm"
        />
        <FileList
          files={value.hydraulic_calculations || []}
          onRemove={(id) => remove('hydraulic_calculations', id)}
        />
      </div>
    </div>
  );
}

function FileList({
  files,
  onRemove,
}: {
  files: PlanAttachmentFile[];
  onRemove: (id: string) => void;
}) {
  return (
    <ul className="text-xs space-y-1">
      {files.map((f) => (
        <li key={f.id} className="flex justify-between gap-2 border rounded-lg px-2 py-1.5 bg-slate-50">
          <span>
            {f.fileName} · {(f.sizeBytes / 1024).toFixed(0)} KB
            {f.storagePath ? (
              <span className="ms-2 text-emerald-700">☁ Storage</span>
            ) : f.dataUrl ? (
              <span className="ms-2 text-gray-400">محلي</span>
            ) : (
              <span className="ms-2 text-amber-600">بيانات فقط</span>
            )}
          </span>
          <button type="button" className="text-rose-600" onClick={() => onRemove(f.id)}>
            حذف
          </button>
        </li>
      ))}
    </ul>
  );
}
