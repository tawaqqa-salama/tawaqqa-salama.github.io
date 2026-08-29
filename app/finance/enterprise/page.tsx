'use client';

import { Suspense } from 'react';
import EnterpriseAccountingModule from '@/components/finance/EnterpriseAccountingModule';

export default function EnterpriseAccountingPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-400">جاري التحميل...</div>}>
      <EnterpriseAccountingModule />
    </Suspense>
  );
}
