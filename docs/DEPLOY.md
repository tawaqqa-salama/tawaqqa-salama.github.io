# نشر المنصة — مستودع واحد

كل شيء في **`tawaqqa-salama/tawaqqa-salama.github.io`**:

- الكود المصدري (Next.js) على الفرع `main`
- النشر التلقائي عبر GitHub Actions إلى **https://tawaqqa-salama.github.io/**

لا حاجة لمستودع `taha` منفصل ولا لـ `USER_PAGES_TOKEN`.

## تفعيل Pages (مرة واحدة)

1. افتح: https://github.com/tawaqqa-salama/tawaqqa-salama.github.io/settings/pages  
2. **Source** → **GitHub Actions**  
3. احفظ

بعد كل دفع على `main` (أو تشغيل يدوي للـ workflow) يُبنى الموقع ويُنشر.

Workflow: `.github/workflows/deploy-pages.yml`

## البناء محلياً

```bash
npm run build:user-pages
# المخرجات في ./out
```

## Supabase

بدون مفاتيح يعمل وضع تجريبي. للربط الحقيقي انظر **[SUPABASE.md](./SUPABASE.md)**.
