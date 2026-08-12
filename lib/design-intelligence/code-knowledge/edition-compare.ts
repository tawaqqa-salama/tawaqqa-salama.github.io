/**
 * Edition comparison — identifies added/removed/changed rules.
 * Never auto-activates the new edition. Status = PENDING_ENGINEER_REVIEW.
 */

import { getCodeKnowledgeStore } from '@/lib/design-intelligence/code-knowledge/store';
import type {
  EditionComparisonResult,
  EditionRuleRecord,
} from '@/lib/design-intelligence/code-knowledge/types';

function rulesFor(code: string, edition: string): EditionRuleRecord[] {
  return getCodeKnowledgeStore().rules.filter(
    (r) => r.code === code && r.edition === edition
  );
}

function signature(r: EditionRuleRecord): string {
  return [
    r.rule_code,
    r.section ?? '',
    r.table_reference ?? '',
    r.numeric_value ?? '',
    r.numeric_min ?? '',
    r.numeric_max ?? '',
    r.unit ?? '',
    r.verification_status,
    r.rule_status,
    r.explanation_en ?? '',
    r.explanation_ar ?? '',
    JSON.stringify(r.applicability || {}),
  ].join('|');
}

export function compareCodeEditions(
  code: string,
  oldEdition: string,
  newEdition: string
): EditionComparisonResult {
  const oldRules = rulesFor(code, oldEdition);
  const newRules = rulesFor(code, newEdition);

  const oldByCode = new Map(oldRules.map((r) => [r.rule_code, r]));
  const newByCode = new Map(newRules.map((r) => [r.rule_code, r]));

  const added_rules: EditionRuleRecord[] = [];
  const removed_rules: EditionRuleRecord[] = [];
  const changed_rules: EditionComparisonResult['changed_rules'] = [];
  const unchanged_rules: EditionRuleRecord[] = [];
  const rules_requiring_engineer_review: EditionRuleRecord[] = [];
  const rules_became_not_configured: EditionRuleRecord[] = [];

  for (const [ruleCode, neu] of newByCode) {
    const old = oldByCode.get(ruleCode);
    if (!old) {
      added_rules.push(neu);
      rules_requiring_engineer_review.push(neu);
      continue;
    }
    if (signature(old) === signature(neu)) {
      unchanged_rules.push(neu);
    } else {
      changed_rules.push({ rule_code: ruleCode, old, new: neu });
      rules_requiring_engineer_review.push(neu);
      if (
        neu.verification_status === 'RULE_NOT_CONFIGURED' ||
        neu.rule_status === 'rule_not_configured'
      ) {
        if (
          old.verification_status !== 'RULE_NOT_CONFIGURED' &&
          old.rule_status !== 'rule_not_configured'
        ) {
          rules_became_not_configured.push(neu);
        } else if (
          old.verification_status === 'RULE_NOT_CONFIGURED' &&
          neu.verification_status === 'RULE_NOT_CONFIGURED'
        ) {
          // still not configured after change — still review
        } else if (neu.verification_status === 'RULE_NOT_CONFIGURED') {
          rules_became_not_configured.push(neu);
        }
      }
    }
  }

  for (const [ruleCode, old] of oldByCode) {
    if (!newByCode.has(ruleCode)) {
      removed_rules.push(old);
      rules_requiring_engineer_review.push(old);
    }
  }

  return {
    code,
    old_edition: oldEdition,
    new_edition: newEdition,
    status: 'PENDING_ENGINEER_REVIEW',
    added_rules,
    removed_rules,
    changed_rules,
    unchanged_rules,
    rules_requiring_engineer_review,
    rules_became_not_configured,
    new_edition_activated: false,
  };
}
