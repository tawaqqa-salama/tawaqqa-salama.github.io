/** حدود الجلب الافتراضية لقوائم الواجهة — تقلّل زمن الاستجابة وحجم الـ payload */
export const LIST_PAGE_SIZE = 20;

/** حجم صفحة المشاريع */
export const PROJECTS_PAGE_SIZE = 25;
export const MARKETING_PAGE_SIZE = 25;

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
].join(',');

/**
 * قائمة المشاريع تستعمل ملخص الحقول المحفوظة فقط. لا تضف أي JSON هندسي أو مرفقات هنا؛
 * تفاصيل الهندسة تُحمّل عند فتح المشروع وحده.
 */
export const PROJECT_LIST_COLUMNS = CLIENT_LIST_COLUMNS;

/**
 * حقول نموذج البيانات الأساسية فقط. الحقول الهندسية الكاملة تُحمّل كسولًا عند طلب
 * قسم الرخصة/الهندسة، وتُحفظ بنمط patch كي لا تُستبدل بيانات غير محملة.
 */
export const CLIENT_BASIC_COLUMNS = [
  'id',
  'company_id',
  'client_code',
  'name',
  'owner_name',
  'phone',
  'region',
  'city',
  'district',
  'street',
  'plot_number',
  'tax_number',
  'national_address',
  'business_name',
  'activity_type',
  'land_area',
  'building_area',
  'floors_count',
  'floor_levels',
  'project_status',
  'pipeline_stage',
  'financial_status',
  'engineering_status',
  'final_report_status',
  'license_number',
  'license_expiry_date',
  'created_at',
].join(',');

/** حقول أول شاشة عرض السعر، من دون تقارير هندسية أو snapshots أو تصميمات. */
export const CLIENT_QUOTATION_COLUMNS = [
  'id',
  'company_id',
  'client_code',
  'name',
  'owner_name',
  'phone',
  'region',
  'city',
  'district',
  'street',
  'plot_number',
  'tax_number',
  'national_address',
  'business_name',
  'activity_type',
  'building_area',
  'floor_levels',
  'pipeline_stage',
  'project_status',
  'financial_status',
  'quotation_number',
  'quotation_amount',
  'vat_amount',
  'total_amount',
  'quotation_status',
  'quotation_visits_count',
  'payment_reference',
  'paid_amount',
  'sales_payment_type',
  'created_at',
].join(',');

/** Fallback compatibility set: explicit, safe, and still suitable for Sales list rendering. */
export const CLIENT_LIST_FALLBACK_COLUMNS = [
  'id', 'client_code', 'name', 'business_name', 'owner_name', 'phone',
  'city', 'region', 'district', 'activity_type', 'pipeline_stage', 'project_status',
  'financial_status', 'engineering_status', 'quotation_status', 'quotation_number',
  'quotation_amount', 'vat_amount', 'total_amount', 'paid_amount', 'credit_balance',
  'sales_payment_type', 'assigned_engineer', 'quotation_visits_count', 'final_report_status',
  'license_number', 'created_at',
].join(',');

/** Minimal legacy compatibility set if one or more optional Sales columns are absent. */
export const CLIENT_LIST_CORE_FALLBACK_COLUMNS = [
  'id', 'client_code', 'name', 'business_name', 'phone', 'activity_type',
  'pipeline_stage', 'project_status', 'financial_status', 'quotation_status',
  'quotation_number', 'quotation_amount', 'total_amount', 'paid_amount',
  'credit_balance', 'sales_payment_type', 'created_at',
].join(',');

/** سياسة stale-while-revalidate للبيانات المتكررة داخل الجلسة */
export const SWR_DEFAULTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  revalidateIfStale: true,
  dedupingInterval: 30_000,
  focusThrottleInterval: 30_000,
  keepPreviousData: true,
} as const;
