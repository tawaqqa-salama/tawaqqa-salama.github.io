
## Arabic PDF visual check — generated PDF itself

- `pdffonts` confirms embedded `NotoNaskhArabic-Bold` and `NotoNaskhArabic-Regular`, both CID TrueType with embedding and Unicode maps enabled.
- Cover screenshot: Arabic title, subtitle, company text, labels, and metadata appear connected and naturally shaped; no visibly fragmented Arabic words observed.
- Assessment screenshot: Arabic labels and paragraphs appear connected across table cells. Mixed tokens `FDC`, `350 GPM`, `8 bar`, and `100 m³` remain readable without visibly breaking surrounding Arabic.
- Text extraction contains shaped-font glyph spacing artifacts typical of CID/ToUnicode extraction, but the visual PDF raster is the acceptance surface for this task; no visual fragmentation was observed in the inspected pages.

## Pages 2–3

الفهرس مستقل ومنظم بعناوين عربية متصلة، مع فراغ سفلي مقصود في صفحة المحتويات ولا توجد عناصر متصفح أو قص. صفحة بيانات المشروع والمبنى تعرض العناوين والحقول العربية متصلة بصريًا، كما تبقى القيم المختلطة مثل 850 m² وTR-OFFICIAL-FIX-01 مقروءة.

## Pages 4 and 6

صفحة المراجع والملخص تعرض العربية متصلة في العناوين والجداول والفقرات. بطاقات المياه والخزان والمضخات تعرض النص العربي متصلًا، مع ظهور `350 GPM` و`8 bar` و`100 m³` داخل الجمل دون تفكك مرئي أو قص أفقي. الانقسام بين البطاقات بقي عند حدود دلالية آمنة.

## Pages 7–8

تشكيل العربية في بطاقات أنظمة الإطفاء الخاصة والطفايات ولوحة الإنذار وكواشف الدخان والحرارة ونقاط النداء وأجهزة التنبيه متصل بصريًا. ظهرت `FDC` و`NFPA` ضمن النصوص دون تفكيك ظاهر، ولم تظهر صفوف منقسمة أو عناصر خارج حدود الصفحة.

## Pages 9–10

تظهر بطاقات التهوية الميكانيكية والتحكم بالدخان وإنارة الطوارئ ولوحات المخارج ووسائل الهروب والسلامة الكهربائية بالعربية المتصلة. العناوين والحقول RTL، والجداول محافظة على حدودها، ولا توجد صفوف منقسمة أو قص أو horizontal overflow.

## Pages 11–12

بيانات القدرة الاحتياطية والمراجع الهندسية تظهر بعربية متصلة. القيم المختلطة `100 m³` و`1324.89 L/min` و`350 GPM` و`8 bar` و`K80` و`1.5 bar` مقروءة بصريًا دون كسر في الكلمات العربية المحيطة. جداول المضخات والرش والإنذار بلا قص أو overflow.

## Pages 13–14

التوصيات والخلاصة وحدود الدراسة تظهر بعربية متصلة في الصفحة 13، وجدول الإجراءات لا يتجاوز حدود الصفحة. صفحة الاعتماد مستقلة في الصفحة 14، وعناوين الاعتماد والتوقيعات والختم عربية متصلة، مع مساحة توقيع/ختم مقصودة وليست صفحة فارغة غير متوقعة.

## Overall visual result

تم فحص الصفحات الأربع عشرة الناتجة بصريًا من صور PDF الفعلي بعد التوليد. لم تُلاحظ كلمات عربية مجزأة بصريًا، أو clipping، أو horizontal overflow، أو row/card split. بقي استخراج النص الآلي أقل موثوقية من الصورة بسبب طبيعة CID/ToUnicode، لكن `pdffonts` أثبت تضمين خطوط Noto Naskh Arabic ذات Unicode maps.

## Font and encoding gate

بوابة `test-arabic-pdf-encoding.ts` نجحت بعد جعلها تختار `CHROME_BIN` أو Chromium المتاح. النتيجة: `ok=true`, لا كلمات عربية مفقودة، لا corruption tokens، لا URL للموقع، وكل أكواد NFPA/SBC المطلوبة موجودة. فحص `pdffonts` للـfixture يثبت تضمين `NotoNaskhArabic-Bold` و`NotoNaskhArabic-Regular` مع `emb=yes`, `sub=yes`, و`uni=yes`. أضيف انتظار `document.fonts.ready` وتحميل أوزان 400/700/900 قبل التقاط html2canvas، كما أضيفت تعريفات 800/900 للخط المضمّن وأصبح `letter-spacing: normal` للنص العام.
