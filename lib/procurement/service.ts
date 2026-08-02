import { supabase, isDemoMode } from '@/lib/supabase';
import { VAT_RATE } from '@/lib/constants/clients';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import type {
  ProcurementLineItem,
  ProcurementRfq,
  ProcurementVendor,
  PurchaseOrder,
  PurchaseOrderStatus,
  RfqStatus,
  VendorStatus,
  VendorType,
} from '@/lib/types/procurement';

const LOCAL_KEY = 'tawaqqa_procurement_v1';

type LocalStore = {
  vendors: ProcurementVendor[];
  orders: PurchaseOrder[];
  rfqs: ProcurementRfq[];
};

function round2(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function seedStore(): LocalStore {
  const now = new Date().toISOString();
  return {
    vendors: [
      {
        id: 'seed-v-1',
        name: 'شركة أنظمة الإطفاء المتقدمة',
        vendor_type: 'supplier',
        specialty: 'مرشات NFPA 13 / حنفيات / مضخات حريق',
        commercial_register: '',
        tax_number: '',
        phone: '0110000001',
        email: null,
        city: 'الرياض',
        address: null,
        certification_notes: 'مورد معتمد لأنظمة الإطفاء وفق اشتراطات الدفاع المدني',
        status: 'active',
        notes: null,
        created_at: now,
      },
      {
        id: 'seed-v-2',
        name: 'مؤسسة إنذار السلامة',
        vendor_type: 'supplier',
        specialty: 'أنظمة إنذار وكشف NFPA 72',
        commercial_register: '',
        tax_number: '',
        phone: '0110000002',
        email: null,
        city: 'جدة',
        address: null,
        certification_notes: 'أجهزة إنذار معتمدة',
        status: 'active',
        notes: null,
        created_at: now,
      },
      {
        id: 'seed-v-3',
        name: 'مكتب الاختبارات الميدانية',
        vendor_type: 'subcontractor',
        specialty: 'اختبارات طرف ثالث — تدفق/ضغط/إنذار',
        commercial_register: '',
        tax_number: '',
        phone: '0110000003',
        email: null,
        city: 'الدمام',
        address: null,
        certification_notes: 'خدمات اختبار واعتماد ميداني',
        status: 'active',
        notes: null,
        created_at: now,
      },
    ],
    orders: [],
    rfqs: [],
  };
}

function lineTotals(items: ProcurementLineItem[]) {
  const subtotal = round2(items.reduce((s, i) => s + Number(i.total || 0), 0));
  const vat_amount = round2(subtotal * VAT_RATE);
  return { subtotal, vat_amount, total_amount: round2(subtotal + vat_amount) };
}

export async function listVendors(type?: VendorType | 'all'): Promise<ProcurementVendor[]> {
  if (!isDemoMode) {
    let q = supabase
      .from('procurement_vendors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);
    if (type && type !== 'all') q = q.eq('vendor_type', type);
    const { data, error } = await q;
    if (!error && data) return data as ProcurementVendor[];
  }
  const store = loadLocal();
  return type && type !== 'all'
    ? store.vendors.filter((v) => v.vendor_type === type)
    : store.vendors;
}

export async function upsertVendor(
  input: Partial<ProcurementVendor> & { name: string; vendor_type: VendorType }
): Promise<{ vendor: ProcurementVendor | null; error: string | null }> {
  const row: ProcurementVendor = {
    id: input.id || uid('vendor'),
    name: input.name.trim(),
    vendor_type: input.vendor_type,
    specialty: input.specialty || null,
    commercial_register: input.commercial_register || null,
    tax_number: input.tax_number || null,
    phone: input.phone || null,
    email: input.email || null,
    city: input.city || null,
    address: input.address || null,
    certification_notes: input.certification_notes || null,
    status: (input.status as VendorStatus) || 'active',
    notes: input.notes || null,
    updated_at: new Date().toISOString(),
    created_at: input.created_at || new Date().toISOString(),
  };

  if (!isDemoMode) {
    const { data, error } = await supabase
      .from('procurement_vendors')
      .upsert(row)
      .select('*')
      .maybeSingle();
    if (!error && data) return { vendor: data as ProcurementVendor, error: null };
  }

  const store = loadLocal();
  const idx = store.vendors.findIndex((v) => v.id === row.id);
  if (idx >= 0) store.vendors[idx] = row;
  else store.vendors.unshift(row);
  saveLocal(store);
  return { vendor: row, error: null };
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  if (!isDemoMode) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);
    if (!error && data) {
      return (data as PurchaseOrder[]).map((o) => ({
        ...o,
        line_items: Array.isArray(o.line_items) ? o.line_items : [],
      }));
    }
  }
  return loadLocal().orders;
}

export async function upsertPurchaseOrder(
  input: Partial<PurchaseOrder> & { title: string }
): Promise<{ order: PurchaseOrder | null; error: string | null }> {
  const items = (input.line_items || []).map((item) => ({
    ...item,
    id: item.id || uid('li'),
    total: round2(Number(item.quantity || 0) * Number(item.unit_price || 0)),
  }));
  const money = lineTotals(items);
  const row: PurchaseOrder = {
    id: input.id || uid('po'),
    po_number: input.po_number || `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    vendor_id: input.vendor_id || null,
    client_id: input.client_id || null,
    title: input.title.trim(),
    category: input.category || 'equipment',
    status: (input.status as PurchaseOrderStatus) || 'draft',
    ...money,
    line_items: items,
    notes: input.notes || null,
    requested_at: input.requested_at || new Date().toISOString().slice(0, 10),
    needed_by: input.needed_by || null,
    created_at: input.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!isDemoMode) {
    const { data, error } = await supabase.from('purchase_orders').upsert(row).select('*').maybeSingle();
    if (!error && data) return { order: data as PurchaseOrder, error: null };
  }

  const store = loadLocal();
  const idx = store.orders.findIndex((o) => o.id === row.id);
  if (idx >= 0) store.orders[idx] = row;
  else store.orders.unshift(row);
  saveLocal(store);
  return { order: row, error: null };
}

export async function listRfqs(): Promise<ProcurementRfq[]> {
  if (!isDemoMode) {
    const { data, error } = await supabase
      .from('procurement_rfqs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);
    if (!error && data) {
      return (data as ProcurementRfq[]).map((r) => ({
        ...r,
        line_items: Array.isArray(r.line_items) ? r.line_items : [],
      }));
    }
  }
  return loadLocal().rfqs;
}

export async function upsertRfq(
  input: Partial<ProcurementRfq> & { title: string }
): Promise<{ rfq: ProcurementRfq | null; error: string | null }> {
  const items = (input.line_items || []).map((item) => ({
    ...item,
    id: item.id || uid('li'),
    total: round2(Number(item.quantity || 0) * Number(item.unit_price || 0)),
  }));
  const row: ProcurementRfq = {
    id: input.id || uid('rfq'),
    rfq_number: input.rfq_number || `RFQ-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    client_id: input.client_id || null,
    vendor_id: input.vendor_id || null,
    source_boq: Boolean(input.source_boq),
    title: input.title.trim(),
    status: (input.status as RfqStatus) || 'draft',
    line_items: items,
    notes: input.notes || null,
    created_at: input.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!isDemoMode) {
    const { data, error } = await supabase.from('procurement_rfqs').upsert(row).select('*').maybeSingle();
    if (!error && data) return { rfq: data as ProcurementRfq, error: null };
  }

  const store = loadLocal();
  const idx = store.rfqs.findIndex((r) => r.id === row.id);
  if (idx >= 0) store.rfqs[idx] = row;
  else store.rfqs.unshift(row);
  saveLocal(store);
  return { rfq: row, error: null };
}

/** تحويل بنود BOQ من مشروع إلى طلب تسعير RFQ */
export async function createRfqFromProjectBoq(
  client: ClientRecord,
  vendorId?: string | null
): Promise<{ rfq: ProcurementRfq | null; error: string | null }> {
  const eng = parseProjectEngineeringData(client.project_engineering_data);
  const items = (eng.boq.items || []).map((item) => ({
    id: uid('li'),
    description: item.item,
    unit: item.unit || 'وحدة',
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    total: round2(Number(item.quantity || 0) * Number(item.unit_price || 0)),
  }));

  if (items.length === 0) {
    return { rfq: null, error: 'لا توجد بنود في جدول الكميات (BOQ) لهذا المشروع.' };
  }

  return upsertRfq({
    title: `RFQ من BOQ — ${client.business_name || client.name}`,
    client_id: client.id,
    vendor_id: vendorId || null,
    source_boq: true,
    status: 'draft',
    line_items: items,
    notes: `مُولَّد تلقائياً من BOQ المشروع ${client.client_code}`,
  });
}
