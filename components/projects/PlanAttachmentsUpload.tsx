'use client';

import type { PlanAttachmentFile, PlanAttachmentsState } from '@/lib/types/project-reports';

type Props = {
  value: PlanAttachmentsState;
  onChange: (next: PlanAttachmentsState) => void;
};

function uid() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function fileToAttachment(
  file: File,
  kind: PlanAttachmentFile['kind']
): Promise<PlanAttachmentFile> {
  let dataUrl: string | null = null;
  if (file.size < 1_500_000) {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    }).catch(() => null);
  }
  const name = file.name.toLowerCase();
  const format = name.includes('.') ? name.split('.').pop() || 'bin' : 'bin';
  return {
    id: uid(),
    fileName: file.name,
    format,
    sizeBytes: file.size,
    mimeType: file.type || null,
    dataUrl,
    uploadedAt: new Date().toISOString(),
    kind,
  };
}

export default function PlanAttachmentsUpload({ value, onChange }: Props) {
  const addFiles = async (
    files: FileList | null,
    kind: PlanAttachmentFile['kind'],
    key: keyof PlanAttachmentsState
  ) => {
    if (!files?.length) return;
    const nextFiles: PlanAttachmentFile[] = [];
    for (const file of Array.from(files)) {
      nextFiles.push(await fileToAttachment(file, kind));
    }
    onChange({
      ...value,
      [key]: [...(value[key] || []), ...nextFiles],
    });
  };

  const remove = (key: keyof PlanAttachmentsState, id: string) => {
    onChange({
      ...value,
      [key]: (value[key] || []).filter((f) => f.id !== id),
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4 space-y-2">
        <h4 className="text-sm font-bold text-gray-900">المخططات الهندسية (DWG / PDF)</h4>
        <input
          type="file"
          accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg"
          multiple
          onChange={(e) => void addFiles(e.target.files, 'engineering_drawing', 'engineering_drawings')}
          className="w-full text-sm"
        />
        <ul className="text-xs space-y-1">
          {(value.engineering_drawings || []).map((f) => (
            <li key={f.id} className="flex justify-between gap-2 border rounded-lg px-2 py-1.5 bg-slate-50">
              <span>
                {f.fileName} · {(f.sizeBytes / 1024).toFixed(0)} KB
              </span>
              <button type="button" className="text-rose-600" onClick={() => remove('engineering_drawings', f.id)}>
                حذف
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border p-4 space-y-2">
        <h4 className="text-sm font-bold text-gray-900">الحسابات الهيدروليكية (PDF / CALC)</h4>
        <input
          type="file"
          accept=".pdf,.calc,.xlsx,.xls,.csv"
          multiple
          onChange={(e) =>
            void addFiles(e.target.files, 'hydraulic_calculation', 'hydraulic_calculations')
          }
          className="w-full text-sm"
        />
        <ul className="text-xs space-y-1">
          {(value.hydraulic_calculations || []).map((f) => (
            <li key={f.id} className="flex justify-between gap-2 border rounded-lg px-2 py-1.5 bg-slate-50">
              <span>
                {f.fileName} · {(f.sizeBytes / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                className="text-rose-600"
                onClick={() => remove('hydraulic_calculations', f.id)}
              >
                حذف
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
