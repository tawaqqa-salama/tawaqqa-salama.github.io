'use client';

import PageHeader from '@/components/shared/PageHeader';
import WhatsAppSettingsPanel from '@/components/whatsapp/WhatsAppSettingsPanel';

export default function WhatsAppSettingsPage() {
  return (
    <div>
      <PageHeader
        title="التكاملات — واتساب"
        description="ربط WhatsApp Business Platform / Cloud API مع التسويق وCRM"
      />
      <WhatsAppSettingsPanel />
    </div>
  );
}
