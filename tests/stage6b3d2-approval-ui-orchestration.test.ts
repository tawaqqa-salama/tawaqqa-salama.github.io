import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const adapter = read('lib/projects/stage6-approval-orchestration.ts');
const modal = read('components/projects/ProjectReportModal.tsx');
const migration055 = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const migration057 = read('scripts/sql/057_stage6b_correspondence_persistence_rpcs.sql');
const migration060 = read('scripts/sql/060_stage6b3c1_full_document_bridge.sql');
const migration061 = read('scripts/sql/061_stage6b3d1_approval_orchestration.sql');
const workspace = read('components/projects/ReadOnlyCorrespondenceWorkspace.tsx');
const deliveryForm = read('components/projects/EngineeringDeliverySection.tsx');
const cdForm = read('components/projects/CdCoverLetterSection.tsx');
const technicalReport = read('components/projects/TechnicalReportSection.tsx');
const supervisionReport = read('components/projects/SupervisionReportSection.tsx');
const finalReport = read('components/projects/FinalInspectionSection.tsx');
const completionCertificate = read('components/projects/CompletionCertificateSection.tsx');
const deliveryPrint = read('components/projects/SafetyDeliveryLetterPrint.tsx');
const cdPrint = read('components/projects/CdCoverLetterPrint.tsx');

describe('Stage 6B-3D2 approval UI orchestration', () => {
  it('reuses the existing Stage 6 approval handler and advisory UX blockers without adding a new approval surface', () => {
    expect(modal).toContain('const handleApproveAndProceed = async () =>');
    expect(modal).toContain('stageApprovalBlockers(activeStage, client, data)');
    expect(modal).toContain("if (activeStage === 'transmittals')");
    expect(modal).toContain('approveStage6DocumentsAndTransition({');
    expect(modal).toContain('stage6ApprovalInFlightRef.current');
    expect(workspace).not.toContain('approveStage6DocumentsAndTransition');
    expect(workspace).toContain('مرفقات سجل المراسلات الجديد');
    expect(workspace).not.toContain('finalize_project_correspondence_attachment');
    expect(workspace).not.toContain('request_delete_project_correspondence_attachment');
    expect(modal).toContain('disabled={saving || blockers.length > 0}');
    expect(modal).toContain("{saving ? 'جاري الحفظ...' : approveButtonLabel}");
    expect(modal).toContain('className="flex flex-wrap gap-2"');
    expect(modal).toContain('text-white text-sm font-bold disabled:opacity-50');
  });

  it('keeps one browser approval mutation boundary: Migration 061 only', () => {
    expect(adapter).toContain("supabase.rpc('approve_stage6_documents_and_transition'");
    expect(adapter).toContain('The sole browser approval mutation boundary for Stage 6.');
    expect(adapter).not.toContain("supabase.rpc('transition_project_engineering_stage'");
    expect(adapter).not.toContain("supabase.rpc('approve_project_correspondence'");
    expect(adapter).not.toContain("supabase.rpc('save_stage6_singleton_document_bridge'");
    expect(adapter).not.toMatch(/\.from\('project_correspondences'\)\.(insert|update|upsert|delete)/);
    expect(adapter).not.toMatch(/\.from\('project_engineering_live'\)\.(insert|update|upsert|delete)/);
    const transmittals = modal.slice(modal.indexOf("if (activeStage === 'transmittals')"));
    expect(transmittals).not.toContain("transitionProjectEngineeringStage(client.id, 'final_report')");
    expect(transmittals).not.toContain('saveReportData(');
  });

  it('reads the exact canonical revision and outgoing singleton lock versions with null sentinels for absent rows', () => {
    expect(adapter).toContain(".from('project_engineering_live')");
    expect(adapter).toContain(".select('updated_at')");
    expect(adapter).toContain(".eq('client_id', params.clientId)");
    expect(adapter).toContain(".from('project_correspondences')");
    expect(adapter).toContain(".eq('project_id', params.projectId)");
    expect(adapter).toContain(".eq('client_id', params.clientId)");
    expect(adapter).toContain(".eq('direction', 'outgoing')");
    expect(adapter).toContain(".in('correspondence_type', [...STAGE6_TYPES])");
    expect(adapter).toContain('if (!row) return null;');
    expect(adapter).toContain('p_expected_canonical_updated_at: snapshot.snapshot.canonicalUpdatedAt');
    expect(adapter).toContain('p_expected_engineering_delivery_lock_version: snapshot.snapshot.engineeringDeliveryLockVersion');
    expect(adapter).toContain('p_expected_cd_cover_letter_lock_version: snapshot.snapshot.cdCoverLetterLockVersion');
  });

  it('requires exact identity and blocks unavailable or mismatched canonical identity without any fallback', () => {
    expect(adapter).toContain('identity.clientId !== clientId || !identity.projectId');
    expect(adapter).toContain("code: 'IDENTITY_UNAVAILABLE'");
    expect(adapter).not.toContain('ensure_or_resolve_engineering_project_for_client');
    expect(adapter).not.toContain('projectId = clientId');
    expect(adapter).not.toContain('projects[0]');
    expect(modal).toContain('identity: client.primary_engineering_project_identity');
  });

  it('never supplies approved_at or an optimistic canonical/relational approval write from the browser', () => {
    expect(adapter).not.toContain('p_approved_at');
    expect(adapter).not.toContain('approved_at:');
    expect(adapter).not.toMatch(/\.from\('project_correspondences'\)\.(insert|update|upsert|delete)/);
    expect(adapter).not.toMatch(/\.from\('project_engineering_live'\)\.(insert|update|upsert|delete)/);
    const transmittals = modal.slice(modal.indexOf("if (activeStage === 'transmittals')"));
    expect(transmittals).toContain('const canonical = await reloadStage6CanonicalState();');
    expect(transmittals).not.toContain("setActiveStage('final_report')");
    expect(modal).toContain('setActiveStage(resolveActiveStage(client, canonical, null));');
  });

  it('maps stale revisions, stale locks, workflow divergence, authorization, and network uncertainty to fail-closed Arabic UX', () => {
    for (const code of [
      'CANONICAL_STALE_REVISION',
      'CORRESPONDENCE_STALE_VERSION',
      'WORKFLOW_STATE_CONFLICT',
      'CORRESPONDENCE_STATE_DIVERGENCE',
      'TENANT_ACCESS_DENIED',
      'PROJECT_PERMISSION_DENIED',
      'NETWORK_OR_RPC_FAILURE',
    ]) {
      expect(adapter).toContain(code);
    }
    expect(adapter).toContain('تم تحديث بيانات المرحلة منذ آخر تحميل. أعد تحميل البيانات وراجعها قبل الاعتماد.');
    expect(adapter).toContain('لم تُغيّر البيانات؛ تواصل مع مسؤول النظام للمراجعة.');
    expect(modal).toContain('لم يُنفذ أي retry تلقائي.');
    expect(modal).toContain('stage6ApprovalReloadRequired');
  });

  it('reloads canonical server truth and the read-only Workspace only after a confirmed response or safe conflict review', () => {
    expect(modal).toContain('const reloadStage6CanonicalState = async');
    expect(modal).toContain('const canonical = await loadEngineeringLive(client.id);');
    expect(modal).toContain('setData(canonical);');
    expect(modal).toContain('setStage6WorkspaceRevision((revision) => revision + 1);');
    expect(modal).toContain('requestAnimationFrame(() => onUpdated());');
  });

  it('preserves 055 as Stage 7 authority and retains 061 atomic projection ordering', () => {
    expect(migration061).toContain("public.transition_project_engineering_stage(p_client_id, 'final_report')");
    expect(migration061).not.toContain('UPDATE public.project_engineering_live');
    expect(migration061).toContain("MESSAGE = 'STAGE6_APPROVAL_BLOCKED'");
    expect(migration061).toContain("MESSAGE = 'CORRESPONDENCE_STATE_DIVERGENCE'");
    expect(migration055).toContain("v_target = 'final_report'");
    expect(migration055).toContain("'معتمد'");
    expect(migration057).toContain('CREATE OR REPLACE FUNCTION public.approve_project_correspondence(');
    expect(migration061).not.toContain('approve_project_correspondence(');
  });

  it('keeps the approved models, templates, print surfaces, and save bridge frozen', () => {
    expect(deliveryForm).toContain('حفظ بيانات الخطاب');
    expect(cdForm).toContain('حفظ بيانات الخطاب');
    expect(technicalReport).toContain('TechnicalReportSection');
    expect(supervisionReport).toContain('SupervisionReportSection');
    expect(finalReport).toContain('FinalInspectionSection');
    expect(completionCertificate).toContain('CompletionCertificateSection');
    expect(deliveryPrint).not.toContain('projectCode');
    expect(cdPrint).not.toContain('projectCode');
    expect(migration060).toContain('save_stage6_singleton_document_bridge');
  });
});
