import path from 'node:path';

export const PRODUCTION_SUPABASE_REF = 'ezmdkwgziyencejfevso';
export const DIAGNOSTIC_STAGING_SUPABASE_REF = 'sgonaqeefshtdakmggvm';
export const VALIDATION_SUPABASE_REF = 'jxbzuezrymhxwvdejohw';

export const HISTORICAL_BASELINE_MANIFEST = [
  '000_extensions.sql',
  '001_tenant_mdm.sql',
  '002_crm_sales_accounting.sql',
  '003_project_hierarchy.sql',
  '004_documents_media.sql',
  '005_compliance_knowledge_ai.sql',
  '006_audit_workflow_integration.sql',
  '007_seed_rls_grants.sql',
  '008_ekb_catalog.sql',
  '009_auth_users_roles.sql',
  '010_client_floor_levels.sql',
  '012_hr_employee_fields.sql',
  '013_company_branding_fields.sql',
  '014_document_sequences.sql',
  '016_quotation_services_pricing.sql',
  '017_company_quotation_profile.sql',
  '018_zatca_einvoicing.sql',
  '019_auto_contracts.sql',
  '020_activity_logs.sql',
  '021_tax_invoices_milestones.sql',
  '022_safety_blueprints.sql',
  '023_procurement.sql',
  '024_restore_procurement_nav.sql',
  '025_design_intelligence.sql',
  '026_engineering_rules.sql',
  '027_enterprise_accounting.sql',
  '028_project_files_storage.sql',
  '029_project_files_allow_all_mime.sql',
  '029_rls_tenant_lockdown.sql',
  '030_quotation_documents.sql',
  '031_whatsapp_crm.sql',
  '032_social_website_crm.sql',
  '033_multi_tenant_saas.sql',
  '034_clients_lead_attribution.sql',
  '035_project_supervision_reports.sql',
  '036_report_pdf_snapshots.sql',
  '037_fix_engineering_jsonb_timeout.sql',
  '038_stage5_live_store.sql',
  '039_stage4_tech_live_store.sql',
  '040_all_stages_engineering_live.sql',
  '041_production_security_hardening.sql',
  '042_role_level_rls.sql',
  '043_fix_users_update_rls_recursion.sql',
  '044_block_tenant_platform_privilege_escalation.sql',
  '045_design_intelligence_tenant_rls.sql',
  '045_nfpa_code_knowledge_pipeline.sql',
  '046_nfpa_code_knowledge_pipeline_repair.sql',
  '047_design_knowledge_storage_bucket.sql',
  '048_design_knowledge_large_upload.sql',
  '050_accounting_tenant_scope.sql',
  '051_platform_audit_tenant_hardening.sql',
  '052_fix_project_files_storage_rls.sql',
  '053_engineering_workflow_transition_rpc.sql',
  '054_stage5_high_critical_field_observation_blockers.sql',
  '055_stage6_transmittal_contract_gate.sql',
  '056_stage6b_project_correspondences_schema.sql',
  '057_stage6b_correspondence_persistence_rpcs.sql',
  '058_project_identity_foundation.sql',
  '059_stage6b_singleton_compatibility_bridge.sql',
  '060_stage6b3c1_full_document_bridge.sql',
  '061_stage6b3d1_approval_orchestration.sql',
  '062_stage6b4a_correspondence_attachment_contract.sql',
  '063_stage6b4b_attachment_broker_finalization.sql',
  '064_project_classification_foundation.sql',
];

export const BUSINESS_TABLES = [
  'companies',
  'clients',
  'projects',
  'users',
  'roles',
  'project_correspondences',
  'project_correspondence_attachments',
];

export function normalizeRef(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function extractSupabaseRef(databaseUrl) {
  const url = new URL(databaseUrl);
  const host = url.hostname.toLowerCase();
  const match = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  return match?.[1] ?? null;
}

export function assertSafeTarget({
  allowApply,
  targetRef,
  databaseUrl,
  projectRef = '',
  productionRef = PRODUCTION_SUPABASE_REF,
  stagingRef = DIAGNOSTIC_STAGING_SUPABASE_REF,
  validationRef = VALIDATION_SUPABASE_REF,
}) {
  if (allowApply !== '1') {
    throw new Error('BRANCH_BASELINE_APPLY=1 is required; no database changes are allowed by default.');
  }

  const normalizedTarget = normalizeRef(targetRef);
  if (!normalizedTarget || normalizedTarget === 'main' || normalizedTarget === 'master') {
    throw new Error(`Refusing baseline on protected Git ref: ${targetRef || '<empty>'}`);
  }
  if (!normalizedTarget.startsWith('fix/') && !normalizedTarget.startsWith('feat/')) {
    throw new Error(`Refusing baseline on non-feature Git ref: ${targetRef}`);
  }

  const url = new URL(databaseUrl);
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('.supabase.co')) {
    throw new Error(`Refusing non-Supabase database host: ${url.hostname}`);
  }

  const detectedRef = extractSupabaseRef(databaseUrl);
  const candidates = [projectRef, detectedRef].map(normalizeRef).filter(Boolean);
  const blockedRefs = [productionRef, stagingRef].map(normalizeRef).filter(Boolean);
  const blocked = candidates.find((candidate) => blockedRefs.includes(candidate));
  if (blocked) {
    throw new Error(`Refusing protected Supabase project ref: ${blocked}`);
  }
  const normalizedProjectRef = normalizeRef(projectRef);
  const normalizedValidationRef = normalizeRef(validationRef);
  if (!normalizedProjectRef || normalizedProjectRef !== normalizedValidationRef) {
    throw new Error(`Refusing non-validation Supabase project ref: ${projectRef || '<empty>'}`);
  }
  if (detectedRef !== normalizedValidationRef) {
    throw new Error(`Database host ref does not match validation project ref: ${detectedRef || '<unverified>'}`);
  }
  if (!detectedRef) {
    throw new Error('Refusing database URL without a verifiable Supabase project ref.');
  }

  return { targetRef: normalizedTarget, databaseHost: host, detectedRef };
}

export function assertNoUnexpectedPublicTables(tableNames) {
  if (tableNames.length > 0) {
    throw new Error(`Refusing unexpected public tables before baseline: ${tableNames.join(', ')}`);
  }
}

export function assertNoBusinessData(rows) {
  const occupied = rows
    .filter((row) => Number(row.row_count ?? 0) > 0)
    .map((row) => `${row.table_name}=${row.row_count}`);
  if (occupied.length > 0) {
    throw new Error(`Refusing non-empty business database: ${occupied.join(', ')}`);
  }
}

export function resolveManifestPaths(sqlDir) {
  return HISTORICAL_BASELINE_MANIFEST.map((file) => path.join(sqlDir, file));
}

export function assertManifestDoesNotIncludeProductionMigrations(manifest) {
  const invalid = manifest.filter((file) => /^202\d+_/.test(file) || /065/.test(file));
  if (invalid.length > 0) {
    throw new Error(`Baseline manifest may not include production/PR-A1 migrations: ${invalid.join(', ')}`);
  }
}
