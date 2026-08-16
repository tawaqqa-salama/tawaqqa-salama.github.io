import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

describe('sales row action icons', () => {
  it('shows the three project actions with distinct icons and existing routes', () => {
    const sales = read('app/sales/page.tsx');
    const menu = read('components/ui/RowActionsMenu.tsx');

    expect(sales).toContain("label: 'البيانات الأساسية'");
    expect(sales).toContain("label: 'عرض السعر'");
    expect(sales).toContain("label: 'عقد'");
    expect(sales).toContain("/sales/client-basic-data?clientId=");
    expect(sales).toContain("/sales/client-quotation?clientId=");
    expect(sales).toContain("setContractClient(c)");
    expect(sales).toContain('kind="folder"');
    expect(sales).toContain('kind="tag"');
    expect(sales).toContain('kind="file"');
    expect(menu).toContain('icon?: ReactNode');
    expect(menu).toContain('item.icon');
  });

  it('keeps the actions accessible on mobile and desktop', () => {
    const menu = read('components/ui/RowActionsMenu.tsx');
    expect(menu).toContain('hidden md:flex');
    expect(menu).toContain('md:hidden');
    expect(menu).toContain('aria-label={item.label}');
    expect(menu).toContain('role="menuitem"');
  });
});
