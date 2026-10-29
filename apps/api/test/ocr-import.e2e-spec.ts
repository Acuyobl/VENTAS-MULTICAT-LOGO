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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

/** PDF mínimo escaneado: una imagen JPEG con `/DCTDecode` y sin capa de texto. */
function scannedPdf(): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from(
      '1 0 obj << /Type /XObject /Subtype /Image /Filter /DCTDecode >>\nstream\n',
      'latin1',
    ),
    JPG,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
}

describe('OCR: fotos y PDF escaneados (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let staff: StaffFixture;
  let agent!: Awaited<ReturnType<typeof loginStaff>>;
  const originalEnv: Record<string, string | undefined> = {};

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    return agent;
  }

  beforeAll(async () => {
    originalEnv.OCR_PROVIDER = process.env.OCR_PROVIDER;
    originalEnv.OCR_MOCK_TEXT = process.env.OCR_MOCK_TEXT;
    process.env.OCR_PROVIDER = 'mock';
    process.env.OCR_MOCK_TEXT = 'Camisa OCR 5000\nPantalón OCR 7000';

    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA OCR', slug: uniqueSlug('qa-ocr'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-ocr-staff',
    });
    agent = await loginStaff(staff);
    const catalog = await agent.post(`${api}/catalogs`).send({ name: 'OCR Demo' }).expect(201);
    catalogId = catalog.body.id;
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (prisma) {
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('preview de una foto PNG usa OCR y propone nombre/precio automáticos', async () => {
    const preview = await agent
      .post(`${api}/catalogs/${catalogId}/imports/preview`)
      .attach('file', PNG, 'lista-productos.png')
      .field('currency', 'CRC')
      .expect(200);

    expect(preview.body.proposal.mapping).toMatchObject({
      name: 'Nombre',
      price: 'Precio',
      sku: 'SKU',
    });
    expect(preview.body.proposal.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('OCR')]),
    );
    expect(preview.body.headers).toEqual(['SKU', 'Nombre', 'Precio']);
    expect(preview.body.totalRows).toBe(2);
  });

  it('importa la foto PNG/JPG con OCR y crea los productos', async () => {
    const imported = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', PNG, 'lista-productos.png')
      .field('currency', 'CRC')
      .expect(201);

    expect(imported.body).toMatchObject({ importedRows: 2, quarantineRows: 0 });
    const products = await agent
      .get(
        `${api}/products?catalogId=${catalogId}&versionId=${imported.body.catalogVersionId}&limit=10`,
      )
      .expect(200);
    expect((products.body.items as Array<{ name: string }>).map((item) => item.name)).toEqual(
      expect.arrayContaining(['Camisa OCR', 'Pantalón OCR']),
    );

    // Un JPG también se acepta (preview no falla y detecta 2 filas).
    const jpgPreview = await agent
      .post(`${api}/catalogs/${catalogId}/imports/preview`)
      .attach('file', JPG, 'lista-productos.jpg')
      .field('currency', 'CRC')
      .expect(200);
    expect(jpgPreview.body.totalRows).toBe(2);
  });

  it('PDF escaneado sin texto: extrae el JPEG y usa OCR', async () => {
    const imported = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', scannedPdf(), 'pedido-escaneado.pdf')
      .field('currency', 'CRC')
      .expect(201);

    expect(imported.body).toMatchObject({ importedRows: 2, quarantineRows: 0 });
    const products = await agent
      .get(
        `${api}/products?catalogId=${catalogId}&versionId=${imported.body.catalogVersionId}&limit=10`,
      )
      .expect(200);
    expect((products.body.items as Array<{ name: string }>).map((item) => item.name)).toEqual(
      expect.arrayContaining(['Camisa OCR', 'Pantalón OCR']),
    );
  });

  it('un .exe sigue bloqueado', async () => {
    const response = await agent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from('MZ ejecutable'), 'malicioso.exe')
      .field('currency', 'CRC')
      .expect(400);
    expect(response.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });
});
