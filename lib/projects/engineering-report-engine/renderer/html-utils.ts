export function esc(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Normalize NFPA13 → NFPA 13 before embedding in HTML. */
export function normalizeCodeSpacing(text: string): string {
  return String(text || '')
    .replace(/\bNFPA\s*(\d+[A-Z]?)/gi, 'NFPA $1')
    .replace(/\bSBC\s*-?\s*(\d+)/gi, 'SBC $1');
}

/**
 * Escape text then wrap code tokens in LTR spans.
 * Do NOT use Unicode isolates (U+2066/U+2069) — they corrupt Arabic
 * PDF text extraction / copy-paste (ا;وقع، اZنذار، …).
 */
export function formatReportTextHtml(text: string): string {
  const normalized = normalizeCodeSpacing(text);
  const escaped = esc(normalized);
  return escaped.replace(
    /\b(NFPA\s+\d+[A-Z]?|SBC\s+\d+|SFPE|UL\s+\d+)\b/gi,
    (m) => `<span class="ltr" dir="ltr">${m}</span>`
  );
}

/** @deprecated Use formatReportTextHtml — isolates break Arabic extraction. */
export function protectCodeTokens(text: string): string {
  return normalizeCodeSpacing(text);
}
