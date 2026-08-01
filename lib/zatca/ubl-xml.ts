import type { ZatcaInvoiceInput } from '@/lib/zatca/types';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: number): string {
  return (Math.round(Number(value || 0) * 100) / 100).toFixed(2);
}

/**
 * بناء هيكل فاتورة UBL 2.1 وفق متطلبات ZATCA (هيكل تشغيلي للربط).
 * يُحقن UUID و PIH و Hash و QR داخل المستند.
 */
export function buildUblInvoiceXml(
  input: ZatcaInvoiceInput,
  options: {
    invoiceHashPlaceholder?: string;
    qrBase64?: string;
    ublExtensionsXml?: string;
  } = {}
): string {
  const currency = input.currency || 'SAR';
  const invoiceTypeCode = input.invoiceKind === 'standard' ? '388' : '388';
  const ksaType = input.invoiceKind === 'standard' ? '0100000' : '0200000';
  const hashValue = options.invoiceHashPlaceholder || '';
  const qr = options.qrBase64 || '';
  const extensions = options.ublExtensionsXml || '';

  const seller = input.seller;
  const buyer = input.buyer || {};
  const linesXml = input.lines
    .map(
      (line) => `
    <cac:InvoiceLine>
      <cbc:ID>${esc(line.id)}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="PCE">${line.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${money(line.lineExtensionAmount)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${currency}">${money(line.taxAmount)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${currency}">${money(line.lineExtensionAmount)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${currency}">${money(line.taxAmount)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID>S</cbc:ID>
            <cbc:Percent>${money(line.taxPercent)}</cbc:Percent>
            <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${esc(line.name)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${money(line.taxPercent)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${currency}">${money(line.unitPrice)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  ${extensions}
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${esc(input.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${esc(input.uuid)}</cbc:UUID>
  <cbc:IssueDate>${esc(input.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${esc(input.issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${ksaType}">${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${currency}</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>1</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(input.previousInvoiceHash)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(qr)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>IHL</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(hashValue)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${esc(seller.crNumber || '')}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(seller.street || seller.city || 'Riyadh')}</cbc:StreetName>
        <cbc:BuildingNumber>${esc(seller.buildingNumber || '0000')}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${esc(seller.district || seller.city || 'Riyadh')}</cbc:CitySubdivisionName>
        <cbc:CityName>${esc(seller.city || 'Riyadh')}</cbc:CityName>
        <cbc:PostalZone>${esc(seller.postalCode || '12345')}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(seller.countryCode || 'SA')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(seller.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(seller.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(buyer.street || buyer.city || 'NA')}</cbc:StreetName>
        <cbc:CityName>${esc(buyer.city || 'Riyadh')}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>${esc(buyer.countryCode || 'SA')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${
        buyer.vatNumber
          ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(buyer.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>`
          : ''
      }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(buyer.name || 'Customer')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${esc(input.issueDate)}</cbc:ActualDeliveryDate>
  </cac:Delivery>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${money(input.taxAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${money(input.taxExclusiveAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${money(input.taxAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${money(input.lineExtensionAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${money(input.taxExclusiveAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${money(input.payableAmount)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${money(input.payableAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${linesXml}
</Invoice>`;
}

export function injectQrAndHash(xml: string, invoiceHash: string, qrBase64: string): string {
  return xml
    .replace(
      /(<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject[^>]*>)([\s\S]*?)(<\/cbc:EmbeddedDocumentBinaryObject>)/i,
      `$1${qrBase64}$3`
    )
    .replace(
      /(<cac:AdditionalDocumentReference>\s*<cbc:ID>IHL<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject[^>]*>)([\s\S]*?)(<\/cbc:EmbeddedDocumentBinaryObject>)/i,
      `$1${invoiceHash}$3`
    );
}
