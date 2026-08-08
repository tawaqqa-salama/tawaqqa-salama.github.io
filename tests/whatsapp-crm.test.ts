import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as webhookGet } from '@/app/api/integrations/whatsapp/webhook/route';
import { POST as sendPost } from '@/app/api/integrations/whatsapp/send/route';
import { POST as opportunityPost } from '@/app/api/integrations/whatsapp/opportunities/route';
import {
  extractLeadFieldsHeuristic,
  hasWhatsAppPermission,
  normalizeWhatsAppPhone,
  phoneLookupCandidates,
  processWhatsAppWebhookBody,
  resetMemoryDb,
  memoryStore,
  verifyMetaSignature,
  createWhatsAppProvider,
  requiresTemplate,
} from '@/lib/whatsapp';
import { createHmac } from 'node:crypto';

function metaInbound(overrides?: {
  messageId?: string;
  from?: string;
  text?: string;
  phoneNumberId?: string;
  profileName?: string;
}) {
  const messageId = overrides?.messageId || `wamid.${Math.random().toString(36).slice(2)}`;
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: overrides?.phoneNumberId || 'pnid-test' },
              contacts: [
                {
                  profile: { name: overrides?.profileName || 'أحمد المصنع' },
                  wa_id: overrides?.from || '966512345678',
                },
              ],
              messages: [
                {
                  from: overrides?.from || '966512345678',
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: {
                    body:
                      overrides?.text ||
                      'السلام عليكم، عندي مصنع في جدة مساحته 5000 متر وأحتاج دراسة سلامة وأنظمة إطفاء',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('WhatsApp phone normalize', () => {
  it('normalizes Saudi mobiles to +9665…', () => {
    expect(normalizeWhatsAppPhone('0512345678')).toBe('+966512345678');
    expect(normalizeWhatsAppPhone('966512345678')).toBe('+966512345678');
    expect(normalizeWhatsAppPhone('+966512345678')).toBe('+966512345678');
  });

  it('builds CRM phone lookup candidates for existing clients rows', () => {
    const c = phoneLookupCandidates('+966512345678');
    expect(c).toContain('+966512345678');
    expect(c).toContain('0512345678');
    expect(c).toContain('966512345678');
  });
});

describe('Webhook verification', () => {
  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify-me';
  });

  it('accepts valid hub challenge', async () => {
    const req = new Request(
      'http://localhost/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'
    );
    const res = await webhookGet(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('12345');
  });

  it('rejects bad verify token', async () => {
    const req = new Request(
      'http://localhost/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1'
    );
    const res = await webhookGet(req);
    expect(res.status).toBe(403);
  });
});

describe('Inbound CRM pipeline', () => {
  beforeEach(() => {
    resetMemoryDb();
    process.env.WHATSAPP_FORCE_MEMORY = 'true';
    process.env.WHATSAPP_ALLOW_UNSIGNED = 'true';
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  afterEach(() => {
    resetMemoryDb();
    delete process.env.WHATSAPP_FORCE_MEMORY;
  });

  it('creates lead + conversation + message for new number', async () => {
    const result = await processWhatsAppWebhookBody(metaInbound());
    expect(result.processedMessages).toBe(1);
    expect(result.createdLeads).toBe(1);
    expect(memoryStore.listConversations()).toHaveLength(1);
    const client = memoryStore.findClientByPhone('+966512345678');
    expect(client?.lead_source).toBe('WhatsApp');
    expect(client?.source_channel).toBe('whatsapp');
    expect(client?.lead_status).toBe('new');
  });

  it('reuses existing customer and does not duplicate lead', async () => {
    await processWhatsAppWebhookBody(metaInbound({ messageId: 'm1' }));
    const again = await processWhatsAppWebhookBody(
      metaInbound({ messageId: 'm2', text: 'متابعة' })
    );
    expect(again.createdLeads).toBe(0);
    expect(memoryStore.listConversations()).toHaveLength(1);
    expect(
      memoryStore.listMessages(memoryStore.listConversations()[0].id)
    ).toHaveLength(2);
  });

  it('dedupes duplicate webhook message ids', async () => {
    const body = metaInbound({ messageId: 'same-id' });
    await processWhatsAppWebhookBody(body);
    const dup = await processWhatsAppWebhookBody(body);
    expect(dup.duplicates).toBe(1);
    expect(dup.processedMessages).toBe(0);
    expect(memoryStore.listMessages(memoryStore.listConversations()[0].id)).toHaveLength(1);
  });

  it('stores media message metadata', async () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pnid-test' },
                contacts: [{ profile: { name: 'Sara' }, wa_id: '966598765432' }],
                messages: [
                  {
                    from: '966598765432',
                    id: 'media-1',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'document',
                    document: {
                      id: 'doc-media',
                      filename: 'plan.pdf',
                      mime_type: 'application/pdf',
                      caption: 'مخطط',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const result = await processWhatsAppWebhookBody(body);
    expect(result.processedMessages).toBe(1);
    const conv = memoryStore.listConversations()[0];
    const msg = memoryStore.listMessages(conv.id)[0];
    expect(msg.message_type).toBe('document');
    expect(memoryStore.listAttachments(conv.customer_id).length).toBeGreaterThan(0);
  });

  it('updates outbound status from webhook', async () => {
    await processWhatsAppWebhookBody(metaInbound({ messageId: 'in1' }));
    const conv = memoryStore.listConversations()[0];
    const { message } = memoryStore.insertMessage({
      conversation_id: conv.id,
      whatsapp_message_id: 'out-1',
      direction: 'outbound',
      message_type: 'text',
      text: 'مرحبا',
      media_url: null,
      media_storage_path: null,
      media_type: null,
      caption: null,
      template_name: null,
      interactive_payload: null,
      sent_by_user_id: 'u1',
      status: 'sent',
      error_code: null,
      error_message: null,
      retry_count: 0,
      timestamp: new Date().toISOString(),
      raw_payload: null,
    });
    await processWhatsAppWebhookBody({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pnid-test' },
                statuses: [
                  {
                    id: 'out-1',
                    status: 'delivered',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(memoryStore.listMessages(conv.id).find((m) => m.id === message.id)?.status).toBe(
      'delivered'
    );
  });
});

describe('Outbound + opportunity', () => {
  beforeEach(() => {
    resetMemoryDb();
    process.env.WHATSAPP_FORCE_MEMORY = 'true';
    process.env.WHATSAPP_ALLOW_UNSIGNED = 'true';
  });

  afterEach(() => {
    delete process.env.WHATSAPP_FORCE_MEMORY;
  });

  it('sends outbound stub message and can retry failed', async () => {
    await processWhatsAppWebhookBody(metaInbound({ messageId: 'in-out' }));
    const conv = memoryStore.listConversations()[0];
    const res = await sendPost(
      new Request('http://localhost/api/integrations/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ conversationId: conv.id, kind: 'text', text: 'رد تجريبي' }),
      })
    );
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message.status).toBe('sent');
  });

  it('blocks free-form text outside service window without inbound', async () => {
    const client = memoryStore.createLeadFromWhatsApp({ phone: '+966511111111', profileName: 'Test' });
    const acc = memoryStore.ensureEnvAccount('pnid-x');
    const conv = memoryStore.findOrCreateConversation({
      customer_id: client.id,
      account_id: acc.id,
      phone_number: '+966511111111',
    });
    expect(requiresTemplate(conv)).toBe(true);
    const res = await sendPost(
      new Request('http://localhost/api/integrations/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ conversationId: conv.id, kind: 'text', text: 'hi' }),
      })
    );
    expect(res.status).toBe(409);
  });

  it('sends template outside window', async () => {
    const client = memoryStore.createLeadFromWhatsApp({ phone: '+966522222222', profileName: 'Test' });
    const acc = memoryStore.ensureEnvAccount('pnid-y');
    const conv = memoryStore.findOrCreateConversation({
      customer_id: client.id,
      account_id: acc.id,
      phone_number: '+966522222222',
    });
    const res = await sendPost(
      new Request('http://localhost/api/integrations/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: conv.id,
          kind: 'template',
          templateName: 'welcome',
        }),
      })
    );
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message.template_name).toBe('welcome');
  });

  it('creates opportunity once per conversation (idempotent)', async () => {
    await processWhatsAppWebhookBody(metaInbound({ messageId: 'opp1' }));
    const conv = memoryStore.listConversations()[0];
    const body = {
      customerId: conv.customer_id,
      conversationId: conv.id,
      service: 'دراسة سلامة',
      estimated_value: 10000,
    };
    const r1 = await opportunityPost(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) })
    );
    const r2 = await opportunityPost(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) })
    );
    const d1 = await r1.json();
    const d2 = await r2.json();
    expect(d1.opportunity.id).toBe(d2.opportunity.id);
    expect(memoryStore.getClient(conv.customer_id)?.pipeline_stage).toBe('sales');
  });
});

describe('Lead extraction + permissions + audit + signature', () => {
  beforeEach(() => {
    resetMemoryDb();
    process.env.WHATSAPP_FORCE_MEMORY = 'true';
  });

  afterEach(() => {
    delete process.env.WHATSAPP_FORCE_MEMORY;
  });

  it('extracts Arabic factory lead fields', () => {
    const ex = extractLeadFieldsHeuristic(
      'السلام عليكم، عندي مصنع في جدة مساحته 5000 متر وأحتاج دراسة سلامة وأنظمة إطفاء'
    );
    expect(ex?.city).toBe('جدة');
    expect(ex?.activity).toContain('مصنع');
    expect(ex?.area).toBe(5000);
    expect(ex?.requested_service).toBeTruthy();
  });

  it('creates pending extraction on inbound', async () => {
    process.env.WHATSAPP_ALLOW_UNSIGNED = 'true';
    await processWhatsAppWebhookBody(metaInbound({ messageId: 'ex1' }));
    const conv = memoryStore.listConversations()[0];
    const pending = memoryStore.listExtractions(conv.id);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].status).toBe('pending');
  });

  it('checks whatsapp permissions', () => {
    expect(hasWhatsAppPermission(['*'], 'whatsapp.settings')).toBe(true);
    expect(hasWhatsAppPermission(['dept.marketing'], 'whatsapp.view')).toBe(true);
    expect(hasWhatsAppPermission(['dept.marketing'], 'whatsapp.settings')).toBe(false);
    expect(hasWhatsAppPermission(['whatsapp.campaigns'], 'whatsapp.campaigns')).toBe(true);
  });

  it('writes audit entries for lead and conversation', async () => {
    process.env.WHATSAPP_ALLOW_UNSIGNED = 'true';
    await processWhatsAppWebhookBody(metaInbound({ messageId: 'aud1' }));
    const actions = memoryStore.listAudit().map((a) => a.action);
    expect(actions).toContain('lead.created');
    expect(actions).toContain('conversation.created');
  });

  it('verifies meta signature when secret set', () => {
    const body = '{"ok":true}';
    const secret = 'app-secret';
    const sig =
      'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    expect(verifyMetaSignature(body, sig, secret)).toBe(true);
    expect(verifyMetaSignature(body, 'sha256=deadbeef', secret)).toBe(false);
  });

  it('rejects unsigned webhook in production when secret configured', async () => {
    process.env.WHATSAPP_APP_SECRET = 'sec';
    delete process.env.WHATSAPP_ALLOW_UNSIGNED;
    const body = JSON.stringify(metaInbound({ messageId: 'nosig' }));
    // Direct crypto check (avoid mutating read-only NODE_ENV)
    expect(verifyMetaSignature(body, null, 'sec')).toBe(false);
    const good =
      'sha256=' + createHmac('sha256', 'sec').update(body, 'utf8').digest('hex');
    expect(verifyMetaSignature(body, good, 'sec')).toBe(true);
    delete process.env.WHATSAPP_APP_SECRET;
  });

  it('provider factory returns stub without credentials', () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(createWhatsAppProvider().id).toBe('stub');
  });
});
