# Stage 6B-3B — Singleton Compatibility Contract

## Authority and scope

`project_engineering_live.payload` remains the canonical Stage 6 document store. Migration 055 remains the **only** authority that validates Stage 6 and unlocks Stage 7. `project_correspondences` is a server-maintained compatibility projection for exactly one outgoing record of each approved singleton type per canonical project. This phase neither backfills existing data nor changes any approved form, template, or PDF.

The bridge accepts only the mapped, editable subset and updates the payload plus the projection in one database transaction. Fields without a relational destination are preserved unchanged in the singleton JSONB; they are never cleared, synthesized, or overwritten by the bridge. A browser must not call the legacy save path and a relational RPC as two separate writes.

| Legacy singleton field | Relational destination / behavior | Classification | Write authority in 6B-3B | Direction |
|---|---|---|---|---|
| `engineering_delivery.status` | `document_status`: `مسودة→draft`, `قيد الإعداد→preparing`, `مكتمل/معتمد→ready` | Safe compatibility mapping | Bridge and projection trigger; 055 alone sets `معتمد` in legacy | bridge `draft/preparing/ready → مسودة/قيد الإعداد/مكتمل`; live projection maps approved legacy to `ready` |
| `engineering_delivery.delivery_date` | `correspondence_date` | Exact match | Bridge and projection trigger | bidirectional within the atomic bridge; live-to-relation on explicit Stage 6 save |
| `engineering_delivery.delivered_to` | `recipient_name` | Exact match | Bridge and projection trigger | same |
| `engineering_delivery.outgoing_number` | `reference_number` | Exact match | Bridge and projection trigger | same |
| `engineering_delivery.safety_engineer_name` | `responsible_engineer_name` | Exact match | Bridge and projection trigger | same |
| `engineering_delivery.manager_name` | `responsible_manager_name` | Exact match | Bridge and projection trigger | same |
| `engineering_delivery.notes` / `study_summary` | `body` compatibility projection only | Safe server derivation | Projection trigger only | legacy → relational; no browser body mutation in this bridge |
| Engineering Delivery subject | fixed `subject = خطاب تسليم دراسة السلامة` | Safe server derivation | Server only | server-derived; no legacy field is created |
| `engineering_delivery.copy_to` | none | No relational destination | Canonical singleton only | preserved; never changed by bridge |
| `attachments_count`, `attachments_note` | none | No relational destination | Canonical singleton only | preserved; no attachment subsystem is implied |
| `hijri_date`, Gregorian display | none | Generated | Canonical singleton/form generator only | derived from delivery date; never persisted relationally |
| `civil_defense_city`, `building_permit_number` | none | Generated/inherited | Existing canonical source only | preserved; no project-code injection |
| `safety_engineer_title`, `safety_engineer_phone`, `manager_title`, `manager_phone` | none | No relational destination | Canonical singleton only | preserved |
| `safety_scope` | none | No relational destination | Canonical singleton only | preserved |
| `cd_cover_letter.status` | `document_status` with the same compatibility mapping | Safe compatibility mapping | Bridge and projection trigger; 055 alone sets `معتمد` | same mapping as delivery |
| `cd_cover_letter.letter_date` | `correspondence_date` | Exact match | Bridge and projection trigger | bidirectional within bridge; live-to-relation on explicit Stage 6 save |
| `cd_cover_letter.addressee` | `recipient_name` | Exact match | Bridge and projection trigger | same |
| `cd_cover_letter.outgoing_number` | `reference_number` | Exact match | Bridge and projection trigger | same |
| `cd_cover_letter.safety_engineer_name` | `responsible_engineer_name` | Exact match | Bridge and projection trigger | same |
| `cd_cover_letter.manager_name` | `responsible_manager_name` | Exact match | Bridge and projection trigger | same |
| Civil Defense subject | fixed `subject = خطاب تسليم الدفاع المدني` | Safe server derivation | Server only | server-derived; no legacy field is created |
| `cd_cover_letter.copy_to`, `building_status` | none | No relational destination | Canonical singleton only | preserved |
| `manager_title`, `safety_engineer_title` | none | No relational destination | Canonical singleton only | preserved |
| project name, location, owner, area, occupancy snapshot | none | Generated/inherited | Existing client/report sources only | preserved; internal `project_code`/`projects.name` are never used |

## Singleton, idempotency, and concurrency

A partial unique index enforces one outgoing row for `(project_id, correspondence_type)` only for `engineering_delivery` and `cd_cover_letter`. The bridge locks `project_engineering_live` and the existing correspondence row. A create retry with `expected_lock_version = 0` either creates the singleton once or returns `CORRESPONDENCE_SINGLETON_CONFLICT`; it never overwrites a concurrent creator. An update requires the exact current `lock_version` and returns `CORRESPONDENCE_STALE_VERSION` on a stale retry.

The projection trigger runs only after an explicit payload update while `workflow.active_stage = transmittals`. It does not create rows on page load, absent identity, unrelated saves, or the Migration 055 transition to `final_report`. If a previously approved relational row would conflict with a later legacy edit, the payload transaction fails rather than silently divergence.

## Authorization and lifecycle

The new bridge reuses the existing server facts: authenticated actor, active tenant resolution, exact primary mapping pair `(client_id, project_id)`, and client/company ownership. It creates no role and does not claim that UI permissions are a security boundary. The existing application matrix may still hide future mutation UI unless `projects.edit` is present, but RLS/RPC validation remains authoritative.

The bridge never accepts `approved` as an input status, never writes `approved_at`, and never updates workflow fields. Existing relational-only mutation RPCs are revoked from `authenticated` so an authenticated browser cannot bypass the bridge. Migration 055 may later mark canonical singleton statuses `معتمد`; the trigger intentionally skips that `final_report` transition, and a relational `approved` state cannot unlock Stage 7.

## Explicitly deferred

Create/edit/ready/approve UI, an approval UX, attachments, incoming/replies/revisions, legacy data adoption/backfill, Storage changes, a Migration 055 cutover, and Stage 6B-3C/6B-3D/6B-4 are not part of 6B-3B.
