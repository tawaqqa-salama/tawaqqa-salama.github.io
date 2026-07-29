# مخططات العلاقات (ERD) — منصة توقع DDS v1.0

ثلاثة مخططات Mermaid تغطي المستأجر وCRM، وهيكل المشروع، والامتثال والذكاء الاصطناعي والتدقيق.

---

## 1) المستأجر + CRM / المبيعات / المحاسبة

```mermaid
erDiagram
  companies ||--o{ branches : "owns"
  companies ||--o{ users : "employs"
  companies ||--o{ roles : "defines"
  companies ||--o{ clients : "serves"
  branches ||--o{ users : "hosts"
  branches ||--o{ clients : "scoped"
  clients ||--o{ client_follow_ups : "has"
  clients ||--o{ sales_documents : "quoted_invoiced"
  clients ||--o{ sales_contracts : "contracts"
  clients ||--o{ sales_returns : "returns"
  clients ||--o{ vouchers : "payments_receipts"
  clients ||--o{ journal_entries : "posted"
  clients ||--o{ payments : "settles"
  companies ||--o{ chart_of_accounts : "coa"
  chart_of_accounts ||--o{ chart_of_accounts : "parent"
  companies ||--o{ cost_centers : "centers"
  journal_entries ||--|{ journal_entry_lines : "lines"
  chart_of_accounts ||--o{ journal_entry_lines : "accounted"
  vouchers ||--o| journal_entries : "posts"
  vouchers ||--o{ payments : "records"
  sales_documents ||--o{ payments : "applied"

  companies {
    uuid id PK
    text code UK
    text name
    boolean is_active
    timestamptz deleted_at
  }
  branches {
    uuid id PK
    uuid company_id FK
    text code
    text name
  }
  users {
    uuid id PK
    uuid company_id FK
    uuid branch_id FK
    text email
    text role_code
  }
  clients {
    uuid id PK
    uuid company_id FK
    text client_code
    text pipeline_stage
    text quotation_status
    text financial_status
    integer version_no
    timestamptz deleted_at
  }
  sales_documents {
    uuid id PK
    uuid company_id FK
    text client_id
    text doc_type
    text doc_number
    numeric total_amount
  }
  sales_contracts {
    uuid id PK
    text contract_number UK
    text client_id
    numeric total_amount
  }
  chart_of_accounts {
    uuid id PK
    uuid company_id FK
    text code
    text account_type
  }
  journal_entries {
    uuid id PK
    text entry_number UK
    text client_id
    text status
  }
  vouchers {
    uuid id PK
    text voucher_number UK
    text voucher_type
    numeric total_amount
  }
  payments {
    uuid id PK
    uuid voucher_id FK
    uuid invoice_doc_id FK
    numeric amount
  }
```

---

## 2) هيكل المشروع والسلامة والوسائط

```mermaid
erDiagram
  companies ||--o{ projects : "owns"
  clients ||--o{ projects : "commissioned"
  projects ||--o{ buildings : "contains"
  buildings ||--o{ floors : "has"
  floors ||--o{ zones : "divides"
  zones ||--o{ rooms : "contains"
  projects ||--o{ safety_systems : "requires"
  buildings ||--o{ safety_systems : "hosts"
  floors ||--o{ safety_systems : "scoped"
  zones ||--o{ safety_systems : "scoped"
  rooms ||--o{ safety_systems : "scoped"
  safety_systems ||--o{ equipment : "includes"
  rooms ||--o{ equipment : "located"
  ref_building_types ||--o{ buildings : "classifies"
  ref_activity_types ||--o{ buildings : "activity"
  ref_manufacturers ||--o{ equipment : "makes"
  ref_units ||--o{ equipment : "measures"
  projects ||--o{ site_visits : "visited"
  site_visits ||--o{ visit_notes : "notes"
  projects ||--o{ documents : "docs"
  projects ||--o{ photos : "photos"
  site_visits ||--o{ photos : "captured"
  attachments ||--o| photos : "file"
  buildings ||--o{ photos : "shows"
  equipment ||--o{ photos : "shows"

  projects {
    uuid id PK
    uuid company_id FK
    text project_code
    text status
    text pipeline_stage
  }
  buildings {
    uuid id PK
    uuid project_id FK
    text building_code
    numeric building_area
    integer occupancy_load
  }
  floors {
    uuid id PK
    uuid building_id FK
    text floor_code
    integer floor_number
  }
  zones {
    uuid id PK
    uuid floor_id FK
    text zone_code
    text zone_type
  }
  rooms {
    uuid id PK
    uuid zone_id FK
    text room_code
    integer occupancy
  }
  safety_systems {
    uuid id PK
    uuid project_id FK
    text system_category
    text standard_ref
  }
  equipment {
    uuid id PK
    uuid safety_system_id FK
    text equipment_code
    jsonb specs
  }
  site_visits {
    uuid id PK
    uuid project_id FK
    timestamptz visit_date
    text status
  }
  documents {
    uuid id PK
    text document_number
    text approval_status
    text version_label
  }
  attachments {
    uuid id PK
    text related_entity_type
    uuid related_entity_id
    text file_type
    text storage_path
  }
  photos {
    uuid id PK
    uuid visit_id FK
    text photo_type
    text phase
    numeric gps_lat
  }
```

---

## 3) الامتثال + المعرفة + الذكاء الاصطناعي + التدقيق / Workflow

```mermaid
erDiagram
  companies ||--o{ compliance_rules : "adopts"
  ref_activity_types ||--o{ compliance_rules : "applies"
  ref_building_types ||--o{ compliance_rules : "applies"
  compliance_rules ||--o{ compliance_exceptions : "excepted"
  projects ||--o{ compliance_exceptions : "on"
  companies ||--o{ knowledge_articles : "owns"
  companies ||--o{ ai_conversations : "runs"
  users ||--o{ ai_conversations : "chats"
  projects ||--o{ ai_conversations : "context"
  ai_conversations ||--o{ ai_messages : "messages"
  ai_conversations ||--o{ ai_suggestions : "suggests"
  companies ||--o{ ai_model_usage_log : "meters"
  companies ||--o{ record_versions : "versions"
  companies ||--o{ audit_logs : "audits"
  companies ||--o{ archive_policies : "policies"
  companies ||--o{ workflow_definitions : "defines"
  workflow_definitions ||--o{ workflow_instances : "instantiates"
  workflow_instances ||--o{ workflow_tasks : "tasks"
  workflow_instances ||--o{ workflow_approvals : "approvals"
  workflow_tasks ||--o{ workflow_approvals : "decided"
  companies ||--o{ notifications : "notifies"
  users ||--o{ notifications : "receives"
  companies ||--o{ integration_endpoints : "integrates"
  integration_endpoints ||--o{ integration_sync_logs : "logs"

  compliance_rules {
    uuid id PK
    text rule_code
    text priority
    text reference_code
    jsonb rule_body
    integer version_no
  }
  compliance_exceptions {
    uuid id PK
    uuid rule_id FK
    uuid project_id FK
    text status
  }
  knowledge_articles {
    uuid id PK
    text article_code
    text question
    text solution
    text_array tags
  }
  ai_conversations {
    uuid id PK
    uuid user_id FK
    text model_name
  }
  ai_messages {
    uuid id PK
    uuid conversation_id FK
    text role
    text content
  }
  ai_suggestions {
    uuid id PK
    jsonb analysis_result
    numeric quality_score
    integer feedback_rating
  }
  ai_model_usage_log {
    uuid id PK
    text model_name
    integer tokens_in
    integer tokens_out
  }
  record_versions {
    uuid id PK
    text entity_type
    uuid entity_id
    integer version_no
    jsonb snapshot
  }
  audit_logs {
    uuid id PK
    text action
    text entity_type
    jsonb old_data
    jsonb new_data
  }
  workflow_definitions {
    uuid id PK
    text code
    jsonb definition
  }
  workflow_instances {
    uuid id PK
    text current_state
    text status
  }
  integration_endpoints {
    uuid id PK
    text direction
    jsonb mapping
  }
  integration_sync_logs {
    uuid id PK
    text status
    text error_message
  }
```
