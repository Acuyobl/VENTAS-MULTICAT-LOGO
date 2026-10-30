import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const FIXTURE_PATH = resolve(process.cwd(), '../../tools/fixtures/pedido-con-imagenes.xlsx');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('Importar XLSX con imágenes incrustadas (e2e)', () => {
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
      data: { name: 'QA XLSX Imágenes', slug: uniqueSlug('qa-xlsx-img'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-xlsx-img',
    });
    agent = await loginStaff(staff);
    const catalog = await agent
      .post(`${api}/catalogs`)
      .send({ name: 'Pedido con imágenes' })
      .expect(201);
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
      await prisma.importRowIssue.deleteMany({
        where: { importJob: { catalogId } },
      });
      await prisma.importJob.deleteMany({ where: { catalogId } });
      await prisma.importMappingTemplate.deleteMany({ where: { catalogId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('extrae los data URI del XLSX y crea 3 productos con PNG reales (no SVG)', async () => {
    const imported = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', readFileSync(FIXTURE_PATH), 'pedido-con-imagenes.xlsx')
      .field('currency', 'CRC')
      .expect(201);

    expect(imported.body).toMatchObject({ importedRows: 3, quarantineRows: 0 });
    const products = await agent
      .get(
        `${api}/products?catalogId=${catalogId}&versionId=${imported.body.catalogVersionId}&limit=10`,
      )
      .expect(200);
    const items = products.body.items as Array<{ imageKey: string | null; name: string }>;
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.imageKey?.endsWith('.png'))).toBe(true);

    const stored = await Promise.all(
      items.map((item) => storage.getObjectBuffer('vc-products', item.imageKey as string)),
    );
    for (const buffer of stored) {
      expect(buffer).not.toBeNull();
      expect(buffer!.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
      expect(buffer!.subarray(0, 4).toString('latin1')).not.toContain('<svg');
    }
    // Las 3 imágenes son distintas (tres PNG ancladas diferentes).
    expect(new Set(stored.map((buffer) => buffer?.toString('base64'))).size).toBe(3);
  });
});
