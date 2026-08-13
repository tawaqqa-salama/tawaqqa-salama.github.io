export type WhatsAppProviderId = 'meta' | 'twilio' | '360dialog' | 'other' | 'stub';

export type WhatsAppAccountStatus = 'active' | 'inactive' | 'error' | 'pending';

export type ConversationStatus = 'open' | 'pending' | 'closed';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageStatus =
  | 'received'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export type LeadSource =
  | 'WhatsApp'
  | 'Website'
  | 'Phone'
  | 'Referral'
  | 'Campaign'
  | 'Other';

export type WhatsAppPermission =
  | 'whatsapp.view'
  | 'whatsapp.send'
  | 'whatsapp.manage'
  | 'whatsapp.campaigns'
  | 'whatsapp.settings'
  | 'whatsapp.assign';

export type WhatsAppAccount = {
  id: string;
  business_name: string | null;
  phone_number: string | null;
  phone_number_id: string;
  waba_id: string | null;
  access_token_encrypted: string | null;
  webhook_verify_token: string | null;
  status: WhatsAppAccountStatus;
  provider: WhatsAppProviderId;
  last_webhook_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerWhatsAppContact = {
  id: string;
  customer_id: string;
  phone_number: string;
  wa_contact_id: string | null;
  profile_name: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type WhatsAppConversation = {
  id: string;
  company_id?: string | null;
  customer_id: string;
  whatsapp_account_id: string | null;
  phone_number: string;
  status: ConversationStatus;
  assigned_user_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  service_window_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppMessage = {
  id: string;
  conversation_id: string;
  whatsapp_message_id: string | null;
  direction: MessageDirection;
  message_type: string;
  text: string | null;
  media_url: string | null;
  media_storage_path: string | null;
  media_type: string | null;
  caption: string | null;
  template_name: string | null;
  interactive_payload: Record<string, unknown> | null;
  sent_by_user_id: string | null;
  status: MessageStatus;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  timestamp: string;
  raw_payload: unknown;
  created_at: string;
};

export type CrmOpportunity = {
  id: string;
  customer_id: string;
  conversation_id: string | null;
  title: string | null;
  service: string | null;
  estimated_value: number | null;
  probability: number | null;
  expected_close_date: string | null;
  source: string;
  status: 'open' | 'won' | 'lost' | 'converted';
  assigned_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  display_name_ar: string | null;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  body: string;
  variables: unknown[];
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'disabled';
  meta_template_name: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppCampaign = {
  id: string;
  name: string;
  template_id: string | null;
  audience_filter: Record<string, unknown>;
  scheduled_at: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled' | 'failed';
  stats: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    replies: number;
    leads: number;
    opportunities: number;
    conversions: number;
  };
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppAutomation = {
  id: string;
  name: string;
  trigger: string;
  conditions: Record<string, unknown>;
  action: string;
  template_id: string | null;
  delay_minutes: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadExtractionProposal = {
  id: string;
  conversation_id: string;
  customer_id: string | null;
  message_id: string | null;
  proposed: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'edited' | 'ignored';
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppNotification = {
  id: string;
  user_id: string | null;
  conversation_id: string | null;
  customer_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export type InboundParsedMessage = {
  providerMessageId: string;
  phoneNumberId: string;
  from: string;
  profileName?: string | null;
  timestamp: string;
  type: string;
  text?: string | null;
  caption?: string | null;
  mediaId?: string | null;
  mediaMimeType?: string | null;
  interactive?: Record<string, unknown> | null;
  raw: unknown;
};

export type InboundStatusUpdate = {
  providerMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  raw: unknown;
};

export type WhatsAppDashboardStats = {
  newLeads: number;
  openConversations: number;
  unreadMessages: number;
  avgResponseMinutes: number | null;
  conversionRate: number;
  quotesGenerated: number;
  projectsWon: number;
  range: 'today' | '7d' | '30d' | 'custom';
};
