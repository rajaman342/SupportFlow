import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../backend/api/src/app.js';
import {
  organizationRepository,
  userRepository,
  hashPassword,
  signAccessToken,
  closeDatabasePool
} from '../../backend/shared/src/index.js';

describe('User Management Integration Tests (Admin)', () => {
  let app;
  let org;
  let admin, agent;
  let tokenAdmin;

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now();
    const passHash = await hashPassword('UserAdminTestPass123!');

    org = await organizationRepository.create({
      name: `User Mgmt Org ${stamp}`,
      slug: `user-mgmt-org-${stamp}`
    });

    admin = await userRepository.create({
      organizationId: org.id,
      email: `admin_${stamp}@usermgmt.test`,
      passwordHash: passHash,
      fullName: 'Chief Admin',
      role: 'admin'
    });

    agent = await userRepository.create({
      organizationId: org.id,
      email: `agent_${stamp}@usermgmt.test`,
      passwordHash: passHash,
      fullName: 'Support Specialist',
      role: 'agent'
    });

    tokenAdmin = signAccessToken(admin.id);
  });

  afterAll(async () => {
    await closeDatabasePool();
  });

  it('Admin creates a new agent user in their organization', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email: `newagent_${Date.now()}@usermgmt.test`,
        fullName: 'New Agent Hired',
        role: 'agent',
        temporaryPassword: 'TempPassword123!'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('agent');
    expect(res.body.data.organizationId).toBe(org.id);
    expect(res.body.data.password_hash).toBeUndefined();
  });

  it('Admin promotes an agent to admin, and then demotes them back', async () => {
    // 1. Promote agent to admin
    const promoteRes = await request(app)
      .patch(`/api/v1/users/${agent.id}/role`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ role: 'admin' });

    expect(promoteRes.status).toBe(200);
    expect(promoteRes.body.data.role).toBe('admin');

    // 2. Demote back to agent (Allowed because Chief Admin is also an active admin)
    const demoteRes = await request(app)
      .patch(`/api/v1/users/${agent.id}/role`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ role: 'agent' });

    expect(demoteRes.status).toBe(200);
    expect(demoteRes.body.data.role).toBe('agent');
  });

  it('Enforces last active admin invariant: cannot demote the only active admin', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${admin.id}/role`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ role: 'agent' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(res.body.error.message).toContain('last active administrator');
  });

  it('Enforces last active admin invariant: cannot deactivate the only active admin', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${admin.id}/active`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ isActive: false });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('Admin deactivates an agent and verifies active state changed', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${agent.id}/active`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    // Re-activate
    const reactivateRes = await request(app)
      .patch(`/api/v1/users/${agent.id}/active`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ isActive: true });

    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.isActive).toBe(true);
  });
});
