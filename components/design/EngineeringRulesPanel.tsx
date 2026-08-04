'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assertEngineeringDecision,
  commitEngineeringDecision,
  decideEngineeringForm,
  explainEngineeringDecisions,
} from '@/lib/design-intelligence/decision-engine';
import { loadEngineeringRulesFromDb, syncSeedRulesToSupabase } from '@/lib/design-intelligence/rules-engine';
import type {
  EngineeringFieldKey,
  EngineeringFormState,
  EngineeringSelection,
} from '@/lib/design-intelligence/rules-types';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

type Props = {
  initial?: EngineeringSelection;
  onSelectionChange?: (selection: EngineeringSelection, form: EngineeringFormState) => void;
  /** When true, parent must not persist non-compliant selections */
  gateWorkflows?: boolean;
};

function modeBadge(
  mode: string,
  lang: string
): { label: string; className: string } {
  if (mode === 'locked' || mode === 'computed') {
    return {
      label: lang === 'ar' ? 'مقفل' : 'Locked',
      className: 'text-amber-900 bg-amber-50',
    };
  }
  if (mode === 'auto_selected') {
    return {
      label: lang === 'ar' ? 'تلقائي' : 'Auto',
      className: 'text-sky-900 bg-sky-50',
    };
  }
  return {
    label: lang === 'ar' ? 'اختياري متوافق' : 'Compliant pick',
    className: 'text-emerald-900 bg-emerald-50',
  };
}

export default function EngineeringRulesPanel({
  initial,
  onSelectionChange,
  gateWorkflows = true,
}: Props) {
  const { lang, t } = useLanguage();
  const [source, setSource] = useState<'seed' | 'supabase'>('seed');
  const [form, setForm] = useState<EngineeringFormState>(() => decideEngineeringForm(initial || {}));
  const [message, setMessage] = useState<string | null>(null);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  const label = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t]
  );

  useEffect(() => {
    void loadEngineeringRulesFromDb().then((res) => {
      setSource(res.source);
      const next = decideEngineeringForm(initial || {});
      setForm(next);
      onSelectionChange?.(next.selection, next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const decisions = useMemo(() => explainEngineeringDecisions(form.selection), [form.selection]);
  const assertion = useMemo(() => assertEngineeringDecision(form), [form]);

  const onChange = (fieldKey: string, value: string) => {
    setBlockMsg(null);
    const next = commitEngineeringDecision(
      form.selection,
      fieldKey as EngineeringFieldKey,
      value || null
    );
    const blocked = next.violations.find((v) => v.field_key === fieldKey);
    if (blocked && next.selection[fieldKey as EngineeringFieldKey] === form.selection[fieldKey as EngineeringFieldKey]) {
      setBlockMsg(blocked.message);
    }
    setForm(next);
    if (gateWorkflows) {
      const gate = assertEngineeringDecision(next);
      if (!gate.ok && next.violations.length) {
        // Still propagate — parent can refuse to advance; selection stays engine-sanitized
      }
    }
    onSelectionChange?.(next.selection, next);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-900/15 bg-gradient-to-br from-emerald-50/80 to-white p-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800/70">
              {label('design.decision.badge', 'Engineering Decision Engine')}
            </p>
            <h2 className="font-bold text-gray-900 text-lg mt-0.5">
              {label('design.decision.title', 'محرك القرار الهندسي')}
            </h2>
            <p className="text-xs text-gray-600 mt-1 max-w-2xl">
              {label(
                'design.decision.subtitle',
                'Active controller — not a suggestion assistant. Rules Engine is the source of truth. Invalid SBC/NFPA/Civil Defense/company combinations are blocked. Dependent fields auto-fill and lock with explanations.'
              )}
            </p>
          </div>
          <div className="text-[11px] text-gray-500 space-y-1 text-left">
            <div>
              {label('design.rules.source', 'Rules source')}:{' '}
              <span className="font-semibold text-emerald-800">{source}</span>
            </div>
            <button
              type="button"
              className="underline"
              onClick={() => {
                void syncSeedRulesToSupabase().then((r) =>
                  setMessage(r.ok ? `Synced ${r.count} rules to database.` : r.error || 'Sync failed')
                );
              }}
            >
              Sync seed → Supabase
            </button>
          </div>
        </div>

        <div
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
            assertion.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {lang === 'ar' ? assertion.summary_ar : assertion.summary_en}
          {!assertion.ok && assertion.missingRequired.length ? (
            <span className="font-normal ms-1">
              (
              {assertion.missingRequired
                .map((m) => (lang === 'ar' ? m.label_ar : m.label_en))
                .join(' · ')}
              )
            </span>
          ) : null}
        </div>

        {message ? <p className="text-xs text-emerald-800">{message}</p> : null}
        {blockMsg ? (
          <p className="text-xs text-rose-800 font-semibold">⛔ {blockMsg}</p>
        ) : null}
        {form.violations.length ? (
          <ul className="text-xs text-rose-700 list-disc ps-4">
            {form.violations.map((v) => (
              <li key={`${v.field_key}-${v.message}`}>
                {v.field_key}: {v.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {form.fields
          .filter((f) => f.visible)
          .map((field) => {
            const title = lang === 'ar' ? field.label_ar : field.label_en;
            const reason =
              lang === 'ar'
                ? field.decision_reason_ar || field.explanation_ar || field.explanation
                : field.decision_reason_en || field.explanation;
            const badge = modeBadge(field.control_mode, lang);
            return (
              <div
                key={field.field_key}
                className={`rounded-xl border p-3 ${
                  field.locked
                    ? 'bg-slate-50 border-slate-200'
                    : field.auto_selected
                      ? 'bg-sky-50/40 border-sky-100'
                      : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-sm font-semibold text-gray-900">{title}</label>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>

                {field.value_kind === 'select' ? (
                  <select
                    disabled={field.locked}
                    value={String(Array.isArray(field.value) ? field.value[0] || '' : field.value || '')}
                    onChange={(e) => onChange(field.field_key, e.target.value)}
                    className="w-full border rounded-lg px-2.5 py-2 text-sm disabled:bg-slate-100 disabled:text-gray-700 disabled:cursor-not-allowed"
                  >
                    <option value="">—</option>
                    {field.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {lang === 'ar' ? o.label_ar : o.label_en}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-gray-800 whitespace-pre-wrap border rounded-lg px-2.5 py-2 bg-white min-h-[2.5rem]">
                    {Array.isArray(field.value)
                      ? field.value.join(' · ')
                      : field.value || '—'}
                  </div>
                )}

                {reason ? (
                  <p className="text-[11px] text-gray-700 mt-2">
                    <span className="font-semibold text-gray-900">
                      {lang === 'ar' ? 'السبب: ' : 'Why: '}
                    </span>
                    {reason}
                  </p>
                ) : null}
                {field.code_refs.length ? (
                  <p className="text-[10px] font-semibold text-emerald-900 mt-1">
                    {field.code_refs.join(' · ')}
                  </p>
                ) : null}
                {field.matched_rule_codes.length ? (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Rules: {field.matched_rule_codes.join(', ')}
                  </p>
                ) : null}
              </div>
            );
          })}
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-2">
        <h3 className="font-bold text-sm">
          {label('design.decision.rationale', 'Decision rationale (engine-controlled)')}
        </h3>
        <p className="text-[11px] text-gray-500">
          {lang === 'ar' ? decisions.note_ar : decisions.note_en}
        </p>
        <ul className="text-xs space-y-2 max-h-64 overflow-auto">
          {decisions.decisions.slice(0, 12).map((d) => (
            <li key={d.field_key} className="border rounded-lg px-3 py-2">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{lang === 'ar' ? d.label_ar : d.label_en}</span>
                <span className="text-[10px] uppercase text-gray-500">{d.control_mode}</span>
              </div>
              <div className="text-gray-700 mt-0.5">
                {d.value == null
                  ? '—'
                  : Array.isArray(d.value)
                    ? d.value.join(', ')
                    : d.value}
              </div>
              <div className="text-[10px] text-gray-600 mt-1">
                {lang === 'ar' ? d.reason_ar : d.reason_en}
              </div>
              {d.code_refs.length ? (
                <div className="text-[10px] text-emerald-800 mt-1">{d.code_refs.join(' · ')}</div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
