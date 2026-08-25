import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => {
  const rpc = vi.fn();
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
  };
  const from = vi.fn(() => chain);
  return { rpc, chain, from };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: supabaseMock.from,
    rpc: supabaseMock.rpc,
  },
}));

import {
  saveStage6SingletonDocument,
  stage6BridgeDocumentPayload,
  stage6BridgeErrorMessage,
} from '@/lib/projects/stage6-singleton-document-bridge';
import type { CanonicalProjectIdentity } from '@/lib/types/client';
import type { CdCoverLetterReport, EngineeringDeliveryReport } from '@/lib/types/project-reports';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const adapter = read('lib/projects/stage6-singleton-document-bridge.ts');
const modal = read('components/projects/ProjectReportModal.tsx');
const workspace = read('components/projects/ReadOnlyCorrespondenceWorkspace.tsx');
const deliveryForm = read('components/projects/EngineeringDeliverySection.tsx');
const cdForm = read('components/projects/CdCoverLetterSection.tsx');
const stage6a = read('lib/projects/stage6-contract.ts');
const stage6aGate = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const migration060 = read('scripts/sql/060_stage6b3c1_full_document_bridge.sql');

const clientId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const identity: CanonicalProjectIdentity = {
  clientId,
  projectId,
  projectCode: 'PRJ-2026-000001',
  projectClassification: null,
};

const delivery: EngineeringDeliveryReport = {
  status: 'قيد الإعداد',
  delivery_date: '2026-08-23',
  delivered_to: 'الإدارة العامة للدفاع المدني',
  copy_to: 'المالك',
  study_summary: 'ملخص الدراسة',
  notes: 'ملاحظة',
  attachments_note: 'مخططات معتمدة',
  attachments_count: 0,
  outgoing_number: 'OUT-2026-001',
  hijri_date: '1448-01-01',
  civil_defense_city: 'جدة',
  building_permit_number: 'BP-1',
  safety_engineer_name: 'مهندس السلامة',
  safety_engineer_title: 'مهندس',
  safety_engineer_phone: '0500000000',
  manager_name: 'مدير المكتب',
  manager_title: 'المدير',
  manager_phone: '0511111111',
  safety_scope: [
    { id: 'firefighting', label: 'نظام الإطفاء', option: 'new_design', applicable: 'نعم' },
  ],
  updated_at: 'must-not-be-serialized',
};

const cover: CdCoverLetterReport = {
  status: 'قيد الإعداد',
  letter_date: '2026-08-23',
  outgoing_number: 'OUT-2026-002',
  addressee: 'الدفاع المدني',
  copy_to: 'مركز السلامة',
  building_status: 'تحت الإنشاء',
  manager_name: 'مدير المكتب',
  manager_title: 'المدير',
  safety_engineer_name: 'مهندس السلامة',
  safety_engineer_title: 'مهندس',
  updated_at: 'must-not-be-serialized',
};

function setLookup(rows: unknown[], error: unknown = null) {
  supabaseMock.chain.select.mockReturnValue(supabaseMock.chain);
  supabaseMock.chain.eq
    .mockReturnValueOnce(supabaseMock.chain)
    .mockReturnValueOnce(supabaseMock.chain)
    .mockReturnValueOnce(supabaseMock.chain)
    .mockResolvedValueOnce({ data: rows, error });
}

describe('Stage 6B-3C2 approved forms bridge integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serializes every approved singleton field and omits updated_at without reducing the full document', () => {
    const deliveryPayload = stage6BridgeDocumentPayload('engineering_delivery', delivery);
    const coverPayload = stage6BridgeDocumentPayload('cd_cover_letter', cover);

    expect(Object.keys(deliveryPayload)).toEqual([
      'status', 'delivery_date', 'delivered_to', 'copy_to', 'study_summary', 'notes',
      'attachments_note', 'attachments_count', 'outgoing_number', 'hijri_date',
      'civil_defense_city', 'building_permit_number', 'safety_engineer_name',
      'safety_engineer_title', 'safety_engineer_phone', 'manager_name', 'manager_title',
      'manager_phone', 'safety_scope',
    ]);
    expect(Object.keys(coverPayload)).toEqual([
      'status', 'letter_date', 'outgoing_number', 'addressee', 'copy_to',
      'building_status', 'manager_name', 'manager_title', 'safety_engineer_name',
      'safety_engineer_title',
    ]);
    expect(deliveryPayload.attachments_count).toBe(0);
    expect(deliveryPayload.safety_scope).toEqual(delivery.safety_scope);
    expect(deliveryPayload).not.toHaveProperty('updated_at');
    expect(coverPayload).not.toHaveProperty('updated_at');
  });

  it('treats zero rows as a normal first explicit save and calls only RPC 060 once with the exact identity and lock 0', async () => {
    setLookup([]);
    supabaseMock.rpc.mockResolvedValue({ data: { lock_version: 1 }, error: null });

    await expect(
      saveStage6SingletonDocument({ clientId, identity, type: 'engineering_delivery', document: delivery })
    ).resolves.toEqual({ ok: true, lockVersion: 1 });

    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith('project_correspondences');
    expect(supabaseMock.chain.select).toHaveBeenCalledWith('lock_version');
    expect(supabaseMock.chain.eq).toHaveBeenNthCalledWith(1, 'project_id', projectId);
    expect(supabaseMock.chain.eq).toHaveBeenNthCalledWith(2, 'client_id', clientId);
    expect(supabaseMock.chain.eq).toHaveBeenNthCalledWith(3, 'correspondence_type', 'engineering_delivery');
    expect(supabaseMock.chain.eq).toHaveBeenNthCalledWith(4, 'direction', 'outgoing');
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('save_stage6_singleton_document_bridge', {
      p_client_id: clientId,
      p_project_id: projectId,
      p_correspondence_type: 'engineering_delivery',
      p_expected_lock_version: 0,
      p_document: stage6BridgeDocumentPayload('engineering_delivery', delivery),
    });
  });

  it('uses the exact existing outgoing lock for subsequent saves without a retry or a second browser mutation', async () => {
    setLookup([{ lock_version: 7 }]);
    supabaseMock.rpc.mockResolvedValue({ data: { lock_version: 8 }, error: null });

    await expect(
      saveStage6SingletonDocument({ clientId, identity, type: 'cd_cover_letter', document: cover })
    ).resolves.toEqual({ ok: true, lockVersion: 8 });

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc.mock.calls[0][1]).toMatchObject({
      p_correspondence_type: 'cd_cover_letter',
      p_expected_lock_version: 7,
    });
  });

  it('fails closed when identity is unavailable or the exact singleton lookup is ambiguous', async () => {
    await expect(
      saveStage6SingletonDocument({
        clientId,
        identity: { ...identity, clientId: 'different-client' },
        type: 'engineering_delivery',
        document: delivery,
      })
    ).resolves.toEqual({ ok: false, code: 'IDENTITY_UNAVAILABLE' });
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();

    setLookup([{ lock_version: 1 }, { lock_version: 2 }]);
    await expect(
      saveStage6SingletonDocument({ clientId, identity, type: 'engineering_delivery', document: delivery })
    ).resolves.toEqual({ ok: false, code: 'CORRESPONDENCE_SINGLETON_CONFLICT' });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('maps stale, singleton-conflict, and network failures to concise Arabic reload-safe messages', async () => {
    setLookup([{ lock_version: 3 }]);
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'CORRESPONDENCE_STALE_VERSION' } });
    await expect(
      saveStage6SingletonDocument({ clientId, identity, type: 'engineering_delivery', document: delivery })
    ).resolves.toEqual({ ok: false, code: 'CORRESPONDENCE_STALE_VERSION' });

    expect(stage6BridgeErrorMessage('CORRESPONDENCE_STALE_VERSION')).toContain('أعد تحميل');
    expect(stage6BridgeErrorMessage('CORRESPONDENCE_SINGLETON_CONFLICT')).toContain('أعد تحميل');
    expect(stage6BridgeErrorMessage('NETWORK_OR_RPC_FAILURE')).toContain('بقيت بيانات النموذج');
  });

  it('keeps all Stage 6 mutation at the single 060 RPC boundary and refreshes canonical/Workspace only after success', () => {
    expect(adapter).toContain(".rpc('save_stage6_singleton_document_bridge'");
    expect(adapter).not.toContain('saveReportData');
    expect(adapter).not.toContain('saveEngineeringLive');
    expect(adapter).not.toContain('.insert(');
    expect(adapter).not.toContain('.update(');
    expect(adapter).not.toContain("create_project_correspondence_draft");
    expect(adapter).not.toContain("save_stage6_singleton_correspondence_bridge");

    const stage6Block = modal.slice(
      modal.indexOf("{activeStage === 'transmittals'"),
      modal.indexOf("{activeStage === 'final_report'")
    );
    expect(stage6Block).toContain('saveStage6Document(');
    expect(stage6Block).not.toContain('save(data');
    expect(stage6Block).not.toContain('saveReportData');
    expect(modal).toContain('const canonical = await loadEngineeringLive(client.id);');
    expect(modal).toContain('setStage6WorkspaceRevision((revision) => revision + 1);');
    expect(modal).toContain("if (activeStage === 'transmittals') {");
    expect(modal).toContain('العقد الخادمي المخصص فقط');
    expect(workspace).toContain('مرفقات سجل المراسلات الجديد');
    expect(workspace).not.toContain('onSave');
    expect(workspace).not.toContain('approveStage6DocumentsAndTransition');
    expect(workspace).not.toContain('finalize_project_correspondence_attachment');
    expect(workspace).not.toContain('request_delete_project_correspondence_attachment');
  });

  it('preserves the approved editing surfaces, document templates, and Stage 6A authority while guarding print after save success', () => {
    expect(deliveryForm).toContain('حفظ بيانات الخطاب');
    expect(cdForm).toContain('حفظ بيانات الخطاب');
    expect(cdForm).toContain('const saved = await onSave(ready);');
    expect(cdForm).toContain('if (!saved) return;');
    expect(cdForm.indexOf('if (!saved) return;')).toBeLessThan(cdForm.indexOf('printCdCoverLetter({'));
    expect(stage6a).toContain('STAGE6_ENGINEERING_DELIVERY_INCOMPLETE');
    expect(stage6a).toContain('STAGE6_CD_COVER_LETTER_INCOMPLETE');
    expect(stage6aGate).toContain("v_target NOT IN ('supervision_visits', 'transmittals', 'final_report')");
    expect(migration060).toContain('save_stage6_singleton_document_bridge');
    expect(migration060).not.toContain('transition_project_engineering_stage(');
  });
});
