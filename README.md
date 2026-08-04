# منصة توقع سلامة

منصة استشارات السلامة والوقاية من الحريق (Next.js + Supabase).

**الرابط:** https://tawaqqa-salama.github.io/

## مستودع واحد

هذا المستودع فيه الكود المصدري والنشر معاً (GitHub Actions → Pages).  
لا تستخدم ملفات البناء الثابتة (`_next/`, HTML جاهز) كمصدر للتعديل.

| دليل | الغرض |
|---|---|
| [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) | حالة التنفيذ (منجز / جزئي / معلّق) |
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | النشر |
| [`docs/SUPABASE.md`](./docs/SUPABASE.md) | ربط قاعدة البيانات |
| [`docs/AUTH.md`](./docs/AUTH.md) | الدخول والصلاحيات |

## التطوير المحلي

```bash
cp .env.example .env.local   # اختياري — بدونها وضع تجريبي
npm install
npm run dev
```

افتح http://localhost:3000

## وثائق إضافية

- DDS: [`docs/dds/DDS-v1.0.md`](./docs/dds/DDS-v1.0.md)
- EKB: [`docs/ekb/EKB-v1.0.md`](./docs/ekb/EKB-v1.0.md)
