'use client';

import { useEffect } from 'react';
import type { ClientRecord } from '@/lib/types/client';
import type { ContractOnboardingReport } from '@/lib/types/project-reports';
import { getClientIdentitySnapshot } from '@/lib/projects/client-identity';
import { ReadOnlyField } from '@/components/projects/ReadOnlyField';

type Props = {
  client: ClientRecord;
  report: ContractOnboardingReport;
  onChange: (report: ContractOnboardingReport) => void;
};

export default function ContractOnboardingSection({ client, report, onChange }: Props) {
  const identity = getClientIdentitySnapshot(client);

  useEffect(() => {
    const nextName = identity.client_name || identity.owner_name;
    const nextFacility = identity.facility_name;
    if (
      (nextName && report.client_name_snapshot !== nextName) ||
      (nextFacility && report.project_name_snapshot !== nextFacility)
    ) {
      onChange({
        ...report,
        client_name_snapshot: nextName || report.client_name_snapshot,
        project_name_snapshot: nextFacility || report.project_name_snapshot,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync identity when client sales data changes
  }, [client.id, identity.client_name, identity.owner_name, identity.facility_name]);

  const patch = (partial: Partial<ContractOnboardingReport>) =>
    onChange({ ...report, ...partial });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-950">
        المرحلة 1 — العقد والتعاقد. اسم العميل والمنشأة والنوع والموقع تُؤخذ مرة واحدة من المبيعات وتظهر هنا تلقائياً
        (مقفلّة). تُفتح المرحلة التالية بعد اعتماد العقد (موقع / معتمد).
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <ReadOnlyField
          label="اسم العميل / المالك (من المبيعات)"
          value={report.client_name_snapshot || identity.owner_name || identity.client_name}
        />
        <ReadOnlyField
          label="اسم المشروع / المنشأة (من المبيعات)"
          value={report.project_name_snapshot || identity.facility_name}
        />
        <ReadOnlyField label="نوع النشاط" value={identity.activity_label} />
        <ReadOnlyField
          label="الموقع"
          value={identity.location_summary || identity.city}
        />
        <label>
          <span className="text-xs font-semibold text-gray-600 mb-1 block">قيمة العقد (ر.س)</span>
          <input
            type="number"
            className="w-full border rounded-xl px-3 py-2.5"
            value={report.contract_value ?? client.quotation_amount ?? ''}
            onChange={(e) =>
              patch({ contract_value: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </label>
        <label>
          <span className="text-xs font-semibold text-gray-600 mb-1 block">حالة العقد</span>
          <select
            className="w-full border rounded-xl px-3 py-2.5 bg-white"
            value={report.contract_status || 'draft'}
            onChange={(e) => patch({ contract_status: e.target.value })}
          >
            <option value="draft">مسودة</option>
            <option value="signed">موقع / Signed</option>
            <option value="approved">معتمد / Approved</option>
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">نطاق العمل</span>
          <textarea
            rows={3}
            className="w-full border rounded-xl px-3 py-2.5"
            value={report.scope_of_work || ''}
            onChange={(e) => patch({ scope_of_work: e.target.value })}
            placeholder="أنظمة الإطفاء، الإنذار، التحكم بالدخان…"
          />
        </label>
      </div>

      <div className="rounded-xl border bg-slate-50 p-3 text-xs text-gray-600 space-y-1">
        <p>عرض السعر: {client.quotation_number || '—'} · حالة العرض: {client.quotation_status || '—'}</p>
        <p>الحالة المالية: {client.financial_status || '—'} · المهندس: {client.assigned_engineer || '—'}</p>
      </div>
    </div>
  );
}
