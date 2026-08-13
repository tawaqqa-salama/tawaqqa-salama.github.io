/**
 * Logical storage layout for Code Knowledge documents.
 *
 * Physical object key (tenant-isolated):
 *   {companyId}/code-knowledge/{code}/{edition}/{documentId}/{fileName}
 *
 * Logical prefix (bucket-relative view):
 *   code-knowledge/{code}/{edition}/{documentId}/{fileName}
 *
 * Never rely on file name alone — code + edition + documentId are required.
 */

export const CODE_KNOWLEDGE_STORAGE_BUCKET = "design-knowledge";

export const CODE_KNOWLEDGE_LOGICAL_PREFIX = "code-knowledge";

export function sanitizeStorageSegment(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function buildCodeKnowledgeLogicalPath(input: {
  code: string;
  edition: string;
  documentId: string;
  fileName: string;
}): string {
  const code = sanitizeStorageSegment(input.code);
  const edition = sanitizeStorageSegment(input.edition);
  const documentId = sanitizeStorageSegment(input.documentId);
  const fileName = sanitizeStorageSegment(input.fileName) || "document.pdf";
  if (!code || !edition || !documentId) {
    throw new Error("code, edition, and documentId are required for storage path");
  }
  return `${CODE_KNOWLEDGE_LOGICAL_PREFIX}/${code}/${edition}/${documentId}/${fileName}`;
}

export function buildCodeKnowledgeObjectPath(input: {
  companyId: string;
  code: string;
  edition: string;
  documentId: string;
  fileName: string;
}): string {
  const companyId = sanitizeStorageSegment(input.companyId);
  if (!companyId) {
    throw new Error("companyId is required for tenant-isolated storage path");
  }
  return `${companyId}/${buildCodeKnowledgeLogicalPath(input)}`;
}

export function parseCodeKnowledgeObjectPath(storagePath: string): {
  companyId: string;
  logicalPath: string;
  code: string;
  edition: string;
  documentId: string;
  fileName: string;
} | null {
  const parts = storagePath.split("/").filter(Boolean);
  if (parts.length < 6) return null;
  const [companyId, prefix, code, edition, documentId, ...rest] = parts;
  if (prefix !== CODE_KNOWLEDGE_LOGICAL_PREFIX) return null;
  const fileName = rest.join("/");
  if (!companyId || !code || !edition || !documentId || !fileName) return null;
  return {
    companyId,
    logicalPath: `${prefix}/${code}/${edition}/${documentId}/${fileName}`,
    code,
    edition,
    documentId,
    fileName,
  };
}
