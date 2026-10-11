/**
 * SupportFlow Migration 0005: Audit Logs
 * Append-only immutable audit trail for security and operational events.
 */

export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      actor_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id uuid NULL,
      metadata jsonb NOT NULL DEFAULT '{}',
      request_id text NULL,
      ip inet NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at DESC);
    CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
  `);
}

export async function down(pgm) {
  pgm.sql('DROP TABLE IF EXISTS audit_logs;');
}
