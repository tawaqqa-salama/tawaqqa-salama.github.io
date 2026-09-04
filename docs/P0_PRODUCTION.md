# P0 — تثبيت الإنتاج

## ماذا أُنجز
1. **middleware** + كوكي `tawaqqa_auth` httpOnly لحماية الصفحات و`/api/*`
2. **RLS مستأجر** عبر `029_rls_tenant_lockdown.sql` (`current_app_company_id()`)
3. **ZATCA على السيرفر فقط** في إنتاج Node — لا يُرسل CSID/Secret من المتصفح
4. **Fail-closed** للعمليات المالية الحرجة بدون Supabase (ما عدا Pages/demo المصرّح)
5. **CI Node** — `.github/workflows/deploy-node.yml` (typecheck + test + build بدون `output: export`)

## استضافة موصى بها (ERP حي)
| المضيف | API | الاستخدام |
|--------|-----|-----------|
| **Vercel / Node `next start`** | نعم | الإنتاج الحقيقي + ZATCA |
| GitHub Pages | لا | واجهة عرض / تسويق فقط |

### تفعيل Vercel
الدليل التفصيلي (مع التحقق وRollback مع بقاء Pages): **[NODE_DEPLOYMENT.md](./NODE_DEPLOYMENT.md)**.

1. اربط المستودع بـ Vercel
2. Environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `AUTH_SESSION_SECRET` (server-only)
   - لا تضبط `USER_PAGES` أو `GITHUB_PAGES` أو `NEXT_PUBLIC_STATIC_EXPORT`
3. طبّق SQL: `npm run db:apply-dds` (يشمل 029) — لا تغيّر بيانات Production من Cursor
4. تأكد أن مستخدمي النظام لديهم `users.auth_user_id` مربوط بـ Supabase Auth

### متغيرات اختيارية
```
ALLOW_DEMO_MODE=true          # للعرض فقط
ZATCA_SERVER_ONLY=true        # فرض مسار السيرفر
NEXT_PUBLIC_ZATCA_SERVER_ONLY=true
```

## ملاحظات أمنية
- بعد 029: `anon` لا يملك DML على الجداول المالية/ZATCA
- تسجيل الدخول الحقيقي يجب أن يمر عبر `supabase.auth` حتى يعمل `auth.uid()` مع RLS
- كوكي الجلسة بوابة للتطبيق؛ RLS هو خط الدفاع على قاعدة البيانات
