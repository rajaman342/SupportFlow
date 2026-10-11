import crypto from 'node:crypto';
import { userRepository } from '../repositories/userRepository.js';
import { organizationRepository } from '../repositories/organizationRepository.js';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository.js';
import { auditService } from './auditService.js';
import { hashPassword, verifyPassword, verifyDummyPassword } from '../auth/passwordService.js';
import { signAccessToken } from '../auth/jwtService.js';
import { getConfig } from '../config.js';
import {
  ValidationError,
  InvalidCredentialsError,
  UnauthenticatedError,
  ConflictError,
  AppError
} from '../errors.js';

const DISALLOWED_PASSWORDS = new Set([
  'password1234',
  '123456789012',
  'administrator1',
  'qwertyuiop12',
  'supportflow123',
  'welcome123456'
]);

export class AuthService {
  constructor(
    userRepo = userRepository,
    orgRepo = organizationRepository,
    tokenRepo = refreshTokenRepository,
    auditor = auditService
  ) {
    this.userRepo = userRepo;
    this.orgRepo = orgRepo;
    this.tokenRepo = tokenRepo;
    this.auditor = auditor;
  }

  validatePasswordStrength(password) {
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required');
    }
    if (password.length < 12 || password.length > 128) {
      throw new ValidationError('Password must be between 12 and 128 characters');
    }
    if (DISALLOWED_PASSWORDS.has(password.toLowerCase())) {
      throw new ValidationError('Password is too common; choose a more secure password');
    }
  }

  hashOpaqueToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async register({ email, password, fullName, ip = null, requestId = null }) {
    this.validatePasswordStrength(password);
    const config = getConfig();

    // Self-registration is always placed into the default organization as a customer
    let org = await this.orgRepo.findBySlug(config.DEFAULT_ORGANIZATION_SLUG);
    if (!org) {
      // Create default organization if not yet seeded
      org = await this.orgRepo.create({
        name: 'SupportFlow Demo',
        slug: config.DEFAULT_ORGANIZATION_SLUG
      });
    }

    const existingUser = await this.userRepo.findByEmail(org.id, email);
    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await hashPassword(password);
    const user = await this.userRepo.create({
      organizationId: org.id,
      email,
      passwordHash,
      fullName,
      role: 'customer' // Enforced role: client input ignored
    });

    await this.auditor.record({
      organizationId: org.id,
      actorId: user.id,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      metadata: { role: 'customer' },
      requestId,
      ip
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        organizationId: user.organization_id,
        createdAt: user.created_at
      }
    };
  }

  async login({ email, password, userAgent = null, ip = null, requestId = null }) {
    const config = getConfig();
    const user = await this.userRepo.findByEmailFirst(email);

    if (!user) {
      // Equalize verification timing to prevent email enumeration
      await verifyDummyPassword(password);
      throw new InvalidCredentialsError('Invalid email or password');
    }

    const isMatch = await verifyPassword(user.password_hash, password);
    if (!isMatch) {
      await this.auditor.record({
        organizationId: user.organization_id,
        actorId: user.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: 'bad_password' },
        requestId,
        ip
      });
      throw new InvalidCredentialsError('Invalid email or password');
    }

    if (!user.is_active) {
      throw new UnauthenticatedError('Account is deactivated');
    }

    // Generate opaque refresh token and rotation family
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashOpaqueToken(rawRefreshToken);
    const familyId = crypto.randomUUID();

    const now = Date.now();
    const expiresAt = new Date(now + (config.REFRESH_TOKEN_TTL_DAYS || 7) * 24 * 60 * 60 * 1000);
    const familyExpiresAt = new Date(
      now + (config.REFRESH_FAMILY_MAX_DAYS || 30) * 24 * 60 * 60 * 1000
    );

    const userAgentHash = userAgent
      ? crypto.createHash('sha256').update(userAgent).digest('hex')
      : null;

    await this.tokenRepo.create({
      userId: user.id,
      familyId,
      tokenHash,
      expiresAt,
      familyExpiresAt,
      userAgentHash
    });

    const accessToken = signAccessToken(user.id);

    await this.auditor.record({
      organizationId: user.organization_id,
      actorId: user.id,
      action: 'auth.login_succeeded',
      entityType: 'user',
      entityId: user.id,
      metadata: {},
      requestId,
      ip
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        organizationId: user.organization_id,
        createdAt: user.created_at
      },
      accessToken,
      refreshToken: rawRefreshToken,
      refreshExpiresAt: expiresAt
    };
  }

  async refresh({ refreshToken, userAgent = null, ip = null, requestId = null }) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new AppError('Refresh token missing or invalid', 'REFRESH_INVALID', 401);
    }

    const config = getConfig();
    const tokenHash = this.hashOpaqueToken(refreshToken);
    const tokenRecord = await this.tokenRepo.findByTokenHash(tokenHash);

    if (!tokenRecord) {
      throw new AppError('Refresh token not found', 'REFRESH_INVALID', 401);
    }

    const now = new Date();

    // Absolute family expiration check
    if (new Date(tokenRecord.family_expires_at) < now) {
      throw new AppError('Refresh session family expired', 'REFRESH_INVALID', 401);
    }

    // Reuse detection logic
    if (tokenRecord.revoked_at) {
      const revokedAt = new Date(tokenRecord.revoked_at).getTime();
      const elapsedSeconds = (now.getTime() - revokedAt) / 1000;
      const graceSeconds = config.REFRESH_REUSE_GRACE_SECONDS || 10;

      if (tokenRecord.revoked_reason === 'rotated' && elapsedSeconds <= graceSeconds) {
        // Benign race between concurrent tabs in same browser session
        throw new AppError('Refresh token already rotated in grace period', 'REFRESH_INVALID', 401);
      }

      // Malicious or outside grace: Revoke entire family!
      await this.tokenRepo.revokeFamily(tokenRecord.family_id, 'reuse_detected');

      // Audit reuse detection
      const user = await this.userRepo.findById(tokenRecord.user_id);
      if (user) {
        await this.auditor.record({
          organizationId: user.organization_id,
          actorId: user.id,
          action: 'auth.refresh_reuse_detected',
          entityType: 'refresh_tokens',
          entityId: tokenRecord.id,
          metadata: { familyId: tokenRecord.family_id, elapsedSeconds },
          requestId,
          ip
        });
      }

      throw new AppError(
        'Refresh token reuse detected; entire session family revoked',
        'REFRESH_REUSE_DETECTED',
        401
      );
    }

    // Check individual idle token expiration
    if (new Date(tokenRecord.expires_at) < now) {
      throw new AppError('Refresh token has expired', 'REFRESH_INVALID', 401);
    }

    // Check if user is active
    const user = await this.userRepo.findById(tokenRecord.user_id);
    if (!user || !user.is_active) {
      throw new UnauthenticatedError('User account is deactivated or missing');
    }

    // Generate new rotating token
    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = this.hashOpaqueToken(newRawRefreshToken);

    const newExpiresAt = new Date(
      now.getTime() + (config.REFRESH_TOKEN_TTL_DAYS || 7) * 24 * 60 * 60 * 1000
    );

    const userAgentHash = userAgent
      ? crypto.createHash('sha256').update(userAgent).digest('hex')
      : null;

    await this.tokenRepo.rotate({
      oldTokenId: tokenRecord.id,
      userId: user.id,
      familyId: tokenRecord.family_id,
      newTokenHash,
      newExpiresAt,
      familyExpiresAt: tokenRecord.family_expires_at,
      userAgentHash
    });

    const accessToken = signAccessToken(user.id);

    return {
      accessToken,
      newRefreshToken: newRawRefreshToken,
      refreshExpiresAt: newExpiresAt
    };
  }

  async logout({ refreshToken, user = null, ip = null, requestId = null }) {
    if (refreshToken && typeof refreshToken === 'string') {
      const tokenHash = this.hashOpaqueToken(refreshToken);
      const tokenRecord = await this.tokenRepo.findByTokenHash(tokenHash);
      if (tokenRecord) {
        await this.tokenRepo.revokeFamily(tokenRecord.family_id, 'logout');
      }
    }

    if (user) {
      await this.auditor.record({
        organizationId: user.organizationId,
        actorId: user.id,
        action: 'auth.logout',
        entityType: 'user',
        entityId: user.id,
        metadata: {},
        requestId,
        ip
      });
    }
  }

  async changePassword({ userId, currentPassword, newPassword, ip = null, requestId = null }) {
    this.validatePasswordStrength(newPassword);

    const user = await this.userRepo.findByIdWithPasswordHash(userId);
    if (!user) {
      throw new UnauthenticatedError('User not found');
    }

    const isMatch = await verifyPassword(user.password_hash, currentPassword);
    if (!isMatch) {
      throw new InvalidCredentialsError('Current password is incorrect');
    }

    const newHash = await hashPassword(newPassword);
    await this.userRepo.updatePassword(userId, newHash);

    // Revoke all existing refresh sessions
    await this.tokenRepo.revokeAllForUser(userId, 'password_changed');

    await this.auditor.record({
      organizationId: user.organization_id,
      actorId: user.id,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: user.id,
      metadata: {},
      requestId,
      ip
    });
  }
}

export const authService = new AuthService();
