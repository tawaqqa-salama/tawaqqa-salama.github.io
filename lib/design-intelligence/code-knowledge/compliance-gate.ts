/**
 * Compliance bridge — RAG / DI advisory cannot produce PASS.
 * Authoritative decisions remain in lib/projects/compliance.
 */

import type { CodeKnowledgeSearchHit } from '@/lib/design-intelligence/code-knowledge/types';
import type {
  ComplianceGateDecision,
  ComplianceResultStatus,
} from '@/lib/projects/compliance/types';
import type { NfpaStandardCode } from '@/lib/projects/compliance/nfpa/types';
import { rejectAdvisoryPassAttempt } from '@/lib/projects/compliance/nfpa/helpers';

function asNfpaCode(code?: string): NfpaStandardCode {
  const c = String(code || 'NFPA-13');
  if (
    c === 'NFPA-13' ||
    c === 'NFPA-20' ||
    c === 'NFPA-22' ||
    c === 'NFPA-72' ||
    c === 'NFPA-101'
  ) {
    return c;
  }
  return 'NFPA-13';
}

export type AdvisoryComplianceAttempt = {
  source:
    | 'rag'
    | 'design_intelligence'
    | 'vision'
    | 'knowledge_engine_estimate'
    | 'estimated_calculation'
    | 'unverified_rag';
  rule_id: string;
  code?: string;
  claimed_status?: ComplianceResultStatus;
  hits?: CodeKnowledgeSearchHit[];
  estimated_value?: string | number | null;
};

/**
 * Map advisory stacks to a non-PASS status.
 * Unverified RAG / estimates / AI recommendations → cannot PASS.
 */
export function evaluateAdvisoryComplianceAttempt(
  attempt: AdvisoryComplianceAttempt
): {
  status: ComplianceResultStatus;
  gate: ComplianceGateDecision;
  authoritative: false;
  can_produce_pass: false;
  message: string;
  finding: ReturnType<typeof rejectAdvisoryPassAttempt>;
} {
  const finding = rejectAdvisoryPassAttempt({
    code: asNfpaCode(attempt.code),
    rule_id: attempt.rule_id,
    field: attempt.rule_id,
    advisory_source: attempt.source,
    advisory_value: attempt.estimated_value ?? null,
  });

  // Even if caller claimed PASS, force non-PASS
  const status: ComplianceResultStatus =
    attempt.claimed_status === 'FAIL' ? 'FAIL' : 'NEEDS_DATA';

  return {
    status,
    gate: 'BLOCKED',
    authoritative: false,
    can_produce_pass: false,
    message: `Advisory source "${attempt.source}" cannot produce PASS or unlock stages.`,
    finding,
  };
}

export function ragHitsCannotProducePass(hits: CodeKnowledgeSearchHit[]): boolean {
  void hits;
  return true;
}

export function mapComplianceBlockerStatus(
  status: ComplianceResultStatus
): { blocks: boolean; gate: ComplianceGateDecision } {
  if (status === 'PASS' || status === 'N/A') {
    return { blocks: false, gate: status === 'PASS' ? 'ALLOW' : 'ALLOW' };
  }
  // RULE_NOT_CONFIGURED + NEEDS_DATA + FAIL + CONFLICT + BLOCKED → BLOCKED
  return { blocks: true, gate: 'BLOCKED' };
}

/**
 * Only deterministic configured applicable rule evaluation may produce PASS.
 */
export function canAuthoritativePass(params: {
  ruleConfigured: boolean;
  inputsComplete: boolean;
  sourceVerified: boolean;
  fromRag: boolean;
  fromEstimate: boolean;
  fromAdvisory: boolean;
}): { allowPass: boolean; reason: string } {
  if (params.fromRag || params.fromEstimate || params.fromAdvisory) {
    return { allowPass: false, reason: 'advisory_or_rag_or_estimate' };
  }
  if (!params.ruleConfigured) {
    return { allowPass: false, reason: 'RULE_NOT_CONFIGURED' };
  }
  if (!params.inputsComplete) {
    return { allowPass: false, reason: 'NEEDS_DATA' };
  }
  if (!params.sourceVerified) {
    return { allowPass: false, reason: 'source_not_verified' };
  }
  return { allowPass: true, reason: 'deterministic_configured_rule' };
}
