import { VAT_RATE } from '@/lib/constants/clients';
import {
  APPROVED_FINANCIAL_STATUSES,
  RESTRICTED_ENGINEERING_STATUSES,
} from '@/lib/business/workflow-stages';

export {
  WORKFLOW_STAGES,
  canAccessEngineeringWorkflow,
  canAccessReportsWorkflow,
  canScheduleFieldVisit,
  getWorkflowStage,
  getWorkflowStageIndex,
  hasQuotation,
  isEngineeringComplete,
  isFinancialApproved,
} from '@/lib/business/workflow-stages';
export type { WorkflowStageId } from '@/lib/business/workflow-stages';

export function calculateVatAmount(subtotal: number): number {
  return Math.round(subtotal * VAT_RATE * 100) / 100;
}

export function calculateTotalAmount(subtotal: number): number {
  return Math.round((subtotal + calculateVatAmount(subtotal)) * 100) / 100;
}

export function canAdvanceEngineeringStatus(
  financialStatus: string | null | undefined,
  engineeringStatus: string
): string | null {
  if (!RESTRICTED_ENGINEERING_STATUSES.includes(engineeringStatus as (typeof RESTRICTED_ENGINEERING_STATUSES)[number])) {
    return null;
  }

  if (
    !financialStatus ||
    !APPROVED_FINANCIAL_STATUSES.includes(financialStatus as (typeof APPROVED_FINANCIAL_STATUSES)[number])
  ) {
    return `لا يمكن تحويل حالة الشؤون الهندسية إلى "${engineeringStatus}" إلا إذا كانت حالة الاعتماد المالي "تم السداد" أو "معتمد مالياً".`;
  }

  return null;
}

export function generateQuotationNumber(): string {
  return `QT-${Date.now().toString().slice(-8)}`;
}

export function generateInvoiceNumber(sequence: number): string {
  return `INV-${2026000 + sequence}`;
}

export function mapDocumentFilterStatus(
  status: string,
  financialStatus?: string | null,
  quotationStatus?: string | null
): 'معتمدة' | 'بانتظار السداد' | 'ملغاة' | 'أخرى' {
  const normalized = status.trim();

  if (['ملغي', 'ملغاة', 'مرفوض'].includes(normalized) || financialStatus === 'مرفوض' || quotationStatus === 'ملغي') {
    return 'ملغاة';
  }

  if (
    ['معتمد', 'معتمدة', 'معتمد مالياً', 'تم السداد', 'مدفوعة بالكامل'].includes(normalized) ||
    financialStatus === 'معتمد مالياً' ||
    financialStatus === 'تم السداد'
  ) {
    return 'معتمدة';
  }

  if (
    ['بانتظار السداد', 'بانتظار الدفعة', 'غير مدفوعة', 'مسودة'].includes(normalized) ||
    financialStatus === 'بانتظار الدفعة' ||
    quotationStatus === 'بانتظار السداد'
  ) {
    return 'بانتظار السداد';
  }

  return 'أخرى';
}
