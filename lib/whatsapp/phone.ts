/**
 * Normalize phone numbers to E.164-ish Saudi-first international form: +9665XXXXXXXX
 */

export function digitsOnly(value: string): string {
  return String(value || '').replace(/\D+/g, '');
}

/** Normalize to +966… when Saudi; otherwise +<digits> if country code present. */
export function normalizeWhatsAppPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let raw = String(input).trim();
  if (!raw) return null;

  // wa.me / whatsapp sometimes send without +
  raw = raw.replace(/^whatsapp:/i, '');
  const hasPlus = raw.startsWith('+');
  let d = digitsOnly(raw);
  if (!d) return null;

  // Local Saudi mobile: 05xxxxxxxx / 5xxxxxxxx
  if (d.startsWith('05') && d.length === 10) {
    d = `966${d.slice(1)}`;
  } else if (d.startsWith('5') && d.length === 9) {
    d = `966${d}`;
  } else if (d.startsWith('9660') && d.length >= 12) {
    d = `966${d.slice(4)}`;
  } else if (d.startsWith('00966')) {
    d = d.slice(2);
  }

  // Already 9665…
  if (d.startsWith('966') && d.length >= 12) {
    return `+${d}`;
  }

  if (hasPlus || d.length >= 10) {
    return `+${d}`;
  }

  return null;
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeWhatsAppPhone(a);
  const nb = normalizeWhatsAppPhone(b);
  if (!na || !nb) return false;
  return na === nb || digitsOnly(na) === digitsOnly(nb);
}

export function isValidSaudiMobile(phone: string | null | undefined): boolean {
  const n = normalizeWhatsAppPhone(phone);
  if (!n) return false;
  return /^\+9665\d{8}$/.test(n);
}
