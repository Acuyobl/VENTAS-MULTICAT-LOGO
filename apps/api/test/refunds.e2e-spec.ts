import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';
import {
  createCatalogFixture,
  createStaffFixture,
  deleteCatalogFixture,
  deleteUserFixture,
  uniqueSlug,
  type StaffFixture,
} from './helpers/fixtures';

describe('Reembolsos F2: segregación de funciones y saldos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let catalogSlug: string;
  let versionId: string;
  let product: Product;
  let requester: StaffFixture;
  let approver: StaffFixture;
  let vendedor: StaffFixture;
  let aliadaStaff: StaffFixture;
  let requesterAgent!: Awaited<ReturnType<typeof loginAs>>;
  let approverAgent!: Awaited<ReturnType<typeof loginAs>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginAs>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginAs>>;

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

  async function createPaidOrder(quantity: number, amountMinor: number) {
    const checkout = await request(server)
      .post(`${api}/storefront/checkout`)
      .send({
        catalogSlug,
        items: [{ productId: product.id, quantity }],
        customer: { fullName: 'Cliente Reembolsos', email: `reembolsos-${Date.now()}@qa.local` },
      })
      .expect(201);
    const orderId = checkout.body.orderId as string;

    await requesterAgent
      .post(`${api}/orders/${orderId}/payments/manual`)
      .send({ amountMinor, method: 'CASH', reference: `REC-${Date.now()}` })
      .expect(201);

    const payments = await requesterAgent.get(`${api}/orders/${orderId}/payments`).expect(200);
    const payment = payments.body.items[0] as { id: string };
    return { orderId, paymentId: payment.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Reembolsos Org', slug: uniqueSlug('qa-refund'), plan: 'STARTER' },
    });
    organizationId = organization.id;

    requester = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'finanzas',
      emailPrefix: 'qa-refund-requester',
    });
    approver = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-refund-approver',
    });
    vendedor = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-refund-vendedor',
    });
    aliadaStaff = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      // Tiene permisos de reembolso, así el rechazo es por organización (404).
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-refund-aliada',
    });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo QA Reembolsos',
      slugPrefix: 'qa-refund-catalog',
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
        createdByUserId: requester.userId,
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
        sku: 'REFUND-113',
        name: 'Producto para reembolso ₡11.300',
        priceMinor: 11_300n,
        currency: 'CRC',
        stock: 20,
      },
    });

    requesterAgent = await loginAs(requester, 'staff');
    approverAgent = await loginAs(approver, 'staff');
    vendedorAgent = await loginAs(vendedor, 'staff');
    aliadaAgent = await loginAs(aliadaStaff, 'staff');
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.refund.deleteMany({ where: { organizationId } });
      await prisma.payment.deleteMany({ where: { organizationId } });
      await prisma.paymentLink.deleteMany({ where: { organizationId } });
      await prisma.order.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (requester) await deleteUserFixture(prisma, requester.userId);
    if (approver) await deleteUserFixture(prisma, approver.userId);
    if (vendedor) await deleteUserFixture(prisma, vendedor.userId);
    if (aliadaStaff) await deleteUserFixture(prisma, aliadaStaff.userId);
    if (prisma) {
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (app) await app.close();
  });

  it('solicita un reembolso parcial, lo aprueba otro usuario y actualiza saldos', async () => {
    const { orderId, paymentId } = await createPaidOrder(2, 22_600);

    const requested = await requesterAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 5000, reason: 'Producto dañado', method: 'TRANSFER' })
      .expect(201);
    expect(requested.body).toMatchObject({
      paymentId,
      orderId,
      amountMinor: '5000',
      currency: 'CRC',
      status: 'REQUESTED',
      requestedByUserId: requester.userId,
      method: 'TRANSFER',
      approvedByUserId: null,
    });
    const refundId = requested.body.id as string;

    const paymentRefunds = await requesterAgent
      .get(`${api}/payments/${paymentId}/refunds`)
      .expect(200);
    expect(paymentRefunds.body.items).toHaveLength(1);
    expect(paymentRefunds.body.items[0].status).toBe('REQUESTED');

    const beforeApproval = await requesterAgent.get(`${api}/orders/${orderId}/refunds`).expect(200);
    expect(beforeApproval.body).toMatchObject({
      paidMinor: '22600',
      refundedMinor: '0',
      balanceMinor: '22600',
    });

    // finanzas (solicitante) no tiene payment:refund_approve: 403 de permiso.
    const selfApproval = await requesterAgent
      .post(`${api}/refunds/${refundId}/approve`)
      .send({ note: 'autoaprobado' });
    expect(selfApproval.status).toBe(403);
    expect(selfApproval.body.code).toBe('FORBIDDEN');
    expect(selfApproval.body.details).toEqual({ missing: ['payment:refund_approve'] });

    const approved = await approverAgent
      .post(`${api}/refunds/${refundId}/approve`)
      .send({ note: 'Aprobado por finanzas' })
      .expect(200);
    expect(approved.body).toEqual({
      paymentStatus: 'PARTIALLY_REFUNDED',
      orderStatus: 'PAID',
      paidMinor: '22600',
      refundedMinor: '5000',
      balanceMinor: '17600',
    });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('PARTIALLY_REFUNDED');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.refundedMinor).toBe(5000n);
    expect(order.status).toBe('PAID');
    const refundRow = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    expect(refundRow.status).toBe('PROCESSED');
    expect(refundRow.approvedByUserId).toBe(approver.userId);
    expect(refundRow.processedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.refund_approved', entityId: refundId },
    });
    expect(audit).not.toBeNull();
  });

  it('el aprobador no puede ser el solicitante aunque tenga permiso de aprobar', async () => {
    const { paymentId } = await createPaidOrder(1, 11_300);

    // catalog_admin puede solicitar y aprobar, pero no su propio reembolso.
    const requested = await approverAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 1000, reason: 'Solicitud del aprobador' })
      .expect(201);

    const response = await approverAgent
      .post(`${api}/refunds/${requested.body.id}/approve`)
      .send({});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REFUND_SEGREGATION_REQUIRED');
    expect(response.body.details).toMatchObject({
      requestedByUserId: approver.userId,
      decidedByUserId: approver.userId,
    });
  });

  it('aprobar dos veces no duplica el reembolso (409 refund_already_decided)', async () => {
    const { orderId, paymentId } = await createPaidOrder(1, 11_300);
    const requested = await requesterAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 1000, reason: 'Duplicado' })
      .expect(201);

    await approverAgent.post(`${api}/refunds/${requested.body.id}/approve`).send({}).expect(200);

    const second = await approverAgent
      .post(`${api}/refunds/${requested.body.id}/approve`)
      .send({})
      .expect(409);
    expect(second.body.code).toBe('VALIDATION_FAILED');
    expect(second.body.details).toMatchObject({ reason: 'refund_already_decided' });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.refundedMinor).toBe(1000n);
    expect(await prisma.refund.count({ where: { orderId } })).toBe(1);
  });

  it('rechaza un reembolso mayor al disponible (422 REFUND_EXCEEDS_PAID)', async () => {
    const { orderId, paymentId } = await createPaidOrder(1, 11_300);

    const first = await requesterAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 5000, reason: 'Primera parte' })
      .expect(201);
    await approverAgent.post(`${api}/refunds/${first.body.id}/approve`).send({}).expect(200);

    const tooMuch = await requesterAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 7000, reason: 'Supera el disponible' })
      .expect(422);
    expect(tooMuch.body.code).toBe('REFUND_EXCEEDS_PAID');
    expect(tooMuch.body.details).toMatchObject({ availableMinor: '6300' });

    const second = await requesterAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 6300, reason: 'Saldo restante' })
      .expect(201);
    await approverAgent.post(`${api}/refunds/${second.body.id}/approve`).send({}).expect(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('REFUNDED');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.refundedMinor).toBe(11_300n);
    expect(order.status).toBe('REFUNDED');

    const list = await requesterAgent.get(`${api}/orders/${orderId}/refunds`).expect(200);
    expect(list.body).toMatchObject({
      refundedMinor: '11300',
      balanceMinor: '0',
      orderStatus: 'REFUNDED',
    });
    expect(list.body.items).toHaveLength(2);

    const afterFull = await requesterAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 100, reason: 'Ya reembolsado' })
      .expect(409);
    expect(afterFull.body.code).toBe('PAYMENT_NOT_REFUNDABLE');
  });

  it('rechazar un reembolso no toca saldos y queda REJECTED', async () => {
    const { orderId, paymentId } = await createPaidOrder(1, 11_300);
    const requested = await requesterAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 2000, reason: 'Solicitud a rechazar' })
      .expect(201);

    const rejected = await approverAgent
      .post(`${api}/refunds/${requested.body.id}/reject`)
      .send({ note: 'Fuera de política' })
      .expect(200);
    expect(rejected.body).toMatchObject({ status: 'REJECTED' });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.refundedMinor).toBe(0n);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.refund_rejected', entityId: requested.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it('un pago FAILED no es reembolsable: 409 PAYMENT_NOT_REFUNDABLE', async () => {
    const checkout = await request(server)
      .post(`${api}/storefront/checkout`)
      .send({
        catalogSlug,
        items: [{ productId: product.id, quantity: 1 }],
        customer: { fullName: 'Cliente Sin Pago', email: `sinpago-${Date.now()}@qa.local` },
      })
      .expect(201);
    const failedPayment = await prisma.payment.create({
      data: {
        organizationId,
        catalogId,
        catalogVersionId: versionId,
        orderId: checkout.body.orderId,
        provider: 'CASH',
        status: 'FAILED',
        amountMinor: 11_300n,
        currency: 'CRC',
      },
    });

    const response = await requesterAgent
      .post(`${api}/payments/${failedPayment.id}/refunds`)
      .send({ amountMinor: 100, reason: 'Pago fallido' })
      .expect(409);
    expect(response.body.code).toBe('PAYMENT_NOT_REFUNDABLE');
  });

  it('permisos: sin payment:refund_request no se solicita ni sin payment:refund_approve se aprueba (403)', async () => {
    const { paymentId } = await createPaidOrder(1, 11_300);

    const forbiddenRequest = await vendedorAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 100, reason: 'Sin permiso' })
      .expect(403);
    expect(forbiddenRequest.body.code).toBe('FORBIDDEN');
    expect(forbiddenRequest.body.details).toEqual({ missing: ['payment:refund_request'] });

    const requested = await requesterAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 100, reason: 'Pendiente' })
      .expect(201);
    const forbiddenApprove = await requesterAgent
      .post(`${api}/refunds/${requested.body.id}/approve`)
      .send({})
      .expect(403);
    expect(forbiddenApprove.body.code).toBe('FORBIDDEN');
    expect(forbiddenApprove.body.details).toEqual({ missing: ['payment:refund_approve'] });
  });

  it('otra organización no ve ni decide reembolsos (404)', async () => {
    const { orderId, paymentId } = await createPaidOrder(1, 11_300);
    const requested = await requesterAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 500, reason: 'Cross org' })
      .expect(201);

    const list = await aliadaAgent.get(`${api}/orders/${orderId}/refunds`).expect(404);
    expect(list.body.code).toBe('NOT_FOUND');

    const create = await aliadaAgent
      .post(`${api}/payments/${paymentId}/refunds`)
      .send({ amountMinor: 100, reason: 'Cross org' })
      .expect(404);
    expect(create.body.code).toBe('NOT_FOUND');

    const approve = await aliadaAgent
      .post(`${api}/refunds/${requested.body.id}/approve`)
      .send({})
      .expect(404);
    expect(approve.body.code).toBe('NOT_FOUND');
  });
});
