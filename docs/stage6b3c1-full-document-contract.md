# Stage 6B-3C1 — Full Singleton Document Server Contract

## Scope

This contract adds no user interface and does not alter the approved Engineering Delivery or Civil Defense Cover Letter forms. The canonical singleton document inside `project_engineering_live.payload` remains the complete source of truth. `project_correspondences` remains a searchable compatibility projection only.

The full-document bridge accepts only a bounded JSON object for one known singleton type, copies only explicitly whitelisted keys into the existing canonical singleton object, and preserves every other existing document key. It cannot patch another top-level payload section.

## Field matrix

| Canonical field | Classification | Browser input accepted | Validation / preservation | Relational projection |
|---|---|---:|---|---|
| `engineering_delivery.status` | A. Common relational core | Yes | Arabic `مسودة` / `قيد الإعداد` / `مكتمل`; `معتمد` rejected by the bridge | `document_status` mapped draft/preparing/ready |
| `engineering_delivery.delivery_date` | A. Common relational core | Yes | ISO `YYYY-MM-DD`, empty, or null | `correspondence_date` |
| `engineering_delivery.delivered_to` | A. Common relational core | Yes | text/null | `recipient_name` |
| `engineering_delivery.outgoing_number` | A. Common relational core | Yes | text/null | `reference_number` |
| `engineering_delivery.safety_engineer_name` | A. Common relational core | Yes | text/null | `responsible_engineer_name` |
| `engineering_delivery.manager_name` | A. Common relational core | Yes | text/null | `responsible_manager_name` |
| `engineering_delivery.copy_to` | C. Singleton-only, preserved | Yes | text/null; no relational destination | none |
| `engineering_delivery.study_summary` | C. Singleton-only, preserved | Yes | text/null | derives compatibility `body` only |
| `engineering_delivery.notes` | C. Singleton-only, preserved | Yes | text/null | derives compatibility `body` only, preferred over summary |
| `engineering_delivery.attachments_note` | C. Singleton-only, preserved | Yes | text/null | none |
| `engineering_delivery.attachments_count` | C. Singleton-only, preserved | Yes | number/string/null | none |
| `engineering_delivery.hijri_date` | D. Derived display / preserved | Yes | text/null; no server re-derivation | none |
| `engineering_delivery.civil_defense_city` | C. Singleton-only, preserved | Yes | text/null | none |
| `engineering_delivery.building_permit_number` | D. Derived display / preserved | Yes | text/null; no server re-derivation | none |
| `engineering_delivery.safety_engineer_title` | C. Singleton-only, preserved | Yes | text/null | none |
| `engineering_delivery.safety_engineer_phone` | C. Singleton-only, preserved | Yes | text/null | none |
| `engineering_delivery.manager_title` | C. Singleton-only, preserved | Yes | text/null | none |
| `engineering_delivery.manager_phone` | C. Singleton-only, preserved | Yes | text/null | none |
| `engineering_delivery.safety_scope` | B. Type-specific structured field | Yes | fixed row ids, fixed options, `نعم` / `لا`; no unknown nested key | none |
| `engineering_delivery.updated_at` | D. Server metadata | No | existing value remains untouched by bridge input | none |
| `cd_cover_letter.status` | A. Common relational core | Yes | Arabic `مسودة` / `قيد الإعداد` / `مكتمل`; `معتمد` rejected by the bridge | `document_status` mapped draft/preparing/ready |
| `cd_cover_letter.letter_date` | A. Common relational core | Yes | ISO `YYYY-MM-DD`, empty, or null | `correspondence_date` |
| `cd_cover_letter.addressee` | A. Common relational core | Yes | text/null | `recipient_name` |
| `cd_cover_letter.outgoing_number` | A. Common relational core | Yes | text/null | `reference_number` |
| `cd_cover_letter.safety_engineer_name` | A. Common relational core | Yes | text/null | `responsible_engineer_name` |
| `cd_cover_letter.manager_name` | A. Common relational core | Yes | text/null | `responsible_manager_name` |
| `cd_cover_letter.copy_to` | C. Singleton-only, preserved | Yes | text/null; no relational destination | none |
| `cd_cover_letter.building_status` | B. Type-specific field | Yes | text/null | none |
| `cd_cover_letter.manager_title` | C. Singleton-only, preserved | Yes | text/null | none |
| `cd_cover_letter.safety_engineer_title` | C. Singleton-only, preserved | Yes | text/null | none |
| `cd_cover_letter.updated_at` | D. Server metadata | No | existing value remains untouched by bridge input | none |

### Explicitly unsafe or ambiguous inputs

The bridge rejects any top-level document key outside the table, non-object document payloads, non-string values for text fields, malformed date strings, invalid `attachments_count`, malformed `safety_scope`, and any browser attempt to provide `updated_at`, a `project_code`, a `projects.name`, payload siblings, workflow state, approvals, storage paths, evidence, or unrelated report data.

## Authorization and lifecycle

The server checks `auth.uid()`, active tenant, exact primary `(client_id, project_id)` mapping, and `public.app_role_in(ARRAY['super_admin', 'tenant_admin', 'admin', 'manager', 'engineer'])`. This corresponds to the existing legitimate `projects.edit` role bundle. `employee`, `viewer`, and other tenant members are denied on the server even if they directly call the RPC.

The bridge accepts only draft/preparing/ready equivalents. It rejects `معتمد`, never writes relational `approved`, never writes `approved_at`, never calls the Stage 7 transition RPC, and does not modify Migration 055.

## Ready validation

When the target status is ready (`مكتمل` in the canonical document), the bridge enforces the same per-document minimum issuance fields used by Stage 6A: complete status, a valid ISO date, recipient/addressee, outgoing reference, safety engineer name, and manager name. It returns `CORRESPONDENCE_INCOMPLETE` without writes if any requirement is absent. Stage 6A remains responsible for evaluating both singleton documents and Stage 7 progression.

## First and subsequent saves

A first explicit authorized save while Stage 6 is active can create exactly one outgoing projection with expected version `0`; there is no page-load adoption or background backfill. A subsequent save locks the existing row, requires its expected version, updates the same row, and increments `lock_version`. A stale or singleton conflict aborts the transaction and does not retry or merge automatically.

## Preservation invariant

The bridge starts with the locked existing canonical singleton object, applies only known browser-whitelisted keys present in input, and writes that one singleton back into the already locked payload. Therefore every omitted official field and every legacy-compatible existing key survives exactly. The bridge changes only explicitly submitted allowed fields and the relational projection derived from the resulting document.
