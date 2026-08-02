'use client';

import { Suspense } from 'react';
import ProcurementModule from '@/components/procurement/ProcurementModule';

export default function ProcurementPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 py-10 text-center">جاري التحميل...</div>}>
      <ProcurementModule />
    </Suspense>
  );
}
