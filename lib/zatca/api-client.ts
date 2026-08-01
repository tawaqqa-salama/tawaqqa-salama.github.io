import { ZATCA_BASE_URLS } from '@/lib/zatca/constants';
import { bytesToBase64 } from '@/lib/zatca/crypto';
import type { ZatcaApiResponse, ZatcaEnvironment, ZatcaInvoiceKind, ZatcaSettings } from '@/lib/zatca/types';

function basicAuthHeader(csid: string, secret: string): string {
  const token = bytesToBase64(new TextEncoder().encode(`${csid}:${secret}`));
  return `Basic ${token}`;
}

function baseUrl(environment: ZatcaEnvironment): string {
  return ZATCA_BASE_URLS[environment] || ZATCA_BASE_URLS.sandbox;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { rawText: text };
  }
}

export type OnboardPayload = {
  csr: string;
  otp: string;
  environment: ZatcaEnvironment;
};

/** تسجيل الجهاز — Compliance CSID (Onboarding) */
export async function requestComplianceCsid(payload: OnboardPayload): Promise<{
  ok: boolean;
  error?: string;
  requestID?: string;
  binarySecurityToken?: string;
  secret?: string;
  raw?: unknown;
}> {
  const url = `${baseUrl(payload.environment)}/compliance`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      OTP: payload.otp,
      'Accept-Version': 'V2',
    },
    body: JSON.stringify({ csr: payload.csr.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '') }),
  });

  const raw = await parseJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      error: `فشل Onboarding (${response.status})`,
      raw,
    };
  }

  const data = (raw || {}) as Record<string, unknown>;
  return {
    ok: true,
    requestID: String(data.requestID || data.requestId || ''),
    binarySecurityToken: String(data.binarySecurityToken || ''),
    secret: String(data.secret || ''),
    raw,
  };
}

/** ترقية إلى Production CSID */
export async function requestProductionCsid(settings: ZatcaSettings): Promise<{
  ok: boolean;
  error?: string;
  binarySecurityToken?: string;
  secret?: string;
  raw?: unknown;
}> {
  if (!settings.csid || !settings.secret) {
    return { ok: false, error: 'يلزم CSID و Secret من مرحلة الامتثال أولاً' };
  }
  const url = `${baseUrl(settings.environment)}/production/csids`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(settings.csid, settings.secret),
      'Accept-Version': 'V2',
    },
    body: JSON.stringify({ compliance_request_id: settings.compliance_request_id }),
  });
  const raw = await parseJsonSafe(response);
  if (!response.ok) {
    return { ok: false, error: `فشل طلب Production CSID (${response.status})`, raw };
  }
  const data = (raw || {}) as Record<string, unknown>;
  return {
    ok: true,
    binarySecurityToken: String(data.binarySecurityToken || ''),
    secret: String(data.secret || ''),
    raw,
  };
}

export async function submitInvoiceToZatca(options: {
  settings: ZatcaSettings;
  invoiceKind: ZatcaInvoiceKind;
  uuid: string;
  invoiceHash: string;
  invoiceXml: string;
}): Promise<ZatcaApiResponse> {
  const { settings, invoiceKind, uuid, invoiceHash, invoiceXml } = options;
  if (!settings.csid || !settings.secret) {
    return {
      ok: false,
      status: 'error',
      error: 'إعدادات CSID غير مكتملة. أكمل Onboarding من إعدادات ZATCA.',
    };
  }

  const endpoint =
    invoiceKind === 'standard'
      ? `${baseUrl(settings.environment)}/invoices/clearance/single`
      : `${baseUrl(settings.environment)}/invoices/reporting/single`;

  const invoiceBody = bytesToBase64(new TextEncoder().encode(invoiceXml));

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: basicAuthHeader(settings.csid, settings.secret),
        'Accept-Version': 'V2',
        'Accept-Language': 'AR',
        ClearanceStatus: invoiceKind === 'standard' ? '1' : '0',
      },
      body: JSON.stringify({
        invoiceHash,
        uuid,
        invoice: invoiceBody,
      }),
    });

    const raw = await parseJsonSafe(response);
    const data = (raw || {}) as Record<string, unknown>;
    const clearingStatus = String(data.clearanceStatus || data.ClearanceStatus || '') || null;
    const reportingStatus = String(data.reportingStatus || data.ReportingStatus || '') || null;
    const cleared = typeof data.clearedInvoice === 'string' ? data.clearedInvoice : null;

    if (!response.ok) {
      return {
        ok: false,
        status: 'rejected',
        httpStatus: response.status,
        clearingStatus,
        reportingStatus,
        raw,
        error: `رفضت ZATCA الفاتورة (${response.status})`,
        clearedInvoiceXml: cleared,
      };
    }

    const status =
      invoiceKind === 'standard'
        ? clearingStatus?.toUpperCase().includes('CLEARED') || response.status === 200
          ? 'cleared'
          : 'rejected'
        : reportingStatus?.toUpperCase().includes('REPORTED') || response.status === 200
          ? 'reported'
          : 'rejected';

    return {
      ok: status === 'cleared' || status === 'reported',
      status,
      httpStatus: response.status,
      clearingStatus,
      reportingStatus,
      raw,
      clearedInvoiceXml: cleared,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'تعذر الاتصال بـ ZATCA',
    };
  }
}
