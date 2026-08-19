'use client';

import { useState } from 'react';
import {
  detectEngineeringFormat,
  SUPPORTED_ENGINEERING_EXTENSIONS,
} from '@/lib/compliance/file-parser';
import { KIND_LABELS, runBlueprintAiAudit } from '@/lib/compliance/blueprint-audit';
import AiAuditReportModal from '@/components/projects/AiAuditReportModal';
import PlanAttachmentsUpload from '@/components/projects/PlanAttachmentsUpload';
import type { ClientRecord } from '@/lib/types/client';
import type {
  BlueprintAiAuditResult,
  BuildingPlanReport,
  SafetyBlueprintFile,
  SafetyBlueprintKind,
  SafetyBlueprintsState,
  PlanAttachmentsState,
} from '@/lib/types/project-reports';
import { EMPTY_PLAN_ATTACHMENTS, EMPTY_SAFETY_BLUEPRINTS } from '@/lib/types/project-reports';

const SLOTS: Array<{
  kind: SafetyBlueprintKind;
  title: string;
  description: string;
  accent: string;
}> = [
  {
    kind: 'architectural_base',
    title: KIND_LABELS.architectural_base,
    description: 'CAD (.DWG) / BIM (.RVT) / PDF قبل تصميم أنظمة السلامة',
    accent: 'border-slate-200 bg-slate-50',
  },
  {
    kind: 'fire_fighting_file',
    title: KIND_LABELS.fire_fighting_file,
    description: 'مرشات، حنفيات، مداخل دفاع مدني، شبكة الأنابيب',
    accent: 'border-rose-100 bg-rose-50/40',
  },
  {
    kind: 'fire_alarm_file',
    title: KIND_LABELS.fire_alarm_file,
    description: 'كواشف دخان، إنذار، نقاط سحب يدوي، لوحات التحكم',
    accent: 'border-amber-100 bg-amber-50/40',
  },
  {
    kind: 'life_safety_file',
    title: KIND_LABELS.life_safety_file,
    description: 'مخارج الطوارئ، مسافات السفر، عرض الممرات، مسارات الإخلاء',
    accent: 'border-emerald-100 bg-emerald-50/40',
  },
];

type SafetyBlueprintsUploadProps = {
  client: ClientRecord;
  buildingPlan: BuildingPlanReport;
  value: SafetyBlueprintsState;
  onChange: (next: SafetyBlueprintsState) => void;
  onPersist?: (next: SafetyBlueprintsState) => void | Promise<void>;
  planAttachments?: PlanAttachmentsState | null;
  onPlanAttachmentsChange?: (next: PlanAttachmentsState) => void | Promise<void>;
};

function statusBadge(file: SafetyBlueprintFile | null) {
  if (!file) {
    return <span className="text-xs font-semibold text-gray-400">لم يُرفع</span>;
  }
  switch (file.auditStatus) {
    case 'scanning':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-full">
          جاري الفحص بالذكاء الاصطناعي...
        </span>
      );
    case 'pass':
      return (
        <span className="inline-flex text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full">
          مطابق للمواصفات
        </span>
      );
    case 'warn':
      return (
        <span className="inline-flex text-xs font-bold text-amber-900 bg-amber-50 border border-amber-100 px-2 py-1 rounded-full">
          يوجد ملاحظات
        </span>
      );
    case 'fail':
      return (
        <span className="inline-flex text-xs font-bold text-rose-800 bg-rose-50 border border-rose-100 px-2 py-1 rounded-full">
          غير مطابق — راجع التقرير
        </span>
      );
    default:
      return (
        <span className="text-xs font-semibold text-gray-500">بانتظار الفحص</span>
      );
  }
}

async function fileToSlotBase(file: File, kind: SafetyBlueprintKind): Promise<SafetyBlueprintFile> {
  const format = detectEngineeringFormat(file.name);
  let dataUrl: string | null = null;
  if (format === 'pdf' && file.size < 1.2 * 1024 * 1024) {
    dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  return {
    id: `${kind}-${Date.now()}`,
    kind,
    fileName: file.name,
    format,
    sizeBytes: file.size,
    mimeType: file.type || null,
    dataUrl,
    uploadedAt: new Date().toISOString(),
    auditStatus: 'scanning',
    auditResult: null,
  };
}

export default function SafetyBlueprintsUpload({
  client,
  buildingPlan,
  value,
  onChange,
  onPersist,
  planAttachments,
  onPlanAttachmentsChange,
}: SafetyBlueprintsUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportResult, setReportResult] = useState<BlueprintAiAuditResult | null>(null);

  const state = value || EMPTY_SAFETY_BLUEPRINTS;

  const runAudit = async (
    kind: SafetyBlueprintKind,
    fileMeta: SafetyBlueprintFile,
    textSample: string | null
  ) => {
    const payload = {
      blueprintKind: kind,
      fileName: fileMeta.fileName,
      sizeBytes: fileMeta.sizeBytes,
      mimeType: fileMeta.mimeType,
      textSample,
      client,
      buildingPlan,
      occupants: null,
      travelDistanceM: null,
    };

    let result: BlueprintAiAuditResult;
    try {
      const response = await fetch('/api/audit/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const json = (await response.json()) as { ok: boolean; result: BlueprintAiAuditResult };
        result = json.result;
      } else {
        // GitHub Pages returns HTML 404 for /api/* — use local auditor
        result = runBlueprintAiAudit(payload);
      }
    } catch {
      result = runBlueprintAiAudit(payload);
    }

    const nextFile: SafetyBlueprintFile = {
      ...fileMeta,
      auditStatus: result.status,
      auditResult: result,
    };
    const next: SafetyBlueprintsState = { ...state, [kind]: nextFile };
    onChange(next);
    if (onPersist) await onPersist(next);
    return result;
  };

  const onUpload = async (kind: SafetyBlueprintKind, list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setError(null);

    const format = detectEngineeringFormat(file.name);
    if (format === 'unknown') {
      setError(`الصيغة غير مدعومة: ${file.name}`);
      return;
    }

    let textSample: string | null = null;
    if ((format === 'pdf' || format === 'docx' || format === 'xlsx') && file.size < 1.5 * 1024 * 1024) {
      try {
        if (file.type.includes('text') || format === 'docx') {
          textSample = (await file.text()).slice(0, 4000);
        }
      } catch {
        textSample = null;
      }
    }

    const scanning = await fileToSlotBase(file, kind);
    const withScan: SafetyBlueprintsState = { ...state, [kind]: scanning };
    onChange(withScan);

    await runAudit(kind, scanning, textSample);
  };

  const clearSlot = async (kind: SafetyBlueprintKind) => {
    const next = { ...state, [kind]: null };
    onChange(next);
    if (onPersist) await onPersist(next);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
        ارفع المخطط المعماري ومخططات السلامة المعتمدة. عند اكتمال الرفع يُشغَّل فحص تلقائي وفق SBC وNFPA.
      </div>

      {error && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {SLOTS.map((slot) => {
          const file = state[slot.kind];
          return (
            <div key={slot.kind} className={`rounded-xl border p-4 ${slot.accent}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{slot.title}</h3>
                  <p className="text-xs text-gray-600 mt-1">{slot.description}</p>
                </div>
                {statusBadge(file)}
              </div>

              <label className="mt-3 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 bg-white/80 px-3 py-6 cursor-pointer hover:border-[#635bdb]/50">
                <span className="text-xs font-semibold text-[#635bdb]">
                  {file ? 'استبدال الملف' : 'اسحب الملف أو اختر للرفع'}
                </span>
                <span className="text-[11px] text-gray-500">
                  {SUPPORTED_ENGINEERING_EXTENSIONS.map((e) => e.toUpperCase()).join(' · ')}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".dwg,.rvt,.ifc,.pdf,.xlsx,.xls,.docx,.doc"
                  onChange={(e) => {
                    void onUpload(slot.kind, e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>

              {file && (
                <div className="mt-3 rounded-lg border bg-white px-3 py-2 text-xs space-y-1">
                  <p className="font-semibold text-gray-800 truncate">{file.fileName}</p>
                  <p className="text-gray-500">
                    {file.format.toUpperCase()} · {(file.sizeBytes / 1024).toFixed(1)} KB
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {file.auditResult && (
                      <button
                        type="button"
                        onClick={() => {
                          setReportResult(file.auditResult || null);
                          setReportOpen(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#635bdb] text-white font-semibold"
                      >
                        عرض التقرير التلقائي للامتثال (AI Audit Report)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void clearSlot(slot.kind)}
                      className="px-2.5 py-1.5 rounded-lg border font-semibold text-gray-600"
                    >
                      إزالة
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onPlanAttachmentsChange ? (
        <PlanAttachmentsUpload
          value={planAttachments || EMPTY_PLAN_ATTACHMENTS}
          onChange={onPlanAttachmentsChange}
          clientId={client.id}
          sections={['hydraulic_calculations']}
          variant="blueprint-card"
        />
      ) : null}

      <AiAuditReportModal
        open={reportOpen}
        result={reportResult}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
