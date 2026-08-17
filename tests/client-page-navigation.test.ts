import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8');
const modal = read('components/clients/ClientDetailModal.tsx');
const navigation = read('components/sales/ClientPageNavigation.tsx');
const basicPage = read('app/sales/client-basic-data/page.tsx');
const quotationPage = read('app/sales/client-quotation/page.tsx');

describe('client page navigation', () => {
  it('renders a three-item menu with open/close, outside-click, and Escape behavior', () => {
    expect(navigation).toContain('فتح قائمة صفحات العميل');
    expect(navigation).toContain('aria-expanded={open}');
    expect(navigation).toContain('setOpen((value) => !value)');
    expect(navigation).toContain("event.key === 'Escape'");
    expect(navigation).toContain('!rootRef.current?.contains');
    expect(navigation).toContain("{ id: 'basic'");
    expect(navigation).toContain("{ id: 'quotation'");
    expect(navigation).toContain("{ id: 'contract'");
  });

  it('highlights the active page and closes before selecting an item', () => {
    expect(navigation).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(navigation).toContain('setOpen(false);');
    expect(navigation).toContain('onNavigate(item.id);');
    expect(modal).toContain("active={isPagePresentation ? 'basic' : 'quotation'}");
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

  it('keeps exactly one basic-data save action in the modal', () => {
    expect(modal.match(/saving \? 'جاري الحفظ\.\.\.' : 'حفظ البيانات الأساسية'/g) || []).toHaveLength(1);
    expect(modal).toContain('fixed inset-x-0 bottom-0');
    expect(modal).not.toContain('w-full md:w-auto bg-[#635bdb]');
  });
});
