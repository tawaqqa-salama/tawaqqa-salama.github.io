export type ApprovedPermitPath = { clientId: string; mode: 'quotation' | 'project' };

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function safeStoragePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim().replace(/^\/+/, '');
  if (!path || path.length > 500 || path.includes('..') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) return null;
  return path;
}

export function approvedBuildingPermitPath(path: string): ApprovedPermitPath | null {
  const parts = path.split('/');
  const clientId = parts[0] || '';
  if (!isUuid(clientId)) return null;
  const file = parts[parts.length - 1] || '';
  if (!/^(?:qdoc|att)-[A-Za-z0-9-]+-[A-Za-z0-9_-]+\.(?:pdf|png|jpe?g|webp)$/i.test(file)) return null;
  if (parts.length === 4 && parts[1] === 'quotation' && parts[2] === 'building_permit') return { clientId, mode: 'quotation' };
  if (parts.length === 3 && parts[1] === 'building_permit') return { clientId, mode: 'project' };
  return null;
}

export function storagePathMatchesMetadata(client: Record<string, unknown>, path: string): boolean {
  const quotation = client.quotation_documents;
  if (quotation && typeof quotation === 'object') {
    const document = (quotation as Record<string, unknown>).building_permit;
    if (document && typeof document === 'object') {
      const meta = document as Record<string, unknown>;
      if (meta.storagePath === path && meta.kind === 'building_permit') return true;
    }
  }
  const engineering = client.project_engineering_data;
  if (engineering && typeof engineering === 'object') {
    const plan = (engineering as Record<string, unknown>).building_plan;
    if (plan && typeof plan === 'object') {
      const document = (plan as Record<string, unknown>).building_permit_file;
      if (document && typeof document === 'object') {
        const meta = document as Record<string, unknown>;
        if (meta.storagePath === path && meta.kind === 'building_permit') return true;
      }
    }
  }
  return false;
}
