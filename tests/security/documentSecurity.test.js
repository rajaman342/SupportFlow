import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../backend/api/src/app.js';
import {
  organizationRepository,
  userRepository,
  hashPassword,
  signAccessToken,
  closeDatabasePool,
  closeQueues
} from '../../backend/shared/src/index.js';
import { processIngestJob } from '../../backend/worker/src/processors/ingestProcessor.js';

function createSyntheticPdf(text = 'Confidential Document') {
  const streamContent = `BT\n/F1 18 Tf\n50 700 Td\n(${text}) Tj\nET`;
  const streamLength = Buffer.byteLength(streamContent);

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000222 00000 n 
0000000318 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
400
%%EOF
`;
  return Buffer.from(pdf, 'utf8');
}

describe('Document Security & Tenant Isolation Tests', () => {
  let app;
  let orgA, orgB;
  let agentOrgA, agentOrgB, customerOrgA;
  let tokenAgentA, tokenAgentB, tokenCustomerA;
  let docAId;

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now();
    const passHash = await hashPassword('DocSecPass123!');

    orgA = await organizationRepository.create({
      name: `Sec Org A ${stamp}`,
      slug: `sec-org-a-${stamp}`
    });

    orgB = await organizationRepository.create({
      name: `Sec Org B ${stamp}`,
      slug: `sec-org-b-${stamp}`
    });

    agentOrgA = await userRepository.create({
      organizationId: orgA.id,
      email: `agent_a_${stamp}@sec.test`,
      passwordHash: passHash,
      fullName: 'Agent Org A',
      role: 'agent'
    });

    agentOrgB = await userRepository.create({
      organizationId: orgB.id,
      email: `agent_b_${stamp}@sec.test`,
      passwordHash: passHash,
      fullName: 'Agent Org B',
      role: 'agent'
    });

    customerOrgA = await userRepository.create({
      organizationId: orgA.id,
      email: `customer_a_${stamp}@sec.test`,
      passwordHash: passHash,
      fullName: 'Customer Org A',
      role: 'customer'
    });

    tokenAgentA = signAccessToken(agentOrgA.id);
    tokenAgentB = signAccessToken(agentOrgB.id);
    tokenCustomerA = signAccessToken(customerOrgA.id);

    // Agent A uploads a document in Org A
    const pdf = createSyntheticPdf('Org A Private Document');
    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAgentA}`)
      .set('X-Requested-With', 'supportflow')
      .field('title', 'Confidential Org A Doc')
      .attach('file', pdf, 'org_a_doc.pdf');

    docAId = uploadRes.body.data.documentId;
    const vId = uploadRes.body.data.versionId;

    await processIngestJob({
      id: `ingest:${vId}`,
      data: { versionId: vId, organizationId: orgA.id },
      attemptsMade: 0
    });
  });


  afterAll(async () => {
    await closeQueues();
    await closeDatabasePool();
  });

  it('strictly isolates documents across organizations (cross-org requests return 404)', async () => {
    // Org B agent attempts to access Org A document
    const getRes = await request(app)
      .get(`/api/v1/documents/${docAId}`)
      .set('Authorization', `Bearer ${tokenAgentB}`)
      .set('X-Requested-With', 'supportflow');

    expect(getRes.status).toBe(404);

    // Org B agent attempts to replace Org A document
    const replaceRes = await request(app)
      .put(`/api/v1/documents/${docAId}/file`)
      .set('Authorization', `Bearer ${tokenAgentB}`)
      .set('X-Requested-With', 'supportflow')
      .attach('file', createSyntheticPdf('Attacker PDF'), 'hacked.pdf');

    expect(replaceRes.status).toBe(404);

    // Org B agent attempts to delete Org A document
    const deleteRes = await request(app)
      .delete(`/api/v1/documents/${docAId}`)
      .set('Authorization', `Bearer ${tokenAgentB}`)
      .set('X-Requested-With', 'supportflow');

    expect(deleteRes.status).toBe(404);

    // Org B agent attempts to get download URL for Org A document
    const urlRes = await request(app)
      .get(`/api/v1/documents/${docAId}/download-url`)
      .set('Authorization', `Bearer ${tokenAgentB}`)
      .set('X-Requested-With', 'supportflow');

    expect(urlRes.status).toBe(404);
  });

  it('strictly forbids customers from all document endpoints (returns 403 Forbidden)', async () => {
    // Customer cannot upload
    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenCustomerA}`)
      .set('X-Requested-With', 'supportflow')
      .field('title', 'Customer Doc')
      .attach('file', createSyntheticPdf('Customer PDF'), 'test.pdf');

    expect(uploadRes.status).toBe(403);
    expect(uploadRes.body.error.code).toBe('FORBIDDEN');

    // Customer cannot list
    const listRes = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenCustomerA}`)
      .set('X-Requested-With', 'supportflow');

    expect(listRes.status).toBe(403);

    // Customer cannot get by ID
    const getRes = await request(app)
      .get(`/api/v1/documents/${docAId}`)
      .set('Authorization', `Bearer ${tokenCustomerA}`)
      .set('X-Requested-With', 'supportflow');

    expect(getRes.status).toBe(403);

    // Customer cannot delete
    const deleteRes = await request(app)
      .delete(`/api/v1/documents/${docAId}`)
      .set('Authorization', `Bearer ${tokenCustomerA}`)
      .set('X-Requested-With', 'supportflow');

    expect(deleteRes.status).toBe(403);
  });

  it('rejects forged signed URL token and expired token', async () => {
    // Valid URL request
    const urlRes = await request(app)
      .get(`/api/v1/documents/${docAId}/download-url`)
      .set('Authorization', `Bearer ${tokenAgentA}`)
      .set('X-Requested-With', 'supportflow');

    expect(urlRes.status).toBe(200);
    const validUrl = urlRes.body.data.url;

    // 1. Forged token
    const forgedUrl = validUrl.replace(/token=[a-f0-9]+/, 'token=deadbeefdeadbeefdeadbeef');
    const forgedRes = await request(app).get(forgedUrl);
    expect(forgedRes.status).toBe(403);

    // 2. Expired token (exp in past)
    const expiredUrl = validUrl.replace(/exp=\d+/, 'exp=1000000000');
    const expiredRes = await request(app).get(expiredUrl);
    expect(expiredRes.status).toBe(403);
  });
});
