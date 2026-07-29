'use client';

import { Suspense } from 'react';
import EmployeePageByUsername from './EmployeePageClient';

export default function EmployeeUsernamePage() {
  return (
    <Suspense fallback={<p className="text-gray-500">جاري التحميل...</p>}>
      <EmployeePageByUsername />
    </Suspense>
  );
}
