'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { fetchClientById } from '@/lib/data/fetchers';
import { resolvePrimaryEngineeringProjectIdentity } from '@/lib/projects/primary-engineering-project-identity';
import { invalidateClient, invalidateErpLists } from '@/lib/data/hooks';
import { mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { ClientRecord } from '@/lib/types/client';
import type { WorkflowStageId } from '@/lib/projects/gated-pipeline';

const ProjectReportModal = dynamic(() => import('@/components/projects/ProjectReportModal'), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-400 animate-pulse">
      جاري فتح ملف المشروع...
    </div>
  ),
});

function ProjectFileInner() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = (searchParams.get('id') || '').trim();
  const stageParam = (searchParams.get('stage') || '').trim() as WorkflowStageId | '';
  const preferredStage = stageParam || null;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) {
        setClient(null);
        setError('لم يُحدد مشروع.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const full = await fetchClientById(id);
        if (cancelled) return;
        if (!full) {
          setClient(null);
          setError('تعذّر العثور على المشروع.');
          return;
        }
        const merged = mergeLocalClientOverrides(full);
        // Read an already-established canonical identity only. This must never
        // call the ensure resolver because ordinary page viewing is non-mutating.
        const identity = await resolvePrimaryEngineeringProjectIdentity(merged.id);
        if (cancelled) return;
        setClient({ ...merged, primary_engineering_project_identity: identity });
      } catch {
        if (!cancelled) {
          setClient(null);
          setError('تعذّر تحميل ملف المشروع.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleUpdated = useCallback(async () => {
    await invalidateErpLists();
    if (id) await invalidateClient(id);
    const full = await fetchClientById(id);
    if (!full) return;
    const merged = mergeLocalClientOverrides(full);
    const identity = await resolvePrimaryEngineeringProjectIdentity(merged.id);
    setClient({ ...merged, primary_engineering_project_identity: identity });
  }, [id]);

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-400 animate-pulse">
        جاري فتح ملف المشروع...
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-900">
          {error || 'تعذّر فتح ملف المشروع.'}
        </div>
        <Link
          href="/projects"
          className="inline-flex touch-target rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
        >
          {t('projects.backToList')}
        </Link>
      </div>
    );
  }

  return (
    <ProjectReportModal
      client={client}
      preferredStage={preferredStage}
      variant="page"
      onClose={() => router.push('/projects')}
      onUpdated={() => void handleUpdated()}
    />
  );
}

export default function ProjectFilePage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-400 animate-pulse">
          جاري فتح ملف المشروع...
        </div>
      }
    >
      <ProjectFileInner />
    </Suspense>
  );
}
