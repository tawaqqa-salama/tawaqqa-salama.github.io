/**
 * Compatibility alias for Meta / Vercel callback URLs registered as:
 *   https://HOST/api/whatsapp/webhook
 * Canonical handler lives at /api/integrations/whatsapp/webhook.
 */
export { GET, POST, runtime, dynamic } from '@/app/api/integrations/whatsapp/webhook/route';
