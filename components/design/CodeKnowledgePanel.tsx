'use client';

/**
 * Code Knowledge Manager — editions, adoption, indexing, search, rule status.
 * Advisory only: AI answers never shown as authoritative without citations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adoptNfpa13_2025ForProject,
  advanceCodeEditionStatus,
  compareCodeEditions,
  explainCodeKnowledgeHits,
  getProjectAdoptedEdition,
  listAvailableCodes,
  listCodeEditions,
  listEditionRules,
  listKnowledgeDocumentsForCompany,
  listPipelineJobs,
  NFPA13_PIPELINE_RULE_IDS,
  registerCodeEdition,
  registerEditionRuleShellsForNewEdition,
  registerKnowledgeDocument,
  registerNfpa13_2025ProjectEdition,
  registerNfpa13_2025RuleShells,
  resetCodeKnowledgeStore,
  runDocumentPipeline,
  searchCodeKnowledge,
  type CodeKnowledgeSearchHit,
  type DiCodeEdition,
  type DiProjectCodeAdoption,
  type EditionComparisonResult,
} from '@/lib/design-intelligence/code-knowledge';

type Props = {
  companyId?: string;
  clientId?: string;
};

const DEMO_COMPANY = 'demo-company';
const DEMO_CLIENT = 'demo-client';

export default function CodeKnowledgePanel({ companyId, clientId }: Props) {
  const company = companyId || DEMO_COMPANY;
  const client = clientId || DEMO_CLIENT;

  const [editions, setEditions] = useState<DiCodeEdition[]>([]);
  const [adoption, setAdoption] = useState<DiProjectCodeAdoption | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [query, setQuery] = useState('sprinkler density Section 5 Table 5.1');
  const [hits, setHits] = useState<CodeKnowledgeSearchHit[]>([]);
  const [selectedHit, setSelectedHit] = useState<CodeKnowledgeSearchHit | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [compare, setCompare] = useState<EditionComparisonResult | null>(null);
  const [indexStatus, setIndexStatus] = useState<string>('—');
  const [sourceText, setSourceText] = useState(
    'Section 8.1 general requirements.\n\nTable 8.2.1 design criteria placeholder text for indexing tests only.\n\nPage 12 discusses spacing. Figure 8.3 shows coverage layout.'
  );

  const refresh = useCallback(() => {
    setEditions(listCodeEditions({ companyId: company }));
    setCodes(listAvailableCodes(company));
    setAdoption(getProjectAdoptedEdition(client, 'NFPA-13', company));
  }, [company, client]);

  useEffect(() => {
    // Seed demo registry once per mount if empty
    registerNfpa13_2025ProjectEdition({ companyId: company });
    registerNfpa13_2025RuleShells();
    refresh();
  }, [company, refresh]);

  const rules = useMemo(
    () => listEditionRules({ code: 'NFPA-13', edition: adoption?.edition || '2025' }),
    [adoption, editions]
  );

  const onBootstrap = () => {
    registerNfpa13_2025ProjectEdition({ companyId: company });
    const a = adoptNfpa13_2025ForProject({ companyId: company, clientId: client });
    registerNfpa13_2025RuleShells();
    setAdoption(a);
    refresh();
    setMessage(
      'NFPA-13 2025 registered & project-adopted. platform_verification_status=NOT_VERIFIED_OFFICIAL. Rules=RULE_NOT_CONFIGURED.'
    );
  };

  const onRegisterSource = () => {
    const doc = registerKnowledgeDocument({
      companyId: company,
      title: 'NFPA 13 — 2025 (project-provided excerpt for indexing)',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 'project_provided:NFPA-13-2025-cover',
      source_type: 'PROJECT_PROVIDED_DOCUMENT',
      adoption_status: 'PROJECT_ADOPTED',
      verification_status: 'PROJECT_COVER_IDENTIFIED',
      platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
      extracted_text: sourceText,
      file_name: 'nfpa13-2025-excerpt.txt',
      file_mime: 'text/plain',
    });
    const result = runDocumentPipeline(doc.id);
    setIndexStatus(result.document?.index_status || 'failed');
    const jobs = listPipelineJobs(doc.id)
      .map((j) => `${j.job_type}:${j.status}`)
      .join(', ');
    refresh();
    setMessage(
      result.ok
        ? `Document indexed (${result.document?.chunk_count || 0} chunks). Jobs: ${jobs}`
        : `Indexing incomplete. Jobs: ${jobs}`
    );
  };

  const onSearch = () => {
    const edition = adoption?.edition || '2025';
    const found = searchCodeKnowledge({
      companyId: company,
      code: 'NFPA-13',
      edition,
      query,
      topK: 6,
    });
    setHits(found);
    setSelectedHit(found[0] || null);
    const explained = explainCodeKnowledgeHits(found);
    setMessage(explained.message);
  };

  const onCompare = () => {
    // Ensure 2028 shells exist for demo compare without activating
    registerCodeEdition({
      companyId: company,
      code: 'NFPA-13',
      edition: '2028',
      title: 'NFPA 13 (draft future edition — not adopted)',
      status: 'draft',
      platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
      idempotent: true,
    });
    registerEditionRuleShellsForNewEdition({
      code: 'NFPA-13',
      edition: '2028',
      rule_codes: [...NFPA13_PIPELINE_RULE_IDS],
    });
    const result = compareCodeEditions('NFPA-13', '2025', '2028');
    setCompare(result);
    refresh();
    setMessage(
      `Comparison status=${result.status}. new_edition_activated=${result.new_edition_activated}. Project stays on ${adoption?.edition || '2025'}.`
    );
  };

  const onAdvanceReview = (editionId: string) => {
    const row = advanceCodeEditionStatus(editionId, 'pending_engineer_review');
    refresh();
    setMessage(row ? `Edition → ${row.status}` : 'Invalid status transition');
  };

  const docs = listKnowledgeDocumentsForCompany(company);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-5">
        <h2 className="text-xl font-semibold text-slate-900">Code Knowledge Pipeline</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Register codes/editions, adopt a project edition, index project-provided sources, search with
          citations, and review RULE_NOT_CONFIGURED / NEEDS_DATA. RAG is advisory — it cannot produce
          PASS. Compliance authority remains <code className="text-xs">lib/projects/compliance</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={onBootstrap}
          >
            Register + adopt NFPA-13 2025
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            onClick={onRegisterSource}
          >
            Index project source
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            onClick={onSearch}
          >
            Search code
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            onClick={onCompare}
          >
            Compare 2025 vs 2028
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            onClick={() => {
              resetCodeKnowledgeStore();
              setHits([]);
              setCompare(null);
              setSelectedHit(null);
              setIndexStatus('—');
              setMessage('In-memory code knowledge store cleared.');
              refresh();
            }}
          >
            Reset session store
          </button>
        </div>
        {message && (
          <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-700">{message}</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-medium text-slate-900">Available codes</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {codes.length ? codes.map((c) => <li key={c}>{c}</li>) : <li className="text-slate-400">None yet</li>}
          </ul>
          <h3 className="mt-4 font-medium text-slate-900">Editions</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {editions.map((e) => (
              <li key={e.id} className="rounded-lg border border-slate-100 p-2">
                <div className="font-medium">
                  {e.code} · {e.edition}
                </div>
                <div className="text-xs text-slate-500">
                  status={e.status} · adopt={e.adoption_status} · platform=
                  {e.platform_verification_status}
                </div>
                {e.status === 'indexed' || e.status === 'draft' || e.status === 'available' ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-cyan-700 underline"
                    onClick={() => onAdvanceReview(e.id)}
                  >
                    Send to engineer review
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-medium text-slate-900">Project adoption</h3>
          {adoption ? (
            <dl className="mt-2 space-y-1 text-sm text-slate-700">
              <div>
                <dt className="inline text-slate-500">Code: </dt>
                <dd className="inline">{adoption.code}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Edition: </dt>
                <dd className="inline font-medium">{adoption.edition}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Verification: </dt>
                <dd className="inline">{adoption.verification_status}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Platform: </dt>
                <dd className="inline">{adoption.platform_verification_status}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Source: </dt>
                <dd className="inline break-all">{adoption.source_document_id}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No adopted edition for this project.</p>
          )}
          <h3 className="mt-4 font-medium text-slate-900">Indexing</h3>
          <p className="mt-1 text-sm text-slate-600">Status: {indexStatus}</p>
          <p className="text-xs text-slate-500">{docs.length} document(s) for company</p>
          <label className="mt-3 block text-xs text-slate-500">
            Project source text (do not paste copyrighted full standards into repo)
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
              rows={5}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          </label>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-medium text-slate-900">Rule status</h3>
          <ul className="mt-2 max-h-72 space-y-1 overflow-auto text-xs">
            {rules.map((r) => (
              <li key={r.id} className="rounded border border-slate-100 px-2 py-1">
                <span className="font-medium">{r.rule_code}</span>
                <span className="text-slate-500"> · {r.edition} · </span>
                <span
                  className={
                    r.verification_status === 'RULE_NOT_CONFIGURED'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }
                >
                  {r.verification_status}
                </span>
                {r.numeric_value != null || r.numeric_min != null ? (
                  <span className="text-rose-700"> · has numeric</span>
                ) : (
                  <span className="text-slate-400"> · no numeric</span>
                )}
              </li>
            ))}
            {!rules.length && <li className="text-slate-400">No rules registered</li>}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-medium text-slate-900">Code search (RAG)</h3>
        <p className="mt-1 text-xs text-amber-800">
          AI answers are advisory. Never treat an uncited result as an authoritative code requirement.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search adopted edition…"
          />
          <button
            type="button"
            className="rounded-lg bg-cyan-700 px-3 py-2 text-sm text-white"
            onClick={onSearch}
          >
            Search
          </button>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ul className="space-y-2 text-sm">
            {hits.map((h) => (
              <li key={h.chunk.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    selectedHit?.chunk.id === h.chunk.id
                      ? 'border-cyan-500 bg-cyan-50'
                      : 'border-slate-100'
                  }`}
                  onClick={() => setSelectedHit(h)}
                >
                  <div className="font-medium">
                    {h.code} {h.edition} · score {h.relevance_score}
                  </div>
                  <div className="text-xs text-slate-500">
                    section={h.section || '—'} · table={h.table || '—'} · page={h.page ?? '—'} ·{' '}
                    {h.source_verification_status} · {h.document_scope}
                  </div>
                </button>
              </li>
            ))}
            {!hits.length && <li className="text-slate-400">No results</li>}
          </ul>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
            {selectedHit ? (
              <>
                <div className="text-xs text-slate-500">
                  Source: {selectedHit.chunk.source_document_id || '—'} · verification=
                  {selectedHit.source_verification_status}
                </div>
                <pre className="mt-2 whitespace-pre-wrap text-slate-800">{selectedHit.chunk.content}</pre>
                <p className="mt-2 text-xs text-amber-800">
                  Advisory excerpt only — cannot produce compliance PASS.
                </p>
              </>
            ) : (
              <p className="text-slate-400">Select a result</p>
            )}
          </div>
        </div>
      </section>

      {compare && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-medium text-slate-900">Edition comparison</h3>
          <p className="mt-1 text-slate-600">
            {compare.code} {compare.old_edition} → {compare.new_edition} · {compare.status} ·
            activated={String(compare.new_edition_activated)}
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <li>Added: {compare.added_rules.length}</li>
            <li>Removed: {compare.removed_rules.length}</li>
            <li>Changed: {compare.changed_rules.length}</li>
            <li>Unchanged: {compare.unchanged_rules.length}</li>
            <li>Needs review: {compare.rules_requiring_engineer_review.length}</li>
            <li>Became NOT_CONFIGURED: {compare.rules_became_not_configured.length}</li>
          </ul>
        </section>
      )}
    </div>
  );
}
