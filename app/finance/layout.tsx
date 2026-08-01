import { Suspense } from 'react';
import { FinanceSubNav } from '@/components/finance/FinanceSubNav';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-w-0">
      <Suspense fallback={<div className="mb-4 h-12 rounded-xl bg-white border animate-pulse" />}>
        <FinanceSubNav />
      </Suspense>
      {children}
    </div>
  );
}
