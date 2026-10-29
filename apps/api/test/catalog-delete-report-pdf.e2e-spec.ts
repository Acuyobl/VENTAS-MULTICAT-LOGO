import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createStaffFixture,
  deleteCatalogFixture,
  deleteUserFixture,
  uniqueSlug,
  type StaffFixture,
} from './helpers/fixtures';

const CSV = 'SKU,Nombre,Precio\nDEL-1,Martillo,2500\n';

describe('Borrar catálogo y PDF financiero (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogAdmin: StaffFixture;
  let finanzas: StaffFixture;
  let vendedor: StaffFixture;
  let aliadaAdmin: StaffFixture;
  let adminAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let financeAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginStaff>>;
  const createdCatalogIds: string[] = [];
  const createdExpenseIds: string[] = [];
  const createdCustomerIds: string[] = [];

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    return agent;
  }

  async function createAndActivateCatalog(
    name: string,
  ): Promise<{ catalogId: string; slug: string }> {
    const created = await adminAgent.post(`${api}/catalogs`).send({ name }).expect(201);
    createdCatalogIds.push(created.body.id);
    const imported = await adminAgent
      .post(`${api}/catalogs/${created.body.id}/imports`)
      .attach('file', Buffer.from(CSV, 'utf8'), 'productos.csv')
      .expect(201);
    await adminAgent
      .post(
        `${api}/catalogs/${created.body.id}/versions/${imported.body.catalogVersionId}/activate`,
      )
      .expect(200);
    return { catalogId: created.body.id, slug: created.body.slug as string };
  }

  beforeAll(async () => {
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const slug = uniqueSlug('qa-del-cat');
    const organization = await prisma.organization.create({
      data: { name: 'QA Borrar Catálogo', slug, plan: 'STARTER' },
    });
    organizationId = organization.id;
    catalogAdmin = await createStaffFixture(prisma, {
      organizationSlug: slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-del-admin',
    });
    finanzas = await createStaffFixture(prisma, {
      organizationSlug: slug,
      roleKey: 'finanzas',
      emailPrefix: 'qa-del-fin',
    });
    vendedor = await createStaffFixture(prisma, {
      organizationSlug: slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-del-vend',
    });
    aliadaAdmin = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-del-aliada',
    });
    adminAgent = await loginStaff(catalogAdmin);
    financeAgent = await loginStaff(finanzas);
    vendedorAgent = await loginStaff(vendedor);
    aliadaAgent = await loginStaff(aliadaAdmin);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.orderItem.deleteMany({ where: { order: { organizationId } } });
      await prisma.order.deleteMany({ where: { organizationId } });
      await prisma.expense.deleteMany({ where: { organizationId } });
      await prisma.importRowIssue.deleteMany({
        where: { importJob: { catalogId: { in: createdCatalogIds } } },
      });
      await prisma.importJob.deleteMany({ where: { catalogId: { in: createdCatalogIds } } });
      await prisma.importMappingTemplate.deleteMany({
        where: { catalogId: { in: createdCatalogIds } },
      });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
    }
    for (const id of createdCatalogIds) {
      await deleteCatalogFixture(prisma, id).catch(() => undefined);
    }
    for (const fixture of [catalogAdmin, finanzas, vendedor, aliadaAdmin]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('DELETE /catalogs/:id hace soft delete y el público da 404', async () => {
    const { catalogId, slug } = await createAndActivateCatalog('Catálogo a borrar');
    await adminAgent.get(`${api}/catalogs/public/${slug}`).expect(200);

    await adminAgent.delete(`${api}/catalogs/${catalogId}`).expect(204);

    const list = await adminAgent.get(`${api}/catalogs`).expect(200);
    expect(
      (list.body.items as Array<{ id: string }>).some((catalog) => catalog.id === catalogId),
    ).toBe(false);

    const publicResponse = await adminAgent.get(`${api}/catalogs/public/${slug}`).expect(404);
    expect(publicResponse.body.code).toBe('CATALOG_NOT_FOUND');

    const stored = await prisma.catalog.findUniqueOrThrow({ where: { id: catalogId } });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.activeVersionId).toBeNull();
    const versions = await prisma.catalogVersion.findMany({ where: { catalogId } });
    expect(versions.every((version) => version.status === 'ARCHIVED')).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'catalog.deleted', entityId: catalogId },
    });
    expect(audit).not.toBeNull();
  });

  it('409 catalog_has_open_orders si hay pedidos abiertos', async () => {
    const { catalogId } = await createAndActivateCatalog('Catálogo con pedido abierto');
    const catalog = await prisma.catalog.findUniqueOrThrow({ where: { id: catalogId } });
    const customer = await adminAgent
      .post(`${api}/customers`)
      .send({ fullName: 'Cliente Con Pedido' })
      .expect(201);
    createdCustomerIds.push(customer.body.id);
    const version = await prisma.catalogVersion.findFirstOrThrow({
      where: { catalogId, status: 'ACTIVE' },
    });
    await prisma.order.create({
      data: {
        organizationId,
        catalogId,
        catalogVersionId: version.id,
        customerId: customer.body.id,
        number: `QA-${Date.now()}`,
        status: 'PAID',
        currency: 'CRC',
        subtotalMinor: 2500n,
        totalMinor: 2500n,
        paidMinor: 2500n,
      },
    });
    expect(catalog.activeVersionId).toBe(version.id);

    const response = await adminAgent.delete(`${api}/catalogs/${catalogId}`).expect(409);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: 'catalog_has_open_orders', openOrders: 1 },
    });
  });

  it('404 cross-org y 403 sin catalog:write', async () => {
    const { catalogId } = await createAndActivateCatalog('Catálogo ajeno');
    const cross = await aliadaAgent.delete(`${api}/catalogs/${catalogId}`).expect(404);
    expect(cross.body.code).toBe('NOT_FOUND');
    const forbidden = await vendedorAgent.delete(`${api}/catalogs/${catalogId}`).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('GET /reports/finance/pdf devuelve un PDF con nombre y audita el export', async () => {
    const { catalogId: expenseCatalogId } = await createAndActivateCatalog('Catálogo gastos');
    const expense = await financeAgent.post(`${api}/expenses`).send({
      catalogId: expenseCatalogId,
      category: 'MARKETING',
      description: 'Gasto QA para PDF',
      amountMinor: 5000,
      incurredAt: '2026-10-15T12:00:00.000Z',
    });
    if (expense.status !== 201) {
      process.stderr.write(`EXPENSE_BODY ${expense.status} ${JSON.stringify(expense.body)}\n`);
    }
    expect(expense.status).toBe(201);
    createdExpenseIds.push(expense.body.id);

    const response = await financeAgent
      .get(`${api}/reports/finance/pdf?from=2026-10-01&to=2026-10-31`)
      .expect(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="reporte-financiero-2026-10-01-2026-10-31.pdf"',
    );
    expect(response.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'report.exported', organizationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after).toMatchObject({
      format: 'pdf',
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  it('PDF: rango inválido 422, 403 sin finance:read y cross-org no aplica', async () => {
    const invalid = await financeAgent
      .get(`${api}/reports/finance/pdf?from=2026-10-31&to=2026-10-01`)
      .expect(422);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');

    const forbidden = await vendedorAgent
      .get(`${api}/reports/finance/pdf?from=2026-10-01&to=2026-10-31`)
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });
});
