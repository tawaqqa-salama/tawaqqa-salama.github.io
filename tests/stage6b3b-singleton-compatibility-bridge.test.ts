import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const migration = read('scripts/sql/059_stage6b_singleton_compatibility_bridge.sql');
const mapping = read('docs/stage6b3b-compatibility-contract.md');
const stage6aGate = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const stage6aContract = read('lib/projects/stage6-contract.ts');
const stage6b1Schema = read('scripts/sql/056_stage6b_project_correspondences_schema.sql');
const stage6b2Rpcs = read('scripts/sql/057_stage6b_correspondence_persistence_rpcs.sql');
const workspace = read('components/projects/ReadOnlyCorrespondenceWorkspace.tsx');
const modal = read('components/projects/ProjectReportModal.tsx');
const deliveryForm = read('components/projects/EngineeringDeliverySection.tsx');
const cdForm = read('components/projects/CdCoverLetterSection.tsx');
const deliveryPrint = read('components/projects/SafetyDeliveryLetterPrint.tsx');
const cdPrint = read('components/projects/CdCoverLetterPrint.tsx');

describe('Stage 6B-3B singleton compatibility bridge contract', () => {
  it('adds a database-enforced outgoing singleton invariant only for the two approved types', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS project_correspondences_stage6_singleton_outgoing_idx');
    expect(migration).toContain('ON public.project_correspondences (project_id, correspondence_type)');
    expect(migration).toContain("WHERE direction = 'outgoing'");
    expect(migration).toContain("correspondence_type IN ('engineering_delivery', 'cd_cover_letter')");
    expect(migration).toContain('HAVING count(*) > 1');
    expect(migration).toContain('duplicate outgoing canonical rows exist');
    expect(migration).not.toContain('UNIQUE (project_id, client_id)');
    expect(migration).not.toContain('ALTER TABLE public.project_correspondences\n  ADD COLUMN');
  });

  it('preserves Migration 055 and the canonical singleton payload as the exclusive Stage 7 authority', () => {
    expect(migration).not.toContain('transition_project_engineering_stage(');
    expect(migration).not.toContain("'{workflow,last_approved_stage}'");
    expect(migration).not.toContain("'{workflow,approved_at}'");
    expect(migration).toContain("v_status NOT IN ('draft', 'preparing', 'ready')");
    expect(migration).toContain("WHEN 'معتمد' THEN 'ready'");
    expect(migration).toContain('never writes an approved relational status');
    expect(stage6aGate).toContain("v_target NOT IN ('supervision_visits', 'transmittals', 'final_report')");
    expect(stage6aGate).toContain("v_engineering_delivery := jsonb_set(v_engineering_delivery, '{status}', to_jsonb('معتمد'::text), true);");
    expect(stage6aContract).toContain("'STAGE6_ENGINEERING_DELIVERY_INCOMPLETE'");
  });

  it('uses server-only exact primary identity and tenant validation with no fallback identity', () => {
    const bridgeStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.save_stage6_singleton_correspondence_bridge(');
    const bridge = migration.slice(bridgeStart);

    expect(bridge).toContain('IF auth.uid() IS NULL THEN');
    expect(bridge).toContain('v_company_id := public.current_app_company_id();');
    expect(bridge).toContain('FROM public.primary_engineering_project_mappings AS m');
    expect(bridge).toContain('m.client_id = p_client_id');
    expect(bridge).toContain('m.project_id = p_project_id');
    expect(bridge).toContain("'PROJECT_CLIENT_MISMATCH'");
    expect(bridge).not.toContain('ensure_or_resolve_engineering_project_for_client');
    expect(bridge).not.toMatch(/LIMIT\s+1\s*;/);
    expect(bridge).not.toContain('project_id = p_client_id');
  });

  it('maps only the proven legacy subset and documents every approved-model field boundary', () => {
    for (const pair of [
      'engineering_delivery.delivery_date',
      'engineering_delivery.delivered_to',
      'engineering_delivery.outgoing_number',
      'engineering_delivery.safety_engineer_name',
      'engineering_delivery.manager_name',
      'cd_cover_letter.letter_date',
      'cd_cover_letter.addressee',
      'cd_cover_letter.outgoing_number',
      'cd_cover_letter.safety_engineer_name',
      'cd_cover_letter.manager_name',
      'No relational destination',
      'Safe server derivation',
    ]) {
      expect(mapping).toContain(pair);
    }
    expect(migration).toContain("WHEN 'engineering_delivery' THEN '{delivery_date}'::text[]");
    expect(migration).toContain("WHEN 'engineering_delivery' THEN '{delivered_to}'::text[]");
    expect(migration).toContain("ELSE '{letter_date}'::text[]");
    expect(migration).toContain("ELSE '{addressee}'::text[]");
    expect(migration).toContain("'خطاب تسليم دراسة السلامة'");
    expect(migration).toContain("'خطاب تسليم الدفاع المدني'");
    expect(mapping).toContain('project_code`/`projects.name` are never used');
  });

  it('makes bridge writes atomic, idempotent under duplicate conflicts, and optimistic-lock safe', () => {
    const bridgeStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.save_stage6_singleton_correspondence_bridge(');
    const bridgeEnd = migration.indexOf('REVOKE ALL ON FUNCTION public.save_stage6_singleton_correspondence_bridge', bridgeStart);
    const bridge = migration.slice(bridgeStart, bridgeEnd);

    expect(bridge).toContain('FROM public.project_engineering_live AS pel');
    expect(bridge).toContain('FOR UPDATE;');
    expect(bridge).toContain('FROM public.project_correspondences AS pc');
    expect(bridge).toContain('AND pc.direction = \'outgoing\'');
    expect(bridge).toContain('v_current.lock_version <> p_expected_lock_version');
    expect(bridge).toContain("'CORRESPONDENCE_STALE_VERSION'");
    expect(bridge).toContain('lock_version = lock_version + 1');
    expect(bridge).toContain('ON CONFLICT (project_id, correspondence_type)');
    expect(bridge).toContain("'CORRESPONDENCE_SINGLETON_CONFLICT'");
    expect(bridge).toContain("set_config('app.stage6b3b_bridge', 'on', true)");
    expect(bridge).toContain('UPDATE public.project_engineering_live');
    expect(bridge).not.toContain('COMMIT;');
  });

  it('projects explicit legacy Stage 6 saves server-side without page-load adoption or transition interference', () => {
    const triggerStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.sync_stage6_singleton_correspondence_from_live()');
    const bridgeStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.save_stage6_singleton_correspondence_bridge(');
    const trigger = migration.slice(triggerStart, bridgeStart);

    expect(trigger).toContain("current_setting('app.stage6b3b_bridge', true) = 'on'");
    expect(trigger).toContain("v_active_stage <> 'transmittals'");
    expect(trigger).toContain("NEW.payload -> 'engineering_delivery' IS NOT DISTINCT FROM OLD.payload -> 'engineering_delivery'");
    expect(trigger).toContain("NEW.payload -> 'cd_cover_letter' IS NOT DISTINCT FROM OLD.payload -> 'cd_cover_letter'");
    expect(trigger).toContain('A save of one approved singleton must not synthesize or bump the version of');
    expect(trigger).toContain("v_type = 'engineering_delivery'");
    expect(trigger).toContain("v_type = 'cd_cover_letter'");
    expect(trigger).toContain('IF NOT FOUND THEN\n    RETURN NEW;');
    expect(trigger).toContain("v_current.document_status = 'approved'");
    expect(trigger).toContain("'CORRESPONDENCE_NOT_EDITABLE'");
    expect(trigger).toContain('CREATE TRIGGER stage6_singleton_correspondence_projection');
    expect(trigger).not.toContain('transition_project_engineering_stage');
  });

  it('removes browser access to the old relational-only mutation paths and keeps direct DML blocked', () => {
    for (const signature of [
      'public.create_project_correspondence_draft(uuid, uuid, text, text, text, text, date, text, text, text, text)',
      'public.update_project_correspondence_draft(uuid, integer, text, text, text, date, text)',
      'public.approve_project_correspondence(uuid, integer)',
    ]) {
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM authenticated;`);
    }
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.save_stage6_singleton_correspondence_bridge');
    expect(migration).toContain('TO authenticated, service_role;');
    expect(stage6b1Schema).toContain('REVOKE INSERT, UPDATE, DELETE ON public.project_correspondences FROM authenticated');
    expect(stage6b2Rpcs).toContain('GRANT EXECUTE ON FUNCTION public.create_project_correspondence_draft');
    expect(migration).not.toContain('GRANT INSERT ON public.project_correspondences TO authenticated');
    expect(migration).not.toContain('GRANT UPDATE ON public.project_correspondences TO authenticated');
    expect(migration).not.toContain('GRANT DELETE ON public.project_correspondences TO authenticated');
  });

  it('leaves the Stage 6B-3A workspace read-only and approved forms/templates byte-for-byte untouched', () => {
    expect(workspace).not.toContain('<button');
    expect(workspace).not.toContain('onSave');
    expect(workspace).not.toMatch(/\.rpc\s*\(/);
    expect(workspace).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(modal.indexOf('<ReadOnlyCorrespondenceWorkspace')).toBeLessThan(modal.indexOf('<EngineeringDeliverySection'));
    expect(deliveryForm).toContain('حفظ بيانات الخطاب');
    expect(cdForm).toContain('حفظ بيانات الخطاب');
    expect(deliveryPrint).not.toContain('projectCode');
    expect(cdPrint).not.toContain('projectCode');
  });

  it('does not introduce UI, Storage, backfill, attachment, PDF, Stage 6B-3C, or Stage 6B-3D scope', () => {
    for (const forbidden of [
      'CREATE TABLE public.correspondence_attachments',
      'CREATE TABLE public.correspondence_replies',
      'CREATE TABLE public.correspondence_revisions',
      'storage.objects',
      'UPDATE public.clients\nSET project_engineering_data',
      'INSERT INTO public.project_correspondences\nSELECT',
      'SafetyDeliveryLetterPrint',
      'CdCoverLetterPrint',
    ]) {
      expect(migration).not.toContain(forbidden);
    }
    for (const oldRpc of [
      'CREATE OR REPLACE FUNCTION public.create_project_correspondence_draft(',
      'CREATE OR REPLACE FUNCTION public.update_project_correspondence_draft(',
      'CREATE OR REPLACE FUNCTION public.approve_project_correspondence(',
    ]) {
      expect(migration).not.toContain(oldRpc);
    }
  });
});
