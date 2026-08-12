/**
 * In-memory store for Code Knowledge Pipeline (tests + demo / offline).
 * Cloud persistence is optional via Supabase — never required for unit tests.
 */

import type {
  CodeKnowledgeChunk,
  CodeKnowledgeDocumentMeta,
  DiCodeEdition,
  DiProjectCodeAdoption,
  EditionRuleRecord,
  PipelineJob,
} from '@/lib/design-intelligence/code-knowledge/types';

export type CodeKnowledgeStoreState = {
  editions: DiCodeEdition[];
  adoptions: DiProjectCodeAdoption[];
  documents: CodeKnowledgeDocumentMeta[];
  chunks: CodeKnowledgeChunk[];
  jobs: PipelineJob[];
  rules: EditionRuleRecord[];
};

function emptyState(): CodeKnowledgeStoreState {
  return {
    editions: [],
    adoptions: [],
    documents: [],
    chunks: [],
    jobs: [],
    rules: [],
  };
}

let state: CodeKnowledgeStoreState = emptyState();

export function resetCodeKnowledgeStore(): void {
  state = emptyState();
}

export function getCodeKnowledgeStore(): CodeKnowledgeStoreState {
  return state;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
