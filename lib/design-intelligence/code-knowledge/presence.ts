/**
 * Presence of indexed Code Knowledge documents — derived from tenant-scoped
 * persisted document metadata (storage_path + index/chunks), never from a
 * public Storage probe or stale upload File picker state.
 */

import type { CodeKnowledgeDocumentMeta } from '@/lib/design-intelligence/code-knowledge/types';
import { isSuperAdminRole, isTenantAdminRole } from '@/lib/tenant/rbac';

export function canReingestKnowledgeRole(roleCode: string | null | undefined): boolean {
  return isTenantAdminRole(roleCode) || isSuperAdminRole(roleCode);
}

/** True when a document row proves Storage-backed presence for this tenant list. */
export function isKnowledgeDocumentPresentInStorage(
  doc: Pick<
    CodeKnowledgeDocumentMeta,
    'deleted_at' | 'storage_path' | 'index_status' | 'chunk_count' | 'persisted'
  >
): boolean {
  if (doc.deleted_at) return false;
  if (!doc.storage_path) return false;
  // Persisted Supabase rows set persisted=true when indexed+chunks; also accept
  // indexed+storage_path even if chunk_count temporarily stale in UI cache.
  if (doc.persisted === true) return true;
  if (doc.index_status === 'indexed' && (doc.chunk_count || 0) > 0) return true;
  if (doc.index_status === 'indexed' && Boolean(doc.storage_path)) return true;
  return false;
}

export function findExistingNfpa13Document(
  docs: CodeKnowledgeDocumentMeta[],
  opts?: { edition?: string }
): CodeKnowledgeDocumentMeta | null {
  const edition = opts?.edition || '2025';
  const match = docs.find((d) => {
    if (d.deleted_at) return false;
    const code = String(d.code || '').toUpperCase().replace(/\s+/g, '-');
    if (code !== 'NFPA-13') return false;
    if (String(d.edition || '') !== edition) return false;
    return isKnowledgeDocumentPresentInStorage(d);
  });
  return match || null;
}

/** Message when upload is clicked without a File — must not claim Storage absence if doc exists. */
export function uploadMissingFileMessage(existingNfpa13: CodeKnowledgeDocumentMeta | null): string {
  if (existingNfpa13) {
    return (
      `NFPA 13-2025 is already present in Storage (document_id=${existingNfpa13.id}). ` +
      `Use إعادة الفهرسة to re-ingest the existing file — do not upload a new PDF.`
    );
  }
  return (
    'Select a PDF file to upload, or wait for tenant documents to load. ' +
    'If NFPA 13-2025 already exists in the Documents list, use إعادة الفهرسة instead of uploading again.'
  );
}
