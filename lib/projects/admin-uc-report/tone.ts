import type { ProjectLifecycleMode } from '@/lib/types/fire-protection-design';

/** Wording depends on lifecycle — never claim installation when under construction. */
export function lifecyclePhrases(mode: ProjectLifecycleMode) {
  if (mode === 'existing_building') {
    return {
      mode,
      statusLabel: 'الحالة الحالية',
      doneVerb: 'تم التنفيذ',
      installedVerb: 'تم تركيب',
      providedVerb: 'تم توفير',
      accessLead:
        'تمت مراجعة متطلبات وصول آليات الدفاع المدني وفق الوضع القائم للمنشأة.',
    };
  }
  return {
    mode,
    statusLabel: 'مطلوب توفير',
    doneVerb: 'يجب اعتماد',
    installedVerb: 'يجب مراعاة',
    providedVerb: 'يجب توفير',
    accessLead:
      'يجب مراعاة توفير متطلبات وصول آليات الدفاع المدني ضمن المخطط التنفيذي للمشروع قبل استكمال الأعمال النهائية.',
  };
}

export function yesNoLabel(v: 'yes' | 'no' | 'unknown'): string {
  if (v === 'yes') return 'نعم';
  if (v === 'no') return 'لا';
  return 'لم يتم إدخال القيمة';
}

export function supportingStatusLabel(
  status: 'required' | 'not_required' | 'by_design' | 'unknown'
): string {
  if (status === 'required') return 'مطلوب';
  if (status === 'not_required') return 'غير مطلوب';
  if (status === 'by_design') return 'حسب التصميم';
  return 'لم يتم إدخال القيمة';
}
