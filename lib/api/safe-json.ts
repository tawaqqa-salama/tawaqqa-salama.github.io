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

export function humanizeFetchError(message: string): string {
  if (isHtmlAsJsonError(message)) {
    return (
      'واجهة البرمجة (/api) غير متاحة على هذا المضيف (مثل GitHub Pages). ' +
      'العمليات المحلية تعمل؛ للذكاء الاصطناعي وOCR والـ ZATCA انشر على استضافة Node/Vercel.'
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
