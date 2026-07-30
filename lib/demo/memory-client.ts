import { createDemoSeed } from '@/lib/demo/seed';

type Row = Record<string, unknown>;
type Filter =
  | { type: 'eq'; column: string; value: unknown }
  | { type: 'in'; column: string; values: unknown[] }
  | { type: 'ilike'; column: string; pattern: string };

type QueryResult<T> = { data: T; error: null; count: number | null };

function cloneRow<T extends Row>(row: T): T {
  return structuredClone(row);
}

function matchesIlike(value: unknown, pattern: string): boolean {
  const text = String(value ?? '').toLowerCase();
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`).test(text);
}

function projectColumns(row: Row, columns: string): Row {
  if (!columns || columns === '*') return cloneRow(row);
  const keys = columns.split(',').map((part) => part.trim()).filter(Boolean);
  const projected: Row = {};
  for (const key of keys) {
    projected[key] = row[key];
  }
  return projected;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

class DemoQuery implements PromiseLike<QueryResult<Row[] | Row | null>> {
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private headOnly = false;
  private wantCount = false;
  private selectColumns = '*';
  private singleMode: 'none' | 'single' | 'maybe' = 'none';
  private mutate:
    | { op: 'insert'; rows: Row[] }
    | { op: 'update'; values: Row }
    | null = null;

  constructor(
    private readonly db: Record<string, Row[]>,
    private readonly table: string
  ) {}

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    this.selectColumns = columns;
    this.wantCount = options?.count === 'exact';
    this.headOnly = Boolean(options?.head);
    return this;
  }

  insert(values: Row | Row[]) {
    this.mutate = { op: 'insert', rows: Array.isArray(values) ? values : [values] };
    return this;
  }

  update(values: Row) {
    this.mutate = { op: 'update', values };
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ type: 'in', column, values });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push({ type: 'ilike', column, pattern });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  private applyFilters(rows: Row[]): Row[] {
    return rows.filter((row) =>
      this.filters.every((filter) => {
        if (filter.type === 'eq') return row[filter.column] === filter.value;
        if (filter.type === 'in') return filter.values.includes(row[filter.column]);
        return matchesIlike(row[filter.column], filter.pattern);
      })
    );
  }

  private execute(): QueryResult<Row[] | Row | null> {
    if (!this.db[this.table]) {
      this.db[this.table] = [];
    }

    const table = this.db[this.table];

    if (this.mutate?.op === 'insert') {
      const inserted = this.mutate.rows.map((row) => {
        const next = {
          id: row.id ?? newId(),
          created_at: row.created_at ?? new Date().toISOString(),
          ...row,
        };
        table.push(next);
        return cloneRow(next);
      });

      if (this.singleMode === 'single' || this.singleMode === 'maybe') {
        return { data: inserted[0] ?? null, error: null, count: inserted.length };
      }
      return { data: inserted, error: null, count: inserted.length };
    }

    let rows = this.applyFilters(table);

    if (this.mutate?.op === 'update') {
      for (const row of rows) {
        Object.assign(row, this.mutate.values);
      }
      rows = rows.map((row) => cloneRow(row));
      if (this.singleMode === 'single' || this.singleMode === 'maybe') {
        return { data: rows[0] ?? null, error: null, count: rows.length };
      }
      return { data: rows, error: null, count: rows.length };
    }

    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => {
        const left = a[column];
        const right = b[column];
        if (left == null && right == null) return 0;
        if (left == null) return ascending ? -1 : 1;
        if (right == null) return ascending ? 1 : -1;
        if (left < right) return ascending ? -1 : 1;
        if (left > right) return ascending ? 1 : -1;
        return 0;
      });
    }

    const count = rows.length;

    if (this.limitCount != null) {
      rows = rows.slice(0, this.limitCount);
    }

    if (this.headOnly) {
      return { data: null, error: null, count: this.wantCount ? count : null };
    }

    const projected = rows.map((row) => projectColumns(row, this.selectColumns));

    if (this.singleMode === 'single') {
      if (projected.length === 0) {
        return {
          data: null,
          error: null,
          count: this.wantCount ? count : null,
        };
      }
      return { data: projected[0], error: null, count: this.wantCount ? count : null };
    }

    if (this.singleMode === 'maybe') {
      return {
        data: projected[0] ?? null,
        error: null,
        count: this.wantCount ? count : null,
      };
    }

    return {
      data: projected,
      error: null,
      count: this.wantCount ? count : null,
    };
  }

  then<TResult1 = QueryResult<Row[] | Row | null>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Row[] | Row | null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export type DemoSupabaseClient = {
  from: (table: string) => DemoQuery;
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const DOC_SPECS: Record<string, { prefix: string; pad: number; yearly: boolean }> = {
  quotation: { prefix: 'Q', pad: 3, yearly: true },
  contract: { prefix: 'CT', pad: 3, yearly: true },
  invoice: { prefix: 'INV', pad: 3, yearly: true },
  outgoing: { prefix: 'OUT', pad: 4, yearly: true },
  return: { prefix: 'RET', pad: 3, yearly: true },
  journal: { prefix: 'JE', pad: 4, yearly: true },
  receipt: { prefix: 'RV', pad: 4, yearly: true },
  payment: { prefix: 'PV', pad: 4, yearly: true },
  certificate: { prefix: 'CERT', pad: 3, yearly: true },
  client: { prefix: 'C', pad: 4, yearly: false },
  lead: { prefix: 'LD', pad: 3, yearly: true },
};

const DEFAULT_COMPANY = '00000000-0000-0000-0000-000000000000';

function formatDemoDocNumber(kind: string, sequence: number, year: number): string {
  const spec = DOC_SPECS[kind];
  if (!spec) throw new Error(`نوع مستند غير معروف: ${kind}`);
  const padded = String(sequence).padStart(spec.pad, '0');
  return spec.yearly ? `${spec.prefix}-${year}-${padded}` : `${spec.prefix}-${padded}`;
}

function parseMaxFromPattern(values: unknown[], kind: string, year: number): number {
  const spec = DOC_SPECS[kind];
  if (!spec) return 0;
  let max = 0;
  const re = spec.yearly
    ? new RegExp(`^${spec.prefix}-${year}-(\\d+)$`, 'i')
    : new RegExp(`^${spec.prefix}-(\\d+)$`, 'i');
  for (const value of values) {
    const match = String(value ?? '').match(re);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

function ensureDemoSequenceSeeded(db: Record<string, Row[]>, kind: string, yearKey: number) {
  if (!db.document_sequences) db.document_sequences = [];
  const companyId = DEFAULT_COMPANY;
  const existing = db.document_sequences.find(
    (row) => row.company_id === companyId && row.doc_kind === kind && row.year_key === yearKey
  );
  if (existing) return;

  const year = yearKey || new Date().getFullYear();
  let lastValue = 0;

  if (kind === 'quotation') {
    lastValue = Math.max(
      parseMaxFromPattern(
        (db.clients || []).map((r) => r.quotation_number),
        kind,
        year
      ),
      parseMaxFromPattern(
        (db.sales_documents || []).filter((r) => r.doc_type === 'quotation').map((r) => r.doc_number),
        kind,
        year
      )
    );
  } else if (kind === 'contract') {
    lastValue = parseMaxFromPattern(
      (db.sales_contracts || []).map((r) => r.contract_number),
      kind,
      year
    );
  } else if (kind === 'invoice') {
    lastValue = parseMaxFromPattern(
      (db.sales_documents || []).filter((r) => r.doc_type === 'invoice').map((r) => r.doc_number),
      kind,
      year
    );
  } else if (kind === 'return') {
    lastValue = parseMaxFromPattern(
      (db.sales_returns || []).map((r) => r.return_number),
      kind,
      year
    );
  } else if (kind === 'client') {
    lastValue = parseMaxFromPattern(
      (db.clients || []).map((r) => r.client_code),
      kind,
      0
    );
  } else if (kind === 'journal') {
    lastValue = parseMaxFromPattern(
      (db.journal_entries || []).map((r) => r.entry_number),
      kind,
      year
    );
  } else if (kind === 'receipt' || kind === 'payment') {
    lastValue = parseMaxFromPattern(
      (db.vouchers || [])
        .filter((r) => (kind === 'receipt' ? r.voucher_type === 'receipt' : r.voucher_type === 'payment'))
        .map((r) => r.voucher_number),
      kind,
      year
    );
  } else if (kind === 'outgoing') {
    lastValue = parseMaxFromPattern(
      (db.clients || []).map((r) => {
        const data = r.project_engineering_data as { technical_report?: { outgoing_number?: string } } | undefined;
        return data?.technical_report?.outgoing_number;
      }),
      kind,
      year
    );
  } else if (kind === 'certificate') {
    lastValue = parseMaxFromPattern(
      (db.clients || []).map((r) => {
        const data = r.project_engineering_data as {
          completion_certificate?: { certificate_number?: string };
        } | undefined;
        return data?.completion_certificate?.certificate_number;
      }),
      kind,
      year
    );
  } else if (kind === 'lead') {
    lastValue = parseMaxFromPattern(
      (db.clients || []).map((r) => r.client_code),
      kind,
      year
    );
  }

  db.document_sequences.push({
    company_id: companyId,
    doc_kind: kind,
    year_key: yearKey,
    last_value: lastValue,
    updated_at: new Date().toISOString(),
  });
}

export function createDemoSupabaseClient(): DemoSupabaseClient {
  const db = createDemoSeed();
  if (!db.document_sequences) db.document_sequences = [];

  return {
    from(table: string) {
      return new DemoQuery(db, table);
    },
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      if (fn !== 'next_document_number') {
        return { data: null, error: { message: `RPC غير مدعوم في وضع العرض: ${fn}` } };
      }

      const kind = String(args.p_doc_kind || '');
      if (!DOC_SPECS[kind]) {
        return { data: null, error: { message: `نوع مستند غير معروف: ${kind}` } };
      }

      const year = new Date().getFullYear();
      const yearKey = DOC_SPECS[kind].yearly ? year : 0;
      const companyId = (args.p_company_id as string) || DEFAULT_COMPANY;

      ensureDemoSequenceSeeded(db, kind, yearKey);

      const row = db.document_sequences.find(
        (item) =>
          item.company_id === companyId && item.doc_kind === kind && item.year_key === yearKey
      );

      if (!row) {
        return { data: null, error: { message: 'تعذر إصدار رقم تسلسلي' } };
      }

      const next = Number(row.last_value || 0) + 1;
      row.last_value = next;
      row.updated_at = new Date().toISOString();

      return { data: formatDemoDocNumber(kind, next, year), error: null };
    },
  };
}
