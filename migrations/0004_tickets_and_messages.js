/**
 * SupportFlow Migration 0004: Tickets and Ticket Messages
 * Core ticketing domain with full-text search, priority, status transitions, and immutable messages.
 */

export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      assigned_agent_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
      subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 200),
      status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
      priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      category text NULL CHECK (category IS NULL OR char_length(category) <= 60),
      resolved_at timestamptz NULL,
      search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', subject)) STORED,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT resolved_at_check CHECK ((status = 'resolved' AND resolved_at IS NOT NULL) OR (status != 'resolved' AND resolved_at IS NULL))
    );

    CREATE INDEX tickets_org_status_prio_idx ON tickets (organization_id, status, priority, created_at DESC);
    CREATE INDEX tickets_customer_created_idx ON tickets (customer_id, created_at DESC);
    CREATE INDEX tickets_assigned_status_idx ON tickets (assigned_agent_id, status);
    CREATE INDEX tickets_search_tsv_gin ON tickets USING gin (search_tsv);

    CREATE TABLE ticket_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      author_role text NOT NULL CHECK (author_role IN ('customer', 'agent', 'admin')),
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
      source text NOT NULL DEFAULT 'human' CHECK (source IN ('human', 'ai_approved')),
      ai_response_id uuid NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT source_ai_response_check CHECK ((source = 'ai_approved' AND ai_response_id IS NOT NULL) OR (source = 'human' AND ai_response_id IS NULL))
    );

    CREATE INDEX ticket_messages_ticket_created_idx ON ticket_messages (ticket_id, created_at);
  `);
}

export async function down(pgm) {
  pgm.sql('DROP TABLE IF EXISTS ticket_messages;');
  pgm.sql('DROP TABLE IF EXISTS tickets;');
}
