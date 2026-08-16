import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_LIST_CORE_FALLBACK_COLUMNS,
  CLIENT_LIST_FALLBACK_COLUMNS,
  CLIENT_LIST_COLUMNS,
} from '@/lib/data/query-config';
import { shouldShowInProjects, shouldShowInSales } from '@/lib/business/pipeline';
import type { ClientRecord } from '@/lib/types/client';

const fetchers = readFileSync(resolve(__dirname, '../lib/data/fetchers.ts'), 'utf8');
const listFunction = fetchers.slice(
  fetchers.indexOf('export async function fetchClientsList'),
  fetchers.indexOf('export async function fetchClientById')
);

describe('Sales list compatibility fallback', () => {
  it('never uses select star in the Sales list path', () => {
    expect(listFunction).not.toMatch(/select\(['"]\*['"]\)/);
    expect(listFunction).toContain('CLIENT_LIST_FALLBACK_COLUMNS');
    expect(listFunction).toContain('CLIENT_LIST_CORE_FALLBACK_COLUMNS');
  });

  it('keeps fallback columns explicit, schema-compatible, and free of heavy payload fields', () => {
    const heavyFields = ['project_engineering_data', 'attachments', 'quotation_documents', 'dataUrl', 'base64', 'report_snapshots', 'design_center'];
    for (const columns of [CLIENT_LIST_COLUMNS, CLIENT_LIST_FALLBACK_COLUMNS, CLIENT_LIST_CORE_FALLBACK_COLUMNS]) {
      for (const field of heavyFields) expect(columns).not.toContain(field);
      // Production public.clients has created_at but no updated_at.
      expect(columns.split(',')).not.toContain('updated_at');
      expect(columns.split(',')).toContain('created_at');
    }
    expect(CLIENT_LIST_FALLBACK_COLUMNS).toContain('id');
    expect(CLIENT_LIST_FALLBACK_COLUMNS).toContain('business_name');
    expect(CLIENT_LIST_CORE_FALLBACK_COLUMNS).toContain('total_amount');
  });

  it('keeps a client row visible to both derivation paths when updated_at is absent', () => {
    const fixture = {
      id: 'fixture-ld-2026-003',
      client_code: 'LD-2026-003',
      pipeline_stage: 'projects',
      project_status: 'تحت الإنشاء',
      financial_status: 'معتمد مالياً',
      created_at: '2026-08-09T23:19:31.691Z',
    } as ClientRecord;

    expect(fixture).not.toHaveProperty('updated_at');
    expect(shouldShowInSales(fixture)).toBe(true);
    expect(shouldShowInProjects(fixture)).toBe(true);
  });

  it('falls back through explicit safe column sets after an optional-column query failure', () => {
    expect(listFunction).toContain('if (error)');
    expect(listFunction).toContain('CLIENT_LIST_FALLBACK_COLUMNS');
    expect(listFunction).toContain('CLIENT_LIST_CORE_FALLBACK_COLUMNS');
    expect(listFunction).toContain('if (!fallbackError)');
    expect(listFunction).toContain('if (coreError)');
    expect(listFunction).not.toContain(".select('*')");
  });

  it('keeps client detail separate from the list fallback', () => {
    expect(fetchers).toContain("export async function fetchClientById");
    expect(listFunction).not.toContain('fetchClientById');
  });
});
