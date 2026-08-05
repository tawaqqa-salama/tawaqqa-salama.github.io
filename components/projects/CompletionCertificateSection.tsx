'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClientRecord } from '@/lib/types/client';
import type {
  CompletionCertificateReport,
  ProjectEngineeringData,
  YesNoValue,
} from '@/lib/types/project-reports';
import type { CompanyProfile } from '@/lib/company-profile';
import { seedCompletionCertificate } from '@/lib/projects/completion-certificate';
import { printCompletionCertificate } from '@/components/projects/CompletionCertificatePrint';
import { ensureCertificateNumber } from '@/lib/business/document-numbers';
import CompletionAttachmentsUpload from '@/components/projects/CompletionAttachmentsUpload';
import { ReadOnlyField } from '@/components/projects/ReadOnlyField';
import {
  normalizeCompletionAttachments,
  validateCompletionAttachmentsForIssue,
} from '@/lib/projects/completion-certificate-attachments';

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

type CompletionCertificateSectionProps = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company: CompanyProfile | null;
  saving: boolean;
  onChange: (cert: CompletionCertificateReport) => void;
  onSave: (opts?: { issueCertificate?: boolean }) => void;
  onSaveAndPrint: (cert: CompletionCertificateReport) => Promise<void>;
};

export default function CompletionCertificateSection({
  client,
  data,
  company,
  saving,
  onChange,
  onSave,
  onSaveAndPrint,
}: CompletionCertificateSectionProps) {
  const cert = data.completion_certificate;
  const [gateError, setGateError] = useState<string | null>(null);

  useEffect(() => {
    const seeded = seedCompletionCertificate(client, data, company, cert);
    const identityChanged =
      seeded.facility_name !== cert.facility_name ||
      seeded.owner_name !== cert.owner_name ||
      seeded.activity_label !== cert.activity_label ||
      seeded.district !== cert.district ||
      seeded.street !== cert.street ||
      seeded.land_area !== cert.land_area ||
      seeded.owner_contact !== cert.owner_contact;
    const needsSeed =
      identityChanged ||
      !cert.facility_name ||
      !cert.study_office_name ||
      !cert.office_license_number ||
      !cert.activity_label ||
      !cert.attachments;
    if (needsSeed) onChange(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh identity when sales/client or company changes
  }, [
    client.id,
    client.owner_name,
    client.business_name,
    client.activity_type,
    client.district,
    client.street,
    client.land_area,
    client.phone,
    company?.membership_id,
    company?.legal_name,
  ]);

  const attachmentContext = useMemo(
    () => ({
      activityType: client.activity_type,
      activityLabel: cert.activity_label || client.activity_type,
      elevatorsCount: data.building_plan?.elevators_count,
      hasElevator: cert.has_elevator,
    }),
    [
      client.activity_type,
      cert.activity_label,
      cert.has_elevator,
      data.building_plan?.elevators_count,
    ]
  );

  const patch = (partial: Partial<CompletionCertificateReport>) => {
    setGateError(null);
    onChange({ ...cert, ...partial });
  };

  const assertAttachments = (): boolean => {
    const err = validateCompletionAttachmentsForIssue(
      normalizeCompletionAttachments(cert.attachments),
      attachmentContext
    );
    if (err) {
      setGateError(err);
      return false;
    }
    setGateError(null);
    return true;
  };

  const handleSave = () => {
    if (!assertAttachments()) return;
    onSave({ issueCertificate: true });
  };

  const handlePrint = async () => {
    if (!assertAttachments()) return;
    let next = { ...cert };
    if (!next.certificate_number?.trim()) {
      const certificateNumber = await ensureCertificateNumber(next.certificate_number);
      next = { ...next, certificate_number: certificateNumber };
      onChange(next);
      await onSaveAndPrint(next);
      return;
    }
    printCompletionCertificate(client, next, company);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        شهادة الإنهاء ومطابقة الأعمال — قالب رسمي للدفاع المدني / الغرفة التجارية (A4 أفقي / Landscape).
        لا تُصدر إلا بعد إرفاق المستندات الإلزامية حسب النشاط.
      </div>

      {gateError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          ⛔ {gateError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">حالة الشهادة</span>
          <select
            value={cert.status}
            onChange={(e) => patch({ status: e.target.value as CompletionCertificateReport['status'] })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          >
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">رقم الشهادة</span>
          <input
            value={cert.certificate_number || ''}
            onChange={(e) => patch({ certificate_number: e.target.value })}
            placeholder="يُصدر تلقائياً CERT-YYYY-NNN عند الحفظ/الطباعة"
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
            dir="ltr"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">تاريخ إصدارها</span>
          <input
            type="date"
            value={cert.issue_date || ''}
            onChange={(e) => patch({ issue_date: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">تاريخ الإنجاز</span>
          <input
            type="date"
            value={cert.completion_date || ''}
            onChange={(e) => patch({ completion_date: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">هل يوجد مصعد؟</span>
          <select
            value={cert.has_elevator || ''}
            onChange={(e) => patch({ has_elevator: e.target.value as YesNoValue })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
          >
            <option value="">—</option>
            <option value="نعم">نعم</option>
            <option value="لا">لا</option>
          </select>
          <span className="mt-1 block text-[11px] text-gray-500">
            عند اختيار «نعم» يظهر خانة عقد صيانة المصاعد وتكون إلزامية
          </span>
        </label>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">مستندات إصدار الشهادة</p>
        <CompletionAttachmentsUpload
          value={cert.attachments}
          clientId={client.id}
          activityType={attachmentContext.activityType}
          activityLabel={attachmentContext.activityLabel}
          elevatorsCount={attachmentContext.elevatorsCount}
          hasElevator={attachmentContext.hasElevator}
          disabled={saving}
          onChange={(attachments) => patch({ attachments })}
        />
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">أولاً: بيانات الدراسة</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field
            label="المكتب المعد للدراسة"
            value={cert.study_office_name || ''}
            onChange={(v) => patch({ study_office_name: v })}
          />
          <Field
            label="رقم تقرير الدراسة المرفق به المخططات"
            value={cert.study_report_number || ''}
            onChange={(v) => patch({ study_report_number: v })}
            dir="ltr"
          />
          <Field
            label="تاريخ إعداد الدراسة"
            type="date"
            value={cert.study_date || ''}
            onChange={(v) => patch({ study_date: v })}
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">ثانياً: بيانات المنشأة</p>
        <p className="mb-2 text-[11px] text-slate-500">
          الاسم والمالك والنشاط والعنوان والمساحة من المبيعات (إدخال مرة واحدة — مقفل هنا).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ReadOnlyField label="مسمى المنشأة (من المبيعات)" value={cert.facility_name} />
          <ReadOnlyField label="المالك (من المبيعات)" value={cert.owner_name} />
          <ReadOnlyField label="النشاط (من المبيعات)" value={cert.activity_label} />
          <Field
            label="تصنيف النشاط"
            value={cert.activity_classification || ''}
            onChange={(v) => patch({ activity_classification: v })}
          />
          <ReadOnlyField label="الحي (من المبيعات)" value={cert.district} />
          <ReadOnlyField label="الشارع (من المبيعات)" value={cert.street} />
          <ReadOnlyField label="مساحة الأرض (م²)" value={cert.land_area} dir="ltr" />
          <Field
            label="مكونات المبنى"
            value={cert.building_components || ''}
            onChange={(v) => patch({ building_components: v })}
          />
          <Field
            label="التصنيف الإنشائي للمبنى"
            value={cert.building_structural_class || ''}
            onChange={(v) => patch({ building_structural_class: v })}
          />
          <ReadOnlyField
            label="وسيلة التواصل (من المبيعات)"
            value={cert.owner_contact}
            dir="ltr"
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">مقاول التنفيذ والترخيص</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field
            label="اسم مؤسسة الصيانة / التنفيذ"
            value={cert.contractor_name || ''}
            onChange={(v) => patch({ contractor_name: v })}
          />
          <Field
            label="رقم ترخيص المقاول"
            value={cert.contractor_license || ''}
            onChange={(v) => patch({ contractor_license: v })}
            dir="ltr"
          />
          <Field
            label="تاريخ انتهاء ترخيص المقاول"
            type="date"
            value={cert.contractor_license_expiry || ''}
            onChange={(v) => patch({ contractor_license_expiry: v })}
          />
          <Field
            label="ترخيص المكتب لدى الدفاع المدني"
            value={cert.office_license_number || ''}
            onChange={(v) => patch({ office_license_number: v })}
            dir="ltr"
          />
          <Field
            label="تاريخ انتهاء ترخيص المكتب"
            type="date"
            value={cert.office_license_expiry || ''}
            onChange={(v) => patch({ office_license_expiry: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field
          label="مهندس السلامة بالمكتب"
          value={cert.engineer_name || ''}
          onChange={(v) => patch({ engineer_name: v })}
        />
        <Field
          label="مالك المكتب"
          value={cert.office_owner_name || ''}
          onChange={(v) => patch({ office_owner_name: v })}
        />
      </div>

      <label className="block text-sm">
        <span className="text-xs font-semibold text-gray-600 mb-1 block">نطاق الأعمال / ملاحظات</span>
        <textarea
          rows={2}
          value={cert.scope_of_work || ''}
          onChange={(e) => patch({ scope_of_work: e.target.value })}
          className="w-full border rounded-xl px-3 py-2.5 text-sm"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          حفظ الشهادة
        </button>
        <button
          type="button"
          onClick={() => void handlePrint()}
          disabled={saving || !company}
          className="px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
        >
          معاينة وطباعة الشهادة (A4)
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <label className="text-sm block">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 text-sm"
        dir={dir}
      />
    </label>
  );
}
