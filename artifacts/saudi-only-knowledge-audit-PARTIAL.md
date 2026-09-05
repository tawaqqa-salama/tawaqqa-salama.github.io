# Saudi-only Design Intelligence knowledge audit — PARTIAL (blocked)

**STATUS = BLOCKED_AWAITING_PRODUCTION_READ_CREDENTIALS**  
**PRODUCTION AUDIT = READ ONLY (attempted; live SELECT not possible in this environment)**  
**DELETION EXECUTED = NO**  
**SAFE TO DELETE = NO** (full inventory incomplete)

## Blocker

This Cloud Agent VM has no Production Supabase credentials:

- `NEXT_PUBLIC_SUPABASE_URL` — unset
- `SUPABASE_SERVICE_ROLE_KEY` — unset
- No `.env.local` / `DATABASE_URL`

Secrets were requested via Cloud Agent setup actions. Until they are injected (or a read-only dump is provided), a complete live table cannot be produced.

Production target:

- Project ref: `ezmdkwgziyencejfevso`
- URL: `https://ezmdkwgziyencejfevso.supabase.co`
- Company: `3580b47a-a57b-4b3c-8f0d-db72870c8a85`
- Tables: `di_knowledge_documents`, `di_knowledge_chunks` (SELECT only)
- Bucket: `design-knowledge` (do not delete objects in this audit)

## How to complete the live audit (after secrets)

```bash
npm run audit:saudi-only-knowledge
# or: npx tsx scripts/audit-saudi-only-knowledge.ts
```

Outputs:

- `artifacts/saudi-only-knowledge-audit.json`
- `artifacts/saudi-only-knowledge-audit.md`

Classifier does **not** trust `code` alone (unit-tested in `tests/audit-saudi-only-knowledge.test.ts`).

## Partial inventory from verified Production evidence (NOT a full audit)

UI previously reported **7 indexed documents** for this company. Only a subset is identified from ops scripts / prior verified facts. Unknown rows must be treated as **AMBIGUOUS** until live SELECT.

| document_id | title | filename | current_code | edition | page_count | chunk_count | storage_path | classification | recommended_action | reason |
|---|---|---|---|---|---|---|---|---|---|---|
| `deb74a38-b94c-443a-831d-c8765a872809` | NFPA 13-2025 | NFPA-13-2025.pdf | NFPA-13 | 2025 | 595 | 2768 (post-reingest; previously 3096) | `3580b47a-a57b-4b3c-8f0d-db72870c8a85/code-knowledge/NFPA-13/2025/deb74a38-b94c-443a-831d-c8765a872809/NFPA-13-2025.pdf` | NON_SAUDI | DELETE | Genuine NFPA title/filename/path; Production reingest target |
| `4880c356-3b81-453f-9ddd-b023544e7cc1` | unknown (ops: canonical NFPA-13/2025) | document.pdf | NFPA-13 (path) | 2025 (path) | unknown | unknown | `3580b47a-a57b-4b3c-8f0d-db72870c8a85/code-knowledge/NFPA-13/2025/4880c356-3b81-453f-9ddd-b023544e7cc1/document.pdf` | NON_SAUDI | DELETE | Canonical NFPA Storage object in ops script — confirm live row still exists |
| `5f69deb0-a4da-4afb-973a-93a9f14f3324` | unknown (ops: older NFPA duplicate) | document.pdf | NFPA-13 (path) | 2025 (path) | unknown | unknown | `3580b47a-a57b-4b3c-8f0d-db72870c8a85/code-knowledge/NFPA-13/2025/5f69deb0-a4da-4afb-973a-93a9f14f3324/document.pdf` | NON_SAUDI | DELETE | Older NFPA duplicate marked for cleanup after indexing — confirm live row |
| `f2cb639d-ea72-4322-b851-d04a38ef930d` | unknown (ops: resume NFPA chunks) | unknown | implied NFPA-13 | implied 2025 | unknown | unknown | unknown | NON_SAUDI / AMBIGUOUS until live row | MANUAL_REVIEW then likely DELETE | Resume-chunks Production target; confirm title/path before delete |
| **unknown** | الكود السعودي للحماية من الحريق | unknown | **NFPA-13 (MISLABELED)** | **2025 (MISLABELED)** | unknown (RAG cited ~77/285/287/334) | unknown | unknown | SAUDI | KEEP (+ metadata repair later) | Title/content are Saudi Fire Code; `code`/`edition` must not drive delete |
| **unknown × ~2–3+** | unknown members of “7 indexed” set | unknown | unknown | unknown | unknown | unknown | unknown | AMBIGUOUS | MANUAL_REVIEW | Not named in prior transcripts/scripts |

### Provisional totals (evidence-based floor only — NOT complete)

```
SAUDI DOCUMENTS TO KEEP      >= 1   (mislabeled Saudi Fire Code; ID unknown)
NON-SAUDI DOCUMENTS TO DELETE >= 1–3 (deb74a38… confirmed; canonical/older if still present)
AMBIGUOUS DOCUMENTS          >= 1–4 (f2cb639d… + unnamed indexed docs)
TOTAL DOCUMENTS              = 7 indexed (UI claim) — live count unknown
TOTAL CHUNKS AFFECTED        >= 2768 (deb74a38… alone) — full sum unknown
MISLABELED DOCUMENTS         >= 1
```

## Follow-up implementation plan (AFTER owner approves deletion list)

Do **not** change canonical compliance logic in the audit phase. After cleanup approval:

1. **Ingest gate** — reject non-Saudi code uploads unless platform-owner policy flag explicitly allows.
2. **RAG retrieval** — hard-filter to Saudi/SBC (and approved Civil Defense) families only; never cite NFPA after cleanup.
3. **UI** (`CodeKnowledgePanel.tsx` / `DesignIntelligenceModule.tsx`):
   - Remove “Register + adopt NFPA-13 2025”
   - Remove “Compare 2025 vs 2028”
   - Remove NFPA registration/upload defaults (`uploadCode` default `NFPA-13`)
   - Remove NFPA-specific shortcuts/prompts
   - Reword around **الأكواد السعودية**
4. **Adoption registry** — stop seeding/adopting NFPA-13 editions for new projects; leave historical compliance results untouched.
5. **Metadata repair** — for KEPT Saudi docs mislabeled as NFPA-13/2025, correct `code`/`edition` (separate approved write).
6. **Deletion job** (only after explicit approval of the live audit table):
   - Soft-delete or hard-delete approved NON_SAUDI `di_knowledge_documents` rows
   - Cascade/delete related `di_knowledge_chunks`
   - Optionally remove Storage objects under those `storage_path`s
   - Re-run audit script to confirm zero NON_SAUDI remain
7. **No Production mutation until explicit approval.**

## FINAL REPORT (current)

```
STATUS = BLOCKED_AWAITING_PRODUCTION_READ_CREDENTIALS
PRODUCTION AUDIT = READ ONLY
TOTAL DOCUMENTS = UNKNOWN (UI claimed 7 indexed; live SELECT blocked)
SAUDI KEEP = >=1 (ID unknown — الكود السعودي للحماية من الحريق)
NON-SAUDI DELETE = >=1 (deb74a38-b94c-443a-831d-c8765a872809 confirmed; others pending live confirm)
AMBIGUOUS REVIEW = >=1 (remainder of 7 + f2cb639d-ea72-4322-b851-d04a38ef930d)
TOTAL CHUNKS AFFECTED = >=2768 (incomplete)
MISLABELED DOCUMENTS = >=1
PROPOSED UI CHANGES = Remove NFPA register/adopt/compare/defaults; reword to الأكواد السعودية
PROPOSED RAG CHANGES = Saudi/SBC-only retrieval + ingest reject for non-Saudi
SAFE TO DELETE = NO
DELETION EXECUTED = NO
```
