import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const migrationPath = 'scripts/sql/056_stage6b_project_correspondences_schema.sql';
const migration = read(migrationPath);

describe('Stage 6B-1 correspondence schema contract', () => {
  it('creates only the canonical project_correspondences table with the required core fields', () => {
    expect(migration).toContain('CREATE TABLE public.project_correspondences');
    for (const field of [
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      'project_id uuid NOT NULL',
      'client_id uuid NOT NULL',
      'correspondence_type text NOT NULL',
      "direction text NOT NULL DEFAULT 'outgoing'",
      'subject text NOT NULL',
      'reference_number text',
      'correspondence_date date',
      'body text',
      "document_status text NOT NULL DEFAULT 'draft'",
      'created_at timestamptz NOT NULL DEFAULT now()',
      'updated_at timestamptz NOT NULL DEFAULT now()',
    ]) {
      expect(migration).toContain(field);
    }
  });

  it('limits the initial taxonomy and document lifecycle to the approved Stage 6B-1 contract', () => {
    expect(migration).toContain("CHECK (correspondence_type IN ('engineering_delivery', 'cd_cover_letter'))");
    expect(migration).toContain("CHECK (direction IN ('outgoing', 'incoming'))");
    expect(migration).toContain("CHECK (document_status IN ('draft', 'preparing', 'ready', 'approved'))");
    for (const forbiddenStatus of ['sent', 'received', 'archived', 'cancelled', 'rejected', 'revised']) {
      expect(migration).not.toContain(`'${forbiddenStatus}'`);
    }
  });

  it('proves project/client consistency with an FK instead of trusting two unrelated frontend IDs', () => {
    expect(migration).toContain('ADD CONSTRAINT projects_id_client_id_key UNIQUE (id, client_id)');
    expect(migration).toContain('FOREIGN KEY (client_id)');
    expect(migration).toContain('REFERENCES public.clients(id)');
    expect(migration).toContain('FOREIGN KEY (project_id, client_id)');
    expect(migration).toContain('REFERENCES public.projects(id, client_id)');
    expect(migration).toContain('ON DELETE RESTRICT');
    expect(migration).not.toContain('ON DELETE CASCADE');
  });

  it('adds only access-path indexes justified by the future project correspondence workspace', () => {
    expect(migration).toContain('idx_project_correspondences_project_date');
    expect(migration).toContain('idx_project_correspondences_client_status_date');
    expect(migration).toContain('idx_project_correspondences_client_reference');
    expect(migration).not.toContain('CREATE INDEX idx_project_correspondences_body');
  });

  it('enables tenant RLS through client ownership for SELECT, INSERT, UPDATE, and DELETE', () => {
    expect(migration).toContain('ALTER TABLE public.project_correspondences ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON public.project_correspondences FROM anon');
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_correspondences TO authenticated');
    expect(migration).toContain('CREATE POLICY project_correspondences_tenant_via_client');
    expect(migration).toContain('FOR ALL');
    expect(migration).toContain('USING (');
    expect(migration).toContain('WITH CHECK (');
    expect(migration).toContain('c.id = project_correspondences.client_id');
    expect(migration).toContain('c.company_id = public.current_app_company_id()');
    expect(migration).toContain('public.is_platform_admin()');
    expect(migration).not.toContain('company_id uuid');
  });

  it('does not introduce later Stage 6B work or modify the Stage 6A gate source', () => {
    for (const forbiddenTable of [
      'correspondence_recipients',
      'correspondence_attachments',
      'correspondence_replies',
      'correspondence_revisions',
      'correspondence_events',
      'correspondence_snapshots',
    ]) {
      expect(migration).not.toContain(`CREATE TABLE public.${forbiddenTable}`);
    }
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(migration).not.toContain('transition_project_engineering_stage');
    expect(read('scripts/sql/055_stage6_transmittal_contract_gate.sql')).toContain(
      "v_target NOT IN ('supervision_visits', 'transmittals', 'final_report')"
    );
  });
});
