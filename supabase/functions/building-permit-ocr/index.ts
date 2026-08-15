import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  EXTRACTION_JSON_SHAPE,
  hasReviewRequired,
  normalizeOcrFields,
  validateOcrFields,
  type BuildingPermitOcrResponse,
  type OcrErrorResponse,
} from '../_shared/building-permit-schema.ts';
import {
  approvedBuildingPermitPath,
  safeStoragePath,
  storagePathMatchesMetadata,
} from '../_shared/storage-access.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

const ALLOWED_BUCKET = 'project-files';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 30;
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const EXTRACTION_PROMPT = `أنت محلل وثائق رخص البناء السعودية. اقرأ الوثيقة المرفقة فقط، ولا تستنتج أي قيمة غير ظاهرة فيها.
أعد JSON مطابقاً للمخطط المطلوب. لكل حقل أعد كائناً بالشكل:
{"value": value-or-null, "confidence": number-between-0-and-1, "source": {"page": number, "text": string, "x": number, "y": number, "width": number, "height": number} أو null, "needs_review": boolean}.
ضع needs_review=true إذا كانت القيمة غير واضحة أو confidence أقل من 0.75 أو لا يمكن تحديد مصدرها.
لا تضع VERIFIED أبداً؛ النتيجة تحتاج مراجعة المستخدم.
اترك القيمة null إذا لم تكن موجودة. استخدم YYYY-MM-DD للتاريخ الميلادي عند التأكد فقط.
اقرأ رقم الرخصة من خانة «رقم الرخصة» فقط، ويجب أن يكون 10 أرقام متصلة؛ لا تستخدم رقم الباركود أو الصك أو الكروكي ولا تكمل الرقم بالتخمين.
اقرأ اسم المالك من خانة «اسم صاحب الرخصة» فقط، ولا تستخدم اسم المدير أو المهندس أو المكتب أو التوقيعات. حافظ على ترتيب الكلمات العربية وأزل المسافات المكررة فقط.
اقرأ رقم القطعة من «رقم القطعة» ورقم المخطط من «رقم المخطط»، واحفظ رقم المخطط كنص لأنه قد يحتوي على /. لا تخلطهما مع الصك أو الكروكي.
اقرأ جدول «المساحات وعدد الوحدات ومواقف السيارات» صفاً صفاً. أعد كل صف مطبوع بالترتيب والتسمية الظاهرة حرفياً دون إعادة تسمية حسب ترتيب الصف: بدروم، طابق أرضي، طابق متكرر، طابق اول، ملحق علوي عند ظهورها. لكل صف أعد label وarea_m2 وactivity_type وsource.row_text وsource.column_text عند توفرها. إذا لم يمكن ربط النشاط أو المساحة بالصف، اترك القيمة null وضع needs_review=true ولا تخترعها.
أعد licensedFloorCount من الحقل الصريح «عدد الأدوار» فقط عند ظهوره. هذا العدد مستقل عن floorLevels؛ وجود بدروم أو ملحق أو صفوف إضافية في جدول المساحات لا يغيّر licensedFloorCount. لا تقص floorLevels ولا تساوِ بينها وبين licensedFloorCount.
لا تخلط بين مساحة الأرض ومساحة البناء، ولا تستخرج نشاط دور غير ظاهر صراحة.
الحقول المطلوبة هي: ${JSON.stringify(EXTRACTION_JSON_SHAPE)}.`;

const TARGETED_EXTRACTION_PROMPT = `أعد فحص الوثيقة نفسها مرة واحدة فقط مع تركيز موجّه على أربع مناطق، ولا تغيّر قيمة إلا إذا وجدت نصاً مصدرياً واضحاً:
A) header/license number: خانة «رقم الرخصة» فقط؛ 10 أرقام متصلة.
B) owner/contact block: خانة «اسم صاحب الرخصة» فقط؛ لا أسماء المهندس أو المكتب أو التوقيعات.
C) plot/plan/land area block: «رقم القطعة»، «رقم المخطط»، «مساحة الأرض» مع الحفاظ على / والكسور العشرية.
D) floor table: جدول «المساحات وعدد الوحدات ومواقف السيارات»؛ أعد جميع الصفوف الفعلية بتسمياتها الأصلية ومساحاتها ومصادر الصف والعمود، دون قصها حسب licensedFloorCount.
أعد نفس JSON schema، وكل قيمة بلا نص مصدر واضح أو بثقة أقل من 0.75 يجب أن تكون needs_review=true. لا تخمّن ولا تستخدم VERIFIED. ${JSON.stringify(EXTRACTION_JSON_SHAPE)}`;

const TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(Object.entries(EXTRACTION_JSON_SHAPE).map(([key]) => {
    if (key === 'floors' || key === 'floorLevels') {
      return [key, {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          value: { type: ['array', 'null'], items: { type: 'object', additionalProperties: false, properties: {
            label: { type: ['string', 'null'] },
            area_m2: { type: ['number', 'null'] },
            activity_type: { type: ['string', 'null'] },
            source: { type: ['object', 'null'], additionalProperties: true },
          }, required: ['label', 'area_m2', 'activity_type', 'source'] } },
          confidence: { type: 'number' },
          source: { type: ['object', 'null'], additionalProperties: true },
          needs_review: { type: 'boolean' },
        },
        required: ['value', 'confidence', 'source', 'needs_review'],
      }];
    }
    const numeric = ['landAreaM2', 'buildingAreaM2', 'floorsCount', 'licensedFloorCount', 'buildingHeightM'].includes(key);
    return [key, {
      type: 'object',
      additionalProperties: false,
      properties: {
        value: { type: [numeric ? 'number' : 'string', 'null'] },
        confidence: { type: 'number' },
        source: { type: ['object', 'null'], additionalProperties: true },
        needs_review: { type: 'boolean' },
      },
      required: ['value', 'confidence', 'source', 'needs_review'],
    }];
  })),
  required: Object.keys(EXTRACTION_JSON_SHAPE),
};

function jsonResponse(body: BuildingPermitOcrResponse | OcrErrorResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function errorResponse(code: string, error: string, status: number): Response {
  return jsonResponse({ ok: false, code, error }, status);
}

function bearerToken(request: Request): string | null {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function detectMime(bytes: Uint8Array, fileName: string | null): string | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.slice(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i])) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  const ext = (fileName || '').toLowerCase().split('.').pop();
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext && ['jpg', 'jpeg'].includes(ext) ? 'image/jpeg' : null;
}

function countPdfPages(bytes: Uint8Array): number | null {
  const raw = new TextDecoder('latin1').decode(bytes);
  const pages = raw.match(/\/Type\s*\/Page\b/g)?.length || 0;
  return pages > 0 ? pages : null;
}

function validateDocument(bytes: Uint8Array, mimeType: string, fileName: string | null): string | null {
  const detected = detectMime(bytes, fileName);
  if (!detected || detected !== mimeType) return 'Document signature does not match the declared file type';
  if (mimeType === 'application/pdf') {
    const pageCount = countPdfPages(bytes);
    if (pageCount == null) return 'PDF page structure could not be verified safely';
    if (pageCount > MAX_PDF_PAGES) return `PDF exceeds the ${MAX_PDF_PAGES}-page OCR limit`;
  }
  return null;
}

function extractResponseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!item || typeof item !== 'object') continue;
    for (const part of Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : []) {
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') return String((part as Record<string, unknown>).text);
    }
  }
  return '';
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function callOpenAi(mimeType: string, fileName: string | null, base64: string, prompt = EXTRACTION_PROMPT): Promise<Record<string, unknown> | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured in Supabase Function secrets');
  const media = mimeType === 'application/pdf'
    ? { type: 'input_file', filename: fileName || 'building-permit.pdf', file_data: `data:application/pdf;base64,${base64}` }
    : { type: 'input_image', image_url: `data:${mimeType};base64,${base64}`, detail: 'high' };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_VISION_MODEL')?.trim() || 'gpt-4o-mini',
      temperature: 0,
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, media] }],
      text: { format: { type: 'json_schema', name: 'building_permit_ocr', strict: true, schema: TEXT_SCHEMA } },
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`OpenAI OCR request failed with status ${response.status}`);
  return parseJsonObject(extractResponseText(payload));
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'POST is required', 405);
  const token = bearerToken(request);
  if (!token) return errorResponse('UNAUTHORIZED', 'Supabase access token is required', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return errorResponse('FUNCTION_CONFIG_ERROR', 'Supabase auth configuration is missing', 500);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return errorResponse('UNAUTHORIZED', 'Invalid or expired Supabase session', 401);

  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; } catch { return errorResponse('INVALID_JSON', 'Request body must be valid JSON', 400); }
  const bucket = typeof input.bucket === 'string' ? input.bucket.trim() : ALLOWED_BUCKET;
  const path = safeStoragePath(input.path);
  const requestedClientId = typeof input.clientId === 'string' ? input.clientId.trim() : null;
  if (bucket !== ALLOWED_BUCKET) return errorResponse('INVALID_BUCKET', 'Only project-files is allowed', 400);
  if (!path) return errorResponse('INVALID_PATH', 'A safe Storage path is required', 400);
  const approvedPath = approvedBuildingPermitPath(path);
  if (!approvedPath || (requestedClientId && requestedClientId !== approvedPath.clientId)) return errorResponse('NOT_FOUND', 'Permit document not found', 404);

  const { data: actor, error: actorError } = await userClient.from('users').select('id, company_id, auth_user_id, deleted_at').eq('auth_user_id', authData.user.id).maybeSingle();
  if (actorError || !actor || actor.deleted_at || actor.auth_user_id !== authData.user.id || !actor.company_id) return errorResponse('FORBIDDEN', 'Authenticated user is not linked to an active company', 403);
  const { data: client, error: clientError } = await userClient.from('clients').select('id, company_id, quotation_documents, project_engineering_data').eq('id', approvedPath.clientId).maybeSingle();
  if (clientError || !client || client.company_id !== actor.company_id || !storagePathMatchesMetadata(client as Record<string, unknown>, path)) return errorResponse('NOT_FOUND', 'Permit document not found', 404);

  const { data: fileBlob, error: downloadError } = await userClient.storage.from(ALLOWED_BUCKET).download(path);
  if (downloadError || !fileBlob) return errorResponse('NOT_FOUND', 'Permit document not found', 404);
  if (fileBlob.size <= 0 || fileBlob.size > MAX_FILE_BYTES) return errorResponse('FILE_SIZE_UNSUPPORTED', 'Permit file must be between 1 byte and 20 MB', 413);
  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  const fileName = typeof input.fileName === 'string' ? input.fileName.slice(0, 200) : null;
  const mimeType = detectMime(bytes, fileName);
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) return errorResponse('MIME_UNSUPPORTED', 'Only PDF, JPEG, PNG, and WebP are supported', 415);
  const documentError = validateDocument(bytes, mimeType, fileName);
  if (documentError) return errorResponse('DOCUMENT_UNVERIFIED', documentError, 422);

  try {
    const base64 = bytesToBase64(bytes);
    const raw = await callOpenAi(mimeType, fileName, base64);
    if (!raw) return errorResponse('EMPTY_OCR_RESULT', 'No structured OCR result was returned', 422);
    let fields = normalizeOcrFields(raw);
    let warnings = validateOcrFields(fields);
    const targetedNeeded = fields.permitNumber.needs_review || fields.ownerName.needs_review || fields.plotNumber.needs_review || fields.planNumber.needs_review || fields.landAreaM2.needs_review || fields.floors.needs_review || fields.floorsCount.needs_review;
    if (targetedNeeded) {
      const targetedRaw = await callOpenAi(mimeType, fileName, base64, TARGETED_EXTRACTION_PROMPT);
      if (targetedRaw) {
        const targetedFields = normalizeOcrFields(targetedRaw);
        const targetedWarnings = validateOcrFields(targetedFields);
        const merged = { ...fields };
        for (const key of Object.keys(merged) as Array<keyof typeof merged>) {
          const candidate = targetedFields[key];
          if (candidate.value != null && (!merged[key].value || merged[key].needs_review || candidate.confidence > merged[key].confidence)) {
            merged[key] = candidate as typeof merged[typeof key];
          }
        }
        fields = merged;
        warnings = [...warnings, ...targetedWarnings, 'Targeted region retry was used for low-confidence or invalid fields'];
      }
    }
    if (hasReviewRequired(fields)) warnings.push('One or more fields require review');
    const result: BuildingPermitOcrResponse = {
      ok: true,
      status: 'review_required',
      source: 'server',
      extractor: 'openai-vision',
      fields,
      document: { bucket: ALLOWED_BUCKET, path, file_name: fileName, mime_type: mimeType },
      warnings: [...new Set(warnings)],
    };
    return jsonResponse(result);
  } catch (error) {
    console.error('Building permit server OCR failed', error instanceof Error ? error.message : 'unknown error');
    return errorResponse('OCR_FAILED', 'Server OCR failed; no fields were approved', 502);
  }
});
