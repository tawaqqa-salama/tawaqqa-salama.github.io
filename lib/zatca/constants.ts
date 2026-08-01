import type { ZatcaEnvironment, ZatcaSettings } from '@/lib/zatca/types';

/** PIH لأول فاتورة في سلسلة الجهاز (قيمة ZATCA الرسمية) */
export const ZATCA_FIRST_PIH =
  'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

export const ZATCA_BASE_URLS: Record<ZatcaEnvironment, string> = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

export const DEFAULT_ZATCA_SETTINGS: ZatcaSettings = {
  enabled: false,
  environment: 'sandbox',
  invoice_kind: 'simplified',
  otp: '',
  csid: '',
  secret: '',
  compliance_request_id: '',
  private_key_pem: '',
  csr_pem: '',
  certificate_pem: '',
  egss_serial: '',
  solution_name: 'TawaqqaSalamaEGS',
};

export const ZATCA_LOCAL_SETTINGS_KEY = 'tawaqqa_zatca_settings_v1';
export const ZATCA_LOCAL_CHAIN_KEY = 'tawaqqa_zatca_pih_chain_v1';
