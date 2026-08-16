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
import QuotationDocumentsUpload from '@/components/sales/QuotationDocumentsUpload';
import { processZatcaOnQuotationApproval } from '@/lib/zatca/submit';
import { findExistingContractForQuote, processAutoContractOnApproval } from '@/lib/business/contract-service';
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
import { mergeProjectEngineeringData } from '@/lib/projects/merge-engineering-data';
import { printSavedQuotation, validateSavedQuotationForPrint } from '@/lib/invoices/quotation-print';
import { logActivity } from '@/lib/activity/logger';
import {
  normalizeQuotationDocuments,
  validateQuotationDocumentsForIssue,
} from '@/lib/business/quotation-documents';
import type { ClientRecord, DepartmentMode, FloorLevel, InspectionChecklistItem } from '@/lib/types/client';
import type { QuotationDocumentsState } from '@/lib/types/quotation-documents';
import { getCities, getDistricts, getRegions, isValidLocation } from '@/lib/data/saudi-location-provider';
import { formatHijriParts, HIJRI_MONTHS, hijriToGregorian, parseHijriParts } from '@/lib/date/hijri';
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
  onUpdated: (updatedClient?: ClientRecord) => void | Promise<void>;
  presentation?: 'modal' | 'page';
  onSaveAndContinue?: () => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
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
  presentation = 'modal',
  onSaveAndContinue,
  onDirtyChange,
}: ClientDetailModalProps) {
  const isPagePresentation = presentation === 'page';
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [unsavedWarningOpen, setUnsavedWarningOpen] = useState(false);
  const [quotationEditMode, setQuotationEditMode] = useState(false);
  const [contractLinked, setContractLinked] = useState(false);
  const [contractCheckLoading, setContractCheckLoading] = useState(false);
  const [baselineRevision, setBaselineRevision] = useState(0);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  const persistedSnapshotRef = useRef<string | null>(null);
  const baselineSyncPendingRef = useRef(false);

  const [quotationNumber, setQuotationNumber] = useState('');
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
  const [citySelection, setCitySelection] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [districtSelection, setDistrictSelection] = useState('');
  const [district, setDistrict] = useState('');
  const [manualDistrict, setManualDistrict] = useState('');
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
  const [hijriDay, setHijriDay] = useState('');
  const [hijriMonth, setHijriMonth] = useState('');
  const [hijriYear, setHijriYear] = useState('');
  const [hijriConversionError, setHijriConversionError] = useState('');
  const [hijriPickerOpen, setHijriPickerOpen] = useState(false);
  const [buildingPermitExpiryDate, setBuildingPermitExpiryDate] = useState('');
  const [permitType, setPermitType] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [subMunicipality, setSubMunicipality] = useState('');
  const [planNumber, setPlanNumber] = useState('');
  const [sketchNumber, setSketchNumber] = useState('');
  const [deedNumber, setDeedNumber] = useState('');
  const [northing, setNorthing] = useState('');
  const [easting, setEasting] = useState('');
  const [licensedFloorCount, setLicensedFloorCount] = useState('');
  const [buildingHeight, setBuildingHeight] = useState('');
  const [buildingUse, setBuildingUse] = useState('');
  const [buildingType, setBuildingType] = useState('');
  const [electricalRoomsCount, setElectricalRoomsCount] = useState('');

  useEffect(() => {
    void loadCompanyProfile().then((profile) => setPricePerM2(Number(profile.price_per_m2) || 0));
  }, []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const hydrated = mergeLocalClientOverrides(client);
    const allowed = DEPARTMENT_TABS[department];
    // The standalone basic-data route must always open the complete basic-data form.
    // Sales modal behavior keeps its quotation-first default unchanged.
    const preferred = isPagePresentation ? 'basic' : DEFAULT_TAB[department] || allowed[0] || 'basic';
    setActiveTab(allowed.includes(preferred) ? preferred : allowed[0]);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsDirty(false);
    setUnsavedWarningOpen(false);
    const issued = Boolean(hydrated.quotation_number && hydrated.quotation_status && hydrated.quotation_status !== 'مسودة');
    setQuotationEditMode(!issued);
    setContractLinked(false);
    setContractCheckLoading(Boolean(hydrated.quotation_number));
    if (hydrated.quotation_number) {
      void findExistingContractForQuote(client.id, hydrated.quotation_number)
        .then((contract) => {
          if (!active) return;
          setContractLinked(Boolean(contract));
        })
        .finally(() => {
          if (active) setContractCheckLoading(false);
        });
    }
    setQuotationNumber(hydrated.quotation_number || '');
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
    const loadedRegion = hydrated.region || '';
    const loadedCity = hydrated.city || '';
    const loadedDistrict = hydrated.district || '';
    setRegion(loadedRegion);
    setCity(loadedCity);
    setStreet(hydrated.street || '');
    const loadedCities = getCities(loadedRegion);
    const loadedCityIsKnown = Boolean(loadedCity && loadedCities.includes(loadedCity));
    setCitySelection(loadedCityIsKnown ? loadedCity : loadedCity ? 'أخرى' : '');
    setManualCity(loadedCityIsKnown ? '' : loadedCity);
    const loadedDistricts = getDistricts(loadedRegion, loadedCity);
    const loadedDistrictIsKnown = Boolean(loadedDistrict && loadedDistricts.includes(loadedDistrict));
    setDistrict(loadedDistrict);
    setDistrictSelection(loadedDistrictIsKnown ? loadedDistrict : loadedDistrict ? 'أخرى' : '');
    setManualDistrict(loadedDistrictIsKnown ? '' : loadedDistrict);
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

    setActivityType(hydrated.activity_type || '');
    setFloorLevels(
      ensureFloorLevels(hydrated.floor_levels, hydrated.floors_count, hydrated.building_area)
    );

    const eng = parseProjectEngineeringData(hydrated.project_engineering_data);
    setBuildingPermitNumber(
      eng.building_plan.building_permit_number || eng.technical_report.building_permit_number || ''
    );
    setBuildingPermitDate(
      eng.building_plan.building_permit_date || eng.technical_report.building_permit_date || ''
    );
    const loadedHijri = eng.building_plan.building_permit_date_hijri || '';
    setBuildingPermitDateHijri(loadedHijri);
    const loadedHijriParts = parseHijriParts(loadedHijri);
    setHijriDay(loadedHijriParts ? String(loadedHijriParts.day) : '');
    setHijriMonth(loadedHijriParts ? String(loadedHijriParts.month) : '');
    setHijriYear(loadedHijriParts ? String(loadedHijriParts.year) : '');
    setHijriConversionError('');
    setBuildingPermitExpiryDate(eng.building_plan.building_permit_expiry_date || '');
    setPermitType(eng.building_plan.permit_type || '');
    setMunicipality(eng.building_plan.municipality || '');
    setSubMunicipality(eng.building_plan.sub_municipality || '');
    setPlanNumber(eng.building_plan.plan_number || '');
    setSketchNumber(eng.building_plan.sketch_number || '');
    setDeedNumber(eng.building_plan.deed_number || '');
    setNorthing(eng.building_plan.northing || '');
    setEasting(eng.building_plan.easting || '');
    setLicensedFloorCount(
      eng.building_plan.licensed_floor_count != null ? String(eng.building_plan.licensed_floor_count) : ''
    );
    setElectricalRoomsCount(
      eng.building_plan.electrical_rooms_count != null ? String(eng.building_plan.electrical_rooms_count) : ''
    );
    setBuildingHeight(eng.building_plan.building_height_m || '');
    setBuildingUse(eng.building_plan.building_use || '');
    setBuildingType(eng.building_plan.building_type_code || '');
    baselineSyncPendingRef.current = true;
    setBaselineRevision((revision) => revision + 1);
    return () => {
      active = false;
    };
  }, [client, department, pricePerM2]);

  const currentDraftSnapshot = JSON.stringify({
    quotationNumber,
    quotationAmount,
    quotationStatus,
    financialStatus,
    paymentReference,
    paidAmount,
    quotationVisitsCount,
    quotationServices,
    quotationDocuments,
    salesPaymentType,
    assignedEngineer,
    engineeringStatus,
    engineeringNotes,
    visitDate,
    visitStatus,
    checklist,
    finalReportStatus,
    licenseNumber,
    licenseExpiryDate,
    ownerName,
    phone,
    region,
    city,
    citySelection,
    manualCity,
    districtSelection,
    district,
    manualDistrict,
    street,
    plotNumber,
    commercialRegister,
    clientTaxNumber,
    clientKind,
    nationalAddress,
    businessName,
    activityType,
    landArea,
    projectStatus,
    floorLevels,
    buildingPermitNumber,
    buildingPermitDate,
    buildingPermitDateHijri,
    hijriDay,
    hijriMonth,
    hijriYear,
    buildingPermitExpiryDate,
    permitType,
    municipality,
    subMunicipality,
    planNumber,
    sketchNumber,
    deedNumber,
    northing,
    easting,
    licensedFloorCount,
    buildingHeight,
    buildingUse,
    buildingType,
    electricalRoomsCount,
  });

  useEffect(() => {
    if (!client || !baselineSyncPendingRef.current) return;
    baselineSyncPendingRef.current = false;
    persistedSnapshotRef.current = currentDraftSnapshot;
    setIsDirty(false);
  }, [baselineRevision, client, currentDraftSnapshot]);

  useEffect(() => {
    if (!hijriDay || !hijriMonth || !hijriYear) {
      setHijriConversionError('');
      return;
    }
    const converted = hijriToGregorian({
      day: Number(hijriDay),
      month: Number(hijriMonth),
      year: Number(hijriYear),
    });
    if (converted) {
      setBuildingPermitDate(converted);
      setBuildingPermitDateHijri(formatHijriParts({
        day: Number(hijriDay),
        month: Number(hijriMonth),
        year: Number(hijriYear),
      }));
      setHijriConversionError('');
    } else {
      setHijriConversionError('تعذر تحويل التاريخ — راجع التاريخ الهجري');
    }
  }, [hijriDay, hijriMonth, hijriYear]);

  const subtotal = parseLocalizedNumber(quotationAmount);
  const vatAmount = useMemo(() => calculateVatAmount(subtotal), [subtotal]);
  const totalAmount = useMemo(() => calculateTotalAmount(subtotal), [subtotal]);

  const engineeringUnlocked = canAccessEngineeringWorkflow(financialStatus);
  const reportsUnlocked = canAccessReportsWorkflow(engineeringStatus);
  const quotationIsIssued = Boolean(quotationNumber && quotationStatus !== 'مسودة');
  const quotationLocked = contractLinked || contractCheckLoading || (quotationIsIssued && !quotationEditMode);

  if (!client) return null;

  const requestClose = () => {
    if (saving) return;
    const hasSnapshotChanges =
      persistedSnapshotRef.current !== null && currentDraftSnapshot !== persistedSnapshotRef.current;
    if (isDirty || hasSnapshotChanges) {
      setUnsavedWarningOpen(true);
      return;
    }
    onClose();
  };

  const handleInvoicePromptClose = () => {
    setInvoicePromptOpen(false);
    setPromptInvoice(null);
    requestClose();
  };

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

  const visibleTabs = tabs.filter((tab) =>
    isPagePresentation ? tab.id === 'basic' : DEPARTMENT_TABS[department].includes(tab.id)
  );

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

      const nextClient = { ...client, ...merged } as ClientRecord;
      // Persistence is complete only after the saved row has been propagated to the parent list.
      // The sales list can update this one row without reloading the full bundle.
      try {
        await onUpdated(nextClient);
      } catch {
        // The next open still reads from Supabase/local fallback; keep the successful save.
      }

      const quotationApprovedNow = ['معتمد', 'بانتظار السداد'].includes(
        String(finalPayload.quotation_status || quotationStatus)
      );
      const financiallyApprovedNow = ['تم السداد', 'معتمد مالياً'].includes(
        String(finalPayload.financial_status || financialStatus)
      );
      const mayNeedInvoicePrompt =
        (quotationApprovedNow || financiallyApprovedNow) && Number(merged.quotation_amount || 0) > 0;

      // Keep the modal open so the user can see the successful persistence confirmation.
      baselineSyncPendingRef.current = true;
      setBaselineRevision((revision) => revision + 1);
      setIsDirty(false);
      setSuccessMessage('تم حفظ البيانات بنجاح');

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

      })();

      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'حدث خطأ غير متوقع');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handlePrintQuotation = async () => {
    const printableClient = {
      ...mergeLocalClientOverrides(client),
      quotation_number: quotationNumber || client.quotation_number,
      quotation_amount: subtotal || client.quotation_amount,
      quotation_services: quotationServices,
      quotation_visits_count: Math.max(1, parseLocalizedNumber(quotationVisitsCount) || 1),
      quotation_status: quotationStatus,
    } as ClientRecord;
    const validationError = validateSavedQuotationForPrint(printableClient);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    setErrorMessage(null);
    const result = await printSavedQuotation(printableClient);
    if (result.error) setErrorMessage(result.error);
    else setSuccessMessage('تم فتح معاينة عرض السعر');
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
    const nextQuotationNumber = quotationNumber || (await generateQuotationNumber());
    setQuotationNumber(nextQuotationNumber);
    const nextVat = calculateVatAmount(amount);
    const nextTotal = calculateTotalAmount(amount);
    await saveUpdate(
      {
        quotation_number: nextQuotationNumber,
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
  const availableCities = getCities(region);
  const effectiveCity = citySelection === 'أخرى' ? manualCity.trim() : citySelection || city;
  const availableDistricts = getDistricts(region, effectiveCity);
  const effectiveDistrict = districtSelection === 'أخرى' ? manualDistrict.trim() : districtSelection || district;
  const cityOptions = city && !availableCities.includes(city) ? [city, ...availableCities] : availableCities;
  const districtOptions = district && !availableDistricts.includes(district)
    ? [district, ...availableDistricts]
    : availableDistricts;
  const hasVerifiedCities = availableCities.length > 0;
  const hasVerifiedDistricts = availableDistricts.length > 0;

  const handleSaveBasic = async () => {
    if (!/^05\d{8}$/.test(phone.replace(/\s+/g, ''))) {
      setErrorMessage('رقم الجوال غير صحيح. يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.');
      return;
    }
    const actualCity = citySelection === 'أخرى' ? manualCity.trim() : citySelection || city.trim();
    const actualDistrict = districtSelection === 'أخرى' ? manualDistrict.trim() : districtSelection || district.trim();
    const usesManualCity = citySelection === 'أخرى';
    const usesManualDistrict = districtSelection === 'أخرى';
    if (!region || !actualCity || !actualDistrict) {
      setErrorMessage('أكمل المنطقة والمدينة والحي.');
      return;
    }
    if ((!usesManualCity && !usesManualDistrict) && !isValidLocation(region, actualCity, actualDistrict)) {
      setErrorMessage('المدينة أو الحي لا يتبعان المنطقة المختارة.');
      return;
    }
    if ((northing && !/^[-+]?\d+(?:[.,]\d+)?$/.test(northing)) || (easting && !/^[-+]?\d+(?:[.,]\d+)?$/.test(easting))) {
      setErrorMessage('أدخل الشماليات والشرقيات كأرقام صحيحة أو عشرية فقط.');
      return;
    }
    if (!activityType) {
      setErrorMessage('اختر نوع النشاط لربط الاشتراطات.');
      return;
    }
    if (electricalRoomsCount && !/^\d+$/.test(electricalRoomsCount)) {
      setErrorMessage('عدد غرف الكهرباء يجب أن يكون رقمًا صحيحًا أكبر من أو يساوي صفر.');
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
        formatHijriParts({ day: Number(hijriDay), month: Number(hijriMonth), year: Number(hijriYear) }) ||
        buildingPermitDateHijri.trim() || eng.building_plan.building_permit_date_hijri,
      manual_city: citySelection === 'أخرى' ? manualCity.trim() || null : null,
      manual_district: districtSelection === 'أخرى' ? manualDistrict.trim() || null : null,
      building_permit_expiry_date: buildingPermitExpiryDate.trim() || null,
      permit_type: permitType.trim() || null,
      municipality: municipality.trim() || null,
      sub_municipality: subMunicipality.trim() || null,
      plan_number: planNumber.trim() || null,
      sketch_number: sketchNumber.trim() || null,
      deed_number: deedNumber.trim() || null,
      northing: northing.trim() || null,
      easting: easting.trim() || null,
      licensed_floor_count: licensedFloorCount ? parseLocalizedInteger(licensedFloorCount) : null,
      electrical_rooms_count: electricalRoomsCount ? parseLocalizedInteger(electricalRoomsCount) : null,
      building_height_m: buildingHeight.trim() || null,
      building_use: buildingUse.trim() || null,
      building_type_code: buildingType.trim() || null,
    };
    const technical_report = {
      ...eng.technical_report,
      building_permit_number:
        buildingPermitNumber.trim() || eng.technical_report.building_permit_number,
      building_permit_date: buildingPermitDate.trim() || eng.technical_report.building_permit_date,
    };

    return await saveUpdate(
      {
        owner_name: ownerName.trim(),
        phone: phone.replace(/\s+/g, ''),
        region,
        city: actualCity,
        district: actualDistrict,
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
        project_engineering_data: mergeProjectEngineeringData(eng, { building_plan, technical_report }),
      },
      'تم حفظ البيانات الأساسية وتفصيل الأدوار وبيانات رخصة البناء.'
    );
  };

  return (
    <div className={isPagePresentation ? 'min-h-screen bg-slate-50' : 'fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4'}>
      <div className={isPagePresentation ? 'min-h-screen w-full bg-white' : 'bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-4xl max-h-[94vh] overflow-hidden flex flex-col'}>
        <div className="p-6 border-b">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{isPagePresentation ? 'البيانات الأساسية للعميل' : 'متابعة معاملة العميل'}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {client.business_name || client.name} — {client.client_code}
              </p>
            </div>
            {isPagePresentation ? (
              <button type="button" onClick={requestClose} disabled={saving} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">
                العودة
              </button>
            ) : (
              <button onClick={requestClose} disabled={saving} className="text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-40">
                ×
              </button>
            )}
          </div>

          <WorkflowStepper client={{ ...client, financial_status: financialStatus, engineering_status: engineeringStatus, quotation_amount: subtotal, quotation_number: quotationNumber || client.quotation_number }} />

          {!isPagePresentation && <div className="flex flex-wrap gap-2 mt-4">
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
          </div>}
        </div>

        <div className={isPagePresentation ? 'p-4 sm:p-6 pb-28' : 'p-6 overflow-y-auto flex-1'}>
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
          {unsavedWarningOpen && (
            <div role="alertdialog" aria-modal="true" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">لديك تغييرات غير محفوظة. هل تريد الخروج بدون حفظ؟</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setUnsavedWarningOpen(false)} className="rounded-lg bg-white px-3 py-2 font-semibold border border-amber-200">متابعة التعديل</button>
                <button type="button" onClick={onClose} className="rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white">خروج دون حفظ</button>
              </div>
            </div>
          )}

          {activeTab === 'basic' && (
            <div className="space-y-5 text-sm" onChange={() => setIsDirty(true)}>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 space-y-3">
                <div>
                  <p className="text-sm font-bold text-emerald-950">المرفقات والمستندات</p>
                  <p className="text-[11px] text-emerald-800/80 mt-0.5">
                    أرفق المستندات لمراجعتها يدويًا، ثم أدخل بيانات الرخصة في الأقسام التالية.
                  </p>
                </div>
                <QuotationDocumentsUpload
                  value={quotationDocuments}
                  clientId={client.id}
                  disabled={saving}
                  onChange={(next) => {
                    setIsDirty(true);
                    setQuotationDocuments(next);
                    void updateClientSafe(client.id, { quotation_documents: next }).then((result) => {
                      if (result.error) {
                        setErrorMessage(result.error);
                        return;
                      }
                      setErrorMessage(null);
                      onUpdated({ ...client, quotation_documents: next });
                    });
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">بيانات الموقع والعنوان</div>
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
                      setCitySelection('');
                      setManualCity('');
                      setDistrict('');
                      setDistrictSelection('');
                      setManualDistrict('');
                      setStreet('');
                    }}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white"
                  >
                    <option value="">اختر المنطقة</option>
                    {getRegions().map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">المدينة</label>
                  <select
                    value={citySelection}
                    disabled={!region}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCitySelection(next);
                      setCity(next === 'أخرى' ? '' : next);
                      setManualCity(next === 'أخرى' ? manualCity : '');
                      setDistrict('');
                      setDistrictSelection('');
                      setManualDistrict('');
                      setStreet('');
                    }}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">اختر المدينة</option>
                    {cityOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                    <option value="أخرى">أخرى</option>
                  </select>
                  {region && !hasVerifiedCities ? (
                    <p className="mt-1 text-[11px] text-amber-700">بيانات المدن لهذه المنطقة لم تُربط بعد بمصدر موثوق.</p>
                  ) : null}
                  {citySelection === 'أخرى' ? (
                    <input
                      value={manualCity}
                      onChange={(e) => setManualCity(e.target.value)}
                      className="mt-2 w-full p-2.5 border rounded-xl text-sm"
                      placeholder="اسم المدينة"
                    />
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">الحي</label>
                  <select
                    value={districtSelection}
                    disabled={!effectiveCity}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDistrictSelection(next);
                      setDistrict(next === 'أخرى' ? '' : next);
                      setManualDistrict(next === 'أخرى' ? manualDistrict : '');
                      setStreet('');
                    }}
                    className="w-full p-2.5 border rounded-xl text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">اختر الحي</option>
                    {districtOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                    <option value="أخرى">أخرى</option>
                  </select>
                  {effectiveCity && !hasVerifiedDistricts ? (
                    <p className="mt-1 text-[11px] text-amber-700">بيانات الأحياء لهذه المدينة لم تُربط بعد بمصدر موثوق.</p>
                  ) : null}
                  {districtSelection === 'أخرى' ? (
                    <input
                      value={manualDistrict}
                      onChange={(e) => setManualDistrict(e.target.value)}
                      className="mt-2 w-full p-2.5 border rounded-xl text-sm"
                      placeholder="اسم الحي"
                    />
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">اسم الشارع</label>
                  <input
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm"
                    placeholder="أدخل اسم الشارع"
                  />
                  <p className="mt-1 text-[11px] text-amber-700">بيانات الشوارع غير متاحة حاليًا من مصدر موثوق.</p>
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">البلدية الفرعية</label>
                  <input value={subMunicipality} onChange={(e) => setSubMunicipality(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">رقم المخطط</label>
                  <input value={planNumber} onChange={(e) => setPlanNumber(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">رقم الكروكي</label>
                  <input value={sketchNumber} onChange={(e) => setSketchNumber(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">رقم الصك</label>
                  <input value={deedNumber} onChange={(e) => setDeedNumber(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">الشماليات (Northing)</label>
                  <NumericInput mode="decimal" value={northing} onChange={setNorthing} className="w-full p-2.5 border rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">الشرقيات (Easting)</label>
                  <NumericInput mode="decimal" value={easting} onChange={setEasting} className="w-full p-2.5 border rounded-xl text-sm" />
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
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">بيانات رخصة البناء</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">رقم رخصة البناء</label>
                    <input value={buildingPermitNumber} onChange={(e) => setBuildingPermitNumber(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">تاريخ الرخصة (ميلادي)</label>
                    <input type="date" value={buildingPermitDate} readOnly className="w-full p-2.5 border rounded-xl text-sm bg-gray-100" />
                    {hijriConversionError ? <p className="mt-1 text-[11px] text-red-700">{hijriConversionError}</p> : null}
                  </div>
                  <div className="md:col-span-2 relative">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">تاريخ الرخصة (هجري)</label>
                    <button
                      type="button"
                      onClick={() => setHijriPickerOpen((open) => !open)}
                      className="w-full p-2.5 border rounded-xl text-sm bg-white text-right"
                      aria-label="فتح تاريخ الرخصة الهجري"
                    >
                      {buildingPermitDateHijri || 'اختر التاريخ الهجري'}
                    </button>
                    {hijriPickerOpen ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select value={hijriDay} onChange={(e) => setHijriDay(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                            <option value="">اليوم</option>
                            {Array.from({ length: 30 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
                          </select>
                          <select value={hijriMonth} onChange={(e) => setHijriMonth(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                            <option value="">الشهر</option>
                            {HIJRI_MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                          </select>
                          <select value={hijriYear} onChange={(e) => setHijriYear(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                            <option value="">السنة</option>
                            {Array.from({ length: 101 }, (_, index) => 1350 + index).map((year) => <option key={year} value={year}>{year}</option>)}
                          </select>
                        </div>
                        <button type="button" onClick={() => setHijriPickerOpen(false)} className="mt-2 text-xs text-indigo-700 hover:underline">تم</button>
                      </div>
                    ) : null}
                    {hijriConversionError ? <p className="mt-1 text-[11px] text-red-700">{hijriConversionError}</p> : null}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">صلاحية الرخصة</label>
                    <input type="date" value={buildingPermitExpiryDate} onChange={(e) => setBuildingPermitExpiryDate(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">نوع الرخصة</label>
                    <select value={permitType} onChange={(e) => setPermitType(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                      <option value="">اختر نوع الرخصة</option><option value="جديدة">جديدة</option><option value="تجديد">تجديد</option><option value="تعديل">تعديل</option><option value="أخرى">أخرى</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">بيانات النشاط والمبنى</div>
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">النشاط الفرعي / الرئيسي</label>
                  <select value={buildingUse} onChange={(e) => setBuildingUse(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                    <option value="">اختر استخدام المبنى</option>
                    <option value="سكني">سكني</option>
                    <option value="تجاري">تجاري</option>
                    <option value="مجمع تجاري">مجمع تجاري</option>
                    <option value="إداري">إداري</option>
                    <option value="صناعي">صناعي</option>
                    <option value="تعليمي">تعليمي</option>
                    <option value="مواقف">مواقف</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">نوع المبنى</label>
                  <select value={buildingType} onChange={(e) => setBuildingType(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                    <option value="">اختر نوع المبنى</option>
                    <option value="مبنى مستقل">مبنى مستقل</option>
                    <option value="مجمع">مجمع</option>
                    <option value="مبنى متعدد الاستخدام">مبنى متعدد الاستخدام</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">ارتفاع المبنى (م)</label>
                  <NumericInput mode="decimal" value={buildingHeight} onChange={setBuildingHeight} className="w-full p-2.5 border rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">عدد الأدوار المرخص</label>
                  <NumericInput value={licensedFloorCount} onChange={setLicensedFloorCount} className="w-full p-2.5 border rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">عدد غرف الكهرباء</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={electricalRoomsCount}
                    onChange={(e) => setElectricalRoomsCount(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
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

              <FloorLevelsEditor
                levels={floorLevels}
                onChange={setFloorLevels}
                maxFloors={activityRule?.maxFloors}
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-bold text-slate-900">ملخص البيانات</h3>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                  <div><span className="text-slate-500">مساحة الأرض:</span> <strong>{landArea || '—'} م²</strong></div>
                  <div><span className="text-slate-500">إجمالي مساحة المبنى:</span> <strong>{computedBuildingArea || '—'} م²</strong></div>
                  <div><span className="text-slate-500">عدد الأدوار المرخص:</span> <strong>{licensedFloorCount || '—'}</strong></div>
                  <div><span className="text-slate-500">عدد مستويات النموذج:</span> <strong>{computedFloorsCount || '—'}</strong></div>
                </div>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900">اشتراطات مرتبطة بالخيارات</h3>
                <p className="text-xs text-slate-500">تظهر بعد اكتمال الموقع والرخصة والنشاط وبيانات المبنى والأدوار.</p>
                <ActivityRequirementsPanel
                  activityType={activityType}
                  floorsCount={licensedFloorCount ? parseLocalizedInteger(licensedFloorCount) : computedFloorsCount}
                  buildingArea={computedBuildingArea}
                  landArea={parseLocalizedInteger(landArea)}
                  electricalRoomsCount={electricalRoomsCount ? parseLocalizedInteger(electricalRoomsCount) : null}
                  floorLevels={floorLevels}
                />
              </section>

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveBasic()}
                className="w-full md:w-auto bg-[#635bdb] text-white rounded-xl px-5 py-2.5 font-semibold disabled:opacity-60"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ البيانات الأساسية'}
              </button>
              {isPagePresentation && onSaveAndContinue && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const saved = await handleSaveBasic();
                    if (saved) await onSaveAndContinue();
                  }}
                  className="w-full md:w-auto border border-[#635bdb] text-[#635bdb] rounded-xl px-5 py-2.5 font-semibold disabled:opacity-60"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ ومتابعة'}
                </button>
              )}
            </div>
          )}

          {activeTab === 'finance' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm">
                <div>
                  <p className="font-semibold text-indigo-950">دورة عرض السعر</p>
                  <p className="text-xs text-indigo-800/80">
                    {contractLinked ? 'لا يمكن تعديل عرض السعر بعد إصدار العقد.' : quotationIsIssued ? 'العرض صادر ويمكن تعديله قبل إنشاء العقد.' : 'المسودة قابلة للتحرير قبل الإصدار.'}
                  </p>
                </div>
                {contractLinked ? (
                  <button type="button" disabled className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">تعديل عرض السعر (مقفل)</button>
                ) : quotationIsIssued && !quotationEditMode ? (
                  <button type="button" onClick={() => setQuotationEditMode(true)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">تعديل عرض السعر</button>
                ) : null}
              </div>
              <fieldset disabled={quotationLocked} onChange={() => setIsDirty(true)} className="space-y-4 disabled:opacity-70">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">رقم عرض السعر</label>
                  <input
                    readOnly
                    value={quotationNumber || 'يُصدر تلقائياً عند الإنشاء (Q-YYYY-NNN)'}
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
                  onClick={() => void handleCreateQuotation()}
                  disabled={saving || quotationLocked}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'جاري الحفظ...' : quotationStatus === 'مسودة' ? 'حفظ المسودة' : 'إصدار عرض السعر'}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePrintQuotation()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"
                >
                  طباعة عرض السعر
                </button>
              </div>

              </fieldset>
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
            </>
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

      <InvoicePromptModal
        open={invoicePromptOpen}
        message={invoicePromptMessage}
        invoice={promptInvoice}
        loading={invoiceBusy}
        onClose={handleInvoicePromptClose}
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
      {isPagePresentation && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <span className="text-xs text-slate-500">تُحفظ البيانات في السجل المستمر قبل متابعة المرحلة التالية.</span>
            <button type="button" disabled={saving} onClick={() => void handleSaveBasic()} className="rounded-xl bg-[#635bdb] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : 'حفظ البيانات الأساسية'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
