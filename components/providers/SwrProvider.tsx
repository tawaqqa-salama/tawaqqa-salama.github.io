'use client';

import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { SWR_DEFAULTS } from '@/lib/data/query-config';

export default function SwrProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        ...SWR_DEFAULTS,
        shouldRetryOnError: false,
        errorRetryCount: 1,
      }}
    >
      {children}
    </SWRConfig>
  );
}
