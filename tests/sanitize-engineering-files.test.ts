import { describe, expect, it } from 'vitest';
import {
  MAX_PERSISTED_DATA_URL_CHARS,
  countCloudBackedDrawings,
  sanitizeEngineeringDataForPersist,
} from '@/lib/projects/sanitize-engineering-files';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { PlanAttachmentFile, ProjectEngineeringData } from '@/lib/types/project-reports';

function planFile(partial: Partial<PlanAttachmentFile> & Pick<PlanAttachmentFile, 'id'>): PlanAttachmentFile {
  return {
    fileName: 'plan.pdf',
    format: 'pdf',
    sizeBytes: 500_000,
    mimeType: 'application/pdf',
    dataUrl: null,
    uploadedAt: '2026-08-07T00:00:00.000Z',
    kind: 'engineering_drawing',
    storageBucket: 'project-files',
    storagePath: null,
    ...partial,
  };
}

describe('sanitizeEngineeringDataForPersist', () => {
  it('strips dataUrl when storagePath is present so JSONB stays lean', () => {
    const bulky = `data:application/pdf;base64,${'A'.repeat(50_000)}`;
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      plan_attachments: {
        engineering_drawings: [
          planFile({
            id: 'cloud-1',
            storagePath: 'client/engineering_drawing/cloud-1-plan.pdf',
            dataUrl: bulky,
          }),
        ],
        hydraulic_calculations: [],
      },
      design_center: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
        sheets: [
          {
            id: 'sheet-1',
            title: 'PDF',
            format: 'pdf',
            activeVersionId: 'v1',
            createdAt: '2026-08-07T00:00:00.000Z',
            versions: [
              {
                id: 'v1',
                version: 1,
                label: 'v1',
                uploadedAt: '2026-08-07T00:00:00.000Z',
                file: planFile({
                  id: 'v1-file',
                  storagePath: 'client/engineering_drawing/v1.pdf',
                  dataUrl: bulky,
                }),
              },
            ],
          },
        ],
      },
    };

    const next = sanitizeEngineeringDataForPersist(data);
    expect(next.plan_attachments.engineering_drawings[0].dataUrl).toBeNull();
    expect(next.plan_attachments.engineering_drawings[0].storagePath).toContain('cloud-1');
    expect(next.design_center.sheets[0].versions[0].file.dataUrl).toBeNull();
    expect(next.design_center.sheets[0].versions[0].file.storagePath).toBeTruthy();

    const counts = countCloudBackedDrawings(next);
    expect(counts.cloud).toBe(2);
    expect(counts.localOnly).toBe(0);
  });

  it('drops oversized local-only dataUrls that would break multi-device sync', () => {
    const huge = `data:application/pdf;base64,${'B'.repeat(MAX_PERSISTED_DATA_URL_CHARS + 10)}`;
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      plan_attachments: {
        engineering_drawings: [
          planFile({
            id: 'local-1',
            storagePath: null,
            dataUrl: huge,
          }),
        ],
        hydraulic_calculations: [],
      },
    };

    const next = sanitizeEngineeringDataForPersist(data);
    expect(next.plan_attachments.engineering_drawings[0].dataUrl).toBeNull();
    expect(next.plan_attachments.engineering_drawings[0].storagePath).toBeNull();
  });

  it('keeps small local dataUrls when Storage is unavailable', () => {
    const small = 'data:application/pdf;base64,AAAA';
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      plan_attachments: {
        engineering_drawings: [
          planFile({
            id: 'tiny',
            sizeBytes: 1200,
            storagePath: null,
            dataUrl: small,
          }),
        ],
        hydraulic_calculations: [],
      },
    };

    const next = sanitizeEngineeringDataForPersist(data);
    expect(next.plan_attachments.engineering_drawings[0].dataUrl).toBe(small);
  });
});
