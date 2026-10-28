import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/modules/storage/storage.service';
import {
  createCatalogFixture,
  createStaffFixture,
  deleteCatalogFixture,
  deleteUserFixture,
  uniqueSlug,
  type StaffFixture,
} from './helpers/fixtures';

const CSV =
  'SKU,Nombre,Precio,Cant.\nDOD-1,Martillo de acero,2500,10\nDOD-2,Destornillador,1500,5\n';

/**
 * DoD de F1 completo contra la API real: catálogo → importar CSV → activar →
 * cotización → PDF → aceptar → pedido → entregar.
 */
describe('DoD F1 completo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let staff: StaffFixture;
  let agent!: Awaited<ReturnType<typeof loginStaff>>;
  let catalogId = '';
  const createdCustomerIds: string[] = [];

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
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

    const slug = uniqueSlug('qa-dod');
    const organization = await prisma.organization.create({
      data: { name: 'QA DoD F1', slug, plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug: slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-dod-staff',
    });
    agent = await loginStaff(staff);
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
      const aggregateIds = [...quotes.map((quote) => quote.id), ...orders.map((order) => order.id)];
      await prisma.payment.deleteMany({ where: { organizationId } });
      await prisma.orderItem.deleteMany({ where: { order: { organizationId } } });
      await prisma.order.deleteMany({ where: { organizationId } });
      await prisma.quoteItem.deleteMany({ where: { quote: { organizationId } } });
      await prisma.quote.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.importRowIssue.deleteMany({
        where: { importJob: { catalogId: { in: catalogId ? [catalogId] : [] } } },
      });
      await prisma.importJob.deleteMany({
        where: { catalogId: { in: catalogId ? [catalogId] : [] } },
      });
      await prisma.importMappingTemplate.deleteMany({
        where: { catalogId: { in: catalogId ? [catalogId] : [] } },
      });
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: aggregateIds } } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('recorre catálogo → importación → activación → cotización → PDF → pedido → entrega', async () => {
    // 1. Catálogo
    const catalog = await agent.post(`${api}/catalogs`).send({ name: 'Catálogo DoD' }).expect(201);
    catalogId = catalog.body.id;

    // 2. Importar CSV de 2 productos y 3. activar la versión
    const imported = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(CSV, 'utf8'), 'dod.csv')
      .expect(201);
    expect(imported.body).toMatchObject({ importedRows: 2, quarantineRows: 0 });
    const versionId = imported.body.catalogVersionId as string;
    const activated = await agent
      .post(`${api}/catalogs/${catalogId}/versions/${versionId}/activate`)
      .expect(200);
    expect(activated.body.status).toBe('ACTIVE');

    const products = await agent
      .get(`${api}/products?catalogId=${catalogId}&versionId=${versionId}&limit=10`)
      .expect(200);
    expect(products.body.items).toHaveLength(2);
    const product = (
      products.body.items as Array<{ id: string; sku: string; priceMinor: string }>
    ).find((item) => item.sku === 'DOD-1')!;

    // 4. Cliente y 5. cotización con 2 unidades
    const customer = await agent
      .post(`${api}/customers`)
      .send({ fullName: 'Cliente DoD' })
      .expect(201);
    createdCustomerIds.push(customer.body.id);

    const quote = await agent
      .post(`${api}/quotes`)
      .send({
        catalogId,
        customerId: customer.body.id,
        items: [{ productId: product.id, quantity: 2 }],
      })
      .expect(201);
    expect(quote.body.number).toMatch(/^COT-/);
    expect(quote.body.status).toBe('DRAFT');
    const unitPrice = BigInt(product.priceMinor);
    expect(BigInt(quote.body.totalMinor as string)).toBeGreaterThanOrEqual(unitPrice * 2n);

    // 6. Enviar: genera el PDF de la cotización
    const sent = await agent.post(`${api}/quotes/${quote.body.id}/send`).expect(200);
    expect(sent.body.status).toBe('SENT');
    expect(sent.body.pdfUrl).toBeTruthy();
    const pdfResponse = await fetch(sent.body.pdfUrl as string);
    expect(pdfResponse.status).toBe(200);
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
    expect(pdfBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // 7. Aceptar y 8. convertir en pedido
    const accepted = await agent.post(`${api}/quotes/${quote.body.id}/accept`).expect(200);
    expect(accepted.body.status).toBe('ACCEPTED');

    const order = await agent.post(`${api}/quotes/${quote.body.id}/convert`).expect(201);
    expect(order.body.number).toMatch(/^PED-/);
    expect(order.body.status).toBe('PENDING_PAYMENT');
    expect(order.body.totalMinor).toBe(quote.body.totalMinor);

    // 9. Entregar
    const fulfilled = await agent.post(`${api}/orders/${order.body.id}/fulfill`).expect(200);
    expect(fulfilled.body.status).toBe('FULFILLED');

    // Verificación final del pedido y totales
    const detail = await agent.get(`${api}/orders/${order.body.id}`).expect(200);
    expect(detail.body).toMatchObject({
      status: 'FULFILLED',
      totalMinor: quote.body.totalMinor,
      currency: 'CRC',
    });
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.items[0]).toMatchObject({ quantity: 2, skuSnapshot: 'DOD-1' });

    const stored = await prisma.product.findFirst({
      where: { catalogVersionId: versionId, sku: 'DOD-1' },
    });
    expect(stored?.name).toBe('Martillo de acero');
  });
});
