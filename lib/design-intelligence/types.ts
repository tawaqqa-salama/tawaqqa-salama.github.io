/** Design Intelligence Center — domain types */

export type KnowledgeDocStatus = 'draft' | 'active' | 'archived' | 'superseded';
export type KnowledgeIndexStatus = 'pending' | 'processing' | 'indexed' | 'failed';

export type DiKnowledgeDocument = {
  id: string;
  company_id?: string | null;
  title: string;
  category?: string | null;
  discipline?: string | null;
  revision?: string | null;
  issue_date?: string | null;
  author_name?: string | null;
  version_label?: string | null;
  tags?: string[];
  keywords?: string[];
  project_type?: string | null;
  building_type?: string | null;
  hazard_classification?: string | null;
  applicable_codes?: string[];
  status: KnowledgeDocStatus | string;
  notes?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size_bytes?: number | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  /** Demo / small-file preview only — prefer Storage path in production */
  data_url?: string | null;
  source_kind?: string | null;
  index_status: KnowledgeIndexStatus | string;
  indexed_at?: string | null;
  chunk_count?: number;
  ocr_used?: boolean;
  extracted_text?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DiKnowledgeChunk = {
  id: string;
  document_id: string;
  chunk_index: number;
  page_number?: number | null;
  paragraph_ref?: string | null;
  code_reference?: string | null;
  content: string;
  embedding?: number[];
  document_title?: string;
};

export type RagCitation = {
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  paragraph: string;
  codeReference: string | null;
  confidence: number;
  chunkId: string;
};

export type RagAnswer = {
  answer: string;
  citations: RagCitation[];
  confidence: number;
  reliable: boolean;
  message?: string;
};

export type DiDesignWorkspace = {
  id: string;
  client_id?: string | null;
  project_name: string;
  summary?: string | null;
  requirements?: string | null;
  building_info?: Record<string, unknown>;
  risk_classification?: string | null;
  occupancy?: string | null;
  building_height_m?: number | null;
  floors_count?: number | null;
  area_m2?: number | null;
  fire_protection_scope?: string | null;
  applicable_codes?: string[];
  engineering_notes?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type DiDesignTask = {
  id: string;
  workspace_id: string;
  title: string;
  owner_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  priority: string;
  depends_on?: string[];
  progress_percent: number;
  status: string;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  sort_order: number;
};

export type DiChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  code_ref?: string;
};

export type DiDesignChecklist = {
  id: string;
  workspace_id: string;
  title: string;
  items: DiChecklistItem[];
  completion_percent: number;
};

export type DiLessonLearned = {
  id: string;
  workspace_id?: string | null;
  client_id?: string | null;
  problems?: string | null;
  solutions?: string | null;
  engineer_notes?: string | null;
  recommendations?: string | null;
  created_at?: string;
};

export type DiNotification = {
  id: string;
  workspace_id?: string | null;
  kind: string;
  title: string;
  body?: string | null;
  severity: string;
  is_read: boolean;
  created_at: string;
};

export type EngineeringSuggestion = {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warn' | 'critical';
  code_refs: string[];
};

export const KNOWLEDGE_CATEGORIES = [
  'Fire Codes',
  'SBC',
  'NFPA',
  'Civil Defense',
  'Company Standards',
  'Manufacturer Catalog',
  'Previous Projects',
  'Calculation Sheets',
  'Drawings',
  'Other',
] as const;

export const DESIGN_PLANNER_STEPS = [
  'Site Visit',
  'Collect Drawings',
  'Review Requirements',
  'Determine Applicable Codes',
  'Classify Hazard',
  'Fire Alarm Design',
  'Sprinkler Design',
  'Hydraulic Calculation',
  'Pump Room',
  'Tank Design',
  'Bill of Quantities',
  'Internal Review',
  'Issue Drawings',
  'Submit',
  'Approval',
] as const;

export type DesignIntelligenceTabId =
  | 'knowledge'
  | 'rag'
  | 'workspace'
  | 'planner'
  | 'assistant'
  | 'drawings'
  | 'timeline'
  | 'notifications'
  | 'checklist'
  | 'copilot'
  | 'lessons'
  | 'analytics';
