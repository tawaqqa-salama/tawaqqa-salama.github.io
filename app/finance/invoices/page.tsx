'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { fetchClientsList } from '@/lib/data/fetchers';
import type { ClientRecord } from '@/lib/types/client';

const TaxInvoicesPanel = dynamic(() => import('@/components/invoices/TaxInvoicesPanel'), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
      جاري تحميل الفواتير...
    </div>
  ),
});

export default function FinanceInvoicesPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);

  useEffect(() => {
    void fetchClientsList({ limit: 40 }).then(setClients);
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">الحسابات المالية — الفواتير الضريبية</h1>
        <p className="text-sm text-gray-500 mt-1">
          إصدار ومتابعة الفواتير الضريبية المتوافقة مع ZATCA Phase 2 (قياسية / مبسطة)
        </p>
      </div>
      <TaxInvoicesPanel clients={clients} />
    </div>
  );
}
