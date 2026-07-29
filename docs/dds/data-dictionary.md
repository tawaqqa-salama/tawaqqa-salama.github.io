# قاموس البيانات — منصة توقع (DDS v1.0)

مرجع رسمي لأهم الحقول عبر نطاقات المنصة. يُكمّل [DDS-v1.0.md](./DDS-v1.0.md) الباب العشرين.

| الاسم التقني | الاسم المعروض | الوصف | النوع | إلزامي | الافتراضي | القيم المسموحة / التحقق | الوحدة | الجداول | التقارير |
|--------------|---------------|--------|------|--------|-----------|-------------------------|--------|---------|----------|
| `id` | المعرّف | مفتاح أساسي عالمي | `uuid` | نعم | `gen_random_uuid()` | UUID v4 | — | جميع الجداول تقريباً | — |
| `company_id` | الشركة | عزل المستأجر | `uuid` | نعم* | — | FK → `companies` | — | الجداول متعددة المستأجرين | تقارير المستأجر |
| `branch_id` | الفرع | فرع تشغيلي تابع للشركة | `uuid` | لا | `NULL` | FK → `branches` | — | `users`, `clients`, `projects` | تقارير الفروع |
| `client_code` | رمز العميل | معرّف عميل قابل للقراءة | `text` | نعم | مُولَّد | فريد ضمن الشركة (موصى) | — | `clients` | عروض، فواتير، مشاريع |
| `pipeline_stage` | مرحلة المسار | مرحلة دورة العميل | `text` | لا | `marketing` | `marketing` \| `sales` \| `finance` \| `projects` \| `completed` | — | `clients`, `projects` | لوحة المسار |
| `version_no` | رقم الإصدار | إصدار السجل المنطقي | `integer` | نعم | `1` | ≥ 1 | — | معظم الجداول التشغيلية | تدقيق التغييرات |
| `deleted_at` | تاريخ الحذف الناعم | وسم الحذف دون إزالة فيزيائية | `timestamptz` | لا | `NULL` | `NULL` = نشط | — | معظم الجداول | استثناء من القوائم |
| `archived_at` | تاريخ الأرشفة | نقل للأرشيف طويل الأمد | `timestamptz` | لا | `NULL` | — | — | `clients`, `documents`, … | أرشيف |
| `created_at` | تاريخ الإنشاء | وقت إنشاء السجل | `timestamptz` | نعم | `now()` | — | — | معظم الجداول | زمني |
| `updated_at` | تاريخ التحديث | آخر تعديل | `timestamptz` | نعم* | `now()` | — | — | الجداول القابلة للتحديث | تدقيق |
| `created_by` | أنشئ بواسطة | مستخدم الإنشاء | `uuid` | لا | `NULL` | FK منطقي → `users` | — | معظم الجداول | مسؤولية |
| `name` | الاسم | اسم العرض للكيان | `text` | نعم* | — | غير فارغ | — | `companies`, `clients`, `projects`, … | عام |
| `code` | الرمز | رمز مرجعي قصير | `text` | نعم* | — | فريد ضمن النطاق | — | `companies`, `branches`, `ref_*` | MDM |
| `email` | البريد | عنوان بريد إلكتروني | `text` | نعم* | — | صيغة بريد؛ فريد ضمن الشركة للمستخدمين | — | `companies`, `users` | تواصل |
| `phone` | الهاتف | رقم اتصال | `text` | لا | — | أرقام سعودية مفضّلة | — | `clients`, `users` | تواصل |
| `role_code` | رمز الدور | دور المستخدم التشغيلي | `text` | نعم | `staff` | أكواد أدوار الشركة | — | `users` | RBAC |
| `permissions` | الصلاحيات | قائمة صلاحيات JSON | `jsonb` | نعم | `[]` | مصفوفة أكواد | — | `roles` | أمن |
| `lead_status` | حالة العميل المحتمل | حالة التسويق | `text` | لا | `مهتم` | حالات تسويقية عربية | — | `clients` | تسويق |
| `quotation_number` | رقم العرض | رقم عرض السعر | `text` | لا | — | فريد تشغيلياً | — | `clients`, `sales_contracts` | مبيعات |
| `quotation_amount` | مبلغ العرض | صافي قبل الضريبة | `numeric` | لا | `0` | ≥ 0 | ر.س | `clients` | عروض |
| `vat_amount` | ضريبة القيمة المضافة | مبلغ الضريبة | `numeric` | لا | `0` | ≥ 0؛ عادة 15% | ر.س | `clients`, `sales_*`, `vouchers` | مالية |
| `total_amount` | الإجمالي | المبلغ شامل الضريبة | `numeric` | لا | `0` | ≥ 0 | ر.س | `clients`, `sales_*` | مالية |
| `quotation_status` | حالة العرض | دورة اعتماد العرض | `text` | لا | `مسودة` | مسودة / معتمد / بانتظار السداد / … | — | `clients` | مبيعات |
| `financial_status` | الحالة المالية | حالة السداد والترحيل | `text` | لا | `بانتظار الدفعة` | حالات مالية عربية | — | `clients` | مالية |
| `paid_amount` | المدفوع | ما تم تحصيله | `numeric` | لا | `0` | ≥ 0؛ ≤ الإجمالي | ر.س | `clients` | تحصيل |
| `sales_payment_type` | نوع السداد | نقدي أو آجل | `text` | لا | `نقدي` | `نقدي` \| `آجل` | — | `clients` | مبيعات |
| `credit_balance` | رصيد آجل | المتبقي للتحصيل الآجل | `numeric` | لا | `0` | ≥ 0 | ر.س | `clients` | ذمم |
| `doc_type` | نوع مستند المبيعات | عرض أو فاتورة | `text` | نعم | — | `quotation` \| `invoice` | — | `sales_documents` | مبيعات |
| `doc_number` | رقم المستند | رقم العرض/الفاتورة | `text` | نعم | — | غير فارغ | — | `sales_documents` | طباعة |
| `contract_number` | رقم العقد | معرّف العقد | `text` | نعم | — | UNIQUE | — | `sales_contracts` | عقود |
| `account_type` | نوع الحساب | تصنيف دليل الحسابات | `text` | نعم | — | `asset` \| `liability` \| `equity` \| `revenue` \| `expense` | — | `chart_of_accounts` | قوائم مالية |
| `voucher_type` | نوع السند | قبض أو صرف | `text` | نعم | — | `receipt` \| `payment` | — | `vouchers` | سندات |
| `voucher_number` | رقم السند | معرّف السند | `text` | نعم | — | UNIQUE | — | `vouchers` | محاسبة |
| `entry_number` | رقم القيد | معرّف قيد اليومية | `text` | نعم | — | UNIQUE | — | `journal_entries` | يومية |
| `debit` | مدين | مبلغ الجانب المدين | `numeric` | لا | `0` | ≥ 0؛ توازن مع دائن | ر.س | `journal_entry_lines` | قيود |
| `credit` | دائن | مبلغ الجانب الدائن | `numeric` | لا | `0` | ≥ 0؛ توازن مع مدين | ر.س | `journal_entry_lines` | قيود |
| `project_code` | رمز المشروع | معرّف مشروع | `text` | نعم | — | فريد ضمن الشركة | — | `projects` | مشاريع |
| `building_code` | رمز المبنى | معرّف مبنى داخل المشروع | `text` | نعم | — | فريد ضمن المشروع | — | `buildings` | مخططات |
| `floor_code` | رمز الطابق | معرّف طابق | `text` | نعم | — | فريد ضمن المبنى | — | `floors` | هيكل |
| `zone_code` | رمز المنطقة | معرّف منطقة | `text` | نعم | — | فريد ضمن الطابق | — | `zones` | هيكل |
| `room_code` | رمز الغرفة | معرّف غرفة | `text` | نعم | — | فريد ضمن المنطقة | — | `rooms` | هيكل |
| `system_category` | فئة نظام السلامة | تصنيف النظام | `text` | نعم | — | `fire_suppression` \| `fire_alarm` \| `smoke_control` \| `emergency_lighting` \| `egress` \| `other` | — | `safety_systems`, `compliance_rules` | امتثال |
| `occupancy_load` | حمل الإشغال | عدد الأشخاص التصميمي | `integer` | لا | — | ≥ 0 | شخص | `buildings` | كود الحريق |
| `building_area` | مساحة البناء | مساحة مبنية | `numeric` | لا | — | ≥ 0 | م² | `clients`, `buildings` | هندسي |
| `land_area` | مساحة الأرض | مساحة القطعة | `numeric` | لا | — | ≥ 0 | م² | `clients`, `buildings` | هندسي |
| `height_m` | الارتفاع | ارتفاع المبنى | `numeric` | لا | — | ≥ 0 | م | `buildings` | هندسي |
| `gps_lat` | خط العرض | إحداثي GPS | `numeric` | لا | — | −90…90 | درجة | `buildings`, `site_visits`, `photos` | ميداني |
| `gps_lng` | خط الطول | إحداثي GPS | `numeric` | لا | — | −180…180 | درجة | `buildings`, `site_visits`, `photos` | ميداني |
| `document_number` | رقم الوثيقة | ترقيم وثيقة رسمي | `text` | نعم | — | فريد مع الإصدار ضمن الشركة | — | `documents` | وثائق |
| `document_type` | نوع الوثيقة | تصنيف الوثيقة | `text` | نعم | — | تقرير / رخصة / مخطط / … | — | `documents` | وثائق |
| `version_label` | تسمية الإصدار | إصدار الوثيقة/المرفق | `text` | نعم | `1.0` | semver-like | — | `documents`, `attachments` | إصدارات |
| `approval_status` | حالة الاعتماد | دورة اعتماد الوثيقة | `text` | نعم | `مسودة` | مسودة / قيد المراجعة / معتمد / مرفوض | — | `documents` | اعتماد |
| `retention_policy` | سياسة الاحتفاظ | سياسة الأرشفة | `text` | لا | `standard_7y` | أكواد سياسات | — | `documents` | أرشيف |
| `file_type` | نوع الملف | تصنيف المرفق | `text` | نعم | — | `image` \| `pdf` \| `dwg` \| `rvt` \| `ifc` \| `docx` \| `xlsx` \| `video` \| `other` | — | `attachments` | وسائط |
| `storage_path` | مسار التخزين | مسار الملف في التخزين | `text` | نعم | — | غير فارغ | — | `attachments` | Storage |
| `checksum_sha256` | بصمة الملف | تحقق سلامة المحتوى | `text` | لا | — | hex SHA-256 | — | `attachments` | سلامة |
| `photo_type` | نوع الصورة | تصنيف صورة ميدانية | `text` | لا | — | قبل / بعد / مخالفة / … | — | `photos` | زيارات |
| `phase` | مرحلة التصوير | مرحلة المشروع عند الالتقاط | `text` | لا | — | زيارة / تفتيش / تسليم | — | `photos` | ميداني |
| `rule_code` | رمز القاعدة | معرّف قاعدة امتثال | `text` | نعم | — | فريد مع الإصدار | — | `compliance_rules` | امتثال |
| `priority` | الأولوية | أولوية القاعدة | `text` | لا | `medium` | `low` \| `medium` \| `high` \| `critical` | — | `compliance_rules` | مخاطر |
| `reference_code` | مرجع الكود | مرجع لائحة/كود | `text` | لا | — | مثل SBC / NFPA | — | `compliance_rules` | امتثال |
| `article_code` | رمز المقال | معرّف مقال معرفة | `text` | نعم | — | فريد تشغيلياً | — | `knowledge_articles` | معرفة |
| `tags` | الوسوم | وسوم بحث | `text[]` | لا | `{}` | مصفوفة نصوص | — | `knowledge_articles` | بحث |
| `model_name` | اسم النموذج | نموذج الذكاء الاصطناعي | `text` | لا* | — | اسم مزوّد/نموذج | — | `ai_*` | AI |
| `quality_score` | درجة الجودة | تقييم جودة الاقتراح | `numeric` | لا | — | 0…1 أو 0…100 | — | `ai_suggestions` | جودة AI |
| `feedback_rating` | تقييم المستخدم | تقييم بشري | `integer` | لا | — | 1…5 | — | `ai_suggestions` | تغذية راجعة |
| `action` | نوع العملية | عملية التدقيق | `text` | نعم | — | create/update/soft_delete/login/… | — | `audit_logs` | تدقيق |
| `entity_type` | نوع الكيان | اسم الجدول/الكيان | `text` | نعم* | — | اسم منطقي | — | `audit_logs`, `record_versions`, … | تدقيق |
| `snapshot` | لقطة | نسخة JSON للسجل | `jsonb` | نعم | — | كائن كامل | — | `record_versions` | إصدارات |
| `current_state` | الحالة الحالية | حالة مثيل سير العمل | `text` | نعم | — | حالات التعريف | — | `workflow_instances` | Workflow |
| `decision` | قرار الاعتماد | نتيجة الموافقة | `text` | نعم | — | `approved` \| `rejected` \| `returned` | — | `workflow_approvals` | اعتماد |
| `direction` | اتجاه التكامل | اتجاه الربط | `text` | نعم | — | `inbound` \| `outbound` \| `bidirectional` | — | `integration_endpoints` | تكامل |
| `mapping` | خريطة الحقول | تحويل حقول التكامل | `jsonb` | نعم | `{}` | مخطط تحويل | — | `integration_endpoints` | تكامل |
| `retain_days` | أيام الاحتفاظ | مدة الاحتفاظ القانونية | `integer` | نعم | `2555` | ≥ 0 (~7 سنوات) | يوم | `archive_policies` | أرشيف |
| `license_number` | رقم الرخصة | رقم رخصة السلامة | `text` | لا | — | — | — | `clients`, `projects` | إنجاز |
| `activity_type` | نوع النشاط | نشاط المنشأة | `text` | لا | — | قيم `ref_activity_types` أو نص حر انتقالي | — | `clients` | امتثال |
| `national_address` | العنوان الوطني | العنوان الوطني السعودي | `text` | لا | — | — | — | `clients` | تواصل |
| `inspection_checklist` | قائمة التفتيش | عناصر فحص JSON | `jsonb` | لا | `[]` | مصفوفة عناصر | — | `clients` | مشاريع |
| `is_active` | نشط | تفعيل السجل المرجعي | `boolean` | نعم* | `true` | true/false | — | `ref_*`, `companies`, … | MDM |

\* إلزامي حسب الجدول؛ بعض الحقول اختيارية في الجداول القديمة المتوافقة مع التطبيق الحالي.

## ملاحظات قاموسية

1. **العملة الافتراضية:** الريال السعودي (ر.س) لجميع المبالغ المالية ما لم يُذكر خلاف ذلك.
2. **العزل:** أي استعلام تشغيلي يجب أن يفلتر بـ `company_id` و`deleted_at IS NULL`.
3. **المسار:** `pipeline_stage` يُشتق أيضاً منطقياً في التطبيق من حقول الحالة (`lib/business/pipeline.ts`) ويُخزَّن للعرض والفلترة.
4. **التوافق:** حقول مثل `client_id` في جداول المبيعات/المحاسبة قد تكون `text` لتتوافق مع المعرفات الحالية؛ يُفضّل توحيدها إلى `uuid` في مرحلة لاحقة.
