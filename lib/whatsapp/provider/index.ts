import { getWhatsAppEnvConfig } from '@/lib/whatsapp/config';
import { MetaWhatsAppProvider } from '@/lib/whatsapp/provider/meta';
import { StubWhatsAppProvider } from '@/lib/whatsapp/provider/stub';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider/types';

export type { WhatsAppProvider } from '@/lib/whatsapp/provider/types';
export { MetaWhatsAppProvider } from '@/lib/whatsapp/provider/meta';
export { StubWhatsAppProvider } from '@/lib/whatsapp/provider/stub';

/** Factory — Meta when configured; stub otherwise. Swap provider without CRM rewrite. */
export function createWhatsAppProvider(force?: 'meta' | 'stub'): WhatsAppProvider {
  if (force === 'stub') return new StubWhatsAppProvider();
  if (force === 'meta') return new MetaWhatsAppProvider();
  const cfg = getWhatsAppEnvConfig();
  if (cfg.configured && cfg.provider === 'meta') {
    return new MetaWhatsAppProvider();
  }
  // Future: twilio / 360dialog adapters register here
  return new StubWhatsAppProvider();
}
