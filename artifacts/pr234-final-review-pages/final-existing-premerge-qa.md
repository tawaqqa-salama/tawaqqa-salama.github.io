# PR #234 — FINAL EXISTING REPORT PRE-MERGE QA

## Scope

هذه الجولة محصورة في قالب التقرير الفني لمسار `EXISTING` وطبقة العرض والطباعة/التنزيل والـfixture والاختبارات المرتبطة بها. لا تغيّر الجولة نموذج التقييم أو البيانات الكانونية أو الحسابات أو مسار `UNDER_CONSTRUCTION` أو Workflow أو قاعدة البيانات أو التخزين.

## Final PDF

تم توليد PDF فعلي من fixture EXISTING باستخدام Chromium، وعدد الصفحات الفعلي **15 صفحة A4**. لا توجد صفحات فارغة. صفحة الاعتماد مستقلة في الصفحة 15، وصفحة الملخص والخلاصة في الصفحة 14. الزيادة من 14 إلى 15 ناتجة عن الحفاظ على صفحة اعتماد مستقلة وعدم ضغطها داخل صفحة التوصيات.

## Required corrections

| المتطلب | النتيجة |
|---|---|
| KPI مباشرة بعد عنوان القسم 4 | PASS |
| KPI كاملة داخل A4 | PASS — 25، 7، 4، 10، 4 |
| فصل الحالات وعدم استنتاج compliance | PASS |
| `K = 80` في العرض دون تغيير canonical `K80` | PASS |
| القيم الهندسية mixed-unit معزولة Bidi | PASS |
| الفهرس بلا أرقام تقريبية خاطئة | PASS — safe fallback `—` |
| عدم تسرب هوية fixture | PASS |
| لا raw internal enum names | PASS |
| صفحة اعتماد مستقلة | PASS |
| لا قص أو overflow بصري في contact sheet | PASS |

## Canonical counters

القيم مشتقة من `ExistingTechnicalReportModel` وليست hard-coded في renderer: إجمالي البنود المقيمة 25، مطابق 7، غير مطابق 4، يحتاج استكمال 10، ولا ينطبق 4.

## TOC decision

فشلت معايرة DOM runtime في تمثيل أرقام صفحات PDF المطبوعة لأن screen coordinates لا تطابق pagination النهائية في Chromium. لذلك أزيلت أرقام الصفحات التقريبية تمامًا، وأصبح الفهرس يعرض شرطة طويلة `—` بدل معلومة مضللة. أرقام الأقسام 01–09 صحيحة، ولن تُعرض أرقام صفحات إلا بعد إضافة مسار multi-pass يستخرج خريطة الصفحات من PDF بعد اكتمال الطباعة.

## Identity leakage gate

بوابة التسرب لا تجد `FIXTURE` أو `DEMO` أو `MOCK` أو `OFFICIAL-FIX` أو هوية اختبار داخل النص المستخرج من PDF. وفي الوقت نفسه تبقى القيم الهندسية المشروعة المستخدمة للاختبار مثل `NFPA` و`GPM` مسموحة.

## Quality gates

| Gate | Result |
|---|---|
| Targeted Vitest | PASS — 6/6 EXISTING document tests |
| Arabic PDF encoding | PASS — `ok: true`, no missing Arabic, no corruption, no URL |
| Full Vitest | PASS — 155 files, 1123 passed, 2 skipped |
| TypeScript | PASS |
| Scoped ESLint | PASS |
| `git diff --check` | PASS |
| Next production build | PASS |
| Static Export (`npm run build:user-pages`) | PASS |

## Safety

لم تُنفذ أي كتابة Production أو Storage أو Workflow transition أو Migration أو RLS change أو classification change. لم يبدأ مسار `UNDER_CONSTRUCTION`. لم يُنفذ Merge أو Deploy.

## Final status

**PR #234 READY FOR REVIEW — NO MERGE / NO DEPLOY**
