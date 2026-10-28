import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { businessYear } from '../src/modules/sales/numbering';
import { hashOrderToken } from '../src/modules/storefront/token';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';
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

describe('Cara B: checkout invitado, reclamo y portal de pedidos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let catalogSlug: string;
  let versionId: string;
  let product11300: Product;
  let productLowStock: Product;
  let staff: StaffFixture;
  let customerA: CustomerFixture;
  let customerB: CustomerFixture;
  let staffAgent!: Awaited<ReturnType<typeof loginAs>>;
  let customerAAgent!: Awaited<ReturnType<typeof loginAs>>;
  let customerBAgent!: Awaited<ReturnType<typeof loginAs>>;
  let orderId = '';
  let orderNumber = '';
  let orderToken = '';
  let accountCustomerAId = '';
  const year = businessYear();

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

  function checkout(body: Record<string, unknown>) {
    return request(server).post(`${api}/storefront/checkout`).send(body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Storefront Org', slug: uniqueSlug('qa-store'), plan: 'STARTER' },
    });
    organizationId = organization.id;

    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-store-staff',
    });
    customerA = await createCustomerFixture(prisma, {
      organizationSlug: organization.slug,
      emailPrefix: 'qa-store-a',
    });
    customerB = await createCustomerFixture(prisma, {
      organizationSlug: organization.slug,
      emailPrefix: 'qa-store-b',
    });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo QA Storefront',
      slugPrefix: 'qa-store-catalog',
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
        productCount: 2,
        createdByUserId: staff.userId,
        activatedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    versionId = version.id;
    await prisma.catalog.update({ where: { id: catalogId }, data: { activeVersionId: versionId } });

    product11300 = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: versionId,
        sku: 'TIENDA-113',
        name: 'Producto de tienda ₡11.300',
        priceMinor: 11_300n,
        currency: 'CRC',
        stock: 10,
      },
    });
    productLowStock = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: versionId,
        sku: 'TIENDA-STOCK1',
        name: 'Producto con stock 1',
        priceMinor: 5_000n,
        currency: 'CRC',
        stock: 1,
      },
    });

    staffAgent = await loginAs(staff, 'staff');
    customerAAgent = await loginAs(customerA, 'customer');
    customerBAgent = await loginAs(customerB, 'customer');

    const accountA = await prisma.customerAccount.findFirstOrThrow({
      where: { userId: customerA.userId, organizationId },
      select: { customerId: true },
    });
    accountCustomerAId = accountA.customerId;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.payment.deleteMany({ where: { organizationId } });
      await prisma.order.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (customerA) await deleteUserFixture(prisma, customerA.userId);
    if (customerB) await deleteUserFixture(prisma, customerB.userId);
    if (prisma) {
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (app) await app.close();
  });

  it('checkout público crea el pedido con totales, número y token en claro una sola vez', async () => {
    const response = await checkout({
      catalogSlug,
      items: [{ productId: product11300.id, quantity: 2 }],
      customer: {
        fullName: 'Invitada Checkout',
        email: customerA.email,
        phone: '+506 8000 5555',
      },
      notes: 'Dejar en portería',
    }).expect(201);

    expect(response.body).toMatchObject({
      status: 'PENDING_PAYMENT',
      totalMinor: '22600',
      currency: 'CRC',
      orderNumber: `PED-${year}-000001`,
    });
    expect(response.body.orderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.token.length).toBeGreaterThanOrEqual(40);
    orderId = response.body.orderId;
    orderNumber = response.body.orderNumber;
    orderToken = response.body.token;

    const expiresAt = new Date(response.body.expiresAt).getTime();
    const days = (expiresAt - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);

    // En la base solo vive el hash del token.
    const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.publicToken).toBe(hashOrderToken(orderToken));
    expect(row.publicToken).not.toBe(orderToken);
    expect(row.publicTokenExpiresAt).not.toBeNull();

    const publicView = await request(server)
      .get(`${api}/storefront/orders/${orderToken}`)
      .expect(200);
    expect(publicView.body).toMatchObject({
      orderNumber,
      status: 'PENDING_PAYMENT',
      subtotalMinor: '20000',
      taxMinor: '2600',
      totalMinor: '22600',
      // El email ya existía como Customer de la organización: se reutiliza.
      customerName: 'QA Cliente',
      notes: 'Dejar en portería',
    });
    expect(publicView.body.items).toHaveLength(1);
    expect(publicView.body.items[0]).toMatchObject({
      skuSnapshot: 'TIENDA-113',
      quantity: 2,
      lineTotalMinor: '22600',
    });
  });

  it('un token inválido responde 404', async () => {
    const response = await request(server)
      .get(`${api}/storefront/orders/${'x'.repeat(43)}`)
      .expect(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('stock insuficiente responde 409 PRODUCT_OUT_OF_STOCK con available', async () => {
    const response = await checkout({
      catalogSlug,
      items: [{ productId: productLowStock.id, quantity: 2 }],
      customer: { fullName: 'Invitado sin stock', email: 'sin.stock@qa.local' },
    }).expect(409);
    expect(response.body.code).toBe('PRODUCT_OUT_OF_STOCK');
    expect(response.body.details).toMatchObject({
      productId: productLowStock.id,
      available: 1,
      requested: 2,
    });
  });

  it('un token expirado responde 409 con reason order_token_expired', async () => {
    await prisma.order.update({
      where: { id: orderId },
      data: { publicTokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const expired = await request(server).get(`${api}/storefront/orders/${orderToken}`).expect(409);
    expect(expired.body.code).toBe('VALIDATION_FAILED');
    expect(expired.body.details).toEqual({ reason: 'order_token_expired' });
  });

  it('claim: el dueño del email lo reclama, se reasigna a su cuenta y aparece en /me/orders', async () => {
    // Pedido reasignado a un Customer invitado distinto del de la cuenta: el claim
    // debe moverlo al Customer de la cuenta autenticada.
    const guestCustomer = await prisma.customer.create({
      data: {
        organizationId,
        type: 'PERSON',
        name: 'Invitada Checkout',
        email: customerA.email,
      },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: {
        customerId: guestCustomer.id,
        claimedAt: null,
        publicTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const claim = await customerAAgent
      .post(`${api}/storefront/orders/${orderToken}/claim`)
      .expect(200);
    expect(claim.body).toEqual({ orderId, claimed: true });

    const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.customerId).toBe(accountCustomerAId);
    expect(row.claimedAt).not.toBeNull();

    const mine = await customerAAgent.get(`${api}/me/orders`).expect(200);
    expect(mine.body.items.map((item: { id: string }) => item.id)).toContain(orderId);
    const detail = await customerAAgent.get(`${api}/me/orders/${orderId}`).expect(200);
    expect(detail.body).toMatchObject({
      id: orderId,
      number: orderNumber,
      totalMinor: '22600',
      status: 'PENDING_PAYMENT',
      customerId: accountCustomerAId,
    });
    expect(detail.body.items).toHaveLength(1);

    const claimedAudit = await prisma.auditLog.findFirst({
      where: { action: 'order.claimed', entityId: orderId },
    });
    expect(claimedAudit).not.toBeNull();
  });

  it('otro cliente no ve el pedido y el staff no tiene audiencia customer en /me', async () => {
    const other = await customerBAgent.get(`${api}/me/orders`).expect(200);
    expect(other.body.items.map((item: { id: string }) => item.id)).not.toContain(orderId);

    const foreign = await customerBAgent.get(`${api}/me/orders/${orderId}`).expect(404);
    expect(foreign.body.code).toBe('NOT_FOUND');

    const staffOnMe = await staffAgent.get(`${api}/me/orders`).expect(403);
    expect(staffOnMe.body.code).toBe('AUTH_WRONG_AUDIENCE');
    expect(staffOnMe.body.details).toEqual({ expected: 'customer', received: 'staff' });
  });

  it('claim con email distinto responde 404 y sin email de contacto 409 claim_email_missing', async () => {
    const guest = await checkout({
      catalogSlug,
      items: [{ productId: product11300.id, quantity: 1 }],
      customer: { fullName: 'Invitado Ajeno', email: 'ajeno@qa.local' },
    }).expect(201);

    const mismatch = await customerAAgent
      .post(`${api}/storefront/orders/${guest.body.token}/claim`)
      .expect(404);
    expect(mismatch.body.code).toBe('NOT_FOUND');

    const phoneOnly = await checkout({
      catalogSlug,
      items: [{ productId: product11300.id, quantity: 1 }],
      customer: { fullName: 'Invitado Teléfono', phone: '+506 7000 9999' },
    }).expect(201);

    const missing = await customerAAgent
      .post(`${api}/storefront/orders/${phoneOnly.body.token}/claim`)
      .expect(409);
    expect(missing.body.code).toBe('VALIDATION_FAILED');
    expect(missing.body.details).toEqual({ reason: 'claim_email_missing' });
  });

  it('cancelar el pedido guarda el motivo en cancelReason (deuda de ventas resuelta)', async () => {
    const response = await staffAgent
      .post(`${api}/orders/${orderId}/cancel`)
      .send({ reason: 'Cliente pidió revisar' })
      .expect(200);
    expect(response.body.status).toBe('CANCELLED');

    const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.cancelReason).toBe('Cliente pidió revisar');
    expect(row.notes).toBe('Dejar en portería');
  });

  it('Customer.type se persiste en columna y el invitado queda PERSON', async () => {
    const company = await staffAgent
      .post(`${api}/customers`)
      .send({
        type: 'COMPANY',
        fullName: 'Tienda Compradora S.A.',
        email: 'compras@tienda-qa.local',
        phone: '+506 2222 9999',
      })
      .expect(201);
    expect(company.body.type).toBe('COMPANY');

    const row = await prisma.customer.findUniqueOrThrow({ where: { id: company.body.id } });
    expect(row.type).toBe('COMPANY');

    const guest = await prisma.customer.findFirstOrThrow({
      where: { organizationId, email: 'ajeno@qa.local' },
    });
    expect(guest.type).toBe('PERSON');
  });
});
