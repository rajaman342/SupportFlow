import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../backend/api/src/app.js';
import {
  organizationRepository,
  userRepository,
  ticketRepository,
  indexingConfigRepository,
  retrievalRepository,
  hashPassword,
  signAccessToken,
  closeDatabasePool,
  closeQueues
} from '../../backend/shared/src/index.js';
import { processIngestJob } from '../../backend/worker/src/processors/ingestProcessor.js';

function createSyntheticPdf(text = 'SupportFlow Customer Refund Policy') {
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

describe('RAG Retrieval & AI Suggestion Pipeline Integration Tests', () => {
  let app;
  let org;
  let agent;
  let customer;
  let tokenAgent;
  let ticketId;
  let documentId;
  let version1Id;

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now();
    const passHash = await hashPassword('RagPass123!');

    org = await organizationRepository.create({
      name: `RAG Org ${stamp}`,
      slug: `rag-org-${stamp}`
    });

    agent = await userRepository.create({
      organizationId: org.id,
      email: `agent_${stamp}@rag.test`,
      passwordHash: passHash,
      fullName: 'Agent Reviewer',
      role: 'agent'
    });

    customer = await userRepository.create({
      organizationId: org.id,
      email: `customer_${stamp}@rag.test`,
      passwordHash: passHash,
      fullName: 'Customer Inquirer',
      role: 'customer'
    });

    tokenAgent = signAccessToken(agent.id);

    // 1. Upload and ingest knowledge document
    const pdfBuffer = createSyntheticPdf('Refunds can be requested within 30 days of delivery with receipt.');
    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .attach('file', pdfBuffer, 'refund_policy.pdf')
      .field('title', 'Customer Refund Policy')
      .expect(202);

    documentId = uploadRes.body.data.documentId;
    version1Id = uploadRes.body.data.versionId;

    // Process ingestion job
    await processIngestJob({
      data: {
        versionId: version1Id,
        organizationId: org.id
      }
    });

    // 2. Create ticket with customer message
    const { ticket } = await ticketRepository.createWithFirstMessage({
      organizationId: org.id,
      customerId: customer.id,
      subject: 'Refunds within 30 days of delivery',
      body: 'Can I get refunds requested within 30 days of delivery with receipt?',
      priority: 'medium'
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await closeQueues();
    await closeDatabasePool();
  });

  it('generates grounded AI draft citing retrieved document and page number', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/ai-suggestions`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .send({ force: false })
      .expect(201);

    const suggestion = res.body.data;
    expect(suggestion.ticketId).toBe(ticketId);
    expect(suggestion.outcome).toBe('answered');
    expect(suggestion.reviewStatus).toBe('pending_review');
    expect(suggestion.provider).toBe('mock');
    expect(suggestion.model).toBe('mock-llm-v1');
    expect(suggestion.draftBody).toBeTruthy();
    expect(suggestion.draftBody).toContain('[1]');

    // Verify snapshot sources
    expect(Array.isArray(suggestion.sources)).toBe(true);
    expect(suggestion.sources.length).toBeGreaterThan(0);

    const source1 = suggestion.sources[0];
    expect(source1.rank).toBe(1);
    expect(source1.documentTitle).toBe('Customer Refund Policy');
    expect(source1.pageNumber).toBe(1);
    expect(source1.citedInAnswer).toBe(true);
    expect(source1.similarity).toBeGreaterThan(0.3);
    expect(source1.snippet).toContain('Refunds can be requested');
  });

  it('idempotency and cost guard: re-requesting without force returns existing suggestion with 200 OK', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/ai-suggestions`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .send({ force: false })
      .expect(200);

    expect(res.body.data.outcome).toBe('answered');
    expect(res.body.data.reviewStatus).toBe('pending_review');
  });

  it('force=true bypasses cost guard and generates a new suggestion with 201 Created', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/ai-suggestions`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .send({ force: true })
      .expect(201);

    expect(res.body.data.outcome).toBe('answered');
    expect(res.body.data.reviewStatus).toBe('pending_review');
  });

  it('lists AI suggestions for a ticket, newest first', async () => {
    const res = await request(app)
      .get(`/api/v1/tickets/${ticketId}/ai-suggestions`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('human review approve posts message to ticket conversation without altering ticket status', async () => {
    // 1. Get latest pending suggestion
    const listRes = await request(app)
      .get(`/api/v1/tickets/${ticketId}/ai-suggestions`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    const pendingSuggestion = listRes.body.data.find((s) => s.reviewStatus === 'pending_review');
    expect(pendingSuggestion).toBeDefined();

    // 2. Approve suggestion
    const reviewRes = await request(app)
      .post(`/api/v1/ai-suggestions/${pendingSuggestion.id}/review`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .send({ action: 'approve' })
      .expect(200);

    expect(reviewRes.body.data.reviewStatus).toBe('approved');
    expect(reviewRes.body.data.reviewedBy).toBe(agent.id);
    expect(reviewRes.body.data.finalBody).toBe(pendingSuggestion.draftBody);

    // 3. Verify ticket conversation contains approved message authored by reviewing agent
    const messagesRes = await request(app)
      .get(`/api/v1/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    const approvedMessage = messagesRes.body.data.find(
      (m) => m.aiResponseId === pendingSuggestion.id
    );
    expect(approvedMessage).toBeDefined();
    expect(approvedMessage.source).toBe('ai_approved');
    expect(approvedMessage.authorId).toBe(agent.id);
    expect(approvedMessage.body).toBe(pendingSuggestion.draftBody);

    // 4. INVARIANT: Ticket status remains unchanged (still open)
    const ticketRes = await request(app)
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    expect(ticketRes.body.data.status).toBe('open');
    expect(ticketRes.body.data.resolved_at).toBeNull();
  });

  it('reviewing an already-reviewed suggestion returns 409 Conflict', async () => {
    const listRes = await request(app)
      .get(`/api/v1/tickets/${ticketId}/ai-suggestions`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    const approvedSuggestion = listRes.body.data.find((s) => s.reviewStatus === 'approved');

    await request(app)
      .post(`/api/v1/ai-suggestions/${approvedSuggestion.id}/review`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .send({ action: 'approve' })
      .expect(409);
  });

  it('human review edit_approve posts custom edited body to ticket conversation', async () => {
    // Generate new suggestion to edit_approve
    const genRes = await request(app)
      .post(`/api/v1/tickets/${ticketId}/ai-suggestions`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .send({ force: true })
      .expect(201);

    const suggestion = genRes.body.data;
    const customBody = 'Hello! As per our policy [1], we are happy to assist with your refund.';

    const reviewRes = await request(app)
      .post(`/api/v1/ai-suggestions/${suggestion.id}/review`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .send({ action: 'edit_approve', body: customBody })
      .expect(200);

    expect(reviewRes.body.data.reviewStatus).toBe('edited_approved');
    expect(reviewRes.body.data.finalBody).toBe(customBody);

    // Verify conversation has message with custom body
    const messagesRes = await request(app)
      .get(`/api/v1/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    const msg = messagesRes.body.data.find((m) => m.aiResponseId === suggestion.id);
    expect(msg).toBeDefined();
    expect(msg.body).toBe(customBody);
    expect(msg.source).toBe('ai_approved');
  });

  it('unanswerable topic results in insufficient_evidence with zero citations and null draftBody', async () => {
    // Create ticket on completely unrelated topic
    const { ticket: obscureTicket } = await ticketRepository.createWithFirstMessage({
      organizationId: org.id,
      customerId: customer.id,
      subject: 'Quantum gravity astrophysics dark matter calculation',
      body: 'Can you compute the orbital trajectory of Alpha Centauri?',
      priority: 'low'
    });

    const res = await request(app)
      .post(`/api/v1/tickets/${obscureTicket.id}/ai-suggestions`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .send({ force: false })
      .expect(201);

    expect(res.body.data.outcome).toBe('insufficient_evidence');
    expect(res.body.data.draftBody).toBeNull();
    expect(res.body.data.sources).toEqual([]);
  });

  it('dynamic source state: replaces document version and verifies source snapshot marks sourceState superseded', async () => {
    // 1. Get an existing suggestion with sources
    const listRes = await request(app)
      .get(`/api/v1/tickets/${ticketId}/ai-suggestions`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    const suggestionWithSources = listRes.body.data.find(
      (s) => s.sources && s.sources.length > 0
    );
    expect(suggestionWithSources).toBeDefined();
    const sourceId = suggestionWithSources.sources[0].id;

    // Check before replace: should be 'current'
    const beforeRes = await request(app)
      .get(`/api/v1/ai-suggestions/${suggestionWithSources.id}/sources/${sourceId}`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    expect(beforeRes.body.data.sourceState).toBe('current');

    // 2. Upload replacement version
    const newPdf = createSyntheticPdf('Updated 2026 refund guidelines and regulations.');
    const replaceRes = await request(app)
      .put(`/api/v1/documents/${documentId}/file`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .attach('file', newPdf, 'refund_policy_v2.pdf')
      .expect(202);

    const version2Id = replaceRes.body.data.versionId;
    await processIngestJob({
      data: {
        versionId: version2Id,
        organizationId: org.id
      }
    });

    // 3. Now the old source points to version 1 while active version is version 2!
    const afterRes = await request(app)
      .get(`/api/v1/ai-suggestions/${suggestionWithSources.id}/sources/${sourceId}`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    expect(afterRes.body.data.sourceState).toBe('superseded');
  });

  it('verifies retrieval EXPLAIN query execution plan with active indexing config', async () => {
    const activeConfig = await indexingConfigRepository.getActiveConfig();
    const sampleVector = new Array(activeConfig.dimensions).fill(0.01);

    const plan = await retrievalRepository.explainRetrieval(org.id, activeConfig, sampleVector, {
      topK: 6,
      candidateLimit: 50
    });

    expect(plan).toBeTruthy();
    expect(typeof plan).toBe('string');
  });
});
