# ربط Supabase

بدون المفاتيح يعمل الموقع بوضع تجريبي (بيانات وهمية).  
Next.js يدمج `NEXT_PUBLIC_*` وقت البناء، لذلك تُضاف كأسرار GitHub ثم يُعاد النشر.

## 1) انسخ المفاتيح من Supabase

1. https://supabase.com/dashboard  
2. مشروعك → **Project Settings** → **API**  
3. انسخ:
   - **Project URL**
   - **anon public** (ليس `service_role`)

## 2) أضف الأسرار هنا

https://github.com/tawaqqa-salama/tawaqqa-salama.github.io/settings/secrets/actions

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | رابط المشروع |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح anon |

## 3) أعد النشر

https://github.com/tawaqqa-salama/tawaqqa-salama.github.io/actions/workflows/deploy-pages.yml  
→ **Run workflow**

## Auth URLs في Supabase

- Site URL: `https://tawaqqa-salama.github.io`
- Redirect URLs: `https://tawaqqa-salama.github.io/**`

## تفعيل بريد الموظفين (مهم)

عند إنشاء موظف يظهر أحياناً `Email not confirmed` أو «الحساب موجود من قبل» لأن Supabase يطلب تأكيد الإيميل.

1. شغّل في Supabase → SQL:
   `scripts/sql/015_provision_employee_auth.sql`
2. من شاشة المستخدمين: أعد حفظ الموظف مع كلمة المرور (المدير يفعّل الحساب تلقائياً).

اختياري: Authentication → Providers → Email → عطّل **Confirm email** إذا كنت لا تريد رسائل التأكيد أصلاً.

## محلياً

```bash
cp .env.example .env.local
# عدّل القيم
npm run dev
```
