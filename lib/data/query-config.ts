/** حدود الجلب الافتراضية لقوائم الواجهة — تقلّل زمن الاستجابة وحجم الـ payload */
export const LIST_PAGE_SIZE = 20;

/** قائمة المشاريع يجب أن تجلب المعتمدين مالياً مباشرة (لا أحدث N عميل ثم تصفية) */
export const PROJECTS_PAGE_SIZE = 500;

/** حجم أكبر قليلاً لأرشيف المستندات / السندات */
export const ARCHIVE_PAGE_SIZE = 40;

/** أعمدة قائمة العملاء بدون الحقول الثقيلة (صور base64 داخل JSON الهندسي) */
export const CLIENT_LIST_COLUMNS = [
  'id',
  'client_code',
  'name',
  'business_name',
  'owner_name',
  'phone',
  'city',
  'region',
  'district',
  'activity_type',
  'pipeline_stage',
  'project_status',
  'financial_status',
  'engineering_status',
  'quotation_status',
  'quotation_number',
  'quotation_amount',
  'vat_amount',
  'total_amount',
  'paid_amount',
  'credit_balance',
  'sales_payment_type',
  'assigned_engineer',
  'quotation_visits_count',
  'final_report_status',
  'license_number',
  'created_at',
  'updated_at',
].join(',');

/** أعمدة قائمة المشاريع — تشمل JSON التقارير لحساب نسبة الاكتمال فقط عند الحاجة */
export const PROJECT_LIST_COLUMNS = `${CLIENT_LIST_COLUMNS},project_engineering_data`;

export const SWR_DEFAULTS = {
  revalidateOnFocus: false,
  revalidateIfStale: true,
  dedupingInterval: 8_000,
  keepPreviousData: true,
} as const;
