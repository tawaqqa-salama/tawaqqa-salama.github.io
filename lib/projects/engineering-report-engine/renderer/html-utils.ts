export function esc(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Keep NFPA/SBC tokens from RTL reordering issues inside Arabic paragraphs. */
export function protectCodeTokens(text: string): string {
  return String(text || '').replace(
    /\b(NFPA\s*\d+[A-Z]?|SBC\s*-?\s*\d+|SFPE|UL\s*\d+)\b/gi,
    (m) => `\u2066${m}\u2069`
  );
}
