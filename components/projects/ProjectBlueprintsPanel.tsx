'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import SafetyBlueprintsUpload from '@/components/projects/SafetyBlueprintsUpload';
import BlueprintViewer from '@/components/projects/BlueprintViewer';
import { EMPTY_SAFETY_BLUEPRINTS } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

type ProjectBlueprintsPanelProps = {
  projects: ClientRecord[];
  onUpdated?: () => void;
};

export default function ProjectBlueprintsPanel({ projects, onUpdated }: ProjectBlueprintsPanelProps) {
  const [clientId, setClientId] = useState(projects[0]?.id || '');
  const [data, setData] = useState<ProjectEngineeringData | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const client = useMemo(
    () => projects.find((p) => p.id === clientId) || null,
    [projects, clientId]
  );

  useEffect(() => {
    if (!projects.length) {
      setClientId('');
      setData(null);
      return;
    }
    if (!clientId || !projects.some((p) => p.id === clientId)) {
      setClientId(projects[0].id);
    }
  }, [projects, clientId]);

  useEffect(() => {
    if (!client) {
      setData(null);
      return;
    }
    setData(parseProjectEngineeringData(client.project_engineering_data));
    setMessage(null);
  }, [client]);

  const persist = async (next: ProjectEngineeringData, successText: string) => {
    if (!client) return;
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({ project_engineering_data: next })
      .eq('id', client.id);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setData(next);
    setMessage(successText);
    onUpdated?.();
  };

  if (!projects.length) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
        لا توجد مشاريع معتمدة مالياً لرفع المخططات.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-white p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <label className="flex-1 text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">اختر المشروع</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.business_name || p.name} — {p.client_code}
              </option>
            ))}
          </select>
        </label>
        {saving && <span className="text-xs text-indigo-600 font-semibold">جاري الحفظ...</span>}
      </div>

      {message && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            message.includes('تم') ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
          }`}
        >
          {message}
        </div>
      )}

      {client && data && (
        <>
          <SafetyBlueprintsUpload
            client={client}
            buildingPlan={data.building_plan}
            value={data.safety_blueprints || EMPTY_SAFETY_BLUEPRINTS}
            onChange={(safety_blueprints) => setData({ ...data, safety_blueprints })}
            onPersist={async (safety_blueprints) => {
              await persist(
                { ...data, safety_blueprints },
                'تم حفظ مخططات السلامة وتشغيل الفحص الآلي.'
              );
            }}
          />
          <details className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer text-sm font-bold text-gray-800">
              عارض ملفات إضافية (BIM/CAD عام)
            </summary>
            <div className="mt-3">
              <BlueprintViewer projectName={client.business_name || client.name} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
