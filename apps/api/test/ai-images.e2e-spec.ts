import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

describe('Imágenes con IA para publicaciones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let versionId: string;
  let product: Product;
  let socialStaff: StaffFixture;
  let vendedorStaff: StaffFixture;
  let aliadaStaff: StaffFixture;
  let socialAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginStaff>>;
  const createdPostIds: string[] = [];
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
    originalEnv.IMAGE_PROVIDER = process.env.IMAGE_PROVIDER;
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    process.env.IMAGE_PROVIDER = 'mock';
    process.env.AI_PROVIDER = 'mock';
    delete process.env.OPENAI_API_KEY;

    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Imágenes IA', slug: uniqueSlug('qa-img'), plan: 'STARTER' },
    });
    organizationId = organization.id;

    socialStaff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'social_manager',
      emailPrefix: 'qa-img-social',
    });
    vendedorStaff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-img-vendedor',
    });
    aliadaStaff = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'social_manager',
      emailPrefix: 'qa-img-aliada',
    });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo QA Imágenes',
      slugPrefix: 'qa-img-cat',
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
        createdByUserId: socialStaff.userId,
        activatedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    versionId = version.id;
    await prisma.catalog.update({ where: { id: catalogId }, data: { activeVersionId: versionId } });
    product = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: versionId,
        sku: 'IMG-113',
        name: 'Café de alturaQA',
        priceMinor: 11_300n,
        currency: 'CRC',
        stock: 10,
      },
    });

    socialAgent = await loginStaff(socialStaff);
    vendedorAgent = await loginStaff(vendedorStaff);
    aliadaAgent = await loginStaff(aliadaStaff);
  });

  afterAll(async () => {
    if (prisma) {
      const posts = await prisma.socialPost.findMany({
        where: { organizationId },
        select: { imageKey: true },
      });
      for (const post of posts) {
        if (post.imageKey) await storage.removePublicObject(post.imageKey).catch(() => undefined);
      }
      await prisma.socialPost.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    for (const fixture of [socialStaff, vendedorStaff, aliadaStaff]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (app) await app.close();
  });

  it('POST /ai/social-posts genera la imagen mock automáticamente y es descargable', async () => {
    const response = await socialAgent
      .post(`${api}/ai/social-posts`)
      .send({
        catalogId,
        platform: 'INSTAGRAM',
        tone: 'CERCANO',
        goal: 'VENTAS',
        productIds: [product.id],
        extraInstructions: 'Mencioná entrega en San José.',
      })
      .expect(201);

    expect(response.body.imageProvider).toBe('mock');
    expect(response.body.imagePrompt).toContain('Café de alturaQA');
    expect(typeof response.body.imageUrl).toBe('string');
    createdPostIds.push(response.body.id);

    const row = await prisma.socialPost.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(row.imageKey).toBe(`ai/posts/${organizationId}/${response.body.id}.svg`);
    expect(row.imageModel).toBe('mock-social-1080');

    const imageResponse = await fetch(response.body.imageUrl as string);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get('content-type')).toContain('image/svg+xml');
    const svg = await imageResponse.text();
    expect(svg).toContain('<svg');
    expect(svg).toContain('Café de alturaQA');
    expect(svg).toContain('VentasCatálogo');

    const list = await socialAgent.get(`${api}/ai/social-posts?limit=5`).expect(200);
    const listed = list.body.items.find((item: { id: string }) => item.id === response.body.id);
    expect(listed.imageUrl).toBeTruthy();
  });

  it('POST /:id/image regenera con prompt custom, sobrescribe la key y audita', async () => {
    const [postId] = createdPostIds;
    const before = await prisma.socialPost.findUniqueOrThrow({ where: { id: postId } });

    const regenerated = await socialAgent
      .post(`${api}/ai/social-posts/${postId}/image`)
      .send({ prompt: 'Estilo minimalista con fondo crema y sombras suaves' })
      .expect(200);

    expect(regenerated.body.imagePrompt).toContain('fondo crema y sombras suaves');
    expect(regenerated.body.imageProvider).toBe('mock');
    expect(regenerated.body.imageUrl).toBeTruthy();

    const after = await prisma.socialPost.findUniqueOrThrow({ where: { id: postId } });
    expect(after.imageKey).toBe(before.imageKey);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ai.social_post_image_generated', entityId: postId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.after).toMatchObject({ provider: 'mock', model: 'mock-social-1080' });
  });

  it('403 sin social:generate y 404 cross-org', async () => {
    const [postId] = createdPostIds;

    const forbidden = await vendedorAgent
      .post(`${api}/ai/social-posts/${postId}/image`)
      .send({})
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const crossOrg = await aliadaAgent
      .post(`${api}/ai/social-posts/${postId}/image`)
      .send({})
      .expect(404);
    expect(crossOrg.body.code).toBe('NOT_FOUND');
  });

  it('con IMAGE_PROVIDER=openai sin key la regeneración responde 409', async () => {
    process.env.IMAGE_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    vi.resetModules();
    const freshHarness = await import('./helpers/test-harness');
    const openaiApp = await freshHarness.createTestApp();
    try {
      const agent = request.agent(openaiApp.getHttpServer());
      await agent
        .post('/api/v1/auth/login')
        .send({ ...socialStaff, audience: 'staff' })
        .expect(200);
      const [postId] = createdPostIds;
      const response = await agent.post(`/api/v1/ai/social-posts/${postId}/image`).send({});
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('INTEGRATION_NOT_CONFIGURED');
      expect(response.body.details).toMatchObject({ provider: 'openai' });
    } finally {
      await openaiApp.close();
      process.env.IMAGE_PROVIDER = 'mock';
    }
  });
});
