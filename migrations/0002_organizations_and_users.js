/**
 * SupportFlow Migration 0002: Organizations and Users
 * Implements tenant boundary (organizations) and user accounts with roles.
 */

export const shorthands = undefined;

export async function up(pgm) {
  // Organizations (Tenant Boundary)
  pgm.sql(`
    CREATE TABLE organizations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,50}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // Users (Identity, Role, Org Membership)
  pgm.sql(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      email citext NOT NULL,
      password_hash text NOT NULL,
      full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
      role text NOT NULL CHECK (role IN ('customer', 'agent', 'admin')),
      is_active boolean NOT NULL DEFAULT true,
      password_changed_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT users_org_email_unique UNIQUE (organization_id, email)
    );

    CREATE INDEX users_org_role_idx ON users (organization_id, role);
  `);
}

export async function down(pgm) {
  pgm.sql('DROP TABLE IF EXISTS users;');
  pgm.sql('DROP TABLE IF EXISTS organizations;');
}
