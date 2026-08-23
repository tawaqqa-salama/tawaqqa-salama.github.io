import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const migration = read('scripts/sql/061_stage6b3d1_approval_orchestration.sql');
const stage6a = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const stage6b2 = read('scripts/sql/057_stage6b_correspondence_persistence_rpcs.sql');
const stage6b3b = read('scripts/sql/059_stage6b_singleton_compatibility_bridge.sql');
const stage6b3c1 = read('scripts/sql/060_stage6b3c1_full_document_bridge.sql');
const modal = read('components/projects/ProjectReportModal.tsx');
const workspace = read('components/projects/ReadOnlyCorrespondenceWorkspace.tsx');
const deliveryForm = read('components/projects/EngineeringDeliverySection.tsx');
const cdForm = read('components/projects/CdCoverLetterSection.tsx');
const deliveryPrint = read('components/projects/SafetyDeliveryLetterPrint.tsx');
const cdPrint = read('components/projects/CdCoverLetterPrint.tsx');
const technicalReport = read('components/projects/TechnicalReportSection.tsx');
const supervisionReport = read('components/projects/SupervisionReportSection.tsx');
const finalReport = read('components/projects/FinalInspectionSection.tsx');
const completionCertificate = read('components/projects/CompletionCertificateSection.tsx');

describe('Stage 6B-3D1 server approval orchestration contract', () => {
  it('adds one bounded orchestration RPC without modifying the authoritative 055 or save-only 060 contracts', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.approve_stage6_documents_and_transition(');
    expect(migration).toContain('p_client_id uuid');
    expect(migration).toContain('p_project_id uuid');
    expect(migration).toContain('p_expected_canonical_updated_at timestamptz');
    expect(migration).toContain('p_expected_engineering_delivery_lock_version integer DEFAULT NULL');
    expect(migration).toContain('p_expected_cd_cover_letter_lock_version integer DEFAULT NULL');
    expect(migration).not.toContain('p_target_stage');
    expect(migration).not.toContain('p_approved_at');
    expect(migration).not.toContain('p_document jsonb');
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.transition_project_engineering_stage');
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.save_stage6_singleton_document_bridge');
    expect(stage6a).toContain("v_target = 'final_report'");
    expect(stage6b3c1).toContain('v_legacy_status = \'معتمد\'');
    expect(stage6b3c1).toContain("MESSAGE = 'CORRESPONDENCE_NOT_EDITABLE'");
  });

  it('uses the exact 060 server-side role contract and validates tenant plus the exact primary project mapping', () => {
    expect(migration).toContain("public.app_role_in(ARRAY['super_admin', 'tenant_admin', 'admin', 'manager', 'engineer'])");
    expect(migration).toContain("MESSAGE = 'PROJECT_PERMISSION_DENIED'");
    expect(migration).toContain('v_company_id := public.current_app_company_id();');
    expect(migration).toContain('public.primary_engineering_project_mappings AS m');
    expect(migration).toContain('m.client_id = p_client_id');
    expect(migration).toContain('v_mapped_project_id IS DISTINCT FROM p_project_id');
    expect(migration).toContain("MESSAGE = 'PROJECT_IDENTITY_UNAVAILABLE'");
    expect(migration).toContain("MESSAGE = 'PROJECT_CLIENT_MISMATCH'");
    expect(migration).toContain("MESSAGE = 'TENANT_ACCESS_DENIED'");
    expect(migration).not.toContain('ensure_or_resolve_engineering_project_for_client');
    expect(migration).not.toContain('project_id = p_client_id');
  });

  it('guards the reviewed canonical revision and treats already advanced workflow as a semantic conflict', () => {
    expect(migration).toContain('p_expected_canonical_updated_at IS NULL');
    expect(migration).toContain('v_live.updated_at IS DISTINCT FROM p_expected_canonical_updated_at');
    expect(migration).toContain("MESSAGE = 'CANONICAL_STALE_REVISION'");
    expect(migration).toContain("v_live.payload #>> '{workflow,active_stage}'");
    expect(migration).toContain("MESSAGE = 'WORKFLOW_STATE_CONFLICT'");
    expect(migration).not.toContain('jsonb_set(');
    expect(migration).not.toContain('UPDATE public.project_engineering_live');
    expect(migration).not.toContain('SET payload =');
  });

  it('locks canonical state then both outgoing singleton rows in the prescribed deterministic order', () => {
    const canonicalLock = migration.indexOf('FROM public.project_engineering_live AS pel');
    const deliveryLock = migration.indexOf("pc.correspondence_type = 'engineering_delivery'");
    const coverLock = migration.indexOf("pc.correspondence_type = 'cd_cover_letter'");
    expect(canonicalLock).toBeGreaterThan(-1);
    expect(deliveryLock).toBeGreaterThan(canonicalLock);
    expect(coverLock).toBeGreaterThan(deliveryLock);
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain('v_engineering_delivery_count > 1');
    expect(migration).toContain('v_cd_cover_letter_count > 1');
    expect(migration).toContain("MESSAGE = 'CORRESPONDENCE_SINGLETON_CONFLICT'");
  });

  it('supports zero-row legacy approval, one missing projection, and both ready projections only through the same transaction', () => {
    expect(migration).toContain('IF v_engineering_delivery_count = 0 THEN');
    expect(migration).toContain('IF v_cd_cover_letter_count = 0 THEN');
    expect(migration).toContain("'engineering_delivery', 'outgoing'");
    expect(migration).toContain("'cd_cover_letter', 'outgoing'");
    expect(migration).toContain("'approved', 0, v_now, v_now, v_now");
    expect(migration).toContain("v_engineering_delivery_row.document_status <> 'ready'");
    expect(migration).toContain("v_cd_cover_letter_row.document_status <> 'ready'");
    expect(migration).toContain("MESSAGE = 'CORRESPONDENCE_STATE_DIVERGENCE'");
    expect(migration).toContain('ON CONFLICT (project_id, correspondence_type)');
  });

  it('checks existing optimistic locks fail closed and never lets relational approved substitute for canonical 055', () => {
    expect(migration).toContain('v_engineering_delivery_row.lock_version <> p_expected_engineering_delivery_lock_version');
    expect(migration).toContain('v_cd_cover_letter_row.lock_version <> p_expected_cd_cover_letter_lock_version');
    expect(migration).toContain("MESSAGE = 'CORRESPONDENCE_STALE_VERSION'");
    expect(migration).toContain("v_engineering_delivery_row.document_status = 'approved'");
    expect(migration).toContain("v_cd_cover_letter_row.document_status = 'approved'");
    expect(migration).toContain('public.transition_project_engineering_stage(p_client_id, \'final_report\')');
    expect(migration).not.toContain('approve_project_correspondence(');
    expect(stage6b2).toContain('CREATE OR REPLACE FUNCTION public.approve_project_correspondence(');
    expect(stage6b3b).toContain('REVOKE EXECUTE ON FUNCTION public.approve_project_correspondence');
  });

  it('calls 055 before any relational approval write and keeps failure atomic by allowing exceptions to roll back the transaction', () => {
    const transition = migration.indexOf("public.transition_project_engineering_stage(p_client_id, 'final_report')");
    const firstProjection = migration.indexOf('INSERT INTO public.project_correspondences');
    const firstApprovalUpdate = migration.indexOf("document_status = 'approved'", transition);
    expect(transition).toBeGreaterThan(-1);
    expect(firstProjection).toBeGreaterThan(transition);
    expect(firstApprovalUpdate).toBeGreaterThan(transition);
    expect(migration).toContain("MESSAGE = 'STAGE6_APPROVAL_BLOCKED'");
    expect(migration).toContain('GET STACKED DIAGNOSTICS v_transition_detail = PG_EXCEPTION_DETAIL;');
    expect(migration).toContain('approved_at = v_now');
    expect(migration).toContain("'approved_at', v_now");
    expect(migration).not.toContain('EXCEPTION WHEN OTHERS THEN');
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });

  it('retains least privilege and does not reopen old 057 approval routes or direct table DML', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.approve_stage6_documents_and_transition');
    expect(migration).toContain('FROM PUBLIC;');
    expect(migration).toContain('FROM anon;');
    expect(migration).toContain('TO authenticated, service_role;');
    expect(migration).not.toContain('GRANT EXECUTE ON FUNCTION public.approve_project_correspondence');
    expect(migration).not.toContain('GRANT INSERT ON public.project_correspondences TO authenticated');
    expect(migration).not.toContain('GRANT UPDATE ON public.project_correspondences TO authenticated');
    expect(migration).not.toContain('GRANT DELETE ON public.project_correspondences TO authenticated');
  });

  it('keeps all approved editing surfaces, PDF/templates, and Workspace approval behavior frozen for D1', () => {
    expect(modal).toContain('EngineeringDeliverySection');
    expect(workspace).not.toContain('approve_stage6_documents_and_transition');
    expect(workspace).toContain('مرفقات سجل المراسلات الجديد');
    expect(workspace).not.toContain('finalize_project_correspondence_attachment');
    expect(workspace).not.toContain('request_delete_project_correspondence_attachment');
    expect(deliveryForm).toContain('حفظ بيانات الخطاب');
    expect(cdForm).toContain('حفظ بيانات الخطاب');
    expect(deliveryPrint).not.toContain('projectCode');
    expect(cdPrint).not.toContain('projectCode');
    expect(technicalReport).toContain('TechnicalReportSection');
    expect(supervisionReport).toContain('SupervisionReportSection');
    expect(finalReport).toContain('FinalInspectionSection');
    expect(completionCertificate).toContain('CompletionCertificateSection');
    for (const forbidden of [
      'storage.objects', 'correspondence_attachments', 'correspondence_replies',
      'correspondence_revisions', 'CREATE TABLE public.project_correspondences',
      'ALTER TABLE public.project_correspondences', 'CREATE POLICY',
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});
