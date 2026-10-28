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

const MAILPIT_URL = 'http://localhost:8025/api/v1/messages?limit=200';

describe('Ajustes, autoaprobación, recordatorios y reportes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let catalogSlug: string;
  let versionId: string;
  let product: Product;
  let admin: StaffFixture;
  let finance: StaffFixture;
  let approver: StaffFixture;
  let vendedor: StaffFixture;
  let aliada: StaffFixture;
  let adminAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let financeAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let approverAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let originalDevHelpers: string | undefined;

  async function loginStaff(
    fixture: { email: string; password: string },
    audience: 'staff' | 'customer' = 'staff',
  ) {
    const agent = request.agent(server);
    const login = await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience })
      .expect(200);
    if (login.body.status === 'authenticated') return agent;

    const mfaToken = login.body.mfaToken as string;
    if (login.body.status === 'mfa_enrollment_required') {
      await agent.post(`${api}/auth/mfa/enroll`).send({ mfaToken }).expect(200);
    }
    const totp = await agent.post(`${api}/auth/dev/totp`).send({ mfaToken }).expect(200);
    const verified = await agent
      .post(`${api}/auth/mfa/verify`)
      .send({ mfaToken, code: totp.body.code })
      .expect(200);
    expect(verified.body.status).toBe('authenticated');
    return agent;
  }

  let orderSequence = 0;

  async function createOrder(customer: { fullName: string; email?: string; phone?: string }) {
    orderSequence += 1;
    const response = await request(server)
      .post(`${api}/storefront/checkout`)
      .send({
        catalogSlug,
        items: [{ productId: product.id, quantity: 1 }],
        customer: { fullName: customer.fullName, email: customer.email, phone: customer.phone },
      })
      .expect(201);
    return response.body as { orderId: string; orderNumber: string };
  }

  async function payOrder(orderId: string, reference: string) {
    await financeAgent
      .post(`${api}/orders/${orderId}/payments/manual`)
      .send({ amountMinor: 11_300, method: 'TRANSFER', reference })
      .expect(201);
    const payments = await financeAgent.get(`${api}/orders/${orderId}/payments`).expect(200);
    return payments.body.items[0] as { id: string };
  }

  async function mailpitSubjects(): Promise<string[]> {
    const response = await fetch(MAILPIT_URL);
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      messages?: Array<{ Subject?: string; subject?: string }>;
    };
    return (payload.messages ?? []).map((message) => message.Subject ?? message.subject ?? '');
  }

  beforeAll(async () => {
    originalDevHelpers = process.env.DEV_AUTH_HELPERS;
    process.env.DEV_AUTH_HELPERS = 'true';
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA F2 Org', slug: uniqueSlug('qa-f2'), plan: 'STARTER' },
    });
    organizationId = organization.id;

    admin = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'org_admin',
      emailPrefix: 'qa-f2-admin',
    });
    finance = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'finanzas',
      emailPrefix: 'qa-f2-finance',
    });
    approver = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-f2-approver',
    });
    vendedor = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-f2-vendedor',
    });
    aliada = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'finanzas',
      emailPrefix: 'qa-f2-aliada',
    });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo QA F2',
      slugPrefix: 'qa-f2-catalog',
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
        sku: 'F2-113',
        name: 'Producto reportes ₡11.300',
        priceMinor: 11_300n,
        currency: 'CRC',
        stock: 30,
      },
    });

    adminAgent = await loginStaff(admin);
    financeAgent = await loginStaff(finance);
    approverAgent = await loginStaff(approver);
    vendedorAgent = await loginStaff(vendedor);
    aliadaAgent = await loginStaff(aliada);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.paymentReminder.deleteMany({ where: { organizationId } });
      await prisma.refund.deleteMany({ where: { organizationId } });
      await prisma.payment.deleteMany({ where: { organizationId } });
      await prisma.paymentLink.deleteMany({ where: { organizationId } });
      await prisma.order.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    for (const fixture of [admin, finance, approver, vendedor, aliada]) {
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

  it('GET/PATCH ajustes de organización: auditado y solo con settings:manage', async () => {
    const initial = await adminAgent.get(`${api}/organizations/settings`).expect(200);
    expect(initial.body).toEqual({ allowSelfApproval: false });

    const updated = await adminAgent
      .patch(`${api}/organizations/settings`)
      .send({ allowSelfApproval: true })
      .expect(200);
    expect(updated.body).toEqual({ allowSelfApproval: true });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'organization.settings_updated', organizationId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.before).toMatchObject({ allowSelfApproval: false });
    expect(audit?.after).toMatchObject({ allowSelfApproval: true });

    const forbidden = await financeAgent.get(`${api}/organizations/settings`).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('autoaprobación: flag apagado 409, encendido sin confirmar 422 y con confirmar audita self_approved', async () => {
    // Apagado explícitamente.
    await adminAgent
      .patch(`${api}/organizations/settings`)
      .send({ allowSelfApproval: false })
      .expect(200);

    const order = await createOrder({
      fullName: 'Cliente Auto',
      email: `auto-${Date.now()}@qa.local`,
    });
    const payment = await payOrder(order.orderId, `AUTO-${Date.now()}`);

    const requested = await approverAgent
      .post(`${api}/payments/${payment.id}/refunds`)
      .send({ amountMinor: 1000, reason: 'Autoaprobación QA' })
      .expect(201);
    const refundId = requested.body.id as string;

    const blocked = await approverAgent
      .post(`${api}/refunds/${refundId}/approve`)
      .send({ note: 'intento', confirmSelfApproval: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('REFUND_SEGREGATION_REQUIRED');

    await adminAgent
      .patch(`${api}/organizations/settings`)
      .send({ allowSelfApproval: true })
      .expect(200);

    const needsConfirmation = await approverAgent
      .post(`${api}/refunds/${refundId}/approve`)
      .send({ note: 'sin confirmar' })
      .expect(422);
    expect(needsConfirmation.body.code).toBe('VALIDATION_FAILED');
    expect(needsConfirmation.body.details).toEqual({
      reason: 'self_approval_confirmation_required',
    });

    const approved = await approverAgent
      .post(`${api}/refunds/${refundId}/approve`)
      .send({ note: 'confirmo autoaprobación', confirmSelfApproval: true })
      .expect(200);
    expect(approved.body).toMatchObject({
      paymentStatus: 'PARTIALLY_REFUNDED',
      refundedMinor: '1000',
      balanceMinor: '10300',
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.refund_self_approved', entityId: refundId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.after).toMatchObject({ selfApproval: true });
  });

  it('recordatorio EMAIL: envía por Mailpit y queda SENT con listado', async () => {
    const order = await createOrder({
      fullName: 'María Recordatorio',
      email: `recordatorio-${Date.now()}@qa.local`,
    });

    const sent = await financeAgent
      .post(`${api}/orders/${order.orderId}/reminders`)
      .send({ channel: 'EMAIL' })
      .expect(201);
    expect(sent.body).toMatchObject({
      orderId: order.orderId,
      channel: 'EMAIL',
      status: 'SENT',
    });
    expect(sent.body.to).toContain('@qa.local');
    expect(sent.body.sentAt).not.toBeNull();

    const row = await prisma.paymentReminder.findFirstOrThrow({
      where: { orderId: order.orderId, organizationId },
    });
    expect(row.status).toBe('SENT');
    expect(row.sentAt).not.toBeNull();
    expect(row.error).toBeNull();

    const list = await financeAgent.get(`${api}/orders/${order.orderId}/reminders`).expect(200);
    expect(list.body.orderId).toBe(order.orderId);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].channel).toBe('EMAIL');

    // Mailpit local: el correo se envió de verdad.
    const subjects = await mailpitSubjects();
    expect(subjects.some((subject) => subject.includes(order.orderNumber))).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'payment.reminder_sent', organizationId },
    });
    expect(audit).not.toBeNull();
  });

  it('recordatorio WHATSAPP: sin credenciales 409 y sin teléfono 422', async () => {
    const withPhone = await createOrder({
      fullName: 'Cliente WhatsApp',
      email: `wa-${Date.now()}@qa.local`,
      phone: '+506 8888-7777',
    });
    const noCredentials = await financeAgent
      .post(`${api}/orders/${withPhone.orderId}/reminders`)
      .send({ channel: 'WHATSAPP' })
      .expect(409);
    expect(noCredentials.body.code).toBe('INTEGRATION_NOT_CONFIGURED');

    const withoutPhone = await createOrder({
      fullName: 'Cliente Sin Teléfono',
      email: `sin-tel-${Date.now()}@qa.local`,
    });
    const missingPhone = await financeAgent
      .post(`${api}/orders/${withoutPhone.orderId}/reminders`)
      .send({ channel: 'WHATSAPP' })
      .expect(422);
    expect(missingPhone.body.details).toEqual({ reason: 'customer_phone_missing' });
  });

  it('reportes financieros y conciliación con el pedido pagado del mes', async () => {
    const order = await createOrder({
      fullName: 'Cliente Reportes',
      email: `reportes-${Date.now()}@qa.local`,
    });
    const payment = await payOrder(order.orderId, `REC-REPORTES-${Date.now()}`);
    // Un pedido con saldo abierto para cuentas por cobrar.
    const pending = await createOrder({
      fullName: 'Cliente Pendiente',
      email: `pendiente-${Date.now()}@qa.local`,
    });

    const finance = await financeAgent.get(`${api}/reports/finance`).expect(200);
    expect(finance.body.range.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(finance.body.currency).toBe('CRC');
    expect(finance.body.sales.orders).toBeGreaterThanOrEqual(1);
    expect(BigInt(finance.body.sales.netMinor)).toBeGreaterThan(0n);
    expect(finance.body.payments.count).toBeGreaterThanOrEqual(1);
    expect(BigInt(finance.body.payments.totalMinor)).toBeGreaterThan(0n);
    expect(
      finance.body.payments.byMethod.some((row: { method: string }) => row.method === 'TRANSFER'),
    ).toBe(true);
    expect(finance.body.topProducts[0]).toMatchObject({ productId: product.id });
    expect(finance.body.receivables.openOrders).toBeGreaterThanOrEqual(1);
    expect(BigInt(finance.body.receivables.openBalanceMinor)).toBeGreaterThan(0n);
    expect(finance.body.refunds.processedMinor).toBe('1000');

    const pendingOrder = await prisma.order.findUniqueOrThrow({ where: { id: pending.orderId } });
    expect(pendingOrder.paidMinor).toBe(0n);

    const invalidRange = await financeAgent
      .get(`${api}/reports/finance?from=2026-10-10&to=2026-10-01`)
      .expect(422);
    expect(invalidRange.body.code).toBe('VALIDATION_FAILED');

    const reconciliation = await financeAgent.get(`${api}/reports/reconciliation`).expect(200);
    expect(reconciliation.body.rows.length).toBeGreaterThanOrEqual(1);
    const row = reconciliation.body.rows.find(
      (item: { paymentId: string }) => item.paymentId === payment.id,
    );
    expect(row).toBeTruthy();
    expect(row.reference).toContain('REC-REPORTES-');
    expect(row.orderNumber).toBe(order.orderNumber);
    const expected = BigInt(reconciliation.body.totals.registeredMinor);
    const refunded = BigInt(reconciliation.body.totals.refundedMinor);
    expect(BigInt(reconciliation.body.totals.netMinor)).toBe(expected - refunded);

    const forbidden = await vendedorAgent.get(`${api}/reports/finance`).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('permisos y cross-org en recordatorios (403/404)', async () => {
    const order = await createOrder({
      fullName: 'Cliente Cross',
      email: `cross-${Date.now()}@qa.local`,
    });

    const forbidden = await vendedorAgent
      .post(`${api}/orders/${order.orderId}/reminders`)
      .send({ channel: 'EMAIL' })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const crossPost = await aliadaAgent
      .post(`${api}/orders/${order.orderId}/reminders`)
      .send({ channel: 'EMAIL' })
      .expect(404);
    expect(crossPost.body.code).toBe('NOT_FOUND');

    const crossList = await aliadaAgent.get(`${api}/orders/${order.orderId}/reminders`).expect(404);
    expect(crossList.body.code).toBe('NOT_FOUND');
  });
});
