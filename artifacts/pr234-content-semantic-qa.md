# PR #234 — EXISTING Content/Semantic QA

## Scope

هذه الجولة محصورة في محتوى ودلالة قالب التقرير النهائي لمسار `EXISTING`، مع الحفاظ على معمارية التوجيه ومصدر `ExistingTechnicalReportModel` ومسار `UNDER_CONSTRUCTION` دون تغيير. كل البيانات المستخدمة في fixture محلية اصطناعية ولا تمثل بيانات Production.

## Assessment coverage

| Metric | Result |
|---|---:|
| Assessment systems rendered | 25 |
| COMPLIANT | 7 |
| NON_COMPLIANT | 4 |
| NEEDS_COMPLETION | 10 |
| NOT_APPLICABLE | 4 |
| Required matrix fields | 7 |
| Missing numeric values displayed as zero | 0 |
| Automatic compliance conclusions | 0 |
| Automatic recommendations | 0 |
| Raw enums | 0 |
| Raw source paths | 0 |
| Internal diagnostics | 0 |
| Unintentional blank pages | 0 |
| Row/card splits observed | 0 |
| Horizontal overflow observed | 0 |

## Required matrix

كل بطاقة نظام في الـfixture تعرض: **البند/النظام، الوضع الراهن، المطلوب حسب الكود/التصميم، الفجوة، حالة المطابقة، الإجراء المطلوب، والمرجع/الدليل**. الملاحظات الإضافية تُدمج في الوضع الراهن، ولا تُحذف من محتوى التقييم.

## Engineering reference data

القيم الهندسية بقيت داعمة للتقييم وليست بديلًا عنه. يثبت الـfixture ظهور مصدر مياه الحريق، سعة الخزان، الحجم المطلوب المحسوب، تدفقات وضغوط المضخات، عدد المرشات الناتج عن `repeat_count`, نوع الرش، K-Factor، ضغط وتصرف التصميم، وكميات الإنذار والإخلاء.

## Neutral states

عند عدم وجود تقييم مكتمل، يعرض التقرير النص العربي المحايد: «لم يكتمل تقييم بنود الموقع القائم بعد.» ولا يعرض جدول أصفار أو نتيجة مطابقة عامة. كما لا يعرض التوصيات العامة عند غياب الإجراءات؛ ويعرض فقط: «لا توجد إجراءات أو توصيات معتمدة مسجلة حتى الآن.»

## Pagination

تم تقليل عدد صفحات الـfixture من 16 إلى 14 بعد إزالة صف الملاحظات الزائد ودمج حدود الدراسة مع الخلاصة. الغلاف والفهرس والتقييم التفصيلي والبيانات المرجعية والتوصيات والخلاصة وصفحة الاعتماد ظهرت دون صفحة فارغة أو صفحة شبه فارغة غير مقصودة.

## Protected scope

لم تتغير classification routing أو Preview/Print/Download shared-source architecture أو `existing_assessment` persistence أو الحسابات الهيدروليكية أو Design Center أو `repeat_count` أو Workflow أو Database أو Migration أو RLS أو Storage أو قالب ومسار `UNDER_CONSTRUCTION`.
