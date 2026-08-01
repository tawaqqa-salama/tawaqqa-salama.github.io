'use client';

import PipelineBadge from '@/components/clients/PipelineBadge';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { resolvePipelineStage } from '@/lib/business/pipeline';
import { PIPELINE_STAGE_LABELS } from '@/lib/constants/modules';
import type { ClientRecord } from '@/lib/types/client';

interface PipelineStatusBoardProps {
  clients: ClientRecord[];
}

export default function PipelineStatusBoard({ clients }: PipelineStatusBoardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b bg-gray-50">
        <h3 className="font-bold text-gray-800">لوحة متابعة حالة العميل (للقراءة فقط)</h3>
        <p className="text-xs text-gray-500 mt-1">تعرض المرحلة الحالية للمشروع في الأقسام الأخرى — لا يمكن تعديلها من التسويق</p>
      </div>
      <ResponsiveTable>
        <table className="w-full text-right text-sm">
          <thead className="border-b text-gray-500 text-xs">
            <tr>
              <th className="p-3">العميل</th>
              <th className="p-3">المرحلة الحالية</th>
              <th className="p-3">حالة الاهتمام</th>
              <th className="p-3">عرض السعر</th>
              <th className="p-3">المالية</th>
              <th className="p-3">المشاريع</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد بيانات</td></tr>
            ) : (
              clients.map((client) => {
                const stage = resolvePipelineStage(client);
                return (
                  <tr key={client.id} className="border-b hover:bg-gray-50/80">
                    <td className="p-3">
                      <div className="font-semibold">{client.business_name || client.owner_name || client.name}</div>
                      <div className="text-xs text-gray-400">{client.client_code}</div>
                    </td>
                    <td className="p-3"><PipelineBadge stage={stage} /></td>
                    <td className="p-3 text-gray-600">{client.lead_status || '—'}</td>
                    <td className="p-3 text-gray-600">{client.quotation_status || '—'}</td>
                    <td className="p-3 text-gray-600">{client.financial_status || '—'}</td>
                    <td className="p-3 text-gray-600">{client.engineering_status || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ResponsiveTable>
      <div className="p-3 bg-amber-50 text-xs text-amber-800 border-t">
        🔒 المراحل: {Object.values(PIPELINE_STAGE_LABELS).join(' ← ')}
      </div>
    </div>
  );
}
