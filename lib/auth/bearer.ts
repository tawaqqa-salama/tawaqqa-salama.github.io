/**
 * Extract Supabase Auth access token from Authorization: Bearer header.
 * Never trust body-supplied tokens for identity.
 */

export function getBearerAccessToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}
