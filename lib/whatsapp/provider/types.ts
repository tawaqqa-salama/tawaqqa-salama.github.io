export type SendTextInput = {
  to: string;
  text: string;
  phoneNumberId?: string;
};

export type SendTemplateInput = {
  to: string;
  templateName: string;
  language?: string;
  components?: unknown[];
  phoneNumberId?: string;
};

export type SendMediaInput = {
  to: string;
  kind: 'image' | 'document' | 'audio' | 'video';
  link?: string;
  mediaId?: string;
  caption?: string;
  filename?: string;
  phoneNumberId?: string;
};

export type ProviderSendResult = {
  ok: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  stubbed?: boolean;
  raw?: unknown;
};

export type ProviderMediaResult = {
  ok: boolean;
  url?: string;
  mimeType?: string;
  errorMessage?: string;
};

export interface WhatsAppProvider {
  readonly id: string;
  sendText(input: SendTextInput): Promise<ProviderSendResult>;
  sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult>;
  sendImage(input: SendMediaInput): Promise<ProviderSendResult>;
  sendDocument(input: SendMediaInput): Promise<ProviderSendResult>;
  sendMessage(input: {
    to: string;
    type: string;
    payload: Record<string, unknown>;
    phoneNumberId?: string;
  }): Promise<ProviderSendResult>;
  getMedia(mediaId: string): Promise<ProviderMediaResult>;
  markAsRead(providerMessageId: string, phoneNumberId?: string): Promise<{ ok: boolean }>;
  verifyWebhook(params: {
    mode: string | null;
    verifyToken: string | null;
    challenge: string | null;
    expectedToken: string | null;
  }): { ok: boolean; challenge?: string };
  testConnection(): Promise<{ ok: boolean; detail?: string }>;
}
