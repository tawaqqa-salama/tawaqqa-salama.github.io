'use client';

import type { BlueprintAiAuditResult } from '@/lib/types/project-reports';
import { KIND_LABELS } from '@/lib/compliance/blueprint-audit';

type AiAuditReportModalProps = {
  open: boolean;
  result: BlueprintAiAuditResult | null;
  onClose: () => void;
};

const SEVERITY_STYLES: Record<string, string> = {
  pass: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  warning: 'bg-amber-50 text-amber-900 border-amber-100',
  fail: 'bg-rose-50 text-rose-800 border-rose-100',
  info: 'bg-slate-50 text-slate-700 border-slate-100',
};

export default function AiAuditReportModal({ open, result, onClose }: AiAuditReportModalProps) {
  if (!open || !result) return null;

  const statusLabel =
    result.status === 'pass'
      ? 'مطابق للمواصفات'
      : result.status === 'warn'
        ? 'يوجد ملاحظات'
        : 'غير مطابق — يتطلب مراجعة';

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border flex flex-col">
        <div className="px-5 py-4 border-b bg-[#f0f7f3] flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1f4d3a]">التقرير التلقائي للامتثال (AI Audit)</h2>
            <p className="text-sm text-gray-600 mt-1">
              {KIND_LABELS[result.blueprintKind]} — {result.fileName}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl text-gray-400 leading-none">
            ×
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${
                result.status === 'pass'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : result.status === 'warn'
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {statusLabel}
            </span>
            <span className="text-sm font-semibold text-gray-700">الدرجة: {result.score}/100</span>
            <span className="text-xs text-gray-500">SBC · NFPA</span>
          </div>

          <p className="text-sm text-gray-800 rounded-xl border bg-gray-50 px-3 py-2">{result.summary}</p>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-800">نقاط الفحص</h3>
            {result.findings.map((finding) => (
              <div
                key={finding.id}
                className={`rounded-xl border px-3 py-2 text-sm ${SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.info}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{finding.title}</strong>
                  <span className="text-[11px] font-mono opacity-80">
                    {finding.standard} · {finding.code}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed opacity-90">{finding.detail}</p>
                {finding.refs?.length ? (
                  <p className="mt-1 text-[11px] opacity-70">مراجع: {finding.refs.join(' · ')}</p>
                ) : null}
              </div>
            ))}
          </div>

          {result.ekbHints.length > 0 && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
              مواضيع معرفة مقترحة: {result.ekbHints.join(' · ')}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
