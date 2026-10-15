/**
 * StorageProvider Interface
 *
 * Defines the contract for private document storage.
 * Documents must NEVER have permanent public URLs.
 */
export class StorageProvider {
  /**
   * Put file buffer into private storage
   * @param {string} storageKey
   * @param {Buffer} buffer
   * @param {string} mimeType
   * @returns {Promise<{ storageKey: string, sizeBytes: number }>}
   */
  async put(_storageKey, _buffer, _mimeType) {
    throw new Error('put() not implemented');
  }

  /**
   * Get file buffer from private storage
   * @param {string} storageKey
   * @returns {Promise<Buffer>}
   */
  async get(_storageKey) {
    throw new Error('get() not implemented');
  }

  /**
   * Delete file from private storage
   * @param {string} storageKey
   * @returns {Promise<void>}
   */
  async delete(_storageKey) {
    throw new Error('delete() not implemented');
  }

  /**
   * Generate short-lived signed URL for authenticated downloading
   * @param {string} documentId
   * @param {string} versionId
   * @param {number} expiresInSeconds
   * @returns {Promise<{ url: string, expiresAt: string }>}
   */
  async createSignedDownloadUrl(_documentId, _versionId, _expiresInSeconds) {
    throw new Error('createSignedDownloadUrl() not implemented');
  }

  /**
   * Verify HMAC token for private streaming
   * @param {string} versionId
   * @param {string} token
   * @param {number} expTimestampSec
   * @returns {boolean}
   */
  verifyToken(_versionId, _token, _expTimestampSec) {
    throw new Error('verifyToken() not implemented');
  }
}
