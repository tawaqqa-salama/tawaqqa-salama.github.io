import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPrintHtml } from '@/components/invoices/FinancialDocumentPrint';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { clientToFinancialDocument } from '@/lib/invoices/document-mapper';
import { ensureFloorLevels, normalizeFloorLevels, calcBuildingArea, calcFloorsCount } from '@/lib/business/floors';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

function populatedClient(): ClientRecord {
  return {
    id: 'client-roundtrip-1',
    created_at: '2026-08-16T00:00:00.000Z',
    client_code: 'CLI-001',
    name: 'شركة الاختبار الهندسية',
    owner_name: 'فائز صالح مسعود الحارثي',
    phone: '0500000000',
    region: 'مكة المكرمة',
    city: 'جدة',
    district: 'الصفا',
    street: 'شارع الاختبار',
    plot_number: '139',
    national_address: 'NA-001',
    business_name: 'مشروع تجاري متعدد الاستخدامات',
    activity_type: 'commercial',
    land_area: 595.5,
    building_area: 1400,
    floors_count: 3,
    floor_levels: [
      {
        id: 'ground', kind: 'ground', label: 'الدور الأرضي', area_m2: 800, repeat_count: 1,
        usages: [
          { id: 'g1', area_m2: 600, activity_type: 'commercial', label: 'معرض تجاري' },
          { id: 'g2', area_m2: 200, activity_type: 'administrative', label: 'مكاتب' },
        ],
      },
      {
        id: 'typical', kind: 'typical', label: 'الدور المتكرر', area_m2: 300, repeat_count: 2,
        usages: [{ id: 't1', area_m2: 300, activity_type: 'commercial', label: 'معرض' }],
      },
    ],
    project_status: 'قيد الإعداد',
    quotation_number: 'Q-001',
    quotation_amount: 40000,
    vat_amount: 6000,
    total_amount: 46000,
    quotation_status: 'مسودة',
    sales_payment_type: 'نقدي',
    quotation_services: ['firefighting_plans', 'site_visits'],
    quotation_visits_count: 2,
    quotation_documents: {
      building_permit: { id: 'doc-1', fileName: 'permit.pdf', format: 'pdf', sizeBytes: 1200, mimeType: 'application/pdf', storageBucket: 'project-files', storagePath: 'tenant/project/permit.pdf', uploadedAt: '2026-08-16T00:00:00.000Z', kind: 'building_permit' },
      owner_id: { id: 'doc-2', fileName: 'owner.pdf', format: 'pdf', sizeBytes: 900, mimeType: 'application/pdf', storageBucket: 'project-files', storagePath: 'tenant/project/owner.pdf', uploadedAt: '2026-08-16T00:00:00.000Z', kind: 'owner_id' },
      commercial_register: { id: 'doc-3', fileName: 'cr.pdf', format: 'pdf', sizeBytes: 800, mimeType: 'application/pdf', storageBucket: 'project-files', storagePath: 'tenant/project/cr.pdf', uploadedAt: '2026-08-16T00:00:00.000Z', kind: 'commercial_register' },
    },
    project_engineering_data: {
      building_plan: {
        status: 'مسودة',
        building_permit_number: '4100097644', building_permit_date: '2023-07-19', building_permit_date_hijri: '1/1/1445',
        building_permit_expiry_date: '2025-07-19', permit_type: 'جديدة', sub_municipality: 'بلدية الاختبار',
        plan_number: '491/3', deed_number: 'D-1', sketch_number: 'S-1', northing: '2391979.9527', easting: '513415.8874',
        electrical_rooms_count: 2, building_height_m: '12', building_use: 'تجاري', building_type_code: 'commercial',
        manual_city: undefined, manual_district: undefined,
      },
    } as ClientRecord['project_engineering_data'],
  };
}

describe('basic data persistence and professional quotation', () => {
  it('round-trips populated basic data, engineering fields, attachments, and multi-usage floors', () => {
    const original = populatedClient();
    const serialized = JSON.parse(JSON.stringify(original)) as ClientRecord;
    const parsedEngineering = parseProjectEngineeringData(serialized.project_engineering_data);
    const reloadedLevels = ensureFloorLevels(serialized.floor_levels, serialized.floors_count, serialized.building_area);

    expect(serialized.quotation_documents?.building_permit?.storagePath).toBe('tenant/project/permit.pdf');
    expect(serialized.city).toBe(original.city);
    expect(serialized.district).toBe(original.district);
    expect(serialized.national_address).toBe(original.national_address);
    expect(parsedEngineering.building_plan.building_permit_date_hijri).toBe('1/1/1445');
    expect(parsedEngineering.building_plan.electrical_rooms_count).toBe(2);
    expect(parsedEngineering.building_plan.plan_number).toBe('491/3');
    expect(reloadedLevels).toHaveLength(2);
    expect(reloadedLevels[0].usages).toHaveLength(2);
    expect(reloadedLevels[0].usages?.map((row) => row.area_m2)).toEqual([600, 200]);
    expect(calcBuildingArea(reloadedLevels)).toBe(1400);
    expect(calcFloorsCount(reloadedLevels)).toBe(3);
  });

  it('preserves legacy floor data through load/save/load without double area or repetition', () => {
    const legacy = [{ id: 'old', kind: 'typical' as const, label: 'متكرر', area_m2: 300, repeat_count: 2, activity_type: 'commercial', floor_use: 'معرض' }];
    const firstLoad = normalizeFloorLevels(legacy);
    const saved = JSON.parse(JSON.stringify(firstLoad));
    const secondLoad = normalizeFloorLevels(saved);
    expect(secondLoad[0].usages).toHaveLength(1);
    expect(secondLoad[0].usages?.[0].area_m2).toBe(300);
    expect(calcBuildingArea(secondLoad)).toBe(600);
    expect(calcFloorsCount(secondLoad)).toBe(2);
  });

  it('renders a formal selected-services quotation with Arabic-safe print structure', () => {
    const document = clientToFinancialDocument(populatedClient(), { documentType: 'quotation' });
    const html = buildPrintHtml(document, {
      ...DEFAULT_COMPANY_PROFILE,
      legal_name: 'منصة توقع سلامة لاستشارات السلامة والوقاية من الحريق',
      name: 'منصة توقع سلامة',
      commercial_register: 'CR-001',
      tax_number: 'VAT-001',
      bank_name: 'البنك السعودي',
      iban: 'SA0000000000000000000000',
    });

    expect(html).toContain("font-family: 'Noto Naskh Arabic'");
    expect(html).toContain('منصة توقع سلامة لاستشارات السلامة والوقاية من الحريق');
    expect(html).toContain('عرض سعر');
    expect(html).toContain('خدمات هندسية واستشارية في مجال السلامة والوقاية من الحريق');
    expect(html).toContain('مخططات الإطفاء');
    expect(html).toContain('عدد الزيارات');
    expect(html).toContain('ضريبة القيمة المضافة 15%');
    expect(html).toContain('المبلغ كتابة');
    expect(html).toContain('شروط وآلية السداد');
    expect(html).toContain('الشروط والأحكام');
    expect(html).toContain('البيانات البنكية والضريبية');
    expect(html).toContain('اعتماد العميل');
    expect(html).toContain('اعتماد الشركة');
    expect(html).toContain('size: A4 portrait');
    expect(html).not.toContain('SERVER OCR');
    expect(html).not.toContain('LOCAL OCR');
    expect(html).not.toContain('page-break-after: always');
    expect(html).not.toContain('مخططات الإنذار');
  });

  it('uses a single persisted save path and refreshes parent data after successful save', () => {
    const modal = read('components/clients/ClientDetailModal.tsx');
    const salesPage = read('app/sales/page.tsx');
    expect(modal).toContain('await onUpdated();');
    expect(modal).toContain('await saveUpdate(');
    expect(modal).toContain('floor_levels: floorLevels');
    expect(modal).toContain('project_engineering_data: { ...eng, building_plan, technical_report }');
    expect(salesPage).toContain('mergeLocalClientOverrides(client)');
  });
});
