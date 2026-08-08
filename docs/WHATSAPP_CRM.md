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

## ملاحظات تشغيل

- GitHub Pages (static export) لا يشغّل Webhook — يلزم استضافة Node.
- الرسائل الحرة فقط ضمن نافذة 24 ساعة؛ خارجها استخدم Templates.
- Access Token لا يُرسل للواجهة أبدًا.
- محرك المعالجة يعمل على store داخل العملية مع مرآة Supabase (`supabase-sync`) عند توفر المفاتيح وسكربت `031`.
- لكتابة موثوقة من Webhook استخدم `SUPABASE_SERVICE_ROLE_KEY` على الخادم فقط.
