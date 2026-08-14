'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ACTIVITY_RULES,
  DEFAULT_INSPECTION_CHECKLIST,
  ENGINEERS,
  ENGINEERING_STATUSES,
  FINAL_REPORT_STATUSES,
  FINANCIAL_STATUSES,
  PROJECT_STATUSES,
  QUOTATION_STATUSES,
  REGION_DATA,
  VISIT_STATUSES,
} from '@/lib/constants/clients';
import {
  calculateTotalAmount,
  calculateVatAmount,
  canAdvanceEngineeringStatus,
  canAccessEngineeringWorkflow,
  canAccessReportsWorkflow,
  canScheduleFieldVisit,
  generateQuotationNumber,
} from '@/lib/business/client-workflow';
import {
  calcBuildingArea,
  calcFloorsCount,
  ensureFloorLevels,
} from '@/lib/business/floors';
import WorkflowStepper from '@/components/clients/WorkflowStepper';
import FloorLevelsEditor from '@/components/clients/FloorLevelsEditor';
import ActivityRequirementsPanel from '@/components/clients/ActivityRequirementsPanel';
import NumericInput from '@/components/ui/NumericInput';
import {
  parseLocalizedInteger,
  parseLocalizedNumber,
  sanitizeTextOnly,
  validateActivityConstraints,
  validateFloorLevels,
} from '@/lib/validation/client';
import { formatCurrency, formatDate } from '@/lib/format/currency';
import { mergePipelineStage, getPipelineStageLabel, resolvePipelineStage } from '@/lib/business/pipeline';
import { processSalesAccountingAutomation } from '@/lib/business/accounting-service';
import { parseProjectEngineeringData, syncProjectVisitsFromQuotation } from '@/lib/business/project-reports';
import { isFinancialApproved } from '@/lib/business/workflow-stages';
import {
  QUOTATION_SERVICE_OPTIONS,
  normalizeQuotationServices,
  type QuotationServiceId,
} from '@/lib/constants/quotation-services';
import { loadCompanyProfile } from '@/lib/company-profile';
import PrintQuotationModal from '@/components/sales/PrintQuotationModal';
import QuotationDocumentsUpload from '@/components/sales/QuotationDocumentsUpload';
import { processZatcaOnQuotationApproval } from '@/lib/zatca/submit';
import { processAutoContractOnApproval } from '@/lib/business/contract-service';
import {
  generateTaxInvoiceFromMilestone,
  generateUpfrontInvoiceOnContract,
} from '@/lib/invoices/tax-invoice-service';
import InvoicePromptModal from '@/components/invoices/InvoicePromptModal';
import {
  downloadTaxInvoice,
  printTaxInvoice,
  shareTaxInvoiceWhatsApp,
} from '@/components/invoices/TaxInvoiceTemplate';
import { mergeLocalClientOverrides, updateClientSafe } from '@/lib/supabase/safe-client-write';
import { logActivity } from '@/lib/activity/logger';
import {
  normalizeQuotationDocuments,
  validateQuotationDocumentsForIssue,
} from '@/lib/business/quotation-documents';
import type { BuildingPermitExtraction, BuildingPermitHydration } from '@/lib/projects/building-permit-ocr';
import { matchPermitLocation } from '@/lib/projects/permit-location-match';
import type { ClientRecord, DepartmentMode, FloorLevel, InspectionChecklistItem } from '@/lib/types/client';
import type { QuotationDocumentsState } from '@/lib/types/quotation-documents';
import type { TaxInvoice } from '@/lib/types/tax-invoice';

type TabId = 'basic' | 'finance' | 'engineering' | 'reports';

const DEPARTMENT_TABS: Record<DepartmentMode, TabId[]> = {
  marketing: ['basic'],
  sales: ['basic', 'finance'],
  finance: ['finance'],
  hr: ['engineering'],
  projects: ['engineering', 'reports'],
  full: ['basic', 'finance', 'engineering', 'reports'],
};

const DEFAULT_TAB: Partial<Record<DepartmentMode, TabId>> = {
  sales: 'finance',
  finance: 'finance',
  hr: 'engineering',
  projects: 'engineering',
};

interface ClientDetailModalProps {
  client: ClientRecord | null;
  department?: DepartmentMode;
  onClose: () => void;
  onUpdated: () => void;
}

function normalizeChecklist(value: ClientRecord['inspection_checklist']): InspectionChecklistItem[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((item) => ({
      id: item.id,
      label: item.label,
      checked: Boolean(item.checked),
    }));
  }
  return DEFAULT_INSPECTION_CHECKLIST.map((item) => ({ ...item }));
}

export default function ClientDetailModal({
  client,
  department = 'full',
  onClose,
  onUpdated,
}: ClientDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [quotationAmount, setQuotationAmount] = useState('');
  const [quotationStatus, setQuotationStatus] = useState('مسودة');
  const [financialStatus, setFinancialStatus] = useState('بانتظار الدفعة');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [quotationVisitsCount, setQuotationVisitsCount] = useState('1');
  const [quotationServices, setQuotationServices] = useState<QuotationServiceId[]>([]);
  const [quotationDocuments, setQuotationDocuments] = useState<QuotationDocumentsState>(() =>
    normalizeQuotationDocuments(null)
  );
  const [pricePerM2, setPricePerM2] = useState(0);
  const [printOpen, setPrintOpen] = useState(false);
  const [salesPaymentType, setSalesPaymentType] = useState<'نقدي' | 'آجل'>('نقدي');

  const [assignedEngineer, setAssignedEngineer] = useState('');
  const [engineeringStatus, setEngineeringStatus] = useState('جديد');
  const [engineeringNotes, setEngineeringNotes] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitStatus, setVisitStatus] = useState('لم تُجدول');
  const [checklist, setChecklist] = useState<InspectionChecklistItem[]>([]);

  const [finalReportStatus, setFinalReportStatus] = useState('قيد الإعداد');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('');

  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [street, setStreet] = useState('');
  const [plotNumber, setPlotNumber] = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [clientTaxNumber, setClientTaxNumber] = useState('');
  const [clientKind, setClientKind] = useState<'business' | 'consumer'>('consumer');
  const [invoicePromptOpen, setInvoicePromptOpen] = useState(false);
  const [promptInvoice, setPromptInvoice] = useState<TaxInvoice | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoicePromptMessage, setInvoicePromptMessage] = useState(
    'تم اعتماد المرحلة. هل تريد استعراض وإصدار الفاتورة الضريبية المعتمدة؟'
  );
  const [nationalAddress, setNationalAddress] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [activityType, setActivityType] = useState('');
  const [landArea, setLandArea] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [floorLevels, setFloorLevels] = useState<FloorLevel[]>([]);
  const [buildingPermitNumber, setBuildingPermitNumber] = useState('');
  const [buildingPermitDate, setBuildingPermitDate] = useState('');
  const [buildingPermitDateHijri, setBuildingPermitDateHijri] = useState('');
  const [permitExtraction, setPermitExtraction] = useState<BuildingPermitExtraction | null>(null);
  /** Prevents document upload refresh from wiping freshly OCR-hydrated floors/activity */
  const permitHydrateLockRef = useRef(false);

  useEffect(() => {
    void loadCompanyProfile().then((profile) => setPricePerM2(Number(profile.price_per_m2) || 0));
  }, []);

  useEffect(() => {
    if (!client) return;
    const hydrated = mergeLocalClientOverrides(client);
    const allowed = DEPARTMENT_TABS[department];
    const preferred = DEFAULT_TAB[department] || allowed[0] || 'basic';
    setActiveTab(allowed.includes(preferred) ? preferred : allowed[0]);
    setErrorMessage(null);
    setSuccessMessage(null);
    setPermitExtraction(null);
    setQuotationServices(normalizeQuotationServices(hydrated.quotation_services));
    setQuotationDocuments(normalizeQuotationDocuments(hydrated.quotation_documents));
    const hydratedLevels = ensureFloorLevels(
      hydrated.floor_levels,
      hydrated.floors_count,
      hydrated.building_area
    );
    const areaForPricing =
      Number(hydrated.building_area || 0) || calcBuildingArea(hydratedLevels);
    const existingAmount = Number(hydrated.quotation_amount || 0);
    if (existingAmount > 0) {
      setQuotationAmount(String(hydrated.quotation_amount));
    } else if (pricePerM2 > 0 && areaForPricing > 0) {
      const auto = Math.round(areaForPricing * pricePerM2 * 100) / 100;
      setQuotationAmount(String(auto));
    } else {
      setQuotationAmount('');
    }
    setQuotationStatus(hydrated.quotation_status || 'مسودة');
    setFinancialStatus(hydrated.financial_status || 'بانتظار الدفعة');
    setPaymentReference(hydrated.payment_reference || '');
    setPaidAmount(hydrated.paid_amount ? String(hydrated.paid_amount) : '');
    setQuotationVisitsCount(String(hydrated.quotation_visits_count || 1));
    setSalesPaymentType((hydrated.sales_payment_type as 'نقدي' | 'آجل') || 'نقدي');
    setAssignedEngineer(hydrated.assigned_engineer || '');
    setEngineeringStatus(hydrated.engineering_status || 'جديد');
    setEngineeringNotes(hydrated.engineering_notes || '');
    setVisitDate(hydrated.visit_date ? String(hydrated.visit_date).slice(0, 16) : '');
    setVisitStatus(hydrated.visit_status || 'لم تُجدول');
    setChecklist(normalizeChecklist(hydrated.inspection_checklist));
    setFinalReportStatus(hydrated.final_report_status || 'قيد الإعداد');
    setLicenseNumber(hydrated.license_number || '');
    setLicenseExpiryDate(hydrated.license_expiry_date || '');
    setOwnerName(hydrated.owner_name || '');
    setPhone(hydrated.phone || '');
    setRegion(hydrated.region || '');
    setCity(hydrated.city || '');
    setDistrict(hydrated.district || '');
    setStreet(hydrated.street || '');
    setPlotNumber(hydrated.plot_number || '');
    setCommercialRegister(hydrated.commercial_register || '');
    setClientTaxNumber(hydrated.tax_number || '');
    setClientKind(
      hydrated.client_kind === 'business' || hydrated.commercial_register || hydrated.tax_number
        ? 'business'
        : 'consumer'
    );
    setNationalAddress(hydrated.national_address || '');
    setBusinessName(hydrated.business_name || '');
    setLandArea(hydrated.land_area != null ? String(hydrated.land_area) : '');
    setProjectStatus(hydrated.project_status || '');

    // Keep OCR-hydrated activity/floors if a concurrent document refresh races in
    if (!permitHydrateLockRef.current) {
      setActivityType(hydrated.activity_type || '');
      setFloorLevels(
        ensureFloorLevels(hydrated.floor_levels, hydrated.floors_count, hydrated.building_area)
      );
    } else if (hydrated.floor_levels?.length || hydrated.activity_type) {
      // Persist caught up — release lock and sync from server
      permitHydrateLockRef.current = false;
      setActivityType(hydrated.activity_type || '');
      setFloorLevels(
        ensureFloorLevels(hydrated.floor_levels, hydrated.floors_count, hydrated.building_area)
      );
    }

    const eng = parseProjectEngineeringData(hydrated.project_engineering_data);
    setBuildingPermitNumber(
      eng.building_plan.building_permit_number || eng.technical_report.building_permit_number || ''
    );
    setBuildingPermitDate(
      eng.building_plan.building_permit_date || eng.technical_report.building_permit_date || ''
    );
    setBuildingPermitDateHijri(eng.building_plan.building_permit_date_hijri || '');
  }, [client, department, pricePerM2]);

  const subtotal = parseLocalizedNumber(quotationAmount);
  const vatAmount = useMemo(() => calculateVatAmount(subtotal), [subtotal]);
  const totalAmount = useMemo(() => calculateTotalAmount(subtotal), [subtotal]);

  const engineeringUnlocked = canAccessEngineeringWorkflow(financialStatus);
  const reportsUnlocked = canAccessReportsWorkflow(engineeringStatus);

  if (!client) return null;

  const handleTabChange = (tab: TabId) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (tab === 'engineering' && !engineeringUnlocked) {
      setErrorMessage('مرحلة المعاينة الهندسية مقفلة. يجب اعتماد المالية أولاً (تم السداد / معتمد مالياً).');
      return;
    }

    if (tab === 'reports' && !reportsUnlocked) {
      setErrorMessage('مرحلة التقرير والترخيص مقفلة. يجب إكمال المعاينة الهندسية أولاً.');
      return;
    }

    setActiveTab(tab);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'basic', label: 'البيانات الأساسية' },
    { id: 'finance', label: 'العروض والمالية' },
    { id: 'engineering', label: 'الشؤون الهندسية' },
    { id: 'reports', label: 'التقارير والتراخيص' },
  ];

  const visibleTabs = tabs.filter((tab) => DEPARTMENT_TABS[department].includes(tab.id));

  const saveUpdate = async (payload: Record<string, unknown>, successText: string) => {
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let finalPayload = payload as Partial<ClientRecord>;

      if (department === 'sales' || department === 'finance') {
        const shouldAutomate =
          ['معتمد', 'بانتظار السداد'].includes(String(finalPayload.quotation_status || quotationStatus)) ||
          isFinancialApproved(String(finalPayload.financial_status || financialStatus)) ||
          parseLocalizedNumber(String(finalPayload.paid_amount ?? paidAmount)) > 0;

        if (shouldAutomate) {
          const automation = await processSalesAccountingAutomation(client, finalPayload);
          if (automation.error) {
            setErrorMessage(automation.error);
            return false;
          }
          finalPayload = automation.updates;
        }
      }

      const merged = mergePipelineStage(client, finalPayload);
      const previousStage = client.pipeline_stage || resolvePipelineStage(client);
      const writeResult = await updateClientSafe(client.id, merged as Record<string, unknown>);
      if (writeResult.error) {
        setErrorMessage(writeResult.error);
        return false;
      }

      const quotationApprovedNow = ['معتمد', 'بانتظار السداد'].includes(
        String(finalPayload.quotation_status || quotationStatus)
      );
      const financiallyApprovedNow = ['تم السداد', 'معتمد مالياً'].includes(
        String(finalPayload.financial_status || financialStatus)
      );
      const mayNeedInvoicePrompt =
        (quotationApprovedNow || financiallyApprovedNow) && Number(merged.quotation_amount || 0) > 0;

      // المسار السريع: أقفل فور نجاح الكتابة قبل العقد/ZATCA/تحديث القائمة
      if (!mayNeedInvoicePrompt) {
        onClose();
      }

      const nextClient = { ...client, ...merged } as ClientRecord;
      const newStage = merged.pipeline_stage;
      const quoteNo = String(merged.quotation_number || client.quotation_number || '');

      void (async () => {
        let message = successText;
        if (writeResult.warning) message += ` — ${writeResult.warning}`;
        if (department === 'sales' && quotationApprovedNow) {
          message += ' — تم توليد سند القبض والقيد المحاسبي تلقائياً.';
        }
        if (newStage && newStage !== previousStage) {
          message += ` — تم نقل المعاملة تلقائياً إلى: ${getPipelineStageLabel(newStage)}`;
        }

        let keepOpenForInvoice = false;
        if (mayNeedInvoicePrompt) {
          try {
            const contractResult = await processAutoContractOnApproval(client, nextClient);
            if (contractResult.messages.length) message += ` — ${contractResult.messages.join(' ')}`;
            if (contractResult.error) message += ` — العقد: ${contractResult.error}`;
            if (contractResult.contract) {
              setInvoicePromptMessage(
                'تم اعتماد العقد / العرض. هل تريد استعراض وإصدار الفاتورة الضريبية المعتمدة؟'
              );
              setPromptInvoice(null);
              setInvoicePromptOpen(true);
              keepOpenForInvoice = true;
              setSuccessMessage(message);
            }
          } catch (contractError) {
            message += ` — العقد: ${contractError instanceof Error ? contractError.message : 'تعذر إنشاء العقد'}`;
          }

          try {
            const zatca = await processZatcaOnQuotationApproval(nextClient);
            if (zatca.messages.length) message += ` — ${zatca.messages.join(' ')}`;
            if (zatca.error) message += ` — ZATCA: ${zatca.error}`;
          } catch (zatcaError) {
            message += ` — ZATCA: ${zatcaError instanceof Error ? zatcaError.message : 'تعذر الإرسال'}`;
          }

          if (!keepOpenForInvoice) onClose();
        }

        void logActivity({
          actionType: 'UPDATE',
          module: department,
          details: quoteNo
            ? `تم تحديث بيانات العميل وعرض السعر ${quoteNo} — ${successText}`
            : `تم تحديث بيانات العميل ${client.business_name || client.name} — ${successText}`,
          metadata: {
            clientId: client.id,
            quotationNumber: quoteNo || null,
            department,
          },
        });

        requestAnimationFrame(() => {
          onUpdated();
        });
      })();

      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'حدث خطأ غير متوقع');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const applyAutoPriceFromArea = () => {
    const area = Number(calcBuildingArea(floorLevels) || client.building_area || 0);
    if (pricePerM2 <= 0) {
      setErrorMessage('حدد سعر المتر المربع من الإعدادات ← إعدادات الشركة أولاً.');
      return;
    }
    if (area <= 0) {
      setErrorMessage('أدخل مساحة المبنى أو مساحات الأدوار لحساب السعر تلقائياً.');
      return;
    }
    const auto = Math.round(area * pricePerM2 * 100) / 100;
    setQuotationAmount(String(auto));
    setSuccessMessage(`تم احتساب المبلغ: ${area} م² × ${formatCurrency(pricePerM2)} = ${formatCurrency(auto)}`);
  };

  const resolveQuotationSubtotal = (): number => {
    if (subtotal > 0) return subtotal;
    const area = Number(calcBuildingArea(floorLevels) || client.building_area || 0);
    if (pricePerM2 > 0 && area > 0) {
      const auto = Math.round(area * pricePerM2 * 100) / 100;
      setQuotationAmount(String(auto));
      return auto;
    }
    return 0;
  };

  const toggleQuotationService = (id: QuotationServiceId) => {
    setQuotationServices((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCreateQuotation = async () => {
    const amount = resolveQuotationSubtotal();
    if (amount <= 0) {
      if (pricePerM2 <= 0) {
        setErrorMessage('حدد سعر المتر المربع من الإعدادات ← إعدادات الشركة أولاً.');
      } else {
        setErrorMessage('يرجى إدخال مبلغ عرض السعر أو مساحة الأدوار لحسابه تلقائياً.');
      }
      return;
    }
    if (quotationServices.length === 0) {
      setErrorMessage('حدد نطاقاً واحداً على الأقل من خدمات عرض السعر.');
      return;
    }
    const docsError = validateQuotationDocumentsForIssue(quotationDocuments);
    if (docsError) {
      setErrorMessage(docsError);
      return;
    }
    const visitsCount = Math.max(1, Math.min(10, parseLocalizedNumber(quotationVisitsCount) || 1));
    const engineeringData = syncProjectVisitsFromQuotation(
      parseProjectEngineeringData(client.project_engineering_data),
      visitsCount
    );
    const quotationNumber = client.quotation_number || (await generateQuotationNumber());
    const nextVat = calculateVatAmount(amount);
    const nextTotal = calculateTotalAmount(amount);
    await saveUpdate(
      {
        quotation_number: quotationNumber,
        quotation_amount: amount,
        vat_amount: nextVat,
        total_amount: nextTotal,
        quotation_status: quotationStatus,
        quotation_visits_count: visitsCount,
        quotation_services: quotationServices,
        quotation_documents: quotationDocuments,
        sales_payment_type: salesPaymentType,
        project_engineering_data: engineeringData,
      },
      'تم حفظ عرض السعر بنجاح.'
    );
  };

  const handleSaveFinance = async () => {
    const paid = parseLocalizedNumber(paidAmount);
    if (paid < 0) {
      setErrorMessage('المبلغ المدفوع لا يمكن أن يكون سالباً.');
      return;
    }
    await saveUpdate(
      {
        financial_status: financialStatus,
        payment_reference: paymentReference || null,
        paid_amount: paid,
        quotation_status: quotationStatus,
        sales_payment_type: salesPaymentType,
      },
      'تم تحديث الحالة المالية.'
    );
  };

  const handleSaveEngineering = async () => {
    if (!engineeringUnlocked) {
      setErrorMessage('مرحلة المعاينة الهندسية مقفلة حتى يتم اعتماد المالية.');
      return;
    }

    const visitError = canScheduleFieldVisit(financialStatus, visitStatus);
    if (visitError) {
      setErrorMessage(visitError);
      return;
    }

    const engineeringError = canAdvanceEngineeringStatus(financialStatus, engineeringStatus);
    if (engineeringError) {
      setErrorMessage(engineeringError);
      return;
    }

    if (visitDate && visitStatus === 'لم تُجدول') {
      setErrorMessage('يرجى تحديد حالة الزيارة عند جدولة موعد المعاينة.');
      return;
    }

    await saveUpdate(
      {
        assigned_engineer: assignedEngineer || null,
        engineering_status: engineeringStatus,
        engineering_notes: engineeringNotes || null,
        visit_date: visitDate ? new Date(visitDate).toISOString() : null,
        visit_status: visitStatus,
        inspection_checklist: checklist,
      },
      'تم حفظ بيانات الشؤون الهندسية.'
    );
  };

  const handleSaveReports = async () => {
    if (!reportsUnlocked) {
      setErrorMessage('لا يمكن إصدار التقرير النهائي أو الترخيص قبل إكمال المعاينة الهندسية.');
      return;
    }

    await saveUpdate(
      {
        final_report_status: finalReportStatus,
        license_number: licenseNumber || null,
        license_expiry_date: licenseExpiryDate || null,
      },
      'تم حفظ بيانات التقارير والتراخيص.'
    );
  };

  const activityRule = activityType ? ACTIVITY_RULES[activityType] : null;
  const computedFloorsCount = calcFloorsCount(floorLevels);
  const computedBuildingArea = calcBuildingArea(floorLevels);
  const availableCities = region && REGION_DATA[region] ? Object.keys(REGION_DATA[region]) : [];
  const catalogDistricts =
    region && city && REGION_DATA[region]?.[city] ? REGION_DATA[region][city] : [];
  const availableDistricts =
    district && !catalogDistricts.includes(district)
      ? [...catalogDistricts, district]
      : catalogDistricts;

  const applyPermitHydration = (fields: BuildingPermitHydration, extraction?: BuildingPermitExtraction) => {
    if (extraction) setPermitExtraction(extraction);
    const matched = matchPermitLocation({
      city: fields.city,
      district: fields.district,
      municipality: fields.municipality,
      locationSummary: fields.location_summary,
    });

    if (matched.region) setRegion(matched.region);
    if (matched.city || fields.city) setCity(matched.city || fields.city || '');
    if (matched.district || fields.district) {
      setDistrict(matched.district || fields.district || '');
    }
    if (fields.owner_name) setOwnerName(fields.owner_name);
    if (fields.street) setStreet(fields.street);
    if (fields.plot_number) setPlotNumber(fields.plot_number);
    if (fields.commercial_register) {
      setCommercialRegister(fields.commercial_register);
      setClientKind('business');
    }
    if (fields.phone && /^05\d{8}$/.test(fields.phone)) setPhone(fields.phone);
    if (fields.land_area) setLandArea(fields.land_area);
    if (fields.national_address) setNationalAddress(fields.national_address);
    else if (fields.location_summary) setNationalAddress(fields.location_summary);
    if (fields.building_permit_number) setBuildingPermitNumber(fields.building_permit_number);
    if (fields.building_permit_date) setBuildingPermitDate(fields.building_permit_date);
    if (fields.building_permit_date_hijri) {
      setBuildingPermitDateHijri(fields.building_permit_date_hijri);
    }
    if (fields.activity_type) setActivityType(fields.activity_type);
    const nextFloorLevels =
      fields.floor_levels && fields.floor_levels.length > 0
        ? fields.floor_levels
        : fields.floors_count || fields.building_area
          ? ensureFloorLevels(
              null,
              fields.floors_count ?? null,
              fields.building_area ? Number(fields.building_area) : null
            )
          : null;
    if (nextFloorLevels && nextFloorLevels.length > 0) {
      permitHydrateLockRef.current = true;
      setFloorLevels(nextFloorLevels);
    } else if (fields.activity_type) {
      permitHydrateLockRef.current = true;
    }

    // لا تُعد كتابة quotation_documents هنا — onChange يحفظها قبل الاستخراج
    // (تجنّب استبدال المرفق بحالة قديمة من الـ closure)
    // لا تحفظ قيم OCR تلقائيًا؛ تبقى الحقول معبأة للمراجعة ثم يعتمدها المستخدم بزر الحفظ.
    // هذا يمنع انتقال قيمة مقروءة بشكل خاطئ من الرخصة إلى سجل العميل دون مراجعة.
    setSuccessMessage(
      [
        fields.building_permit_number ? `رقم الرخصة: ${fields.building_permit_number}` : null,
        fields.owner_name ? `المالك: ${fields.owner_name}` : null,
        fields.activity_type ? `النشاط: ${fields.usage_label || fields.activity_type}` : null,
        fields.floors_count != null ? `الأدوار: ${fields.floors_count}` : null,
        fields.building_area ? `مساحة البناء: ${fields.building_area} م²` : null,
        matched.district || fields.district
          ? `الحي: ${matched.district || fields.district}`
          : null,
        fields.street ? `الشارع: ${fields.street}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'تم استخراج بيانات الرخصة وتعبئة الحقول — راجعها ثم اضغط حفظ'
    );
  };

  const handleSaveBasic = async () => {
    if (!/^05\d{8}$/.test(phone.replace(/\s+/g, ''))) {
      setErrorMessage('رقم الجوال غير صحيح. يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.');
      return;
    }
    if (!region || !city || !district) {
      setErrorMessage('أكمل المنطقة والمدينة والحي.');
      return;
    }
    if (!activityType) {
      setErrorMessage('اختر نوع النشاط لربط الاشتراطات.');
      return;
    }

    const floorsError = validateFloorLevels(floorLevels);
    if (floorsError) {
      setErrorMessage(floorsError);
      return;
    }

    const land = parseLocalizedInteger(landArea);
    const activityError = validateActivityConstraints({
      activity_type: activityType,
      land_area: land,
      floors_count: computedFloorsCount,
    });
    if (activityError) {
      setErrorMessage(activityError);
      return;
    }

    const eng = parseProjectEngineeringData(client.project_engineering_data);
    const building_plan = {
      ...eng.building_plan,
      building_permit_number: buildingPermitNumber.trim() || eng.building_plan.building_permit_number,
      building_permit_date: buildingPermitDate.trim() || eng.building_plan.building_permit_date,
      building_permit_date_hijri:
        buildingPermitDateHijri.trim() || eng.building_plan.building_permit_date_hijri,
    };
    const technical_report = {
      ...eng.technical_report,
      building_permit_number:
        buildingPermitNumber.trim() || eng.technical_report.building_permit_number,
      building_permit_date: buildingPermitDate.trim() || eng.technical_report.building_permit_date,
    };

    await saveUpdate(
      {
        owner_name: ownerName.trim(),
        phone: phone.replace(/\s+/g, ''),
        region,
        city,
        district,
        street: street.trim() || null,
        plot_number: plotNumber.trim() || null,
        commercial_register: commercialRegister.trim() || null,
        tax_number: clientTaxNumber.trim() || null,
        client_kind: clientKind,
        national_address: nationalAddress.trim() || null,
        business_name: businessName.trim() || ownerName.trim(),
        name: businessName.trim() || ownerName.trim(),
        activity_type: activityType,
        land_area: land,
        building_area: computedBuildingArea,
        floors_count: computedFloorsCount,
        floor_levels: floorLevels,
        project_status: projectStatus || null,
        quotation_documents: quotationDocuments,
        project_engineering_data: { ...eng, building_plan, technical_report },
      },
      'تم حفظ البيانات الأساسية وتفصيل الأدوار وبيانات رخصة البناء.'
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-4xl max-h-[94vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">متابعة معاملة العميل</h2>
              <p className="text-sm text-gray-500 mt-1">
                {client.business_name || client.name} — {client.client_code}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
              ×
            </button>
          </div>

          <WorkflowStepper client={{ ...client, financial_status: financialStatus, engineering_status: engineeringStatus, quotation_amount: subtotal, quotation_number: client.quotation_number }} />

          <div className="flex flex-wrap gap-2 mt-4">
            {visibleTabs.map((tab) => {
              const locked =
                (tab.id === 'engineering' && !engineeringUnlocked) ||
                (tab.id === 'reports' && !reportsUnlocked);

              return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : locked
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
                {locked ? ' 🔒' : ''}
              </button>
              );
            })}
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              ⚠️ {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">
              ✓ {successMessage}
            </div>
          )}

          {activeTab === 'basic' && (
            <div className="space-y-5 text-sm">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 space-y-3">
                <div>
                  <p className="text-sm font-bold text-emerald-950">رخصة البناء والمستندات</p>
                  <p className="text-[11px] text-emerald-800/80 mt-0.5">
                    أرفق رخصة البناء وأدخل رقمها وتاريخها هنا من المبيعات — لا تُرفع من صفحة المشاريع.
                  </p>
                </div>
                <QuotationDocumentsUpload
                  value={quotationDocuments}
                  clientId={client.id}
                  disabled={saving}
                  onChange={(next) => {
                    setQuotationDocuments(next);
                    void updateClientSafe(client.id, { quotation_documents: next }).then((result) => {
                      if (result.error) {
                        setErrorMessage(result.error);
                        return;
                      }
                      setErrorMessage(null);
                      onUpdated();
                    });
                  }}
                  onPermitExtracted={applyPermitHydration}
                />
                {permitExtraction ? (
                  <PermitExtractionSummary extraction={permitExtraction} hydration={{
                    owner_name: ownerName,
                    building_permit_number: buildingPermitNumber,
                    building_permit_date: buildingPermitDate,
                    building_permit_date_hijri: buildingPermitDateHijri,
                    land_area: landArea,
                    building_area: String(computedBuildingArea || ''),
                    floors_count: computedFloorsCount,
                    activity_type: activityType,
                  }} />
                ) : null}
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  راجع القيم المستخرجة من الرخصة، خصوصًا رقم الرخصة والمساحات وتفاصيل الأدوار، ثم اضغط «حفظ البيانات الأساسية» لاعتمادها.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      رقم رخصة البناء
                    </label>
                    <input
                      value={buildingPermitNumber}
                      onChange={(e) => setBuildingPermitNumber(e.target.value)}
                      className="w-full p-2.5 border rounded-xl text-sm bg-white"
                      placeholder="يُستخرج تلقائياً أو يُدخل يدوياً"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      تاريخ الرخصة (ميلادي)
                    </label>
                    <input
                      type="date"
                      value={buildingPermitDate}
                      onChange={(e) => setBuildingPermitDate(e.target.value)}
                      className="w-full p-2.5 border rounded-xl text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      تاريخ الرخصة (هجري)
                    </label>
                    <input
                      value={buildingPermitDateHijri}
                      onChange={(e) => setBuildingPermitDateHijri(e.target.value)}
                      className="w-full p-2.5 border rounded-xl text-sm bg-white"
                      placeholder="اختياري"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">اسم المالك</label>
                  <input
                    value={ownerName}
                    onChange={(e) => setOwnerName(sanitizeTextOnly(e.target.value))}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">رقم الجوال</label>
                  <NumericInput
                    value={phone}
                    maxLength={10}
                    onChange={setPhone}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">المنطقة</label>
                  <select
                    value={region}
                    onChange={(e) => {
                      setRegion(e.target.value);
                      setCity('');
                      setDistrict('');
                    }}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    <option value="">اختر المنطقة</option>
                    {Object.keys(REGION_DATA).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">المدينة</label>
                  <select
                    value={city}
                    disabled={!region}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setDistrict('');
                    }}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white disabled:bg-gray-50"
                  >
                    <option value="">اختر المدينة</option>
                    {availableCities.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">الحي</label>
                  <select
                    value={district}
                    disabled={!city}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white disabled:bg-gray-50"
                  >
                    <option value="">اختر الحي</option>
                    {availableDistricts.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">الشارع</label>
                  <input
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">رقم القطعة</label>
                  <input
                    value={plotNumber}
                    onChange={(e) => setPlotNumber(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">السجل التجاري (للعقود)</label>
                  <input
                    value={commercialRegister}
                    onChange={(e) => setCommercialRegister(e.target.value)}
                    dir="ltr"
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">الرقم الضريبي للعميل (VAT)</label>
                  <input
                    value={clientTaxNumber}
                    onChange={(e) => setClientTaxNumber(e.target.value)}
                    dir="ltr"
                    placeholder="لفاتورة B2B قياسية"
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">نوع العميل (فوترة)</label>
                  <select
                    value={clientKind}
                    onChange={(e) => setClientKind(e.target.value as 'business' | 'consumer')}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  >
                    <option value="consumer">فرد / مستهلك (فاتورة مبسطة)</option>
                    <option value="business">منشأة / جهة (فاتورة قياسية)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">العنوان الوطني</label>
                  <input
                    value={nationalAddress}
                    onChange={(e) => setNationalAddress(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">اسم النشاط</label>
                  <input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">نوع النشاط</label>
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    <option value="">اختر نوع النشاط</option>
                    {Object.entries(ACTIVITY_RULES).map(([key, rule]) => (
                      <option key={key} value={key}>{rule.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">مساحة الأرض (م²)</label>
                  <NumericInput
                    mode="decimal"
                    value={landArea}
                    onChange={setLandArea}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">حالة المشروع</label>
                  <select
                    value={projectStatus}
                    onChange={(e) => setProjectStatus(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    <option value="">اختر الحالة</option>
                    {PROJECT_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">مساحة المبنى (محسوبة)</label>
                  <input
                    readOnly
                    value={computedBuildingArea ? `${computedBuildingArea} م²` : '—'}
                    className="w-full p-2.5 border rounded-xl text-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">عدد الأدوار (محسوب)</label>
                  <input
                    readOnly
                    value={computedFloorsCount || '—'}
                    className="w-full p-2.5 border rounded-xl text-sm bg-gray-50"
                  />
                </div>
              </div>

              <ActivityRequirementsPanel
                activityType={activityType}
                floorsCount={computedFloorsCount}
                buildingArea={computedBuildingArea}
                landArea={parseLocalizedInteger(landArea)}
              />

              <FloorLevelsEditor
                levels={floorLevels}
                onChange={setFloorLevels}
                maxFloors={activityRule?.maxFloors}
              />

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveBasic()}
                className="w-full md:w-auto bg-[#635bdb] text-white rounded-xl px-5 py-2.5 font-semibold disabled:opacity-60"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ البيانات الأساسية'}
              </button>
            </div>
          )}

          {activeTab === 'finance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">رقم عرض السعر</label>
                  <input
                    readOnly
                    value={client.quotation_number || 'يُصدر تلقائياً عند الإنشاء (Q-YYYY-NNN)'}
                    className="w-full p-2.5 border rounded-xl text-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">حالة عرض السعر</label>
                  <select
                    value={quotationStatus}
                    onChange={(e) => setQuotationStatus(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    {QUOTATION_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">عدد الزيارات الميدانية (حسب العرض)</label>
                  <NumericInput
                    mode="integer"
                    value={quotationVisitsCount}
                    onChange={setQuotationVisitsCount}
                    className="w-full p-2.5 border rounded-xl text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">نوع البيع</label>
                  <select
                    value={salesPaymentType}
                    onChange={(e) => setSalesPaymentType(e.target.value as 'نقدي' | 'آجل')}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    <option value="نقدي">نقدي</option>
                    <option value="آجل">آجل</option>
                  </select>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-gray-700">نطاق عرض السعر (الخدمات المشمولة)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {QUOTATION_SERVICE_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={quotationServices.includes(option.id)}
                        onChange={() => toggleQuotationService(option.id)}
                        className="rounded border-gray-300"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-emerald-900">التسعير التلقائي بالمتر المربع</p>
                    <p className="text-xs text-emerald-800/80">
                      سعر المتر من الإعدادات: {pricePerM2 > 0 ? formatCurrency(pricePerM2) : 'غير محدد'}
                      {' · '}
                      مساحة المبنى: {computedBuildingArea || client.building_area || '—'} م²
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={applyAutoPriceFromArea}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold"
                  >
                    احسب بالمتر المربع
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">المبلغ الأساسي (قبل الضريبة)</label>
                <NumericInput
                  mode="decimal"
                  value={quotationAmount}
                  onChange={setQuotationAmount}
                  placeholder="0.00"
                  className="w-full p-2.5 border rounded-xl text-sm font-mono"
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span>ضريبة القيمة المضافة (15%)</span>
                  <span className="font-mono">{formatCurrency(vatAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-blue-700">
                  <span>الإجمالي شامل الضريبة</span>
                  <span className="font-mono">{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCreateQuotation}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'جاري الحفظ...' : 'إنشاء / تحديث عرض السعر'}
                </button>
                <button
                  type="button"
                  onClick={() => setPrintOpen(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"
                >
                  طباعة عرض السعر
                </button>
              </div>

              <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">حالة الاعتماد المالي</label>
                  <select
                    value={financialStatus}
                    onChange={(e) => setFinancialStatus(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    {FINANCIAL_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">مرجع الدفع</label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="رقم التحويل / الإيصال"
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">المبلغ المدفوع</label>
                  <NumericInput
                    mode="decimal"
                    value={paidAmount}
                    onChange={setPaidAmount}
                    className="w-full p-2.5 border rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveFinance}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ الحالة المالية'}
                </button>
                <button
                  type="button"
                  disabled={invoiceBusy || Number(subtotal || client.quotation_amount || 0) <= 0}
                  onClick={() => {
                    setInvoicePromptMessage(
                      'هل تريد إصدار فاتورة ضريبية جديدة لهذا المشروع؟'
                    );
                    setPromptInvoice(null);
                    setInvoicePromptOpen(true);
                  }}
                  className="px-4 py-2 bg-[#635bdb] text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  اصدار فاتورة جديدة
                </button>
              </div>
            </div>
          )}

          {activeTab === 'engineering' && (
            <fieldset disabled={!engineeringUnlocked} className="space-y-4 disabled:opacity-60">
              {!engineeringUnlocked && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm">
                  🔒 مرحلة المعاينة الهندسية والزيارات الميدانية مقفلة. اعتمد المالية (تم السداد / معتمد مالياً) لفتح هذه المرحلة.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">المهندس المسؤول</label>
                  <select
                    value={assignedEngineer}
                    onChange={(e) => setAssignedEngineer(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    <option value="">— اختر المهندس —</option>
                    {ENGINEERS.map((engineer) => (
                      <option key={engineer} value={engineer}>{engineer}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">حالة الشؤون الهندسية</label>
                  <select
                    value={engineeringStatus}
                    onChange={(e) => setEngineeringStatus(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    {ENGINEERING_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">ملاحظات هندسية</label>
                <textarea
                  rows={4}
                  value={engineeringNotes}
                  onChange={(e) => setEngineeringNotes(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-sm"
                  placeholder="ملاحظات المعاينة، الملاحظات الفنية، التوصيات..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">تاريخ ووقت الزيارة</label>
                  <input
                    type="datetime-local"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">حالة الزيارة</label>
                  <select
                    value={visitStatus}
                    onChange={(e) => setVisitStatus(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    {VISIT_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">قائمة تحقق المعاينة الميدانية</label>
                <div className="space-y-2">
                  {checklist.map((item, index) => (
                    <label key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-gray-50">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => {
                          const updated = [...checklist];
                          updated[index] = { ...item, checked: e.target.checked };
                          setChecklist(updated);
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveEngineering}
                disabled={saving || !engineeringUnlocked}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الشؤون الهندسية'}
              </button>
            </fieldset>
          )}

          {activeTab === 'reports' && (
            <fieldset disabled={!reportsUnlocked} className="space-y-4 disabled:opacity-60">
              {!reportsUnlocked && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm">
                  🔒 التقرير النهائي ورخصة السلامة متاحان بعد إكمال المعاينة الهندسية.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">رقم المعاملة / الترخيص (سلامة / بلدي)</label>
                  <input
                    type="text"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="رقم الترخيص"
                    className="w-full p-2.5 border rounded-xl text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">تاريخ انتهاء الترخيص</label>
                  <input
                    type="date"
                    value={licenseExpiryDate}
                    onChange={(e) => setLicenseExpiryDate(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">حالة التقرير النهائي</label>
                <select
                  value={finalReportStatus}
                  onChange={(e) => setFinalReportStatus(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-sm bg-white"
                >
                  {FINAL_REPORT_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div className="bg-gray-50 border rounded-xl p-4 text-sm space-y-2">
                <p><span className="text-gray-500">آخر زيارة:</span> {visitDate ? formatDate(visitDate) : '—'}</p>
                <p><span className="text-gray-500">المهندس:</span> {assignedEngineer || '—'}</p>
                <p><span className="text-gray-500">حالة الهندسة:</span> {engineeringStatus}</p>
              </div>

              <button
                type="button"
                onClick={handleSaveReports}
                disabled={saving || !reportsUnlocked}
                className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ التقارير والتراخيص'}
              </button>
            </fieldset>
          )}
        </div>
      </div>

      {printOpen ? (
        <PrintQuotationModal
          client={{
            ...client,
            quotation_amount: subtotal || client.quotation_amount,
            quotation_services: quotationServices,
            quotation_visits_count: Math.max(1, parseLocalizedNumber(quotationVisitsCount) || 1),
          }}
          onClose={() => setPrintOpen(false)}
          onSaved={() => {
            setPrintOpen(false);
            onUpdated();
          }}
        />
      ) : null}

      <InvoicePromptModal
        open={invoicePromptOpen}
        message={invoicePromptMessage}
        invoice={promptInvoice}
        loading={invoiceBusy}
        onClose={() => {
          setInvoicePromptOpen(false);
          setPromptInvoice(null);
          onClose();
        }}
        onIssue={() => {
          void (async () => {
            setInvoiceBusy(true);
            const nextClient = {
              ...client,
              tax_number: clientTaxNumber.trim() || null,
              client_kind: clientKind,
              commercial_register: commercialRegister.trim() || null,
              quotation_amount: subtotal || client.quotation_amount,
            } as ClientRecord;
            const result = invoicePromptMessage.includes('العقد')
              ? await generateUpfrontInvoiceOnContract(nextClient, null)
              : await generateTaxInvoiceFromMilestone({
                  clientId: client.id,
                  triggerSource: 'manual',
                });
            setInvoiceBusy(false);
            if (!result.ok || !result.invoice) {
              setErrorMessage(result.error || 'تعذر إصدار الفاتورة');
              return;
            }
            setPromptInvoice(result.invoice);
            if (result.messages?.length) setSuccessMessage(result.messages.join(' — '));
          })();
        }}
        onPreview={() => {
          if (promptInvoice) void printTaxInvoice(promptInvoice);
        }}
        onDownload={() => {
          if (promptInvoice) void downloadTaxInvoice(promptInvoice);
        }}
        onWhatsApp={() => {
          if (promptInvoice) void shareTaxInvoiceWhatsApp(promptInvoice, client.phone);
        }}
      />
    </div>
  );
}



function PermitExtractionSummary({
  extraction,
  hydration,
}: {
  extraction: BuildingPermitExtraction;
  hydration: {
    owner_name: string;
    building_permit_number: string;
    building_permit_date: string;
    building_permit_date_hijri: string;
    land_area: string;
    building_area: string;
    floors_count: number;
    activity_type: string;
  };
}) {
  const activityLabel = hydration.activity_type
    ? ACTIVITY_RULES[hydration.activity_type]?.label || hydration.activity_type
    : extraction.usageLabel || 'غير محدد في الرخصة';
  const floors = extraction.floors || [];
  const valueOrDash = (value: string | number | null | undefined) => value === '' || value == null ? '—' : String(value);

  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-teal-50/70 p-4" aria-label="بيانات الرخصة المستخرجة">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-indigo-950">بيانات الرخصة المستخرجة</p>
          <p className="mt-1 text-[11px] text-indigo-800/70">تم استخراجها من الملف المرفوع — راجعها قبل الحفظ النهائي.</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-indigo-700 shadow-sm">المصدر: {extraction.source}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <PermitValue label="اسم المالك" value={valueOrDash(hydration.owner_name || extraction.ownerName)} />
        <PermitValue label="رقم الرخصة" value={valueOrDash(hydration.building_permit_number || extraction.permitNumber)} />
        <PermitValue label="تاريخ الرخصة" value={valueOrDash(hydration.building_permit_date || extraction.permitDateGregorian)} />
        <PermitValue label="التاريخ الهجري" value={valueOrDash(hydration.building_permit_date_hijri || extraction.permitDateHijri)} />
        <PermitValue label="مساحة الأرض" value={hydration.land_area ? `${hydration.land_area} م²` : '—'} />
        <PermitValue label="مساحة المبنى" value={hydration.building_area ? `${hydration.building_area} م²` : extraction.buildingAreaM2 ? `${extraction.buildingAreaM2} م²` : '—'} />
        <PermitValue label="عدد الأدوار" value={hydration.floors_count ? `${hydration.floors_count}` : '—'} />
        <PermitValue label="تصنيف النشاط" value={activityLabel} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-indigo-100 bg-white/80">
        <table className="w-full min-w-[560px] text-right text-xs">
          <thead className="border-b border-indigo-100 bg-indigo-50/70 text-indigo-900">
            <tr><th className="p-3">اسم الدور</th><th className="p-3">المساحة</th><th className="p-3">نشاط الدور</th><th className="p-3">التكرار</th></tr>
          </thead>
          <tbody>
            {floors.length ? floors.map((floor, index) => (
              <tr key={`${floor.label}-${index}`} className="border-b border-indigo-50 last:border-0">
                <td className="p-3 font-semibold">{floor.label || `دور ${index + 1}`}</td>
                <td className="p-3 font-mono">{floor.area_m2 ? `${floor.area_m2} م²` : '—'}</td>
                <td className="p-3">{floor.activity_type || activityLabel || 'غير مذكور مستقلًا'}</td>
                <td className="p-3">{floor.repeat_count || 1}</td>
              </tr>
            )) : (
              <tr><td colSpan={4} className="p-4 text-center text-gray-500">لم تُستخرج تفاصيل منفصلة للأدوار من هذه الرخصة.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-gray-500">دقة الاستخراج: {extraction.confidence} · البيانات غير الواضحة تبقى قابلة للتعديل يدويًا.</p>
    </section>
  );
}

function PermitValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white/80 p-3">
      <p className="text-[10px] font-semibold text-gray-500">{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-gray-900">{value}</p>
    </div>
  );
}
