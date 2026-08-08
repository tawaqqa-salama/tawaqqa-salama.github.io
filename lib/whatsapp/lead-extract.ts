/**
 * Heuristic Arabic lead extraction from WhatsApp text.
 * Optional OpenAI enrichment when OPENAI_API_KEY is set — always returns proposed fields only.
 */

export type ExtractedLeadFields = {
  activity?: string;
  city?: string;
  area?: number;
  floors?: number;
  requested_service?: string;
  business_name?: string;
  name?: string;
  confidence: number;
  source: 'heuristic' | 'ai';
};

const CITY_RE =
  /(الرياض|جدة|جده|الدمام|مكة|مكه|المدينة|الخبر|الطائف|تبوك|أبها|ابها|ينبع|الجبيل|حائل|نجران|جازان|القصيم|بريدة)/;

const ACTIVITY_RE =
  /(مصنع|مصانع|مستودع|مستودعات|مستشفي|مستشفى|مدرسة|مدارس|فندق|فنادق|مطعم|مطاعم|مول|مجمع|برج|فيلا|فلل|مكتب|مكاتب|ورشة|محطة|مسجد|مستشفى|مستشفى)/;

const SERVICE_RE =
  /(دراسة سلامة|دراسة السلامة|أنظمة إطفاء|انظمة اطفاء|إنذار|انذار|رش آلي|رش الي|خطة إخلاء|خطة اخلاء|عرض سعر|كود البناء|دفاع مدني)/;

export function extractLeadFieldsHeuristic(text: string): ExtractedLeadFields | null {
  const raw = String(text || '').trim();
  if (!raw || raw.length < 8) return null;

  const out: ExtractedLeadFields = { confidence: 0.35, source: 'heuristic' };
  let hits = 0;

  const city = raw.match(CITY_RE)?.[1];
  if (city) {
    out.city = city.replace('جده', 'جدة').replace('مكه', 'مكة').replace('ابها', 'أبها');
    hits += 1;
  }

  const activity = raw.match(ACTIVITY_RE)?.[1];
  if (activity) {
    out.activity = activity;
    hits += 1;
  }

  const areaMatch =
    raw.match(/(\d{2,7})\s*(?:م2|م²|متر|متر مربع|م\.?\s*مربع)/i) ||
    raw.match(/مساح(?:ة|ته|تها)?\s*(\d{2,7})/i);
  if (areaMatch) {
    out.area = Number(areaMatch[1]);
    hits += 1;
  }

  const floorsMatch = raw.match(/(\d{1,2})\s*(?:دور|أدوار|ادوار|طابق|طوابق)/i);
  if (floorsMatch) {
    out.floors = Number(floorsMatch[1]);
    hits += 1;
  }

  const service = raw.match(SERVICE_RE)?.[1];
  if (service) {
    out.requested_service = service;
    hits += 1;
  }

  if (hits === 0) return null;
  out.confidence = Math.min(0.9, 0.3 + hits * 0.15);
  return out;
}

export async function extractLeadFields(text: string): Promise<ExtractedLeadFields | null> {
  const heuristic = extractLeadFieldsHeuristic(text);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return heuristic;

  try {
    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract CRM lead fields from Arabic customer WhatsApp messages for a Saudi fire-safety engineering firm. Return JSON only with keys: activity, city, area (number m2), floors, requested_service, business_name, name. Omit unknown keys. Do not invent.',
          },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) return heuristic;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return heuristic;
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const merged: ExtractedLeadFields = {
      ...(heuristic || { confidence: 0.5, source: 'ai' }),
      source: 'ai',
      confidence: 0.75,
    };
    if (typeof parsed.activity === 'string') merged.activity = parsed.activity;
    if (typeof parsed.city === 'string') merged.city = parsed.city;
    if (typeof parsed.area === 'number') merged.area = parsed.area;
    if (typeof parsed.floors === 'number') merged.floors = parsed.floors;
    if (typeof parsed.requested_service === 'string') {
      merged.requested_service = parsed.requested_service;
    }
    if (typeof parsed.business_name === 'string') merged.business_name = parsed.business_name;
    if (typeof parsed.name === 'string') merged.name = parsed.name;
    return merged.activity || merged.city || merged.area || merged.requested_service
      ? merged
      : heuristic;
  } catch {
    return heuristic;
  }
}
