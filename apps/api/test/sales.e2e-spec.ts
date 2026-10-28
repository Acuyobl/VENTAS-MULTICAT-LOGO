import { inflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { businessYear } from '../src/modules/sales/numbering';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';
import {
  createCatalogFixture,
  createCustomerFixture,
  createStaffFixture,
  deleteCatalogFixture,
  deleteUserFixture,
  type CustomerFixture,
  type StaffFixture,
} from './helpers/fixtures';

/** Texto de un PDF generado con pdf-lib (hex cp1252 dentro de streams inflados). */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const texts: string[] = [];
  let index = 0;
  while (true) {
    const start = raw.indexOf('stream', index);
    if (start === -1) break;
    let dataStart = start + 'stream'.length;
    if (raw[dataStart] === '\r') dataStart += 1;
    if (raw[dataStart] === '\n') dataStart += 1;
    const end = raw.indexOf('endstream', dataStart);
    if (end === -1) break;
    const chunk = buffer.subarray(dataStart, end);
    let content: string;
    try {
      content = inflateSync(chunk).toString('latin1');
    } catch {
      content = chunk.toString('latin1');
    }
    if (content.includes('BT')) {
      for (const match of content.matchAll(/<([0-9A-Fa-f]+)>/g)) {
        const hex = match[1] ?? '';
        if (hex.length % 2 === 0) texts.push(Buffer.from(hex, 'hex').toString('latin1'));
      }
    }
    index = end + 'endstream'.length;
  }
  return texts.join(' ').replace(/\u00a0/g, ' ');
}

describe('Ventas F1: clientes, cotizaciones con PDF y conversión a pedido (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let staff: StaffFixture;
  let financeStaff: StaffFixture;
  let aliadaStaff: StaffFixture;
  let customerUser: CustomerFixture;
  let catalogId: string;
  let activeVersionId: string;
  let archivedVersionId: string;
  let archivedCatalogId: string;
  let product11300: Product;
  let productLowStock: Product;
  let productArchived: Product;
  let customerId: string;
  let companyCustomerId: string;
  let quoteId: string;
  let quoteNumber: string;
  let orderId: string;
  let orderNumber: string;
  let staffAgent!: Awaited<ReturnType<typeof loginAs>>;
  let financeAgent!: Awaited<ReturnType<typeof loginAs>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginAs>>;
  let customerAgent!: Awaited<ReturnType<typeof loginAs>>;
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

  function createQuote(
    items: Array<{ productId: string; quantity: number; discountMinor?: bigint }>,
    overrides: Record<string, unknown> = {},
  ) {
    return staffAgent.post(`${api}/quotes`).send({ catalogId, customerId, items, ...overrides });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    server = app.getHttpServer();
    api = apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: {
        name: 'QA Ventas Org',
        slug: `qa-sales-${Date.now()}`,
        plan: 'STARTER',
      },
    });
    organizationId = organization.id;

    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-sales-staff',
    });
    financeStaff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'finanzas',
      emailPrefix: 'qa-sales-finanzas',
    });
    aliadaStaff = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-sales-aliada',
    });
    customerUser = await createCustomerFixture(prisma, { organizationSlug: 'demo' });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo QA Ventas',
      slugPrefix: 'qa-sales-catalog',
    });
    catalogId = catalog.catalogId;
    const archivedCatalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo QA archivado',
      slugPrefix: 'qa-sales-archived',
    });

    const activeVersion = await prisma.catalogVersion.create({
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
    activeVersionId = activeVersion.id;
    const archivedVersion = await prisma.catalogVersion.create({
      data: {
        catalogId,
        versionNumber: 2,
        status: 'ARCHIVED',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 1,
        createdByUserId: staff.userId,
        validatedAt: new Date(),
        archivedAt: new Date(),
      },
    });
    archivedVersionId = archivedVersion.id;

    await prisma.catalog.update({
      where: { id: catalogId },
      data: { activeVersionId },
    });

    product11300 = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: activeVersionId,
        sku: 'COT-113',
        name: 'Producto de ₡11.300',
        priceMinor: 11_300n,
        currency: 'CRC',
        stock: 10,
      },
    });
    productLowStock = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: activeVersionId,
        sku: 'COT-STOCK2',
        name: 'Producto con stock 2',
        priceMinor: 5_000n,
        currency: 'CRC',
        stock: 2,
      },
    });
    productArchived = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: archivedVersionId,
        sku: 'COT-ARCHIVED',
        name: 'Producto de versión archivada',
        priceMinor: 1_000n,
        currency: 'CRC',
        stock: 10,
      },
    });

    const archivedVersionOfCatalog = await prisma.catalogVersion.create({
      data: {
        catalogId: archivedCatalog.catalogId,
        versionNumber: 1,
        status: 'ARCHIVED',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 0,
        createdByUserId: staff.userId,
        archivedAt: new Date(),
      },
    });
    await prisma.catalog.update({
      where: { id: archivedCatalog.catalogId },
      data: { activeVersionId: archivedVersionOfCatalog.id },
    });
    archivedCatalogId = archivedCatalog.catalogId;

    staffAgent = await loginAs(staff, 'staff');
    financeAgent = await loginAs(financeStaff, 'staff');
    aliadaAgent = await loginAs(aliadaStaff, 'staff');
    customerAgent = await loginAs(customerUser, 'customer');
  });

  afterAll(async () => {
    if (prisma) {
      const quotes = await prisma.quote.findMany({
        where: { organizationId },
        select: { id: true, pdfKey: true },
      });
      for (const quote of quotes) {
        if (quote.pdfKey) await storage.removeDocument(quote.pdfKey).catch(() => undefined);
      }
      const orders = await prisma.order.findMany({
        where: { organizationId },
        select: { id: true },
      });
      const auditedIds = [...quotes.map((quote) => quote.id), ...orders.map((order) => order.id)];
      await prisma.payment.deleteMany({ where: { organizationId } });
      await prisma.order.deleteMany({ where: { organizationId } });
      await prisma.quote.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: auditedIds } } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (archivedCatalogId)
      await deleteCatalogFixture(prisma, archivedCatalogId).catch(() => undefined);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (financeStaff) await deleteUserFixture(prisma, financeStaff.userId);
    if (aliadaStaff) await deleteUserFixture(prisma, aliadaStaff.userId);
    if (customerUser) await deleteUserFixture(prisma, customerUser.userId);
    if (organizationId) {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (app) await app.close();
  });

  it('crea clientes (PERSON/COMPANY) y los busca por nombre y email', async () => {
    const person = await staffAgent
      .post(`${api}/customers`)
      .send({
        type: 'PERSON',
        fullName: 'María Solís Vega',
        phone: '+506 8000 1234',
        email: 'maria.solis.qa@ventascatalogo.local',
        idNumber: '1-2222-3333',
      })
      .expect(201);
    customerId = person.body.id;
    expect(person.body).toMatchObject({
      type: 'PERSON',
      fullName: 'María Solís Vega',
      phone: '+506 8000 1234',
      email: 'maria.solis.qa@ventascatalogo.local',
      idNumber: '1-2222-3333',
    });

    const company = await staffAgent
      .post(`${api}/customers`)
      .send({
        type: 'COMPANY',
        fullName: 'Distribuidora Ñandú S.A.',
        email: 'compras.qa@ventascatalogo.local',
        phone: '+506 2222 4444',
      })
      .expect(201);
    companyCustomerId = company.body.id;
    expect(company.body.type).toBe('COMPANY');

    const byName = await staffAgent.get(`${api}/customers`).query({ q: 'María' }).expect(200);
    expect(byName.body.items.map((item: { id: string }) => item.id)).toContain(customerId);
    expect(byName.body.items[0]).toMatchObject({ type: 'PERSON' });

    const byEmail = await staffAgent.get(`${api}/customers`).query({ q: 'compras.qa' }).expect(200);
    expect(byEmail.body.items.map((item: { id: string }) => item.id)).toContain(companyCustomerId);
    expect(byEmail.body.items[0].type).toBe('COMPANY');
  });

  it('crea una cotización con snapshot de precios y totales calculados', async () => {
    const response = await createQuote([{ productId: product11300.id, quantity: 2 }]).expect(201);

    const quote = response.body as {
      id: string;
      number: string;
      status: string;
      subtotalMinor: string;
      taxMinor: string;
      totalMinor: string;
      discountMinor: string;
      taxRateBp: number;
      taxIncluded: boolean;
      validUntil: string;
      pdfUrl: string | null;
      items: Array<Record<string, unknown>>;
    };

    quoteId = quote.id;
    quoteNumber = quote.number;

    expect(quote.number).toBe(`COT-${year}-000001`);
    expect(quote.status).toBe('DRAFT');
    expect(quote.subtotalMinor).toBe('20000');
    expect(quote.taxMinor).toBe('2600');
    expect(quote.totalMinor).toBe('22600');
    expect(quote.discountMinor).toBe('0');
    expect(quote.taxRateBp).toBe(1300);
    expect(quote.taxIncluded).toBe(true);
    expect(quote.pdfUrl).toBeNull();
    expect(quote.items).toHaveLength(1);
    expect(quote.items[0]).toMatchObject({
      skuSnapshot: 'COT-113',
      nameSnapshot: 'Producto de ₡11.300',
      unitPriceMinor: '11300',
      quantity: 2,
      discountMinor: '0',
      lineTotalMinor: '22600',
    });
    const validUntil = new Date(quote.validUntil).getTime();
    expect(validUntil).toBeGreaterThan(Date.now() + 14 * 24 * 60 * 60 * 1000);
  });

  it('lista y obtiene la cotización con sus ítems', async () => {
    const list = await staffAgent.get(`${api}/quotes`).query({ catalogId }).expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(quoteId);
    expect(list.body.nextCursor).toBeNull();

    const detail = await staffAgent.get(`${api}/quotes/${quoteId}`).expect(200);
    expect(detail.body).toMatchObject({
      id: quoteId,
      number: quoteNumber,
      customerId,
      customerName: 'María Solís Vega',
      catalogId,
    });
    expect(detail.body.items).toHaveLength(1);
  });

  it('send genera un PDF real con número, cliente y totales; /pdf devuelve la URL firmada', async () => {
    const sent = await staffAgent.post(`${api}/quotes/${quoteId}/send`).expect(200);
    expect(sent.body.status).toBe('SENT');
    expect(sent.body.pdfUrl).toMatch(/^http/);
    expect(sent.body.items).toHaveLength(1);

    const pdfResponse = await staffAgent.get(`${api}/quotes/${quoteId}/pdf`).expect(200);
    expect(pdfResponse.body.url).toMatch(/^http/);

    const download = await fetch(pdfResponse.body.url);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('application/pdf');
    const buffer = Buffer.from(await download.arrayBuffer());
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const text = extractPdfText(buffer);
    expect(text).toContain(quoteNumber);
    expect(text).toContain('María Solís Vega');
    expect(text).toContain('Documento no fiscal');
    expect(text).toContain('COT-113');
    expect(text).toContain('COTIZACIÓN');
  });

  it('accept: SENT→ACCEPTED y rechaza una cotización vencida con QUOTE_EXPIRED', async () => {
    const accepted = await staffAgent.post(`${api}/quotes/${quoteId}/accept`).expect(200);
    expect(accepted.body.status).toBe('ACCEPTED');

    const second = await createQuote([{ productId: product11300.id, quantity: 1 }]).expect(201);
    expect(second.body.number).toBe(`COT-${year}-000002`);
    await prisma.quote.update({
      where: { id: second.body.id },
      data: { validUntil: new Date(Date.now() - 60 * 60 * 1000) },
    });
    const expired = await staffAgent.post(`${api}/quotes/${second.body.id}/accept`).expect(409);
    expect(expired.body.code).toBe('QUOTE_EXPIRED');
  });

  it('convert crea el pedido con los mismos totales y sin recalcular', async () => {
    const response = await staffAgent.post(`${api}/quotes/${quoteId}/convert`).expect(201);
    const order = response.body as {
      id: string;
      number: string;
      status: string;
      quoteId: string;
      subtotalMinor: string;
      taxMinor: string;
      totalMinor: string;
      paidMinor: string;
      items: Array<Record<string, unknown>>;
    };
    orderId = order.id;
    orderNumber = order.number;

    expect(order.number).toBe(`PED-${year}-000001`);
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.quoteId).toBe(quoteId);
    expect(order.subtotalMinor).toBe('20000');
    expect(order.taxMinor).toBe('2600');
    expect(order.totalMinor).toBe('22600');
    expect(order.paidMinor).toBe('0');
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      skuSnapshot: 'COT-113',
      quantity: 2,
      lineTotalMinor: '22600',
    });

    const quoteDetail = await staffAgent.get(`${api}/quotes/${quoteId}`).expect(200);
    expect(quoteDetail.body.status).toBe('CONVERTED');

    const orders = await staffAgent.get(`${api}/orders`).query({ catalogId }).expect(200);
    expect(orders.body.items.map((item: { id: string }) => item.id)).toContain(orderId);
    const detail = await staffAgent.get(`${api}/orders/${orderId}`).expect(200);
    expect(detail.body).toMatchObject({ id: orderId, number: orderNumber, quoteId });
  });

  it('una segunda conversión responde 409 QUOTE_ALREADY_CONVERTED con details.orderId', async () => {
    const response = await staffAgent.post(`${api}/quotes/${quoteId}/convert`).expect(409);
    expect(response.body.code).toBe('QUOTE_ALREADY_CONVERTED');
    expect(response.body.details).toMatchObject({ orderId });
  });

  it('valida stock, versión archivada, catálogo archivado y validez', async () => {
    const outOfStock = await createQuote([{ productId: productLowStock.id, quantity: 3 }]).expect(
      409,
    );
    expect(outOfStock.body.code).toBe('PRODUCT_OUT_OF_STOCK');
    expect(outOfStock.body.details).toMatchObject({
      productId: productLowStock.id,
      available: 2,
      requested: 3,
    });

    const archivedProduct = await createQuote([
      { productId: productArchived.id, quantity: 1 },
    ]).expect(409);
    expect(archivedProduct.body.code).toBe('PRODUCT_NOT_IN_ACTIVE_VERSION');

    const archivedCatalog = await staffAgent
      .post(`${api}/quotes`)
      .send({
        catalogId: archivedCatalogId,
        customerId,
        items: [{ productId: product11300.id, quantity: 1 }],
      })
      .expect(409);
    expect(archivedCatalog.body.code).toBe('CATALOG_ARCHIVED');

    const pastDate = await createQuote([{ productId: product11300.id, quantity: 1 }], {
      validUntil: '2020-01-01T00:00:00.000Z',
    }).expect(400);
    expect(pastDate.body.code).toBe('VALIDATION_FAILED');

    const tooFar = await createQuote([{ productId: product11300.id, quantity: 1 }], {
      validUntil: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
    }).expect(400);
    expect(tooFar.body.code).toBe('VALIDATION_FAILED');
  });

  it('403 sin permiso, 403 de audiencia y 404 para otra organización', async () => {
    const forbidden = await financeAgent
      .post(`${api}/quotes`)
      .send({ catalogId, customerId, items: [{ productId: product11300.id, quantity: 1 }] })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    expect(forbidden.body.details).toEqual({ missing: ['quote:create'] });

    const wrongAudience = await customerAgent.get(`${api}/quotes`).expect(403);
    expect(wrongAudience.body.code).toBe('AUTH_WRONG_AUDIENCE');

    const foreignQuote = await aliadaAgent.get(`${api}/quotes/${quoteId}`).expect(404);
    expect(foreignQuote.body.code).toBe('NOT_FOUND');

    const foreignOrder = await aliadaAgent.get(`${api}/orders/${orderId}`).expect(404);
    expect(foreignOrder.body.code).toBe('NOT_FOUND');

    const foreignPdf = await aliadaAgent.get(`${api}/quotes/${quoteId}/pdf`).expect(404);
    expect(foreignPdf.body.code).toBe('NOT_FOUND');
  });

  it('cancel bloquea con pagos (ORDER_HAS_PAYMENTS) y fulfill valida la máquina de estados', async () => {
    await prisma.payment.create({
      data: {
        organizationId,
        catalogId,
        provider: 'STRIPE',
        status: 'SUCCEEDED',
        amountMinor: 22_600n,
        currency: 'CRC',
        order: { connect: { id: orderId } },
        catalogVersion: { connect: { id: activeVersionId } },
      },
    });

    const withPayments = await staffAgent
      .post(`${api}/orders/${orderId}/cancel`)
      .send({ reason: 'Cliente desistió' })
      .expect(409);
    expect(withPayments.body.code).toBe('ORDER_HAS_PAYMENTS');
    expect(withPayments.body.details).toMatchObject({ orderId });

    const fulfilled = await staffAgent.post(`${api}/orders/${orderId}/fulfill`).expect(200);
    expect(fulfilled.body.status).toBe('FULFILLED');

    const invalid = await staffAgent
      .post(`${api}/orders/${orderId}/cancel`)
      .send({ reason: 'Ya cumplido' })
      .expect(409);
    expect(invalid.body.code).toBe('ORDER_INVALID_TRANSITION');
    expect(invalid.body.details).toMatchObject({ from: 'FULFILLED', to: 'CANCELLED' });
  });

  it('un pedido sin pagos se puede cancelar y queda auditado; sin permiso responde 403', async () => {
    const third = await createQuote([{ productId: product11300.id, quantity: 1 }]).expect(201);
    await staffAgent.post(`${api}/quotes/${third.body.id}/send`).expect(200);
    await staffAgent.post(`${api}/quotes/${third.body.id}/accept`).expect(200);
    const converted = await staffAgent.post(`${api}/quotes/${third.body.id}/convert`).expect(201);

    const cancelled = await staffAgent
      .post(`${api}/orders/${converted.body.id}/cancel`)
      .send({ reason: 'Prueba de cancelación' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.notes).toContain('Prueba de cancelación');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'order.cancelled', entityId: converted.body.id },
    });
    expect(audit).not.toBeNull();

    // finanzas no tiene order:cancel ni order:create
    const forbiddenCancel = await financeAgent
      .post(`${api}/orders/${converted.body.id}/cancel`)
      .send({ reason: 'Sin permiso' })
      .expect(403);
    expect(forbiddenCancel.body.code).toBe('FORBIDDEN');
    expect(forbiddenCancel.body.details).toEqual({ missing: ['order:cancel'] });
  });

  it('deja el evento outbox y la auditoría de la cotización creada', async () => {
    const outbox = await prisma.outboxEvent.findFirst({
      where: { aggregateId: quoteId, eventType: 'quote.created' },
    });
    expect(outbox).not.toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: {
        entityId: quoteId,
        action: { in: ['quote.created', 'quote.sent', 'quote.accepted', 'quote.converted'] },
      },
      select: { action: true },
    });
    expect(new Set(audits.map((audit) => audit.action))).toEqual(
      new Set(['quote.created', 'quote.sent', 'quote.accepted', 'quote.converted']),
    );
  });
});
