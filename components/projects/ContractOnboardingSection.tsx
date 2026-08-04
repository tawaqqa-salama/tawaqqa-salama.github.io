'use client';

import type { ClientRecord } from '@/lib/types/client';
import type { ContractOnboardingReport } from '@/lib/types/project-reports';

type Props = {
  client: ClientRecord;
  report: ContractOnboardingReport;
  onChange: (report: ContractOnboardingReport) => void;
};

export default function ContractOnboardingSection({ client, report, onChange }: Props) {
  const patch = (partial: Partial<ContractOnboardingReport>) =>
    onChange({ ...report, ...partial });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-950">
        المرحلة 1 — العقد والتعاقد. تُفتح المرحلة التالية بعد اعتماد العقد (موقع / معتمد).
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <label>
          <span className="text-xs font-semibold text-gray-600 mb-1 block">اسم العميل</span>
          <input
            className="w-full border rounded-xl px-3 py-2.5"
            value={report.client_name_snapshot || client.name || ''}
            onChange={(e) => patch({ client_name_snapshot: e.target.value })}
          />
        </label>
        <label>
          <span className="text-xs font-semibold text-gray-600 mb-1 block">اسم المشروع / المنشأة</span>
          <input
            className="w-full border rounded-xl px-3 py-2.5"
            value={report.project_name_snapshot || client.business_name || ''}
            onChange={(e) => patch({ project_name_snapshot: e.target.value })}
          />
        </label>
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
