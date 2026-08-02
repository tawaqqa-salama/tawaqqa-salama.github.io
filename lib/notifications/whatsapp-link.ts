/**
 * أدوات فتح واتساب من المتصفح (wa.me) — تعمل على GitHub Pages دون API.
 */

/** يحوّل 05xxxxxxxx / 9665… / +9665… إلى رقم دولي بدون + */
export function normalizeSaudiWhatsAppPhone(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;

  let normalized = digits;
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  if (normalized.startsWith('0') && normalized.length === 10) {
    normalized = `966${normalized.slice(1)}`;
  } else if (normalized.startsWith('5') && normalized.length === 9) {
    normalized = `966${normalized}`;
  } else if (normalized.startsWith('966') && normalized.length >= 12) {
    // ok
  } else {
    return null;
  }

  if (!/^9665\d{8}$/.test(normalized)) return null;
  return normalized;
}

export function buildWhatsAppShareUrl(phone: string, message: string): string | null {
  const normalized = normalizeSaudiWhatsAppPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/** يفتح واتساب في تبويب جديد؛ يعيد رسالة خطأ عربية إن فشل */
export function openWhatsAppChat(phone: string, message: string): { ok: boolean; error?: string } {
  const url = buildWhatsAppShareUrl(phone, message);
  if (!url) {
    return { ok: false, error: 'رقم الجوال غير صالح. استخدم صيغة 05xxxxxxxx' };
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    // بعض المتصفحات تمنع النوافذ المنبثقة — نحاول التوجيه المباشر
    window.location.href = url;
  }
  return { ok: true };
}
