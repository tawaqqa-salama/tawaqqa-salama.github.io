/**
 * Evidence helpers — missing evidence never implies PASS.
 */

import type { ComplianceEvidence, ComplianceEvidenceKind } from '@/lib/projects/compliance/types';

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
