# FINAL EXISTING REPORT DOCUMENT POLISH — QA

## نطاق الجولة

هذه الجولة محصورة في طبقة عرض تقرير EXISTING: تخطيط A4، التفاف الجداول، RTL/Bidi، pagination، الملخص التنفيذي، التوصيات، صفحة الاعتماد، والهوية البصرية الداخلية. لم تتغير دلالة نموذج التقرير أو بيانات التقييم أو الحسابات أو مسار UNDER_CONSTRUCTION.

## Before → After

| المشكلة قبل الجولة | المعالجة | النتيجة بعد الجولة |
|---|---|---|
| نصوص عربية طويلة في خلايا الجداول تظهر مضغوطة أو قابلة للقص | إزالة قيود الارتفاع، اعتماد wrapping فعلي، `table-layout: fixed` مع خلايا مرنة، ومحاذاة عمودية أعلى | لا خلايا مقصوصة، ولا خروج أفقي، والنص الطويل في Fire Pumps يلتف داخل الخلية |
| القيم المختلطة مثل `350 GPM` و`8 bar` و`100 m³` معرضة لانقلاب الترتيب | عزل القيم الهندسية داخل `bdi` بــ`dir="ltr"` عند الحاجة و`unicode-bidi: isolate` | القيم canonical نفسها محفوظة وتظهر ككتل هندسية مقروءة |
| عنوان قسم قد يظهر دون محتوى ذي معنى تحته | قاعدة عامة `break-after: avoid-page` للعناوين وربطها بأول paragraph/table/reference | لا orphan major headings في PDF الناتج |
| counters الملخص مدفونة داخل جدول طويل | تحويل counters نفسها إلى مؤشرات طباعة مبكرة مشتقة من النموذج | إجمالي البنود، مطابق، غير مطابق، يحتاج استكمال، ولا ينطبق ظاهرة بوضوح؛ الأرقام unchanged |
| الأولوية الفارغة قد تبدو كأن النظام نسيها أو حسبها | عرض `غير محددة من المهندس` فقط عند غياب priority | لا استنتاج High/Medium/Low ولا عاجل/متوسط/منخفض |
| الصفحة الداخلية تستخدم accent أحمر غير منسجم مع الغلاف | استبدال accent الأحمر داخل قالب EXISTING بدرجات teal/gold | هوية داخلية متناسقة وخلفية بيضاء للطباعة |
| صفحة الاعتماد تحتوي فراغًا سفليًا غير متوازن | توسيع مناطق التوقيع والختم وإضافة مساحة ملاحظات اعتماد فارغة منظمة | صفحة اعتماد مستقلة ومتوازنة دون اختراع بيانات |
| كثافة الغلاف والدوائر حول العنوان غير متوازنة | polish محدود: رفع كتلة العنوان وتقليل مدارات الزخرفة | dark blue/teal/gold identity محفوظة مع توازن أفضل |

## نتائج PDF الفعلي

| الفحص | النتيجة |
|---|---|
| مسار التوليد | Download PDF fixture path نفسه |
| عدد الصفحات | 13 |
| صفحات فارغة | 0 |
| صفحات شبه فارغة بسبب pagination bug | 0 |
| الأنظمة المقيمة المرسومة | 25/25 |
| Summary counters | 25 إجماليًا، 7 مطابق، 4 غير مطابق، 10 يحتاج استكمال، 4 لا ينطبق |
| Required assessment fields | الوضع الراهن، المطلوب، الفجوة، حالة المطابقة، الإجراء، المرجع/الدليل |
| Raw internal terms | 0 |
| Numeric zero placeholders | 0 |
| Arabic font embedding | Noto Naskh Arabic Regular/Bold embedded with `emb=yes`, `uni=yes` |
| Visual page review | الصفحات 1–13 فُحصت بصريًا من PNG المشتق من PDF |

## Scope proof

| الضمان | الحالة |
|---|---|
| EXISTING model semantics | UNCHANGED |
| Existing assessment data | UNCHANGED |
| Compliance calculation/derivation | UNCHANGED |
| Hydraulic calculations | UNCHANGED |
| Design Center calculations | UNCHANGED |
| UNDER_CONSTRUCTION | UNCHANGED |
| Project classification | UNCHANGED |
| Workflow/Gates | UNCHANGED |
| Database/Migration | NO |
| RLS/Storage | NO |
| Production writes | NO |

## Regression gates

Targeted Vitest: PASS (13/13). Full Vitest: PASS (1123 passed, 2 skipped). TypeScript: PASS. Scoped ESLint: PASS. Next production build: PASS. Static Export: PASS. `git diff --check`: PASS.

لا يوجد Merge أو Deploy أو Production Smoke Test ضمن هذه الجولة.
