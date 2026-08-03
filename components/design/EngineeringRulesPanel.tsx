'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyEngineeringChange,
  evaluateEngineeringForm,
  loadEngineeringRulesFromDb,
  recommendFromRules,
  syncSeedRulesToSupabase,
} from '@/lib/design-intelligence/rules-engine';
import type {
  EngineeringFieldKey,
  EngineeringFormState,
  EngineeringSelection,
} from '@/lib/design-intelligence/rules-types';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

type Props = {
  initial?: EngineeringSelection;
  onSelectionChange?: (selection: EngineeringSelection, form: EngineeringFormState) => void;
};

export default function EngineeringRulesPanel({ initial, onSelectionChange }: Props) {
  const { lang, t } = useLanguage();
  const [source, setSource] = useState<'seed' | 'supabase'>('seed');
  const [form, setForm] = useState<EngineeringFormState>(() => evaluateEngineeringForm(initial || {}));
  const [message, setMessage] = useState<string | null>(null);

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
      const next = evaluateEngineeringForm(initial || {});
      setForm(next);
      onSelectionChange?.(next.selection, next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const aiView = useMemo(() => recommendFromRules(form.selection), [form.selection]);

  const onChange = (fieldKey: string, value: string) => {
    const next = applyEngineeringChange(form.selection, fieldKey as EngineeringFieldKey, value || null);
    setForm(next);
    onSelectionChange?.(next.selection, next);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-bold text-gray-900">
              {label('design.rules.title', 'Engineering Rules Engine')}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {label(
                'design.rules.subtitle',
                'Every field is controlled by the rules database. Invalid combinations are hidden. Locked values show code references. AI may only explain valid options.'
              )}
            </p>
          </div>
          <div className="text-[11px] text-gray-500 space-y-1 text-left">
            <div>
              Rules source:{' '}
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
        {message ? <p className="text-xs text-emerald-800">{message}</p> : null}
        {form.violations.length ? (
          <ul className="text-xs text-rose-700 list-disc pr-4">
            {form.violations.map((v) => (
              <li key={v.field_key}>
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
            const explain = lang === 'ar' ? field.explanation_ar || field.explanation : field.explanation;
            return (
              <div
                key={field.field_key}
                className={`rounded-xl border p-3 ${
                  field.locked ? 'bg-slate-50 border-slate-200' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-sm font-semibold text-gray-900">{title}</label>
                  {field.locked ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                      Locked
                    </span>
                  ) : null}
                </div>

                {field.value_kind === 'select' ? (
                  <select
                    disabled={field.locked}
                    value={String(Array.isArray(field.value) ? field.value[0] || '' : field.value || '')}
                    onChange={(e) => onChange(field.field_key, e.target.value)}
                    className="w-full border rounded-lg px-2.5 py-2 text-sm disabled:bg-slate-100 disabled:text-gray-700"
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

                {explain ? <p className="text-[11px] text-gray-600 mt-2">{explain}</p> : null}
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
          {label('design.rules.ai', 'AI recommendations (rules-bound)')}
        </h3>
        <p className="text-[11px] text-gray-500">{aiView.note}</p>
        <ul className="text-xs space-y-2">
          {aiView.recommendations
            .filter((r) => r.valid_options.length || r.locked_value != null)
            .slice(0, 8)
            .map((r) => (
              <li key={r.field_key} className="border rounded-lg px-3 py-2">
                <div className="font-semibold">{r.label_en}</div>
                {r.locked_value != null ? (
                  <div className="text-amber-900">
                    Locked: {Array.isArray(r.locked_value) ? r.locked_value.join(', ') : r.locked_value}
                  </div>
                ) : (
                  <div>
                    Valid options:{' '}
                    {r.valid_options.map((o) => (lang === 'ar' ? o.label_ar : o.label_en)).join(' · ')}
                  </div>
                )}
                <div className="text-[10px] text-emerald-800 mt-1">{r.code_refs.join(' · ')}</div>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
