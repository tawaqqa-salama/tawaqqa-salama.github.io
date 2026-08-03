import { supabase, isDemoMode } from '@/lib/supabase';
import { isFinancialApproved } from '@/lib/business/workflow-stages';
import type { ClientRecord } from '@/lib/types/client';
import type {
  CommissionEntry,
  CommissionEntryStatus,
  CommissionType,
  OwnerAccount,
  ReferralCategory,
  ReferralClassification,
  ReferralRecord,
  ReferralStats,
  ReferralStatus,
} from '@/lib/types/referrals';

const LOCAL_KEY = 'tawaqqa_referrals_v1';

type LocalStore = {
  referrals: ReferralRecord[];
  owners: OwnerAccount[];
  commissions: CommissionEntry[];
};

function round2(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePhone(phone: string): string {
  return String(phone || '').replace(/\s+/g, '').trim();
}

function seedStore(): LocalStore {
  const now = new Date().toISOString();
  return {
    referrals: [
      {
        id: 'seed-ref-1',
        name: 'م. خالد العتيبي',
        phone: '0551112233',
        category: 'مهندس',
        classification: 'خارجي',
        commission_type: 'percent',
        commission_value: 5,
        notes: 'إحالات هندسية',
        status: 'active',
        created_at: now,
      },
      {
        id: 'seed-ref-2',
        name: 'مؤسسة الأمان للمقاولات',
        phone: '0552223344',
        category: 'شركة مقاولات',
        classification: 'خارجي',
        commission_type: 'fixed',
        commission_value: 1500,
        notes: null,
        status: 'active',
        created_at: now,
      },
      {
        id: 'seed-ref-3',
        name: 'سارة المسوق',
        phone: '0553334455',
        category: 'مسوق',
        classification: 'داخلي',
        commission_type: 'percent',
        commission_value: 3,
        notes: 'فريق التسويق الداخلي',
        status: 'active',
        created_at: now,
      },
    ],
    owners: [],
    commissions: [],
  };
}

function loadLocal(): LocalStore {
  if (typeof window === 'undefined') return seedStore();
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) {
      const seeded = seedStore();
      localStorage.setItem(LOCAL_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return { ...seedStore(), ...JSON.parse(raw) } as LocalStore;
  } catch {
    return seedStore();
  }
}

function saveLocal(store: LocalStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

export function calculateCommissionAmount(
  basisAmount: number,
  type: CommissionType,
  value: number
): number {
  if (type === 'fixed') return round2(Math.max(0, value));
  return round2(Math.max(0, basisAmount) * (Math.max(0, value) / 100));
}

export async function listReferrals(): Promise<ReferralRecord[]> {
  if (!isDemoMode) {
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) return data as ReferralRecord[];
  }
  return loadLocal().referrals.sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
}

export async function findReferralByPhone(phone: string): Promise<ReferralRecord | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  if (!isDemoMode) {
    const { data } = await supabase.from('referrals').select('*').eq('phone', normalized).maybeSingle();
    if (data) return data as ReferralRecord;
  }
  return loadLocal().referrals.find((r) => normalizePhone(r.phone) === normalized) || null;
}

export async function searchReferrals(query: string): Promise<ReferralRecord[]> {
  const q = query.trim().toLowerCase();
  const all = await listReferrals();
  if (!q) return all.filter((r) => r.status === 'active');
  return all.filter((r) => {
    const phone = normalizePhone(r.phone);
    return (
      r.name.toLowerCase().includes(q) ||
      phone.includes(normalizePhone(q)) ||
      r.category.includes(query.trim())
    );
  });
}

export async function upsertReferral(
  input: Partial<ReferralRecord> & {
    name: string;
    phone: string;
    category?: ReferralCategory;
    classification?: ReferralClassification;
    commission_type?: CommissionType;
    commission_value?: number;
  }
): Promise<{ referral: ReferralRecord; error?: string }> {
  const phone = normalizePhone(input.phone);
  if (!input.name.trim()) return { referral: null as unknown as ReferralRecord, error: 'الاسم مطلوب' };
  if (!phone) return { referral: null as unknown as ReferralRecord, error: 'رقم الجوال مطلوب' };

  const payload = {
    name: input.name.trim(),
    phone,
    category: (input.category || 'مسوق') as ReferralCategory,
    classification: (input.classification || 'خارجي') as ReferralClassification,
    commission_type: (input.commission_type || 'percent') as CommissionType,
    commission_value: round2(Number(input.commission_value || 0)),
    notes: input.notes ?? null,
    status: (input.status || 'active') as ReferralStatus,
    updated_at: new Date().toISOString(),
  };

  if (!isDemoMode) {
    if (input.id) {
      const { data, error } = await supabase
        .from('referrals')
        .update(payload)
        .eq('id', input.id)
        .select('*')
        .single();
      if (!error && data) return { referral: data as ReferralRecord };
      if (error) {
        // fall through to local
      }
    } else {
      const { data, error } = await supabase.from('referrals').insert(payload).select('*').single();
      if (!error && data) return { referral: data as ReferralRecord };
    }
  }

  const store = loadLocal();
  if (input.id) {
    const idx = store.referrals.findIndex((r) => r.id === input.id);
    if (idx >= 0) {
      store.referrals[idx] = { ...store.referrals[idx], ...payload, id: input.id };
      saveLocal(store);
      return { referral: store.referrals[idx] };
    }
  }
  const existing = store.referrals.find((r) => normalizePhone(r.phone) === phone);
  if (existing && !input.id) {
    const updated = { ...existing, ...payload, id: existing.id };
    store.referrals = store.referrals.map((r) => (r.id === existing.id ? updated : r));
    saveLocal(store);
    return { referral: updated };
  }
  const created: ReferralRecord = {
    id: uid('ref'),
    created_at: new Date().toISOString(),
    ...payload,
  };
  store.referrals = [created, ...store.referrals];
  saveLocal(store);
  return { referral: created };
}

export async function listOwnerAccounts(): Promise<OwnerAccount[]> {
  if (!isDemoMode) {
    const { data, error } = await supabase
      .from('owner_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) return data as OwnerAccount[];
  }
  return loadLocal().owners;
}

export async function searchOwnerAccounts(query: string): Promise<OwnerAccount[]> {
  const q = query.trim().toLowerCase();
  const all = await listOwnerAccounts();
  if (!q) return all;
  return all.filter(
    (o) =>
      o.name.toLowerCase().includes(q) ||
      normalizePhone(o.phone || '').includes(normalizePhone(q)) ||
      (o.email || '').toLowerCase().includes(q)
  );
}

export async function upsertOwnerAccount(
  input: Partial<OwnerAccount> & { name: string }
): Promise<{ owner: OwnerAccount; error?: string }> {
  if (!input.name.trim()) return { owner: null as unknown as OwnerAccount, error: 'اسم المالك مطلوب' };
  const payload = {
    name: input.name.trim(),
    phone: input.phone ? normalizePhone(input.phone) : null,
    email: input.email || null,
    national_id: input.national_id || null,
    commercial_register: input.commercial_register || null,
    tax_number: input.tax_number || null,
    client_kind: input.client_kind || 'consumer',
    city: input.city || null,
    notes: input.notes || null,
    updated_at: new Date().toISOString(),
  };

  if (!isDemoMode) {
    if (input.id) {
      const { data, error } = await supabase
        .from('owner_accounts')
        .update(payload)
        .eq('id', input.id)
        .select('*')
        .single();
      if (!error && data) return { owner: data as OwnerAccount };
    } else {
      const { data, error } = await supabase.from('owner_accounts').insert(payload).select('*').single();
      if (!error && data) return { owner: data as OwnerAccount };
    }
  }

  const store = loadLocal();
  if (input.id) {
    const idx = store.owners.findIndex((o) => o.id === input.id);
    if (idx >= 0) {
      store.owners[idx] = { ...store.owners[idx], ...payload, id: input.id };
      saveLocal(store);
      return { owner: store.owners[idx] };
    }
  }
  const created: OwnerAccount = {
    id: uid('own'),
    created_at: new Date().toISOString(),
    ...payload,
  };
  store.owners = [created, ...store.owners];
  saveLocal(store);
  return { owner: created };
}

export async function listCommissionEntries(): Promise<CommissionEntry[]> {
  if (!isDemoMode) {
    const { data, error } = await supabase
      .from('commission_entries')
      .select('*')
      .order('accrued_at', { ascending: false });
    if (!error && data) return data as CommissionEntry[];
  }
  return loadLocal().commissions.sort((a, b) =>
    String(b.accrued_at || '').localeCompare(String(a.accrued_at || ''))
  );
}

export async function upsertCommissionEntry(
  input: Partial<CommissionEntry> & {
    referral_id: string;
    basis_amount: number;
    commission_type: CommissionType;
    commission_rate: number;
  }
): Promise<{ entry: CommissionEntry; error?: string }> {
  const earned = calculateCommissionAmount(
    input.basis_amount,
    input.commission_type,
    input.commission_rate
  );
  const paid = round2(Number(input.paid_amount || 0));
  let status: CommissionEntryStatus = input.status || 'accrued';
  if (status !== 'cancelled') {
    if (paid <= 0) status = 'accrued';
    else if (paid + 0.001 >= earned) status = 'paid';
    else status = 'partially_paid';
  }

  const payload = {
    referral_id: input.referral_id,
    client_id: input.client_id || null,
    project_label: input.project_label || null,
    basis_amount: round2(input.basis_amount),
    commission_type: input.commission_type,
    commission_rate: round2(input.commission_rate),
    earned_amount: earned,
    paid_amount: paid,
    status,
    notes: input.notes || null,
    paid_at: status === 'paid' ? input.paid_at || new Date().toISOString() : input.paid_at || null,
    updated_at: new Date().toISOString(),
  };

  if (!isDemoMode) {
    if (input.id) {
      const { data, error } = await supabase
        .from('commission_entries')
        .update(payload)
        .eq('id', input.id)
        .select('*')
        .single();
      if (!error && data) return { entry: data as CommissionEntry };
    } else {
      const { data, error } = await supabase
        .from('commission_entries')
        .insert({ ...payload, accrued_at: new Date().toISOString() })
        .select('*')
        .single();
      if (!error && data) return { entry: data as CommissionEntry };
    }
  }

  const store = loadLocal();
  if (input.id) {
    const idx = store.commissions.findIndex((c) => c.id === input.id);
    if (idx >= 0) {
      store.commissions[idx] = { ...store.commissions[idx], ...payload, id: input.id };
      saveLocal(store);
      return { entry: store.commissions[idx] };
    }
  }
  const created: CommissionEntry = {
    id: uid('com'),
    accrued_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...payload,
  };
  store.commissions = [created, ...store.commissions];
  saveLocal(store);
  return { entry: created };
}

/** يستحق عمولة عند اعتماد مالي لمشروع مربوط بمحيل */
export async function accrueCommissionForClient(
  client: ClientRecord,
  referral?: ReferralRecord | null
): Promise<CommissionEntry | null> {
  const referrerId = client.referrer_id;
  if (!referrerId) return null;
  if (!isFinancialApproved(client.financial_status || '')) return null;

  const ref = referral || (await listReferrals()).find((r) => r.id === referrerId);
  if (!ref) return null;

  const existing = (await listCommissionEntries()).find(
    (c) => c.client_id === client.id && c.referral_id === referrerId && c.status !== 'cancelled'
  );
  if (existing) return existing;

  const basis = Number(client.total_amount || client.quotation_amount || 0);
  const { entry } = await upsertCommissionEntry({
    referral_id: referrerId,
    client_id: client.id,
    project_label: client.project_name || client.business_name || client.name,
    basis_amount: basis,
    commission_type: ref.commission_type,
    commission_rate: ref.commission_value,
    paid_amount: 0,
    notes: `استحقاق تلقائي — ${client.client_code}`,
  });
  return entry;
}

export async function buildReferralStats(clients: ClientRecord[]): Promise<ReferralStats[]> {
  const [referrals, commissions] = await Promise.all([listReferrals(), listCommissionEntries()]);
  return referrals.map((referral) => {
    const projects_count = clients.filter((c) => c.referrer_id === referral.id).length;
    const rows = commissions.filter((c) => c.referral_id === referral.id && c.status !== 'cancelled');
    const earned_total = round2(rows.reduce((s, r) => s + Number(r.earned_amount || 0), 0));
    const paid_total = round2(rows.reduce((s, r) => s + Number(r.paid_amount || 0), 0));
    return {
      referral,
      projects_count,
      earned_total,
      paid_total,
      balance: round2(earned_total - paid_total),
    };
  });
}

export async function markCommissionPaid(
  entryId: string,
  amount?: number
): Promise<{ entry?: CommissionEntry; error?: string }> {
  const all = await listCommissionEntries();
  const current = all.find((c) => c.id === entryId);
  if (!current) return { error: 'السجل غير موجود' };
  const pay = amount == null ? current.earned_amount : round2(amount);
  return upsertCommissionEntry({
    ...current,
    paid_amount: pay,
    paid_at: new Date().toISOString(),
  });
}
