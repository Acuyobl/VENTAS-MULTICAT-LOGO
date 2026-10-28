import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';
import {
  createCatalogFixture,
  createStaffFixture,
  deleteCatalogFixture,
  deleteUserFixture,
  requireOrgId,
  type CatalogFixture,
  type StaffFixture,
} from './helpers/fixtures';

/** PNG 1x1 transparente real (89 bytes). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF8FAJ5zE/8f2o9GAAAAAElFTkSuQmCC',
  'base64',
);

describe('Imágenes de producto: subida, URLs firmadas, público e importación (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let staff: StaffFixture;
  let vendor: StaffFixture;
  let aliadaStaff: StaffFixture;
  let catalog: CatalogFixture;
  let importCatalog: CatalogFixture;
  let staffAgent!: Awaited<ReturnType<typeof loginAs>>;
  let vendorAgent!: Awaited<ReturnType<typeof loginAs>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginAs>>;
  let versionId: string;
  let productIds: string[] = [];
  let importVersionId: string | undefined;
  let imageServer: Server;
  let imageServerPort = 0;

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

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    server = app.getHttpServer();
    api = apiBaseUrl(app);

    const demoOrgId = await requireOrgId(prisma, 'demo');
    staff = await createStaffFixture(prisma, {
      organizationSlug: 'demo',
      roleKey: 'catalog_admin',
      emailPrefix: 'img-staff',
    });
    vendor = await createStaffFixture(prisma, {
      organizationSlug: 'demo',
      roleKey: 'vendedor',
      emailPrefix: 'img-vendor',
    });
    aliadaStaff = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'catalog_admin',
      emailPrefix: 'img-aliada',
    });

    catalog = await createCatalogFixture(prisma, {
      organizationId: demoOrgId,
      name: 'Catálogo QA imágenes',
      slugPrefix: 'qa-images',
    });
    importCatalog = await createCatalogFixture(prisma, {
      organizationId: demoOrgId,
      name: 'Catálogo QA imágenes import',
      slugPrefix: 'qa-images-import',
    });

    const version = await prisma.catalogVersion.create({
      data: {
        catalogId: catalog.catalogId,
        versionNumber: 1,
        status: 'ACTIVE',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 3,
        createdByUserId: staff.userId,
        activatedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    versionId = version.id;

    const products = await Promise.all(
      ['IMG-001', 'IMG-002', 'IMG-003'].map((sku, index) =>
        prisma.product.create({
          data: {
            catalogId: catalog.catalogId,
            catalogVersionId: version.id,
            sku,
            name: `Producto con imagen ${index + 1}`,
            priceMinor: BigInt(1_000 + index * 500),
            currency: 'CRC',
            stock: 5,
          },
        }),
      ),
    );
    productIds = products.map((product) => product.id);
    await prisma.catalog.update({
      where: { id: catalog.catalogId },
      data: { activeVersionId: version.id },
    });

    staffAgent = await loginAs(staff, 'staff');
    vendorAgent = await loginAs(vendor, 'staff');
    aliadaAgent = await loginAs(aliadaStaff, 'staff');

    imageServer = createServer((req, res) => {
      if (req.url === '/img.png') {
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': String(PNG_1X1.length),
        });
        res.end(PNG_1X1);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('no encontrado');
    });
    await new Promise<void>((resolve) => imageServer.listen(0, '127.0.0.1', resolve));
    imageServerPort = (imageServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    // Borra los objetos de imagen creados (productos + importación) best-effort.
    if (prisma) {
      const versions = [versionId, importVersionId].filter((id): id is string => Boolean(id));
      const products = await prisma.product.findMany({
        where: { catalogVersionId: { in: versions }, imageKey: { not: null } },
        select: { imageKey: true },
      });
      for (const product of products) {
        if (product.imageKey) await storage.removeObject(product.imageKey).catch(() => undefined);
      }
    }
    if (imageServer) await new Promise<void>((resolve) => imageServer.close(() => resolve()));
    if (catalog) await deleteCatalogFixture(prisma, catalog.catalogId);
    if (importCatalog) await deleteCatalogFixture(prisma, importCatalog.catalogId);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (vendor) await deleteUserFixture(prisma, vendor.userId);
    if (aliadaStaff) await deleteUserFixture(prisma, aliadaStaff.userId);
    if (app) await app.close();
  });

  it('sube un PNG, devuelve imageKey + imageUrl firmada y la imagen se descarga', async () => {
    const response = await staffAgent
      .post(`${api}/products/${productIds[0]}/image`)
      .attach('file', PNG_1X1, 'foto.png')
      .expect(201);

    const keyPattern = new RegExp(
      `^products/${catalog.catalogId}/${versionId}/${productIds[0]}-[a-f0-9]{12}\\.png$`,
    );
    expect(response.body.imageKey).toMatch(keyPattern);
    expect(response.body.imageUrl).toMatch(/^http:\/\/localhost:9000\/vc-products\//);

    const download = await fetch(response.body.imageUrl);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('image/png');
  });

  it('GET /products y GET /catalogs/public/:slug devuelven imageUrl firmada', async () => {
    const list = await staffAgent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId, limit: 100 })
      .expect(200);
    const item = list.body.items.find((product: { id: string }) => product.id === productIds[0]);
    expect(item.imageKey).toMatch(/^products\//);
    expect(item.imageUrl).toMatch(/^http:\/\/localhost:9000\/vc-products\//);

    const publicCatalog = await request(server)
      .get(`${api}/catalogs/public/${catalog.slug}`)
      .expect(200);
    const publicProduct = publicCatalog.body.products.find(
      (product: { id: string }) => product.id === productIds[0],
    );
    expect(publicProduct.imageKey).toMatch(/^products\//);
    expect(publicProduct.imageUrl).toMatch(/^http:\/\/localhost:9000\/vc-products\//);

    const publicDownload = await fetch(publicProduct.imageUrl);
    expect(publicDownload.status).toBe(200);
  });

  it('reemplaza la imagen y borra el objeto anterior (best-effort)', async () => {
    const first = await prisma.product.findUniqueOrThrow({ where: { id: productIds[1] } });
    const upload = await staffAgent
      .post(`${api}/products/${productIds[1]}/image`)
      .attach('file', PNG_1X1, 'uno.png')
      .expect(201);
    expect(first.imageKey).toBeNull();

    const replacement = await staffAgent
      .post(`${api}/products/${productIds[1]}/image`)
      .attach('file', PNG_2X2, 'dos.png')
      .expect(201);
    expect(replacement.body.imageKey).not.toBe(upload.body.imageKey);

    const oldDownload = await fetch(upload.body.imageUrl);
    expect(oldDownload.status).toBeGreaterThanOrEqual(400);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productIds[1] } });
    expect(product.imageKey).toBe(replacement.body.imageKey);
  });

  it('DELETE /products/:id/image limpia imageKey y la URL deja de funcionar', async () => {
    const before = await staffAgent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId, limit: 100 })
      .expect(200);
    const item = before.body.items.find((product: { id: string }) => product.id === productIds[1]);

    const deleted = await staffAgent.delete(`${api}/products/${productIds[1]}/image`).expect(200);
    expect(deleted.body).toEqual({ imageKey: null });

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productIds[1] } });
    expect(product.imageKey).toBeNull();

    const after = await staffAgent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId, limit: 100 })
      .expect(200);
    const afterItem = after.body.items.find((p: { id: string }) => p.id === productIds[1]);
    expect(afterItem.imageUrl).toBeNull();

    const staleDownload = await fetch(item.imageUrl);
    expect(staleDownload.status).toBeGreaterThanOrEqual(400);
  });

  it('un vendedor sin product:write recibe 403 y un producto ajeno 404', async () => {
    const forbidden = await vendorAgent
      .post(`${api}/products/${productIds[2]}/image`)
      .attach('file', PNG_1X1, 'foto.png')
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    expect(forbidden.body.details).toEqual({ missing: ['product:write'] });

    const forbiddenDelete = await vendorAgent
      .delete(`${api}/products/${productIds[2]}/image`)
      .expect(403);
    expect(forbiddenDelete.body.code).toBe('FORBIDDEN');

    const foreignUpload = await aliadaAgent
      .post(`${api}/products/${productIds[0]}/image`)
      .attach('file', PNG_1X1, 'foto.png')
      .expect(404);
    expect(foreignUpload.body.code).toBe('NOT_FOUND');

    const foreignDelete = await aliadaAgent
      .delete(`${api}/products/${productIds[0]}/image`)
      .expect(404);
    expect(foreignDelete.body.code).toBe('NOT_FOUND');
  });

  it('rechaza archivos vacíos, >5 MB o con tipo no permitido (400)', async () => {
    const empty = await staffAgent
      .post(`${api}/products/${productIds[2]}/image`)
      .attach('file', Buffer.alloc(0), 'vacio.png')
      .expect(400);
    expect(empty.body.code).toBe('VALIDATION_FAILED');

    const unsupported = await staffAgent
      .post(`${api}/products/${productIds[2]}/image`)
      .attach('file', Buffer.from('no soy una imagen'), 'nota.txt')
      .expect(400);
    expect(unsupported.body.code).toBe('VALIDATION_FAILED');
    expect(unsupported.body.details).toMatchObject({ reason: 'unsupported_type' });

    const oversized = await staffAgent
      .post(`${api}/products/${productIds[2]}/image`)
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 0x89), 'grande.png')
      .expect(400);
    expect(oversized.body.code).toBe('VALIDATION_FAILED');
    expect(oversized.body.details).toMatchObject({ reason: 'too_large' });
  });

  it('importa imágenes por URL: la accesible sube a MinIO y la rota deja warning sin bloquear', async () => {
    const csv = [
      'SKU,Nombre,Precio,Imagen',
      `IMG-URL-1,Producto con URL,1000,http://127.0.0.1:${imageServerPort}/img.png`,
      `IMG-BROKEN-1,Producto con URL rota,2000,http://127.0.0.1:${imageServerPort}/missing.png`,
      'IMG-REL-1,Producto con imagen relativa,3000,img/local.png',
    ].join('\n');

    const response = await staffAgent
      .post(`${api}/catalogs/${importCatalog.catalogId}/imports`)
      .attach('file', Buffer.from(csv, 'utf8'), 'imagenes.csv')
      .expect(201);

    expect(response.body).toMatchObject({
      importedRows: 3,
      quarantineRows: 0,
      totalRows: 3,
    });
    importVersionId = response.body.catalogVersionId;

    const warnings = response.body.issues as Array<{
      code: string;
      severity: string;
      rowNumber: number;
    }>;
    expect(warnings.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(warnings.map((issue) => issue.code).sort()).toEqual([
      'IMAGE_DOWNLOAD_FAILED',
      'IMAGE_UNRESOLVED',
    ]);

    const products = await prisma.product.findMany({
      where: { catalogVersionId: importVersionId },
      select: { sku: true, imageKey: true },
      orderBy: { sku: 'asc' },
    });
    const bySku = new Map(products.map((product) => [product.sku, product.imageKey]));
    expect(bySku.get('IMG-URL-1')).toMatch(
      new RegExp(
        `^products/${importCatalog.catalogId}/${importVersionId}/[0-9a-f-]{36}-[a-f0-9]{12}\\.png$`,
      ),
    );
    expect(bySku.get('IMG-BROKEN-1')).toBeNull();
    expect(bySku.get('IMG-REL-1')).toBeNull();

    // El producto con imagen accesible se sirve con URL firmada y descarga bien.
    const list = await staffAgent
      .get(`${api}/products`)
      .query({ catalogId: importCatalog.catalogId, versionId: importVersionId, limit: 100 })
      .expect(200);
    const withImage = list.body.items.find(
      (product: { sku: string }) => product.sku === 'IMG-URL-1',
    );
    expect(withImage.imageUrl).toMatch(/^http/);
    const download = await fetch(withImage.imageUrl);
    expect(download.status).toBe(200);
  });
});
