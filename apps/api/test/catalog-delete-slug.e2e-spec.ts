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

describe('Borrar catálogo libera el slug (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let staff: StaffFixture;
  let agent!: Awaited<ReturnType<typeof loginStaff>>;
  const createdCatalogIds: string[] = [];

  const ORIGINAL_SLUG = uniqueSlug('qa-ferreteria');

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
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Slug Libre', slug: uniqueSlug('qa-slug'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-slug-staff',
    });
    agent = await loginStaff(staff);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.orderItem.deleteMany({ where: { order: { organizationId } } });
      await prisma.order.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    for (const id of createdCatalogIds) {
      await deleteCatalogFixture(prisma, id).catch(() => undefined);
    }
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('crear A → DELETE → crear B con el mismo slug → 201; slug viejo 404', async () => {
    const first = await agent
      .post(`${api}/catalogs`)
      .send({ name: 'Ferretería Central', slug: ORIGINAL_SLUG })
      .expect(201);
    createdCatalogIds.push(first.body.id);
    expect(first.body.slug).toBe(ORIGINAL_SLUG);

    await agent.delete(`${api}/catalogs/${first.body.id}`).expect(204);

    const stored = await prisma.catalog.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.slug).not.toBe(ORIGINAL_SLUG);
    expect(stored.slug).toMatch(/-eliminado-[a-z0-9]+$/);
    expect(stored.slug.length).toBeLessThanOrEqual(80);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'catalog.deleted', entityId: first.body.id },
    });
    expect(audit?.before).toMatchObject({ slug: ORIGINAL_SLUG });
    expect(audit?.after).toMatchObject({ slug: stored.slug });

    const recreated = await agent
      .post(`${api}/catalogs`)
      .send({ name: 'Ferretería Central', slug: ORIGINAL_SLUG })
      .expect(201);
    createdCatalogIds.push(recreated.body.id);
    expect(recreated.body.slug).toBe(ORIGINAL_SLUG);
    expect(recreated.body.id).not.toBe(first.body.id);

    const list = await agent.get(`${api}/catalogs`).expect(200);
    const ids = (list.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(recreated.body.id);
    expect(ids).not.toContain(first.body.id);

    // El catálogo borrado y su slug renombrado no son públicos.
    await agent.get(`${api}/catalogs/public/${ORIGINAL_SLUG}`).expect(404);
    await agent.get(`${api}/catalogs/public/${stored.slug}`).expect(404);

    // Segundo DELETE del ya borrado → 404.
    await agent.delete(`${api}/catalogs/${first.body.id}`).expect(404);
  });

  it('409 con pedido abierto no borra ni renombra el slug', async () => {
    const catalog = await agent
      .post(`${api}/catalogs`)
      .send({ name: 'Catálogo con pedido', slug: uniqueSlug('qa-slug-order') })
      .expect(201);
    createdCatalogIds.push(catalog.body.id);
    const version = await prisma.catalogVersion.create({
      data: {
        catalogId: catalog.body.id,
        versionNumber: 1,
        status: 'ACTIVE',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 0,
        createdByUserId: staff.userId,
        activatedAt: new Date(),
      },
    });
    await prisma.catalog.update({
      where: { id: catalog.body.id },
      data: { activeVersionId: version.id },
    });
    const customer = await agent
      .post(`${api}/customers`)
      .send({ fullName: 'Cliente Pedido Abierto' })
      .expect(201);
    await prisma.order.create({
      data: {
        organizationId,
        catalogId: catalog.body.id,
        catalogVersionId: version.id,
        customerId: customer.body.id,
        number: `QA-${Date.now()}`,
        status: 'PAID',
        currency: 'CRC',
        subtotalMinor: 1000n,
        totalMinor: 1000n,
        paidMinor: 1000n,
      },
    });

    const response = await agent.delete(`${api}/catalogs/${catalog.body.id}`).expect(409);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: 'catalog_has_open_orders', openOrders: 1 },
    });

    const stored = await prisma.catalog.findUniqueOrThrow({ where: { id: catalog.body.id } });
    expect(stored.deletedAt).toBeNull();
    expect(stored.slug).toBe(catalog.body.slug);
  });
});
