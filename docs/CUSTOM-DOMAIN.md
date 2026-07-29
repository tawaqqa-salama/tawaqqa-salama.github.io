# ربط دومين مخصص لمنصة توقع سلامة

الرابط الحالي على GitHub Pages:
`https://engt66.github.io/taha/`

عشان يصير الرابط بدون `engt66.github.io` تحتاج دومين تملكه، مثل:

| مقترح | مثال |
|--------|------|
| مفضّل | `tawaqqa-salama.com` |
| بديل | `tawaqqasalama.com` |
| سعودي | `tawaqqa-salama.sa` (إن توفر) |

## الخطوات

### 1) شراء الدومين
من أي مزود (Namecheap، GoDaddy، Cloudflare Registrar، …).

### 2) إعداد DNS عند مزود الدومين

للدومين الجذري `tawaqqa-salama.com`:

| Type | Name | Value |
|------|------|--------|
| `A` | `@` | `185.199.108.153` |
| `A` | `@` | `185.199.109.153` |
| `A` | `@` | `185.199.110.153` |
| `A` | `@` | `185.199.111.153` |
| `AAAA` | `@` | `2606:50c0:8000::153` |
| `AAAA` | `@` | `2606:50c0:8001::153` |
| `AAAA` | `@` | `2606:50c0:8002::153` |
| `AAAA` | `@` | `2606:50c0:8003::153` |
| `CNAME` | `www` | `engt66.github.io` |

### 3) تفعيل الدومين في GitHub Pages
1. افتح: `https://github.com/engt66/taha/settings/pages`  
   (أو المستودع بعد إعادة التسمية)
2. تحت **Custom domain** اكتب الدومين مثل: `tawaqqa-salama.com`
3. Save
4. فعّل **Enforce HTTPS** بعد ما يظهر أخضر

### 4) أخبر الوكيل
بعد شراء الدومين وكتابته هنا، نرفع ملف `CNAME` على فرع `gh-pages` ونثبت الإعداد.

## ملاحظة
بدون شراء دومين، GitHub ما يوفّر رابطًا نظيفًا بدون `username.github.io`.
