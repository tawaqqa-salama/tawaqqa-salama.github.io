import { describe, expect, it } from 'vitest';
import { mapDbAccountsToEnterprise } from '@/lib/business/accounting-service';
import { validateJournalEntry } from '@/lib/enterprise-accounting/rules-engine';
import type { ChartOfAccount } from '@/lib/types/accounting';

type DbAccount = ChartOfAccount;

function dbAccount(overrides: Partial<DbAccount>): DbAccount {
  return {
    id: 'cash-header',
    code: '1110',
    name: 'الصندوق والبنوك',
    account_type: 'asset',
    parent_id: 'asset-parent',
    is_active: true,
    company_id: 'company-test',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('legacy accounting account postability mapping', () => {
  it('treats an active leaf account as postable even when Production lacks postability columns', () => {
    const mapped = mapDbAccountsToEnterprise([dbAccount({ id: 'cash-leaf', code: '1110' })]);
    expect(mapped[0]?.isActive).toBe(true);
    expect(mapped[0]?.isPostable).toBe(true);
    expect(mapped[0]?.isLocked).toBe(false);
  });

  it('keeps accounts with children protected as non-postable headers', () => {
    const mapped = mapDbAccountsToEnterprise([
      dbAccount({ id: 'cash-header', code: '1110' }),
      dbAccount({ id: 'cash-child', code: '111001', parent_id: 'cash-header' }),
    ]);
    expect(mapped.find((account) => account.id === 'cash-header')?.isPostable).toBe(false);
    expect(mapped.find((account) => account.id === 'cash-child')?.isPostable).toBe(true);
  });

  it('keeps Maker/Checker as the only blocker for a large otherwise-valid journal', () => {
    const accounts = mapDbAccountsToEnterprise([
      dbAccount({ id: 'cash-leaf', code: '1110' }),
      dbAccount({ id: 'revenue-leaf', code: '4100', account_type: 'revenue', parent_id: 'revenue-parent' }),
    ]);
    const result = validateJournalEntry(
      {
        entryDate: '2026-08-17',
        entryType: 'manual',
        description: 'Quotation receipt',
        currencyCode: 'SAR',
        exchangeRate: 1,
        lines: [
          { accountCode: '1110', debit: 39275, credit: 0 },
          { accountCode: '4100', debit: 0, credit: 39275 },
        ],
      },
      { accounts, intent: 'post', approved: false }
    );
    expect(result.violations.map((item) => item.ruleCode)).not.toContain('ACC-PST-001');
    expect(result.violations.map((item) => item.ruleCode)).toContain('APR-MKR-001');
    expect(result.canPost).toBe(false);
  });
});
