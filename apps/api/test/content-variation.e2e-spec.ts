import { createHash } from 'node:crypto';
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

const COMBOS = [
  { platform: 'INSTAGRAM', tone: 'CERCANO', goal: 'VENTAS' },
  { platform: 'TIKTOK', tone: 'DIVERTIDO', goal: 'LANZAMIENTO' },
  { platform: 'WHATSAPP', tone: 'PREMIUM', goal: 'RECORDATORIO' },
];

describe('Contenido varía por plataforma/tono/objetivo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let versionId: string;
  let product: Product;
  let staff: StaffFixture;
  let agent!: Awaited<ReturnType<typeof loginStaff>>;
  const createdPostIds: string[] = [];
  const productImageKeys: string[] = [];

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    return agent;
  }

  async function download(url: string): Promise<{ text: string; hash: string }> {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const text = await response.text();
    return { text, hash: createHash('sha256').update(Buffer.from(text)).digest('hex') };
  }

  beforeAll(async () => {
    process.env.AI_PROVIDER = 'mock';
    process.env.IMAGE_PROVIDER = 'mock';
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Contenido Variado', slug: uniqueSlug('qa-content'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'social_manager',
      emailPrefix: 'qa-content-staff',
    });
    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo Contenido',
      slugPrefix: 'qa-content-cat',
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
        createdByUserId: staff.userId,
        activatedAt: new Date(),
      },
    });
    versionId = version.id;
    await prisma.catalog.update({ where: { id: catalogId }, data: { activeVersionId: versionId } });

    const imageKey = `qa-content/${Date.now()}-foto.png`;
    await storage.putObject(imageKey, PNG, 'image/png');
    productImageKeys.push(imageKey);
    product = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: versionId,
        sku: 'CONTENT-1',
        name: 'Café de altura',
        priceMinor: 6_000n,
        currency: 'CRC',
        stock: 10,
        imageKey,
      },
    });
    agent = await loginStaff(staff);
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
      await prisma.aiUsageLedger.deleteMany({ where: { organizationId } }).catch(() => undefined);
    }
    for (const key of productImageKeys) {
      await storage.removeObject(key).catch(() => undefined);
    }
    if (catalogId) await deleteCatalogFixture(prisma, catalogId).catch(() => undefined);
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('3 combinaciones con el mismo producto producen textos e imágenes distintas', async () => {
    const results: Array<{
      title: string;
      cta: string;
      body: string;
      hash: string;
      svg: string;
      platform: string;
      tone: string;
      goal: string;
    }> = [];

    for (const combo of COMBOS) {
      const created = await agent
        .post(`${api}/ai/social-posts`)
        .send({
          catalogId,
          platform: combo.platform,
          tone: combo.tone,
          goal: combo.goal,
          productIds: [product.id],
        })
        .expect(201);
      createdPostIds.push(created.body.id);
      expect(created.body.imageUrl).toBeTruthy();
      const image = await download(created.body.imageUrl as string);
      results.push({
        title: created.body.title as string,
        cta: created.body.cta as string,
        body: created.body.body as string,
        hash: image.hash,
        svg: image.text,
        ...combo,
      });
    }

    // Imágenes distintas y con sus atributos data-*.
    expect(new Set(results.map((result) => result.hash)).size).toBe(3);
    for (const result of results) {
      expect(result.svg).toContain(`data-platform="${result.platform}"`);
      expect(result.svg).toContain(`data-tone="${result.tone}"`);
      expect(result.svg).toContain(`data-goal="${result.goal}"`);
      expect(result.svg).toContain(PNG.toString('base64'));
    }
    expect(results[0]?.svg).toContain('OFERTA');
    expect(results[1]?.svg).toContain('NUEVO');
    expect(results[2]?.svg).toContain('ÚLTIMOS DÍAS');

    // Texto distinto por combinación.
    expect(new Set(results.map((result) => result.title)).size).toBe(3);
    expect(new Set(results.map((result) => result.cta)).size).toBe(3);
    expect(new Set(results.map((result) => result.body)).size).toBe(3);
  });

  it('regenerar con otro diseño sigue funcionando y cambia el SVG', async () => {
    const [postId] = createdPostIds;
    const before = await prisma.socialPost.findUniqueOrThrow({ where: { id: postId } });
    const previousUrl = await storage.presignPublicObject(before.imageKey as string, 600);
    const previous = await download(previousUrl);

    const regenerated = await agent
      .post(`${api}/ai/social-posts/${postId}/image`)
      .send({ design: 'EDITORIAL' })
      .expect(200);
    const next = await download(regenerated.body.imageUrl as string);
    expect(next.text).toContain('data-design="EDITORIAL"');
    expect(next.text).toContain('Georgia, serif');
    expect(next.hash).not.toBe(previous.hash);

    // El diseño no pisa plataforma/tono/objetivo del post.
    expect(next.text).toContain('data-platform="INSTAGRAM"');
    expect(next.text).toContain('data-tone="CERCANO"');
    expect(next.text).toContain('data-goal="VENTAS"');
  });
});
