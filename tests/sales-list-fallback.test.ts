import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_LIST_CORE_FALLBACK_COLUMNS,
  CLIENT_LIST_FALLBACK_COLUMNS,
  CLIENT_LIST_COLUMNS,
} from '@/lib/data/query-config';

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

  it('keeps fallback columns explicit and free of heavy payload fields', () => {
    const heavyFields = ['project_engineering_data', 'attachments', 'quotation_documents', 'dataUrl', 'base64', 'report_snapshots', 'design_center'];
    for (const columns of [CLIENT_LIST_COLUMNS, CLIENT_LIST_FALLBACK_COLUMNS, CLIENT_LIST_CORE_FALLBACK_COLUMNS]) {
      for (const field of heavyFields) expect(columns).not.toContain(field);
    }
    expect(CLIENT_LIST_FALLBACK_COLUMNS).toContain('id');
    expect(CLIENT_LIST_FALLBACK_COLUMNS).toContain('business_name');
    expect(CLIENT_LIST_CORE_FALLBACK_COLUMNS).toContain('total_amount');
  });

  it('keeps client detail separate from the list fallback', () => {
    expect(fetchers).toContain("export async function fetchClientById");
    expect(listFunction).not.toContain('fetchClientById');
  });
});
