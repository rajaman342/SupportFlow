import fs from 'node:fs';
import path from 'node:path';
import {
  getConfig,
  organizationRepository,
  userRepository,
  ticketRepository,
  ticketMessageRepository,
  documentRepository,
  documentVersionRepository,
  documentChunkRepository,
  indexingConfigRepository,
  extractPdfText,
  chunkPages,
  getEmbeddingProvider,
  hashPassword,
  getDatabasePool,
  closeDatabasePool,
  logger
} from '../backend/shared/src/index.js';

async function seed() {
  const config = getConfig();

  if (config.NODE_ENV === 'production') {
    logger.error('Refusing to seed database in production environment');
    process.exit(1);
  }

  logger.info('Starting SupportFlow synthetic demo seed...');
  const demoPassword = process.env.SEED_DEMO_PASSWORD || 'SupportFlowDemo2026!';
  const passwordHash = await hashPassword(demoPassword);

  // 1. Organization
  let org = await organizationRepository.findBySlug(config.DEFAULT_ORGANIZATION_SLUG);
  if (!org) {
    org = await organizationRepository.create({
      name: 'SupportFlow Demo Corp',
      slug: config.DEFAULT_ORGANIZATION_SLUG
    });
    logger.info({ orgId: org.id }, 'Created default organization');
  }

  // 2. Users
  async function ensureUser(email, fullName, role) {
    let user = await userRepository.findByEmail(org.id, email);
    if (!user) {
      user = await userRepository.create({
        organizationId: org.id,
        email,
        passwordHash,
        fullName,
        role
      });
      logger.info({ email, role }, 'Created user');
    } else {
      const pool = getDatabasePool();
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
    }
    return user;
  }

  const admin = await ensureUser('admin@supportflow.demo', 'Alice Administrator', 'admin');
  const agent1 = await ensureUser('sarah.agent@supportflow.demo', 'Sarah Agent', 'agent');
  const _agent2 = await ensureUser('marcus.agent@supportflow.demo', 'Marcus Agent', 'agent');
  const customer1 = await ensureUser('customer.one@supportflow.demo', 'Charlie Customer', 'customer');
  const _customer2 = await ensureUser('customer.two@supportflow.demo', 'Dana Customer', 'customer');

  // 3. Tickets
  const existingTickets = await ticketRepository.listTickets({ organizationId: org.id, limit: 1 });
  if (existingTickets.total === 0) {
    // Ticket 1: Open
    const t1 = await ticketRepository.createWithFirstMessage({
      organizationId: org.id,
      customerId: customer1.id,
      subject: 'Question regarding refund turnaround window',
      body: 'Hi, I shipped my return item last Friday. How long does the refund take to reflect on my card?',
      priority: 'medium'
    });
    logger.info({ ticketId: t1.ticket.id }, 'Created open sample ticket');

    // Ticket 2: In Progress with agent message
    const t2 = await ticketRepository.createWithFirstMessage({
      organizationId: org.id,
      customerId: customer1.id,
      subject: 'Express shipping address update',
      body: 'Can I change my delivery address? The order was placed 2 hours ago.',
      priority: 'high'
    });
    await ticketRepository.updateAssignee(t2.ticket.id, org.id, agent1.id);
    await ticketRepository.updateStatus(t2.ticket.id, org.id, 'in_progress', null);
    await ticketMessageRepository.create({
      ticketId: t2.ticket.id,
      organizationId: org.id,
      authorId: agent1.id,
      authorRole: 'agent',
      body: 'Hello Charlie, I am checking with our dispatch warehouse right away.'
    });
    logger.info({ ticketId: t2.ticket.id }, 'Created in-progress sample ticket');

    // Ticket 3: Resolved
    const t3 = await ticketRepository.createWithFirstMessage({
      organizationId: org.id,
      customerId: customer1.id,
      subject: 'Warranty coverage question',
      body: 'Does the 2-year warranty cover accidental water damage?',
      priority: 'low'
    });
    await ticketRepository.updateAssignee(t3.ticket.id, org.id, admin.id);
    await ticketMessageRepository.create({
      ticketId: t3.ticket.id,
      organizationId: org.id,
      authorId: admin.id,
      authorRole: 'admin',
      body: 'Standard warranty covers manufacturer defects only. Accidental damage requires an add-on protection plan.'
    });
    await ticketRepository.updateStatus(t3.ticket.id, org.id, 'resolved', new Date().toISOString());
    logger.info({ ticketId: t3.ticket.id }, 'Created resolved sample ticket');
  }

  // 4. Sample Policy Knowledge Documents
  const existingDocs = await documentRepository.list(org.id, { limit: 1 });
  if (existingDocs.total === 0) {
    const samplesDir = path.resolve(process.cwd(), 'samples/knowledge-base');
    const activeConfig = await indexingConfigRepository.getActiveConfig();
    const embeddingProvider = getEmbeddingProvider();

    const samplePolicies = [
      { file: 'refund_policy.pdf', title: 'Customer Refund and Returns Policy' },
      { file: 'shipping_policy.pdf', title: 'Shipping and Delivery Guidelines' },
      { file: 'security_account_policy.pdf', title: 'Account Security and Authentication Policy' },
      { file: 'subscription_cancellation_policy.pdf', title: 'Subscription Plans and Cancellation Terms' }
    ];

    for (const item of samplePolicies) {
      const filePath = path.join(samplesDir, item.file);
      if (!fs.existsSync(filePath)) continue;

      const pdfBuffer = fs.readFileSync(filePath);
      const extracted = await extractPdfText(pdfBuffer);
      const chunks = chunkPages(extracted.pages, {
        chunkSizeChars: activeConfig.chunk_size_chars,
        chunkOverlapChars: activeConfig.chunk_overlap_chars
      });

      const doc = await documentRepository.create({
        organizationId: org.id,
        createdBy: admin.id,
        title: item.title,
        originalFilename: item.file,
        mimeType: 'application/pdf',
        storageKey: `demo/${item.file}`,
        fileSizeBytes: pdfBuffer.length,
        fileHashSha256: `seed_sha256_${item.file}`
      });

      const version = await documentVersionRepository.create({
        documentId: doc.id,
        organizationId: org.id,
        versionNumber: 1,
        origin: 'upload',
        uploadedBy: admin.id,
        originalFilename: item.file,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        sha256: `seed_sha256_${item.file}`,
        storageProvider: 'local',
        storageKey: `demo/${item.file}`,
        status: 'processing'
      });

      const vectors = await embeddingProvider.embedDocuments(chunks.map((c) => c.content));
      const readyChunks = chunks.map((c, idx) => ({
        ...c,
        organizationId: org.id,
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
        pageCount: extracted.pageCount
      });

      logger.info({ title: item.title, chunks: chunks.length }, 'Seeded sample policy document');
    }
  }

  logger.info('Database seeding completed successfully');
}

seed()
  .catch((err) => {
    logger.error({ err }, 'Seed script failed');
    process.exit(1);
  })
  .finally(async () => {
    await closeDatabasePool();
  });
