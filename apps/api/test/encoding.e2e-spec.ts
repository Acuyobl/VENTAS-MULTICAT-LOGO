import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  deleteCatalogFixture,
  createStaffFixture,
  deleteUserFixture,
  uniqueSlug,
  type StaffFixture,
} from './helpers/fixtures';

const HEADERS = 'SKU,Nombre,Precio';

describe('Encoding: guardia U+FFFD e importación Windows-1252 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let staff: StaffFixture;
  let agent!: Awaited<ReturnType<typeof loginStaff>>;
  const createdCatalogIds: string[] = [];

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
      data: { name: 'QA Encoding', slug: uniqueSlug('qa-encoding'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-encoding-staff',
    });
    agent = await loginStaff(staff);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.importRowIssue.deleteMany({
        where: { importJob: { catalogId: { in: createdCatalogIds } } },
      });
      await prisma.importJob.deleteMany({ where: { catalogId: { in: createdCatalogIds } } });
      await prisma.importMappingTemplate.deleteMany({
        where: { catalogId: { in: createdCatalogIds } },
      });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    for (const id of createdCatalogIds) {
      await deleteCatalogFixture(prisma, id).catch(() => undefined);
    }
    if (prisma) await prisma.customer.deleteMany({ where: { organizationId } });
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('rechaza body con U+FFFD en catálogo y cliente (422 invalid_encoding + path)', async () => {
    const catalog = await agent
      .post(`${api}/catalogs`)
      .send({ name: 'Ferreter\uFFFDa' })
      .expect(422);
    expect(catalog.body.code).toBe('VALIDATION_FAILED');
    expect(catalog.body.details).toMatchObject({ reason: 'invalid_encoding', path: 'name' });

    const customer = await agent
      .post(`${api}/customers`)
      .send({ fullName: 'Mar\uFFFDa WhatsApp', email: `qa-enc-${Date.now()}@qa.local` })
      .expect(422);
    expect(customer.body.code).toBe('VALIDATION_FAILED');
    expect(customer.body.details).toMatchObject({
      reason: 'invalid_encoding',
      path: 'fullName',
    });
  });

  it('un body válido sigue funcionando y crea el catálogo', async () => {
    const created = await agent
      .post(`${api}/catalogs`)
      .send({ name: 'Ferretería Central' })
      .expect(201);
    catalogId = created.body.id;
    createdCatalogIds.push(catalogId);
    expect(created.body).toMatchObject({ name: 'Ferretería Central' });
  });

  it('importa CSV en Windows-1252 y guarda "café" correctamente', async () => {
    const csv = `${HEADERS}\nLAT-1,café,1000\n`;
    const latin1 = Buffer.from(csv, 'latin1');

    const imported = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', latin1, 'productos-latin1.csv')
      .expect(201);
    expect(imported.body).toMatchObject({ importedRows: 1, quarantineRows: 0 });

    const products = await agent
      .get(
        `${api}/products?catalogId=${catalogId}&versionId=${imported.body.catalogVersionId}&limit=10`,
      )
      .expect(200);
    const row = (products.body.items as Array<{ sku: string; name: string }>).find(
      (item) => item.sku === 'LAT-1',
    );
    expect(row?.name).toBe('café');
  });

  it('un CSV UTF-8 con U+FFFD va a cuarentena y no se guarda el carácter', async () => {
    const csv = `${HEADERS}\nBAD-1,Ferreter\uFFFDa,1000\n`;
    const imported = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(csv, 'utf8'), 'productos-corruptos.csv')
      .expect(201);

    expect(imported.body).toMatchObject({ importedRows: 0, quarantineRows: 1 });
    expect(imported.body.issues).toHaveLength(1);
    expect(imported.body.issues[0]).toMatchObject({
      code: 'INVALID_TEXT_ENCODING',
      severity: 'error',
    });

    const stored = await prisma.product.findMany({
      where: { catalogVersionId: imported.body.catalogVersionId },
      select: { name: true },
    });
    expect(stored).toHaveLength(0);
    expect(stored.some((product) => product.name.includes('\uFFFD'))).toBe(false);
  });
});
