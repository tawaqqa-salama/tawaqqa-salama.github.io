export function esc(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Strip bidi isolates / embedding marks.
 * Chromium print-to-PDF emits these around dir=ltr runs; PDF extractors then
 * show corrupted Arabic like ا5تطلبات / اZنذار / ا;راجع.
 */
export function stripBidiControls(text: string): string {
  return String(text || '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
}

/** Normalize NFPA13 → NFPA 13 before embedding in HTML. */
export function normalizeCodeSpacing(text: string): string {
  return stripBidiControls(text)
    .replace(/\bNFPA\s*(\d+[A-Z]?)/gi, 'NFPA $1')
    .replace(/\bSBC\s*-?\s*(\d+)/gi, 'SBC $1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Escape report text for HTML.
 * Do NOT wrap Latin codes in dir=ltr / unicode-bidi spans — Chrome embeds
 * U+2066–U+2069 into the PDF text layer and breaks Arabic extraction.
 * Spaced tokens (NFPA 72, SBC 801) stay readable in RTL without isolates.
 */
export function formatReportTextHtml(text: string): string {
  return esc(normalizeCodeSpacing(text));
}

/** @deprecated Use formatReportTextHtml */
export function protectCodeTokens(text: string): string {
  return normalizeCodeSpacing(text);
}
