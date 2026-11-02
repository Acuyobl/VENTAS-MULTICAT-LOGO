import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/modules/storage/storage.service';
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

const CSV = 'SKU,Nombre,Precio\nWA-1,Camisa WA,5000\nWA-2,Pantalón WA,7000\n';
const ATTACHMENT_KEY_PREFIX = 'whatsapp';

describe('WhatsApp: adjunto e importación desde el chat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let conversationId: string;
  let attachmentMessageId: string;
  let textMessageId: string;
  let agentChat: StaffFixture;
  let admin: StaffFixture;
  let customer: CustomerFixture;
  let otherAgent: StaffFixture;
  let otherAdmin: StaffFixture;
  let agentAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let adminAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let customerAgent!: Awaited<ReturnType<typeof loginCustomer>>;
  let otherAgentAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let otherAdminAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let otherOrganizationId: string;
  let attachmentKey: string;

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    return agent;
  }

  async function loginCustomer(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ email: fixture.email, password: fixture.password, audience: 'customer' })
      .expect(200);
    return agent;
  }

  beforeAll(async () => {
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA WhatsApp Media', slug: uniqueSlug('qa-wa'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo WhatsApp',
      slugPrefix: 'qa-wa-cat',
    });
    catalogId = catalog.catalogId;
    agentChat = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'agente_chat',
      emailPrefix: 'qa-wa-agent',
    });
    admin = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-wa-admin',
    });
    customer = await createCustomerFixture(prisma, {
      organizationSlug: organization.slug,
      emailPrefix: 'qa-wa-customer',
    });
    const version = await prisma.catalogVersion.create({
      data: {
        catalogId,
        versionNumber: 1,
        status: 'ACTIVE',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 0,
        createdByUserId: admin.userId,
        activatedAt: new Date(),
      },
    });
    await prisma.catalog.update({
      where: { id: catalogId },
      data: { activeVersionId: version.id },
    });

    const other = await prisma.organization.create({
      data: { name: 'QA WhatsApp Otra', slug: uniqueSlug('qa-wa-other'), plan: 'STARTER' },
    });
    otherOrganizationId = other.id;
    otherAgent = await createStaffFixture(prisma, {
      organizationSlug: other.slug,
      roleKey: 'agente_chat',
      emailPrefix: 'qa-wa-other',
    });
    otherAdmin = await createStaffFixture(prisma, {
      organizationSlug: other.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-wa-other-admin',
    });

    const conversation = await prisma.chatConversation.create({
      data: {
        organizationId,
        catalogId,
        customerId: customer.customerId,
        subject: 'Pedido por WhatsApp',
        status: 'OPEN',
        channel: 'WHATSAPP',
        externalId: '+50688881111',
      },
    });
    conversationId = conversation.id;
    attachmentKey = `${ATTACHMENT_KEY_PREFIX}/${organizationId}/wamid-test.csv`;
    await storage.putDocument(attachmentKey, Buffer.from(CSV, 'utf8'), 'text/csv');
    const attachmentMessage = await prisma.chatMessage.create({
      data: {
        conversationId,
        senderType: 'CUSTOMER',
        body: '📎 pedido.csv',
        attachmentKey,
      },
    });
    attachmentMessageId = attachmentMessage.id;
    const textMessage = await prisma.chatMessage.create({
      data: { conversationId, senderType: 'CUSTOMER', body: 'Hola' },
    });
    textMessageId = textMessage.id;

    agentAgent = await loginStaff(agentChat);
    adminAgent = await loginStaff(admin);
    customerAgent = await loginCustomer(customer);
    otherAgentAgent = await loginStaff(otherAgent);
    otherAdminAgent = await loginStaff(otherAdmin);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.importRowIssue.deleteMany({ where: { importJob: { catalogId } } });
      await prisma.importJob.deleteMany({ where: { catalogId } });
      await prisma.importMappingTemplate.deleteMany({ where: { catalogId } });
      await prisma.chatMessage.deleteMany({
        where: { conversation: { organizationId: { in: [organizationId, otherOrganizationId] } } },
      });
      await prisma.chatConversation.deleteMany({
        where: { organizationId: { in: [organizationId, otherOrganizationId] } },
      });
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: [organizationId, otherOrganizationId] } },
      });
    }
    await storage.removeDocument(attachmentKey).catch(() => undefined);
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    for (const fixture of [agentChat, admin, otherAgent, otherAdmin]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    if (customer) await deleteUserFixture(prisma, customer.userId);
    if (prisma) {
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationId, otherOrganizationId] } },
      });
    }
    if (app) await app.close();
  });

  it('GET attachment devuelve URL firmada, nombre y mime', async () => {
    const response = await agentAgent
      .get(`${api}/chat/messages/${attachmentMessageId}/attachment`)
      .expect(200);
    expect(response.body).toMatchObject({
      fileName: 'wamid-test.csv',
      mimeType: 'text/csv',
    });
    expect(response.body.url).toBeTruthy();
    const file = await fetch(response.body.url as string);
    expect(file.status).toBe(200);
    expect(await file.text()).toContain('WA-1');
  });

  it('POST import crea la versión con productos sin activarla', async () => {
    const imported = await adminAgent
      .post(`${api}/chat/messages/${attachmentMessageId}/import`)
      .send({ mode: 'REPLACE' })
      .expect(201);
    expect(imported.body).toMatchObject({
      catalogId,
      importedRows: 2,
      quarantineRows: 0,
      warnings: 0,
    });
    expect(imported.body.catalogVersionId).toBeTruthy();

    const products = await adminAgent
      .get(
        `${api}/products?catalogId=${catalogId}&versionId=${imported.body.catalogVersionId}&limit=10`,
      )
      .expect(200);
    expect((products.body.items as Array<{ sku: string }>).map((item) => item.sku).sort()).toEqual([
      'WA-1',
      'WA-2',
    ]);
    const version = await prisma.catalogVersion.findUniqueOrThrow({
      where: { id: imported.body.catalogVersionId },
    });
    expect(version.status).not.toBe('ACTIVE');
  });

  it('mensaje sin adjunto: attachment 404 e import 409 no_attachment', async () => {
    await agentAgent.get(`${api}/chat/messages/${textMessageId}/attachment`).expect(404);
    const conflict = await adminAgent
      .post(`${api}/chat/messages/${textMessageId}/import`)
      .send({})
      .expect(409);
    expect(conflict.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: 'no_attachment' },
    });
  });

  it('403 por audiencia/permiso y 404 cross-org', async () => {
    const audience = await customerAgent
      .get(`${api}/chat/messages/${attachmentMessageId}/attachment`)
      .expect(403);
    expect(audience.body.code).toBe('AUTH_WRONG_AUDIENCE');

    const forbidden = await agentAgent
      .post(`${api}/chat/messages/${attachmentMessageId}/import`)
      .send({})
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    await otherAgentAgent.get(`${api}/chat/messages/${attachmentMessageId}/attachment`).expect(404);
    await otherAdminAgent
      .post(`${api}/chat/messages/${attachmentMessageId}/import`)
      .send({})
      .expect(404);
  });
});
