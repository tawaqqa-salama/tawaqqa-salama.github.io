# PR 7 EXISTING — Visual QA checkpoint 1

- Fixture PDF: `/tmp/existing-final-technical-report-pdf/official-technical-report.pdf`
- Pages: 6
- Blank pages: none
- Internal diagnostic terms: none

## Page 1 — Cover

الغلاف مستقل بهوية توقع، بخلفية داكنة هندسية، شعار المكتب، عنوان التقرير النهائي، اسم المشروع والمالك ورقم التقرير والتاريخ والإصدار. لا توجد عناصر متصفح أو مسارات تقنية ظاهرة.

## Page 2 — Table of Contents

الفهرس منفصل عن الغلاف ويظهر بخطوط الإرشاد وعناوين الأقسام. الهامش العلوي والسفلي ثابتان، والهيدر والفوتر الرسميان ظاهران بصورة منظمة. لا توجد صفحة فارغة أو قص بصري ظاهر في الصفحتين المفحوصتين.

يستمر الفحص بصور الصفحات 3–6 مع التركيز على مصفوفة الوضع الراهن/المطلوب/الفجوة/المطابقة/الإجراء، القيم الهندسية، التوصيات، والخلاصة.

## Page 3 — Project information and assessment introduction

البيانات الأساسية تظهر في جدول A4 بحدود واضحة، والهيدر والفوتر الرسميان ثابتان. مصفوفة التقييم تبدأ بعد مقدمة الملخص، ولا تظهر identifiers أو diagnostics خام. يوجد فراغ سفلي بسبب قلة بيانات fixture، وليس صفحة فارغة.

## Page 4 — Engineering values

إمداد المياه والخزان، المضخات، ونظام الرش تظهر في جداول مستقلة. الوحدات موحّدة بصيغة القيمة ثم الوحدة مثل `350 GPM` و`8 bar` و`100 m³`. لا توجد صفوف منقسمة أو قص ظاهر، ولا تظهر مصطلحات source أو workflow.

## Page 5 — Alarm and recommendations

جدول إنذار الحريق واضح، ثم تظهر التوصيات والخلاصة وحدود الدراسة بنص مقروء. الفراغ السفلي ناتج عن انتهاء المحتوى قبل نهاية صفحة A4 وليس صفحة فارغة، ولا توجد عناصر تشخيصية أو قيم مصدرية خام.

## Page 6 — Approval page

صفحة اعتماد مستقلة بمساحة توقيع وختم مقصودة، مع حدود واضحة وهيدر وفوتر ثابتين. لا يوجد قص أو تداخل، والفراغ الواسع مقصود للتوقيعات وليس عيب pagination.

## Overall visual result

- Page count: 6
- Blank pages: 0
- Semantic tables are kept together and no split row was observed in fixture.
- Cover, TOC, project information, engineering values, recommendations, limitations, and approval page are all present.
- The fixture currently has sparse assessment data, so whitespace on pages 3, 5, and 6 is expected and not a blank-page defect.

## Mobile 375 preview checkpoint

لقطة Chromium المباشرة لـ`file://` بعرض 375px خرجت بيضاء رغم أن PDF وHTML المحليين يحتويان على المحتوى. لا تُعتبر هذه النتيجة PASS للمعاينة؛ يلزم استخدام مسار معاينة فعلي/انتظار تحميل listener أو توثيق أن لقطة file URL غير صالحة لقياس المعاينة. PDF A4 نفسه اجتاز الفحص البصري السابق.

## Mobile 375 final result

بعد تقديم HTML عبر HTTP محلي وإضافة responsive screen rules لمسار EXISTING فقط، ظهرت لقطة الغلاف بعرض 375px بصورة كاملة. العنوان والجدول التفصيليان ملتفان داخل viewport، ولا يوجد قص أو horizontal overflow ظاهر في اللقطة. النتيجة: PASS للغلاف/المعاينة الضيقة في fixture.

## Page QA matrix

| الصفحة | المحتوى | RTL | Typography | Tables/Cards | Page break | Whitespace | Clipping | Overflow | النتيجة |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | غلاف وهوية توقع | PASS | PASS | PASS | غلاف مستقل | متوازن | لا يوجد | لا يوجد | PASS |
| 2 | فهرس المحتويات | PASS | PASS | PASS | فهرس مستقل | فراغ مقصود | لا يوجد | لا يوجد | PASS |
| 3 | مقدمة وبيانات المشروع والملخص | PASS | PASS | PASS | عناوين مع المحتوى | فراغ ناتج عن fixture sparse | لا يوجد | لا يوجد | PASS |
| 4 | الخزان والمضخات والرش | PASS | PASS | PASS | لا split rows | مقبول | لا يوجد | لا يوجد | PASS |
| 5 | الإنذار والتوصيات والخلاصة | PASS | PASS | PASS | استمرار منطقي | فراغ ناتج عن انتهاء المحتوى | لا يوجد | لا يوجد | PASS |
| 6 | الاعتماد والتوقيع | PASS | PASS | PASS | صفحة مستقلة | مقصود لمساحة التوقيع | لا يوجد | لا يوجد | PASS |

## Fixture coverage

- **Comprehensive mixed assessment:** موجود في اختبارات النموذج والقالب، ويغطي الحالات الأربع، النص العربي الطويل، الإجراء الصريح، المرجع، والقيم الهندسية.
- **Sparse/missing:** اختبار مستقل يثبت بقاء التقييم محايدًا وعدم تحويل الغياب إلى مطابقة.
- **Long content:** اختبار مستقل يثبت بقاء النص العربي الطويل داخل الوثيقة؛ قواعد الجداول والعناصر الدلالية تمنع split غير الآمن.
