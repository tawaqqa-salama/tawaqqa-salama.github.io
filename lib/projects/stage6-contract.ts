import type { ProjectEngineeringData, ReportMeta } from '@/lib/types/project-reports';

/**
 * Stage 6A contract for the two existing singleton documents only.
 *
 * This intentionally does not add a correspondence model, attachments, snapshots,
 * recipients, or lifecycle values beyond the current report statuses. The SQL RPC
 * mirrors the same minimum contract against canonical persisted JSONB.
 */

const APPROVABLE_STATUSES: ReportMeta['status'][] = ['مكتمل', 'معتمد'];

export type Stage6ApprovalBlockerCode =
  | 'STAGE6_ENGINEERING_DELIVERY_INCOMPLETE'
  | 'STAGE6_CD_COVER_LETTER_INCOMPLETE';

export type Stage6ApprovalBlocker = {
  code: Stage6ApprovalBlockerCode;
  message: string;
  missing: string[];
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validIsoDate(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

function approvableStatus(value: unknown): boolean {
  return APPROVABLE_STATUSES.includes(value as ReportMeta['status']);
}

/**
 * Required fields are deliberately the smallest defensible issuance contract:
 * a completed document, an issuance date, an addressee, an outgoing reference,
 * and named engineering/office responsibility. Notes, copy recipients, permit
 * details, titles, and attachment count remain optional in Stage 6A.
 */
export function getStage6ApprovalBlockers(
  data: Pick<ProjectEngineeringData, 'engineering_delivery' | 'cd_cover_letter'>
): Stage6ApprovalBlocker[] {
  const delivery = data.engineering_delivery;
  const cover = data.cd_cover_letter;
  const deliveryMissing: string[] = [];
  const coverMissing: string[] = [];

  if (!delivery || typeof delivery !== 'object') {
    deliveryMissing.push('بيانات خطاب تسليم الدراسة');
  } else {
    if (!approvableStatus(delivery.status)) deliveryMissing.push('حالة الخطاب المكتملة');
    if (!validIsoDate(delivery.delivery_date)) deliveryMissing.push('تاريخ التسليم');
    if (!text(delivery.delivered_to)) deliveryMissing.push('جهة التسليم');
    if (!text(delivery.outgoing_number)) deliveryMissing.push('رقم الخطاب الصادر');
    if (!text(delivery.safety_engineer_name)) deliveryMissing.push('اسم مهندس السلامة');
    if (!text(delivery.manager_name)) deliveryMissing.push('اسم مدير المكتب');
  }

  if (!cover || typeof cover !== 'object') {
    coverMissing.push('بيانات خطاب الدفاع المدني');
  } else {
    if (!approvableStatus(cover.status)) coverMissing.push('حالة الخطاب المكتملة');
    if (!validIsoDate(cover.letter_date)) coverMissing.push('تاريخ الخطاب');
    if (!text(cover.addressee)) coverMissing.push('جهة التوجيه');
    if (!text(cover.outgoing_number)) coverMissing.push('رقم الخطاب الصادر');
    if (!text(cover.safety_engineer_name)) coverMissing.push('اسم مهندس السلامة');
    if (!text(cover.manager_name)) coverMissing.push('اسم مدير المكتب');
  }

  const blockers: Stage6ApprovalBlocker[] = [];
  if (deliveryMissing.length) {
    blockers.push({
      code: 'STAGE6_ENGINEERING_DELIVERY_INCOMPLETE',
      message: `بيانات خطاب تسليم الدراسة غير مكتملة: ${deliveryMissing.join('، ')}.`,
      missing: deliveryMissing,
    });
  }
  if (coverMissing.length) {
    blockers.push({
      code: 'STAGE6_CD_COVER_LETTER_INCOMPLETE',
      message: `بيانات خطاب الدفاع المدني غير مكتملة: ${coverMissing.join('، ')}.`,
      missing: coverMissing,
    });
  }
  return blockers;
}

export function isStage6ContractSatisfied(
  data: Pick<ProjectEngineeringData, 'engineering_delivery' | 'cd_cover_letter'>
): boolean {
  return getStage6ApprovalBlockers(data).length === 0;
}

export const STAGE6_REQUIRED_FIELD_NOTES = {
  engineering_delivery: [
    'status: يجب أن تكون مكتمل أو معتمد',
    'delivery_date: يثبت تاريخ التسليم',
    'delivered_to: يثبت جهة التسليم',
    'outgoing_number: مرجع الوثيقة الصادرة',
    'safety_engineer_name: مسؤولية هندسية ظاهرة في الوثيقة',
    'manager_name: مسؤولية المكتب ظاهرة في الوثيقة',
  ],
  cd_cover_letter: [
    'status: يجب أن تكون مكتمل أو معتمد',
    'letter_date: يثبت تاريخ الخطاب',
    'addressee: يثبت جهة التوجيه',
    'outgoing_number: مرجع الوثيقة الصادرة',
    'safety_engineer_name: مسؤولية هندسية ظاهرة في الوثيقة',
    'manager_name: مسؤولية المكتب ظاهرة في الوثيقة',
  ],
} as const;
