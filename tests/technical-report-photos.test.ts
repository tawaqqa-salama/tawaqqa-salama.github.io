import { describe, expect, it, vi, beforeEach } from 'vitest';

const uploadMock = vi.fn();
const createSignedUrlMock = vi.fn();
const getPublicUrlMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadMock(...args),
        createSignedUrl: (...args: unknown[]) => createSignedUrlMock(...args),
        getPublicUrl: (...args: unknown[]) => getPublicUrlMock(...args),
      }),
    },
  },
}));

import {
  hydrateTechnicalReportPhotosForDisplay,
  persistTechnicalReportPhotosToStorage,
} from '@/lib/projects/technical-report-photos';
import { EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';

describe('technical report photos storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ error: null });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed.jpg' },
      error: null,
    });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://example.com/public.jpg' } });
  });

  it('uploads inline dataUrl photos to Storage before live save', async () => {
    const report = await persistTechnicalReportPhotosToStorage('c1', {
      ...EMPTY_TECHNICAL_REPORT,
      earth_photo: {
        id: 'e1',
        caption: 'earth',
        dataUrl: 'data:image/png;base64,AAAA',
      },
      facade_photo: {
        id: 'f1',
        caption: 'facade',
        storagePath: 'c1/technical-report-photos/f1-facade.jpg',
        dataUrl: 'data:image/png;base64,BBBB',
      },
    });

    expect(uploadMock).toHaveBeenCalled();
    expect(report.earth_photo?.storagePath).toBeTruthy();
    expect(report.earth_photo?.dataUrl).toBeUndefined();
    // Already stored — keep path, drop inline
    expect(report.facade_photo?.storagePath).toContain('facade');
    expect(report.facade_photo?.dataUrl).toBeUndefined();
  });

  it('hydrates storage paths into displayable src for print/UI', async () => {
    const hydrated = await hydrateTechnicalReportPhotosForDisplay({
      ...EMPTY_TECHNICAL_REPORT,
      site_photo: {
        id: 's1',
        caption: 'site',
        storagePath: 'c1/technical-report-photos/s1.jpg',
        storageBucket: 'project-files',
      },
    });
    expect(hydrated.site_photo?.dataUrl).toBe('https://example.com/signed.jpg');
  });
});
