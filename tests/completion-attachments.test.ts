import { describe, expect, it } from 'vitest';
import {
  isKitchenActivity,
  hasElevatorPresent,
  resolveCompletionAttachmentSlots,
  validateCompletionAttachmentsForIssue,
  normalizeCompletionAttachments,
  type CompletionAttachmentFile,
} from '@/lib/projects/completion-certificate-attachments';

function file(kind: CompletionAttachmentFile['kind']): CompletionAttachmentFile {
  return {
    id: `f-${kind}`,
    fileName: `${kind}.pdf`,
    format: 'pdf',
    sizeBytes: 10,
    uploadedAt: '2026-08-05T00:00:00.000Z',
    kind,
  };
}

describe('completion certificate attachments', () => {
  it('detects kitchen activities for gas + chimney slots', () => {
    expect(isKitchenActivity({ activityType: 'restaurant' })).toBe(true);
    expect(isKitchenActivity({ activityType: 'office' })).toBe(false);
    expect(isKitchenActivity({ activityType: 'warehouse', activityLabel: 'مطبخ مركزي' })).toBe(true);
  });

  it('shows gas and chimney only for kitchens; elevator only when present', () => {
    const office = resolveCompletionAttachmentSlots({
      activityType: 'office',
      hasElevator: 'لا',
    });
    expect(office.map((s) => s.kind)).toEqual([
      'electrical_safety_certificate',
      'fire_alarm_installation_contract',
      'fire_alarm_maintenance_contract',
      'other',
    ]);

    const kitchen = resolveCompletionAttachmentSlots({
      activityType: 'restaurant',
      hasElevator: 'نعم',
    });
    expect(kitchen.some((s) => s.kind === 'gas_safety_certificate')).toBe(true);
    expect(kitchen.some((s) => s.kind === 'chimney_installation_certificate')).toBe(true);
    expect(kitchen.some((s) => s.kind === 'elevator_maintenance_contract')).toBe(true);
  });

  it('blocks certificate issue when required attachments missing', () => {
    const err = validateCompletionAttachmentsForIssue(normalizeCompletionAttachments(null), {
      activityType: 'restaurant',
      hasElevator: 'نعم',
    });
    expect(err).toMatch(/شهادة سلامة تمديدات الكهرباء/);
    expect(err).toMatch(/تمديدات الغاز/);
    expect(err).toMatch(/المداخن/);
    expect(err).toMatch(/صيانة المصاعد/);
  });

  it('allows issue when all visible required files attached', () => {
    const ok = validateCompletionAttachmentsForIssue(
      {
        electrical_safety_certificate: file('electrical_safety_certificate'),
        gas_safety_certificate: file('gas_safety_certificate'),
        chimney_installation_certificate: file('chimney_installation_certificate'),
        fire_alarm_installation_contract: file('fire_alarm_installation_contract'),
        fire_alarm_maintenance_contract: file('fire_alarm_maintenance_contract'),
        elevator_maintenance_contract: file('elevator_maintenance_contract'),
        other: [],
      },
      { activityType: 'restaurant', hasElevator: 'نعم' }
    );
    expect(ok).toBeNull();
  });

  it('reads elevator from plan count', () => {
    expect(hasElevatorPresent({ elevatorsCount: '2' })).toBe(true);
    expect(hasElevatorPresent({ elevatorsCount: '0' })).toBe(false);
  });
});
