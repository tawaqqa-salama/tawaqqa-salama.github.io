/**
 * NFPA / Code Knowledge Pipeline — types.
 * Advisory RAG only. Authoritative PASS/FAIL lives in lib/projects/compliance.
 */

export type CodeEditionStatus =
  | 'draft'
  | 'indexed'
  | 'pending_engineer_review'
  | 'approved'
  | 'available'
  | 'active'
  | 'superseded';

export type CodeAdoptionStatus =
  | 'PROJECT_ADOPTED'
  | 'NOT_ADOPTED'
  | 'PENDING_ENGINEER_REVIEW';

export type PlatformVerificationStatus =
  | 'NOT_VERIFIED_OFFICIAL'
  | 'VERIFIED_OFFICIAL';

export type SourceVerificationStatus = 'VERIFIED' | 'NOT_VERIFIED';

export type DocumentIndexStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'indexed'
  | 'failed'
  | 'superseded';

export type PipelineJobType = 'extract' | 'ocr' | 'chunk' | 'embed' | 'index';

export type PipelineJobStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'indexed'
  | 'failed'
  | 'superseded';

export type EngineeringRuleLifecycleStatus =
  | 'active'
  | 'superseded'
  | 'draft'
  | 'rule_not_configured';

export type DiCodeEdition = {
  id: string;
  company_id?: string | null;
  code: string;
  edition: string;
  title?: string | null;
  adoption_status: CodeAdoptionStatus | string;
  verification_status: string;
  platform_verification_status: PlatformVerificationStatus | string;
  source_type?: string | null;
  source_document_id?: string | null;
  knowledge_document_id?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  superseded_by?: string | null;
  status: CodeEditionStatus | string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type DiProjectCodeAdoption = {
  id: string;
  company_id?: string | null;
  client_id: string;
  code: string;
  edition: string;
  code_edition_id?: string | null;
  title?: string | null;
  adoption_status: CodeAdoptionStatus | string;
  source_type: string;
  source_document_id: string;
  verification_status: string;
  platform_verification_status: PlatformVerificationStatus | string;
  knowledge_document_id?: string | null;
  adopted_at?: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type IngestionStatus =
  | 'pending'
  | 'uploaded'
  | 'extracting'
  | 'ocr'
  | 'chunking'
  | 'indexing'
  | 'indexed'
  | 'failed'
  | 'superseded'
  | 'skipped_duplicate';

export type ExtractionMethod = 'text' | 'ocr' | 'mixed' | 'empty';

export type CodeKnowledgeDocumentMeta = {
  id: string;
  company_id?: string | null;
  title: string;
  code: string;
  edition: string;
  /** Links document to di_code_editions row (NFPA-13 / 2025). */
  code_edition_id?: string | null;
  edition_id?: string | null;
  version?: string | null;
  revision?: string | null;
  source_type?: string | null;
  adoption_status?: string | null;
  verification_status?: string | null;
  platform_verification_status?: string | null;
  source_document_id?: string | null;
  status: string;
  index_status: DocumentIndexStatus | string;
  /** Alias surface for extraction_status requirement */
  extract_status?: string | null;
  extraction_status?: string | null;
  ocr_status?: string | null;
  embedding_status?: string | null;
  ingestion_status?: IngestionStatus | string | null;
  indexed_at?: string | null;
  last_ingestion_at?: string | null;
  chunk_count?: number;
  page_count?: number | null;
  pages_extracted?: number | null;
  pages_ocr?: number | null;
  ingestion_version?: number;
  parent_document_id?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  sha256?: string | null;
  content_sha256?: string | null;
  extracted_text?: string | null;
  /** Page-preserving body: `\f` form-feed separated pages when from Storage PDF. */
  page_texts?: string[] | null;
  ocr_used?: boolean;
  /**
   * True only after Storage object + DB document + chunk rows are verified.
   * False for session-memory / LOCAL demo mode.
   */
  persisted?: boolean;
  /** Present when Supabase persistence was required but failed. */
  persist_error?: string | null;
  /**
   * Optional local file path for development / agent environments that cannot
   * upload to Supabase Storage. Production UI upload should prefer Storage.
   */
  local_source_path?: string | null;
  /** Operator notes (e.g. SAFE_CLEANUP_CANDIDATE for duplicate Storage objects). */
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type CodeKnowledgeChunk = {
  id: string;
  company_id?: string | null;
  document_id: string;
  edition_id?: string | null;
  chunk_index: number;
  content: string;
  code?: string | null;
  edition?: string | null;
  section?: string | null;
  subsection?: string | null;
  table_reference?: string | null;
  figure_reference?: string | null;
  page_number?: number | null;
  page_start?: number | null;
  page_end?: number | null;
  extraction_method?: ExtractionMethod | string | null;
  paragraph_reference?: string | null;
  code_reference?: string | null;
  source_document_id?: string | null;
  source_verification_status: SourceVerificationStatus | string;
  embedding?: number[];
  document_title?: string;
};

export type PipelineJob = {
  id: string;
  company_id?: string | null;
  document_id: string;
  job_type: PipelineJobType | string;
  status: PipelineJobStatus | string;
  attempts: number;
  max_attempts: number;
  payload?: Record<string, unknown>;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at?: string;
};

export type CodeKnowledgeSearchHit = {
  chunk: CodeKnowledgeChunk;
  document: CodeKnowledgeDocumentMeta;
  code: string;
  edition: string;
  section: string | null;
  table: string | null;
  figure: string | null;
  page: number | null;
  relevance_score: number;
  source_verification_status: SourceVerificationStatus | string;
  /** Explicit: tenant vs platform/global */
  document_scope: 'tenant' | 'platform';
};

export type CodeKnowledgeSearchParams = {
  companyId: string;
  code: string;
  edition: string;
  query: string;
  documentId?: string;
  section?: string;
  page?: number;
  discipline?: string;
  projectType?: string;
  buildingType?: string;
  topK?: number;
  /** When true, also include company_id IS NULL platform docs (explicitly distinguished). */
  includePlatformDocuments?: boolean;
};

export type EditionRuleRecord = {
  id: string;
  rule_code: string;
  code: string;
  edition: string;
  section?: string | null;
  table_reference?: string | null;
  figure_reference?: string | null;
  source_document_id?: string | null;
  verification_status: string;
  rule_status: EngineeringRuleLifecycleStatus | string;
  numeric_value?: number | null;
  numeric_min?: number | null;
  numeric_max?: number | null;
  unit?: string | null;
  explanation_en?: string;
  explanation_ar?: string;
  priority?: number;
  is_active?: boolean;
  applicability?: Record<string, unknown>;
  input_fields?: string[];
  output_fields?: string[];
  effective_from?: string | null;
  effective_to?: string | null;
};

export type EditionComparisonResult = {
  code: string;
  old_edition: string;
  new_edition: string;
  status: 'PENDING_ENGINEER_REVIEW';
  added_rules: EditionRuleRecord[];
  removed_rules: EditionRuleRecord[];
  changed_rules: Array<{
    rule_code: string;
    old: EditionRuleRecord;
    new: EditionRuleRecord;
  }>;
  unchanged_rules: EditionRuleRecord[];
  rules_requiring_engineer_review: EditionRuleRecord[];
  rules_became_not_configured: EditionRuleRecord[];
  /** Never auto-activates the new edition */
  new_edition_activated: false;
};

export const NFPA13_PIPELINE_RULE_IDS = [
  'NFPA13-OCC-HAZARD',
  'NFPA13-SPRINKLER-TYPE',
  'NFPA13-SYSTEM-TYPE',
  'NFPA13-K-FACTOR',
  'NFPA13-DESIGN-AREA',
  'NFPA13-DENSITY',
  'NFPA13-SPACING',
  'NFPA13-MAX-COVERAGE',
] as const;

export type Nfpa13PipelineRuleId = (typeof NFPA13_PIPELINE_RULE_IDS)[number];
