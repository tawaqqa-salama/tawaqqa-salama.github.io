import { describe, expect, it } from 'vitest';
import {
  completionAttachmentBlockers,
  hasAllRequiredCompletionAttachments,
  isFoodAndBeverageProject,
  listCompletionAttachmentSlots,
  missingCompletionAttachmentLabels,
  projectHasElevators,
} from '@/lib/projects/completion-attachments';
import type { ClientRecord } from '@/lib/types/client';
import {
  EMPTY_COMPLETION_ATTACHMENTS,
  EMPTY_PROJECT_ENGINEERING_DATA,
  type PlanAttachmentFile,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';

function client(partial: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'c1',
    client_code: 'C-1',
    name: 'عميل',
    ...partial,
  };
}

function file(kind: PlanAttachmentFile['kind']): PlanAttachmentFile {
  return {
    id: `f-${kind}`,
    fileName: `${kind}.pdf`,
    format: 'pdf',
    sizeBytes: 1000,
    uploadedAt: '2026-08-04T00:00:00.000Z',
    kind,
  };
}

function data(partial: Partial<ProjectEngineeringData> = {}): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    building_plan: { ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan },
    completion_attachments: { ...EMPTY_COMPLETION_ATTACHMENTS },
    ...partial,
  };
}

describe('completion safety attachments gate', () => {
  it('detects elevators from building plan count', () => {
    expect(projectHasElevators(data())).toBe(false);
    expect(projectHasElevators(data({ building_plan: { status: 'مسودة', elevators_count: '2' } }))).toBe(
      true
    );
  });

  it('detects food & beverage from restaurant activity', () => {
    expect(isFoodAndBeverageProject(client({ activity_type: 'office' }))).toBe(false);
    expect(isFoodAndBeverageProject(client({ activity_type: 'restaurant' }))).toBe(true);
  });

  it('marks elevator and gas slots not applicable when conditions absent', () => {
    const slots = listCompletionAttachmentSlots(client({ activity_type: 'office' }), data());
    const elevator = slots.find((s) => s.kind === 'elevator_maintenance_contract');
    const gas = slots.find((s) => s.kind === 'gas_chimney_certificate');
    expect(elevator?.status).toBe('not_applicable');
    expect(gas?.status).toBe('not_applicable');
    expect(slots.filter((s) => s.status === 'required')).toHaveLength(3);
  });

  it('requires elevator and gas docs when applicable', () => {
    const project = data({
      building_plan: { status: 'مسودة', elevators_count: '1' },
    });
    const labels = missingCompletionAttachmentLabels(
      client({ activity_type: 'restaurant' }),
      project
    );
    expect(labels.some((l) => l.includes('المصاعد'))).toBe(true);
    expect(labels.some((l) => l.includes('الغاز'))).toBe(true);
    expect(labels).toHaveLength(5);
  });

  it('blocks completion until mandatory files uploaded', () => {
    const project = data();
    const blockers = completionAttachmentBlockers(client({ activity_type: 'office' }), project);
    expect(blockers[0]).toMatch(/يرجى إرفاق/);
    expect(blockers[0]).toMatch(/شهادة إنهاء الأعمال/);
    expect(hasAllRequiredCompletionAttachments(client({ activity_type: 'office' }), project)).toBe(
      false
    );

    const ready = data({
      completion_attachments: {
        ...EMPTY_COMPLETION_ATTACHMENTS,
        fire_alarm_install_contract: file('fire_alarm_install_contract'),
        fire_alarm_maintenance_contract: file('fire_alarm_maintenance_contract'),
        electrical_safety_certificate: file('electrical_safety_certificate'),
      },
    });
    expect(hasAllRequiredCompletionAttachments(client({ activity_type: 'office' }), ready)).toBe(
      true
    );
    expect(completionAttachmentBlockers(client({ activity_type: 'office' }), ready)).toEqual([]);
  });
});
