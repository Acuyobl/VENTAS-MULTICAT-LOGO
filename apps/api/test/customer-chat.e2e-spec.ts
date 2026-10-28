import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createCatalogFixture,
  createCustomerFixture,
  createStaffFixture,
  deleteCatalogFixture,
  deleteUserFixture,
  uniqueSlug,
  type CustomerFixture,
  type StaffFixture,
} from './helpers/fixtures';

describe('Chat del cliente en el portal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let organizationSlug: string;
  let catalogId: string;
  let customer: CustomerFixture;
  let staff: StaffFixture;
  let customerAgent!: Awaited<ReturnType<typeof loginCustomer>>;
  let staffAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let noAccountAgent!: Awaited<ReturnType<typeof loginCustomer>>;
  let noAccountCustomer!: CustomerFixture;
  let noAccountOrganizationId: string;

  async function loginCustomer(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ email: fixture.email, password: fixture.password, audience: 'customer' })
      .expect(200);
    return agent;
  }

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    return agent;
  }

  beforeAll(async () => {
    process.env.DEV_AUTH_HELPERS = 'true';
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    organizationSlug = uniqueSlug('qa-chat-customer');
    const organization = await prisma.organization.create({
      data: { name: 'QA Chat Cliente', slug: organizationSlug, plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug,
      roleKey: 'agente_chat',
      emailPrefix: 'qa-chat-staff',
    });
    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo Chat',
      slugPrefix: 'qa-chat-cat',
    });
    catalogId = catalog.catalogId;
    const version = await prisma.catalogVersion.create({
      data: {
        catalogId,
        versionNumber: 1,
        status: 'ACTIVE',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 0,
        createdByUserId: staff.userId,
        activatedAt: new Date(),
      },
    });
    await prisma.catalog.update({
      where: { id: catalogId },
      data: { activeVersionId: version.id },
    });

    customer = await createCustomerFixture(prisma, {
      organizationSlug,
      emailPrefix: 'qa-chat-customer',
    });
    customerAgent = await loginCustomer(customer);
    staffAgent = await loginStaff(staff);

    const otherSlug = uniqueSlug('qa-chat-noaccount');
    const other = await prisma.organization.create({
      data: { name: 'QA Chat Sin Cuenta', slug: otherSlug, plan: 'STARTER' },
    });
    noAccountOrganizationId = other.id;
    noAccountCustomer = await createCustomerFixture(prisma, {
      organizationSlug: otherSlug,
      emailPrefix: 'qa-chat-noaccount',
    });
    noAccountAgent = await loginCustomer(noAccountCustomer);
    await prisma.customerAccount.deleteMany({ where: { userId: noAccountCustomer.userId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.chatMessage.deleteMany({
        where: {
          conversation: { organizationId: { in: [organizationId, noAccountOrganizationId] } },
        },
      });
      await prisma.chatConversation.deleteMany({
        where: { organizationId: { in: [organizationId, noAccountOrganizationId] } },
      });
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: [organizationId, noAccountOrganizationId] } },
      });
    }
    await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    for (const fixture of [customer, staff, noAccountCustomer]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    if (prisma) {
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationId, noAccountOrganizationId] } },
      });
    }
    if (app) await app.close();
  });

  it('GET /me/chat crea (o reutiliza) la conversación WEB del cliente', async () => {
    const first = await customerAgent.get(`${api}/me/chat`).expect(200);
    expect(first.body).toMatchObject({ channel: 'WEB', items: [] });
    expect(first.body.conversationId).toBeTruthy();

    const second = await customerAgent.get(`${api}/me/chat`).expect(200);
    expect(second.body.conversationId).toBe(first.body.conversationId);

    const conversation = await prisma.chatConversation.findUniqueOrThrow({
      where: { id: first.body.conversationId as string },
    });
    expect(conversation).toMatchObject({
      organizationId,
      catalogId,
      customerId: customer.customerId,
      subject: 'Consulta desde el portal',
      channel: 'WEB',
      status: 'OPEN',
    });
  });

  it('POST /me/chat/messages guarda el mensaje CUSTOMER y el staff lo ve no leído', async () => {
    const conversation = await prisma.chatConversation.findFirstOrThrow({
      where: { organizationId, customerId: customer.customerId },
    });
    const sent = await customerAgent
      .post(`${api}/me/chat/messages`)
      .send({ body: 'Hola, necesito ayuda con un pedido.' })
      .expect(201);
    expect(sent.body).toMatchObject({
      senderType: 'CUSTOMER',
      senderName: 'QA Cliente',
      body: 'Hola, necesito ayuda con un pedido.',
    });

    const chat = await customerAgent.get(`${api}/me/chat`).expect(200);
    expect(chat.body.items).toHaveLength(1);
    expect(chat.body.items[0]).toMatchObject({ senderType: 'CUSTOMER', senderName: 'QA Cliente' });

    const inbox = await staffAgent.get(`${api}/chat/conversations`).expect(200);
    const item = (
      inbox.body.items as Array<{ id: string; unreadCount: number; channel: string }>
    ).find((entry) => entry.id === conversation.id);
    expect(item).toMatchObject({ channel: 'WEB', unreadCount: 1 });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'chat.message_sent', organizationId },
    });
    expect(audit?.after).toMatchObject({ channel: 'WEB', conversationId: conversation.id });
  });

  it('staff no puede usar el chat del portal (AUTH_WRONG_AUDIENCE)', async () => {
    const response = await staffAgent.get(`${api}/me/chat`).expect(403);
    expect(response.body.code).toBe('AUTH_WRONG_AUDIENCE');
  });

  it('sin CustomerAccount responde 409 customer_profile_missing', async () => {
    const response = await noAccountAgent.get(`${api}/me/chat`);
    process.stderr.write(`NO_ACCOUNT ${response.status} ${JSON.stringify(response.body)}\n`);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details).toMatchObject({ reason: 'customer_profile_missing' });
  });
});
