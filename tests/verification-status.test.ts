/**
 * Explicit verification-status semantics — never substring-match "VERIFIED".
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isVerifiedKnowledgeStatus,
  shouldWarnUnverifiedKnowledgeSource,
} from '@/lib/design-intelligence/verification-status';

describe('isVerifiedKnowledgeStatus', () => {
  it('accepts only explicit positive verified statuses', () => {
    expect(isVerifiedKnowledgeStatus('VERIFIED')).toBe(true);
    expect(isVerifiedKnowledgeStatus('VERIFIED_OFFICIAL')).toBe(true);
    expect(isVerifiedKnowledgeStatus('OFFICIALLY_VERIFIED')).toBe(true);
    expect(isVerifiedKnowledgeStatus(' verified ')).toBe(true);
  });

  it('rejects NOT_VERIFIED* and other non-verified statuses', () => {
    expect(isVerifiedKnowledgeStatus('NOT_VERIFIED')).toBe(false);
    expect(isVerifiedKnowledgeStatus('NOT_VERIFIED_OFFICIAL')).toBe(false);
    expect(isVerifiedKnowledgeStatus('UNVERIFIED')).toBe(false);
    expect(isVerifiedKnowledgeStatus('PROJECT_COVER_IDENTIFIED')).toBe(false);
    expect(isVerifiedKnowledgeStatus('RULE_NOT_CONFIGURED')).toBe(false);
    expect(isVerifiedKnowledgeStatus(null)).toBe(false);
    expect(isVerifiedKnowledgeStatus(undefined)).toBe(false);
    expect(isVerifiedKnowledgeStatus('')).toBe(false);
  });

  it('does not treat substring VERIFIED inside NOT_VERIFIED as verified', () => {
    // Regression: /VERIFIED/i.test('NOT_VERIFIED_OFFICIAL') === true (bug)
    expect(/VERIFIED/i.test('NOT_VERIFIED_OFFICIAL')).toBe(true);
    expect(isVerifiedKnowledgeStatus('NOT_VERIFIED_OFFICIAL')).toBe(false);
  });
});

describe('shouldWarnUnverifiedKnowledgeSource', () => {
  it('warns for NOT_VERIFIED_OFFICIAL source metadata', () => {
    expect(
      shouldWarnUnverifiedKnowledgeSource({
        sourceVerificationStatus: 'NOT_VERIFIED_OFFICIAL',
      })
    ).toBe(true);
  });

  it('warns when platform status is NOT_VERIFIED_OFFICIAL', () => {
    expect(
      shouldWarnUnverifiedKnowledgeSource({
        platformVerificationStatus: 'NOT_VERIFIED_OFFICIAL',
      })
    ).toBe(true);
  });

  it('does not warn when explicitly verified', () => {
    expect(
      shouldWarnUnverifiedKnowledgeSource({
        sourceVerificationStatus: 'VERIFIED',
      })
    ).toBe(false);
    expect(
      shouldWarnUnverifiedKnowledgeSource({
        platformVerificationStatus: 'VERIFIED_OFFICIAL',
      })
    ).toBe(false);
  });

  it('does not warn when no verification metadata is present', () => {
    expect(shouldWarnUnverifiedKnowledgeSource({})).toBe(false);
    expect(
      shouldWarnUnverifiedKnowledgeSource({
        sourceVerificationStatus: null,
        documentVerificationStatus: null,
        platformVerificationStatus: null,
      })
    ).toBe(false);
  });
});

describe('Design Intelligence RAG UI verification warning', () => {
  const moduleSource = readFileSync(
    new URL('../components/design/DesignIntelligenceModule.tsx', import.meta.url),
    'utf8'
  );

  it('uses explicit helper instead of VERIFIED substring regex', () => {
    expect(moduleSource).toContain('shouldWarnUnverifiedKnowledgeSource');
    expect(moduleSource).not.toContain('/VERIFIED/i');
    expect(moduleSource).toContain(
      'المصدر مفهرس، لكنه غير مُعتمد كقاعدة هندسية موثقة.'
    );
  });

  it('shows unverified warning for NOT_VERIFIED_OFFICIAL via helper semantics', () => {
    const warn = shouldWarnUnverifiedKnowledgeSource({
      sourceVerificationStatus: 'NOT_VERIFIED_OFFICIAL',
    });
    expect(warn).toBe(true);
    // UI renders this Arabic copy whenever unverified is true
    expect(moduleSource).toContain(
      'المصدر مفهرس، لكنه غير مُعتمد كقاعدة هندسية موثقة.'
    );
  });
});
