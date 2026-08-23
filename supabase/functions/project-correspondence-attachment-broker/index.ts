import { createClient } from 'npm:@supabase/supabase-js@2';

type Actor = {
  company_id: string | null;
  auth_user_id: string | null;
  role_code: string | null;
  extra_permissions: unknown;
  is_active: boolean | null;
  deleted_at: string | null;
};

type Attachment = {
  id: string;
  correspondence_id: string;
  project_id: string;
  client_id: string;
  display_file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  state: string;
  sha256_hex: string | null;
};

const MAX_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TTL_SECONDS = 5 * 60;
const MIME: Record<string, { extension: RegExp; magic: number[] }> = {
  'application/pdf': { extension: /\.pdf$/i, magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  'image/jpeg': { extension: /\.(jpe?g)$/i, magic: [0xff, 0xd8, 0xff] },
  'image/png': { extension: /\.png$/i, magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-attachment-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function bearerToken(request: Request): string | null {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function attachmentId(value: string | null): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function hasPermission(actor: Actor, permission: 'documents.view' | 'documents.upload'): boolean {
  if (!actor.company_id || !actor.auth_user_id || actor.deleted_at || actor.is_active !== true) return false;
  const extra = Array.isArray(actor.extra_permissions) ? actor.extra_permissions.filter((x): x is string => typeof x === 'string') : [];
  if (['super_admin', 'tenant_admin', 'admin'].includes(actor.role_code || '') || extra.includes('*') || extra.includes(permission)) return true;
  if (permission === 'documents.view') return ['manager', 'engineer', 'employee'].includes(actor.role_code || '');
  return actor.role_code === 'manager';
}

function normalizedContentType(request: Request): string {
  return (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
}

function matchesMagic(bytes: Uint8Array, expected: number[]): boolean {
  return bytes.length >= expected.length && expected.every((byte, index) => bytes[index] === byte);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST' && request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);

  const token = bearerToken(request);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey) return json({ ok: false, code: 'UNAUTHORIZED' }, 401);

  const user = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await user.auth.getUser(token);
  if (authError || !authData.user) return json({ ok: false, code: 'UNAUTHORIZED' }, 401);

  const { data: actorData, error: actorError } = await admin
    .from('users')
    .select('company_id, auth_user_id, role_code, extra_permissions, is_active, deleted_at')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  const actor = actorData as Actor | null;
  if (actorError || !actor) return json({ ok: false, code: 'ACTOR_FORBIDDEN' }, 403);

  const id = attachmentId(request.method === 'POST' ? request.headers.get('x-attachment-id') : new URL(request.url).searchParams.get('attachment_id'));
  if (!id) return json({ ok: false, code: 'ATTACHMENT_ID_REQUIRED' }, 400);

  const { data: attachmentData, error: attachmentError } = await admin
    .from('project_correspondence_attachments')
    .select('id, correspondence_id, project_id, client_id, display_file_name, mime_type, size_bytes, storage_bucket, storage_path, state, sha256_hex')
    .eq('id', id)
    .maybeSingle();
  const attachment = attachmentData as Attachment | null;
  if (attachmentError || !attachment || attachment.storage_bucket !== 'project-files') return json({ ok: false, code: 'ATTACHMENT_NOT_FOUND_OR_FORBIDDEN' }, 404);

  const { data: clientData } = await admin.from('clients').select('company_id').eq('id', attachment.client_id).maybeSingle();
  if (!clientData || clientData.company_id !== actor.company_id) return json({ ok: false, code: 'ATTACHMENT_NOT_FOUND_OR_FORBIDDEN' }, 404);

  const { data: correspondenceData } = await admin
    .from('project_correspondences')
    .select('id, document_status, project_id, client_id')
    .eq('id', attachment.correspondence_id)
    .eq('project_id', attachment.project_id)
    .eq('client_id', attachment.client_id)
    .maybeSingle();
  if (!correspondenceData) return json({ ok: false, code: 'ATTACHMENT_NOT_FOUND_OR_FORBIDDEN' }, 404);

  if (request.method === 'GET') {
    if (!hasPermission(actor, 'documents.view') || attachment.state !== 'available') return json({ ok: false, code: 'DOCUMENT_PERMISSION_DENIED' }, 403);
    const { data, error } = await admin.storage.from('project-files').createSignedUrl(attachment.storage_path, DOWNLOAD_TTL_SECONDS);
    if (error || !data?.signedUrl) return json({ ok: false, code: 'SIGNED_URL_FAILED' }, 502);
    return json({ ok: true, signed_url: data.signedUrl, expires_in_seconds: DOWNLOAD_TTL_SECONDS });
  }

  if (!hasPermission(actor, 'documents.upload')) return json({ ok: false, code: 'DOCUMENT_PERMISSION_DENIED' }, 403);
  if (correspondenceData.document_status === 'approved') return json({ ok: false, code: 'CORRESPONDENCE_APPROVED_IMMUTABLE' }, 409);
  if (!['pending_upload', 'available'].includes(attachment.state)) return json({ ok: false, code: 'ATTACHMENT_INVALID_STATE' }, 409);

  const expected = MIME[attachment.mime_type];
  const body = new Uint8Array(await request.arrayBuffer());
  if (!expected || normalizedContentType(request) !== attachment.mime_type || !expected.extension.test(attachment.display_file_name) || body.byteLength === 0 || body.byteLength > MAX_BYTES || body.byteLength !== attachment.size_bytes || !matchesMagic(body, expected.magic)) {
    return json({ ok: false, code: 'ATTACHMENT_BYTE_VALIDATION_FAILED' }, 400);
  }

  const checksum = await sha256Hex(body);
  const bucket = admin.storage.from('project-files');
  const { error: uploadError } = await bucket.upload(attachment.storage_path, body, { contentType: attachment.mime_type, upsert: false });
  if (uploadError) {
    const { data: existing, error: existingError } = await bucket.download(attachment.storage_path);
    if (existingError || !existing || await sha256Hex(new Uint8Array(await existing.arrayBuffer())) !== checksum) return json({ ok: false, code: 'ATTACHMENT_OBJECT_CONFLICT' }, 409);
  }

  const { error: finalizeError } = await admin.rpc('finalize_project_correspondence_attachment', { p_attachment_id: attachment.id, p_verified_size_bytes: body.byteLength, p_verified_mime_type: attachment.mime_type, p_sha256_hex: checksum });
  if (finalizeError) {
    const { error: removeError } = await bucket.remove([attachment.storage_path]);
    if (removeError) await admin.rpc('mark_project_correspondence_attachment_cleanup_required', { p_attachment_id: attachment.id, p_error_code: 'FINALIZE_FAILED_OBJECT_CLEANUP_FAILED' });
    return json({ ok: false, code: removeError ? 'ATTACHMENT_CLEANUP_REQUIRED' : 'ATTACHMENT_FINALIZATION_FAILED' }, 502);
  }

  return json({ ok: true, attachment_id: attachment.id, state: 'available' });
});
