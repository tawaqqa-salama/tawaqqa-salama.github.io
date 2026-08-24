import { describe, expect, it } from 'vitest';
import {
  TECHNICAL_REPORT_BINDING_REGISTRY,
  hasBinding,
  manualExtinguisherTypeLabel,
  technicalReportActivityLabel,
  technicalReportHazardLabel,
} from '@/lib/projects/technical-report-binding-registry';

describe('technical report binding registry', () => {
  it('classifies every registered input family as rendered or intentionally excluded with a reason', () => {
    expect(TECHNICAL_REPORT_BINDING_REGISTRY.length).toBeGreaterThan(30);
    for (const binding of TECHNICAL_REPORT_BINDING_REGISTRY) {
      expect(binding.canonical_path).not.toBe('');
      expect(binding.official_report).not.toBe('');
      expect(binding.administrative_report).not.toBe('');
      expect(['rendered', 'intentionally_not_in_pdf']).toContain(binding.disposition);
      if (binding.disposition === 'intentionally_not_in_pdf') {
        expect(binding.reason).toBeTruthy();
      }
    }
  });

  it('covers every binding family identified by the report UI and audit', () => {
    for (const id of [
      'project.permit.date',
      'plan.floors_description',
      'plan.fire_alarm_system',
      'plan.sprinkler_system',
      'plan.electrical',
      'space.sprinklers',
      'space.alarm_devices',
      'report.exits_notes',
      'report.ventilation_notes',
      'report.approval',
      'design.fire_truck_access',
      'design.standpipe',
      'design.extinguishers',
    ]) {
      expect(hasBinding(id)).toBe(true);
    }
  });

  it('renders user-facing Arabic labels for stored technical identifiers', () => {
    expect(manualExtinguisherTypeLabel('carbon_dioxide')).toBe('ثاني أكسيد الكربون CO₂');
    expect(manualExtinguisherTypeLabel('custom_type')).toBe('custom_type');
    expect(technicalReportActivityLabel('office')).toBe('مكاتب / إداري');
    expect(technicalReportHazardLabel('ordinary_hazard_group_1')).toBe('خطورة عادية — المجموعة الأولى');
  });
});
