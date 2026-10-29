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

describe('Importador universal: JSON, TSV y formatos alternativos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Universal', slug: uniqueSlug('qa-universal'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-universal-staff',
    });
    agent = await loginStaff(staff);

    const catalog = await agent
      .post(`${api}/catalogs`)
      .send({ name: 'Catálogo Universal', slug: uniqueSlug('qa-universal-cat') })
      .expect(201);
    catalogId = catalog.body.id;
  });

  afterAll(async () => {
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('importa un JSON con arreglo de productos', async () => {
    const json = JSON.stringify([
      { SKU: 'JSON-1', Nombre: 'Café de altura', Precio: '4500', Stock: '10' },
      { SKU: 'JSON-2', Nombre: 'Miel orgánica', Precio: '3200', Stock: '5' },
    ]);
    const response = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(json, 'utf8'), 'catalogo.json')
      .field('currency', 'CRC')
      .expect(201);
    expect(response.body).toMatchObject({ importedRows: 2, quarantineRows: 0 });
  });

  it('importa un TSV y un archivo de texto delimitado por pipe', async () => {
    const tsv = 'SKU\tNombre\tPrecio\nTSV-1\tMiel de abeja\t3000\nTSV-2\tGranola\t2500';
    const tsvResponse = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(tsv, 'utf8'), 'catalogo.tsv')
      .field('currency', 'CRC')
      .expect(201);
    expect(tsvResponse.body.importedRows).toBe(2);

    const pipe = 'SKU|Nombre|Precio\nPIPE-1|Chocolate 70%|2800\nPIPE-2|Té de manzanilla|1900';
    const pipeResponse = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(pipe, 'utf8'), 'catalogo.txt')
      .field('currency', 'CRC')
      .expect(201);
    expect(pipeResponse.body.importedRows).toBe(2);

    const tsvProducts = await agent
      .get(`${api}/products`)
      .query({ catalogId, versionId: tsvResponse.body.catalogVersionId, limit: 50 })
      .expect(200);
    expect(tsvProducts.body.items.map((item: { sku: string }) => item.sku)).toEqual(
      expect.arrayContaining(['TSV-1', 'TSV-2']),
    );

    const products = await agent
      .get(`${api}/products`)
      .query({ catalogId, versionId: pipeResponse.body.catalogVersionId, limit: 50 })
      .expect(200);
    const skus = products.body.items.map((item: { sku: string }) => item.sku);
    expect(skus).toEqual(expect.arrayContaining(['PIPE-1', 'PIPE-2']));
  });

  it('rechaza ejecutables y comprimidos con código estable', async () => {
    const rejected = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from('MZ...'), 'catalogo.exe')
      .expect(400);
    expect(rejected.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });
});
