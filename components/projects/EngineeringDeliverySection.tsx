'use client';

import type { ClientRecord } from '@/lib/types/client';
import type {
  EngineeringDeliveryReport,
  ProjectEngineeringData,
  SafetyScopeOption,
  SafetyScopeRow,
} from '@/lib/types/project-reports';
import {
  DEFAULT_SAFETY_SCOPE,
  formatHijriDate,
  mergeSafetyScope,
  SAFETY_SCOPE_OPTION_LABELS,
  seedEngineeringDelivery,
} from '@/lib/projects/safety-delivery-letter';
import { printSafetyDeliveryLetter } from '@/components/projects/SafetyDeliveryLetterPrint';
import type { CompanyProfile } from '@/lib/company-profile';

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

type EngineeringDeliverySectionProps = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  company: CompanyProfile | null;
  saving: boolean;
  onChange: (delivery: EngineeringDeliveryReport) => void;
  onSave: () => void;
};

export default function EngineeringDeliverySection({
  client,
  data,
  company,
  saving,
  onChange,
  onSave,
}: EngineeringDeliverySectionProps) {
  const delivery = data.engineering_delivery;

  const patch = (partial: Partial<EngineeringDeliveryReport>) => {
    const next: EngineeringDeliveryReport = { ...delivery, ...partial };
    if (partial.delivery_date && partial.hijri_date === undefined) {
      next.hijri_date = formatHijriDate(partial.delivery_date);
    }
    if (partial.delivered_to && partial.civil_defense_city === undefined) {
      const fromAddr = partial.delivered_to.match(/محافظة\s+([^\s،,]+)/)?.[1];
      if (fromAddr) next.civil_defense_city = fromAddr;
    }
    onChange(next);
  };

  const updateScopeRow = (id: SafetyScopeRow['id'], partial: Partial<SafetyScopeRow>) => {
    const rows = mergeSafetyScope(delivery.safety_scope, DEFAULT_SAFETY_SCOPE).map((row) => {
      if (row.id !== id) return row;
      const merged = { ...row, ...partial };
      if (partial.applicable === 'لا' && partial.option === undefined) {
        merged.option = 'not_required';
      }
      if (partial.option === 'not_required') merged.applicable = 'لا';
      if (partial.option && partial.option !== 'not_required') merged.applicable = 'نعم';
      return merged;
    });
    patch({ safety_scope: rows });
  };

  const handlePrint = () => {
    if (!company) return;
    const ready = seedEngineeringDelivery(client, data, {
      ...delivery,
      manager_phone: delivery.manager_phone || company.phone || '',
      manager_name: delivery.manager_name || company.legal_name || company.name || '',
    });
    printSafetyDeliveryLetter({
      client,
      data: { ...data, engineering_delivery: ready },
      delivery: ready,
      company,
    });
  };

  const scope = mergeSafetyScope(delivery.safety_scope, DEFAULT_SAFETY_SCOPE);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
        خطاب تسليم دراسة السلامة للدفاع المدني — نموذج رسمي صفحة واحدة (A4) وفق SBC وNFPA.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">حالة التقرير / المسودة</span>
          <select
            value={delivery.status}
            onChange={(e) => patch({ status: e.target.value as EngineeringDeliveryReport['status'] })}
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
          <span className="text-xs font-semibold text-gray-600 mb-1 block">تاريخ التسليم</span>
          <input
            type="date"
            value={delivery.delivery_date || ''}
            onChange={(e) => patch({ delivery_date: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">تم التسليم إلى</span>
          <input
            value={delivery.delivered_to || ''}
            onChange={(e) => patch({ delivered_to: e.target.value })}
            placeholder="سعادة مدير الإدارة العامة للدفاع المدني بمحافظة ..."
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">صورة إلى</span>
          <textarea
            rows={2}
            value={
              delivery.copy_to ||
              `صورة لمركز السلامة الميدانية\nصورة للمالك / المستثمر: ${client.owner_name || client.name || ''}`
            }
            onChange={(e) => patch({ copy_to: e.target.value })}
            placeholder={'صورة لمركز السلامة الميدانية\nصورة للمالك / المستثمر: ...'}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">الرقم الصادر</span>
          <input
            value={delivery.outgoing_number || data.technical_report.outgoing_number || ''}
            onChange={(e) => patch({ outgoing_number: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
            dir="ltr"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">عدد المرفقات</span>
          <input
            value={delivery.attachments_count ?? 1}
            onChange={(e) => patch({ attachments_count: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
            dir="ltr"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">محافظة الدفاع المدني</span>
          <input
            value={delivery.civil_defense_city || client.city || ''}
            onChange={(e) => patch({ civil_defense_city: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">التاريخ الهجري</span>
          <input
            value={delivery.hijri_date || ''}
            onChange={(e) => patch({ hijri_date: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
            placeholder="يُولَّد تلقائياً من تاريخ التسليم"
          />
        </label>
      </div>

      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">الأعمال التي تمت في الدراسة</p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-right text-xs min-w-[640px]">
            <thead className="bg-[#1f4d3a] text-white">
              <tr>
                <th className="p-2">النظام</th>
                <th className="p-2">حالة الأعمال في الدراسة</th>
              </tr>
            </thead>
            <tbody>
              {scope.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="p-2 font-semibold">{row.label}</td>
                  <td className="p-2">
                    <select
                      value={row.option || (row.applicable === 'لا' ? 'not_required' : '')}
                      onChange={(e) =>
                        updateScopeRow(row.id, { option: e.target.value as SafetyScopeOption })
                      }
                      className="w-full border rounded-lg px-2 py-1.5"
                    >
                      <option value="">— اختر الحالة —</option>
                      {(Object.keys(SAFETY_SCOPE_OPTION_LABELS) as Exclude<SafetyScopeOption, ''>[]).map(
                        (key) => (
                          <option key={key} value={key}>
                            {SAFETY_SCOPE_OPTION_LABELS[key]}
                          </option>
                        )
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">مهندس السلامة المعتمد</span>
          <input
            value={delivery.safety_engineer_name || ''}
            onChange={(e) => patch({ safety_engineer_name: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">جوال المهندس</span>
          <input
            value={delivery.safety_engineer_phone || ''}
            onChange={(e) => patch({ safety_engineer_phone: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
            dir="ltr"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">مدير المكتب</span>
          <input
            value={delivery.manager_name || ''}
            onChange={(e) => patch({ manager_name: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">جوال المدير</span>
          <input
            value={delivery.manager_phone || ''}
            onChange={(e) => patch({ manager_phone: e.target.value })}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
            dir="ltr"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-xs font-semibold text-gray-600 mb-1 block">ملاحظات</span>
        <textarea
          rows={3}
          value={delivery.notes || delivery.study_summary || ''}
          onChange={(e) => patch({ notes: e.target.value, study_summary: e.target.value })}
          className="w-full border rounded-xl px-3 py-2.5 text-sm"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          حفظ بيانات الخطاب
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!company}
          className="px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
        >
          توليد وطباعة الخطاب الرسمي (PDF / Print)
        </button>
      </div>
    </div>
  );
}
