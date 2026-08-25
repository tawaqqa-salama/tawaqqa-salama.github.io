'use client';

import { useMemo } from 'react';
import {
  UNDER_CONSTRUCTION_SOURCE_LABELS,
  UNDER_CONSTRUCTION_STUDY_GROUPS,
  type UnderConstructionStudy,
  type UnderConstructionStudySystem,
  type UnderConstructionSystemKey,
  resolveUnderConstructionProjectReferences,
  resolveUnderConstructionSystemReferences,
} from '@/lib/projects/under-construction-study';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  study?: UnderConstructionStudy;
  saving: boolean;
  onChange: (next: UnderConstructionStudy | undefined) => void;
  onSave: (next: UnderConstructionStudy | undefined) => Promise<boolean>;
};

function trimOrUndefined(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

function noEmptyStudy(params: {
  systems: UnderConstructionStudy['systems'];
  project_description?: string;
  code_references?: UnderConstructionStudy['code_references'];
  general_implementation_notes?: string;
}): UnderConstructionStudy | undefined {
  const hasSystems = Object.keys(params.systems).length > 0;
  const hasCodes = Boolean(params.code_references?.length);
  if (!hasSystems && !params.project_description && !hasCodes && !params.general_implementation_notes) {
    return undefined;
  }
  return {
    version: 1,
    systems: params.systems,
    ...(params.project_description ? { project_description: params.project_description } : {}),
    ...(hasCodes ? { code_references: params.code_references } : {}),
    ...(params.general_implementation_notes
      ? { general_implementation_notes: params.general_implementation_notes }
      : {}),
  };
}

export default function UnderConstructionStudySection({
  client,
  data,
  study,
  saving,
  onChange,
  onSave,
}: Props) {
  const projectReferences = useMemo(
    () => resolveUnderConstructionProjectReferences(client, data),
    [client, data]
  );
  const systems = study?.systems || {};
  const root = {
    systems,
    project_description: study?.project_description,
    code_references: study?.code_references,
    general_implementation_notes: study?.general_implementation_notes,
  };
  const updateRoot = (patch: Partial<Omit<UnderConstructionStudy, 'version'>>) => {
    const next = { ...root, ...patch };
    onChange(noEmptyStudy(next));
  };
  const updateSystem = (
    key: UnderConstructionSystemKey,
    updater: (current: UnderConstructionStudySystem) => UnderConstructionStudySystem
  ) => {
    updateRoot({ systems: { ...systems, [key]: updater(systems[key] || {}) } });
  };
  const clearSystem = (key: UnderConstructionSystemKey) => {
    const next = { ...systems };
    delete next[key];
    updateRoot({ systems: next });
  };

  return (
    <section className="space-y-5" dir="rtl" aria-labelledby="under-construction-study-title">
      <header className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="under-construction-study-title" className="text-base font-bold text-indigo-950">
                دراسة المشروع قيد الإنشاء
              </h3>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-indigo-800">
                UNDER_CONSTRUCTION · دراسة تصميمية
              </span>
            </div>
            <p className="mt-2 max-w-4xl text-xs leading-6 text-indigo-950">
              يوثق هذا القسم المتطلبات الكودية والحل الهندسي المختار ومراجع المخططات والحسابات
              وتعليمات التنفيذ. القيم الموروثة أدناه تقرأ من مصادر المشروع والتصميم فقط ولا تصبح
              مصدرًا جديدًا للحقيقة داخل الدراسة.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave(study)}
            className="shrink-0 rounded-xl bg-indigo-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ دراسة المشروع'}
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-6 text-sky-950">
        هذا النموذج ليس فحص موقع قائم: لا يستخدم الوضع الراهن أو الفجوة أو قرار المطابقة. لا ينشئ
        حكمًا أو حلًا أو متطلبًا تلقائيًا، ولا يفتح بوابة Workflow أو يعتمد أي تقرير.
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h4 className="font-bold text-slate-900">بيانات المشروع والأكواد والمراجع</h4>
          <p className="mt-1 text-xs text-slate-500">حقائق المشروع معروضة من مصادرها؛ لا تُعاد كتابتها من أجل الدراسة.</p>
        </div>
        <div className="space-y-4 p-3 sm:p-4">
          <SourceReferences references={projectReferences} empty="لا توجد حقائق مشروع موثقة بعد." />
          <TextAreaField
            label="وصف الدراسة / المشروع"
            value={study?.project_description || ''}
            onChange={(value) => updateRoot({ project_description: trimOrUndefined(value) })}
            placeholder="وصف هندسي يقرره المهندس لنطاق الدراسة، دون نسخ بيانات المشروع الأساسية"
          />
          <CodeReferencesEditor
            items={study?.code_references || []}
            onChange={(code_references) => updateRoot({ code_references })}
          />
        </div>
      </section>

      {UNDER_CONSTRUCTION_STUDY_GROUPS.filter((group) => group.id !== 'project').map((group) => (
        <section key={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h4 className="font-bold text-slate-900">{group.label}</h4>
            <p className="mt-1 text-xs text-slate-500">المتطلب ← الحل/التصميم ← مرجع المخطط أو الحساب ← ملاحظات التنفيذ.</p>
          </div>
          <div className="space-y-3 p-3 sm:p-4">
            {group.systems.map((definition) => (
              <StudySystemCard
                key={definition.key}
                label={definition.label}
                systemKey={definition.key}
                system={systems[definition.key] || {}}
                references={resolveUnderConstructionSystemReferences(data, definition.key)}
                onChange={(updater) => updateSystem(definition.key, updater)}
                onClear={() => clearSystem(definition.key)}
              />
            ))}
          </div>
        </section>
      ))}

      <TextAreaField
        label="ملاحظات تنفيذ عامة"
        value={study?.general_implementation_notes || ''}
        onChange={(value) => updateRoot({ general_implementation_notes: trimOrUndefined(value) })}
        placeholder="تعليمات تنفيذ أو تنسيق عامة يقررها المهندس لهذه الدراسة"
      />
    </section>
  );
}

function StudySystemCard({
  label,
  systemKey,
  system,
  references,
  onChange,
  onClear,
}: {
  label: string;
  systemKey: UnderConstructionSystemKey;
  system: UnderConstructionStudySystem;
  references: ReturnType<typeof resolveUnderConstructionSystemReferences>;
  onChange: (updater: (current: UnderConstructionStudySystem) => UnderConstructionStudySystem) => void;
  onClear: () => void;
}) {
  const updateText = (key: keyof UnderConstructionStudySystem, value: string) =>
    onChange((current) => ({ ...current, [key]: trimOrUndefined(value) }));
  const applicableLabel = system.applicable === true ? 'منطبق' : system.applicable === false ? 'غير منطبق' : 'لم يُقرر';

  return (
    <details className="rounded-xl border border-slate-200 bg-white" data-system-key={systemKey}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-right">
        <div>
          <p className="font-bold text-slate-900">{label}</p>
          <p className="mt-1 text-xs text-slate-500">
            {references.length ? `${references.length} قيمة مرجعية متاحة للقراءة` : 'لا توجد قيمة مصدرية متاحة بعد'}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{applicableLabel}</span>
      </summary>
      <div className="space-y-5 border-t border-slate-100 p-3 sm:p-4">
        <section className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
          <SectionTitle title="قيم مرجعية من المصادر الكانونية" subtitle="للقراءة فقط؛ لا تُنسخ أو تحفظ داخل الدراسة." />
          <SourceReferences references={references} empty="لا توجد قيمة تصميم أو مخطط أو حساب مرتبطة بهذا النظام حاليًا." />
        </section>

        <section className="space-y-3">
          <SectionTitle title="قرار الدراسة والحل الهندسي" subtitle="حقول مهندس صريحة، بلا اقتراح أو نتيجة تلقائية." />
          <SelectField
            label="هل النظام منطبق على المشروع؟"
            value={system.applicable === undefined ? '' : system.applicable ? 'yes' : 'no'}
            onChange={(value) => onChange((current) => ({ ...current, applicable: value === '' ? undefined : value === 'yes' }))}
            options={[
              { value: 'yes', label: 'منطبق' },
              { value: 'no', label: 'غير منطبق' },
            ]}
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <TextAreaField
              label="المتطلب حسب الكود / التصميم"
              value={system.code_requirement || ''}
              onChange={(value) => updateText('code_requirement', value)}
              placeholder="صياغة المتطلب الذي يقرره المهندس"
            />
            <TextAreaField
              label="الحل أو التصميم المختار"
              value={system.selected_solution || ''}
              onChange={(value) => updateText('selected_solution', value)}
              placeholder="الحل الهندسي المختار دون إعادة إدخال قيم المصدر"
            />
            <TextField
              label="مرجع الكود"
              value={system.code_reference || ''}
              onChange={(value) => updateText('code_reference', value)}
              placeholder="الكود أو البند أو المرجع المعتمد"
            />
            <TextField
              label="مرجع المخطط / التصميم"
              value={system.drawing_reference || ''}
              onChange={(value) => updateText('drawing_reference', value)}
              placeholder="رقم لوحة أو إصدار مخطط أو مرجع تصميم"
            />
            <TextField
              label="مرجع الحساب الهيدروليكي عند الحاجة"
              value={system.calculation_reference || ''}
              onChange={(value) => updateText('calculation_reference', value)}
              placeholder="مرجع حساب قائم؛ لا تدخل التدفق أو الضغط مرة أخرى"
            />
            <TextAreaField
              label="ملاحظات التنفيذ"
              value={system.implementation_note || ''}
              onChange={(value) => updateText('implementation_note', value)}
              placeholder="تعليمات تنفيذ أو تنسيق يقررها المهندس"
            />
          </div>
        </section>
        {Object.keys(system).length ? <div className="flex justify-end"><button type="button" onClick={onClear} className="text-xs font-semibold text-slate-500 underline">مسح بيانات هذا النظام فقط</button></div> : null}
      </div>
    </details>
  );
}

function SourceReferences({
  references,
  empty,
}: {
  references: ReturnType<typeof resolveUnderConstructionSystemReferences>;
  empty: string;
}) {
  if (!references.length) return <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs leading-5 text-slate-500">{empty}</p>;
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {references.map((item, index) => (
        <article key={`${item.label}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-700">{item.label}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-900">{item.value}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">المصدر: {UNDER_CONSTRUCTION_SOURCE_LABELS[item.source]}</span>
            {item.reference ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">{item.reference}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function CodeReferencesEditor({
  items,
  onChange,
}: {
  items: NonNullable<UnderConstructionStudy['code_references']>;
  onChange: (next: UnderConstructionStudy['code_references']) => void;
}) {
  const update = (id: string, key: 'title' | 'reference' | 'note', value: string) =>
    onChange(items.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-semibold text-slate-700">مراجع الكود أو الدراسة</p><p className="mt-1 text-[11px] text-slate-500">تُضاف يدويًا فقط عند اعتماد المرجع للمشروع.</p></div>
        <button type="button" onClick={() => onChange([...items, { id: `code-ref-${Date.now()}`, title: '', reference: '' }])} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700">+ إضافة مرجع</button>
      </div>
      {items.length ? <div className="space-y-2">{items.map((item) => <div key={item.id} className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_1fr_auto]"><input value={item.title} onChange={(event) => update(item.id, 'title', event.target.value)} placeholder="اسم الكود أو المرجع" className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm" /><input value={item.reference} onChange={(event) => update(item.id, 'reference', event.target.value)} placeholder="رقم البند أو الإصدار" className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm" /><input value={item.note || ''} onChange={(event) => update(item.id, 'note', event.target.value)} placeholder="ملاحظة اختيارية" className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm" /><button type="button" onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))} className="rounded-lg px-2 py-2 text-xs font-semibold text-rose-700">حذف</button></div>)}</div> : <p className="text-xs leading-5 text-slate-500">لا توجد مراجع يدوية مسجلة بعد.</p>}
    </section>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h5 className="text-sm font-bold text-slate-900">{title}</h5><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p></div>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"><option value="">لم يُدخل قرار</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" /></label>;
}

function TextAreaField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-800" /></label>;
}
