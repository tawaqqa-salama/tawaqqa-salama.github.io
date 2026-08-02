'use client';

import useSWR, { mutate as globalMutate, type KeyedMutator } from 'swr';
import { SWR_DEFAULTS, LIST_PAGE_SIZE } from '@/lib/data/query-config';
import {
  fetchClientById,
  fetchProjectsList,
  fetchSalesBundle,
  type SalesBundle,
} from '@/lib/data/fetchers';
import type { ClientRecord } from '@/lib/types/client';

export const swrKeys = {
  salesBundle: (limit: number) => ['sales-bundle', limit] as const,
  projectsList: (limit: number) => ['projects-list', limit] as const,
  client: (id: string) => ['client', id] as const,
};

export function useSalesBundle(limit = LIST_PAGE_SIZE) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    swrKeys.salesBundle(limit),
    () => fetchSalesBundle(limit),
    SWR_DEFAULTS
  );

  return {
    clients: data?.clients ?? [],
    documents: data?.documents ?? [],
    contracts: data?.contracts ?? [],
    returns: data?.returns ?? [],
    loading: isLoading,
    refreshing: isValidating && !isLoading,
    error,
    mutate: mutate as KeyedMutator<SalesBundle>,
    refresh: () => mutate(),
  };
}

export function useProjectsList(limit = LIST_PAGE_SIZE) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    swrKeys.projectsList(limit),
    () => fetchProjectsList(limit),
    SWR_DEFAULTS
  );

  return {
    projects: data ?? [],
    loading: isLoading,
    refreshing: isValidating && !isLoading,
    error,
    mutate,
    refresh: () => mutate(),
  };
}

export function useClientDetail(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? swrKeys.client(id) : null,
    () => fetchClientById(id!),
    { ...SWR_DEFAULTS, revalidateOnMount: true }
  );

  return {
    client: data ?? null,
    loading: Boolean(id) && isLoading,
    error,
    mutate,
  };
}

/** إبطال كاش المبيعات/المشاريع بعد حفظ من المودالات */
export async function invalidateErpLists() {
  await Promise.all([
    globalMutate((key) => Array.isArray(key) && key[0] === 'sales-bundle'),
    globalMutate((key) => Array.isArray(key) && key[0] === 'projects-list'),
  ]);
}

export async function invalidateClient(id: string) {
  await globalMutate(swrKeys.client(id));
}
