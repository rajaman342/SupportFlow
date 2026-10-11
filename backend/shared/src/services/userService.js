import { userRepository } from '../repositories/userRepository.js';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository.js';
import { auditService } from './auditService.js';
import { hashPassword } from '../auth/passwordService.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  AppError
} from '../errors.js';

export class UserService {
  constructor(
    userRepo = userRepository,
    tokenRepo = refreshTokenRepository,
    auditor = auditService
  ) {
    this.userRepo = userRepo;
    this.tokenRepo = tokenRepo;
    this.auditor = auditor;
  }

  async createUser({
    organizationId,
    email,
    fullName,
    role,
    temporaryPassword,
    actorId,
    ip = null,
    requestId = null
  }) {
    if (!['agent', 'admin', 'customer'].includes(role)) {
      throw new ValidationError('Invalid role; must be agent, admin, or customer');
    }

    const existing = await this.userRepo.findByEmail(organizationId, email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists in the organization');
    }

    const passwordHash = await hashPassword(temporaryPassword);
    const user = await this.userRepo.create({
      organizationId,
      email,
      passwordHash,
      fullName,
      role
    });

    await this.auditor.record({
      organizationId,
      actorId,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      metadata: { role, email: user.email },
      requestId,
      ip
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      organizationId: user.organization_id,
      isActive: user.is_active,
      createdAt: user.created_at
    };
  }

  async listUsers(params) {
    return this.userRepo.listUsers(params);
  }

  async changeRole({ userId, organizationId, newRole, actorId, ip = null, requestId = null }) {
    if (!['agent', 'admin', 'customer'].includes(newRole)) {
      throw new ValidationError('Invalid role');
    }

    const targetUser = await this.userRepo.findById(userId);
    if (!targetUser || targetUser.organization_id !== organizationId) {
      throw new NotFoundError('User not found in organization');
    }

    // Safety guard: cannot demote the last active admin
    if (targetUser.role === 'admin' && newRole !== 'admin') {
      const activeAdminCount = await this.userRepo.countActiveAdmins(organizationId);
      if (activeAdminCount <= 1) {
        throw new AppError(
          'Cannot demote the last active administrator in the organization',
          'BUSINESS_RULE_VIOLATION',
          422
        );
      }
    }

    const updated = await this.userRepo.updateRole(userId, organizationId, newRole);

    await this.auditor.record({
      organizationId,
      actorId,
      action: 'user.role_changed',
      entityType: 'user',
      entityId: userId,
      metadata: { oldRole: targetUser.role, newRole },
      requestId,
      ip
    });

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.full_name,
      role: updated.role,
      organizationId: updated.organization_id,
      isActive: updated.is_active,
      updatedAt: updated.updated_at
    };
  }

  async toggleActive({ userId, organizationId, isActive, actorId, ip = null, requestId = null }) {
    const targetUser = await this.userRepo.findById(userId);
    if (!targetUser || targetUser.organization_id !== organizationId) {
      throw new NotFoundError('User not found in organization');
    }

    // Safety guard: cannot deactivate self if last active admin
    if (!isActive && targetUser.role === 'admin') {
      const activeAdminCount = await this.userRepo.countActiveAdmins(organizationId);
      if (activeAdminCount <= 1) {
        throw new AppError(
          'Cannot deactivate the last active administrator in the organization',
          'BUSINESS_RULE_VIOLATION',
          422
        );
      }
    }

    const updated = await this.userRepo.updateActive(userId, organizationId, isActive);

    // If deactivating user, invalidate all their active refresh tokens immediately
    if (!isActive) {
      await this.tokenRepo.revokeAllForUser(userId, 'deactivated');
    }

    const action = isActive ? 'user.activated' : 'user.deactivated';
    await this.auditor.record({
      organizationId,
      actorId,
      action,
      entityType: 'user',
      entityId: userId,
      metadata: { isActive },
      requestId,
      ip
    });

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.full_name,
      role: updated.role,
      organizationId: updated.organization_id,
      isActive: updated.is_active,
      updatedAt: updated.updated_at
    };
  }
}

export const userService = new UserService();
