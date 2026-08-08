/**
 * Alias for Meta / Vercel callback URLs configured as /api/whatsapp/webhook.
 * Canonical handler lives at /api/integrations/whatsapp/webhook.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export { GET, POST } from '@/app/api/integrations/whatsapp/webhook/route';
