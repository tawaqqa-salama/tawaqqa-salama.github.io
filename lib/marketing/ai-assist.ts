/**
 * Optional AI assists for social/content — never auto-publishes.
 * Uses OPENAI_API_KEY when present; otherwise heuristic fallbacks.
 */

export type AiAssistKind =
  | 'suggest_post'
  | 'rewrite'
  | 'captions'
  | 'hashtags'
  | 'analyze_post'
  | 'summarize_messages'
  | 'extract_lead'
  | 'classify_lead'
  | 'priority';

async function callOpenAi(system: string, user: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

function fallback(kind: AiAssistKind, text: string): string {
  switch (kind) {
    case 'hashtags':
      return '#سلامة #إطفاء #حماية_من_الحريق #استشارات_هندسية #السعودية #كود_البناء';
    case 'captions':
      return `${text.slice(0, 180)}\n\nتواصل معنا لاستشارة هندسية متخصصة.`;
    case 'rewrite':
      return text.trim();
    case 'suggest_post':
      return `هل منشأتك جاهزة لمتطلبات السلامة؟\n\nنقدم دراسات وتصميم أنظمة الإطفاء والإنذار وفق الكود السعودي.\n\n${text}`.trim();
    case 'summarize_messages':
      return `ملخص: العميل يهتم بخدمات السلامة. النص: ${text.slice(0, 240)}`;
    case 'extract_lead':
      return JSON.stringify({
        interest: 'نظام إطفاء / سلامة',
        city: text.includes('جدة') ? 'جدة' : text.includes('رياض') ? 'الرياض' : null,
        urgency: /عاجل|سريع|خلال/.test(text) ? 'high' : 'medium',
      });
    case 'classify_lead':
      return /مصنع|مستودع|مستشفى/.test(text) ? 'B2B-industrial' : 'general';
    case 'priority':
      return /عاجل|خطر|مخالفة/.test(text) ? 'high' : 'normal';
    case 'analyze_post':
      return 'أداء متوقع متوسط — أضف صورة للموقع واذكر مدينة الخدمة لتحسين التفاعل.';
    default:
      return text;
  }
}

export async function runMarketingAiAssist(input: {
  kind: AiAssistKind;
  text: string;
  platform?: string;
  allowPublish?: boolean;
}) {
  // Hard rule: AI never publishes
  if (input.allowPublish) {
    return {
      ok: false,
      error: 'النشر التلقائي بالذكاء الاصطناعي غير مسموح — راجع المسودة يدويًا ثم انشر.',
      auto_publish: false,
    };
  }

  const system =
    'أنت مساعد تسويق لمكتب استشارات سلامة سعودي. أجب بالعربية باختصار ووضوح. لا تنشر محتوى.';
  const user = `المهمة: ${input.kind}\nالمنصة: ${input.platform || 'عام'}\nالنص:\n${input.text}`;
  const ai = await callOpenAi(system, user);
  return {
    ok: true,
    kind: input.kind,
    result: ai || fallback(input.kind, input.text),
    provider: ai ? 'openai' : 'heuristic',
    auto_publish: false,
    note: 'النتيجة مسودة فقط — يلزم موافقة المستخدم قبل النشر.',
  };
}
