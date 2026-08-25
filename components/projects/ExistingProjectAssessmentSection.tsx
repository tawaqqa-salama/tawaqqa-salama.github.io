'use client';

import { useMemo } from 'react';
import {
  EXISTING_ASSESSMENT_COMPLIANCE_STATUS_VALUES,
  EXISTING_ASSESSMENT_CONDITION_LABELS,
  EXISTING_ASSESSMENT_GROUPS,
  EXISTING_ASSESSMENT_PRESENCE_LABELS,
  EXISTING_ASSESSMENT_PRIORITY_LABELS,
  EXISTING_ASSESSMENT_STATUS_LABELS,
  type ExistingAssessmentComplianceStatus,
  type ExistingAssessmentCondition,
  type ExistingAssessmentPresence,
  type ExistingAssessmentPriority,
  type ExistingAssessmentSystem,
  type ExistingAssessmentSystemKey,
  type ExistingProjectAssessment,
  resolveExistingAssessmentRequirement,
} from '@/lib/projects/existing-project-assessment';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

type Props = {
  data: ProjectEngineeringData;
  assessment?: ExistingProjectAssessment;
  saving: boolean;
  onChange: (next: ExistingProjectAssessment | undefined) => void;
  onSave: (next: ExistingProjectAssessment | undefined) => Promise<boolean>;
};

const PRESENCE_OPTIONS: Array<{ value: ExistingAssessmentPresence; label: string }> = Object.entries(
  EXISTING_ASSESSMENT_PRESENCE_LABELS
).map(([value, label]) => ({ value: value as ExistingAssessmentPresence, label }));

const CONDITION_OPTIONS: Array<{ value: ExistingAssessmentCondition; label: string }> = Object.entries(
  EXISTING_ASSESSMENT_CONDITION_LABELS
).map(([value, label]) => ({ value: value as ExistingAssessmentCondition, label }));

const PRIORITY_OPTIONS: Array<{ value: ExistingAssessmentPriority; label: string }> = Object.entries(
  EXISTING_ASSESSMENT_PRIORITY_LABELS
).map(([value, label]) => ({ value: value as ExistingAssessmentPriority, label }));

const STATUS_OPTIONS: Array<{ value: ExistingAssessmentComplianceStatus; label: string }> =
  EXISTING_ASSESSMENT_COMPLIANCE_STATUS_VALUES.map((value) => ({
    value,
    label: EXISTING_ASSESSMENT_STATUS_LABELS[value],
  }));

function trimOrUndefined(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

function emptyIfNoFields(
  systems: ExistingProjectAssessment['systems']
): ExistingProjectAssessment | undefined {
  return Object.keys(systems).length ? { version: 1, systems } : undefined;
}

export default function ExistingProjectAssessmentSection({
  data,
  assessment,
  saving,
  onChange,
  onSave,
}: Props) {
  const grouped = useMemo(() => EXISTING_ASSESSMENT_GROUPS, []);
  const systems = assessment?.systems || {};

  const updateSystem = (
    key: ExistingAssessmentSystemKey,
    updater: (current: ExistingAssessmentSystem) => ExistingAssessmentSystem
  ) => {
    const current = systems[key] || {};
    const nextSystem = updater(current);
    const nextSystems = { ...systems, [key]: nextSystem };
    onChange(emptyIfNoFields(nextSystems));
  };

  const removeSystem = (key: ExistingAssessmentSystemKey) => {
    const nextSystems = { ...systems };
    delete nextSystems[key];
    onChange(emptyIfNoFields(nextSystems));
  };

  return (
    <section className="space-y-5" dir="rtl" aria-labelledby="existing-assessment-title">
      <header className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="existing-assessment-title" className="text-base font-bold text-emerald-950">
                تقييم الموقع القائم
              </h3>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-emerald-800">
                EXISTING · تقييم هندسي
              </span>
            </div>
            <p className="mt-2 max-w-4xl text-xs leading-6 text-emerald-950">
              يسجل هذا القسم الوضع الراهن الذي لاحظه المهندس، ثم يعرض متطلبات التصميم أو المخطط
              الكانونية عند توفرها للقراءة فقط. لا تُنسخ المتطلبات إلى مصدر جديد ولا تنتج المنصة
              حكم مطابقة أو فجوة أو إجراءً تلقائيًا.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave(assessment)}
            className="shrink-0 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ تقييم الموقع القائم'}
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-950">
        حالة المطابقة، الفجوة، الأولوية، والإجراء المطلوب هي قرارات مهندس صريحة. اترك الحقل
        فارغًا إذا لم تُستكمل المراجعة؛ لا تستخدم هذه الشاشة لفتح بوابة Workflow أو لاعتماد تقرير.
      </div>

      {grouped.map((group) => (
        <section key={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h4 className="font-bold text-slate-900">{group.label}</h4>
            <p className="mt-1 text-xs text-slate-500">
              افصل دائمًا بين الموجود فعليًا والمتطلب المرجعي والفجوة قبل تسجيل قرار المطابقة.
            </p>
          </div>
          <div className="space-y-3 p-3 sm:p-4">
            {group.systems.map((definition) => {
              const system = systems[definition.key] || {};
              const requirement = resolveExistingAssessmentRequirement(data, definition.key);
              return (
                <AssessmentSystemCard
                  key={definition.key}
                  label={definition.label}
                  systemKey={definition.key}
                  system={system}
                  requirement={requirement}
                  onChange={(updater) => updateSystem(definition.key, updater)}
                  onClear={() => removeSystem(definition.key)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

function AssessmentSystemCard({
  label,
  systemKey,
  system,
  requirement,
  onChange,
  onClear,
}: {
  label: string;
  systemKey: ExistingAssessmentSystemKey;
  system: ExistingAssessmentSystem;
  requirement: ReturnType<typeof resolveExistingAssessmentRequirement>;
  onChange: (updater: (current: ExistingAssessmentSystem) => ExistingAssessmentSystem) => void;
  onClear: () => void;
}) {
  const updateText = (key: keyof ExistingAssessmentSystem, value: string) =>
    onChange((current) => ({ ...current, [key]: trimOrUndefined(value) }));
  const statusClass = system.compliance_status
    ? system.compliance_status === 'COMPLIANT'
      ? 'bg-emerald-50 text-emerald-800'
      : system.compliance_status === 'NON_COMPLIANT'
        ? 'bg-rose-50 text-rose-800'
        : 'bg-amber-50 text-amber-900'
    : 'bg-slate-100 text-slate-600';

  return (
    <details className="rounded-xl border border-slate-200 bg-white" data-system-key={systemKey}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-right">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{label}</p>
          <p className="mt-1 text-xs text-slate-500">
            {requirement ? `متطلب مرجعي متاح من ${requirement.source}` : 'لا يتوفر متطلب كانوني مرتبط بعد'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusClass}`}>
          {system.compliance_status ? EXISTING_ASSESSMENT_STATUS_LABELS[system.compliance_status] : 'لم تُقيّم'}
        </span>
      </summary>

      <div className="space-y-5 border-t border-slate-100 p-3 sm:p-4">
        <section className="space-y-3">
          <SectionTitle title="الوضع الراهن" subtitle="إدخال المهندس من المعاينة الفعلية فقط" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SelectField
              label="هل النظام منطبق؟"
              value={system.applicable === undefined ? '' : system.applicable ? 'yes' : 'no'}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  applicable: value === '' ? undefined : value === 'yes',
                }))
              }
              options={[
                { value: 'yes', label: 'منطبق' },
                { value: 'no', label: 'غير منطبق' },
              ]}
            />
            <SelectField
              label="وجود النظام"
              value={system.existing_presence || ''}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  existing_presence: value ? (value as ExistingAssessmentPresence) : undefined,
                }))
              }
              options={PRESENCE_OPTIONS}
            />
            <SelectField
              label="حالة النظام"
              value={system.condition || ''}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  condition: value ? (value as ExistingAssessmentCondition) : undefined,
                }))
              }
              options={CONDITION_OPTIONS}
            />
          </div>
          <TextAreaField
            label="التكوين المرصود"
            value={system.observed_configuration || ''}
            onChange={(value) => updateText('observed_configuration', value)}
            placeholder="وصف الترتيب أو الطراز أو التوزيع القائم كما تمت معاينته"
          />
          <ObservedSpecsEditor
            specs={system.observed_specs || []}
            onChange={(observed_specs) => onChange((current) => ({ ...current, observed_specs }))}
          />
          <TextAreaField
            label="ملاحظة المعاينة"
            value={system.observation || ''}
            onChange={(value) => updateText('observation', value)}
            placeholder="اكتب الملاحظة الواقعية دون صياغة حكم تلقائي"
          />
          <TextField
            label="معرّفات الأدلة المرتبطة"
            value={(system.evidence_ids || []).join('، ')}
            onChange={(value) =>
              onChange((current) => ({
                ...current,
                evidence_ids: value
                  .split(/[،,]/)
                  .map((item) => item.trim())
                  .filter(Boolean),
              }))
            }
            placeholder="معرّف دليل واحد أو أكثر، مفصول بفاصلة"
          />
        </section>

        <section className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
          <SectionTitle title="المطلوب حسب الكود / التصميم" subtitle="قراءة مرجعية فقط؛ لا تُنسخ القيم الموجودة في المصادر الكانونية" />
          {requirement ? (
            <div className="space-y-2 rounded-lg border border-indigo-100 bg-white p-3">
              <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">{requirement.text}</p>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">المصدر: {requirement.source}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">المرجع: {requirement.reference}</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <TextAreaField
                label="نص المتطلب المرجعي"
                value={system.required_text || ''}
                onChange={(value) => updateText('required_text', value)}
                placeholder="يدخل فقط عند عدم وجود قيمة تصميم/مخطط كانونية"
              />
              <TextField
                label="مصدر المتطلب"
                value={system.requirement_source || ''}
                onChange={(value) => updateText('requirement_source', value)}
                placeholder="مثال: مرجع كودي معتمد"
              />
              <TextField
                label="مرجع المتطلب"
                value={system.requirement_reference || ''}
                onChange={(value) => updateText('requirement_reference', value)}
                placeholder="الفصل أو البند أو مستند المشروع"
              />
            </div>
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle title="الفجوة وحالة المطابقة والإجراء" subtitle="قرارات مهندس صريحة؛ لا توجد قيمة افتراضية" />
          <TextAreaField
            label="الفجوة"
            value={system.gap_text || ''}
            onChange={(value) => updateText('gap_text', value)}
            placeholder="الفرق المحدد بين الوضع الراهن والمتطلب، إن تم التحقق"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SelectField
              label="حالة المطابقة"
              value={system.compliance_status || ''}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  compliance_status: value ? (value as ExistingAssessmentComplianceStatus) : undefined,
                }))
              }
              options={STATUS_OPTIONS}
            />
            <SelectField
              label="الأولوية"
              value={system.priority || ''}
              onChange={(value) =>
                onChange((current) => ({
                  ...current,
                  priority: value ? (value as ExistingAssessmentPriority) : undefined,
                }))
              }
              options={PRIORITY_OPTIONS}
            />
            <TextField
              label="الجهة المسؤولة"
              value={system.responsible_party || ''}
              onChange={(value) => updateText('responsible_party', value)}
              placeholder="المالك / المقاول / جهة تشغيل"
            />
          </div>
          <TextAreaField
            label="الإجراء المطلوب"
            value={system.action_text || ''}
            onChange={(value) => updateText('action_text', value)}
            placeholder="إجراء واضح يقرره المهندس بعد اكتمال التقييم"
          />
          <TextField
            label="معرّف التوصية المرتبط (اختياري)"
            value={system.recommendation_id || ''}
            onChange={(value) =>
              onChange((current) => ({ ...current, recommendation_id: trimOrUndefined(value) || null }))
            }
            placeholder="مرجع توصية قائم فقط؛ لا تنشئ توصية تلقائيًا"
          />
        </section>

        {Object.keys(system).length ? (
          <div className="flex justify-end">
            <button type="button" onClick={onClear} className="text-xs font-semibold text-slate-500 underline">
              مسح تقييم هذا النظام فقط
            </button>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h5 className="text-sm font-bold text-slate-900">{title}</h5>
      <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
        <option value="">لم يُدخل قرار</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" />
    </label>
  );
}

function TextAreaField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-800" />
    </label>
  );
}

function ObservedSpecsEditor({ specs, onChange }: { specs: NonNullable<ExistingAssessmentSystem['observed_specs']>; onChange: (next: ExistingAssessmentSystem['observed_specs']) => void }) {
  const update = (id: string, key: 'label' | 'value', value: string) =>
    onChange(specs.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">المواصفات المرصودة</p>
        <button type="button" onClick={() => onChange([...specs, { id: `spec-${Date.now()}`, label: '', value: '' }])} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700">
          + إضافة مواصفة
        </button>
      </div>
      {specs.length ? (
        <div className="space-y-2">
          {specs.map((item) => (
            <div key={item.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input value={item.label} onChange={(event) => update(item.id, 'label', event.target.value)} placeholder="اسم المواصفة" className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm" />
              <input value={item.value} onChange={(event) => update(item.id, 'value', event.target.value)} placeholder="القيمة المرصودة" className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm" />
              <button type="button" onClick={() => onChange(specs.filter((candidate) => candidate.id !== item.id))} className="rounded-lg px-2 py-2 text-xs font-semibold text-rose-700">حذف</button>
            </div>
          ))}
        </div>
      ) : <p className="text-xs leading-5 text-slate-500">لا توجد مواصفات مرصودة مسجلة بعد.</p>}
    </div>
  );
}
