# P1 — جاهزية التشغيل اليومي

هذا المستند يلخّص ما أُنجز لمسار P1 وكيفية تفعيله.

## 1) المحاسبة المؤسسية ↔ Supabase
- الخدمة: `lib/enterprise-accounting/supabase-sync.ts`
- الواجهة: `/finance/enterprise` تعرض مصدر البيانات (حي / تجريبي)
- طبّق الجداول: `npm run db:apply-dds` (يشمل الآن `021`–`028`)

## 2) تصدير إقرار VAT
- التقارير: `/finance/reports` → زر **تصدير CSV للإقرار**
- أيضاً من تبويب VAT في المحاسبة المؤسسية
- الملفات: `lib/finance/vat-export.ts`

## 3) التسوية البنكية
- تبويب **البنوك** في `/finance/enterprise`
- استيراد CSV + مطابقة ذكية مع القيود
- `lib/finance/bank-reconciliation.ts`

## 4) WhatsApp / OTP
- أضف إلى `.env.local`:
  - `WHATSAPP_WEBHOOK_URL` (+ اختياري `WHATSAPP_WEBHOOK_TOKEN`)
  - أو `SMS_OTP_WEBHOOK_URL` لـ OTP مخصّص عند تعطّل Supabase SMS
- انظر `.env.example`

## 5) تخزين ملفات المشاريع
- Bucket: `project-files` (SQL `028_project_files_storage.sql`)
- الرفع من مرحلة 2 يستخدم Storage مع سقوط احتياطي لـ dataUrl

## 6) اختبارات الدخان
```bash
npm test
```
يغطي: قواعد الترحيل، توصية SBC، تصدير VAT، مطابقة بنك، stub واتساب.
