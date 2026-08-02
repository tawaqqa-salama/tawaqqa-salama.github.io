'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { resolvePipelineStage, shouldShowInProjects } from '@/lib/business/pipeline';
import { getProjectReportProgress, parseProjectEngineeringData } from '@/lib/business/project-reports';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { useProjectsList, invalidateErpLists, invalidateClient } from '@/lib/data/hooks';
import { PROJECTS_PAGE_SIZE } from '@/lib/data/query-config';
import { fetchClientById } from '@/lib/data/fetchers';
import type { ClientRecord } from '@/lib/types/client';

const ProjectReportModal = dynamic(() => import('@/components/projects/ProjectReportModal'), {
  ssr: false,
  loading: () => null,
});

const ProjectBlueprintsPanel = dynamic(() => import('@/components/projects/ProjectBlueprintsPanel'), {
  ssr: false,
  loading: () => <PanelSkeleton label="المخططات / BIM" />,
});

const SmartInspectionForm = dynamic(() => import('@/components/projects/SmartInspectionForm'), {
  ssr: false,
  loading: () => <PanelSkeleton label="المعاينة الهندسية" />,
});

const ComplianceEnginePanel = dynamic(() => import('@/components/compliance/ComplianceEnginePanel'), {
  ssr: false,
  loading: () => <PanelSkeleton label="محرك الامتثال" />,
});

type TabId = 'list' | 'inspection' | 'blueprints' | 'compliance';
type StatusFilter = 'all' | 'in_study' | 'completed' | 'archive';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'in_study', label: 'قيد الدراسة' },
  { id: 'completed', label: 'المكتملة' },
  { id: 'archive', label: 'الأرشيف' },
];

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400 animate-pulse">
      جاري تحميل {label}...
    </div>
  );
}

function matchesStatusFilter(project: ClientRecord, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  const stage = resolvePipelineStage(project);
  if (filter === 'in_study') {
    return stage === 'projects' && project.engineering_status !== 'مكتمل';
  }
  if (filter === 'completed') {
    return (
      stage === 'completed' ||
      project.engineering_status === 'مكتمل' ||
      project.final_report_status === 'معتمد'
    );
  }
  // الأرشيف: مشاريع مكتملة بترخيص أو شهادة
  return (
    stage === 'completed' &&
    Boolean(project.license_number || project.final_report_status === 'معتمد')
  );
}

const ProjectRow = memo(function ProjectRow({
  project,
  onOpen,
}: {
  project: ClientRecord;
  onOpen: (project: ClientRecord) => void;
}) {
  const { progress, planStatus } = useMemo(() => {
    try {
      const parsed = parseProjectEngineeringData(project.project_engineering_data);
      return {
        progress: getProjectReportProgress(parsed),
        planStatus: parsed.building_plan?.status || 'مسودة',
      };
    } catch {
      return { progress: 0, planStatus: 'مسودة' };
    }
  }, [project.project_engineering_data]);

  const title = project.business_name || project.name || project.client_code || 'مشروع بدون اسم';
  const subtitle =
    ACTIVITY_RULES[project.activity_type || '']?.label || project.city || project.client_code || '—';

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="p-4">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-gray-400">{subtitle}</div>
      </td>
      <td className="p-4">{project.quotation_visits_count || 1} زيارة</td>
      <td className="p-4">
        <span
          className={`text-xs px-2 py-1 rounded-full font-semibold ${
            planStatus === 'معتمد' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {planStatus}
        </span>
      </td>
      <td className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-100 rounded-full max-w-[80px]">
            <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs">{progress}%</span>
        </div>
      </td>
      <td className="p-4">{project.assigned_engineer || '—'}</td>
      <td className="p-4">
        <button
          type="button"
          onClick={() => onOpen(project)}
          className="touch-target px-3 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
        >
          فتح ملف المشروع
        </button>
      </td>
    </tr>
  );
});

export default function ProjectsPage() {
  const [limit, setLimit] = useState(PROJECTS_PAGE_SIZE);
  const { projects: rawProjects, loading, error, refresh } = useProjectsList(limit);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [tab, setTab] = useState<TabId>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [opening, setOpening] = useState(false);

  const projects = useMemo(() => {
    const list = Array.isArray(rawProjects) ? rawProjects : [];
    return list.filter((row) => shouldShowInProjects(row) && matchesStatusFilter(row, statusFilter));
  }, [rawProjects, statusFilter]);

  const counts = useMemo(() => {
    const list = Array.isArray(rawProjects) ? rawProjects.filter(shouldShowInProjects) : [];
    return {
      all: list.length,
      in_study: list.filter((p) => matchesStatusFilter(p, 'in_study')).length,
      completed: list.filter((p) => matchesStatusFilter(p, 'completed')).length,
      archive: list.filter((p) => matchesStatusFilter(p, 'archive')).length,
    };
  }, [rawProjects]);

  const handleUpdated = useCallback(async () => {
    await invalidateErpLists();
    if (selected?.id) await invalidateClient(selected.id);
    await refresh();
  }, [refresh, selected?.id]);

  const openProject = useCallback(async (project: ClientRecord) => {
    setOpening(true);
    setSelected(project);
    try {
      const full = await fetchClientById(project.id);
      if (full) setSelected(full);
    } catch {
      // أبقِ صف القائمة إن فشل جلب التفاصيل
    } finally {
      setOpening(false);
    }
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
          {(
            [
              { id: 'list' as const, label: 'المشاريع' },
              { id: 'inspection' as const, label: 'المعاينة الهندسية' },
              { id: 'blueprints' as const, label: 'المخططات / BIM' },
              { id: 'compliance' as const, label: 'الامتثال SBC/NFPA' },
            ] as const
          ).map((t) => (
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
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  statusFilter === f.id
                    ? 'bg-[#1f4d3a] text-white border-[#1f4d3a]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#1f4d3a]/40'
                }`}
              >
                {f.label}
                <span className="ms-1 opacity-80">({counts[f.id]})</span>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
            كل مشروع يحتوي: معلومات المخطط، BOQ، الجدول الزمني، الزيارات الميدانية، الملاحظات الفنية، خطاب تسليم
            الدراسة، التقرير النهائي، وشهادة إنهاء الأعمال.
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              تعذّر تحديث قائمة المشاريع. يتم عرض البيانات المتوفرة إن وُجدت.
              <button
                type="button"
                onClick={() => void refresh()}
                className="ms-3 underline font-semibold"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : null}

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
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      {statusFilter === 'all'
                        ? 'لا توجد مشاريع معتمدة مالياً'
                        : 'لا توجد مشاريع ضمن هذا التصنيف'}
                    </td>
                  </tr>
                ) : (
                  projects.map((project) => (
                    <ProjectRow key={project.id} project={project} onOpen={openProject} />
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>

          {Array.isArray(rawProjects) && rawProjects.length >= limit && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PROJECTS_PAGE_SIZE)}
              className="w-full py-2.5 rounded-xl border text-sm font-semibold text-indigo-700 bg-white hover:bg-indigo-50"
            >
              تحميل المزيد ({PROJECTS_PAGE_SIZE})
            </button>
          )}
        </>
      )}

      {tab === 'inspection' && (
        <SmartInspectionForm clients={projects} onOpenProject={openProject} />
      )}

      {tab === 'blueprints' && (
        <ProjectBlueprintsPanel projects={projects} onUpdated={() => void handleUpdated()} />
      )}

      {tab === 'compliance' && <ComplianceEnginePanel clients={projects} />}

      {selected ? (
        <ProjectReportModal
          client={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => void handleUpdated()}
        />
      ) : null}

      {opening ? (
        <div className="fixed bottom-4 inset-x-0 flex justify-center pointer-events-none z-[70]">
          <span className="bg-[#1f4d3a] text-white text-xs px-3 py-1.5 rounded-full shadow">
            جاري فتح ملف المشروع...
          </span>
        </div>
      ) : null}
    </div>
  );
}
