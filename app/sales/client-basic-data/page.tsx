'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useClientDetail, invalidateClient } from '@/lib/data/hooks';
import { mergeLocalClientOverrides } from '@/lib/supabase/safe-client-write';
import type { ClientRecord } from '@/lib/types/client';

const ClientDetailModal = dynamic(() => import('@/components/clients/ClientDetailModal'), {
  ssr: false,
});

export default function BasicClientDataPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') || '';
  const { client, loading, error, mutate } = useClientDetail(clientId || null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleUpdated = useCallback(async (updatedClient?: ClientRecord) => {
    if (updatedClient) {
      await mutate((current) => current ? { ...current, ...updatedClient } : updatedClient, { revalidate: false });
      return;
    }
    await mutate();
  }, [mutate]);

  const handleContinue = useCallback(async () => {
    await invalidateClient(clientId);
    router.push(`/projects/file?id=${encodeURIComponent(clientId)}&stage=projects`);
  }, [clientId, router]);

  if (!clientId) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <p>لم يتم تحديد عميل لعرض بياناته الأساسية.</p>
          <button type="button" onClick={() => router.push('/sales')} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            العودة إلى المبيعات
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-5xl animate-pulse rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
          جاري تحميل البيانات الأساسية...
        </div>
      </main>
    );
  }

  if (error || !client) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <p>{error instanceof Error ? error.message : 'تعذّر تحميل بيانات العميل.'}</p>
          <button type="button" onClick={() => router.push('/sales')} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            العودة إلى المبيعات
          </button>
        </div>
      </main>
    );
  }

  return (
    <ClientDetailModal
      client={mergeLocalClientOverrides(client)}
      department="sales"
      presentation="page"
      onClose={() => router.back()}
      onUpdated={handleUpdated}
      onDirtyChange={setIsDirty}
      onNavigate={(target) => {
        const path = target === 'quotation' ? '/sales/client-quotation' : '/sales/client-basic-data';
        router.push(`${path}?clientId=${encodeURIComponent(clientId)}`);
      }}
      onSaveAndContinue={handleContinue}
    />
  );
}
