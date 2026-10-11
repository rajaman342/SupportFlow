import {
  getConfig,
  organizationRepository,
  userRepository,
  ticketRepository,
  ticketMessageRepository,
  hashPassword,
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
