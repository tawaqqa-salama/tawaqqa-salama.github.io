import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const modal = readFileSync(resolve(__dirname, '../components/clients/ClientDetailModal.tsx'), 'utf8');
const basicPage = readFileSync(resolve(__dirname, '../app/sales/client-basic-data/page.tsx'), 'utf8');

describe('standalone basic-data page visibility', () => {
  it('uses the static route and passes page presentation', () => {
    expect(basicPage).toContain("const clientId = searchParams.get('clientId') || ''");
    expect(basicPage).toContain("presentation=\"page\"");
    expect(basicPage).toContain('useClientDetail(clientId || null)');
  });

  it('opens the complete basic-data sections instead of the quotation tab', () => {
    expect(modal).toContain('const preferred = isPagePresentation');
    expect(modal).toContain("? 'basic'");
    expect(modal).toContain("{activeTab === 'basic' && (");
    expect(modal).toContain('المرفقات والمستندات');
    expect(modal).toContain('بيانات الموقع والعنوان');
    expect(modal).toContain('بيانات رخصة البناء');
    expect(modal).toContain('بيانات النشاط والمبنى');
    expect(modal).toContain('<FloorLevelsEditor');
    expect(modal).toContain('<ActivityRequirementsPanel');
    expect(modal).toContain('حفظ البيانات الأساسية');
  });

  it('keeps quotation-first behavior available for the normal Sales modal', () => {
    expect(modal).toContain("sales: 'finance'");
    expect(modal).toContain('const preferred = isPagePresentation');
    expect(modal).toContain("? 'basic'");
  });
});

