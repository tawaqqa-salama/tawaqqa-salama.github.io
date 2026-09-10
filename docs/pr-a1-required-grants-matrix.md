# PR-A1 Required Grants Matrix

هذه المصفوفة مبنية على catalog Production وقراءة كود التطبيق/RPCs. لا تتضمن أي revoke منفذًا هنا؛ قرارات `Revoke` تخص Migration 065 فقط.

| Object | Role | Required privilege | Current privilege | Keep/Revoke | Dependency / evidence |
|---|---|---|---|---|---|
| `project_engineering_live` | authenticated | EXECUTE على `save_project_engineering_live`; لا direct table DML مطلوب للتطبيق | SELECT/INSERT/UPDATE/DELETE + REFERENCES/TRIGGER/TRUNCATE | Keep CRUD مؤقتًا؛ Revoke elevated الثلاثة | Save RPC هو entry point؛ RLS tenant policy باقية |
| `project_engineering_live` | service_role | full operational | full | Keep | server-side RPC/broker and admin operations |
| `project_engineering_live` | anon | none | none in effective policy/grants evidence | Keep revoked | authenticated JWT required |
| `clients` | authenticated | SELECT وعمليات التطبيق المصرح بها عبر RPC؛ لا REFERENCES/TRIGGER/TRUNCATE | CRUD + REFERENCES/TRIGGER/TRUNCATE | Revoke REFERENCES/TRIGGER/TRUNCATE | tenant policy + server-side ownership checks |
| `clients` | service_role | full operational | full | Keep | backend/admin operations |
| `projects` | authenticated | SELECT؛ الإنشاء عبر classification resolver | SELECT | Keep | `projects_tenant_select` وresolver SECURITY DEFINER |
| `projects` | anon | none | none in effective policy/grants evidence | Keep revoked | no anonymous project access |
| `project_supervision_reports` | authenticated | CRUD فقط حيث تدعمه phase UI/RPC | CRUD + REFERENCES/TRIGGER/TRUNCATE | Revoke elevated الثلاثة | `project_supervision_reports_tenant` |
| `project_supervision_reports` | service_role | full operational | full | Keep | server-side evidence workflows |
| `report_pdf_snapshots` | authenticated | CRUD للـfield visit/supervision snapshot path الحالي | CRUD + REFERENCES/TRIGGER/TRUNCATE | Revoke elevated الثلاثة | `report_pdf_snapshots_tenant`; لا technical-final artifact في PR-A1 |
| `report_pdf_snapshots` | service_role | full operational | full | Keep | snapshot persistence server path |
| `project_correspondence_attachments` | authenticated | EXECUTE فقط على approved metadata RPCs: list/prepare/delete-request | table DML revoked | Keep table DML revoked | B4A RPCs are SECURITY DEFINER; broker controls bytes |
| `project_correspondence_attachments` | service_role | full metadata operation | full | Keep | B4B finalization/cleanup RPCs |
| old finalize overload `(...uuid)` | authenticated | none | EXECUTE was present historically | Revoke | obsolete after B4B service-role-only overload |
| new finalize overload `(...uuid,bigint,text,text)` | authenticated | none | none | Keep revoked | trusted broker only |
| `storage.objects` | anon | none | table grants present before PR-A1 | Revoke ALL | `project-files` and `design-knowledge` policies are authenticated-only |
| `storage.objects` | authenticated | Storage API CRUD under tenant policies | CRUD + elevated metadata privileges as exposed by catalog | Keep required Storage API path | `project_files_tenant_*` and `design_knowledge_tenant_*` |
| `storage.objects` | service_role | full operational | full | Keep | broker/server-side Storage operations |
| `storage.buckets` | anon | none | broad table grants present | Revoke ALL | bucket is metadata/control plane; no anon use |
| `storage.buckets` | authenticated | not proven required by application path | broad grants present | No revoke in PR-A1 pending dependency proof | avoid breaking Supabase Storage client initialization; review separately |
| `storage.buckets` | service_role | full operational | full | Keep | service-side Storage administration |
| `approve_stage6_documents_and_transition` | authenticated | EXECUTE | EXECUTE | Keep | explicit Stage 6 user action; function validates tenant, project identity, expected versions |
| `save_project_engineering_live` | authenticated | EXECUTE | EXECUTE | Keep | explicit save path; function validates tenant and payload contract |
| attachment broker RPCs | authenticated | list/prepare/delete request only | EXECUTE | Keep | UI contract; no direct table DML or raw path authority |
| attachment broker finalization/cleanup | service_role | EXECUTE | EXECUTE | Keep | Edge broker passes verified bytes/checksum; authenticated revoke is required |

## Decisions

1. لا يتم bulk revoke لدوال `SECURITY DEFINER`؛ تتم المحافظة على entry points التي يثبتها التطبيق، مع إزالة obsolete finalize overload فقط.
2. لا يتم تغيير `project-files` إلى public ولا حذف أو نقل أي object.
3. لا يتم revoke لـauthenticated على `storage.buckets` في PR-A1 لعدم وجود دليل كافٍ على أن Supabase client لا يحتاج metadata access في كل المسارات؛ يعالج ذلك كقرار مستقل بعد اختبار dependency.
4. عدم وجود direct authenticated table grant على `project_correspondence_attachments` يبقى مقصودًا، حتى بعد إنشاء policies دفاعية تغلق P0.
5. لا توجد أي صلاحية أو كود في PR-A1 لإنشاء `technical_report_revision` أو `technical_report_artifact` أو تعديل PDF/Workflow/classification.
