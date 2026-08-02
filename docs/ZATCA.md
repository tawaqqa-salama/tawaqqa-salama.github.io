# ZATCA Phase 2 — الفوترة الإلكترونية

هيكلية الربط مع هيئة الزكاة والضريبة والجمارك داخل المنصة.

## المكونات

| المسار | الوظيفة |
|---|---|
| `lib/zatca/engine.ts` | UUID + Previous Invoice Hash + Hash + بناء الفاتورة |
| `lib/zatca/ubl-xml.ts` | تحويل الفاتورة إلى UBL 2.1 XML |
| `lib/zatca/qr.ts` | QR Phase 2 (TLV tags 1–9) |
| `lib/zatca/api-client.ts` | Onboarding + Reporting/Clearance HTTP |
| `lib/zatca/submit.ts` | إرسال تلقائي عند اعتماد عرض السعر |
| `app/api/zatca/onboard` | API تسجيل الجهاز (CSID) |
| `app/api/zatca/submit` | API إرسال الفاتورة |
| `app/api/zatca/status` | استعلام حالة فاتورة |
| `app/settings/zatca` | شاشة OTP / CSID / البيئة |

## تفعيل

1. نفّذ SQL: `scripts/sql/018_zatca_einvoicing.sql` ثم `scripts/sql/021_tax_invoices_milestones.sql`
2. عبّئ **معلومات الشركة** (الرقم الضريبي إلزامي)
3. من **الإعدادات → ZATCA**: فعّل الربط، اختر Sandbox/Production، أدخل OTP + CSR
4. اضغط **تسجيل الجهاز** للحصول على Compliance CSID
5. عند اعتماد عرض سعر (`معتمد` / `بانتظار السداد`) تُنشأ فاتورة ويُستدعى ZATCA تلقائياً
6. عند اعتماد العقد تُقترح **فاتورة الدفعة المقدمة**؛ عند اكتمال مرحلة هندسية تُقترح فاتورة الدفعة المرتبطة
7. الإصدار اليدوي من **المبيعات → الفواتير الضريبية** أو **المالية → الفواتير الضريبية** أو زر **اصدار فاتورة جديدة**

## أنواع الفواتير

| النوع | الشرط | المسار ZATCA |
|---|---|---|
| قياسية STANDARD (B2B) | عميل بمنشأة / سجل تجاري / رقم ضريبي | Clearance |
| مبسطة SIMPLIFIED (B2C) | فرد / مالك بدون VAT | Reporting + QR Phase 2 |

## API

- `POST /api/invoices/generate-from-milestone` — `{ clientId, milestoneId?, percentage?, triggerSource?, submitToZatca? }`
- `POST /api/zatca/submit` — إرسال XML إلى ZATCA

## ملاحظة النشر

واجهات `/api/zatca/*` تحتاج بيئة Node (مثل `next start` أو Vercel).  
بناء GitHub Pages الثابت يخفي مجلد `app/api` أثناء `output: export`؛ محرك التوليد (XML/Hash/QR) يعمل في الواجهة، أما استدعاء ZATCA الحي فيحتاج السيرفر لتجاوز CORS وحفظ المفاتيح.
