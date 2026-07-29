-- DDS v1.0 — Extensions & shared helpers
-- منصة توقع — وثيقة تصميم قاعدة البيانات

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Soft-delete / archive helpers are applied via columns: deleted_at, archived_at, version_no
-- Tenant isolation column on tenant-scoped tables: company_id
