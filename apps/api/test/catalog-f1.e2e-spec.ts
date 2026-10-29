import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { ImportResult } from '@ventascatalogo/contracts';
import { PrismaService } from '../src/prisma/prisma.service';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';
import {
  createCatalogFixture,
  createCustomerFixture,
  createStaffFixture,
  deleteCatalogFixture,
  deleteUserFixture,
  requireOrgId,
  type CatalogFixture,
  type CustomerFixture,
  type StaffFixture,
} from './helpers/fixtures';

const FIXTURE_PATH = resolve(process.cwd(), '../../tools/fixtures/catalogo-demo.csv');

function readFixtureBuffer(): Buffer {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`Falta el fixture real ${FIXTURE_PATH}: ejecutá los tests desde apps/api.`);
  }
  return readFileSync(FIXTURE_PATH);
}

/** Genera una v2 cambiando el precio de SKU-001 para que el SHA-256 difiera. */
function writeSecondVersionFile(): string {
  const original = readFixtureBuffer().toString('utf8');
  const lines = original.split(/\r?\n/);
  const firstDataIndex = lines.findIndex((line) => line.startsWith('SKU-001,'));
  if (firstDataIndex === -1) throw new Error('El fixture no contiene la fila SKU-001.');
  lines[firstDataIndex] = lines[firstDataIndex].replace(',12600,', ',13000,');
  const path = resolve(tmpdir(), `catalogo-demo-v2-${Date.now()}.csv`);
  writeFileSync(path, lines.join('\n'), 'utf8');
  return path;
}

describe('F1 catálogo: importación CSV/XLSX, versionado y productos por versión (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let staff: StaffFixture;
  let staffAliada: StaffFixture;
  let customer: CustomerFixture;
  let catalog: CatalogFixture;
  let catalogWithoutVersion: CatalogFixture;
  let firstImport!: ImportResult;
  let secondVersionFilePath: string | undefined;
  let staffAgent!: Awaited<ReturnType<typeof loginAs>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginAs>>;
  let customerAgent!: Awaited<ReturnType<typeof loginAs>>;

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
    server = app.getHttpServer();
    api = apiBaseUrl(app);

    const demoOrgId = await requireOrgId(prisma, 'demo');

    staff = await createStaffFixture(prisma, {
      organizationSlug: 'demo',
      roleKey: 'catalog_admin',
      emailPrefix: 'f1-staff',
    });
    staffAliada = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'catalog_admin',
      emailPrefix: 'f1-aliada',
    });
    customer = await createCustomerFixture(prisma, { organizationSlug: 'demo' });

    catalog = await createCatalogFixture(prisma, {
      organizationId: demoOrgId,
      name: 'Catálogo F1 QA importación',
      slugPrefix: 'qa-f1-import',
    });
    catalogWithoutVersion = await createCatalogFixture(prisma, {
      organizationId: demoOrgId,
      name: 'Catálogo F1 QA sin versión',
      slugPrefix: 'qa-f1-empty',
    });

    // Un solo login por fixture: `/auth/login` tiene rate limit de 10/min por IP.
    staffAgent = await loginAs(staff, 'staff');
    aliadaAgent = await loginAs(staffAliada, 'staff');
    customerAgent = await loginAs(customer, 'customer');

    const response = await staffAgent
      .post(`${api}/catalogs/${catalog.catalogId}/imports`)
      .field('currency', 'CRC')
      .attach('file', readFixtureBuffer(), 'catalogo-demo.csv');

    expect(response.status).toBe(201);
    firstImport = response.body as ImportResult;
  });

  afterAll(async () => {
    if (secondVersionFilePath && existsSync(secondVersionFilePath))
      unlinkSync(secondVersionFilePath);
    if (catalog) await deleteCatalogFixture(prisma, catalog.catalogId);
    if (catalogWithoutVersion) await deleteCatalogFixture(prisma, catalogWithoutVersion.catalogId);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (staffAliada) await deleteUserFixture(prisma, staffAliada.userId);
    if (customer) await deleteUserFixture(prisma, customer.userId);
    if (app) await app.close();
  });

  it('importa el fixture real: 42 filas → 37 productos válidos y 5 en cuarentena', async () => {
    expect(firstImport).toMatchObject({
      catalogVersionId: expect.any(String),
      versionNumber: 1,
      status: 'VALIDATED',
      idempotent: false,
      totalRows: 42,
      importedRows: 37,
      quarantineRows: 5,
    });
    expect(firstImport.importJobId).toMatch(/^[0-9a-f-]{36}$/);

    // Issues = errores de cuarentena + warnings de imagen. Las URLs relativas del
    // fixture (`img/sku-001.jpg`) ya no se guardan como key inválida: generan un
    // warning IMAGE_UNRESOLVED por producto válido.
    const errors = firstImport.issues.filter((issue) => issue.severity === 'error');
    const warnings = firstImport.issues.filter((issue) => issue.severity === 'warning');
    expect(errors).toHaveLength(5);
    expect(warnings).toHaveLength(37);
    expect(warnings.every((issue) => issue.code === 'IMAGE_UNRESOLVED')).toBe(true);

    const codes = errors.map((issue) => issue.code);
    expect(codes.filter((code) => code === 'DUPLICATE_SKU')).toHaveLength(3);
    expect(codes.filter((code) => code === 'MISSING_PRICE')).toHaveLength(2);
    for (const issue of firstImport.issues) {
      expect(issue.rawData).toBeTypeOf('object');
      expect(issue.rowNumber).toBeGreaterThan(1);
    }

    // Persistencia real: versión validada, 37 productos, snapshot y auditoría.
    const version = await prisma.catalogVersion.findUniqueOrThrow({
      where: { id: firstImport.catalogVersionId },
    });
    expect(version.status).toBe('VALIDATED');
    expect(version.productCount).toBe(37);
    expect(version.sourceChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(version.sourceFileId).toBe(`imports/${catalog.catalogId}/${version.sourceChecksum}.csv`);
    expect(version.importedAt).not.toBeNull();
    expect(version.validatedAt).not.toBeNull();
    expect(await prisma.product.count({ where: { catalogVersionId: version.id } })).toBe(37);

    // Un precio con separador de miles se normalizó con toMinorAmount (12800, no 12.8).
    const sku3 = await prisma.product.findFirstOrThrow({
      where: { catalogVersionId: version.id, sku: 'SKU-003' },
    });
    expect(sku3.priceMinor).toBe(12800n);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'catalog.imported', entityId: version.id },
    });
    expect(audit).not.toBeNull();
  });

  it('activa la v1 importada y la deja como versión publicada del catálogo', async () => {
    const agent = staffAgent;
    const response = await agent
      .post(
        `${api}/catalogs/${catalog.catalogId}/versions/${firstImport.catalogVersionId}/activate`,
      )
      .expect(200);

    expect(response.body).toMatchObject({
      id: firstImport.catalogVersionId,
      versionNumber: 1,
      status: 'ACTIVE',
      isActive: true,
    });
    const catalogRow = await prisma.catalog.findUniqueOrThrow({
      where: { id: catalog.catalogId },
    });
    expect(catalogRow.activeVersionId).toBe(firstImport.catalogVersionId);
  });

  it('lista las versiones del catálogo ordenadas por versionNumber descendente', async () => {
    const agent = staffAgent;
    const response = await agent.get(`${api}/catalogs/${catalog.catalogId}/versions`).expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      id: firstImport.catalogVersionId,
      catalogId: catalog.catalogId,
      versionNumber: 1,
      status: 'ACTIVE',
      isActive: true,
      productCount: 37,
      currency: 'CRC',
    });
    expect(response.body.items[0].importedAt).toBeTypeOf('string');
  });

  it('reimportar el mismo archivo es idempotente: 200, misma versión, cero duplicados', async () => {
    const agent = staffAgent;
    const response = await agent
      .post(`${api}/catalogs/${catalog.catalogId}/imports`)
      .attach('file', readFixtureBuffer(), 'catalogo-demo.csv')
      .expect(200);

    expect(response.body).toMatchObject({
      idempotent: true,
      catalogVersionId: firstImport.catalogVersionId,
      importJobId: firstImport.importJobId,
      versionNumber: 1,
      totalRows: 42,
      importedRows: 37,
      quarantineRows: 5,
    });
    // Mismo resultado que el 201 original: 5 errores + 37 warnings de imagen.
    expect(
      response.body.issues.filter((issue: { severity: string }) => issue.severity === 'error'),
    ).toHaveLength(5);
    expect(
      response.body.issues.filter((issue: { severity: string }) => issue.severity === 'warning'),
    ).toHaveLength(37);

    expect(await prisma.catalogVersion.count({ where: { catalogId: catalog.catalogId } })).toBe(1);
    expect(await prisma.importJob.count({ where: { catalogId: catalog.catalogId } })).toBe(1);
    expect(
      await prisma.product.count({
        where: { catalogId: catalog.catalogId, catalogVersionId: firstImport.catalogVersionId },
      }),
    ).toBe(37);
  });

  it('GET /imports/:jobId devuelve el resultado con la cuarentena del job', async () => {
    const agent = staffAgent;
    const response = await agent
      .get(`${api}/catalogs/${catalog.catalogId}/imports/${firstImport.importJobId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      importJobId: firstImport.importJobId,
      catalogVersionId: firstImport.catalogVersionId,
      totalRows: 42,
      importedRows: 37,
      quarantineRows: 5,
      idempotent: false,
    });
    expect(
      response.body.issues.filter((issue: { severity: string }) => issue.severity === 'error'),
    ).toHaveLength(5);
    expect(
      response.body.issues.filter((issue: { severity: string }) => issue.severity === 'warning'),
    ).toHaveLength(37);
    expect(response.body.issues[0]).toMatchObject({
      rowNumber: expect.any(Number),
      code: expect.any(String),
      message: expect.any(String),
    });
  });

  it('crea una v2, la activa y preserva intactos los 37 productos de la v1', async () => {
    const agent = staffAgent;
    secondVersionFilePath = writeSecondVersionFile();

    const importResponse = await agent
      .post(`${api}/catalogs/${catalog.catalogId}/imports`)
      .attach('file', readFileSync(secondVersionFilePath), 'catalogo-demo-v2.csv')
      .expect(201);

    const v2 = importResponse.body as ImportResult;
    expect(v2).toMatchObject({
      versionNumber: 2,
      status: 'VALIDATED',
      importedRows: 37,
      quarantineRows: 5,
      idempotent: false,
    });
    expect(v2.catalogVersionId).not.toBe(firstImport.catalogVersionId);

    const activate = await agent
      .post(`${api}/catalogs/${catalog.catalogId}/versions/${v2.catalogVersionId}/activate`)
      .expect(200);
    expect(activate.body).toMatchObject({
      id: v2.catalogVersionId,
      versionNumber: 2,
      status: 'ACTIVE',
      isActive: true,
    });
    expect(activate.body.activatedAt).toBeTypeOf('string');

    const [v1Row, catalogRow] = await Promise.all([
      prisma.catalogVersion.findUniqueOrThrow({ where: { id: firstImport.catalogVersionId } }),
      prisma.catalog.findUniqueOrThrow({ where: { id: catalog.catalogId } }),
    ]);
    expect(v1Row.status).toBe('ARCHIVED');
    expect(v1Row.archivedAt).not.toBeNull();
    expect(catalogRow.activeVersionId).toBe(v2.catalogVersionId);
    expect(
      await prisma.product.count({
        where: { catalogVersionId: firstImport.catalogVersionId, deletedAt: null },
      }),
    ).toBe(37);

    const activatedAudit = await prisma.auditLog.findFirst({
      where: { action: 'catalog.version.activated', entityId: v2.catalogVersionId },
    });
    expect(activatedAudit).not.toBeNull();

    // Sin versionId, /products sirve la versión activa (v2) y nunca mezcla versiones.
    const defaultList = await agent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId, limit: 100 })
      .expect(200);
    expect(defaultList.body).toMatchObject({
      catalogId: catalog.catalogId,
      versionId: v2.catalogVersionId,
      versionNumber: 2,
    });
    expect(defaultList.body.items).toHaveLength(37);
    expect(
      defaultList.body.items.every(
        (item: { catalogVersionId: string }) => item.catalogVersionId === v2.catalogVersionId,
      ),
    ).toBe(true);
    expect(
      defaultList.body.items.find((item: { sku: string }) => item.sku === 'SKU-001').priceMinor,
    ).toBe('13000');

    // Con versionId explícito, /products sirve la v1 archivada con sus precios originales.
    const v1List = await agent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId, versionId: firstImport.catalogVersionId, limit: 100 })
      .expect(200);
    expect(v1List.body).toMatchObject({
      versionId: firstImport.catalogVersionId,
      versionNumber: 1,
    });
    expect(v1List.body.items).toHaveLength(37);
    expect(
      v1List.body.items.find((item: { sku: string }) => item.sku === 'SKU-001').priceMinor,
    ).toBe('12600');
  });

  it('pagina /products por cursor sin repetir ids ni mezclar versiones', async () => {
    const agent = staffAgent;
    const versionId = (
      await prisma.catalog.findUniqueOrThrow({
        where: { id: catalog.catalogId },
        select: { activeVersionId: true },
      })
    ).activeVersionId;
    expect(versionId).toBeTruthy();

    const firstPage = await agent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId, limit: 10 })
      .expect(200);
    expect(firstPage.body.items).toHaveLength(10);
    expect(firstPage.body.nextCursor).toBeTypeOf('string');
    expect(firstPage.body.nextCursor).toBe(firstPage.body.items[9].id);

    const secondPage = await agent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId, limit: 10, cursor: firstPage.body.nextCursor })
      .expect(200);
    expect(secondPage.body.items).toHaveLength(10);

    const firstIds = new Set(firstPage.body.items.map((item: { id: string }) => item.id));
    expect(secondPage.body.items.some((item: { id: string }) => firstIds.has(item.id))).toBe(false);
    expect(
      [...firstPage.body.items, ...secondPage.body.items].every(
        (item: { catalogVersionId: string }) => item.catalogVersionId === versionId,
      ),
    ).toBe(true);

    // Filtros: q busca en name/sku y category es igualdad.
    const bySku = await agent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId, q: 'SKU-001' })
      .expect(200);
    expect(bySku.body.items.map((item: { sku: string }) => item.sku)).toEqual(['SKU-001']);

    const byCategory = await agent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId, category: 'Jardín', limit: 100 })
      .expect(200);
    expect(byCategory.body.items.length).toBeGreaterThan(0);
    expect(
      byCategory.body.items.every((item: { category: string }) => item.category === 'Jardín'),
    ).toBe(true);
  });

  it('responde 404 CATALOG_NOT_FOUND a un staff de otra organización en todos los endpoints', async () => {
    const agent = aliadaAgent;

    for (const response of [
      await agent.get(`${api}/catalogs/${catalog.catalogId}/versions`),
      await agent.get(`${api}/catalogs/${catalog.catalogId}/imports/${firstImport.importJobId}`),
      await agent.get(`${api}/products`).query({ catalogId: catalog.catalogId }),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('CATALOG_NOT_FOUND');
    }

    const importResponse = await agent
      .post(`${api}/catalogs/${catalog.catalogId}/imports`)
      .attach('file', readFixtureBuffer(), 'catalogo-demo.csv');
    expect(importResponse.status).toBe(404);
    expect(importResponse.body.code).toBe('CATALOG_NOT_FOUND');
  });

  it('responde 403 AUTH_WRONG_AUDIENCE cuando la sesión es de cliente', async () => {
    const agent = customerAgent;

    const versions = await agent.get(`${api}/catalogs/${catalog.catalogId}/versions`).expect(403);
    expect(versions.body.code).toBe('AUTH_WRONG_AUDIENCE');

    const products = await agent
      .get(`${api}/products`)
      .query({ catalogId: catalog.catalogId })
      .expect(403);
    expect(products.body.code).toBe('AUTH_WRONG_AUDIENCE');

    const importResponse = await agent
      .post(`${api}/catalogs/${catalog.catalogId}/imports`)
      .attach('file', readFixtureBuffer(), 'catalogo-demo.csv')
      .expect(403);
    expect(importResponse.body.code).toBe('AUTH_WRONG_AUDIENCE');
    expect(importResponse.body.details).toEqual({ expected: 'staff', received: 'customer' });
  });

  it('rechaza archivos inválidos con códigos estables (400)', async () => {
    const agent = staffAgent;
    const url = `${api}/catalogs/${catalog.catalogId}/imports`;

    const missingFile = await agent.post(url).field('currency', 'CRC').expect(400);
    expect(missingFile.body.code).toBe('INVALID_IMPORT_FILE');

    const emptyFile = await agent
      .post(url)
      .attach('file', Buffer.alloc(0), 'vacio.csv')
      .expect(400);
    expect(emptyFile.body.code).toBe('INVALID_IMPORT_FILE');

    const unsupported = await agent
      .post(url)
      .attach('file', Buffer.from('no soy un catálogo'), 'catalogo.bin')
      .expect(400);
    expect(unsupported.body.code).toBe('UNSUPPORTED_FILE_TYPE');

    const headerOnly = await agent
      .post(url)
      .attach('file', Buffer.from('SKU,Nombre,Precio\n', 'utf8'), 'sin-filas.csv')
      .expect(400);
    expect(headerOnly.body.code).toBe('EMPTY_IMPORT');
  });

  it('sin versión activa responde 409 NO_ACTIVE_VERSION y rechaza activar borradores o versiones vacías', async () => {
    const agent = staffAgent;

    const noActive = await agent
      .get(`${api}/products`)
      .query({ catalogId: catalogWithoutVersion.catalogId })
      .expect(409);
    expect(noActive.body.code).toBe('NO_ACTIVE_VERSION');

    // Versión DRAFT creada por fuera del importador (el importador crea VALIDATED).
    const draft = await prisma.catalogVersion.create({
      data: {
        catalogId: catalogWithoutVersion.catalogId,
        versionNumber: 1,
        status: 'DRAFT',
        currency: 'CRC',
        taxRateBp: 1300,
        taxIncluded: true,
        productCount: 0,
        createdByUserId: staff.userId,
      },
    });

    const blocked = await agent
      .post(`${api}/catalogs/${catalogWithoutVersion.catalogId}/versions/${draft.id}/activate`)
      .expect(409);
    expect(blocked.body.code).toBe('VERSION_NOT_ACTIVATABLE');
    expect(blocked.body.details).toMatchObject({ status: 'DRAFT' });

    const validated = await agent
      .post(`${api}/catalogs/${catalogWithoutVersion.catalogId}/versions/${draft.id}/validate`)
      .expect(200);
    expect(validated.body).toMatchObject({ status: 'VALIDATED', isActive: false });

    const emptyVersion = await agent
      .post(`${api}/catalogs/${catalogWithoutVersion.catalogId}/versions/${draft.id}/activate`)
      .expect(409);
    expect(emptyVersion.body.code).toBe('VERSION_NOT_ACTIVATABLE');
    expect(emptyVersion.body.details).toMatchObject({ productCount: 0 });

    const archived = await agent
      .post(`${api}/catalogs/${catalogWithoutVersion.catalogId}/versions/${draft.id}/archive`)
      .expect(200);
    expect(archived.body).toMatchObject({ status: 'ARCHIVED' });
    expect(archived.body.archivedAt).toBeTypeOf('string');
  });
});
