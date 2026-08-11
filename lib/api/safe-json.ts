/**
 * Safe JSON parsing for fetch responses.
 * GitHub Pages / static hosts return HTML for missing /api/* routes —
 * calling response.json() then throws: Unexpected token '<', "<html>...
 */

export const HTML_AS_JSON_ERROR_RE =
  /Unexpected token\s+'<'|is not valid JSON|<!DOCTYPE|<html/i;

export function isHtmlAsJsonError(message: string | null | undefined): boolean {
  if (!message) return false;
  return HTML_AS_JSON_ERROR_RE.test(message);
}

export function isStatementTimeoutError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /statement timeout|canceling statement|57014/i.test(message);
}

export function humanizeFetchError(message: string): string {
  if (isHtmlAsJsonError(message)) {
    return (
      'واجهة البرمجة (/api) غير متاحة على هذا المضيف (مثل GitHub Pages). ' +
      'العمليات المحلية تعمل؛ للذكاء الاصطناعي وOCR والـ ZATCA انشر على استضافة Node/Vercel.'
    );
  }
  if (isStatementTimeoutError(message)) {
    return (
      'انتهت مهلة قاعدة البيانات أثناء حفظ ملف المشروع (العمود project_engineering_data كبير جداً غالباً بسبب صور/مخططات مضمّنة). ' +
      'نُفِّذت نسخة محلية. للتقرير الفني (مرحلة 4): نفّذ scripts/sql/039_stage4_tech_live_store.sql مرة واحدة. ' +
      'للزيارات/الإشراف (مرحلة 5): نفّذ 038_stage5_live_store.sql. ' +
      'ثم أعد الحفظ — هذه المسارات لا تلمس العمود الثقيل.'
    );
  }
  return message;
}

export function looksLikeHtmlBody(text: string): boolean {
  const head = text.trimStart().slice(0, 32).toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<head');
}

export async function readResponseJson<T = unknown>(
  response: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string; isHtml: boolean }> {
  const text = await response.text();
  if (!text) {
    return { ok: true, data: null as T };
  }
  if (looksLikeHtmlBody(text)) {
    return {
      ok: false,
      isHtml: true,
      error: humanizeFetchError("Unexpected token '<', \"<html>... is not valid JSON"),
    };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Invalid JSON';
    return { ok: false, isHtml: false, error: humanizeFetchError(raw) };
  }
}
