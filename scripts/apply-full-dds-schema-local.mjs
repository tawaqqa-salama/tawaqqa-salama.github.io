import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

if (process.env.LOCAL_DDS_REBUILD !== '1') {
  throw new Error('LOCAL_DDS_REBUILD=1 is required; this runner is local-only.');
}

dotenv.config({ path: '.env.local' });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const parsed = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
  throw new Error(`Refusing non-local DATABASE_URL host: ${parsed.hostname}`);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.join(__dirname, 'sql');
const compatibilityPath = path.join(__dirname, 'local-supabase-compatibility-bootstrap.sql');

const files = [
  '000_extensions.sql', '001_tenant_mdm.sql', '002_crm_sales_accounting.sql',
  '003_project_hierarchy.sql', '004_documents_media.sql', '005_compliance_knowledge_ai.sql',
  '006_audit_workflow_integration.sql', '007_seed_rls_grants.sql', '008_ekb_catalog.sql',
  '009_auth_users_roles.sql', '010_client_floor_levels.sql', '012_hr_employee_fields.sql',
  '013_company_branding_fields.sql', '014_document_sequences.sql',
  '016_quotation_services_pricing.sql', '017_company_quotation_profile.sql',
  '018_zatca_einvoicing.sql', '019_auto_contracts.sql', '020_activity_logs.sql',
  '021_tax_invoices_milestones.sql', '022_safety_blueprints.sql', '023_procurement.sql',
  '024_restore_procurement_nav.sql', '025_design_intelligence.sql', '026_engineering_rules.sql',
  '027_enterprise_accounting.sql', '028_project_files_storage.sql', '029_rls_tenant_lockdown.sql',
  '030_quotation_documents.sql', '031_whatsapp_crm.sql', '032_social_website_crm.sql',
  '033_multi_tenant_saas.sql', '034_clients_lead_attribution.sql',
  '035_project_supervision_reports.sql', '036_report_pdf_snapshots.sql',
  '037_fix_engineering_jsonb_timeout.sql', '038_stage5_live_store.sql',
  '039_stage4_tech_live_store.sql', '040_all_stages_engineering_live.sql',
  '041_production_security_hardening.sql', '042_role_level_rls.sql',
  '043_fix_users_update_rls_recursion.sql', '044_block_tenant_platform_privilege_escalation.sql',
  '045_design_intelligence_tenant_rls.sql', '045_nfpa_code_knowledge_pipeline.sql',
  '046_nfpa_code_knowledge_pipeline_repair.sql', '047_design_knowledge_storage_bucket.sql',
  '048_design_knowledge_large_upload.sql', '050_accounting_tenant_scope.sql',
  '051_platform_audit_tenant_hardening.sql', '052_fix_project_files_storage_rls.sql',
  '053_engineering_workflow_transition_rpc.sql',
  '054_stage5_high_critical_field_observation_blockers.sql',
  '055_stage6_transmittal_contract_gate.sql', '056_stage6b_project_correspondences_schema.sql',
  '057_stage6b_correspondence_persistence_rpcs.sql', '058_project_identity_foundation.sql',
  '059_stage6b_singleton_compatibility_bridge.sql', '060_stage6b3c1_full_document_bridge.sql',
  '061_stage6b3d1_approval_orchestration.sql',
  '062_stage6b4a_correspondence_attachment_contract.sql',
  '063_stage6b4b_attachment_broker_finalization.sql',
  '064_project_classification_foundation.sql',
  '065_pr_a1_security_remediation.sql',
  '066_basic_data_project_classification_sync.sql',
];

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(fs.readFileSync(compatibilityPath, 'utf8'));
  console.log('Applied local Supabase compatibility bootstrap.');
  for (const file of files) {
    process.stdout.write(`Applying ${file}... `);
    await client.query(fs.readFileSync(path.join(sqlDir, file), 'utf8'));
    console.log('OK');
  }
  console.log(`Full DDS chain applied successfully: ${files.length} migrations (000–066 manifest).`);
} finally {
  await client.end();
}
