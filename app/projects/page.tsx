'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { shouldShowInProjects } from '@/lib/business/pipeline';
import { getProjectReportProgress, parseProjectEngineeringData } from '@/lib/business/project-reports';
import ProjectReportModal from '@/components/projects/ProjectReportModal';
import BlueprintViewer from '@/components/projects/BlueprintViewer';
import SmartInspectionForm from '@/components/projects/SmartInspectionForm';
import ComplianceEnginePanel from '@/components/compliance/ComplianceEnginePanel';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import type { ClientRecord } from '@/lib/types/client';

type TabId = 'list' | 'inspection' | 'blueprints' | 'compliance';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [tab, setTab] = useState<TabId>('list');

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    setProjects(((data || []) as ClientRecord[]).filter(shouldShowInProjects));
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">إدارة المشاريع</h1>
        <p className="text-sm text-gray-500 mt-1">
          المعاينة الهندسية، المخططات/BIM، والامتثال SBC/NFPA — للمشاريع المعتمدة مالياً
        </p>
      </div>

      <ModuleSubNavSlot label="تبويبات المشاريع">
        <div id="module-subnav" className="flex flex-wrap gap-2">
          {([
            { id: 'list' as const, label: 'المشاريع' },
            { id: 'inspection' as const, label: 'المعاينة الهندسية' },
            { id: 'blueprints' as const, label: 'المخططات / BIM' },
            { id: 'compliance' as const, label: 'الامتثال SBC/NFPA' },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white border'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </ModuleSubNavSlot>

      {tab === 'list' && (
        <>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
            كل مشروع يحتوي: معلومات المخطط، BOQ، الجدول الزمني، الزيارات الميدانية، الملاحظات الفنية، تسليم الدراسة، التقرير النهائي، وشهادة إنهاء الأعمال.
          </div>

          <ResponsiveTable className="bg-white rounded-xl border shadow-sm">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 border-b text-gray-600">
                <tr>
                  <th className="p-4">المشروع</th>
                  <th className="p-4">الزيارات</th>
                  <th className="p-4">تقرير المخطط</th>
                  <th className="p-4">اكتمال التقارير</th>
                  <th className="p-4">المهندس</th>
                  <th className="p-4">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">جاري التحميل...</td></tr>
                ) : projects.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد مشاريع معتمدة مالياً</td></tr>
                ) : (
                  projects.map((project) => {
                    const parsed = parseProjectEngineeringData(project.project_engineering_data);
                    const progress = getProjectReportProgress(parsed);
                    const planStatus = parsed.building_plan.status;
                    return (
                      <tr key={project.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div className="font-semibold">{project.business_name || project.name}</div>
                          <div className="text-xs text-gray-400">{ACTIVITY_RULES[project.activity_type || '']?.label || project.city}</div>
                        </td>
                        <td className="p-4">{project.quotation_visits_count || 1} زيارة</td>
                        <td className="p-4">
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                            planStatus === 'معتمد' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {planStatus}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full max-w-[80px]"><div className="h-full bg-indigo-600 rounded-full" style={{ width: `${progress}%` }} /></div>
                            <span className="text-xs">{progress}%</span>
                          </div>
                        </td>
                        <td className="p-4">{project.assigned_engineer || '—'}</td>
                        <td className="p-4">
                          <button onClick={() => setSelected(project)} className="touch-target px-3 bg-indigo-600 text-white rounded-lg text-xs font-semibold">
                            فتح ملف المشروع
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        </>
      )}

      {tab === 'inspection' && (
        <SmartInspectionForm clients={projects} onOpenProject={setSelected} />
      )}

      {tab === 'blueprints' && <BlueprintViewer />}

      {tab === 'compliance' && <ComplianceEnginePanel clients={projects} />}

      <ProjectReportModal client={selected} onClose={() => setSelected(null)} onUpdated={fetchProjects} />
    </div>
  );
}
