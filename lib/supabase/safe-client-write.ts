import { supabase } from '@/lib/supabase';
import { loadEngineeringLive, saveEngineeringLive } from '@/lib/projects/engineering-live-store';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { mergeProjectEngineeringData } from '@/lib/projects/merge-engineering-data';
import type { QuotationDocumentsState } from '@/lib/types/quotation-documents';

const LOCAL_CLIENT_OVERRIDES_KEY = 'tawaqqa_client_field_overrides_v1';
const LOCAL_ENGINEERING_BACKUP_KEY = 'tawaqqa_engineering_backup_v1';

type LocalOverrideMap = Record<string, Record<string, unknown>>;
let overridesCacheRaw: string | null | undefined;
let overridesCache: LocalOverrideMap = {};
let engineeringBackupCacheRaw: string | null | undefined;
let engineeringBackupCache: Record<string, unknown> = {};
let storageListenersInstalled = false;

function installStorageCacheInvalidation() {
  if (typeof window === 'undefined' || storageListenersInstalled) return;
  storageListenersInstalled = true;
  window.addEventListener('storage', (event) => {
    if (event.key === LOCAL_CLIENT_OVERRIDES_KEY) {
      overridesCacheRaw = undefined;
      overridesCache = {};
    }
    if (event.key === LOCAL_ENGINEERING_BACKUP_KEY) {
      engineeringBackupCacheRaw = undefined;
      engineeringBackupCache = {};
    }
  });
}

/** حقول يُفضّل حفظها محلياً إن لم تكن في قاعدة البيانات بعد */
const LOCAL_FALLBACK_FIELDS = new Set([
  'quotation_services',
  'quotation_documents',
  'floor_levels',
  'commercial_register',
  'tax_number',
  'client_kind',
  'project_engineering_data',
  'pipeline_stage',
  'financial_status',
  'engineering_status',
  'final_report_status',
]);

function extractMissingColumn(message: string): string | null {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column ["']([^"']+)["'] of relation/i,
    /column ([a-zA-Z_][a-zA-Z0-9_]*) does not exist/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function loadOverrides(): LocalOverrideMap {
  if (typeof window === 'undefined') return {};
  installStorageCacheInvalidation();
  if (overridesCacheRaw !== undefined) return overridesCache;
  const raw = localStorage.getItem(LOCAL_CLIENT_OVERRIDES_KEY);
  overridesCacheRaw = raw;
  try {
    overridesCache = raw ? (JSON.parse(raw) as LocalOverrideMap) : {};
  } catch {
    overridesCache = {};
  }
  return overridesCache;
}

function loadEngineeringBackup(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  installStorageCacheInvalidation();
  if (engineeringBackupCacheRaw !== undefined) return engineeringBackupCache;
  const raw = localStorage.getItem(LOCAL_ENGINEERING_BACKUP_KEY);
  engineeringBackupCacheRaw = raw;
  try {
    engineeringBackupCache = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    engineeringBackupCache = {};
  }
  return engineeringBackupCache;
}

export function sanitizeQuotationDocumentsForLocal(value: unknown): QuotationDocumentsState | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [kind, rawFile] of Object.entries(source)) {
    if (!rawFile || typeof rawFile !== 'object') {
      result[kind] = rawFile ?? null;
      continue;
    }
    const file = rawFile as Record<string, unknown>;
    const hasValidStorageReference =
      typeof file.storageBucket === 'string' && file.storageBucket.trim().length > 0 &&
      typeof file.storagePath === 'string' && file.storagePath.trim().length > 0;
    if (hasValidStorageReference) {
      const { dataUrl: _dataUrl, ...metadata } = file;
      result[kind] = metadata;
    } else {
      // Without both Storage fields, this may be the only durable attachment copy.
      result[kind] = { ...file };
    }
  }
  return result as QuotationDocumentsState;
}

function compactLocalOverrides(map: Record<string, Record<string, unknown>>) {
  return Object.fromEntries(
    Object.entries(map).map(([clientId, fields]) => {
      const next = { ...fields };
      if ('quotation_documents' in next) {
        next.quotation_documents = sanitizeQuotationDocumentsForLocal(next.quotation_documents);
      }
      // The canonical engineering live store is the source of truth; never duplicate its full payload locally.
      delete next.project_engineering_data;
      return [clientId, next];
    })
  );
}

function saveOverrides(map: Record<string, Record<string, unknown>>) {
  if (typeof window === 'undefined') return;
  const compact = compactLocalOverrides(map);
  try {
    const serialized = JSON.stringify(compact);
    localStorage.setItem(LOCAL_CLIENT_OVERRIDES_KEY, serialized);
    overridesCacheRaw = serialized;
    overridesCache = compact;
  } catch {
    // A legacy oversized map must not make a successful Supabase save appear to fail.
    try {
      const fallback = Object.fromEntries(Object.entries(compact).slice(-100));
      const serialized = JSON.stringify(fallback);
      localStorage.setItem(LOCAL_CLIENT_OVERRIDES_KEY, serialized);
      overridesCacheRaw = serialized;
      overridesCache = fallback;
    } catch {
      // Local fallback is optional; the remote write remains authoritative.
    }
  }
}

export function mergeLocalClientOverrides<T extends { id: string }>(client: T): T {
  const overrides = loadOverrides()[client.id];
  let merged: T = overrides ? { ...client, ...overrides } : client;

  // دمج نسخة احتياطية للتقارير الهندسية إن كان السجل بدونها، مع parse واحد لكل raw value.
  const backup = loadEngineeringBackup()[client.id];
  const current = (merged as { project_engineering_data?: unknown }).project_engineering_data;
  if (backup && (current == null || current === undefined)) {
    merged = { ...merged, project_engineering_data: backup } as T;
  }

  return merged;
}

/** النسخة المحلية القديمة لا تتكرر؛ التخزين القانوني للتقارير الهندسية هو live store. */
export function backupEngineeringDataLocally(clientId: string, data: unknown) {
  if (typeof window === 'undefined' || !clientId || data == null) return;
  try {
    localStorage.removeItem(LOCAL_ENGINEERING_BACKUP_KEY);
  } catch {
    // تجاهل تنظيف النسخة القديمة، ولا نكسر الحفظ الرئيسي.
  }
  saveLocalClientOverrides(clientId, {
    pipeline_stage: 'projects',
  });
}

export function saveLocalClientOverrides(clientId: string, fields: Record<string, unknown>) {
  const map = loadOverrides();
  const next: Record<string, unknown> = { ...(map[clientId] || {}) };
  for (const [key, value] of Object.entries(fields)) {
    if (!LOCAL_FALLBACK_FIELDS.has(key)) continue;
    if (key === 'quotation_documents') {
      next[key] = sanitizeQuotationDocumentsForLocal(value);
    } else if (key === 'project_engineering_data') {
      continue;
    } else {
      next[key] = value;
    }
  }
  map[clientId] = next;
  saveOverrides(map);
}

/**
 * تحديث عميل مع حذف الأعمدة غير الموجودة في schema تلقائياً
 * (مثل quotation_services قبل تنفيذ SQL).
 */
export async function updateClientSafe(
  clientId: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null; skippedColumns: string[]; warning?: string | null }> {
  const current: Record<string, unknown> = { ...payload };
  // لا نرسل كائن العميل كاملاً إن وُجدت مفاتيح غير صالحة
  delete current.id;
  delete current.created_at;

  // Never UPDATE fat project_engineering_data on clients — use the live store.
  // A Basic Data projection can submit a small patch; hydrate the canonical source
  // only at save time and deep-merge the patch so unseen reports/designs survive.
  let engineeringLiveError: string | null = null;
  const rawEngineeringPatch = current.project_engineering_patch;
  delete current.project_engineering_patch;
  const rawFullEngineering = current.project_engineering_data;
  delete current.project_engineering_data;

  let engineeringToPersist: ProjectEngineeringData | null = null;
  if (rawEngineeringPatch && typeof rawEngineeringPatch === 'object') {
    const existingLive = await loadEngineeringLive(clientId);
    engineeringToPersist = mergeProjectEngineeringData(existingLive, rawEngineeringPatch as Record<string, unknown>);
  } else if (rawFullEngineering && typeof rawFullEngineering === 'object') {
    engineeringToPersist = parseProjectEngineeringData(rawFullEngineering as ProjectEngineeringData);
  }

  if (engineeringToPersist) {
    const live = await saveEngineeringLive({
      clientId,
      data: sanitizeEngineeringDataForPersist(engineeringToPersist, {
        aggressive: true,
      }),
      pipelineStage:
        typeof current.pipeline_stage === 'string' ? current.pipeline_stage : null,
    });
    if (live.error) engineeringLiveError = live.error;
  }

  const skippedColumns: string[] = [];

  // If only engineering was being saved, live write is enough
  if (Object.keys(current).length === 0) {
    if (engineeringLiveError) {
      return { error: engineeringLiveError, skippedColumns: ['project_engineering_data'] };
    }
    return { error: null, skippedColumns: ['project_engineering_data'] };
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { error } = await supabase.from('clients').update(current).eq('id', clientId);
    if (!error) {
      // احفظ الحقول المتخطاة محلياً إن وُجدت في الطلب الأصلي
      const localPatch: Record<string, unknown> = {};
      for (const col of skippedColumns) {
        if (col in payload) localPatch[col] = payload[col];
      }
      // وأيضاً احفظ quotation_services / quotation_documents محلياً كنسخة احتياطية
      if ('quotation_services' in payload) {
        localPatch.quotation_services = payload.quotation_services;
      }
      if ('quotation_documents' in payload) {
        localPatch.quotation_documents = payload.quotation_documents;
      }
      if ('project_engineering_data' in payload) {
        localPatch.project_engineering_data = payload.project_engineering_data;
      }
      if (Object.keys(localPatch).length) saveLocalClientOverrides(clientId, localPatch);

      if (engineeringLiveError) {
        return {
          error: engineeringLiveError,
          skippedColumns: [...skippedColumns, 'project_engineering_data'],
          warning: 'حُفظت بقية الحقول؛ تعذر مزامنة الملف الهندسي الحي.',
        };
      }

      if (skippedColumns.length > 0) {
        return {
          error: null,
          skippedColumns,
          warning:
            skippedColumns.includes('quotation_services') || skippedColumns.includes('quotation_documents')
              ? 'تم الحفظ محلياً لمستندات/خدمات العرض. نفّذ سكربتات 016 و030 في Supabase إن لزم.'
              : `تم الحفظ. حقول غير موجودة في قاعدة البيانات: ${skippedColumns.join(', ')}. نفّذ سكربت 016_quotation_services_pricing.sql`,
        };
      }
      return { error: null, skippedColumns };
    }

    const missing = extractMissingColumn(error.message);
    if (!missing || !(missing in current)) {
      return { error: error.message, skippedColumns };
    }
    delete current[missing];
    skippedColumns.push(missing);
  }

  return { error: 'تعذر حفظ بيانات العميل', skippedColumns };
}

export async function insertClientSafe(
  payload: Record<string, unknown>
): Promise<{ data: Record<string, unknown> | null; error: string | null; skippedColumns: string[] }> {
  const current: Record<string, unknown> = { ...payload };
  const skippedColumns: string[] = [];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase.from('clients').insert([current]).select('*').single();
    if (!error) {
      if (data?.id && ('quotation_services' in payload || 'quotation_documents' in payload)) {
        const patch: Record<string, unknown> = {};
        if ('quotation_services' in payload) patch.quotation_services = payload.quotation_services;
        if ('quotation_documents' in payload) patch.quotation_documents = payload.quotation_documents;
        saveLocalClientOverrides(String(data.id), patch);
      }
      return { data: (data as Record<string, unknown>) || null, error: null, skippedColumns };
    }
    const missing = extractMissingColumn(error.message);
    if (!missing || !(missing in current)) {
      return { data: null, error: error.message, skippedColumns };
    }
    delete current[missing];
    skippedColumns.push(missing);
  }

  return { data: null, error: 'تعذر إضافة العميل', skippedColumns };
}
