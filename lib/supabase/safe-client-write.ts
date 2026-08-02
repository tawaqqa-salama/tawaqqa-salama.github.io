import { supabase } from '@/lib/supabase';

const LOCAL_CLIENT_OVERRIDES_KEY = 'tawaqqa_client_field_overrides_v1';
const LOCAL_ENGINEERING_BACKUP_KEY = 'tawaqqa_engineering_backup_v1';

/** حقول يُفضّل حفظها محلياً إن لم تكن في قاعدة البيانات بعد */
const LOCAL_FALLBACK_FIELDS = new Set([
  'quotation_services',
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

function loadOverrides(): Record<string, Record<string, unknown>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_CLIENT_OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Record<string, unknown>>) : {};
  } catch {
    return {};
  }
}

function saveOverrides(map: Record<string, Record<string, unknown>>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_CLIENT_OVERRIDES_KEY, JSON.stringify(map));
}

export function mergeLocalClientOverrides<T extends { id: string }>(client: T): T {
  const overrides = loadOverrides()[client.id];
  let merged: T = overrides ? { ...client, ...overrides } : client;

  // دمج نسخة احتياطية للتقارير الهندسية إن كان السجل بدونها
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_ENGINEERING_BACKUP_KEY);
      if (raw) {
        const map = JSON.parse(raw) as Record<string, unknown>;
        const backup = map[client.id];
        const current = (merged as { project_engineering_data?: unknown }).project_engineering_data;
        if (backup && (current == null || current === undefined)) {
          merged = { ...merged, project_engineering_data: backup } as T;
        }
      }
    }
  } catch {
    // تجاهل أخطاء التخزين المحلي
  }

  return merged;
}

/** يحفظ نسخة احتياطية محلية للتقارير الهندسية بعد كل حفظ ناجح */
export function backupEngineeringDataLocally(clientId: string, data: unknown) {
  if (typeof window === 'undefined' || !clientId || data == null) return;
  try {
    const raw = localStorage.getItem(LOCAL_ENGINEERING_BACKUP_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    map[clientId] = data;
    localStorage.setItem(LOCAL_ENGINEERING_BACKUP_KEY, JSON.stringify(map));
    saveLocalClientOverrides(clientId, {
      project_engineering_data: data,
      pipeline_stage: 'projects',
    });
  } catch {
    // قد يفشل إن تجاوز الحجم — لا نكسر الحفظ الرئيسي
  }
}

export function saveLocalClientOverrides(clientId: string, fields: Record<string, unknown>) {
  const map = loadOverrides();
  const next: Record<string, unknown> = { ...(map[clientId] || {}) };
  for (const [key, value] of Object.entries(fields)) {
    if (LOCAL_FALLBACK_FIELDS.has(key)) next[key] = value;
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

  const skippedColumns: string[] = [];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { error } = await supabase.from('clients').update(current).eq('id', clientId);
    if (!error) {
      // احفظ الحقول المتخطاة محلياً إن وُجدت في الطلب الأصلي
      const localPatch: Record<string, unknown> = {};
      for (const col of skippedColumns) {
        if (col in payload) localPatch[col] = payload[col];
      }
      // وأيضاً احفظ quotation_services دائماً محلياً كنسخة احتياطية
      if ('quotation_services' in payload) {
        localPatch.quotation_services = payload.quotation_services;
      }
      if (Object.keys(localPatch).length) saveLocalClientOverrides(clientId, localPatch);

      if (skippedColumns.length > 0) {
        return {
          error: null,
          skippedColumns,
          warning:
            skippedColumns.includes('quotation_services')
              ? 'تم الحفظ محلياً لخدمات العرض. نفّذ في Supabase: ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS quotation_services jsonb NOT NULL DEFAULT \'[]\'::jsonb;'
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
      if (data?.id && 'quotation_services' in payload) {
        saveLocalClientOverrides(String(data.id), {
          quotation_services: payload.quotation_services,
        });
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
