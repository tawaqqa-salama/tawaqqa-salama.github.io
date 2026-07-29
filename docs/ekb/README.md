# قاعدة المعرفة الهندسية (EKB) — منصة توقع

مكتبة معرفية هندسية لاستشارات السلامة والوقاية من الحريق.

> المكتبات المعرفية هنا مرجع هندسي. الربط التشغيلي بخيارات المنصة موثّق في [SBC-LINK.md](./SBC-LINK.md) ومنفّذ في `lib/constants` و`lib/business`.

## الوثائق

| الملف | الوصف |
|--------|--------|
| [EKB-v1.0.md](./EKB-v1.0.md) | المواصفة الكاملة — الإصدار ١.٠ بتاريخ ٢٠٢٦-٠٧-٢٦ — **معتمد للمرحلة الأولى** |
| [libraries/](./libraries/) | مكتبات تفصيلية لكل باب وموضوع |

## المكتبات

| الملف | الموضوع |
|--------|---------|
| [codes-and-standards.md](./libraries/codes-and-standards.md) | الأكواد والمعايير |
| [SBC-LINK.md](./SBC-LINK.md) | ربط SBC 801/201 بأنشطة المنصة |
| [sources/](./sources/) | ملفات مرجعية (موجز SBC 801 وخريطة 201/801) |
| [activities.md](./libraries/activities.md) | الأنشطة |
| [building-types.md](./libraries/building-types.md) | أنواع المباني |
| [occupancy.md](./libraries/occupancy.md) | أنواع الإشغال |
| [hazardous-materials.md](./libraries/hazardous-materials.md) | المواد الخطرة |
| [suppression-systems.md](./libraries/suppression-systems.md) | أنظمة الإطفاء |
| [alarm-devices.md](./libraries/alarm-devices.md) | أجهزة الإنذار |
| [equipment.md](./libraries/equipment.md) | المعدات |
| [calculations.md](./libraries/calculations.md) | الحسابات الهندسية |
| [installation-details.md](./libraries/installation-details.md) | التفاصيل التنفيذية |
| [report-templates.md](./libraries/report-templates.md) | النماذج والتقارير |
| [faq.md](./libraries/faq.md) | الأسئلة الشائعة |
| [common-errors.md](./libraries/common-errors.md) | الأخطاء الشائعة |
| [lessons-learned.md](./libraries/lessons-learned.md) | الدروس المستفادة |
| [reference-drawings.md](./libraries/reference-drawings.md) | الرسومات المرجعية |
| [approved-products.md](./libraries/approved-products.md) | المنتجات المعتمدة (أمثلة) |
| [updates-log.md](./libraries/updates-log.md) | سجل التحديثات |
| [engineering-decisions.md](./libraries/engineering-decisions.md) | القرارات الهندسية |
| [scenarios.md](./libraries/scenarios.md) | السيناريوهات |
| [risks.md](./libraries/risks.md) | المخاطر |
| [corporate-knowledge.md](./libraries/corporate-knowledge.md) | المعرفة المؤسسية |

## علاقة DDS

التخزين والحقول والعلاقات معرّفة في [docs/dds](../dds/) — خصوصاً `knowledge_articles` و`compliance_rules` وجداول `ref_*`.

كتالوج EKB في قاعدة البيانات (محتوى معرفي): `scripts/sql/008_ekb_catalog.sql` عبر `npm run db:apply-dds`.
