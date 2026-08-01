export type ZatcaEnvironment = 'sandbox' | 'simulation' | 'production';

export type ZatcaInvoiceKind = 'simplified' | 'standard';

export type ZatcaSubmissionStatus =
  | 'pending'
  | 'queued'
  | 'reported'
  | 'cleared'
  | 'rejected'
  | 'error'
  | 'disabled';

export type ZatcaSettings = {
  enabled: boolean;
  environment: ZatcaEnvironment;
  invoice_kind: ZatcaInvoiceKind;
  otp: string;
  /** Binary security token / CSID من استجابة ZATCA */
  csid: string;
  secret: string;
  compliance_request_id: string;
  private_key_pem: string;
  csr_pem: string;
  certificate_pem: string;
  egss_serial: string;
  solution_name: string;
};

export type ZatcaInvoiceLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineExtensionAmount: number;
  taxAmount: number;
  taxPercent: number;
};

export type ZatcaInvoiceInput = {
  uuid: string;
  invoiceNumber: string;
  issueDate: string;
  issueTime: string;
  invoiceKind: ZatcaInvoiceKind;
  previousInvoiceHash: string;
  seller: {
    name: string;
    vatNumber: string;
    crNumber?: string;
    street?: string;
    buildingNumber?: string;
    district?: string;
    city?: string;
    postalCode?: string;
    countryCode?: string;
  };
  buyer?: {
    name?: string;
    vatNumber?: string;
    street?: string;
    city?: string;
    countryCode?: string;
  };
  lines: ZatcaInvoiceLine[];
  lineExtensionAmount: number;
  taxExclusiveAmount: number;
  taxAmount: number;
  payableAmount: number;
  currency?: string;
};

export type ZatcaBuiltInvoice = {
  uuid: string;
  invoiceNumber: string;
  invoiceHash: string;
  previousInvoiceHash: string;
  qrBase64: string;
  xml: string;
  signedXml: string;
};

export type ZatcaApiResponse = {
  ok: boolean;
  status: ZatcaSubmissionStatus;
  httpStatus?: number;
  clearingStatus?: string | null;
  reportingStatus?: string | null;
  raw?: unknown;
  error?: string | null;
  clearedInvoiceXml?: string | null;
  qrBase64?: string | null;
};

export type ZatcaInvoiceRecord = {
  id: string;
  client_id: string | null;
  sales_document_id: string | null;
  invoice_number: string;
  uuid: string;
  invoice_hash: string;
  previous_invoice_hash: string;
  qr_base64: string | null;
  xml: string;
  status: ZatcaSubmissionStatus;
  environment: ZatcaEnvironment;
  invoice_kind: ZatcaInvoiceKind;
  zatca_response: unknown;
  created_at?: string;
  updated_at?: string;
};
