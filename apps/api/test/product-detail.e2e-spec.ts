import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Product } from '@prisma/client';
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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Detalle y edición de producto (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let versionId: string;
  let archivedVersionId: string;
  let product: Product;
  let archivedProduct: Product;
  let adminStaff: StaffFixture;
  let vendedorStaff: StaffFixture;
  let aliadaStaff: StaffFixture;
  let adminAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginStaff>>;
  const imageKeys: string[] = [];

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    return agent;
  }

  async function createProduct(sku: string, version: string) {
    return prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: version,
        sku,
        name: `Producto ${sku}`,
        description: 'Descripción inicial',
        category: 'Despensa',
        brand: 'Demo',
        priceMinor: 6_000n,
        costMinor: 3_000n,
        currency: 'CRC',
        stock: 10,
        attributes: { medida: '1/4', material: 'Acero' },
      },
    });
  }

  beforeAll(async () => {
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Detalle Producto', slug: uniqueSlug('qa-prod'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    adminStaff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-prod-admin',
    });
    vendedorStaff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-prod-vendedor',
    });
    aliadaStaff = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-prod-aliada',
    });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo Detalle',
      slugPrefix: 'qa-prod-cat',
    });
    catalogId = catalog.catalogId;
    const version = await prisma.catalogVersion.create({
      data: {
        catalogId,
        versionNumber: 1,
        status: 'ACTIVE',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 1,
        createdByUserId: adminStaff.userId,
        activatedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    versionId = version.id;
    await prisma.catalog.update({ where: { id: catalogId }, data: { activeVersionId: versionId } });
    const archivedVersion = await prisma.catalogVersion.create({
      data: {
        catalogId,
        versionNumber: 2,
        status: 'ARCHIVED',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 1,
        createdByUserId: adminStaff.userId,
        archivedAt: new Date(),
      },
    });
    archivedVersionId = archivedVersion.id;

    product = await createProduct('DETAIL-1', versionId);
    archivedProduct = await createProduct('DETAIL-ARCH', archivedVersionId);
    const imageKey = `qa-product-detail/${Date.now()}.png`;
    await storage.putObject(imageKey, PNG, 'image/png');
    imageKeys.push(imageKey);
    await prisma.product.update({ where: { id: product.id }, data: { imageKey } });

    adminAgent = await loginStaff(adminStaff);
    vendedorAgent = await loginStaff(vendedorStaff);
    aliadaAgent = await loginStaff(aliadaStaff);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    for (const key of imageKeys) {
      await storage.removeObject(key).catch(() => undefined);
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    for (const fixture of [adminStaff, vendedorStaff, aliadaStaff]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('GET /products/:id devuelve detalle con imagen, atributos y costo (A-R6)', async () => {
    const response = await adminAgent.get(`${api}/products/${product.id}`).expect(200);
    expect(response.body).toMatchObject({
      id: product.id,
      catalogId,
      catalogVersionId: versionId,
      sku: 'DETAIL-1',
      priceMinor: '6000',
      costMinor: '3000',
      currency: 'CRC',
      stock: 10,
      attributes: { medida: '1/4', material: 'Acero' },
      catalogName: 'Catálogo Detalle',
      versionNumber: 1,
      versionStatus: 'ACTIVE',
    });
    expect(response.body.imageKey).toBeTruthy();
    expect(response.body.imageUrl).toBeTruthy();

    const image = await fetch(response.body.imageUrl as string);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toContain('image/png');
  });

  it('el vendedor ve el detalle pero sin costMinor (A-R6)', async () => {
    const response = await vendedorAgent.get(`${api}/products/${product.id}`).expect(200);
    expect(response.body).toMatchObject({ sku: 'DETAIL-1', costMinor: null });
    expect(response.body.attributes).toEqual({ medida: '1/4', material: 'Acero' });
  });

  it('el detalle de una versión archivada se puede consultar', async () => {
    const response = await adminAgent.get(`${api}/products/${archivedProduct.id}`).expect(200);
    expect(response.body).toMatchObject({ sku: 'DETAIL-ARCH', versionStatus: 'ARCHIVED' });
  });

  it('PATCH edita solo los campos enviados, audita y no toca SKU/versión/imagen', async () => {
    const before = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const response = await adminAgent
      .patch(`${api}/products/${product.id}`)
      .send({ name: 'Producto renombrado', priceMinor: 7_500, stock: 3 })
      .expect(200);
    expect(response.body).toMatchObject({
      name: 'Producto renombrado',
      priceMinor: '7500',
      stock: 3,
      sku: 'DETAIL-1',
      catalogVersionId: versionId,
    });
    expect(response.body.imageKey).toBe(before.imageKey);

    const detail = await adminAgent.get(`${api}/products/${product.id}`).expect(200);
    expect(detail.body).toMatchObject({ name: 'Producto renombrado', priceMinor: '7500' });

    const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'product.updated', entityId: product.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.before).toMatchObject({
      name: 'Producto DETAIL-1',
      priceMinor: '6000',
      stock: 10,
    });
    expect(audit?.after).toMatchObject({
      name: 'Producto renombrado',
      priceMinor: '7500',
      stock: 3,
    });
  });

  it('cuerpo vacío → 422 y versión archivada → 409', async () => {
    const empty = await adminAgent.patch(`${api}/products/${product.id}`).send({}).expect(422);
    expect(empty.body.code).toBe('VALIDATION_FAILED');

    const archived = await adminAgent
      .patch(`${api}/products/${archivedProduct.id}`)
      .send({ priceMinor: 9_000 })
      .expect(409);
    expect(archived.body.code).toBe('CATALOG_ARCHIVED');
    expect(archived.body.details).toMatchObject({ reason: 'version_not_editable' });
  });

  it('404 cross-org / inexistente y 403 sin product:write', async () => {
    const crossOrg = await aliadaAgent.get(`${api}/products/${product.id}`).expect(404);
    expect(crossOrg.body.code).toBe('NOT_FOUND');
    const crossPatch = await aliadaAgent
      .patch(`${api}/products/${product.id}`)
      .send({ priceMinor: 1000 })
      .expect(404);
    expect(crossPatch.body.code).toBe('NOT_FOUND');

    const missing = await adminAgent
      .get(`${api}/products/01920000-0000-7000-8000-000000009999`)
      .expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');

    const forbidden = await vendedorAgent
      .patch(`${api}/products/${product.id}`)
      .send({ priceMinor: 8_000 })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    expect(forbidden.body.details).toEqual({ missing: ['product:write'] });
  });
});
