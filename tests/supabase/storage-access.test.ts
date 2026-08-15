import { describe, expect, it } from 'vitest';
import {
  approvedBuildingPermitPath,
  safeStoragePath,
  storagePathMatchesMetadata,
} from '../../supabase/functions/_shared/storage-access';

const clientId = '11111111-1111-4111-8111-111111111111';
const otherClientId = '22222222-2222-4222-8222-222222222222';
const quotationPath = `${clientId}/quotation/building_permit/qdoc-12345-permit.pdf`;
const projectPath = `${clientId}/building_permit/att-12345-permit.pdf`;

describe('building permit Storage access contract', () => {
  it('rejects unauthenticated-shaped or arbitrary paths', () => {
    expect(safeStoragePath('../secret/key')).toBeNull();
    expect(approvedBuildingPermitPath(`general/quotation/building_permit/qdoc-1-x.pdf`)).toBeNull();
    expect(approvedBuildingPermitPath(`${otherClientId}/quotation/owner_id/qdoc-1-x.pdf`)).toBeNull();
    expect(approvedBuildingPermitPath(`${clientId}/arbitrary/qdoc-1-x.pdf`)).toBeNull();
  });

  it('accepts only current quotation/project building-permit patterns', () => {
    expect(approvedBuildingPermitPath(quotationPath)).toEqual({ clientId, mode: 'quotation' });
    expect(approvedBuildingPermitPath(projectPath)).toEqual({ clientId, mode: 'project' });
  });

  it('requires the exact metadata path and building_permit kind', () => {
    const metadata = {
      quotation_documents: {
        building_permit: { storagePath: quotationPath, kind: 'building_permit' },
      },
    };
    expect(storagePathMatchesMetadata(metadata, quotationPath)).toBe(true);
    expect(storagePathMatchesMetadata(metadata, `${otherClientId}/quotation/building_permit/qdoc-12345-permit.pdf`)).toBe(false);
    expect(storagePathMatchesMetadata({ quotation_documents: { building_permit: { storagePath: quotationPath, kind: 'owner_id' } } }, quotationPath)).toBe(false);
  });
});
