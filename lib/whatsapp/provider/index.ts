import { getWhatsAppEnvConfig } from '@/lib/whatsapp/config';
import { MetaWhatsAppProvider } from '@/lib/whatsapp/provider/meta';
import { StubWhatsAppProvider } from '@/lib/whatsapp/provider/stub';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider/types';

export type { WhatsAppProvider } from '@/lib/whatsapp/provider/types';
export { MetaWhatsAppProvider } from '@/lib/whatsapp/provider/meta';
export { StubWhatsAppProvider } from '@/lib/whatsapp/provider/stub';

/**
 * Factory — Meta Cloud API when WHATSAPP_* credentials exist.
 * Stub is for unit tests / local demo only (never treat stub as production channel).
 * Swap providers without CRM rewrite (Twilio / 360dialog later).
 */
export function createWhatsAppProvider(force?: 'meta' | 'stub'): WhatsAppProvider {
  if (force === 'stub') return new StubWhatsAppProvider();
  if (force === 'meta') return new MetaWhatsAppProvider();
  const cfg = getWhatsAppEnvConfig();
  if (cfg.configured && (cfg.provider === 'meta' || !cfg.provider)) {
    return new MetaWhatsAppProvider();
  }
  // Future: twilio / 360dialog adapters register here
  return new StubWhatsAppProvider();
}
