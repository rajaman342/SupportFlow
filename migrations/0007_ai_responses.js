/**
 * Migration 0007: AI Suggestions and Snapshot Sources
 */
export async function up(pgm) {
  // 1. ai_responses table
  pgm.sql(`
    CREATE TABLE ai_responses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      indexing_config_id uuid NOT NULL REFERENCES indexing_configs(id) ON DELETE RESTRICT,
      query_text text NOT NULL,
      trigger_message_id uuid NULL REFERENCES ticket_messages(id) ON DELETE SET NULL,
      outcome text NOT NULL CHECK (outcome IN ('answered', 'insufficient_evidence', 'conflicting_evidence', 'error')),
      draft_body text NULL,
      suggested_category text NULL,
      suggested_priority text NULL CHECK (suggested_priority IS NULL OR suggested_priority IN ('low', 'medium', 'high', 'urgent')),
      review_status text NOT NULL DEFAULT 'pending_review' CHECK (review_status IN ('pending_review', 'approved', 'edited_approved', 'rejected', 'dismissed')),
      reviewed_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at timestamptz NULL,
      final_body text NULL,
      provider text NOT NULL,
      model text NOT NULL,
      prompt_version text NOT NULL,
      latency_ms integer NULL,
      input_tokens integer NULL,
      output_tokens integer NULL,
      top_similarity real NULL,
      error_code text NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT outcome_draft_body_check CHECK (
        (outcome = 'answered' AND draft_body IS NOT NULL) OR
        (outcome != 'answered' AND draft_body IS NULL)
      ),
      CONSTRAINT review_status_fields_check CHECK (
        (review_status IN ('approved', 'edited_approved', 'rejected', 'dismissed') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR
        (review_status = 'pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      )
    );

    CREATE INDEX ai_responses_ticket_created_idx ON ai_responses (ticket_id, created_at DESC);
    CREATE INDEX ai_responses_org_created_idx ON ai_responses (organization_id, created_at DESC);
  `);

  // 2. ai_response_sources table (immutable snapshot)
  pgm.sql(`
    CREATE TABLE ai_response_sources (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ai_response_id uuid NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      chunk_id uuid NULL REFERENCES document_chunks(id) ON DELETE SET NULL,
      document_id uuid NOT NULL,
      document_version_id uuid NOT NULL,
      document_title text NOT NULL,
      page_number integer NOT NULL CHECK (page_number >= 1),
      similarity real NOT NULL,
      rank integer NOT NULL CHECK (rank >= 1),
      cited_in_answer boolean NOT NULL DEFAULT false,
      snippet text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ai_response_sources_unique_rank UNIQUE (ai_response_id, rank)
    );

    CREATE INDEX ai_response_sources_response_idx ON ai_response_sources (ai_response_id);
    CREATE INDEX ai_response_sources_org_idx ON ai_response_sources (organization_id);
  `);

  // 3. Add FK from ticket_messages.ai_response_id to ai_responses(id)
  pgm.sql(`
    ALTER TABLE ticket_messages
    ADD CONSTRAINT ticket_messages_ai_response_fk
    FOREIGN KEY (ai_response_id)
    REFERENCES ai_responses(id)
    ON DELETE SET NULL;
  `);
}

export async function down(pgm) {
  pgm.sql(`
    ALTER TABLE ticket_messages DROP CONSTRAINT IF EXISTS ticket_messages_ai_response_fk;
    DROP TABLE IF EXISTS ai_response_sources;
    DROP TABLE IF EXISTS ai_responses;
  `);
}
