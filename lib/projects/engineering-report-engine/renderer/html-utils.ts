export function esc(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Remove only invisible bidi control marks if present in source strings.
 * Does not reshape or remap Arabic letters.
 */
export function stripBidiControls(text: string): string {
  return String(text || '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
}

/** Latin code token spacing only (NFPA13 → NFPA 13). Leaves Arabic untouched. */
export function normalizeCodeSpacing(text: string): string {
  return stripBidiControls(text)
    // Normalize persisted two-character escape sequences before HTML escaping.
    .replace(/\\r?\\n/g, '\n')
    .replace(/\bNFPA\s*(\d+[A-Z]?)/gi, 'NFPA $1')
    .replace(/\bSBC\s*-?\s*(\d+)/gi, 'SBC $1');
}

/**
 * HTML-escape a full Unicode string for the report.
 * Pass Arabic as a whole string — no per-character glyph mapping.
 * Do not wrap Latin codes in dir=ltr (Chrome PDF isolates corrupt extraction).
 */
export function formatReportTextHtml(text: string): string {
  return esc(normalizeCodeSpacing(String(text || '')).replace(/\bK(?:-?Factor\s*)?(\d+(?:\.\d+)?)\b/gi, 'K = $1'));
}

/** @deprecated Use formatReportTextHtml */
export function protectCodeTokens(text: string): string {
  return normalizeCodeSpacing(text);
}
