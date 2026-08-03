'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ComplianceEnginePanel from '@/components/compliance/ComplianceEnginePanel';
import PageHeader from '@/components/shared/PageHeader';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { ClientRecord } from '@/lib/types/client';

/** صفحة اشتراطات كود البناء — SBC/NFPA من الإعدادات */
export default function BuildingCodeSettingsPage() {
  const { t } = useLanguage();
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
      <PageHeader title={t('compliance.page.title')} description={t('compliance.page.subtitle')} />
      <ComplianceEnginePanel clients={clients} />
    </div>
  );
}
