import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8');
const modal = read('components/clients/ClientDetailModal.tsx');
const clientNavContext = read('components/layout/ClientPageNavContext.tsx');
const clientNavSlot = read('components/layout/ClientPageNavSlot.tsx');
const basicPage = read('app/sales/client-basic-data/page.tsx');
const quotationPage = read('app/sales/client-quotation/page.tsx');

describe('client page navigation', () => {
  it('registers client pages with the header hamburger instead of a duplicate menu button', () => {
    expect(modal).toContain('useClientPageNav');
    expect(modal).toContain('registerClientNav');
    expect(modal).toContain('البيانات الأساسية');
    expect(modal).toContain('عرض السعر');
    expect(modal).toContain('العقد');
    expect(modal).not.toContain('ClientPageNavigation');
    expect(clientNavSlot).toContain('fixed inset-0');
    expect(clientNavSlot).toContain("event.key === 'Escape'");
    expect(clientNavContext).toContain('register: (registration: ClientPageNavRegistration) => void');
  });

  it('highlights the active page through the shared client nav registration', () => {
    expect(modal).toContain("activeId: isPagePresentation ? 'basic' : 'quotation'");
    expect(modal).toContain('requestClientNavigationRef');
    expect(clientNavSlot).toContain("aria-current={isActive ? 'page' : undefined}");
  });

  it('preserves the same clientId for both static routes', () => {
    for (const page of [basicPage, quotationPage]) {
      expect(page).toContain("encodeURIComponent(clientId)");
      expect(page).toContain('/sales/client-basic-data');
      expect(page).toContain('/sales/client-quotation');
    }
    expect(basicPage).not.toContain('/sales/clients/[clientId]');
    expect(quotationPage).not.toContain('/sales/clients/[clientId]');
  });

  it('keeps contract action on the existing ContractModal and keeps the unsaved guard', () => {
    expect(modal).toContain("target === 'contract'");
    expect(modal).toContain('<ContractModal');
    expect(modal).toContain('hasUnsavedChanges');
    expect(modal).toContain('setPendingNavigation(target)');
    expect(modal).toContain('if (pendingNavigation) completeNavigation(pendingNavigation)');
  });

  it('keeps a single back action in standalone client pages without a second hamburger', () => {
    expect(modal).toContain('العودة');
    expect(modal).not.toContain('absolute right-6 top-6 flex items-start gap-2');
    expect(modal).not.toContain('pr-24 sm:pr-28');
  });

  it('keeps one basic-data save action beside Save and Continue at the end of the form', () => {
    expect(modal.match(/saving \? 'جاري الحفظ\.\.\.' : 'حفظ البيانات الأساسية'/g) || []).toHaveLength(1);
    expect(modal).toContain('flex flex-wrap items-center gap-3 pt-2');
    expect(modal).toContain('حفظ ومتابعة');
    expect(modal).not.toContain('fixed inset-x-0 bottom-0');
  });
});
