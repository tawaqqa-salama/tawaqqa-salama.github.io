import { NextResponse } from 'next/server';
import {
  emptyExtraction,
  hasUsefulPermitExtraction,
  parseBuildingPermitText,
  type BuildingPermitExtraction,
} from '@/lib/projects/building-permit-ocr';
import {
  classifyFloorName,
  mapPermitUsageToActivityType,
  type PermitFloorRow,
} from '@/lib/projects/permit-floors-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  fileName?: string;
  mimeType?: string;
  base64?: string;
  localText?: string;
};

const VISION_PROMPT = `You are extracting fields from a Saudi Arabian building permit (رخصة بناء / بلدي).
Return ONLY valid JSON with these keys:
{
  "permitNumber": string|null,
  "permitDateGregorian": string|null,
  "permitDateHijri": string|null,
  "ownerName": string|null,
  "district": string|null,
  "city": string|null,
  "street": string|null,
  "plotNumber": string|null,
  "municipality": string|null,
  "commercialRegister": string|null,
  "phone": string|null,
  "landAreaM2": string|null,
  "buildingAreaM2": string|null,
  "floorsCount": number|null,
  "usageLabel": string|null,
  "floors": [{"label": string, "area_m2": number}]|null,
  "nationalAddress": string|null,
  "locationSummary": string|null,
  "rawTextPreview": string|null
}
usageLabel = الاستعمال / الاستخدام (e.g. رخصة بناء مبنى تجاري, صناعي, سكني).
floors = rows from محتويات المبنى / تفصيل الأدوار with Arabic floor names (أرضي، أول، ثاني، بدروم، سطح) and area in m².
floorsCount = عدد الأدوار. buildingAreaM2 = إجمالي مساحة البناء when present.
Use Gregorian dates as YYYY-MM-DD when possible. Keep Arabic names as written.`;

function strOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function floorsFromVision(value: unknown): PermitFloorRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: PermitFloorRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const label = strOrNull(raw.label) || strOrNull(raw.name) || strOrNull(raw.floor);
    const area = numOrNull(raw.area_m2 ?? raw.area ?? raw.buildingAreaM2);
    if (!label || area == null || area <= 0) continue;
    const classified = classifyFloorName(label) || { kind: 'custom' as const, label };
    rows.push({
      label: classified.label,
      kind: classified.kind,
      area_m2: area,
      repeat_count: Math.max(1, Math.floor(numOrNull(raw.repeat_count) || 1)),
    });
  }
  return rows.length > 0 ? rows : null;
}

function mergeVisionJson(raw: string): BuildingPermitExtraction {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return parseBuildingPermitText(raw, 'vision');
  }
  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const fromText = parseBuildingPermitText(
      String(data.rawTextPreview || raw),
      'vision'
    );
    const usageLabel =
      strOrNull(data.usageLabel) || strOrNull(data.usage) || fromText.usageLabel;
    const visionFloors = floorsFromVision(data.floors);
    const floorsCount =
      numOrNull(data.floorsCount) ??
      (visionFloors
        ? visionFloors.reduce((s, f) => s + f.repeat_count, 0)
        : null) ??
      fromText.floorsCount;
    const overlay: Partial<BuildingPermitExtraction> = {
      permitNumber: strOrNull(data.permitNumber),
      permitDateGregorian: strOrNull(data.permitDateGregorian),
      permitDateHijri: strOrNull(data.permitDateHijri),
      ownerName: strOrNull(data.ownerName),
      district: strOrNull(data.district),
      city: strOrNull(data.city),
      street: strOrNull(data.street),
      plotNumber: strOrNull(data.plotNumber),
      municipality: strOrNull(data.municipality),
      commercialRegister: strOrNull(data.commercialRegister),
      phone: strOrNull(data.phone),
      landAreaM2: strOrNull(data.landAreaM2),
      buildingAreaM2: strOrNull(data.buildingAreaM2),
      floorsCount,
      usageLabel,
      activityType:
        mapPermitUsageToActivityType(usageLabel, String(data.rawTextPreview || '')) ||
        fromText.activityType,
      floors: visionFloors || fromText.floors,
      nationalAddress: strOrNull(data.nationalAddress),
      locationSummary: strOrNull(data.locationSummary),
      rawTextPreview: strOrNull(data.rawTextPreview) || raw.slice(0, 1200),
    };
    const merged: BuildingPermitExtraction = {
      ...fromText,
      ...Object.fromEntries(
        Object.entries(overlay).filter(([, v]) => v != null && v !== '')
      ),
      source: 'vision',
    };
    const hits = [
      merged.permitNumber,
      merged.permitDateGregorian || merged.permitDateHijri,
      merged.ownerName,
      merged.district || merged.city,
      merged.street,
      merged.floorsCount,
      merged.activityType,
    ].filter(Boolean).length;
    merged.confidence = hits >= 3 ? 'high' : hits >= 2 ? 'medium' : 'low';
    return merged;
  } catch {
    return parseBuildingPermitText(raw, 'vision');
  }
}

async function extractWithOpenAI(
  mimeType: string,
  base64: string,
  fileName: string
): Promise<BuildingPermitExtraction | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  // Vision chat completions accept images; for PDF send as file text hint only unless image
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: VISION_PROMPT }];

  if (!isPdf && (mimeType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(fileName))) {
    const safeMime = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    content.push({
      type: 'image_url',
      image_url: { url: `data:${safeMime};base64,${base64}` },
    });
  } else {
    // PDF: ask model to parse if it supports file inputs via text fallback only
    content.push({
      type: 'text',
      text: `File name: ${fileName}. If the following base64 cannot be decoded as an image, reply with null fields.\n(base64 length=${base64.length})`,
    });
    return null;
  }

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
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content || '';
  if (!text.trim()) return null;
  return mergeVisionJson(text);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (!body?.fileName) {
      return NextResponse.json({ ok: false, error: 'fileName مطلوب' }, { status: 400 });
    }

    const localText = String(body.localText || '');
    let result = localText
      ? parseBuildingPermitText(localText, 'pdf_text')
      : emptyExtraction('none');

    if (body.base64 && body.mimeType) {
      const vision = await extractWithOpenAI(body.mimeType, body.base64, body.fileName);
      if (vision && hasUsefulPermitExtraction(vision)) {
        result = vision;
      }
    }

    // Filename fallback
    if (!hasUsefulPermitExtraction(result)) {
      result = parseBuildingPermitText(body.fileName.replace(/[_\-.]+/g, ' '), 'filename');
    }

    return NextResponse.json({
      ok: true,
      result,
      visionConfigured: Boolean(process.env.OPENAI_API_KEY),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'فشل استخراج بيانات الرخصة',
      },
      { status: 500 }
    );
  }
}
