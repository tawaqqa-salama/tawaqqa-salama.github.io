'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ACTIVITY_RULES } from '@/lib/constants/clients';
import {
  hasEngineeringWork,
  resolvePipelineStage,
  shouldShowInProjects,
} from '@/lib/business/pipeline';
import { getProjectReportProgress, parseProjectEngineeringData } from '@/lib/business/project-reports';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ModuleTabBar from '@/components/layout/ModuleTabBar';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { useProjectsList, invalidateErpLists, invalidateClient } from '@/lib/data/hooks';
import { PROJECTS_PAGE_SIZE } from '@/lib/data/query-config';
import { fetchClientById } from '@/lib/data/fetchers';
import { mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { ClientRecord } from '@/lib/types/client';
import type { WorkflowStageId } from '@/lib/projects/gated-pipeline';

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

type TabId = 'list' | 'designs' | 'inspection' | 'blueprints' | 'compliance';
type StatusFilter = 'all' | 'in_study' | 'completed' | 'archive' | 'everything';

const STATUS_FILTER_IDS: StatusFilter[] = ['all', 'in_study', 'completed', 'archive', 'everything'];

const STATUS_FILTER_KEYS: Record<StatusFilter, string> = {
  all: 'projects.filter.all',
  in_study: 'projects.filter.inStudy',
  completed: 'projects.filter.completed',
  archive: 'projects.filter.archive',
  everything: 'projects.filter.everything',
};

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400 animate-pulse">
      جاري تحميل {label}...
    </div>
  );
}

function matchesStatusFilter(project: ClientRecord, filter: StatusFilter): boolean {
  if (filter === 'all' || filter === 'everything') return true;
  const stage = resolvePipelineStage(project);
  if (filter === 'in_study') {
    return (
      (stage === 'projects' || hasEngineeringWork(project)) &&
      project.engineering_status !== 'مكتمل' &&
      stage !== 'completed'
    );
  }
  if (filter === 'completed') {
    return (
      stage === 'completed' ||
      project.engineering_status === 'مكتمل' ||
      project.final_report_status === 'معتمد'
    );
  }
  return (
    stage === 'completed' &&
    Boolean(project.license_number || project.final_report_status === 'معتمد')
  );
}

const ProjectRow = memo(function ProjectRow({
  project,
  onOpen,
  onOpenDesigns,
}: {
  project: ClientRecord;
  onOpen: (project: ClientRecord) => void;
  onOpenDesigns: (project: ClientRecord) => void;
}) {
  const { progress, planStatus } = useMemo(() => {
    try {
      const parsed = parseProjectEngineeringData(project.project_engineering_data);
      return {
        progress: getProjectReportProgress(parsed),
        planStatus: parsed.design_center?.status || parsed.building_plan?.status || 'مسودة',
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
        {hasEngineeringWork(project) ? (
          <div className="text-[10px] text-emerald-700 mt-0.5">يحتوي تقارير محفوظة</div>
        ) : null}
      </td>
      <td className="p-4">{project.quotation_visits_count || 1} زيارة</td>
      <td className="p-4">
        <span
          className={`text-xs px-2 py-1 rounded-full font-semibold ${
            planStatus === 'معتمد' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-50 text-sky-800'
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
        <div className="flex flex-col gap-1.5 items-stretch min-w-[9rem]">
          <button
            type="button"
            onClick={() => onOpenDesigns(project)}
            className="touch-target px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold"
          >
            مركز التصاميم
          </button>
          <button
            type="button"
            onClick={() => onOpen(project)}
            className="touch-target px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
          >
            فتح ملف المشروع
          </button>
        </div>
      </td>
    </tr>
  );
});

export default function ProjectsPage() {
  const { t } = useLanguage();
  const [limit, setLimit] = useState(PROJECTS_PAGE_SIZE);
  const { projects: rawProjects, loading, error, refresh } = useProjectsList(limit);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [preferredStage, setPreferredStage] = useState<WorkflowStageId | null>(null);
  const [tab, setTab] = useState<TabId>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [opening, setOpening] = useState(false);

  // ادمج أي نسخ محلية للتقارير فور التحميل
  const hydrated = useMemo(() => {
    const list = Array.isArray(rawProjects) ? rawProjects : [];
    return list.map((row) => mergeLocalClientOverrides(row));
  }, [rawProjects]);

  useEffect(() => {
    // إن كانت القائمة فارغة بعد التحميل — افتح وضع الاستعادة تلقائياً
    if (!loading && hydrated.length > 0) {
      const visible = hydrated.filter(shouldShowInProjects);
      if (visible.length === 0 && statusFilter === 'all') {
        setStatusFilter('everything');
      }
    }
  }, [loading, hydrated, statusFilter]);

  const projects = useMemo(() => {
    if (statusFilter === 'everything') return hydrated;
    return hydrated.filter(
      (row) => shouldShowInProjects(row) && matchesStatusFilter(row, statusFilter)
    );
  }, [hydrated, statusFilter]);

  const counts = useMemo(() => {
    const asProjects = hydrated.filter(shouldShowInProjects);
    return {
      all: asProjects.length,
      in_study: asProjects.filter((p) => matchesStatusFilter(p, 'in_study')).length,
      completed: asProjects.filter((p) => matchesStatusFilter(p, 'completed')).length,
      archive: asProjects.filter((p) => matchesStatusFilter(p, 'archive')).length,
      everything: hydrated.length,
    };
  }, [hydrated]);

  const handleUpdated = useCallback(async () => {
    await invalidateErpLists();
    if (selected?.id) await invalidateClient(selected.id);
    await refresh();
  }, [refresh, selected?.id]);

  const openProject = useCallback(async (project: ClientRecord, stage: WorkflowStageId | null = null) => {
    setOpening(true);
    setPreferredStage(stage);
    const withLocal = mergeLocalClientOverrides(project);
    setSelected(withLocal);
    try {
      const full = await fetchClientById(project.id);
      if (full) setSelected(mergeLocalClientOverrides(full));
    } catch {
      // أبقِ النسخة المحلية
    } finally {
      setOpening(false);
    }
  }, []);

  const openDesigns = useCallback(
    (project: ClientRecord) => {
      void openProject(project, 'designs');
    },
    [openProject]
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('projects.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('projects.subtitle')}</p>
      </div>

      <ModuleSubNavSlot label={t('subnav.projects')}>
        <ModuleTabBar
          ariaLabel={t('subnav.projects')}
          activeId={tab}
          onChange={(id) => setTab(id as TabId)}
          activeClassName="bg-indigo-600 text-white shadow-sm"
          idleClassName="bg-white border border-gray-200 text-gray-800"
          items={[
            { id: 'list', label: t('projects.tab.list') },
            { id: 'designs', label: t('projects.tab.designs') },
            { id: 'inspection', label: t('projects.tab.inspection') },
            { id: 'blueprints', label: t('projects.tab.blueprints') },
            { id: 'compliance', label: t('projects.tab.compliance') },
          ]}
        />
      </ModuleSubNavSlot>

      <div className="rounded-xl border border-sky-200 bg-gradient-to-l from-sky-50 to-indigo-50 px-4 py-3 text-sm text-sky-950">
        {t('projects.designs.banner')}
      </div>

      {tab === 'list' && (
        <>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTER_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  statusFilter === id
                    ? 'bg-[#1f4d3a] text-white border-[#1f4d3a]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#1f4d3a]/40'
                }`}
              >
                {t(STATUS_FILTER_KEYS[id])}
                <span className="ms-1 opacity-80">({counts[id]})</span>
              </button>
            ))}
          </div>

          {statusFilter === 'everything' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              وضع استعادة: تُعرض كل السجلات المحمّلة حتى لو لم تُصنَّف كمشاريع. افتح المشروع لاسترجاع
              التقارير المحفوظة.
            </div>
          ) : (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
              كل مشروع يحتوي: العقد، <strong>التصاميم (Design Center)</strong>، BOQ، الجدول الزمني،
              الزيارات، الملاحظات، خطاب التسليم، التقرير النهائي، وشهادة إنهاء الأعمال.
            </div>
          )}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              تعذّر تحديث قائمة المشاريع.
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
                  <th className="p-4">التصاميم</th>
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
                      لا توجد سجلات. جرّب تبويب «كل السجلات» أو حدّث الصفحة بعد اكتمال النشر.
                    </td>
                  </tr>
                ) : (
                  projects.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      onOpen={(p) => void openProject(p)}
                      onOpenDesigns={openDesigns}
                    />
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>

          {hydrated.length >= limit && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PROJECTS_PAGE_SIZE)}
              className="w-full py-2.5 rounded-xl border text-sm font-semibold text-indigo-700 bg-white hover:bg-indigo-50"
            >
              تحميل المزيد
            </button>
          )}
        </>
      )}

      {tab === 'designs' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-sky-700">
              Design Center
            </p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">{t('projects.designs.title')}</h2>
            <p className="text-sm text-gray-600 mt-2">{t('projects.designs.subtitle')}</p>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
              {t('projects.designs.hint')}
            </p>
          </div>

          <ResponsiveTable className="bg-white rounded-xl border shadow-sm">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 border-b text-gray-600">
                <tr>
                  <th className="p-4">المشروع</th>
                  <th className="p-4">المهندس</th>
                  <th className="p-4">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-400">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-400">
                      لا توجد مشاريع لفتح مركز التصاميم.
                    </td>
                  </tr>
                ) : (
                  projects.map((project) => (
                    <tr key={`design-${project.id}`} className="border-b hover:bg-sky-50/40">
                      <td className="p-4 font-semibold">
                        {project.business_name || project.name || project.client_code}
                      </td>
                      <td className="p-4">{project.assigned_engineer || '—'}</td>
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => openDesigns(project)}
                          className="touch-target px-3 py-2 rounded-lg bg-sky-600 text-white text-xs font-bold"
                        >
                          {t('projects.designs.open')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        </div>
      )}

      {tab === 'inspection' && (
        <SmartInspectionForm clients={projects} onOpenProject={(p) => void openProject(p)} />
      )}

      {tab === 'blueprints' && (
        <ProjectBlueprintsPanel projects={projects} onUpdated={() => void handleUpdated()} />
      )}

      {tab === 'compliance' && <ComplianceEnginePanel clients={projects} />}

      {selected ? (
        <ProjectReportModal
          client={selected}
          preferredStage={preferredStage}
          onClose={() => {
            setSelected(null);
            setPreferredStage(null);
          }}
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
