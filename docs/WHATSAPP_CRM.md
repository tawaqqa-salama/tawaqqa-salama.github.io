# WhatsApp Business Platform — تكامل التسويق وCRM

## نظرة عامة

قناة رسمية عبر **WhatsApp Cloud API (Meta)** مربوطة بعمود CRM الحالي (`clients`) دون إنشاء نظام عملاء موازٍ.

التدفق:

```
WhatsApp → Webhook → CRM (clients) → Lead → Opportunity → عرض سعر → مشروع
```

## متغيرات البيئة

انظر `.env.example`:

- `WHATSAPP_PROVIDER=meta`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_ACCESS_TOKEN` — سرّ خادم فقط
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET` — للتحقق من `X-Hub-Signature-256`
- `WHATSAPP_API_VERSION` (افتراضي `v21.0`)
- `WHATSAPP_TOKEN_ENCRYPTION_KEY` (اختياري)

## Webhook URL

سجّل في Meta Developer Console:

```
https://YOUR_HOST/api/integrations/whatsapp/webhook
```

- GET: تحقق الاشتراك (`hub.verify_token`)
- POST: رسائل + حالات التسليم (توقيع مطلوب عند ضبط `WHATSAPP_APP_SECRET`)

المسار مستثنى من جلسة الدخول في `middleware.ts`.

## قاعدة البيانات

نفّذ:

```bash
npm run db:apply-dds
```

يشمل `scripts/sql/031_whatsapp_crm.sql`.

## Abstraction

`WhatsAppProvider` في `lib/whatsapp/provider/`:

- `MetaWhatsAppProvider`
- `StubWhatsAppProvider` (اختبارات / بدون مفاتيح)

يمكن لاحقًا إضافة Twilio / 360dialog دون إعادة بناء CRM.

## ربط CRM (إلزامي)

- العميل = صف `clients` فقط (لا جدول Customer موازٍ).
- البحث بالهاتف عبر `crm-bridge` (يدعم `05…` / `966…` / `+966…`).
- رقم جديد → `nextLeadCode()` + إدخال بنفس نمط التسويق (`pipeline_stage=marketing`, `lead_source=WhatsApp`).
- فرصة بيع → `pipeline_stage=sales` (نفس convert-to-sales) ثم `/sales` لعرض السعر.
- `WHATSAPP_FORCE_MEMORY=true` أو وضع demo بدون Supabase = اختبارات فقط.

## ملاحظات تشغيل

- GitHub Pages (static export) لا يشغّل Webhook — يلزم استضافة Node.
- الرسائل الحرة فقط ضمن نافذة 24 ساعة؛ خارجها استخدم Templates.
- Access Token في env فقط — لا Frontend ولا نص مكشوف في DB.
- جداول واتساب (`whatsapp_*`) عبر `waRepository` → Supabase عند التهيئة.
- لكتابة موثوقة من Webhook استخدم `SUPABASE_SERVICE_ROLE_KEY` على الخادم فقط.
