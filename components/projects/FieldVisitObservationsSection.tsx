'use client';

import type {
  FieldVisitObservation,
  FieldVisitObservationCategory,
  FieldVisitObservationSeverity,
  FieldVisitObservationStatus,
} from '@/lib/types/project-reports';
import {
  createFieldVisitObservation,
  FIELD_VISIT_OBSERVATION_CATEGORIES,
  FIELD_VISIT_OBSERVATION_SEVERITIES,
  FIELD_VISIT_OBSERVATION_STATUSES,
} from '@/lib/projects/field-visit-observations';

type FieldVisitObservationsSectionProps = {
  observations: FieldVisitObservation[];
  disabled?: boolean;
  linkedEvidenceCounts?: Record<string, number>;
  onAddEvidenceToObservation?: (observationId: string) => void;
  onChange: (observations: FieldVisitObservation[]) => void;
};

function newObservationId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `visit-observation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function FieldVisitObservationsSection({
  observations,
  disabled = false,
  linkedEvidenceCounts = {},
  onAddEvidenceToObservation,
  onChange,
}: FieldVisitObservationsSectionProps) {
  const update = (id: string, partial: Partial<FieldVisitObservation>) => {
    onChange(observations.map((item) => (item.id === id ? { ...item, ...partial } : item)));
  };

  return (
    <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h5 className="text-sm font-bold text-amber-950">الملاحظات الميدانية المنظمة</h5>
          <p className="mt-1 text-xs leading-5 text-amber-900">
            تسجل الملاحظة وموقعها وخطورتها والإجراء المطلوب ومسؤول المعالجة. لا يرفع هذا النموذج صوراً أو مرفقات ولا يغير حالة الزيارة أو Workflow تلقائياً.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...observations, createFieldVisitObservation(newObservationId())])}
          className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          + إضافة ملاحظة منظمة
        </button>
      </div>

      {observations.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-amber-200 bg-white/70 px-3 py-3 text-xs text-amber-900">
          لا توجد ملاحظات منظمة لهذه الزيارة حتى الآن. تبقى حقول النتائج والتوصيات التاريخية مستقلة ومحفوظة كما هي.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {observations.map((observation, index) => (
            <article key={observation.id} className="rounded-lg border border-amber-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-xs font-bold text-gray-800">ملاحظة #{index + 1}</p><p className="mt-1 text-[11px] text-gray-500">الأدلة المرتبطة: {linkedEvidenceCounts[observation.id] || 0}</p></div>
                <div className="flex flex-wrap items-center justify-end gap-2"><button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAddEvidenceToObservation?.(observation.id)}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  إضافة صورة / مرفق
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(observations.filter((item) => item.id !== observation.id))}
                  className="text-xs font-semibold text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  حذف الملاحظة
                </button></div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField
                  label="النظام / التصنيف"
                  value={observation.category}
                  disabled={disabled}
                  options={FIELD_VISIT_OBSERVATION_CATEGORIES}
                  onChange={(category) => update(observation.id, { category: category as FieldVisitObservationCategory })}
                />
                <SelectField
                  label="درجة الخطورة"
                  value={observation.severity}
                  disabled={disabled}
                  options={FIELD_VISIT_OBSERVATION_SEVERITIES}
                  onChange={(severity) => update(observation.id, { severity: severity as FieldVisitObservationSeverity })}
                />
                <SelectField
                  label="حالة المعالجة"
                  value={observation.status}
                  disabled={disabled}
                  options={FIELD_VISIT_OBSERVATION_STATUSES}
                  onChange={(status) => update(observation.id, { status: status as FieldVisitObservationStatus })}
                />
                <TextField
                  label="الموقع / النطاق"
                  value={observation.location}
                  disabled={disabled}
                  placeholder="مثال: غرفة المضخات — القبو"
                  onChange={(location) => update(observation.id, { location })}
                />
                <TextField
                  label="الجهة المسؤولة"
                  value={observation.responsible_party}
                  disabled={disabled}
                  placeholder="مثال: المقاول / إدارة المنشأة"
                  onChange={(responsible_party) => update(observation.id, { responsible_party })}
                />
                <TextField
                  label="تاريخ المعالجة المستهدف"
                  type="date"
                  value={observation.due_date || ''}
                  disabled={disabled}
                  onChange={(due_date) => update(observation.id, { due_date })}
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <TextAreaField
                  label="وصف الملاحظة"
                  value={observation.description}
                  disabled={disabled}
                  placeholder="اكتب الحالة التي لوحظت في الموقع بدقة."
                  onChange={(description) => update(observation.id, { description })}
                />
                <TextAreaField
                  label="الإجراء المطلوب"
                  value={observation.required_action}
                  disabled={disabled}
                  placeholder="حدد المعالجة أو الإجراء التصحيحي المطلوب."
                  onChange={(required_action) => update(observation.id, { required_action })}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold text-gray-700">
      <span className="mb-1 block">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm font-normal text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  type = 'text',
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  type?: 'text' | 'date';
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold text-gray-700">
      <span className="mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-normal text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold text-gray-700">
      <span className="mb-1 block">{label}</span>
      <textarea
        rows={3}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-normal text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
      />
    </label>
  );
}
