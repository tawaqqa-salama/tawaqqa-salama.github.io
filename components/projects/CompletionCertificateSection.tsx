'use client';

import { useEffect } from 'react';
import CompletionSafetyAttachmentsUpload from '@/components/projects/CompletionSafetyAttachmentsUpload';
import type { ClientRecord } from '@/lib/types/client';
import type {
  CompletionAttachmentsState,
  CompletionCertificateReport,
  ProjectEngineeringData,
} from '@/lib/types/project-reports';
import type { CompanyProfile } from '@/lib/company-profile';
import { seedCompletionCertificate } from '@/lib/projects/completion-certificate';
import { printCompletionCertificate } from '@/components/projects/CompletionCertificatePrint';
import { ensureCertificateNumber } from '@/lib/business/document-numbers';
import { hasAllRequiredCompletionAttachments } from '@/lib/projects/completion-attachments';

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

type CompletionCertificateSectionProps = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company: CompanyProfile | null;
  saving: boolean;
  onChange: (cert: CompletionCertificateReport) => void;
  onAttachmentsChange: (attachments: CompletionAttachmentsState) => void;
  onSave: (opts?: { issueCertificate?: boolean }) => void;
  onSaveAndPrint: (cert: CompletionCertificateReport) => Promise<void>;
};

export default function CompletionCertificateSection({
  client,
  data,
  company,
  saving,
  onChange,
  onAttachmentsChange,
  onSave,
  onSaveAndPrint,
}: CompletionCertificateSectionProps) {
  const cert = data.completion_certificate;
  const attachmentsReady = hasAllRequiredCompletionAttachments(client, data);

  useEffect(() => {
    // املأ الحقول الناقصة من العميل/الشركة دون طمس القيم المحفوظة
    const seeded = seedCompletionCertificate(client, data, company, cert);
    const needsSeed =
      !cert.facility_name ||
      !cert.study_office_name ||
      !cert.office_license_number ||
      !cert.activity_label;
    if (needsSeed) onChange(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once when section opens / company loads
  }, [client.id, company?.membership_id, company?.legal_name]);

  const patch = (partial: Partial<CompletionCertificateReport>) => {
    onChange({ ...cert, ...partial });
  };

  const handlePrint = async () => {
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
      </div>

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field
            label="مسمى المنشأة"
            value={cert.facility_name || ''}
            onChange={(v) => patch({ facility_name: v })}
          />
          <Field
            label="المالك"
            value={cert.owner_name || ''}
            onChange={(v) => patch({ owner_name: v })}
          />
          <Field
            label="النشاط"
            value={cert.activity_label || ''}
            onChange={(v) => patch({ activity_label: v })}
          />
          <Field
            label="تصنيف النشاط"
            value={cert.activity_classification || ''}
            onChange={(v) => patch({ activity_classification: v })}
          />
          <Field
            label="الحي"
            value={cert.district || ''}
            onChange={(v) => patch({ district: v })}
          />
          <Field
            label="الشارع"
            value={cert.street || ''}
            onChange={(v) => patch({ street: v })}
          />
          <Field
            label="مساحة الأرض (م²)"
            value={cert.land_area || ''}
            onChange={(v) => patch({ land_area: v })}
            dir="ltr"
          />
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
          <Field
            label="وسيلة التواصل (المالك / المستثمر)"
            value={cert.owner_contact || ''}
            onChange={(v) => patch({ owner_contact: v })}
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

      <CompletionSafetyAttachmentsUpload
        client={client}
        data={data}
        value={data.completion_attachments}
        disabled={saving}
        onChange={onAttachmentsChange}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave({ issueCertificate: true })}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          حفظ الشهادة
        </button>
        <button
          type="button"
          onClick={() => void handlePrint()}
          disabled={saving || !company || !attachmentsReady}
          title={
            attachmentsReady
              ? undefined
              : 'أرفق جميع عقود الصيانة والشهادات الفنية المطلوبة أولاً'
          }
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
