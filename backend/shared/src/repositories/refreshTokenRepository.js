import { getDatabasePool } from '../db.js';

export class RefreshTokenRepository {
  constructor(pool = null) {
    this.pool = pool || getDatabasePool();
  }

  async create(
    { userId, familyId, tokenHash, expiresAt, familyExpiresAt, userAgentHash = null },
    client = null
  ) {
    const db = client || this.pool;
    const query = `
      INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, family_expires_at, user_agent_hash)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, family_id, token_hash, expires_at, family_expires_at, revoked_at, revoked_reason, created_at
    `;
    const result = await db.query(query, [
      userId,
      familyId,
      tokenHash,
      expiresAt,
      familyExpiresAt,
      userAgentHash
    ]);
    return result.rows[0];
  }

  async findByTokenHash(tokenHash, client = null) {
    const db = client || this.pool;
    const query = `
      SELECT id, user_id, family_id, token_hash, expires_at, family_expires_at, revoked_at, revoked_reason, replaced_by, created_at
      FROM refresh_tokens
      WHERE token_hash = $1
    `;
    const result = await db.query(query, [tokenHash]);
    return result.rows[0] || null;
  }

  async rotate(
    {
      oldTokenId,
      userId,
      familyId,
      newTokenHash,
      newExpiresAt,
      familyExpiresAt,
      userAgentHash = null
    },
    client = null
  ) {
    const shouldManageTx = !client;
    const tx = client || (await this.pool.connect());

    try {
      if (shouldManageTx) await tx.query('BEGIN');

      // Insert new token
      const insertQuery = `
        INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, family_expires_at, user_agent_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, user_id, family_id, token_hash, expires_at, family_expires_at, revoked_at, revoked_reason, created_at
      `;
      const insertRes = await tx.query(insertQuery, [
        userId,
        familyId,
        newTokenHash,
        newExpiresAt,
        familyExpiresAt,
        userAgentHash
      ]);
      const newToken = insertRes.rows[0];

      // Mark old token as rotated and link to replacement
      const updateQuery = `
        UPDATE refresh_tokens
        SET revoked_at = now(), revoked_reason = 'rotated', replaced_by = $1
        WHERE id = $2
      `;
      await tx.query(updateQuery, [newToken.id, oldTokenId]);

      if (shouldManageTx) await tx.query('COMMIT');
      return newToken;
    } catch (err) {
      if (shouldManageTx) await tx.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldManageTx) tx.release();
    }
  }

  async revokeFamily(familyId, reason = 'reuse_detected', client = null) {
    const db = client || this.pool;
    const query = `
      UPDATE refresh_tokens
      SET revoked_at = now(), revoked_reason = $1
      WHERE family_id = $2 AND revoked_at IS NULL
      RETURNING id, family_id, revoked_reason
    `;
    const result = await db.query(query, [reason, familyId]);
    return result.rows;
  }

  async revokeAllForUser(userId, reason = 'password_changed', client = null) {
    const db = client || this.pool;
    const query = `
      UPDATE refresh_tokens
      SET revoked_at = now(), revoked_reason = $1
      WHERE user_id = $2 AND revoked_at IS NULL
      RETURNING id, user_id, revoked_reason
    `;
    const result = await db.query(query, [reason, userId]);
    return result.rows;
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
