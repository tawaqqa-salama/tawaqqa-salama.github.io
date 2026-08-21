import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import {
  createFieldVisitObservation,
  normalizeFieldVisitObservations,
} from '@/lib/projects/field-visit-observations';
import { buildFieldVisitReportHtml } from '@/components/projects/FieldVisitReportPrint';
import type { ClientRecord } from '@/lib/types/client';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const client = {
  id: 'client-field-observation',
  client_code: 'LD-OBS-01',
  name: 'منشأة اختبار',
  business_name: 'مشروع اختبار',
  city: 'الرياض',
} as ClientRecord;

describe('Phase 5B field visit structured observations', () => {
  it('creates a text-only open observation with safe defaults', () => {
    expect(createFieldVisitObservation('obs-1')).toEqual({
      id: 'obs-1',
      category: 'other',
      location: '',
      description: '',
      severity: 'medium',
      required_action: '',
      responsible_party: '',
      due_date: '',
      status: 'open',
    });
  });

  it('normalizes invalid legacy values and strips untrusted file-shaped keys', () => {
    const observations = normalizeFieldVisitObservations([
      {
        id: 'obs-1',
        category: 'unexpected',
        location: ' غرفة المضخات ',
        description: ' ملاحظة ',
        severity: 'unknown',
        required_action: ' معالجة ',
        responsible_party: ' المقاول ',
        due_date: '2026-09-01',
        status: 'not_real',
        storagePath: 'project-files/should-not-persist.pdf',
        dataUrl: 'data:image/png;base64,not-allowed',
      },
    ]);

    expect(observations).toEqual([
      {
        id: 'obs-1',
        category: 'other',
        location: 'غرفة المضخات',
        description: 'ملاحظة',
        severity: 'medium',
        required_action: 'معالجة',
        responsible_party: 'المقاول',
        due_date: '2026-09-01',
        status: 'open',
      },
    ]);
    expect(JSON.stringify(observations)).not.toContain('storagePath');
    expect(JSON.stringify(observations)).not.toContain('dataUrl');
  });

  it('keeps legacy visit text while adding an empty structured-notes collection', () => {
    const data = parseProjectEngineeringData({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      field_visits: [
        {
          visit_number: 1,
          status: 'مسودة',
          findings: 'ملاحظة تاريخية حرة',
          recommendations: 'توصية تاريخية حرة',
        },
      ],
    });

    expect(data.field_visits[0].findings).toBe('ملاحظة تاريخية حرة');
    expect(data.field_visits[0].recommendations).toBe('توصية تاريخية حرة');
    expect(data.field_visits[0].observations).toEqual([]);
  });

  it('preserves valid structured notes within the canonical field visit payload', () => {
    const data = parseProjectEngineeringData({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      field_visits: [
        {
          visit_number: 1,
          status: 'مسودة',
          observations: [
            {
              id: 'obs-1',
              category: 'fire_alarm',
              location: 'مدخل الطابق الأول',
              description: 'كاشف دخان غير مثبت',
              severity: 'high',
              required_action: 'تثبيت الكاشف واختباره',
              responsible_party: 'المقاول',
              due_date: '2026-09-10',
              status: 'in_progress',
            },
          ],
        },
      ],
    });

    expect(data.field_visits[0].observations).toEqual([
      {
        id: 'obs-1',
        category: 'fire_alarm',
        location: 'مدخل الطابق الأول',
        description: 'كاشف دخان غير مثبت',
        severity: 'high',
        required_action: 'تثبيت الكاشف واختباره',
        responsible_party: 'المقاول',
        due_date: '2026-09-10',
        status: 'in_progress',
      },
    ]);
  });

  it('renders structured notes in the existing visit PDF with escaped text and omits the section when empty', () => {
    const withObservation = buildFieldVisitReportHtml({
      client,
      visit: {
        visit_number: 1,
        status: 'مسودة',
        findings: 'نتيجة عامة',
        observations: [
          {
            id: 'obs-1',
            category: 'fire_alarm',
            location: 'المدخل',
            description: '<script>unsafe</script>',
            severity: 'high',
            required_action: 'تصحيح التثبيت',
            responsible_party: 'المقاول',
            status: 'open',
          },
        ],
      },
    });
    const withoutObservation = buildFieldVisitReportHtml({
      client,
      visit: { visit_number: 2, status: 'مسودة', findings: 'نتيجة عامة' },
    });

    expect(withObservation).toContain('الملاحظات الميدانية المنظمة');
    expect(withObservation).toContain('نظام الإنذار');
    expect(withObservation).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(withObservation).not.toContain('<script>unsafe</script>');
    expect(withoutObservation).not.toContain('الملاحظات الميدانية المنظمة');
  });

  it('keeps Phase 5B inside the visit model and excludes file/media controls', () => {
    const component = read('components/projects/FieldVisitObservationsSection.tsx');
    const modal = read('components/projects/ProjectReportModal.tsx');

    expect(component).toContain('الملاحظات الميدانية المنظمة');
    expect(component).not.toMatch(/type=["']file["']/);
    expect(component).not.toContain('TechnicalEvidence');
    expect(component).not.toContain('storagePath');
    expect(modal).toContain('<FieldVisitObservationsSection');
  });
});
