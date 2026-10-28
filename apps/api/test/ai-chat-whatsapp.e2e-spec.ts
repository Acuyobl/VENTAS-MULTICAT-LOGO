import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { computeWhatsappSignature } from '../src/modules/whatsapp/whatsapp-signature';
import {
  createStaffFixture,
  deleteUserFixture,
  uniqueSlug,
  type StaffFixture,
} from './helpers/fixtures';

const WHATSAPP_SECRET = 'wa-secret-e2e';
const VERIFY_TOKEN = 'verify-token-e2e';
const INBOUND_PHONE = '50688887777';

describe('IA de contenido, WhatsApp entrante y chat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let demoOrganizationId: string;
  let demoCatalogId: string;
  let demoProductIds: string[];
  let socialStaff: StaffFixture;
  let vendedorStaff: StaffFixture;
  let aliadaStaff: StaffFixture;
  let socialAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let inboundConversationId: string | null = null;
  const createdPostIds: string[] = [];
  const originalEnv: Record<string, string | undefined> = {};

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    return agent;
  }

  function whatsappPayload(body: string, from = INBOUND_PHONE) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                contacts: [{ profile: { name: 'Cliente WhatsApp QA' }, wa_id: from }],
                messages: [
                  {
                    from,
                    id: `wamid.e2e.${Date.now()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  beforeAll(async () => {
    originalEnv.AI_PROVIDER = process.env.AI_PROVIDER;
    originalEnv.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;
    originalEnv.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
    process.env.AI_PROVIDER = 'mock';
    process.env.WHATSAPP_APP_SECRET = WHATSAPP_SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;

    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const demoOrganization = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'demo' },
    });
    demoOrganizationId = demoOrganization.id;
    const demoCatalog = await prisma.catalog.findUniqueOrThrow({
      where: { organizationId_slug: { organizationId: demoOrganizationId, slug: 'catalogo-demo' } },
    });
    demoCatalogId = demoCatalog.id;
    const products = await prisma.product.findMany({
      where: { catalogVersionId: demoCatalog.activeVersionId ?? undefined, deletedAt: null },
      orderBy: { sku: 'asc' },
      take: 2,
    });
    demoProductIds = products.map((product) => product.id);

    socialStaff = await createStaffFixture(prisma, {
      organizationSlug: 'demo',
      roleKey: 'social_manager',
      emailPrefix: `qa-ai-social-${uniqueSlug('u')}`,
    });
    vendedorStaff = await createStaffFixture(prisma, {
      organizationSlug: 'demo',
      roleKey: 'vendedor',
      emailPrefix: `qa-ai-vendedor-${uniqueSlug('u')}`,
    });
    aliadaStaff = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'vendedor',
      emailPrefix: `qa-ai-aliada-${uniqueSlug('u')}`,
    });

    socialAgent = await loginStaff(socialStaff);
    vendedorAgent = await loginStaff(vendedorStaff);
    aliadaAgent = await loginStaff(aliadaStaff);
  });

  afterAll(async () => {
    if (prisma) {
      if (createdPostIds.length > 0) {
        await prisma.socialPost.deleteMany({ where: { id: { in: createdPostIds } } });
      }
      if (inboundConversationId) {
        await prisma.chatMessage.deleteMany({ where: { conversationId: inboundConversationId } });
        await prisma.chatConversation.deleteMany({ where: { id: inboundConversationId } });
      }
      const inboundCustomers = await prisma.customer.findMany({
        where: { organizationId: demoOrganizationId, phone: { contains: INBOUND_PHONE } },
        select: { id: true },
      });
      if (inboundCustomers.length > 0) {
        const conversations = await prisma.chatConversation.findMany({
          where: { customerId: { in: inboundCustomers.map((customer) => customer.id) } },
          select: { id: true },
        });
        for (const conversation of conversations) {
          await prisma.chatMessage.deleteMany({ where: { conversationId: conversation.id } });
          await prisma.chatConversation.deleteMany({ where: { id: conversation.id } });
        }
        await prisma.customer.deleteMany({
          where: { id: { in: inboundCustomers.map((customer) => customer.id) } },
        });
      }
      if (createdPostIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { action: 'ai.social_post_generated', entityId: { in: createdPostIds } },
        });
        await prisma.auditLog.deleteMany({
          where: { action: 'social.post_decided', entityId: { in: createdPostIds } },
        });
      }
    }
    for (const fixture of [socialStaff, vendedorStaff, aliadaStaff]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (app) await app.close();
  });

  it('genera un post con el provider mock (201 DRAFT con tokens > 0) y lo lista', async () => {
    const response = await socialAgent
      .post(`${api}/ai/social-posts`)
      .send({
        catalogId: demoCatalogId,
        platform: 'INSTAGRAM',
        tone: 'CERCANO',
        goal: 'VENTAS',
        productIds: demoProductIds,
        extraInstructions: 'Mencioná entrega en San José.',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      catalogId: demoCatalogId,
      platform: 'INSTAGRAM',
      tone: 'CERCANO',
      goal: 'VENTAS',
      status: 'DRAFT',
      aiProvider: 'mock',
      aiModel: 'mock-social-v1',
    });
    expect(response.body.title.length).toBeGreaterThan(0);
    expect(response.body.body.length).toBeGreaterThan(0);
    expect(response.body.hashtags.length).toBeGreaterThan(0);
    expect(response.body.cta.length).toBeGreaterThan(0);
    expect(response.body.tokensIn).toBeGreaterThan(0);
    expect(response.body.tokensOut).toBeGreaterThan(0);
    createdPostIds.push(response.body.id);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ai.social_post_generated', entityId: response.body.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.after).toMatchObject({ provider: 'mock', tokensIn: 320, tokensOut: 180 });

    const list = await socialAgent.get(`${api}/ai/social-posts?limit=5`).expect(200);
    expect(list.body.items.some((item: { id: string }) => item.id === response.body.id)).toBe(true);
  });

  it('decide APPROVED y audita; vendedor sin social:approve recibe 403', async () => {
    const created = await socialAgent
      .post(`${api}/ai/social-posts`)
      .send({
        catalogId: demoCatalogId,
        platform: 'FACEBOOK',
        tone: 'PROFESIONAL',
        goal: 'LANZAMIENTO',
        productIds: [demoProductIds[0]],
      })
      .expect(201);
    createdPostIds.push(created.body.id);

    const forbidden = await vendedorAgent
      .post(`${api}/ai/social-posts/${created.body.id}/decision`)
      .send({ status: 'APPROVED' })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const approved = await socialAgent
      .post(`${api}/ai/social-posts/${created.body.id}/decision`)
      .send({ status: 'APPROVED' })
      .expect(200);
    expect(approved.body.status).toBe('APPROVED');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'social.post_decided', entityId: created.body.id },
    });
    expect(audit?.after).toMatchObject({ status: 'APPROVED' });
  });

  it('con AI_PROVIDER=deepseek y sin API key responde 409 INTEGRATION_NOT_CONFIGURED', async () => {
    process.env.AI_PROVIDER = 'deepseek';
    delete process.env.DEEPSEEK_API_KEY;
    vi.resetModules();
    const freshHarness = await import('./helpers/test-harness');
    const deepseekApp = await freshHarness.createTestApp();
    try {
      const agent = request.agent(deepseekApp.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .send({ ...socialStaff, audience: 'staff' })
        .expect(200);
      const response = await agent.post('/api/v1/ai/social-posts').send({
        catalogId: demoCatalogId,
        platform: 'INSTAGRAM',
        tone: 'CERCANO',
        goal: 'VENTAS',
        productIds: demoProductIds,
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('INTEGRATION_NOT_CONFIGURED');
      expect(response.body.details).toMatchObject({ provider: 'deepseek' });
    } finally {
      await deepseekApp.close();
      process.env.AI_PROVIDER = 'mock';
    }
  });

  it('webhook WhatsApp: challenge correcto, token inválido 403 y firma inválida 401', async () => {
    const challenge = await request(server)
      .get(`${api}/webhooks/whatsapp`)
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'challenge-123',
      })
      .expect(200);
    expect(challenge.text).toBe('challenge-123');

    await request(server)
      .get(`${api}/webhooks/whatsapp`)
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-malo',
        'hub.challenge': 'challenge-123',
      })
      .expect(403);

    const payload = JSON.stringify(whatsappPayload('primero inválido'));
    await request(server)
      .post(`${api}/webhooks/whatsapp`)
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(payload)
      .expect(401);
  });

  it('inbound crea conversación/mensaje y el chat staff la atiende (leer + responder)', async () => {
    const payload = JSON.stringify(whatsappPayload('Hola, quiero información de la miel'));
    const signature = computeWhatsappSignature(WHATSAPP_SECRET, payload);

    const received = await request(server)
      .post(`${api}/webhooks/whatsapp`)
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(payload)
      .expect(200);
    expect(received.body).toEqual({ received: true, processed: 1 });

    const customer = await prisma.customer.findFirstOrThrow({
      where: { organizationId: demoOrganizationId, phone: `+${INBOUND_PHONE}` },
    });
    expect(customer.type).toBe('PERSON');
    expect(customer.name).toBe('Cliente WhatsApp QA');

    const conversation = await prisma.chatConversation.findFirstOrThrow({
      where: { organizationId: demoOrganizationId, customerId: customer.id, status: 'OPEN' },
    });
    inboundConversationId = conversation.id;
    const message = await prisma.chatMessage.findFirstOrThrow({
      where: { conversationId: conversation.id },
    });
    expect(message.senderType).toBe('CUSTOMER');
    expect(message.body).toContain('miel');

    const conversations = await vendedorAgent.get(`${api}/chat/conversations`).expect(200);
    const summary = conversations.body.items.find(
      (item: { id: string }) => item.id === conversation.id,
    );
    expect(summary).toBeTruthy();
    expect(summary.customerName).toBe('Cliente WhatsApp QA');
    expect(summary.unreadCount).toBe(1);
    expect(summary.lastMessagePreview).toContain('miel');

    const messages = await vendedorAgent
      .get(`${api}/chat/conversations/${conversation.id}/messages`)
      .expect(200);
    expect(messages.body.conversationId).toBe(conversation.id);
    expect(messages.body.items).toHaveLength(1);
    expect(messages.body.items[0].senderType).toBe('CUSTOMER');

    // Abrir la conversación marcó el mensaje del cliente como leído.
    const afterRead = await vendedorAgent.get(`${api}/chat/conversations`).expect(200);
    const readSummary = afterRead.body.items.find(
      (item: { id: string }) => item.id === conversation.id,
    );
    expect(readSummary.unreadCount).toBe(0);

    // La conversación es de canal WHATSAPP: sin credenciales no se guarda el
    // mensaje y responde 409 (el canal WEB se prueba en finance-gateways-chat).
    const reply = await vendedorAgent
      .post(`${api}/chat/conversations/${conversation.id}/messages`)
      .send({ body: '¡Hola! Sí tenemos miel, ¿te comparto el catálogo?' })
      .expect(409);
    expect(reply.body.code).toBe('INTEGRATION_NOT_CONFIGURED');

    const afterReply = await vendedorAgent
      .get(`${api}/chat/conversations/${conversation.id}/messages`)
      .expect(200);
    expect(afterReply.body.items).toHaveLength(1);
  });

  it('chat de otra organización responde 404', async () => {
    const demoConversation = await prisma.chatConversation.findFirstOrThrow({
      where: { organizationId: demoOrganizationId, subject: 'Consulta de demo' },
    });

    const messages = await aliadaAgent
      .get(`${api}/chat/conversations/${demoConversation.id}/messages`)
      .expect(404);
    expect(messages.body.code).toBe('NOT_FOUND');

    const send = await aliadaAgent
      .post(`${api}/chat/conversations/${demoConversation.id}/messages`)
      .send({ body: 'intruso' })
      .expect(404);
    expect(send.body.code).toBe('NOT_FOUND');

    const forbidden = await request(server).get(`${api}/chat/conversations`).expect(401);
    expect(forbidden.body.code).toBe('UNAUTHORIZED');
  });

  it('conversación demo del seed sigue disponible para la UI', async () => {
    const demoConversation = await prisma.chatConversation.findFirstOrThrow({
      where: { organizationId: demoOrganizationId, subject: 'Consulta de demo' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    expect(demoConversation.messages.length).toBeGreaterThanOrEqual(2);
  });
});
