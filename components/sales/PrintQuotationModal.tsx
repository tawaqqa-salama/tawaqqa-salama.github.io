'use client';

import { useEffect, useMemo, useState } from 'react';
import { printFinancialDocument } from '@/components/invoices/FinancialDocumentPrint';
import QuotationDocumentsUpload from '@/components/sales/QuotationDocumentsUpload';
import { clientToFinancialDocument } from '@/lib/invoices/document-mapper';
import {
  QUOTATION_SERVICE_OPTIONS,
  normalizeQuotationServices,
  type QuotationServiceId,
} from '@/lib/constants/quotation-services';
import { loadCompanyProfile } from '@/lib/company-profile';
import { formatCurrency } from '@/lib/format/currency';
import { parseLocalizedNumber } from '@/lib/validation/client';
import { mergeLocalClientOverrides, updateClientSafe } from '@/lib/supabase/safe-client-write';
import {
  normalizeQuotationDocuments,
  validateQuotationDocumentsForIssue,
} from '@/lib/business/quotation-documents';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { matchPermitLocation } from '@/lib/projects/permit-location-match';
import type { BuildingPermitHydration } from '@/lib/projects/building-permit-ocr';
import type { ClientRecord } from '@/lib/types/client';
import type { QuotationDocumentsState } from '@/lib/types/quotation-documents';

interface PrintQuotationModalProps {
  client: ClientRecord | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function PrintQuotationModal({ client, onClose, onSaved }: PrintQuotationModalProps) {
  const [selected, setSelected] = useState<QuotationServiceId[]>([]);
  const [visitsCount, setVisitsCount] = useState('1');
  const [pricePerM2, setPricePerM2] = useState(0);
  const [documents, setDocuments] = useState<QuotationDocumentsState>(() =>
    normalizeQuotationDocuments(null)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    const hydrated = mergeLocalClientOverrides(client);
    setSelected(normalizeQuotationServices(hydrated.quotation_services));
    setVisitsCount(String(hydrated.quotation_visits_count || 1));
    setDocuments(normalizeQuotationDocuments(hydrated.quotation_documents));
    setError(null);
    void loadCompanyProfile().then((profile) => setPricePerM2(Number(profile.price_per_m2) || 0));
  }, [client]);

  const subtotal = Number(client?.quotation_amount || 0);

  const applyPermitHydration = (fields: BuildingPermitHydration) => {
    if (!client) return;
    const matched = matchPermitLocation({
      city: fields.city,
      district: fields.district,
      municipality: fields.municipality,
      locationSummary: fields.location_summary,
    });
    const eng = parseProjectEngineeringData(client.project_engineering_data);
    const building_plan = {
      ...eng.building_plan,
      building_permit_number:
        fields.building_permit_number || eng.building_plan.building_permit_number,
      building_permit_date: fields.building_permit_date || eng.building_plan.building_permit_date,
      building_permit_date_hijri:
        fields.building_permit_date_hijri || eng.building_plan.building_permit_date_hijri,
      building_permit_ocr_status: 'success' as const,
      building_permit_ocr_message: '✓ تم استخراج بيانات الرخصة من المبيعات',
    };
    const technical_report = {
      ...eng.technical_report,
      building_permit_number:
        fields.building_permit_number || eng.technical_report.building_permit_number,
      building_permit_date:
        fields.building_permit_date || eng.technical_report.building_permit_date,
    };
    const payload: Record<string, unknown> = {
      project_engineering_data: { ...eng, building_plan, technical_report },
    };
    if (fields.owner_name) payload.owner_name = fields.owner_name;
    if (matched.region) payload.region = matched.region;
    if (matched.city || fields.city) payload.city = matched.city || fields.city;
    if (matched.district || fields.district) {
      payload.district = matched.district || fields.district;
    }
    if (fields.street) payload.street = fields.street;
    if (fields.plot_number) payload.plot_number = fields.plot_number;
    if (fields.national_address || fields.location_summary) {
      payload.national_address = fields.national_address || fields.location_summary;
    }
    if (fields.land_area) payload.land_area = parseLocalizedNumber(fields.land_area) || null;

    void updateClientSafe(client.id, payload).then((result) => {
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved?.();
    });
  };

  const toggle = (id: QuotationServiceId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const selectedLabels = useMemo(
    () => QUOTATION_SERVICE_OPTIONS.filter((option) => selected.includes(option.id)),
    [selected]
  );

  if (!client) return null;

  const handlePrint = async () => {
    if (subtotal <= 0) {
      setError('لا يوجد مبلغ لعرض السعر. احفظ العرض أولاً من تبويب العروض والمالية.');
      return;
    }
    if (selected.length === 0) {
      setError('حدد خدمة واحدة على الأقل ضمن نطاق عرض السعر قبل الطباعة.');
      return;
    }
    const docsError = validateQuotationDocumentsForIssue(documents);
    if (docsError) {
      setError(docsError);
      return;
    }

    setSaving(true);
    setError(null);
    const visits = Math.max(1, Math.min(10, parseLocalizedNumber(visitsCount) || 1));

    const writeResult = await updateClientSafe(client.id, {
      quotation_services: selected,
      quotation_visits_count: visits,
      quotation_documents: documents,
    });

    setSaving(false);
    if (writeResult.error) {
      setError(writeResult.error);
      return;
    }

    const document = clientToFinancialDocument(
      {
        ...client,
        quotation_services: selected,
        quotation_visits_count: visits,
        quotation_documents: documents,
      },
      { documentType: 'quotation', pricePerM2: pricePerM2 || null }
    );
    printFinancialDocument(document);
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-bold">طباعة عرض السعر</h2>
            <p className="text-sm text-gray-500">{client.business_name || client.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-xl border bg-slate-50 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span>رقم العرض</span>
              <span className="font-mono">{client.quotation_number || 'مسودة'}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span>الإجمالي قبل الضريبة</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            {pricePerM2 > 0 && client.building_area ? (
              <div className="mt-1 text-xs text-gray-500">
                أساس التسعير: {client.building_area} م² × {formatCurrency(pricePerM2)} / م²
              </div>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">حدد نطاق عرض السعر (الخدمات المشمولة)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUOTATION_SERVICE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option.id)}
                    onChange={() => toggle(option.id)}
                    className="rounded border-gray-300"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {selected.includes('site_visits') ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-gray-600">عدد الزيارات</span>
              <input
                type="number"
                min={1}
                max={10}
                value={visitsCount}
                onChange={(e) => setVisitsCount(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 font-mono text-sm"
              />
            </label>
          ) : null}

          <QuotationDocumentsUpload
            value={documents}
            clientId={client.id}
            disabled={saving}
            onChange={setDocuments}
            onPermitExtracted={applyPermitHydration}
          />

          {selectedLabels.length > 0 ? (
            <p className="text-xs text-gray-500">سيتم طباعة: {selectedLabels.map((item) => item.label).join(' · ')}</p>
          ) : null}

          {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t p-4">
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-semibold">
            إلغاء
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handlePrint()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'جاري التحضير...' : 'طباعة عرض السعر'}
          </button>
        </div>
      </div>
    </div>
  );
}
