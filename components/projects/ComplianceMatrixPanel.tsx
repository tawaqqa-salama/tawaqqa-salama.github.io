'use client';

/**
 * Compliance Matrix UI — additive panel inside Technical Report stage.
 * Deterministic SBC engine results; Engineer Override requires reason + code ref.
 */

import { useMemo, useState } from 'react';
import {
  COMPLIANCE_ASSESSMENT_DISCLAIMER_AR,
  complianceStatusLabelAr,
  runProjectCompliance,
  type EngineerOverride,
  type ProjectComplianceState,
} from '@/lib/projects/compliance';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

const STATUS_CLASS: Record<string, string> = {
  PASS: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  FAIL: 'bg-red-50 text-red-800 border-red-200',
  NEEDS_DATA: 'bg-amber-50 text-amber-900 border-amber-200',
  'N/A': 'bg-slate-50 text-slate-600 border-slate-200',
};

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  onChange: (compliance: ProjectComplianceState) => void;
};

export default function ComplianceMatrixPanel({ client, data, onChange }: Props) {
  const [overrideRuleId, setOverrideRuleId] = useState('');
  const [reason, setReason] = useState('');
  const [codeRef, setCodeRef] = useState('');
  const [engineerName, setEngineerName] = useState('');
  const [engineerRole, setEngineerRole] = useState('licensed_engineer');
  const [msg, setMsg] = useState<string | null>(null);

  const overrides = useMemo(() => data.compliance?.overrides || [], [data.compliance?.overrides]);

  const run = useMemo(
    () => runProjectCompliance({ client, data, overrides }),
    [client, data, overrides]
  );

  const claim = complianceStatusLabelAr(run);

  const applyOverride = () => {
    if (!overrideRuleId) {
      setMsg('اختر قاعدة للتجاوز');
      return;
    }
    if (
      reason.trim().length < 8 ||
      codeRef.trim().length < 3 ||
      engineerName.trim().length < 2 ||
      engineerRole.trim().length < 3
    ) {
      setMsg(
        'التجاوز يتطلب سببًا (≥8) ومرجعًا كوديًا (≥3) واسم المهندس (≥2) وصلاحية/دور (≥3) — النتيجة الأصلية تبقى ظاهرة'
      );
      return;
    }
    const next: EngineerOverride = {
      ruleId: overrideRuleId,
      reason: reason.trim(),
      codeReference: codeRef.trim(),
      engineerName: engineerName.trim(),
      engineerRole: engineerRole.trim(),
      overriddenAt: new Date().toISOString(),
      resultingStatus: 'PASS',
    };
    const filtered = overrides.filter((o) => o.ruleId !== overrideRuleId);
    onChange({
      ...(data.compliance || {}),
      overrides: [...filtered, next],
      last_run_at: run.evaluatedAt,
      last_gate: run.gate,
    });
    setMsg('تم تسجيل التجاوز — ليس تحققًا آليًا من الكود؛ النتيجة الأصلية محفوظة في عمود Result');
    setReason('');
    setCodeRef('');
  };

  const clearOverride = (ruleId: string) => {
    onChange({
      ...(data.compliance || {}),
      overrides: overrides.filter((o) => o.ruleId !== ruleId),
      last_run_at: run.evaluatedAt,
      last_gate: run.gate,
    });
  };

  return (
    <section
      id="sbc-compliance-matrix"
      className="rounded-xl border border-[#635bdb]/30 bg-white p-4 space-y-3"
      dir="rtl"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#635bdb] text-lg">مصفوفة تقييم المطابقة الكودية (SBC 201 / SBC 801)</h3>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed max-w-3xl">
            {COMPLIANCE_ASSESSMENT_DISCLAIMER_AR}
          </p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed max-w-3xl">
            تقييم المطابقة بناءً على البيانات والقواعد الكودية الموثقة. قيم required_* المدخلة = تصميم مشروع وليست
            الكود تلقائيًا. عمود Result = الأصل؛ Status = effectiveStatus بعد التجاوز.
          </p>
        </div>
        <div className="text-left space-y-1">
          <div
            className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-bold ${STATUS_CLASS[run.gate === 'ALLOW' ? 'PASS' : 'FAIL']}`}
          >
            {claim} — {run.gate}
          </div>
          <p className="text-[11px] text-gray-500">
            PASS {run.counts.PASS} · FAIL {run.counts.FAIL} · NEEDS_DATA {run.counts.NEEDS_DATA} · N/A{' '}
            {run.counts['N/A']}
          </p>
        </div>
      </div>

      {run.gateReasons.length > 0 && (
        <ul className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 space-y-0.5">
          {run.gateReasons.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-[11px]">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-2 py-2 text-right font-semibold">Requirement</th>
              <th className="px-2 py-2 text-right font-semibold">Code</th>
              <th className="px-2 py-2 text-right font-semibold">Actual</th>
              <th className="px-2 py-2 text-right font-semibold">Required</th>
              <th className="px-2 py-2 text-right font-semibold">Result</th>
              <th className="px-2 py-2 text-right font-semibold">Code Ref</th>
              <th className="px-2 py-2 text-right font-semibold">Evidence</th>
              <th className="px-2 py-2 text-right font-semibold">Override</th>
              <th className="px-2 py-2 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {run.results.map((row) => (
              <tr key={row.ruleId} className="border-t border-gray-100 align-top">
                <td className="px-2 py-1.5 font-medium text-gray-900">
                  <span className="text-slate-400 ml-1">{row.ruleId}</span>
                  {row.title_ar || row.title}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{row.code}</td>
                <td className="px-2 py-1.5 text-gray-700">
                  {row.actual_value == null || row.actual_value === '' ? '—' : String(row.actual_value)}
                  {row.unit ? ` ${row.unit}` : ''}
                </td>
                <td className="px-2 py-1.5 text-gray-700">
                  {row.required_value == null || row.required_value === '' ? '—' : String(row.required_value)}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-block rounded border px-1.5 py-0.5 font-bold ${STATUS_CLASS[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-gray-600 max-w-[140px] break-words">
                  {row.code_reference || row.section}
                </td>
                <td className="px-2 py-1.5 text-gray-600 max-w-[140px] break-words">
                  {(row.evidence || []).map((e) => e.label).join('؛ ') || '—'}
                </td>
                <td className="px-2 py-1.5 text-gray-600 max-w-[160px] break-words">
                  {row.override
                    ? `${row.override.engineerName || row.override.engineerUserId || '?'} → ${row.override.resultingStatus}`
                    : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 font-bold ${STATUS_CLASS[row.effectiveStatus]}`}
                  >
                    {row.effectiveStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 space-y-2">
        <h4 className="text-sm font-bold text-slate-800">Engineer Override</h4>
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 leading-relaxed">
          التجاوز قرار مهندس مرخّص موثّق (سبب + مرجع كودي + هوية + صلاحية/دور + وقت) — <strong>ليس</strong>{' '}
          نتيجة تحقق آلي من الكود. يبقى عمود Result على النتيجة الأصلية؛ يتغيّر فقط Status (effectiveStatus).
          نقص البيانات لا يتحول إلى PASS دون هذا التوثيق.
        </p>
        <div className="grid md:grid-cols-6 gap-2">
          <label className="text-xs block md:col-span-1">
            <span className="text-gray-600 mb-1 block">القاعدة</span>
            <select
              className="w-full border rounded-lg px-2 py-2 bg-white"
              value={overrideRuleId}
              onChange={(e) => setOverrideRuleId(e.target.value)}
            >
              <option value="">— اختر —</option>
              {run.results
                .filter((r) => r.effectiveStatus === 'FAIL' || r.effectiveStatus === 'NEEDS_DATA')
                .map((r) => (
                  <option key={r.ruleId} value={r.ruleId}>
                    {r.ruleId} — {r.title_ar || r.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-xs block">
            <span className="text-gray-600 mb-1 block">اسم المهندس</span>
            <input
              className="w-full border rounded-lg px-2 py-2"
              value={engineerName}
              onChange={(e) => setEngineerName(e.target.value)}
              placeholder="هوية المهندس"
            />
          </label>
          <label className="text-xs block">
            <span className="text-gray-600 mb-1 block">الصلاحية / الدور</span>
            <select
              className="w-full border rounded-lg px-2 py-2 bg-white"
              value={engineerRole}
              onChange={(e) => setEngineerRole(e.target.value)}
            >
              <option value="licensed_engineer">مهندس مرخّص</option>
              <option value="supervising_engineer">مهندس مشرف</option>
              <option value="design_reviewer">مراجع تصميم</option>
            </select>
          </label>
          <label className="text-xs block md:col-span-2">
            <span className="text-gray-600 mb-1 block">السبب</span>
            <input
              className="w-full border rounded-lg px-2 py-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="سبب هندسي موثّق"
            />
          </label>
          <label className="text-xs block">
            <span className="text-gray-600 mb-1 block">Code Reference</span>
            <input
              className="w-full border rounded-lg px-2 py-2"
              value={codeRef}
              onChange={(e) => setCodeRef(e.target.value)}
              placeholder="SBC 201 §…"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={applyOverride}
            className="rounded-lg bg-[#635bdb] text-white text-xs font-semibold px-3 py-2"
          >
            تسجيل تجاوز هندسي → effective PASS
          </button>
          {overrides.map((o) => (
            <button
              key={o.ruleId}
              type="button"
              onClick={() => clearOverride(o.ruleId)}
              className="rounded-lg border border-slate-300 bg-white text-xs px-2 py-1.5 text-slate-700"
            >
              إلغاء {o.ruleId}
            </button>
          ))}
          {msg && <span className="text-xs text-slate-600">{msg}</span>}
        </div>
      </div>
    </section>
  );
}
