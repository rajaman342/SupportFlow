import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../backend/api/src/app.js';
import {
  organizationRepository,
  userRepository,
  documentRepository,
  documentChunkRepository,
  hashPassword,
  signAccessToken,
  closeDatabasePool,
  closeQueues
} from '../../backend/shared/src/index.js';
import { processIngestJob } from '../../backend/worker/src/processors/ingestProcessor.js';

function createSyntheticPdf(text = 'SupportFlow Customer Support Policy') {
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

describe('Document Domain & Ingestion Integration Tests', () => {
  let app;
  let org;
  let agent;
  let tokenAgent;

  beforeAll(async () => {
    app = createApp();
    const stamp = Date.now();
    const passHash = await hashPassword('DocDomainPass123!');

    org = await organizationRepository.create({
      name: `Doc Org ${stamp}`,
      slug: `doc-org-${stamp}`
    });

    agent = await userRepository.create({
      organizationId: org.id,
      email: `agent_${stamp}@doc.test`,
      passwordHash: passHash,
      fullName: 'Agent Doc',
      role: 'agent'
    });

    tokenAgent = signAccessToken(agent.id);
  });


  afterAll(async () => {
    await closeQueues();
    await closeDatabasePool();
  });

  it('agent uploads a valid PDF and worker ingests it into active indexed version', async () => {
    const pdfBuffer = createSyntheticPdf('Initial Policy Terms and Conditions');

    // 1. Upload PDF
    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow')
      .field('title', 'Return Policy v1')
      .attach('file', pdfBuffer, 'returns.pdf');

    expect(uploadRes.status).toBe(202);
    expect(uploadRes.body.data).toHaveProperty('documentId');
    expect(uploadRes.body.data).toHaveProperty('versionId');
    expect(uploadRes.body.data.status).toBe('uploaded');

    const { documentId, versionId } = uploadRes.body.data;

    // 2. Process ingest job in worker
    const jobResult = await processIngestJob({
      id: `ingest:${versionId}`,
      data: { versionId, organizationId: org.id },
      attemptsMade: 0
    });

    expect(jobResult.status).toBe('indexed');
    expect(jobResult.chunkCount).toBeGreaterThan(0);

    // 3. Verify Document in DB
    const doc = await documentRepository.findById(documentId, org.id);
    expect(doc).not.toBeNull();
    expect(doc.activeVersionId).toBe(versionId);
    expect(doc.activeVersion.status).toBe('indexed');
    expect(doc.servingPreviousVersion).toBe(false);

    // 4. Verify Chunks in DB
    const chunkCount = await documentChunkRepository.countChunksForVersion(versionId);
    expect(chunkCount).toBe(jobResult.chunkCount);
  });

  it('safe replacement invariant: replacing with corrupt PDF keeps previous active version searchable', async () => {
    const validPdf = createSyntheticPdf('Original Good Version');

    // 1. Upload initial document
    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow')
      .field('title', 'Service Level Agreement')
      .attach('file', validPdf, 'sla.pdf');

    const { documentId, versionId: v1Id } = uploadRes.body.data;

    // Process v1
    await processIngestJob({
      id: `ingest:${v1Id}`,
      data: { versionId: v1Id, organizationId: org.id },
      attemptsMade: 0
    });

    const docBefore = await documentRepository.findById(documentId, org.id);
    expect(docBefore.activeVersionId).toBe(v1Id);
    expect(docBefore.activeVersion.status).toBe('indexed');

    // 2. Replace with a corrupt PDF
    const corruptPdf = Buffer.from('%PDF-1.4 corrupt broken binary body');
    const replaceRes = await request(app)
      .put(`/api/v1/documents/${documentId}/file`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow')
      .attach('file', corruptPdf, 'sla_corrupt.pdf');

    expect(replaceRes.status).toBe(202);
    const v2Id = replaceRes.body.data.versionId;
    expect(v2Id).not.toBe(v1Id);

    // Process v2 in worker -> fails with PDF_CORRUPT
    const v2JobResult = await processIngestJob({
      id: `ingest:${v2Id}`,
      data: { versionId: v2Id, organizationId: org.id },
      attemptsMade: 0
    });

    expect(v2JobResult.status).toBe('failed');
    expect(v2JobResult.errorCode).toBe('PDF_CORRUPT');

    // 3. CRUCIAL CHECK: Active version remains v1Id!
    const docAfter = await documentRepository.findById(documentId, org.id);
    expect(docAfter.activeVersionId).toBe(v1Id);
    expect(docAfter.activeVersion.status).toBe('indexed');
    expect(docAfter.latestVersion.id).toBe(v2Id);
    expect(docAfter.latestVersion.status).toBe('failed');
    expect(docAfter.servingPreviousVersion).toBe(true);
  });

  it('duplicate SHA-256 in the same organization is rejected with 409 Conflict', async () => {
    const identicalPdf = createSyntheticPdf('Unique Identical Content For Hash Check');

    // Upload first copy
    const firstRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow')
      .field('title', 'First Document Copy')
      .attach('file', identicalPdf, 'original.pdf');

    expect(firstRes.status).toBe(202);

    // Attempt second upload with identical content
    const dupRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow')
      .field('title', 'Duplicate Copy')
      .attach('file', identicalPdf, 'duplicate.pdf');

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('DUPLICATE_DOCUMENT');
  });

  it('generates short-lived signed download URL and verifies HMAC token', async () => {
    const pdf = createSyntheticPdf('Document Content for Download Test');

    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow')
      .field('title', 'Downloadable Guide')
      .attach('file', pdf, 'download_guide.pdf');

    const { documentId, versionId } = uploadRes.body.data;

    await processIngestJob({
      id: `ingest:${versionId}`,
      data: { versionId, organizationId: org.id },
      attemptsMade: 0
    });

    // 1. Request signed download URL
    const urlRes = await request(app)
      .get(`/api/v1/documents/${documentId}/download-url`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow');

    expect(urlRes.status).toBe(200);
    expect(urlRes.body.data).toHaveProperty('url');
    expect(urlRes.body.data).toHaveProperty('expiresAt');

    const downloadUrl = urlRes.body.data.url;

    // 2. Stream file using the signed download link (public without Bearer token)
    const fileRes = await request(app).get(downloadUrl);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toContain('application/pdf');
    expect(fileRes.body).toBeInstanceOf(Buffer);

    // 3. Forged HMAC token returns 403 Forbidden
    const forgedUrl = downloadUrl.replace(/token=[a-f0-9]+/, 'token=badf00dbadf00d000000');
    const forgedRes = await request(app).get(forgedUrl);
    expect(forgedRes.status).toBe(403);
    expect(forgedRes.body.error.code).toBe('INVALID_DOWNLOAD_TOKEN');
  });

  it('re-indexing reuses stored asset and creates a new version', async () => {
    const pdf = createSyntheticPdf('Document Content for Reindexing');

    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow')
      .field('title', 'Reindex Target')
      .attach('file', pdf, 'reindex.pdf');

    const { documentId, versionId: v1Id } = uploadRes.body.data;

    await processIngestJob({
      id: `ingest:${v1Id}`,
      data: { versionId: v1Id, organizationId: org.id },
      attemptsMade: 0
    });

    // Trigger reindex
    const reindexRes = await request(app)
      .post(`/api/v1/documents/${documentId}/reindex`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow');

    expect(reindexRes.status).toBe(202);
    const v2Id = reindexRes.body.data.versionId;
    expect(v2Id).not.toBe(v1Id);

    // Process reindex job
    const reindexJobResult = await processIngestJob({
      id: `ingest:${v2Id}`,
      data: { versionId: v2Id, organizationId: org.id },
      attemptsMade: 0
    });

    expect(reindexJobResult.status).toBe('indexed');

    const doc = await documentRepository.findById(documentId, org.id);
    expect(doc.activeVersionId).toBe(v2Id);
  });

  it('soft delete removes document from listing and prevents retrieval', async () => {
    const pdf = createSyntheticPdf('Delete Me');

    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow')
      .field('title', 'To Delete')
      .attach('file', pdf, 'delete.pdf');

    const { documentId } = uploadRes.body.data;

    const delRes = await request(app)
      .delete(`/api/v1/documents/${documentId}`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow');

    expect(delRes.status).toBe(204);

    // Subsequent GET returns 404
    const getRes = await request(app)
      .get(`/api/v1/documents/${documentId}`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .set('X-Requested-With', 'supportflow');

    expect(getRes.status).toBe(404);
  });
});
