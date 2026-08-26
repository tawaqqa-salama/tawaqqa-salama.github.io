# Migration Bootstrap 042 Rebuild Report

**Branch:** `fix/migration-bootstrap-042`  
**Base:** `origin/main @ 99037b000b0dc9e50b75e2a6d73cabbff2305d5c`  
**Scope:** إصلاح قابلية إعادة البناء المحلية فقط. لا يشمل PR-A1 #236، ولا Migration 065، ولا Staging أو Production.

## A. OWNERSHIP CHAIN

| العنصر | النتيجة |
|---|---|
| Queue table | `public.zatca_retry_queue` |
| Parent relation | `zatca_retry_queue.zatca_invoice_id` → `public.zatca_invoices.id` |
| Tenant source | `public.zatca_invoices.company_id`، مع `client_id` كمرجع إضافي على الفاتورة |
| Application consumer | لا يوجد runtime caller في repository؛ مسار ZATCA الحالي يقرأ `zatca_invoices` فقط |
| Selected model | **Scenario C عمليًا:** queue بنية تشغيلية داخلية service-role-only، مع ownership relation موثقة عبر invoice؛ لا direct user access |
| Why not direct `company_id` | الجدول بلا tenant key، وإضافة عمود جديد ستغيّر domain model بلا دليل على الحاجة |

## B. FIX

### Files changed

تم تعديل `003_project_hierarchy.sql` لجعل `projects.client_id` من النوع `uuid` المتوافق مع `clients.id` وعقود Stage 6B اللاحقة. وتم تعديل `042_role_level_rls.sql` ليصبح schema-aware؛ يعالج `company_id` و`client_id` فقط بعد فحص catalog، ويجعل `zatca_retry_queue` service-role-only دون policy تشير إلى عمود غير موجود. وتم تعديل `045_nfpa_code_knowledge_pipeline.sql` لإزالة أسماء السياسات المتعارضة قبل إعادة إنشائها عند وجود migration 045 الأخرى.

أضيف أيضًا runner محلي deterministic، وcompatibility bootstrap خارج `scripts/sql`، واختبارات regression مخصصة.

### لماذا هذا التصميم

العقود من 056 إلى 064 تستخدم UUID لـ`client_id` في correspondences وidentity mappings وRPCs. لذلك فإن توحيد `projects.client_id` في **fresh canonical rebuild** يعالج تعارضًا حقيقيًا في schema، ولا يضيف tenant key جديدًا إلى queue. أما queue نفسها فليس لها UI أو RPC consumer في repository، ومرجعها التشغيلي الوحيد هو invoice؛ لذلك direct authenticated access ليس مطلوبًا.

## C. CANONICAL BOOTSTRAP

| البند | التنفيذ |
|---|---|
| Runner الحالي | `scripts/apply-dds-schema.mjs` يحافظ على bootstrap الأساسي 000–033 |
| Runner الجديد | `scripts/apply-full-dds-schema-local.mjs`، manifest صريح من 000 إلى 064 |
| Compatibility | `scripts/local-supabase-compatibility-bootstrap.sql`، local-only وخارج `scripts/sql` |
| Supabase prerequisites | roles `anon/authenticated/service_role` يجهزها harness المحلي، و`auth.uid` وStorage stubs للاختبار فقط |
| Timestamped migrations | ليست ضمن manifest 000–064؛ تُوثق منفصلة ولا تُخلط تلقائيًا مع المسار canonical |
| Duplicate logical migration | كلا الملفين 045 مدرجان صراحةً، و045 NFPA أصبح idempotent أمام سياسات 045 Design Intelligence |
| Safety guard | runner يرفض أي `DATABASE_URL` لا يشير إلى localhost/127.0.0.1/::1 ويتطلب `LOCAL_DDS_REBUILD=1` |

## D. FRESH REBUILD

| المرحلة | النتيجة |
|---|---|
| Supabase compatibility bootstrap المحلي | PASS |
| 000–033 | PASS |
| 034–041 | PASS |
| 042 المعدلة | PASS |
| 043–064 | PASS |
| Final 000–064 manifest | **PASS — 63 files in explicit manifest** |
| Migration 065 | NOT INCLUDED / NOT EXECUTED |

تم التحقق بواسطة `npm run db:rebuild-local` على قاعدة PostgreSQL محلية فارغة `dds_runner_check`. وصل runner إلى:

```text
Applying 064_project_classification_foundation.sql... OK
Full DDS chain applied successfully: 63 migrations (000–064 manifest).
```

## E. SECURITY TESTS

| الاختبار/العقد | النتيجة |
|---|---|
| Queue missing-column safety | PASS؛ لا policy تُنشأ للـqueue من كتلة 042 |
| Queue direct authenticated DML | PASS؛ يتم سحب direct access من `authenticated` |
| Company-scoped finance tables | PASS؛ policy تُبنى فقط بعد `has_company_id` |
| Client-scoped finance tables | PASS؛ policy تستخدم relation إلى `clients` بعد `has_client_id` |
| Duplicate 045 policy safety | PASS؛ names المتعارضة تُزال قبل الإنشاء |
| Local runner non-local refusal | PASS بالعقد الاختباري |
| Live Tenant A/B | NOT EXECUTED؛ ممنوع في هذه المرحلة |
| Production cross-tenant test | NOT EXECUTED |

اختبارات PR المخصصة: **5 passed**. مجموعة regression المستهدفة: **59 passed**.

## F. GENERAL VERIFICATION

| البوابة | النتيجة |
|---|---|
| Full Vitest | PASS؛ `1140 passed, 2 skipped` |
| TypeScript | PASS |
| Build | PASS |
| Static Export | PASS |
| Scoped ESLint على ملفات PR JS/TS | PASS |
| Full ESLint | FAIL بسبب baseline React lint errors خارج ملفات PR؛ لم تُعدّل ملفات unrelated |
| `git diff --check` | PASS |
| Fresh rebuild runner | PASS |

## G. PRODUCTION SAFETY

| القيد | الحالة |
|---|---|
| Production DDL | NO |
| Production DML | NO |
| Production Storage changes | NO |
| Migration history repair | NO |
| Migration 065 | NOT EXECUTED |
| Staging recreated | NO |
| Tenant A/B live data | NOT CREATED |
| PR-A1 modified | NO |
| PR-A1 merged | NO |
| Production deploy | NO |

## H. PR

| البند | الحالة المتوقعة بعد الإكمال |
|---|---|
| Branch | `fix/migration-bootstrap-042` |
| New PR | مستقل عن #236 |
| Files | migrations/bootstrap fix + tests + documentation فقط |
| HEAD | يُثبت بعد commit/push |
| Mergeability | تُفحص بعد فتح PR |
| CI | يُشغّل على HEAD الجديد؛ لا merge/deploy |

## قرار المرحلة

الحالة المقبولة لهذه المرحلة هي:

> **BASE MIGRATION CHAIN REBUILD PASS — READY FOR STAGING RECREATION REVIEW**

ولا يعني ذلك أن Staging أُنشئت أو أن Migration 065 صالحة للتطبيق تلقائيًا. قبل أي Staging recreation يجب مراجعة PR المستقل، ثم يمكن بأمر منفصل إنشاء Staging وتطبيق 065 واختبار Tenant A/B.

## References

[1]: `scripts/sql/003_project_hierarchy.sql` — canonical project/client identity definition.  
[2]: `scripts/sql/018_zatca_einvoicing.sql` — invoice ownership columns.  
[3]: `scripts/sql/027_enterprise_accounting.sql` — retry queue definition.  
[4]: `scripts/sql/042_role_level_rls.sql` — schema-aware Finance policy logic.  
[5]: `scripts/sql/045_design_intelligence_tenant_rls.sql` and `scripts/sql/045_nfpa_code_knowledge_pipeline.sql` — duplicate 045 policy interaction.  
[6]: `scripts/sql/046_nfpa_code_knowledge_pipeline_repair.sql` — idempotent policy pattern.  
[7]: `scripts/apply-full-dds-schema-local.mjs` — explicit local manifest and safety guard.  
[8]: `PR-A1 #236` — `7cf69a183016e01316ea91b5299e03174a2cba2f`.
