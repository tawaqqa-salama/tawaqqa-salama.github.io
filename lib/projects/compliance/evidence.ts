/**
 * Evidence helpers — missing evidence never implies PASS.
 */

import type {
  ComplianceEvidence,
  ComplianceEvidenceKind,
  ComplianceRuleEvaluation,
  ComplianceResultStatus,
} from '@/lib/projects/compliance/types';
import type { ResolvedThreshold } from '@/lib/projects/compliance/thresholds';

export function evidence(
  kind: ComplianceEvidenceKind,
  label: string,
  value?: string | number | boolean | null,
  source?: string,
  ref?: string
): ComplianceEvidence {
  return { kind, label, value: value ?? null, source, ref };
}

export function formatEvidenceList(list: ComplianceEvidence[] | undefined): string {
  if (!list?.length) return '—';
  return list
    .map((e) => {
      const v = e.value == null || e.value === '' ? '' : `: ${String(e.value)}`;
      return `${e.label}${v}`;
    })
    .join('؛ ');
}

export function hasNonEmpty(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  const s = String(value).trim();
  if (!s) return false;
  if (/^(unknown|غير\s*معروف|n\/?a|—|-)$/i.test(s)) return false;
  return true;
}

export function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.eE+-]/g, ' ').trim();
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function parseYesNoUnknown(value: unknown): 'yes' | 'no' | 'unknown' | null {
  if (value == null || value === '') return null;
  const s = String(value).trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'نعم', 'موجود', 'متوفر', 'مطلوب'].includes(s)) return 'yes';
  if (['no', 'n', 'false', '0', 'لا', 'غير موجود', 'غير متوفر', 'غير مطلوب'].includes(s)) return 'no';
  if (['unknown', 'غير معروف', 'غير محدد'].includes(s)) return 'unknown';
  return null;
}

export function ynFromYesNoValue(value: unknown): 'yes' | 'no' | 'unknown' | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (s === 'نعم' || s.toLowerCase() === 'yes') return 'yes';
  if (s === 'لا' || s.toLowerCase() === 'no') return 'no';
  return 'unknown';
}

type CompareMode = 'gte' | 'lte' | 'eq';

/**
 * Compare actual vs required threshold.
 * FAIL/PASS only when both sides + threshold metadata exist.
 */
export function compareToThreshold(params: {
  actual: number | null | undefined;
  threshold: ResolvedThreshold | null;
  mode: CompareMode;
  occupancy?: string | null;
  missingActualLabel: string;
  missingThresholdMessage: string;
  passMessage: (actual: number, required: number) => string;
  failMessage: (actual: number, required: number) => string;
  extraInputs?: Record<string, string | number | boolean | null | undefined>;
}): ComplianceRuleEvaluation {
  const { actual, threshold, mode, occupancy } = params;
  const inputs = {
    actual,
    required: threshold?.value ?? null,
    ...(params.extraInputs || {}),
  };

  if (actual == null || !Number.isFinite(actual)) {
    return needsData(params.missingActualLabel, inputs, [params.missingActualLabel], {
      occupancy,
      actual_value: null,
      required_value: threshold?.value ?? null,
      unit: threshold?.unit ?? null,
      code_reference: threshold?.code_reference ?? null,
      condition: threshold?.condition ?? null,
    });
  }

  if (!threshold) {
    return needsData(params.missingThresholdMessage, inputs, ['code_threshold'], {
      occupancy,
      actual_value: actual,
      required_value: null,
      unit: null,
      code_reference: null,
      condition: null,
    });
  }

  const ok =
    mode === 'gte'
      ? actual + 1e-9 >= threshold.value
      : mode === 'lte'
        ? actual - 1e-9 <= threshold.value
        : Math.abs(actual - threshold.value) < 1e-9;

  const base = {
    inputs: { ...inputs, required: threshold.value, code_reference: threshold.code_reference },
    occupancy: occupancy ?? null,
    actual_value: actual,
    required_value: threshold.value,
    unit: threshold.unit,
    code_reference: threshold.code_reference,
    condition: threshold.condition,
    evidence: [
      evidence('measurement', 'actual', actual, 'project'),
      evidence('document', 'required_threshold', threshold.value, threshold.source, threshold.code_reference),
    ],
  };

  if (ok) {
    return {
      status: 'PASS',
      message: params.passMessage(actual, threshold.value),
      reason: params.passMessage(actual, threshold.value),
      ...base,
    };
  }
  return {
    status: 'FAIL',
    message: params.failMessage(actual, threshold.value),
    reason: params.failMessage(actual, threshold.value),
    remediation: 'صحّح القيمة أو وثّق Engineer Override مع سبب ومرجع كودي.',
    ...base,
  };
}

export function needsData(
  message: string,
  inputs: ComplianceRuleEvaluation['inputs'] = {},
  missing: string[] = [],
  extra: Partial<ComplianceRuleEvaluation> = {}
): ComplianceRuleEvaluation {
  return {
    status: 'NEEDS_DATA',
    message: missing.length ? `${message} (ناقص: ${missing.join('، ')})` : message,
    reason: message,
    inputs,
    missing_data: missing,
    evidence: missing.map((m) => evidence('none', m, null)),
    remediation: 'أدخل البيانات الهندسية الموثّقة أو قدّم Engineer Override مع سبب ومرجع كودي وهوية المهندس.',
    ...extra,
  };
}

export function passEval(
  message: string,
  opts: Partial<ComplianceRuleEvaluation> & {
    inputs?: ComplianceRuleEvaluation['inputs'];
    evidence?: ComplianceEvidence[];
  } = {}
): ComplianceRuleEvaluation {
  return {
    status: 'PASS',
    message,
    reason: opts.reason || message,
    inputs: opts.inputs || {},
    evidence: opts.evidence || [evidence('measurement', 'verified', true)],
    actual_value: opts.actual_value,
    required_value: opts.required_value,
    unit: opts.unit,
    occupancy: opts.occupancy,
    condition: opts.condition,
    code_reference: opts.code_reference,
    missing_data: opts.missing_data,
    remediation: opts.remediation,
  };
}

export function failEval(
  message: string,
  opts: Partial<ComplianceRuleEvaluation> & {
    inputs?: ComplianceRuleEvaluation['inputs'];
  } = {}
): ComplianceRuleEvaluation {
  return {
    status: 'FAIL',
    message,
    reason: opts.reason || message,
    inputs: opts.inputs || {},
    evidence: opts.evidence || [evidence('measurement', 'check', false)],
    remediation: opts.remediation || 'صحّح التصميم أو وثّق Override.',
    actual_value: opts.actual_value,
    required_value: opts.required_value,
    unit: opts.unit,
    occupancy: opts.occupancy,
    condition: opts.condition,
    code_reference: opts.code_reference,
    missing_data: opts.missing_data,
  };
}

export function naEval(
  message: string,
  opts: Partial<ComplianceRuleEvaluation> = {}
): ComplianceRuleEvaluation {
  return {
    status: 'N/A',
    message,
    reason: message,
    inputs: opts.inputs || {},
    evidence: opts.evidence || [evidence('none', 'not applicable')],
    actual_value: opts.actual_value,
    required_value: opts.required_value,
    unit: opts.unit,
    occupancy: opts.occupancy,
    condition: opts.condition,
    code_reference: opts.code_reference,
  };
}

export function assertPassOrFailHasTrace(ev: ComplianceRuleEvaluation): ComplianceResultStatus {
  if (ev.status === 'PASS' || ev.status === 'FAIL') {
    if (!ev.code_reference && !ev.required_value && ev.required_value !== 0) {
      // Soft guard for callers — prefer NEEDS_DATA over untraceable PASS/FAIL
      return 'NEEDS_DATA';
    }
  }
  return ev.status;
}
