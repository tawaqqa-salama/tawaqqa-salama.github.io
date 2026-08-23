import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const migration = read('scripts/sql/060_stage6b3c1_full_document_bridge.sql');
const contract = read('docs/stage6b3c1-full-document-contract.md');
const types = read('lib/types/project-reports.ts');
const stage6a = read('lib/projects/stage6-contract.ts');
const stage6aGate = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const stage6b1 = read('scripts/sql/056_stage6b_project_correspondences_schema.sql');
const stage6b2 = read('scripts/sql/057_stage6b_correspondence_persistence_rpcs.sql');
const stage6b3b = read('scripts/sql/059_stage6b_singleton_compatibility_bridge.sql');
const workspace = read('components/projects/ReadOnlyCorrespondenceWorkspace.tsx');
const modal = read('components/projects/ProjectReportModal.tsx');
const deliveryForm = read('components/projects/EngineeringDeliverySection.tsx');
const cdForm = read('components/projects/CdCoverLetterSection.tsx');
const deliveryPrint = read('components/projects/SafetyDeliveryLetterPrint.tsx');
const cdPrint = read('components/projects/CdCoverLetterPrint.tsx');

const deliveryFields = [
  'status', 'delivery_date', 'delivered_to', 'copy_to', 'study_summary', 'notes',
  'attachments_note', 'attachments_count', 'outgoing_number', 'hijri_date',
  'civil_defense_city', 'building_permit_number', 'safety_engineer_name',
  'safety_engineer_title', 'safety_engineer_phone', 'manager_name', 'manager_title',
  'manager_phone', 'safety_scope',
];

const coverFields = [
  'status', 'letter_date', 'outgoing_number', 'addressee', 'copy_to',
  'building_status', 'manager_name', 'manager_title', 'safety_engineer_name',
  'safety_engineer_title',
];

describe('Stage 6B-3C1 full document singleton bridge contract', () => {
  it('documents and whitelists every persisted field in both approved singleton types', () => {
    for (const field of deliveryFields) {
      expect(types).toContain(field);
      expect(contract).toContain(`engineering_delivery.${field}`);
      expect(migration).toContain(`'${field}'`);
    }
    for (const field of coverFields) {
      expect(types).toContain(field);
      expect(contract).toContain(`cd_cover_letter.${field}`);
      expect(migration).toContain(`'${field}'`);
    }
    expect(contract).toContain('A. Common relational core');
    expect(contract).toContain('B. Type-specific structured field');
    expect(contract).toContain('C. Singleton-only, preserved');
    expect(contract).toContain('D. Derived display / preserved');
  });

  it('accepts exactly one bounded document object and protects unrelated payload sections', () => {
    expect(migration).toContain('jsonb_typeof(p_document) IS DISTINCT FROM \'object\'');
    expect(migration).toContain('jsonb_object_keys(p_document) AS supplied_key(key)');
    expect(migration).toContain("MESSAGE = 'INVALID_DOCUMENT_PAYLOAD'");
    expect(migration).toContain('v_next_document := v_document || p_document;');
    expect(migration).toContain("'{engineering_delivery}'::text[]");
    expect(migration).toContain("'{cd_cover_letter}'::text[]");
    expect(migration).not.toContain("'{technical_report}'::text[]");
    expect(migration).toContain("'{workflow,active_stage}'");
    expect(migration).toContain("MESSAGE = 'STAGE6_NOT_ACTIVE'");
    expect(migration).not.toContain('UPDATE public.clients\nSET project_engineering_data');
  });

  it('preserves all untouched singleton fields and validates the structured safety scope safely', () => {
    expect(migration).toContain('Existing keys survive exactly unless the browser explicitly supplied');
    expect(migration).toContain('v_next_document := v_document || p_document;');
    expect(migration).toContain("'firefighting', 'alarm', 'smoke_control', 'emergency_exits', 'supervision_contract'");
    expect(migration).toContain("scope_row.value ->> 'label' IS DISTINCT FROM 'نظام الإطفاء'");
    expect(migration).toContain("scope_row.value ->> 'option' NOT IN");
    expect(migration).toContain("scope_row.value ->> 'applicable' NOT IN ('نعم', 'لا')");
    expect(migration).toContain('count(*) <> count(DISTINCT scope_row.value ->> \'id\')');
    expect(contract).toContain('every omitted official field and every legacy-compatible existing key survives exactly');
  });

  it('enforces the existing projects.edit-equivalent roles server-side instead of UI visibility', () => {
    expect(migration).toContain("public.app_role_in(ARRAY['super_admin', 'tenant_admin', 'admin', 'manager', 'engineer'])");
    expect(migration).toContain("MESSAGE = 'PROJECT_PERMISSION_DENIED'");
    expect(migration).toContain('v_company_id := public.current_app_company_id();');
    expect(migration).toContain('public.primary_engineering_project_mappings AS m');
    expect(migration).toContain('m.client_id = p_client_id');
    expect(migration).toContain('m.project_id = p_project_id');
    expect(migration).toContain("MESSAGE = 'PROJECT_CLIENT_MISMATCH'");
    expect(migration).not.toContain('ensure_or_resolve_engineering_project_for_client');
    expect(migration).not.toContain('project_id = p_client_id');
  });

  it('keeps approval outside the bridge and validates ready with Stage 6A-compatible required fields', () => {
    expect(migration).toContain("WHEN 'مكتمل' THEN 'ready'");
    expect(migration).toContain("v_legacy_status = 'معتمد'");
    expect(migration).toContain("MESSAGE = 'CORRESPONDENCE_NOT_EDITABLE'");
    expect(migration).toContain("MESSAGE = 'CORRESPONDENCE_INCOMPLETE'");
    expect(migration).toContain('v_relational_status = \'ready\'');
    expect(migration).not.toContain('transition_project_engineering_stage(');
    expect(migration).not.toContain("'{workflow,approved_at}'");
    expect(stage6a).toContain("'STAGE6_ENGINEERING_DELIVERY_INCOMPLETE'");
    expect(stage6a).toContain("'STAGE6_CD_COVER_LETTER_INCOMPLETE'");
    expect(stage6aGate).toContain("v_target NOT IN ('supervision_visits', 'transmittals', 'final_report')");
  });

  it('creates the first projection safely and keeps subsequent saves singleton and stale-safe', () => {
    expect(migration).toContain('FROM public.project_engineering_live AS pel');
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain('FROM public.project_correspondences AS pc');
    expect(migration).toContain('v_current.lock_version <> p_expected_lock_version');
    expect(migration).toContain("MESSAGE = 'CORRESPONDENCE_STALE_VERSION'");
    expect(migration).toContain('lock_version = lock_version + 1');
    expect(migration).toContain('ON CONFLICT (project_id, correspondence_type)');
    expect(migration).toContain("MESSAGE = 'CORRESPONDENCE_SINGLETON_CONFLICT'");
    expect(migration).toContain("set_config('app.stage6b3b_bridge', 'on', true)");
    expect(migration).toContain('UPDATE public.project_engineering_live');
    expect(migration).not.toContain('COMMIT;\n\nUPDATE');
  });

  it('preserves old hardening: direct DML and 057 routes remain blocked, while 059 subset browser access is removed', () => {
    expect(stage6b1).toContain('REVOKE INSERT, UPDATE, DELETE ON public.project_correspondences FROM authenticated');
    expect(stage6b2).toContain('GRANT EXECUTE ON FUNCTION public.create_project_correspondence_draft');
    expect(stage6b3b).toContain('REVOKE EXECUTE ON FUNCTION public.create_project_correspondence_draft');
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.save_stage6_singleton_correspondence_bridge');
    expect(migration).toContain('FROM authenticated;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.save_stage6_singleton_document_bridge');
    expect(migration).toContain('TO authenticated, service_role;');
    expect(migration).not.toContain('GRANT INSERT ON public.project_correspondences TO authenticated');
    expect(migration).not.toContain('GRANT UPDATE ON public.project_correspondences TO authenticated');
    expect(migration).not.toContain('GRANT DELETE ON public.project_correspondences TO authenticated');
  });

  it('does not alter approved forms, workspace correspondence semantics, templates, Storage policy, or later-stage scope', () => {
    expect(workspace).toContain('مرفقات سجل المراسلات الجديد');
    expect(workspace).not.toContain('onSave');
    expect(workspace).not.toContain('approveStage6DocumentsAndTransition');
    expect(workspace).not.toContain('finalize_project_correspondence_attachment');
    expect(workspace).not.toContain('request_delete_project_correspondence_attachment');
    expect(modal.indexOf('<ReadOnlyCorrespondenceWorkspace')).toBeLessThan(modal.indexOf('<EngineeringDeliverySection'));
    expect(deliveryForm).toContain('حفظ بيانات الخطاب');
    expect(cdForm).toContain('حفظ بيانات الخطاب');
    expect(deliveryPrint).not.toContain('projectCode');
    expect(cdPrint).not.toContain('projectCode');
    for (const forbidden of [
      'storage.objects', 'correspondence_attachments', 'correspondence_replies',
      'correspondence_revisions', 'SafetyDeliveryLetterPrint', 'CdCoverLetterPrint',
      'CREATE TABLE public.project_correspondences', 'ALTER TABLE public.project_correspondences',
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});
