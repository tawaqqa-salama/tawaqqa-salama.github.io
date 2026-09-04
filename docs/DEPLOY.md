# نشر المنصة — مستودع واحد

كل شيء في **`tawaqqa-salama/tawaqqa-salama.github.io`**:

- الكود المصدري (Next.js) على الفرع `main`
- **واجهات ثابتة** عبر GitHub Pages → **https://tawaqqa-salama.github.io/**
- **ERP حي (API + ZATCA)** عبر استضافة Node (Vercel موصى به) — انظر **[NODE_DEPLOYMENT.md](./NODE_DEPLOYMENT.md)** و **[P0_PRODUCTION.md](./P0_PRODUCTION.md)**

لا حاجة لمستودع `taha` منفصل ولا لـ `USER_PAGES_TOKEN`.

## مساران للنشر

| المسار | Workflow | `app/api` | متى تستخدمه |
|--------|----------|-----------|-------------|
| GitHub Pages | `deploy-pages.yml` | يُخفى أثناء البناء | عرض عام / بدون ZATCA حي (fallback مؤقت) |
| Node / Vercel | تكامل Vercel + `deploy-node.yml` للتحقق | يبقى | إنتاج محاسبة + فوترة + Knowledge API |

خطوات إنشاء مشروع Vercel والتحقق قبل قطع الدومين: **[NODE_DEPLOYMENT.md](./NODE_DEPLOYMENT.md)**.

## تفعيل Pages (مرة واحدة)

1. افتح: https://github.com/tawaqqa-salama/tawaqqa-salama.github.io/settings/pages  
2. **Source** → **GitHub Actions**  
3. احفظ

بعد كل دفع على `main` (أو تشغيل يدوي للـ workflow) يُبنى الموقع ويُنشر.

Workflow: `.github/workflows/deploy-pages.yml`

## البناء محلياً

```bash
# واجهة ثابتة (مثل Pages)
npm run build:user-pages
# المخرجات في ./out

# استضافة Node مع API
npm run build && npm start
```

## Supabase

بدون مفاتيح يعمل وضع تجريبي (dev / Pages).  
للإنتاج Node: اضبط المفاتيح ولا تفعّل `ALLOW_DEMO_MODE` إلا للعرض.  
انظر **[SUPABASE.md](./SUPABASE.md)** و **[P0_PRODUCTION.md](./P0_PRODUCTION.md)**.
