import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../components/projects/TechnicalReportPrint.tsx', import.meta.url),
  'utf8'
);

describe('technical report print router', () => {
  it('uses the official client-facing technical report renderer for the non-admin path', () => {
    expect(source).toContain("generateOfficialTechnicalReportDocument");
    expect(source).toContain("buildOfficialTechnicalReportHtml");
    expect(source).not.toContain("generateTechnicalReportDocument");
    expect(source).not.toContain("buildEngineeringStudyHtml");
  });

  it('does not append operational compliance diagnostics to the official PDF output', () => {
    expect(source).not.toContain("appendComplianceMatrixToReportHtml");
    expect(source).not.toContain("from '@/lib/projects/compliance'");
  });
});
