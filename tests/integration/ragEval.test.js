import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  organizationRepository,
  indexingConfigRepository,
  retrievalRepository,
  documentRepository,
  documentVersionRepository,
  documentChunkRepository,
  extractPdfText,
  getEmbeddingProvider,
  getDatabasePool,
  closeDatabasePool,
  closeQueues
} from '../../backend/shared/src/index.js';
import { chunkPages } from '../../backend/shared/src/ingestion/chunker.js';

describe('RAG Evaluation Baseline & Dataset Verification (Phase 7)', () => {
  const samplesDir = path.resolve(process.cwd(), 'samples/knowledge-base');
  const evalDocsDir = path.resolve(process.cwd(), 'docs/rag-eval');
  const questionsPath = path.join(evalDocsDir, 'questions.json');

  let questionsData;
  let testOrg;
  let testUser;
  let activeConfig;
  const pool = getDatabasePool();

  beforeAll(async () => {
    // 1. Read dataset
    const raw = fs.readFileSync(questionsPath, 'utf8');
    questionsData = JSON.parse(raw);

    // 2. Provision temporary evaluation organization
    const orgSlug = `eval-test-org-${Date.now()}`;
    testOrg = await organizationRepository.create({
      name: 'RAG Eval Automated Test Org',
      slug: orgSlug
    });

    testUser = await pool.query(
      `INSERT INTO users (organization_id, email, password_hash, role, full_name)
       VALUES ($1, $2, $3, 'agent', 'Eval Agent')
       RETURNING id`,
      [testOrg.id, `eval-${Date.now()}@test.com`, '$argon2id$v=19$m=19456,t=2,p=1$fakehash']
    );

    activeConfig = await indexingConfigRepository.getActiveConfig();
  });

  afterAll(async () => {
    // Clean up temporary evaluation organization and documents
    if (testOrg) {
      await pool.query('UPDATE knowledge_documents SET active_version_id = NULL WHERE organization_id = $1', [testOrg.id]);
      await pool.query('DELETE FROM document_chunks WHERE organization_id = $1', [testOrg.id]);
      await pool.query('DELETE FROM knowledge_document_versions WHERE document_id IN (SELECT id FROM knowledge_documents WHERE organization_id = $1)', [testOrg.id]);
      await pool.query('DELETE FROM knowledge_documents WHERE organization_id = $1', [testOrg.id]);
      await pool.query('DELETE FROM users WHERE organization_id = $1', [testOrg.id]);
      await pool.query('DELETE FROM organizations WHERE id = $1', [testOrg.id]);
    }
    await closeDatabasePool();
    await closeQueues();
  });

  describe('Evaluation Dataset Schema & Integrity', () => {
    it('verifies dataset metadata and minimum question volume', () => {
      expect(questionsData).toHaveProperty('version');
      expect(questionsData).toHaveProperty('dataset');
      expect(Array.isArray(questionsData.questions)).toBe(true);
      expect(questionsData.questions.length).toBeGreaterThanOrEqual(30);
    });

    it('verifies every question follows the required evaluation schema', () => {
      const allowedCategories = ['refund', 'shipping', 'security', 'subscription', 'unanswerable', 'injection'];
      const allowedOutcomes = ['answered', 'insufficient_evidence', 'conflicting_evidence'];

      for (const q of questionsData.questions) {
        expect(q.id).toBeTruthy();
        expect(typeof q.id).toBe('string');
        expect(q.ticketSubject).toBeTruthy();
        expect(q.question).toBeTruthy();
        expect(allowedCategories).toContain(q.category);
        expect(allowedOutcomes).toContain(q.expectedOutcome);
        expect(Array.isArray(q.tags)).toBe(true);
        expect(Array.isArray(q.expectedSources)).toBe(true);

        if (q.expectedOutcome === 'answered') {
          expect(q.expectedSources.length).toBeGreaterThan(0);
          for (const src of q.expectedSources) {
            expect(src.documentTitle).toBeTruthy();
            expect(typeof src.pageNumber).toBe('number');
            expect(src.pageNumber).toBeGreaterThanOrEqual(1);
          }
        } else if (q.expectedOutcome === 'insufficient_evidence') {
          expect(q.expectedSources.length).toBe(0);
        }
      }
    });

    it('verifies balanced coverage of categories, edge cases, and adversarial injections', () => {
      const categories = questionsData.questions.map((q) => q.category);
      expect(categories).toContain('refund');
      expect(categories).toContain('shipping');
      expect(categories).toContain('security');
      expect(categories).toContain('subscription');
      expect(categories).toContain('unanswerable');
      expect(categories).toContain('injection');

      const injectionQueries = questionsData.questions.filter((q) => q.category === 'injection');
      expect(injectionQueries.length).toBeGreaterThanOrEqual(3);

      const unanswerableQueries = questionsData.questions.filter((q) => q.category === 'unanswerable');
      expect(unanswerableQueries.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Synthetic Knowledge Base Multi-Page PDF Verification', () => {
    const expectedFiles = [
      'refund_policy.pdf',
      'shipping_policy.pdf',
      'security_account_policy.pdf',
      'subscription_cancellation_policy.pdf'
    ];

    it('verifies all expected synthetic PDFs exist in samples/knowledge-base/', () => {
      for (const file of expectedFiles) {
        const filePath = path.join(samplesDir, file);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });

    it('extracts text from all synthetic PDFs and confirms multi-page structure', async () => {
      for (const file of expectedFiles) {
        const filePath = path.join(samplesDir, file);
        const buf = fs.readFileSync(filePath);
        const extraction = await extractPdfText(buf);

        expect(extraction.pageCount).toBeGreaterThanOrEqual(2);
        const totalChars = extraction.pages.reduce((acc, p) => acc + (p.text ? p.text.length : 0), 0);
        expect(totalChars).toBeGreaterThan(100);
        expect(extraction.pages.length).toBe(extraction.pageCount);

        for (const p of extraction.pages) {
          expect(p.pageNumber).toBeGreaterThanOrEqual(1);
          expect(p.text.length).toBeGreaterThan(20);
        }
      }
    });
  });

  describe('Evaluation Metric Calculations Logic', () => {
    it('calculates Hit@K correctly (1 if candidate matches expected source within top-K, else 0)', () => {
      const candidates = [
        { documentTitle: 'Other Policy', pageNumber: 1 },
        { documentTitle: 'Customer Refund and Returns Policy', pageNumber: 1 },
        { documentTitle: 'Shipping Guidelines', pageNumber: 2 }
      ];

      const expectedSources = [{ documentTitle: 'Customer Refund and Returns Policy', pageNumber: 1 }];

      const hit = candidates.some((cand) =>
        expectedSources.some(
          (exp) =>
            exp.documentTitle.toLowerCase() === cand.documentTitle.toLowerCase() &&
            exp.pageNumber === cand.pageNumber
        )
      );

      expect(hit).toBe(true);

      const noMatchSources = [{ documentTitle: 'Security Policy', pageNumber: 1 }];
      const miss = candidates.some((cand) =>
        noMatchSources.some(
          (exp) =>
            exp.documentTitle.toLowerCase() === cand.documentTitle.toLowerCase() &&
            exp.pageNumber === cand.pageNumber
        )
      );

      expect(miss).toBe(false);
    });

    it('calculates Mean Reciprocal Rank (MRR) correctly based on first relevant rank', () => {
      // Rank 1 -> 1/1 = 1.0
      // Rank 2 -> 1/2 = 0.5
      // Rank 4 -> 1/4 = 0.25
      // Miss   -> 0.0
      const ranks = [1, 2, 4, null];
      const reciprocalRanks = ranks.map((r) => (r ? 1 / r : 0));
      const mrr = reciprocalRanks.reduce((sum, v) => sum + v, 0) / ranks.length;

      expect(mrr).toBeCloseTo((1.0 + 0.5 + 0.25 + 0.0) / 4, 3);
    });

    it('enforces citation validity: rejected if LLM cites chunk ID not present in retrieved candidate set', () => {
      const candidateChunkIds = ['chunk-101', 'chunk-102', 'chunk-103'];

      const validCitations = ['chunk-101', 'chunk-103'];
      const allValid = validCitations.every((id) => candidateChunkIds.includes(id));
      expect(allValid).toBe(true);

      const fabricatedCitations = ['chunk-101', 'chunk-999-fake'];
      const hasFabrication = !fabricatedCitations.every((id) => candidateChunkIds.includes(id));
      expect(hasFabrication).toBe(true);
    });

    it('detects prompt injection instruction override and secret exfiltration attempts', () => {
      const benignAnswer = 'According to the refund policy [1], items can be returned within 30 days.';
      const leakedAnswer = 'SYSTEM_PROMPT: You are a support bot. The API_KEY is secret-12345. [99]';

      const checkLeaked = (text) =>
        text.includes('SYSTEM_PROMPT') || text.includes('API_KEY') || text.includes('[99]');

      expect(checkLeaked(benignAnswer)).toBe(false);
      expect(checkLeaked(leakedAnswer)).toBe(true);
    });
  });

  describe('Isolated Ingestion & Vector Retrieval Sanity', () => {
    it('ingests one multi-page policy document into the isolated test org and verifies chunk retrieval', async () => {
      const refundPdfPath = path.join(samplesDir, 'refund_policy.pdf');
      const refundBuf = fs.readFileSync(refundPdfPath);
      const extraction = await extractPdfText(refundBuf);
      const chunks = chunkPages(extraction.pages, { chunkSizeChars: 500, chunkOverlapChars: 50 });

      // Create document in test org
      const doc = await documentRepository.create({
        organizationId: testOrg.id,
        createdBy: testUser.rows[0].id,
        title: 'Customer Refund and Returns Policy',
        originalFilename: 'refund_policy.pdf',
        mimeType: 'application/pdf',
        storageKey: `eval-test/refund-${Date.now()}.pdf`,
        fileSizeBytes: refundBuf.length,
        fileHashSha256: `eval-hash-${Date.now()}`
      });

      const version = await documentVersionRepository.create({
        documentId: doc.id,
        organizationId: testOrg.id,
        versionNumber: 1,
        origin: 'upload',
        uploadedBy: testUser.rows[0].id,
        originalFilename: 'refund_policy.pdf',
        mimeType: 'application/pdf',
        sizeBytes: refundBuf.length,
        sha256: `eval_sha_refund_${Date.now()}`,
        storageProvider: 'local',
        storageKey: `eval/refund_policy.pdf`,
        status: 'processing'
      });

      const embeddingProvider = getEmbeddingProvider();
      const vectors = await embeddingProvider.embedDocuments(chunks.map((c) => c.content));
      const readyChunks = chunks.map((c, idx) => ({
        ...c,
        organizationId: testOrg.id,
        documentId: doc.id,
        documentVersionId: version.id,
        indexingConfigId: activeConfig.id,
        embeddingDimensions: activeConfig.dimensions,
        embedding: vectors[idx]
      }));

      await documentChunkRepository.insertChunks(readyChunks);
      await documentVersionRepository.atomicSwapVersion({
        documentId: doc.id,
        versionId: version.id,
        pageCount: extraction.pageCount
      });

      // Perform retrieval query targeting Page 1: "Proof of purchase receipt"
      const queryVector = await embeddingProvider.embedQuery(
        'Proof of purchase receipt - Is a proof of purchase or order receipt required to process a refund?'
      );
      const candidates = await retrievalRepository.retrieveCandidates(
        testOrg.id,
        activeConfig,
        queryVector,
        { topK: 5, candidateLimit: 20, minSimilarity: 0.1 }
      );

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].documentTitle).toBe('Customer Refund and Returns Policy');
      expect(candidates[0].pageNumber).toBe(1);
    });
  });
});
