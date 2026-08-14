'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACTIVITY_RULES } from '@/lib/constants/clients';
import {
  hasEngineeringWork,
  resolvePipelineStage,
  shouldShowInProjects,
} from '@/lib/business/pipeline';
import { getProjectReportProgress, parseProjectEngineeringData } from '@/lib/business/project-reports';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { useProjectsList } from '@/lib/data/hooks';
import { PROJECTS_PAGE_SIZE } from '@/lib/data/query-config';
import { mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { ClientRecord } from '@/lib/types/client';

type StatusFilter = 'all' | 'in_study' | 'completed' | 'archive' | 'everything';

const STATUS_FILTER_IDS: StatusFilter[] = ['all', 'in_study', 'completed', 'archive', 'everything'];

const STATUS_FILTER_KEYS: Record<StatusFilter, string> = {
  all: 'projects.filter.all',
  in_study: 'projects.filter.inStudy',
  completed: 'projects.filter.completed',
  archive: 'projects.filter.archive',
  everything: 'projects.filter.everything',
};

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
}: {
  project: ClientRecord;
  onOpen: (project: ClientRecord) => void;
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
    <tr className="projects-table-row border-b hover:bg-gray-50">
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
        <button
          type="button"
          onClick={() => onOpen(project)}
          className="touch-target px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
        >
          فتح ملف المشروع
        </button>
      </td>
    </tr>
  );
});

export default function ProjectsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [limit, setLimit] = useState(PROJECTS_PAGE_SIZE);
  const { projects: rawProjects, loading, error, refresh } = useProjectsList(limit);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const hydrated = useMemo(() => {
    const list = Array.isArray(rawProjects) ? rawProjects : [];
    return list.map((row) => mergeLocalClientOverrides(row));
  }, [rawProjects]);

  useEffect(() => {
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

  const openProject = useCallback(
    (project: ClientRecord) => {
      router.push(`/projects/file/?id=${encodeURIComponent(project.id)}`);
    },
    [router]
  );

  return (
    <div className="projects-page space-y-6">
      <div className="projects-page-header">
        <p className="projects-page-kicker">PROJECT OPERATIONS</p>
        <h1 className="text-xl font-bold text-gray-900">{t('projects.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('projects.subtitle')}</p>
      </div>

      <div className="projects-filters flex flex-wrap gap-2">
        {STATUS_FILTER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setStatusFilter(id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              statusFilter === id
                ? 'bg-[#635bdb] text-white border-[#635bdb]'
                : 'bg-white text-gray-700 border-gray-200 hover:border-[#635bdb]/40'
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

      <ResponsiveTable className="projects-table-surface bg-white rounded-xl border shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="projects-table-head bg-gray-50 border-b text-gray-600">
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
                <ProjectRow key={project.id} project={project} onOpen={openProject} />
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
    </div>
  );
}
