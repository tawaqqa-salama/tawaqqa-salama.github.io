import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const outputDir = '/tmp/phase5e-supervision-pdf-fixtures-test';
const expectedFixtures = [
  'A-legacy-no-stage5',
  'B-open-high-b1',
  'C-verified-remediation',
  'D-before-after-selected',
  'E-multiple-visits-evidence',
  'F-pdf-missing-excluded',
  'G-long-content-pagination',
  'H-legacy-visit-compatibility',
];

describe('Phase 5E supervision PDF fixtures', () => {
  beforeAll(async () => {
    rmSync(outputDir, { recursive: true, force: true });
    process.env.PHASE5E_FIXTURE_DIR = outputDir;
    await import('@/scripts/test-phase5e-supervision-pdf');
  });

  it('generates all Stage 5 supervision PDF fixture HTML files', () => {
    for (const name of expectedFixtures) {
      expect(existsSync(join(outputDir, `${name}.html`))).toBe(true);
    }
  });

  it('keeps legacy PDF output free of Stage 5 sections while rendering verified remediation and selected evidence conditionally', () => {
    const legacy = readFileSync(join(outputDir, 'A-legacy-no-stage5.html'), 'utf8');
    const verified = readFileSync(join(outputDir, 'C-verified-remediation.html'), 'utf8');
    const fallback = readFileSync(join(outputDir, 'F-pdf-missing-excluded.html'), 'utf8');

    expect(legacy).not.toContain('سجل الزيارات والملاحظات والمعالجات');
    expect(verified).toContain('تم التحقق هندسياً');
    expect(verified).toContain('شكل (1)');
    expect(fallback).toContain('مرفق PDF:');
    expect(fallback).toContain('صورة محددة تعذر تحميل معاينتها');
    expect(fallback).not.toContain('دليل مستبعد');
  });
});
