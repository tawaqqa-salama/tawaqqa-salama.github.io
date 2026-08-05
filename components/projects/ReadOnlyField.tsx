'use client';

type ReadOnlyFieldProps = {
  label: string;
  value?: string | null;
  dir?: 'ltr' | 'rtl';
  hint?: string;
};

/** Display-only field for values inherited from Sales / earlier stages. */
export function ReadOnlyField({ label, value, dir, hint }: ReadOnlyFieldProps) {
  const text = String(value ?? '').trim() || '—';
  return (
    <div className="text-sm block">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <div
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
        dir={dir}
      >
        {text}
      </div>
      {hint ? <p className="mt-1 text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}
