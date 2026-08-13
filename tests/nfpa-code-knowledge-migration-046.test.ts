/**
 * Safety checks for 046 repair migration (static / no live DB required).
 * Ensures we do not regress to 045's blind CREATE POLICY failure mode.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NFPA13_PIPELINE_RULE_IDS,
  registerNfpa13_2025ProjectEdition,
  registerNfpa13_2025RuleShells,
  resetCodeKnowledgeStore,
  listEditionRules,
} from '@/lib/design-intelligence/code-knowledge';
import { NFPA13_2025_PROJECT_ADOPTION_TEMPLATE } from '@/lib/projects/compliance/nfpa/nfpa13-edition';

const ROOT = resolve(__dirname, '..');
const M045 = resolve(ROOT, 'scripts/sql/045_nfpa_code_knowledge_pipeline.sql');
const M046 = resolve(ROOT, 'scripts/sql/046_nfpa_code_knowledge_pipeline_repair.sql');

describe('046 NFPA Code Knowledge Pipeline repair migration', () => {
  it('exists and leaves 045 untouched on disk', () => {
    expect(existsSync(M045)).toBe(true);
    expect(existsSync(M046)).toBe(true);
  });

  it('is written as an idempotent ensure-policy migration', () => {
    const sql = readFileSync(M046, 'utf8');
    expect(sql).toMatch(/046_nfpa_code_knowledge_pipeline_repair|046 — NFPA/);
    expect(sql).toContain('Do NOT re-run scripts/sql/045_nfpa_code_knowledge_pipeline.sql');
    expect(sql).toContain('pg_temp.ensure_policy');
    expect(sql).toContain('pg_temp.policy_exists');
    expect(sql).toContain('CREATE TABLE only when missing');
    // Must mention the known failure mode
    expect(sql).toContain('di_engineering_rules_tenant_insert');
    expect(sql).toMatch(/already exists — left untouched/);
  });

  it('creates missing tables and additive columns without destructive drops of tenant policies', () => {
    const sql = readFileSync(M046, 'utf8');
    expect(sql).toContain('di_code_editions');
    expect(sql).toContain('di_project_code_adoptions');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    expect(sql).toContain('current_app_company_id()');
    expect(sql).toContain('is_platform_admin()');
    // Must not drop valid tenant_* policies wholesale
    expect(sql).not.toMatch(/DROP POLICY IF EXISTS %I ON public\.%I',\s*t \|\| '_tenant_insert'/);
    expect(sql).not.toContain("DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_insert'");
    // Only open/legacy policy drops
    expect(sql).toContain('drop_open_di_policies');
    expect(sql).toContain('_all_auth');
    // Mentioned only as an explicit prohibition — never introduced as schema
    expect(sql).toMatch(/No tenant_memberships/);
    expect(sql).not.toMatch(/CREATE TABLE\s+(IF NOT EXISTS\s+)?(public\.)?tenant_memberships/i);
  });

  it('seeds eight RULE_NOT_CONFIGURED shells and refuses active numeric invention', () => {
    const sql = readFileSync(M046, 'utf8');
    for (const id of NFPA13_PIPELINE_RULE_IDS) {
      expect(sql).toContain(id);
    }
    expect(sql).toContain('RULE_NOT_CONFIGURED');
    expect(sql).toContain('active numeric NFPA13-2025 shells (must be 0)');
    expect(sql).toContain('invented/active numeric NFPA shells detected');
  });

  it('preserves NFPA 13-2025 project metadata invariants in application registry', () => {
    resetCodeKnowledgeStore();
    const reg = registerNfpa13_2025ProjectEdition({ companyId: 'co-1' });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    expect(reg.edition.code).toBe(NFPA13_2025_PROJECT_ADOPTION_TEMPLATE.code);
    expect(reg.edition.edition).toBe(NFPA13_2025_PROJECT_ADOPTION_TEMPLATE.edition);
    expect(reg.edition.title).toBe(NFPA13_2025_PROJECT_ADOPTION_TEMPLATE.title);
    expect(reg.edition.adoption_status).toBe('PROJECT_ADOPTED');
    expect(reg.edition.source_type).toBe('PROJECT_PROVIDED_DOCUMENT');
    expect(reg.edition.source_document_id).toBe(
      NFPA13_2025_PROJECT_ADOPTION_TEMPLATE.source_document_id
    );
    expect(reg.edition.verification_status).toBe('PROJECT_COVER_IDENTIFIED');
    expect(reg.edition.platform_verification_status).toBe('NOT_VERIFIED_OFFICIAL');

    const shells = registerNfpa13_2025RuleShells();
    expect(shells).toHaveLength(8);
    expect(
      listEditionRules({ code: 'NFPA-13', edition: '2025' }).every(
        (r) =>
          r.verification_status === 'RULE_NOT_CONFIGURED' &&
          r.numeric_value == null &&
          r.numeric_min == null &&
          r.numeric_max == null
      )
    ).toBe(true);
  });
});
