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
