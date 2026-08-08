import type {
  ProviderMediaResult,
  ProviderSendResult,
  SendMediaInput,
  SendTemplateInput,
  SendTextInput,
  WhatsAppProvider,
} from '@/lib/whatsapp/provider/types';

let seq = 0;

export class StubWhatsAppProvider implements WhatsAppProvider {
  readonly id = 'stub';

  async sendText(input: SendTextInput): Promise<ProviderSendResult> {
    seq += 1;
    return {
      ok: true,
      stubbed: true,
      providerMessageId: `stub-text-${seq}-${input.to.slice(-4)}`,
    };
  }

  async sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult> {
    seq += 1;
    return {
      ok: true,
      stubbed: true,
      providerMessageId: `stub-tpl-${seq}-${input.templateName}`,
    };
  }

  async sendImage(input: SendMediaInput): Promise<ProviderSendResult> {
    seq += 1;
    return { ok: true, stubbed: true, providerMessageId: `stub-img-${seq}` };
  }

  async sendDocument(input: SendMediaInput): Promise<ProviderSendResult> {
    seq += 1;
    return { ok: true, stubbed: true, providerMessageId: `stub-doc-${seq}` };
  }

  async sendMessage(): Promise<ProviderSendResult> {
    seq += 1;
    return { ok: true, stubbed: true, providerMessageId: `stub-msg-${seq}` };
  }

  async getMedia(): Promise<ProviderMediaResult> {
    return { ok: false, errorMessage: 'stub_no_media' };
  }

  async markAsRead(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  verifyWebhook(params: {
    mode: string | null;
    verifyToken: string | null;
    challenge: string | null;
    expectedToken: string | null;
  }): { ok: boolean; challenge?: string } {
    if (params.mode !== 'subscribe') return { ok: false };
    if (!params.expectedToken || params.verifyToken !== params.expectedToken) {
      return { ok: false };
    }
    return { ok: true, challenge: params.challenge || '' };
  }

  async testConnection(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'stub_ready' };
  }
}
