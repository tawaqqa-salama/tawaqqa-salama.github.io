'use client';

import { useEffect, useMemo, useState } from 'react';
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
import type { ClientRecord, DepartmentMode, FloorLevel, InspectionChecklistItem } from '@/lib/types/client';

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
  const [nationalAddress, setNationalAddress] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [activityType, setActivityType] = useState('');
  const [landArea, setLandArea] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [floorLevels, setFloorLevels] = useState<FloorLevel[]>([]);

  useEffect(() => {
    if (!client) return;
    const allowed = DEPARTMENT_TABS[department];
    const preferred = DEFAULT_TAB[department] || allowed[0] || 'basic';
    setActiveTab(allowed.includes(preferred) ? preferred : allowed[0]);
    setErrorMessage(null);
    setSuccessMessage(null);
    setQuotationAmount(client.quotation_amount ? String(client.quotation_amount) : '');
    setQuotationStatus(client.quotation_status || 'مسودة');
    setFinancialStatus(client.financial_status || 'بانتظار الدفعة');
    setPaymentReference(client.payment_reference || '');
    setPaidAmount(client.paid_amount ? String(client.paid_amount) : '');
    setQuotationVisitsCount(String(client.quotation_visits_count || 1));
    setSalesPaymentType((client.sales_payment_type as 'نقدي' | 'آجل') || 'نقدي');
    setAssignedEngineer(client.assigned_engineer || '');
    setEngineeringStatus(client.engineering_status || 'جديد');
    setEngineeringNotes(client.engineering_notes || '');
    setVisitDate(client.visit_date ? client.visit_date.slice(0, 16) : '');
    setVisitStatus(client.visit_status || 'لم تُجدول');
    setChecklist(normalizeChecklist(client.inspection_checklist));
    setFinalReportStatus(client.final_report_status || 'قيد الإعداد');
    setLicenseNumber(client.license_number || '');
    setLicenseExpiryDate(client.license_expiry_date || '');
    setOwnerName(client.owner_name || '');
    setPhone(client.phone || '');
    setRegion(client.region || '');
    setCity(client.city || '');
    setDistrict(client.district || '');
    setStreet(client.street || '');
    setPlotNumber(client.plot_number || '');
    setNationalAddress(client.national_address || '');
    setBusinessName(client.business_name || '');
    setActivityType(client.activity_type || '');
    setLandArea(client.land_area != null ? String(client.land_area) : '');
    setProjectStatus(client.project_status || '');
    setFloorLevels(ensureFloorLevels(client.floor_levels, client.floors_count, client.building_area));
  }, [client, department]);

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
      const { error } = await supabase.from('clients').update(merged).eq('id', client.id);
      if (error) {
        setErrorMessage(error.message);
        return false;
      }

      const newStage = merged.pipeline_stage;
      let message = successText;
      if (department === 'sales' && ['معتمد', 'بانتظار السداد'].includes(String(finalPayload.quotation_status || quotationStatus))) {
        message += ' — تم توليد سند القبض والقيد المحاسبي تلقائياً.';
      }
      if (newStage && newStage !== previousStage) {
        message += ` — تم نقل المعاملة تلقائياً إلى: ${getPipelineStageLabel(newStage)}`;
      }
      setSuccessMessage(message);
      onUpdated();
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'حدث خطأ غير متوقع');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCreateQuotation = async () => {
    if (subtotal <= 0) {
      setErrorMessage('يرجى إدخال مبلغ عرض السعر الأساسي.');
      return;
    }
    const visitsCount = Math.max(1, Math.min(10, parseLocalizedNumber(quotationVisitsCount) || 1));
    const engineeringData = syncProjectVisitsFromQuotation(
      parseProjectEngineeringData(client.project_engineering_data),
      visitsCount
    );
    await saveUpdate(
      {
        quotation_number: client.quotation_number || generateQuotationNumber(),
        quotation_amount: subtotal,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        quotation_status: quotationStatus,
        quotation_visits_count: visitsCount,
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
  const availableDistricts =
    region && city && REGION_DATA[region]?.[city] ? REGION_DATA[region][city] : [];

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

    await saveUpdate(
      {
        owner_name: ownerName.trim(),
        phone: phone.replace(/\s+/g, ''),
        region,
        city,
        district,
        street: street.trim() || null,
        plot_number: plotNumber.trim() || null,
        national_address: nationalAddress.trim() || null,
        business_name: businessName.trim() || ownerName.trim(),
        name: businessName.trim() || ownerName.trim(),
        activity_type: activityType,
        land_area: land,
        building_area: computedBuildingArea,
        floors_count: computedFloorsCount,
        floor_levels: floorLevels,
        project_status: projectStatus || null,
      },
      'تم حفظ البيانات الأساسية وتفصيل الأدوار.'
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
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
                className="w-full md:w-auto bg-[#1f4d3a] text-white rounded-xl px-5 py-2.5 font-semibold disabled:opacity-60"
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
                    value={client.quotation_number || 'لم يُنشأ بعد'}
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

              <button
                type="button"
                onClick={handleCreateQuotation}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'إنشاء / تحديث عرض السعر'}
              </button>

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

              <button
                type="button"
                onClick={handleSaveFinance}
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الحالة المالية'}
              </button>
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
    </div>
  );
}

