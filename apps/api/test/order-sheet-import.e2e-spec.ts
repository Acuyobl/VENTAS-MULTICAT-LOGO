import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/modules/storage/storage.service';
import {
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
const PNG_DATA_URI = `data:image/png;base64,${PNG.toString('base64')}`;

const HEADERS =
  'CLIENTE,TALLA,CAMISA,TELA,TIPO,CUELLO,GENERO,CANTIDAD,DETALLE,MANGA,COSTO,URGENCIA,ESTADO,Imagen';
const CSV = [
  HEADERS,
  `María Solís,M,Camisa sublimada manga corta,Dry fit,Sublimación,Redondo,Dama,2,Diseño floral,Corta,12000,Alta,Pendiente,"${PNG_DATA_URI}"`,
  'Carlos Pérez,L,Camisa deportiva cuello V,Piqué,Bordado,V,Caballero,3,Logo empresa,Larga,15000,Media,En proceso,',
  'Ana Jiménez,S,Camisa oversize estampada,Algodón,Serigrafía,Redondo,Dama,1,Estampado tye die,Corta,9500,Baja,Entregado,',
].join('\n');

describe('Importación de hoja de pedidos con imágenes data URI (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let staff: StaffFixture;
  let agent!: Awaited<ReturnType<typeof loginStaff>>;

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

    const organization = await prisma.organization.create({
      data: { name: 'QA Sublimania', slug: uniqueSlug('qa-order'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-order-staff',
    });
    agent = await loginStaff(staff);
    const catalog = await agent.post(`${api}/catalogs`).send({ name: 'Sublimania CR' }).expect(201);
    catalogId = catalog.body.id;
  });

  afterAll(async () => {
    if (prisma) {
      const products = await prisma.product.findMany({
        where: { catalogId },
        select: { imageKey: true },
      });
      for (const product of products) {
        if (product.imageKey) await storage.removeObject(product.imageKey).catch(() => undefined);
      }
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('el preview automático propone CAMISA como nombre y COSTO como precio', async () => {
    const preview = await agent
      .post(`${api}/catalogs/${catalogId}/imports/preview`)
      .attach('file', Buffer.from(CSV, 'utf8'), 'sublimania.csv')
      .field('currency', 'CRC')
      .expect(200);

    expect(preview.body.proposal.mapping).toMatchObject({
      name: 'CAMISA',
      price: 'COSTO',
      cost: 'COSTO',
      stock: 'CANTIDAD',
      image: 'Imagen',
    });
    expect(
      (preview.body.proposal.warnings as string[]).some((warning) =>
        warning.includes('columna de costo como precio'),
      ),
    ).toBe(true);
  });

  it('importa 3 productos sin cuarentena, con atributos e imagen data URI', async () => {
    const preview = await agent
      .post(`${api}/catalogs/${catalogId}/imports/preview`)
      .attach('file', Buffer.from(CSV, 'utf8'), 'sublimania.csv')
      .field('currency', 'CRC')
      .expect(200);

    const imported = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(CSV, 'utf8'), 'sublimania.csv')
      .field('currency', 'CRC')
      .field('mapping', JSON.stringify(preview.body.proposal.mapping))
      .field('extraFields', JSON.stringify(preview.body.proposal.extraFields))
      .expect(201);

    expect(imported.body).toMatchObject({ importedRows: 3, quarantineRows: 0 });
    const versionId = imported.body.catalogVersionId as string;

    const products = await agent
      .get(`${api}/products?catalogId=${catalogId}&versionId=${versionId}&limit=10`)
      .expect(200);
    const items = products.body.items as Array<{
      sku: string;
      name: string;
      priceMinor: string;
      attributes: Record<string, unknown> | null;
      imageKey: string | null;
    }>;
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'Camisa sublimada manga corta',
        'Camisa deportiva cuello V',
        'Camisa oversize estampada',
      ]),
    );
    for (const item of items) {
      expect(item.sku).toMatch(/^IMP-/);
      expect(BigInt(item.priceMinor)).toBeGreaterThan(0n);
      expect(item.attributes).toMatchObject({
        talla: expect.any(String),
        tela: expect.any(String),
        tipo: expect.any(String),
      });
    }

    const withImage = items.filter((item) => item.imageKey);
    expect(withImage).toHaveLength(1);
    const stored = await storage.getObjectBuffer('vc-products', withImage[0]!.imageKey!);
    expect(stored?.equals(PNG)).toBe(true);

    // Activar la versión y verificar catálogo público.
    await agent.post(`${api}/catalogs/${catalogId}/versions/${versionId}/activate`).expect(200);
    const catalog = await prisma.catalog.findUniqueOrThrow({ where: { id: catalogId } });
    const publicCatalog = await agent.get(`${api}/catalogs/public/${catalog.slug}`).expect(200);
    expect(publicCatalog.body.products).toHaveLength(3);
  });
});
