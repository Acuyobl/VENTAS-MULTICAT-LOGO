import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { computeStripeSignature } from '../src/modules/payments/stripe-signature';
import {
  createCatalogFixture,
  createStaffFixture,
  deleteCatalogFixture,
  deleteUserFixture,
  uniqueSlug,
  type StaffFixture,
} from './helpers/fixtures';

describe('Cobros F2: link de pago, sandbox, webhook y pagos manuales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let catalogSlug: string;
  let versionId: string;
  let product: Product;
  let finanzas: StaffFixture;
  let admin: StaffFixture;
  let aliadaStaff: StaffFixture;
  let finanzasAgent!: Awaited<ReturnType<typeof loginAs>>;
  let adminAgent!: Awaited<ReturnType<typeof loginAs>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginAs>>;
  let originalSandboxFlag: string | undefined;
  let originalWebhookSecret: string | undefined;
  const stripeWebhookSecret = 'whsec_e2e_task14';

  async function loginAs(
    fixture: { email: string; password: string },
    audience: 'staff' | 'customer',
  ) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience })
      .expect(200);
    return agent;
  }

  async function createOrder(quantity = 2) {
    const response = await request(server)
      .post(`${api}/storefront/checkout`)
      .send({
        catalogSlug,
        items: [{ productId: product.id, quantity }],
        customer: { fullName: 'Cliente Cobros', email: `cobros-${Date.now()}@qa.local` },
      })
      .expect(201);
    return response.body as { orderId: string; orderNumber: string; token: string };
  }

  beforeAll(async () => {
    originalSandboxFlag = process.env.PAYMENTS_SANDBOX_ENABLED;
    originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.PAYMENTS_SANDBOX_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = stripeWebhookSecret;

    // Import dinámico: ConfigModule.forRoot valida el entorno al evaluar
    // AppModule, así que el webhook secret debe estar en process.env antes.
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Cobros Org', slug: uniqueSlug('qa-pay'), plan: 'STARTER' },
    });
    organizationId = organization.id;

    finanzas = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'finanzas',
      emailPrefix: 'qa-pay-finanzas',
    });
    admin = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-pay-admin',
    });
    aliadaStaff = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      // finanzas tiene payment:read/write pero es de otra organización.
      roleKey: 'finanzas',
      emailPrefix: 'qa-pay-aliada',
    });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo QA Cobros',
      slugPrefix: 'qa-pay-catalog',
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
        createdByUserId: finanzas.userId,
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
        sku: 'PAY-113',
        name: 'Producto de cobro ₡11.300',
        priceMinor: 11_300n,
        currency: 'CRC',
        stock: 20,
      },
    });

    finanzasAgent = await loginAs(finanzas, 'staff');
    adminAgent = await loginAs(admin, 'staff');
    aliadaAgent = await loginAs(aliadaStaff, 'staff');
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.paymentWebhookEvent.deleteMany({
        where: { externalEventId: { startsWith: 'evt_e2e' } },
      });
      await prisma.payment.deleteMany({ where: { organizationId } });
      await prisma.paymentLink.deleteMany({ where: { organizationId } });
      await prisma.order.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (finanzas) await deleteUserFixture(prisma, finanzas.userId);
    if (admin) await deleteUserFixture(prisma, admin.userId);
    if (aliadaStaff) await deleteUserFixture(prisma, aliadaStaff.userId);
    if (prisma) {
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (originalSandboxFlag === undefined) delete process.env.PAYMENTS_SANDBOX_ENABLED;
    else process.env.PAYMENTS_SANDBOX_ENABLED = originalSandboxFlag;
    if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
    if (app) await app.close();
  });

  it('crea un link sandbox para el pedido y lo publica sin exponer datos internos', async () => {
    const order = await createOrder(2);
    expect(order.orderNumber).toMatch(/^PED-\d{4}-000001$/);

    const link = await finanzasAgent
      .post(`${api}/orders/${order.orderId}/payment-link`)
      .send({})
      .expect(201);

    expect(link.body).toMatchObject({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      provider: 'SANDBOX',
      status: 'ACTIVE',
      amountMinor: '22600',
      currency: 'CRC',
    });
    expect(link.body.url).toMatch(/^http:\/\/localhost:3000\/pago\//);
    const minutes = (new Date(link.body.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(58);
    expect(minutes).toBeLessThan(61);

    const token = (link.body.url as string).split('/').pop() as string;
    const publicLink = await request(server)
      .get(`${api}/payments/public/link/${token}`)
      .expect(200);
    expect(publicLink.body).toMatchObject({
      token,
      status: 'ACTIVE',
      provider: 'SANDBOX',
      amountMinor: '22600',
    });
    expect(publicLink.body.order).toMatchObject({
      orderNumber: order.orderNumber,
      totalMinor: '22600',
      customerName: 'Cliente Cobros',
    });
    expect(publicLink.body.order.items).toHaveLength(1);
  });

  it('confirmar el sandbox cobra el pedido; la segunda confirmación es idempotente', async () => {
    const order = await createOrder(2);
    const link = await finanzasAgent
      .post(`${api}/orders/${order.orderId}/payment-link`)
      .send({})
      .expect(201);
    const token = (link.body.url as string).split('/').pop() as string;

    const first = await request(server)
      .post(`${api}/payments/sandbox/${token}/confirm`)
      .expect(200);
    expect(first.body).toEqual({
      paymentStatus: 'SUCCEEDED',
      orderStatus: 'PAID',
      paidMinor: '22600',
      totalMinor: '22600',
      alreadyProcessed: false,
    });

    const dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(dbOrder.status).toBe('PAID');
    expect(dbOrder.paidMinor).toBe(22_600n);
    const payments = await prisma.payment.findMany({ where: { orderId: order.orderId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      provider: 'SANDBOX',
      status: 'SUCCEEDED',
      amountMinor: 22_600n,
      currency: 'CRC',
    });
    const dbLink = await prisma.paymentLink.findUniqueOrThrow({
      where: { token },
    });
    expect(dbLink.status).toBe('USED');
    expect(dbLink.usedAt).not.toBeNull();

    const second = await request(server)
      .post(`${api}/payments/sandbox/${token}/confirm`)
      .expect(200);
    expect(second.body).toMatchObject({ alreadyProcessed: true, paidMinor: '22600' });
    expect(await prisma.payment.count({ where: { orderId: order.orderId } })).toBe(1);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(after.paidMinor).toBe(22_600n);
  });

  it('un link expirado responde 409 payment_link_expired', async () => {
    const order = await createOrder(1);
    const link = await finanzasAgent
      .post(`${api}/orders/${order.orderId}/payment-link`)
      .send({ expiresInMinutes: 5 })
      .expect(201);
    const token = (link.body.url as string).split('/').pop() as string;
    await prisma.paymentLink.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const publicLink = await request(server)
      .get(`${api}/payments/public/link/${token}`)
      .expect(409);
    expect(publicLink.body.code).toBe('VALIDATION_FAILED');
    expect(publicLink.body.details).toEqual({ reason: 'payment_link_expired' });

    const confirm = await request(server)
      .post(`${api}/payments/sandbox/${token}/confirm`)
      .expect(409);
    expect(confirm.body.details).toEqual({ reason: 'payment_link_expired' });
  });

  it('pago manual parcial actualiza estado y saldo; el sobrepago da 422', async () => {
    const order = await createOrder(1);

    const partial = await finanzasAgent
      .post(`${api}/orders/${order.orderId}/payments/manual`)
      .send({ amountMinor: 5000, method: 'CASH', reference: 'REC-001' })
      .expect(201);
    expect(partial.body).toMatchObject({
      provider: 'CASH',
      status: 'SUCCEEDED',
      amountMinor: '5000',
      reference: 'REC-001',
    });

    const list = await finanzasAgent.get(`${api}/orders/${order.orderId}/payments`).expect(200);
    expect(list.body).toMatchObject({
      orderStatus: 'PARTIALLY_PAID',
      totalMinor: '11300',
      paidMinor: '5000',
      balanceMinor: '6300',
    });
    expect(list.body.items).toHaveLength(1);

    const overpay = await finanzasAgent
      .post(`${api}/orders/${order.orderId}/payments/manual`)
      .send({ amountMinor: 10_000, method: 'TRANSFER' })
      .expect(422);
    expect(overpay.body.code).toBe('VALIDATION_FAILED');
    expect(overpay.body.details).toMatchObject({ reason: 'payment_exceeds_balance' });

    await finanzasAgent
      .post(`${api}/orders/${order.orderId}/payments/manual`)
      .send({ amountMinor: 6300, method: 'SINPE', reference: 'SINPE-9' })
      .expect(201);
    const finalList = await finanzasAgent
      .get(`${api}/orders/${order.orderId}/payments`)
      .expect(200);
    expect(finalList.body).toMatchObject({
      orderStatus: 'PAID',
      paidMinor: '11300',
      balanceMinor: '0',
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.manual_registered', entityType: 'payment' },
    });
    expect(audit).not.toBeNull();
  });

  it('webhook Stripe con firma válida registra el pago una sola vez', async () => {
    const order = await createOrder(1);
    const payload = Buffer.from(
      JSON.stringify({
        id: 'evt_e2e_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_e2e_1',
            payment_intent: 'pi_e2e_1',
            amount_total: 11_300,
            currency: 'crc',
            metadata: { orderId: order.orderId },
          },
        },
      }),
      'utf8',
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = computeStripeSignature(stripeWebhookSecret, timestamp, payload);
    const headers = {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    };

    const received = await request(server)
      .post(`${api}/payments/webhooks/stripe`)
      .set(headers)
      .send(payload.toString())
      .expect(200);
    expect(received.body).toMatchObject({ received: true, idempotent: false });

    const dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(dbOrder.status).toBe('PAID');
    expect(dbOrder.paidMinor).toBe(11_300n);
    const payments = await prisma.payment.findMany({ where: { orderId: order.orderId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      provider: 'STRIPE',
      providerPaymentId: 'pi_e2e_1',
      amountMinor: 11_300n,
      reference: 'pi_e2e_1',
    });
    const event = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: { provider_externalEventId: { provider: 'STRIPE', externalEventId: 'evt_e2e_1' } },
    });
    expect(event.signatureValid).toBe(true);
    expect(event.processedAt).not.toBeNull();
    expect(event.paymentId).not.toBeNull();

    const repeated = await request(server)
      .post(`${api}/payments/webhooks/stripe`)
      .set(headers)
      .send(payload.toString())
      .expect(200);
    expect(repeated.body).toMatchObject({ received: true, idempotent: true });
    expect(await prisma.payment.count({ where: { orderId: order.orderId } })).toBe(1);
  });

  it('un webhook con firma inválida responde 400 PAYMENT_SIGNATURE_INVALID', async () => {
    const order = await createOrder(1);
    const payload = JSON.stringify({
      id: 'evt_e2e_invalid',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_bad',
          amount_total: 11300,
          currency: 'crc',
          metadata: { orderId: order.orderId },
        },
      },
    });

    const response = await request(server)
      .post(`${api}/payments/webhooks/stripe`)
      .set('content-type', 'application/json')
      .set('stripe-signature', `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`)
      .send(payload)
      .expect(400);
    expect(response.body.code).toBe('PAYMENT_SIGNATURE_INVALID');
    expect(
      await prisma.paymentWebhookEvent.count({ where: { externalEventId: 'evt_e2e_invalid' } }),
    ).toBe(0);
  });

  it('un pedido pagado no se cancela (409 ORDER_HAS_PAYMENTS) y el link no se regenera en PAID', async () => {
    const order = await createOrder(1);
    const link = await finanzasAgent
      .post(`${api}/orders/${order.orderId}/payment-link`)
      .send({})
      .expect(201);
    const token = (link.body.url as string).split('/').pop() as string;
    await request(server).post(`${api}/payments/sandbox/${token}/confirm`).expect(200);

    const cancel = await adminAgent
      .post(`${api}/orders/${order.orderId}/cancel`)
      .send({ reason: 'Intento con pago' })
      .expect(409);
    expect(cancel.body.code).toBe('ORDER_HAS_PAYMENTS');

    const regenerate = await finanzasAgent
      .post(`${api}/orders/${order.orderId}/payment-link`)
      .send({})
      .expect(409);
    expect(regenerate.body.code).toBe('ORDER_INVALID_TRANSITION');
  });

  it('otra organización no ve ni cobra el pedido (404)', async () => {
    const order = await createOrder(1);

    const list = await aliadaAgent.get(`${api}/orders/${order.orderId}/payments`).expect(404);
    expect(list.body.code).toBe('NOT_FOUND');

    const link = await aliadaAgent
      .post(`${api}/orders/${order.orderId}/payment-link`)
      .send({})
      .expect(404);
    expect(link.body.code).toBe('NOT_FOUND');

    const manual = await aliadaAgent
      .post(`${api}/orders/${order.orderId}/payments/manual`)
      .send({ amountMinor: 1000, method: 'CASH' })
      .expect(404);
    expect(manual.body.code).toBe('NOT_FOUND');
  });

  it('con PAYMENTS_SANDBOX_ENABLED=false la confirmación sandbox no existe (404)', async () => {
    const order = await createOrder(1);
    const link = await finanzasAgent
      .post(`${api}/orders/${order.orderId}/payment-link`)
      .send({})
      .expect(201);
    const token = (link.body.url as string).split('/').pop() as string;

    process.env.PAYMENTS_SANDBOX_ENABLED = 'false';
    vi.resetModules();
    const freshHarness = await import('./helpers/test-harness');
    const appWithoutSandbox = await freshHarness.createTestApp();
    try {
      const response = await request(appWithoutSandbox.getHttpServer())
        .post(`/api/v1/payments/sandbox/${token}/confirm`)
        .expect(404);
      expect(response.body.code).toBe('NOT_FOUND');
    } finally {
      await appWithoutSandbox.close();
      process.env.PAYMENTS_SANDBOX_ENABLED = 'true';
    }
  });
});
