import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

const HEADERS = 'Código,Artículo,Precio final ₡,Cant.,Medida,Material,Total';
const CSV_INITIAL = `${HEADERS}\nA1,Café de altura,1234.56,10,1 kg,cerámica,₡12.345\nA2,Miel de abeja,2000,5,500 g,vidrio,₡10.000\n`;
const CSV_MERGE = `${HEADERS}\nA1,Café de altura premium,1500,8,2 kg,madera,₡12.000\n`;
const CSV_REPLACE = `${HEADERS}\nA1,Café de altura,1700,8,2 kg,madera,₡13.600\n`;
const CSV_TEMPLATE = `${HEADERS}\nA1,Café de altura,1800,7,1 kg,cerámica,₡12.600\n`;
const CSV_MEASURES = `Código,Medida,Material\nTOR-001,1/4,Acero\nTOR-002,1/4 x 2,Cobre\nTOR-003,16 oz,Latón\nTOR-004,1/4,Hierro\n`;
const CSV_QUARANTINE = `${HEADERS}\nA1,Café de altura,1900,6,1/4,Acero,₡12.000\n,Sin código,1000,1,16 oz,Cobre,₡1.000\n`;
const EXTRA_FIELDS = JSON.stringify([
  { column: 'Medida', key: 'medida', label: 'Medida', type: 'TEXT' },
  { column: 'Material', key: 'material', label: 'Material', type: 'TEXT' },
]);

describe('Importador inteligente y REPLACE/MERGE (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let catalogAdmin: StaffFixture;
  let vendedor: StaffFixture;
  let aliadaAdmin: StaffFixture;
  let adminAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginStaff>>;
  const originalEnv: Record<string, string | undefined> = {};

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    return agent;
  }

  function previewRequest(agent: typeof adminAgent, csv: string, useAgent?: boolean) {
    const req = agent
      .post(`${api}/catalogs/${catalogId}/imports/preview`)
      .attach('file', Buffer.from(csv, 'utf8'), 'productos.csv');
    if (useAgent !== undefined) req.field('useAgent', String(useAgent));
    return req;
  }

  beforeAll(async () => {
    originalEnv.AI_PROVIDER = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'mock';
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Importador IA', slug: uniqueSlug('qa-adapt'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    catalogAdmin = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-adapt-admin',
    });
    vendedor = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-adapt-vendedor',
    });
    aliadaAdmin = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-adapt-aliada',
    });

    adminAgent = await loginStaff(catalogAdmin);
    vendedorAgent = await loginStaff(vendedor);
    aliadaAgent = await loginStaff(aliadaAdmin);
  });

  afterAll(async () => {
    if (prisma) {
      const jobs = await prisma.importJob.findMany({
        where: { catalogId },
        select: { id: true },
      });
      const jobIds = jobs.map((job) => job.id);
      if (jobIds.length > 0) {
        await prisma.importRowIssue.deleteMany({ where: { importJobId: { in: jobIds } } });
      }
      await prisma.importJob.deleteMany({ where: { catalogId } });
      await prisma.importMappingTemplate.deleteMany({ where: { catalogId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    for (const fixture of [catalogAdmin, vendedor, aliadaAdmin]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (originalEnv.AI_PROVIDER === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalEnv.AI_PROVIDER;
    if (app) await app.close();
  });

  it('crea el catálogo vía POST /catalogs con slug autogenerado y 409 al repetir', async () => {
    const created = await adminAgent
      .post(`${api}/catalogs`)
      .send({ name: 'Catálogo Adaptativo QA', description: 'Prueba importador' })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Catálogo Adaptativo QA',
      slug: 'catalogo-adaptativo-qa',
      productCount: 0,
    });
    catalogId = created.body.id;

    const duplicate = await adminAgent
      .post(`${api}/catalogs`)
      .send({ name: 'Catálogo Adaptativo QA' })
      .expect(409);
    expect(duplicate.body.code).toBe('VALIDATION_FAILED');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'catalog.created', entityId: catalogId },
    });
    expect(audit).not.toBeNull();

    const forbidden = await vendedorAgent
      .post(`${api}/catalogs`)
      .send({ name: 'Otro catálogo' })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
  });

  it('preview heurístico detecta mapping, campos extra y columna Total ignorada', async () => {
    const preview = await previewRequest(adminAgent, CSV_INITIAL, false).expect(200);
    expect(preview.body.headers).toEqual(HEADERS.split(','));
    expect(preview.body.totalRows).toBe(2);
    expect(preview.body.sampleRows).toHaveLength(2);
    expect(preview.body.modeOptions).toEqual(['REPLACE', 'MERGE']);
    expect(preview.body.proposal.mapping).toMatchObject({
      sku: 'Código',
      name: 'Artículo',
      price: 'Precio final ₡',
      stock: 'Cant.',
    });
    const extraLabels = preview.body.proposal.extraFields.map(
      (field: { label: string }) => field.label,
    );
    expect(extraLabels).toEqual(expect.arrayContaining(['Medida', 'Material']));
    expect(
      preview.body.proposal.ignoredColumns.some(
        (column: { column: string }) => column.column === 'Total',
      ),
    ).toBe(true);
    expect(preview.body.proposal.agent).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'import.preview_analyzed', organizationId },
    });
    expect(audit).not.toBeNull();
  });

  it('preview con agente mock devuelve agent.provider=mock y explicación', async () => {
    const preview = await previewRequest(adminAgent, CSV_INITIAL, true).expect(200);
    expect(preview.body.proposal.agent).toMatchObject({ provider: 'mock', mocked: true });
    expect(preview.body.proposal.explanation).toContain('mock');
    expect(preview.body.proposal.mapping.sku).toBe('Código');
  });

  it('importa en REPLACE, activa la versión y MERGE conserva lo que no viene en el archivo', async () => {
    const first = await adminAgent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(CSV_INITIAL, 'utf8'), 'productos.csv')
      .field('extraFields', EXTRA_FIELDS)
      .expect(201);
    expect(first.body).toMatchObject({ importedRows: 2, mode: 'REPLACE', carriedOver: 0 });
    const initialVersionId = first.body.catalogVersionId as string;

    await adminAgent
      .post(`${api}/catalogs/${catalogId}/versions/${initialVersionId}/activate`)
      .expect(200);

    const merge = await adminAgent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(CSV_MERGE, 'utf8'), 'productos-merge.csv')
      .field('mode', 'MERGE')
      .field('extraFields', EXTRA_FIELDS)
      .expect(201);
    expect(merge.body).toMatchObject({ importedRows: 1, mode: 'MERGE', carriedOver: 1 });
    const mergedVersionId = merge.body.catalogVersionId as string;

    const mergedProducts = await adminAgent
      .get(`${api}/products?catalogId=${catalogId}&versionId=${mergedVersionId}&limit=50`)
      .expect(200);
    const items = mergedProducts.body.items as Array<{
      sku: string;
      priceMinor: string;
      attributes: Record<string, unknown> | null;
    }>;
    expect(items.map((item) => item.sku).sort()).toEqual(['A1', 'A2']);
    const a1 = items.find((item) => item.sku === 'A1')!;
    expect(a1.attributes).toEqual({ medida: '2 kg', material: 'madera' });
    expect(a1.priceMinor).toBe('1500');
    const a2 = items.find((item) => item.sku === 'A2')!;
    expect(a2.priceMinor).toBe('2000');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'import.completed', organizationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after).toMatchObject({ mode: 'MERGE' });
  });

  it('REPLACE no arrastra productos previos y guarda plantilla con audit', async () => {
    const replace = await adminAgent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(CSV_REPLACE, 'utf8'), 'productos-replace.csv')
      .field('mode', 'REPLACE')
      .field('extraFields', EXTRA_FIELDS)
      .field('saveTemplate', 'true')
      .field('templateName', 'Plantilla QA')
      .expect(201);
    expect(replace.body).toMatchObject({ importedRows: 1, mode: 'REPLACE', carriedOver: 0 });
    const replacedVersionId = replace.body.catalogVersionId as string;

    const products = await adminAgent
      .get(`${api}/products?catalogId=${catalogId}&versionId=${replacedVersionId}&limit=50`)
      .expect(200);
    expect((products.body.items as Array<{ sku: string }>).map((item) => item.sku)).toEqual(['A1']);

    const templates = await adminAgent
      .get(`${api}/catalogs/${catalogId}/import-templates`)
      .expect(200);
    expect(templates.body.items).toHaveLength(1);
    expect(templates.body.items[0]).toMatchObject({ name: 'Plantilla QA', usageCount: 0 });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'import.template_saved', organizationId },
    });
    expect(audit).not.toBeNull();
  });

  it('la plantilla guardada se reutiliza como preset e incrementa usageCount', async () => {
    const preview = await previewRequest(adminAgent, CSV_TEMPLATE, true).expect(200);
    expect(preview.body.preset).toMatchObject({ name: 'Plantilla QA' });

    const imported = await adminAgent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(CSV_TEMPLATE, 'utf8'), 'productos-template.csv')
      .field('mode', 'REPLACE')
      .expect(201);
    expect(imported.body.importedRows).toBe(1);

    const templates = await adminAgent
      .get(`${api}/catalogs/${catalogId}/import-templates`)
      .expect(200);
    expect(templates.body.items[0].usageCount).toBeGreaterThanOrEqual(1);
  });

  it('sin IA configurada el preview responde heurística con agent null y warning', async () => {
    process.env.AI_PROVIDER = 'deepseek';
    delete process.env.DEEPSEEK_API_KEY;
    vi.resetModules();
    const freshHarness = await import('./helpers/test-harness');
    const fallbackApp = await freshHarness.createTestApp();
    try {
      const agent = request.agent(fallbackApp.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .send({ ...catalogAdmin, audience: 'staff' })
        .expect(200);
      const response = await agent
        .post(`/api/v1/catalogs/${catalogId}/imports/preview`)
        .attach('file', Buffer.from(CSV_INITIAL, 'utf8'), 'productos.csv')
        .field('useAgent', 'true');
      expect(response.status).toBe(200);
      expect(response.body.proposal.agent).toBeNull();
      expect(
        response.body.proposal.warnings.some((warning: string) => warning.includes('heurística')),
      ).toBe(true);
      expect(response.body.proposal.mapping.sku).toBe('Código');
    } finally {
      await fallbackApp.close();
      process.env.AI_PROVIDER = 'mock';
    }
  });

  it('las medidas 1/4 y 16 oz se infieren TEXT y no ENUM', async () => {
    const preview = await previewRequest(adminAgent, CSV_MEASURES, false).expect(200);
    const medida = preview.body.columns.find(
      (column: { header: string }) => column.header === 'Medida',
    );
    const material = preview.body.columns.find(
      (column: { header: string }) => column.header === 'Material',
    );
    expect(medida.type).toBe('TEXT');
    expect(material.type).toBe('TEXT');
    expect(preview.body.proposal.mapping.sku).toBe('Código');
  });

  it('guarda la plantilla aunque haya filas en cuarentena', async () => {
    const imported = await adminAgent
      .post(`${api}/catalogs/${catalogId}/imports`)
      .attach('file', Buffer.from(CSV_QUARANTINE, 'utf8'), 'productos-cuarentena.csv')
      .field('extraFields', EXTRA_FIELDS)
      .field('saveTemplate', 'true')
      .field('templateName', 'Plantilla con cuarentena')
      .expect(201);
    expect(imported.body).toMatchObject({
      importedRows: 1,
      quarantineRows: 1,
      mode: 'REPLACE',
    });

    const products = await adminAgent
      .get(
        `${api}/products?catalogId=${catalogId}&versionId=${imported.body.catalogVersionId}&limit=50`,
      )
      .expect(200);
    const row = (
      products.body.items as Array<{ sku: string; attributes: Record<string, unknown> | null }>
    ).find((item) => item.sku === 'A1');
    expect(row?.attributes).toEqual({ medida: '1/4', material: 'Acero' });

    const templates = await adminAgent
      .get(`${api}/catalogs/${catalogId}/import-templates`)
      .expect(200);
    const template = templates.body.items.find(
      (item: { name: string }) => item.name === 'Plantilla con cuarentena',
    );
    expect(template).toBeTruthy();

    const preview = await previewRequest(adminAgent, CSV_TEMPLATE, false).expect(200);
    expect(preview.body.preset).toMatchObject({ name: 'Plantilla con cuarentena' });
  });

  it('403 sin catalog:write y 404 cross-org en preview', async () => {
    const forbidden = await previewRequest(vendedorAgent, CSV_INITIAL, false).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const crossOrg = await previewRequest(aliadaAgent, CSV_INITIAL, false).expect(404);
    expect(crossOrg.body.code).toBe('CATALOG_NOT_FOUND');
  });
});
