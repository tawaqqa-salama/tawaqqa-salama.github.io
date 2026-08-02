'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ComplianceEnginePanel from '@/components/compliance/ComplianceEnginePanel';
import PageHeader from '@/components/shared/PageHeader';
import type { ClientRecord } from '@/lib/types/client';

/** صفحة اشتراطات كود البناء — SBC/NFPA من الإعدادات */
export default function BuildingCodeSettingsPage() {
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
      <PageHeader
        title="كود البناء واشتراطات السلامة"
        description="محرك الامتثال SBC 801 وNFPA — اشتراطات الأنشطة والمساحات والأنظمة"
      />
      <ComplianceEnginePanel clients={clients} />
    </div>
  );
}
