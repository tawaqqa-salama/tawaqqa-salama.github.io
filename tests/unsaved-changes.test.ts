import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const modal = readFileSync(
  resolve(__dirname, '../components/clients/ClientDetailModal.tsx'),
  'utf8'
);

describe('client modal unsaved-changes regression guard', () => {
  it('does not mark initial hydration or normalization dirty', () => {
    expect(modal).toContain('persistedSnapshotRef.current = currentDraftSnapshot;');
    expect(modal).toContain('baselineSyncPendingRef.current = true;');
    expect(modal).toContain('setIsDirty(false);');
    expect(modal).toContain('mergeLocalClientOverrides(client)');
  });

  it('detects real edits using the persisted snapshot before closing', () => {
    expect(modal).toContain('const hasSnapshotChanges =');
    expect(modal).toContain('currentDraftSnapshot !== persistedSnapshotRef.current');
    expect(modal).toContain('if (isDirty || hasSnapshotChanges)');
    expect(modal).toContain('لديك تغييرات غير محفوظة. هل تريد الخروج بدون حفظ؟');
  });

  it('keeps the modal open or explicitly discards through the warning actions', () => {
    expect(modal).toContain('onClick={() => setUnsavedWarningOpen(false)}');
    expect(modal).toContain('onClick={onClose}');
    expect(modal).toContain('متابعة التعديل');
    expect(modal).toContain('خروج دون حفظ');
  });

  it('updates the baseline only after the awaited persistence and parent refresh', () => {
    const refreshIndex = modal.indexOf('await onUpdated();');
    const baselineIndex = modal.indexOf('baselineSyncPendingRef.current = true;', refreshIndex);
    const successIndex = modal.indexOf("setSuccessMessage('تم حفظ البيانات بنجاح');", refreshIndex);
    expect(refreshIndex).toBeGreaterThan(-1);
    expect(baselineIndex).toBeGreaterThan(refreshIndex);
    expect(successIndex).toBeGreaterThan(refreshIndex);
    expect(modal).toContain('} catch (error) {\n      setErrorMessage');
  });

  it('routes the supported modal close paths through the same guard', () => {
    expect(modal).toContain('onClick={requestClose}');
    expect(modal).toContain('requestClose();');
    expect(modal).toContain('onClose={handleInvoicePromptClose}');
  });
});
