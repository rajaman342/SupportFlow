/**
 * SupportFlow Migration 0003: Refresh Tokens
 * Server-side storage for rotating refresh token families with reuse detection.
 */

export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE refresh_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id uuid NOT NULL,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      family_expires_at timestamptz NOT NULL,
      revoked_at timestamptz NULL,
      revoked_reason text NULL CHECK (revoked_reason IN ('rotated', 'logout', 'reuse_detected', 'password_changed', 'deactivated', 'admin')),
      replaced_by uuid NULL REFERENCES refresh_tokens(id),
      user_agent_hash text NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
    CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens (family_id);
    CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
  `);
}

export async function down(pgm) {
  pgm.sql('DROP TABLE IF EXISTS refresh_tokens;');
}
