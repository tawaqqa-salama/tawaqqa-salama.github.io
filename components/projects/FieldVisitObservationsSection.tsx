'use client';

import { useState } from 'react';
import type {
  FieldVisitObservation,
  FieldVisitObservationCategory,
  FieldVisitObservationSeverity,
  FieldVisitObservationStatus,
  FieldVisitReport,
} from '@/lib/types/project-reports';
import {
  canVerifyFieldVisitObservation,
  createFieldVisitObservation,
  FIELD_VISIT_OBSERVATION_CATEGORIES,
  FIELD_VISIT_OBSERVATION_SEVERITIES,
  FIELD_VISIT_OBSERVATION_STATUSES,
} from '@/lib/projects/field-visit-observations';

type FieldVisitObservationsSectionProps = {
  visitNumber: number;
  allVisits: FieldVisitReport[];
  observations: FieldVisitObservation[];
  disabled?: boolean;
  linkedEvidenceCounts?: Record<string, number>;
  linkedSupervisionCounts?: Record<string, number>;
  linkedTechnicalDeficiencyCounts?: Record<string, number>;
  onAddEvidenceToObservation?: (observationId: string) => void;
  onLinkSupervisionToObservation?: (observationId: string) => void;
  onCreateTechnicalDeficiency?: (observationId: string) => void;
  onChange: (observations: FieldVisitObservation[]) => void;
};

function newObservationId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `visit-observation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function FieldVisitObservationsSection({
  visitNumber,
  allVisits,
  observations,
  disabled = false,
  linkedEvidenceCounts = {},
  linkedSupervisionCounts = {},
  linkedTechnicalDeficiencyCounts = {},
  onAddEvidenceToObservation,
  onLinkSupervisionToObservation,
  onCreateTechnicalDeficiency,
  onChange,
}: FieldVisitObservationsSectionProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const priorObservations = allVisits
    .filter((visit) => visit.visit_number < visitNumber)
    .flatMap((visit) => (visit.observations || []).map((observation) => ({ visit, observation })));
  const update = (id: string, partial: Partial<FieldVisitObservation>) => {
    setActionError(null);
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

      {actionError ? <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900">{actionError}</div> : null}

      {observations.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-amber-200 bg-white/70 px-3 py-3 text-xs text-amber-900">
          لا توجد ملاحظات منظمة لهذه الزيارة حتى الآن. تبقى حقول النتائج والتوصيات التاريخية مستقلة ومحفوظة كما هي.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {observations.map((observation, index) => (
            <article key={observation.id} className="rounded-lg border border-amber-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-xs font-bold text-gray-800">ملاحظة #{index + 1}</p><p className="mt-1 text-[11px] text-gray-500">الأدلة: {linkedEvidenceCounts[observation.id] || 0} · الإشراف: {linkedSupervisionCounts[observation.id] || 0} · الفنية: {linkedTechnicalDeficiencyCounts[observation.id] || 0}</p></div>
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
                  onChange={(status) => {
                    if (status === 'verified' && !canVerifyFieldVisitObservation(observation)) {
                      setActionError('لا يمكن تسجيل تحقق المهندس قبل تسجيل المعالجة وتاريخها.');
                      return;
                    }
                    update(observation.id, { status: status as FieldVisitObservationStatus });
                  }}
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

              <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3 lg:grid-cols-2">
                <label className="block text-xs font-semibold text-amber-950">
                  <span className="mb-1 block">ربط كمتابعة لملاحظة سابقة</span>
                  <select
                    disabled={disabled}
                    value={observation.follow_up_of ? `${observation.follow_up_of.visit_number}:${observation.follow_up_of.observation_id}` : ''}
                    onChange={(event) => {
                      const [priorVisit, ...idParts] = event.target.value.split(':');
                      const observationId = idParts.join(':');
                      update(observation.id, event.target.value ? { follow_up_of: { visit_number: Number(priorVisit), observation_id: observationId } } : { follow_up_of: null });
                    }}
                    className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-sm font-normal text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"
                  >
                    <option value="">ملاحظة أصلية مستقلة</option>
                    {priorObservations.map(({ visit: priorVisit, observation: priorObservation }, priorIndex) => (
                      <option key={`${priorVisit.visit_number}:${priorObservation.id}`} value={`${priorVisit.visit_number}:${priorObservation.id}`}>
                        زيارة #{priorVisit.visit_number} · ملاحظة #{priorIndex + 1} — {priorObservation.location || priorObservation.description || 'بدون وصف'}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  <button type="button" disabled={disabled || observation.status === 'verified'} onClick={() => update(observation.id, { status: 'resolved', resolved_at: observation.resolved_at || new Date().toISOString() })} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">تسجيل المعالجة</button>
                  <button type="button" disabled={disabled || !canVerifyFieldVisitObservation(observation)} onClick={() => update(observation.id, { status: 'verified', verified_at: observation.verified_at || new Date().toISOString() })} className="rounded-lg border border-cyan-300 bg-white px-3 py-2 text-xs font-semibold text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60">تحقق المهندس</button>
                  <button type="button" disabled={disabled} onClick={() => onLinkSupervisionToObservation?.(observation.id)} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-800 disabled:cursor-not-allowed disabled:opacity-60">ربط ببند إشراف</button>
                  <button type="button" disabled={disabled} onClick={() => onCreateTechnicalDeficiency?.(observation.id)} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 disabled:cursor-not-allowed disabled:opacity-60">إنشاء ملاحظة فنية</button>
                </div>
                <TextField label="تمت المعالجة بواسطة" value={observation.resolved_by || ''} disabled={disabled || observation.status === 'verified'} placeholder="اسم المنفذ أو الجهة" onChange={(resolved_by) => update(observation.id, { resolved_by })} />
                <TextAreaField label="ملاحظة المعالجة" value={observation.resolution_note || ''} disabled={disabled || observation.status === 'verified'} placeholder="ما الذي نُفذ لمعالجة الملاحظة؟" onChange={(resolution_note) => update(observation.id, { resolution_note })} />
                <TextField label="تحقق المهندس بواسطة" value={observation.verified_by || ''} disabled={disabled || observation.status !== 'resolved'} placeholder="اسم المهندس المتحقق" onChange={(verified_by) => update(observation.id, { verified_by })} />
                <TextAreaField label="ملاحظة تحقق المهندس" value={observation.verification_note || ''} disabled={disabled || observation.status !== 'resolved'} placeholder="نتيجة التحقق الميداني النهائي" onChange={(verification_note) => update(observation.id, { verification_note })} />
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
