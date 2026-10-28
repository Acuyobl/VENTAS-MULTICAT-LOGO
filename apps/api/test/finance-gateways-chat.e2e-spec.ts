import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createCatalogFixture,
  createStaffFixture,
  deleteCatalogFixture,
  deleteUserFixture,
  uniqueSlug,
  type StaffFixture,
} from './helpers/fixtures';

const INBOUND_PHONE = '50677778888';

describe('Gastos, utilidad, CSV, pasarelas y chat WhatsApp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let catalogSlug: string;
  let versionId: string;
  let product: Product;
  let finance: StaffFixture;
  let admin: StaffFixture;
  let vendedor: StaffFixture;
  let aliadaFinance: StaffFixture;
  let aliadaVendedor: StaffFixture;
  let financeAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let adminAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let aliadaFinanceAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let aliadaVendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let qaWhatsappConversationId: string;
  let qaWebConversationId: string;
  const createdExpenseIds: string[] = [];
  const originalDevHelpers = process.env.DEV_AUTH_HELPERS;

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    const login = await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    if (login.body.status === 'authenticated') return agent;

    const mfaToken = login.body.mfaToken as string;
    if (login.body.status === 'mfa_enrollment_required') {
      await agent.post(`${api}/auth/mfa/enroll`).send({ mfaToken }).expect(200);
    }
    const totp = await agent.post(`${api}/auth/dev/totp`).send({ mfaToken }).expect(200);
    await agent.post(`${api}/auth/mfa/verify`).send({ mfaToken, code: totp.body.code }).expect(200);
    return agent;
  }

  async function createExpense(body: Record<string, unknown>) {
    const response = await financeAgent.post(`${api}/expenses`).send(body).expect(201);
    createdExpenseIds.push(response.body.id);
    return response.body;
  }

  beforeAll(async () => {
    process.env.DEV_AUTH_HELPERS = 'true';
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Cierre F2', slug: uniqueSlug('qa-f2close'), plan: 'STARTER' },
    });
    organizationId = organization.id;

    finance = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'finanzas',
      emailPrefix: 'qa-f2close-finance',
    });
    admin = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'org_admin',
      emailPrefix: 'qa-f2close-admin',
    });
    vendedor = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-f2close-vendedor',
    });
    aliadaFinance = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'finanzas',
      emailPrefix: 'qa-f2close-aliada-fin',
    });
    aliadaVendedor = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'vendedor',
      emailPrefix: 'qa-f2close-aliada-vend',
    });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo QA Cierre',
      slugPrefix: 'qa-f2close-cat',
    });
    catalogId = catalog.catalogId;
    catalogSlug = catalog.slug;
    const version = await prisma.catalogVersion.create({
      data: {
        catalogId,
        versionNumber: 1,
        status: 'ACTIVE',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 1,
        createdByUserId: finance.userId,
        activatedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    versionId = version.id;
    await prisma.catalog.update({ where: { id: catalogId }, data: { activeVersionId: versionId } });
    product = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: versionId,
        sku: 'F2C-113',
        name: 'Producto cierre F2 ₡11.300',
        priceMinor: 11_300n,
        currency: 'CRC',
        stock: 20,
      },
    });

    financeAgent = await loginStaff(finance);
    adminAgent = await loginStaff(admin);
    vendedorAgent = await loginStaff(vendedor);
    aliadaFinanceAgent = await loginStaff(aliadaFinance);
    aliadaVendedorAgent = await loginStaff(aliadaVendedor);

    const customer = await prisma.customer.create({
      data: {
        organizationId,
        type: 'PERSON',
        name: 'Cliente Chat QA',
        email: `chat-${Date.now()}@qa.local`,
        phone: '+506 7000 1111',
      },
    });
    const webConversation = await prisma.chatConversation.create({
      data: {
        organizationId,
        catalogId,
        customerId: customer.id,
        subject: 'Chat WEB QA',
        status: 'OPEN',
        channel: 'WEB',
      },
    });
    qaWebConversationId = webConversation.id;
    await prisma.chatMessage.create({
      data: { conversationId: webConversation.id, senderType: 'CUSTOMER', body: 'Hola por web' },
    });
    const waConversation = await prisma.chatConversation.create({
      data: {
        organizationId,
        catalogId,
        customerId: customer.id,
        subject: 'Chat WA QA',
        status: 'OPEN',
        channel: 'WHATSAPP',
        externalId: '+506 7000 2222',
      },
    });
    qaWhatsappConversationId = waConversation.id;
    await prisma.chatMessage.create({
      data: {
        conversationId: waConversation.id,
        senderType: 'CUSTOMER',
        body: 'Hola por WhatsApp',
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const conversations = await prisma.chatConversation.findMany({
        where: { organizationId },
        select: { id: true },
      });
      for (const conversation of conversations) {
        await prisma.chatMessage.deleteMany({ where: { conversationId: conversation.id } });
      }
      await prisma.chatConversation.deleteMany({ where: { organizationId } });
      await prisma.expense.deleteMany({ where: { organizationId } });
      await prisma.paymentGatewayConfig.deleteMany({ where: { organizationId } });
      await prisma.refund.deleteMany({ where: { organizationId } });
      await prisma.payment.deleteMany({ where: { organizationId } });
      await prisma.paymentLink.deleteMany({ where: { organizationId } });
      await prisma.order.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });

      const demo = await prisma.organization.findUnique({ where: { slug: 'demo' } });
      if (demo) {
        const inboundCustomers = await prisma.customer.findMany({
          where: { organizationId: demo.id, phone: { contains: INBOUND_PHONE } },
          select: { id: true },
        });
        const inboundConversations = await prisma.chatConversation.findMany({
          where: { customerId: { in: inboundCustomers.map((customer) => customer.id) } },
          select: { id: true },
        });
        for (const conversation of inboundConversations) {
          await prisma.chatMessage.deleteMany({ where: { conversationId: conversation.id } });
        }
        await prisma.chatConversation.deleteMany({
          where: { id: { in: inboundConversations.map((conversation) => conversation.id) } },
        });
        await prisma.customer.deleteMany({
          where: { id: { in: inboundCustomers.map((customer) => customer.id) } },
        });
      }
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    for (const fixture of [finance, admin, vendedor, aliadaFinance, aliadaVendedor]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    if (prisma) {
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (originalDevHelpers === undefined) delete process.env.DEV_AUTH_HELPERS;
    else process.env.DEV_AUTH_HELPERS = originalDevHelpers;
    if (app) await app.close();
  });

  it('crea, lista, filtra y borra gastos con totales por categoría (soft delete)', async () => {
    const marketing = await createExpense({
      catalogId,
      category: 'MARKETING',
      description: 'Campaña de redes',
      amountMinor: 20_000,
    });
    expect(marketing).toMatchObject({
      catalogId,
      category: 'MARKETING',
      amountMinor: '20000',
      currency: 'CRC',
      status: 'CONFIRMED',
    });
    await createExpense({
      catalogId,
      category: 'TRANSPORTE',
      description: 'Entregas',
      amountMinor: 8_500,
    });
    await createExpense({
      catalogId,
      category: 'INSUMOS',
      description: 'Empaques',
      amountMinor: 12_000,
    });
    const toDelete = await createExpense({
      catalogId,
      category: 'SERVICIOS',
      description: 'Servicio a borrar',
      amountMinor: 5_000,
    });

    const list = await financeAgent.get(`${api}/expenses`).expect(200);
    expect(list.body.totals).toMatchObject({
      count: 4,
      amountMinor: '45500',
      taxMinor: '0',
    });
    const byCategory = list.body.totals.byCategory as Array<{
      category: string;
      count: number;
      amountMinor: string;
    }>;
    expect(byCategory.find((row) => row.category === 'MARKETING')).toEqual({
      category: 'MARKETING',
      count: 1,
      amountMinor: '20000',
    });
    expect(byCategory.find((row) => row.category === 'SERVICIOS')).toEqual({
      category: 'SERVICIOS',
      count: 1,
      amountMinor: '5000',
    });

    const filtered = await financeAgent.get(`${api}/expenses?category=MARKETING`).expect(200);
    expect(filtered.body.totals.count).toBe(1);
    expect(filtered.body.totals.amountMinor).toBe('20000');

    const deleted = await financeAgent.delete(`${api}/expenses/${toDelete.id}`).expect(200);
    expect(deleted.body).toEqual({ id: toDelete.id, deleted: true });
    const row = await prisma.expense.findUniqueOrThrow({ where: { id: toDelete.id } });
    expect(row.deletedAt).not.toBeNull();

    const afterDelete = await financeAgent.get(`${api}/expenses`).expect(200);
    expect(afterDelete.body.totals).toMatchObject({ count: 3, amountMinor: '40500' });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'expense.deleted', entityId: toDelete.id },
    });
    expect(audit).not.toBeNull();

    const foreignDelete = await aliadaFinanceAgent
      .delete(`${api}/expenses/${marketing.id}`)
      .expect(404);
    expect(foreignDelete.body.code).toBe('NOT_FOUND');

    const forbidden = await vendedorAgent
      .post(`${api}/expenses`)
      .send({
        catalogId,
        category: 'OTROS',
        description: 'Sin permiso',
        amountMinor: 100,
      })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const unknownCatalog = await financeAgent
      .post(`${api}/expenses`)
      .send({
        catalogId: '01920000-0000-7000-8000-000000009999',
        category: 'OTROS',
        description: 'Catálogo ajeno',
        amountMinor: 100,
      })
      .expect(404);
    expect(unknownCatalog.body.code).toBe('NOT_FOUND');
  });

  it('reporte de utilidad: profitMinor = neto − reembolsos − gastos y margen coherente', async () => {
    const checkout = await request(server)
      .post(`${api}/storefront/checkout`)
      .send({
        catalogSlug,
        items: [{ productId: product.id, quantity: 1 }],
        customer: { fullName: 'Cliente Reporte', email: `rep-${Date.now()}@qa.local` },
      })
      .expect(201);
    await financeAgent
      .post(`${api}/orders/${checkout.body.orderId}/payments/manual`)
      .send({ amountMinor: 11_300, method: 'CASH', reference: 'REC-PROFIT' })
      .expect(201);

    const profit = await financeAgent.get(`${api}/reports/profit`).expect(200);
    expect(profit.body.range.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(BigInt(profit.body.income.netMinor)).toBeGreaterThanOrEqual(11_300n);
    expect(profit.body.expenses).toMatchObject({ totalMinor: '40500', count: 3 });
    const expectedProfit =
      BigInt(profit.body.income.netMinor) -
      BigInt(profit.body.income.refundedMinor) -
      BigInt(profit.body.expenses.totalMinor);
    expect(BigInt(profit.body.profitMinor)).toBe(expectedProfit);
    if (BigInt(profit.body.income.netMinor) > 0n) {
      const expectedMargin = Math.round(
        Number((expectedProfit * 10_000n * 100n) / BigInt(profit.body.income.netMinor)) / 100,
      );
      expect(Math.abs(profit.body.marginBp - expectedMargin)).toBeLessThanOrEqual(1);
    }

    const forbidden = await vendedorAgent.get(`${api}/reports/profit`).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('exporta el CSV de finanzas con Content-Type text/csv y audita', async () => {
    const response = await financeAgent.get(`${api}/reports/finance/export.csv`).expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    const lines = (response.text as string).split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('pedido,fecha,metodo,proveedor,monto_minor,estado,referencia');
    expect(lines.some((line) => line.includes('REC-PROFIT'))).toBe(true);
    expect(lines.at(-3)).toContain('TOTAL');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'report.exported', organizationId },
    });
    expect(audit).not.toBeNull();
  });

  it('configura pasarelas: secreto requerido, cifrado/máscara, PATCH y auditoría sin secretos', async () => {
    const missingSecret = await adminAgent
      .put(`${api}/organizations/payment-gateways/STRIPE`)
      .send({ mode: 'TEST', enabled: true })
      .expect(422);
    expect(missingSecret.body.details).toMatchObject({ reason: 'gateway_secret_required' });

    const created = await adminAgent
      .put(`${api}/organizations/payment-gateways/STRIPE`)
      .send({
        mode: 'TEST',
        enabled: true,
        publicKey: 'pk_test_123',
        secretKey: 'sk_test_abcd1234',
        webhookSecret: 'whsec_abcd',
      })
      .expect(200);
    expect(created.body).toMatchObject({
      provider: 'STRIPE',
      mode: 'TEST',
      enabled: true,
      publicKey: 'pk_test_123',
      maskedKey: '****1234',
      hasSecret: true,
    });
    expect(JSON.stringify(created.body)).not.toContain('sk_test_abcd1234');

    const list = await adminAgent.get(`${api}/organizations/payment-gateways`).expect(200);
    const stripe = list.body.items.find((item: { provider: string }) => item.provider === 'STRIPE');
    expect(stripe).toMatchObject({ maskedKey: '****1234', hasSecret: true });
    expect(JSON.stringify(list.body)).not.toContain('sk_test_abcd1234');
    expect(JSON.stringify(list.body)).not.toContain('whsec_abcd');

    const disabled = await adminAgent
      .patch(`${api}/organizations/payment-gateways/STRIPE`)
      .send({ enabled: false })
      .expect(200);
    expect(disabled.body.enabled).toBe(false);
    const enabled = await adminAgent
      .patch(`${api}/organizations/payment-gateways/STRIPE`)
      .send({ enabled: true })
      .expect(200);
    expect(enabled.body.enabled).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.gateway_updated', organizationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('sk_test_abcd1234');
    expect(serialized).not.toContain('whsec_abcd');

    const forbidden = await financeAgent.get(`${api}/organizations/payment-gateways`).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('chat por canal: resumen con channel, WEB responde y WHATSAPP sin credenciales 409 sin guardar', async () => {
    const conversations = await vendedorAgent.get(`${api}/chat/conversations`).expect(200);
    const web = conversations.body.items.find(
      (item: { id: string }) => item.id === qaWebConversationId,
    );
    const wa = conversations.body.items.find(
      (item: { id: string }) => item.id === qaWhatsappConversationId,
    );
    expect(web.channel).toBe('WEB');
    expect(wa.channel).toBe('WHATSAPP');

    const webReply = await vendedorAgent
      .post(`${api}/chat/conversations/${qaWebConversationId}/messages`)
      .send({ body: 'Respuesta por WEB' })
      .expect(201);
    expect(webReply.body.senderType).toBe('STAFF');

    const before = await prisma.chatMessage.count({
      where: { conversationId: qaWhatsappConversationId },
    });
    const waReply = await vendedorAgent
      .post(`${api}/chat/conversations/${qaWhatsappConversationId}/messages`)
      .send({ body: 'Respuesta por WhatsApp' })
      .expect(409);
    expect(waReply.body.code).toBe('INTEGRATION_NOT_CONFIGURED');
    const after = await prisma.chatMessage.count({
      where: { conversationId: qaWhatsappConversationId },
    });
    expect(after).toBe(before);

    const crossOrg = await aliadaVendedorAgent
      .get(`${api}/chat/conversations/${qaWebConversationId}/messages`)
      .expect(404);
    expect(crossOrg.body.code).toBe('NOT_FOUND');
  });

  it('inbound WhatsApp marca la conversación como WHATSAPP con externalId', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: 'Entrante Cierre QA' }, wa_id: INBOUND_PHONE }],
                messages: [
                  {
                    from: INBOUND_PHONE,
                    id: 'wamid.cierre.1',
                    type: 'text',
                    text: { body: 'Hola desde el inbound de cierre' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const received = await request(server)
      .post(`${api}/webhooks/whatsapp`)
      .set('content-type', 'application/json')
      .send(JSON.stringify(payload))
      .expect(200);
    expect(received.body).toMatchObject({ received: true, processed: 1 });

    const demo = await prisma.organization.findUniqueOrThrow({ where: { slug: 'demo' } });
    const customer = await prisma.customer.findFirstOrThrow({
      where: { organizationId: demo.id, phone: `+${INBOUND_PHONE}` },
    });
    const conversation = await prisma.chatConversation.findFirstOrThrow({
      where: { organizationId: demo.id, customerId: customer.id },
    });
    expect(conversation.channel).toBe('WHATSAPP');
    expect(conversation.externalId).toBe(INBOUND_PHONE);
  });
});
