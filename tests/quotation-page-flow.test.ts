import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');
const modal = read('components/clients/ClientDetailModal.tsx');
const sales = read('app/sales/page.tsx');
const basicPage = read('app/sales/client-basic-data/page.tsx');
const quotationPage = read('app/sales/client-quotation/page.tsx');
const quotationPrint = read('lib/invoices/quotation-print.ts');

describe('standalone quotation page flow', () => {
  it('keeps the basic-data page on basic and opens quotation page on finance', () => {
    expect(basicPage).toContain('presentation="page"');
    expect(quotationPage).toContain('presentation="quotation"');
    expect(modal).toContain("const preferred = isPagePresentation");
    expect(modal).toContain("? 'basic'");
    expect(modal).toContain("? 'finance'");
  });

  it('uses static query-string routes and safe client loading for both pages', () => {
    expect(basicPage).toContain("useSearchParams");
    expect(basicPage).toContain("searchParams.get('clientId') || ''");
    expect(quotationPage).toContain("useSearchParams");
    expect(quotationPage).toContain("searchParams.get('clientId') || ''");
    expect(quotationPage).toContain('useClientDetail(clientId || null)');
    expect(quotationPage).toContain('لم يتم تحديد عميل لعرض سعره.');
    expect(quotationPage).toContain('تعذر الوصول إلى بيانات العميل أو عرض السعر.');
    expect(quotationPage).toContain("router.push('/sales')");
    expect(quotationPage).not.toContain('[clientId]');
  });

  it('exposes both actions from Sales without replacing one page with the other', () => {
    expect(sales).toContain("/sales/client-basic-data?clientId=");
    expect(sales).toContain("/sales/client-quotation?clientId=");
    expect(sales).toContain("label: 'البيانات الأساسية'");
    expect(sales).toContain("label: 'عرض السعر'");
    expect(sales).toContain("label: 'تحرير العرض'");
  });

  it('reuses existing quotation content and preserves lock, edit, and print handlers', () => {
    for (const text of [
      'رقم عرض السعر',
      'حالة عرض السعر',
      'عدد الزيارات الميدانية',
      'نوع البيع',
      'نطاق عرض السعر',
      'التسعير التلقائي بالمتر المربع',
      'المبلغ الأساسي (قبل الضريبة)',
      'ضريبة القيمة المضافة (15%)',
      'الإجمالي شامل الضريبة',
      'إصدار عرض السعر',
      'طباعة عرض السعر',
      'حالة الاعتماد المالي',
      'مرجع الدفع',
      'المبلغ المدفوع',
      'اصدار فاتورة جديدة',
      'handleCreateQuotation',
      'handlePrintQuotation',
      'handleSaveFinance',
      'quotationLocked',
      'contractLinked',
    ]) {
      expect(modal).toContain(text);
    }
    expect(quotationPrint).toContain('validateSavedQuotationForPrint');
    expect(quotationPrint).toContain('printSavedQuotation');
  });

  it('keeps the static routes free of dynamic client segments', () => {
    expect(read('app/sales/client-basic-data/page.tsx')).not.toContain('[clientId]');
    expect(quotationPage).not.toContain('[clientId]');
    expect(quotationPage).toContain('presentation="quotation"');
  });

  it('hydrates once per client identity and preserves a dirty draft across revalidation', () => {
    expect(modal).toContain('const lastHydratedClientIdRef = useRef<string | null>(null);');
    expect(modal).toContain('lastHydratedClientIdRef.current === client.id');
    expect(modal).toContain('}, [client?.id]);');
    expect(modal).toContain('if (!client || isDirty');
    expect(modal).toContain('setIsDirty(false);');
  });

  it('locks quotation only while contract lookup is pending or a contract is linked', () => {
    expect(modal).toContain('const quotationLocked = contractLinked || contractCheckLoading;');
    expect(modal).not.toContain('(quotationIsIssued && !quotationEditMode)');
    expect(modal).toContain('findExistingContractForQuote');
  });

  it('keeps print read-only and preserves the existing quotation number on edit', () => {
    expect(modal).toContain('const printableClient = {');
    expect(modal).toContain('quotation_number: quotationNumber || client.quotation_number');
    expect(modal).toContain('const nextQuotationNumber = quotationNumber || (await generateQuotationNumber());');
    expect(modal).toContain('quotation_number: nextQuotationNumber');
    expect(modal).not.toContain('quotation_status: \'معتمد\'');
  });
});

