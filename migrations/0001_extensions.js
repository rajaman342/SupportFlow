/**
 * SupportFlow Migration 0001: Database Extensions
 * Enables pgvector (`vector`) and case-insensitive text (`citext`).
 */

export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector;');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS citext;');
}

export async function down(pgm) {
  pgm.sql('DROP EXTENSION IF EXISTS vector;');
  pgm.sql('DROP EXTENSION IF EXISTS citext;');
}
