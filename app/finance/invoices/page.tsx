'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import TaxInvoicesPanel from '@/components/invoices/TaxInvoicesPanel';
import type { ClientRecord } from '@/lib/types/client';

export default function FinanceInvoicesPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);

  useEffect(() => {
    void supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setClients((data || []) as ClientRecord[]));
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
