import { describe, expect, it } from 'vitest';
import { assertCanPost, buildDefaultChartOfAccounts } from '@/lib/enterprise-accounting';
import { recommendSbcClassification } from '@/lib/projects/sbc-recommendation';
import { vatReturnToCsv, vatSummaryToReturn } from '@/lib/finance/vat-export';
import { parseBankStatementCsv, scoreMatch } from '@/lib/finance/bank-reconciliation';
import { sendWhatsAppNotification } from '@/lib/notifications/whatsapp';

describe('P1 smoke — accounting rules gate', () => {
  it('rejects unbalanced journal', () => {
    const accounts = buildDefaultChartOfAccounts();
    const result = assertCanPost(
      {
        entryDate: '2026-07-01',
        entryType: 'manual',
        description: 'test',
        lines: [
          { accountCode: '111001', debit: 100, credit: 0 },
          { accountCode: '211001', debit: 0, credit: 50 },
        ],
      },
      { accounts, approved: true }
    );
    expect(result.canPost).toBe(false);
    expect(result.violations.some((v) => v.ruleCode === 'JE-BAL-001')).toBe(true);
  });

  it('accepts balanced cash receipt when approved', () => {
    const accounts = buildDefaultChartOfAccounts();
    const result = assertCanPost(
      {
        entryDate: '2026-07-01',
        entryType: 'manual',
        description: 'receipt',
        currencyCode: 'SAR',
        lines: [
          { accountCode: '111001', debit: 1000, credit: 0 },
          { accountCode: '112001', debit: 0, credit: 1000 },
        ],
      },
      { accounts, approved: true }
    );
    expect(result.canPost).toBe(true);
  });
});

describe('P1 smoke — SBC recommendation', () => {
  it('maps factory + 1000m2 to F-1 / II-B', () => {
    const r = recommendSbcClassification({
      activityType: 'factory',
      buildingAreaM2: 1000,
    });
    expect(r.occupancyValue).toBe('Group F-1');
    expect(r.constructionValue).toBe('Type II-B');
  });
});

describe('P1 smoke — VAT export', () => {
  it('builds CSV with net VAT due', () => {
    const ret = vatSummaryToReturn(
      { outputVat: 1500, taxableRevenue: 10000, voucherCount: 2 },
      '2026-07',
      300,
      2000
    );
    const csv = vatReturnToCsv(ret);
    expect(csv).toContain('Net VAT due');
    expect(csv).toContain('1200');
    expect(ret.netVatDue).toBe(1200);
  });
});

describe('P1 smoke — bank reconciliation', () => {
  it('parses statement CSV', () => {
    const rows = parseBankStatementCsv(
      'date,description,amount\n2026-07-01,Payment,115000\n2026-07-02,Fee,-25\n'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(115000);
  });

  it('scores amount+date match highly', () => {
    const m = scoreMatch(
      { txn_date: '2026-07-01', amount: 1000, description: 'receipt client' },
      {
        id: '1',
        entry_number: 'JE-1',
        entry_date: '2026-07-01',
        description: 'receipt client',
        amount: 1000,
      }
    );
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThanOrEqual(85);
  });
});

describe('P1 smoke — WhatsApp stub', () => {
  it('stubs when webhook env missing', async () => {
    const prev = process.env.WHATSAPP_WEBHOOK_URL;
    delete process.env.WHATSAPP_WEBHOOK_URL;
    delete process.env.NEXT_PUBLIC_WHATSAPP_WEBHOOK_URL;
    const res = await sendWhatsAppNotification({
      to: '0501234567',
      message: 'test',
    });
    expect(res.ok).toBe(true);
    expect(res.provider).toBe('stub');
    expect(res.stubbed).toBe(true);
    if (prev) process.env.WHATSAPP_WEBHOOK_URL = prev;
  });
});
