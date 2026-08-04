import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.join(__dirname, 'sql');

const files = [
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
  '029_rls_tenant_lockdown.sql',
];

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL غير موجود. أضفه إلى .env.local ثم أعد المحاولة.');
  console.error('يمكنك مراجعة الوثائق في docs/dds/ و docs/ekb/ دون تطبيق SQL.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  for (const file of files) {
    const fullPath = path.join(sqlDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    process.stdout.write(`Applying ${file}... `);
    await client.query(sql);
    console.log('OK');
  }
  console.log('DDS v1.0 + EKB v1.0 catalog applied successfully.');
} finally {
  await client.end();
}
