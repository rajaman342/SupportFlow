import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { StorageProvider } from './storageProvider.js';
import { StorageUnavailableError } from '../errors.js';

export class LocalStorageProvider extends StorageProvider {
  constructor({ baseDir, signingSecret, ttlSeconds = 60 }) {
    super();
    this.baseDir = path.resolve(baseDir || './data/storage');
    this.signingSecret = signingSecret;
    this.ttlSeconds = ttlSeconds;
  }

  _resolveSafePath(storageKey) {
    const targetPath = path.resolve(this.baseDir, storageKey);
    if (!targetPath.startsWith(this.baseDir)) {
      throw new Error('Path traversal detected');
    }
    return targetPath;
  }

  async put(storageKey, buffer, _mimeType) {
    try {
      const fullPath = this._resolveSafePath(storageKey);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, buffer);
      return {
        storageKey,
        sizeBytes: buffer.length
      };
    } catch (err) {
      throw new StorageUnavailableError(`Failed to save file to local storage: ${err.message}`);
    }
  }

  async get(storageKey) {
    try {
      const fullPath = this._resolveSafePath(storageKey);
      return await fs.readFile(fullPath);
    } catch (err) {
      throw new StorageUnavailableError(`Failed to read file from local storage: ${err.message}`);
    }
  }

  async delete(storageKey) {
    try {
      const fullPath = this._resolveSafePath(storageKey);
      await fs.unlink(fullPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new StorageUnavailableError(`Failed to delete file from local storage: ${err.message}`);
      }
    }
  }

  async createSignedDownloadUrl(documentId, versionId, expiresInSeconds = this.ttlSeconds) {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const dataToSign = `${versionId}:${exp}`;
    const token = crypto
      .createHmac('sha256', this.signingSecret)
      .update(dataToSign)
      .digest('hex');

    const url = `/api/v1/documents/${documentId}/file?versionId=${versionId}&token=${token}&exp=${exp}`;
    const expiresAt = new Date(exp * 1000).toISOString();

    return { url, expiresAt };
  }

  verifyToken(versionId, token, expTimestampSec) {
    if (!token || !expTimestampSec || !versionId) {
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const exp = Number(expTimestampSec);
    if (isNaN(exp) || nowSec > exp) {
      return false; // Expired
    }

    const dataToSign = `${versionId}:${exp}`;
    const expectedToken = crypto
      .createHmac('sha256', this.signingSecret)
      .update(dataToSign)
      .digest('hex');

    if (token.length !== expectedToken.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expectedToken, 'hex'));
  }
}
