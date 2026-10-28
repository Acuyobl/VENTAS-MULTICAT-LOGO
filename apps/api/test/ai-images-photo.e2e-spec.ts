import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { formatMoney } from '@ventascatalogo/contracts';
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

// PNG 1×1 (rojo y azul) para simular la foto del producto en MinIO.
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const BLUE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Imágenes de contenido basadas en la foto del producto (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let versionId: string;
  let photoProduct: Product;
  let otherPhotoProduct: Product;
  let noPhotoProduct: Product;
  let socialStaff: StaffFixture;
  let vendedorStaff: StaffFixture;
  let aliadaStaff: StaffFixture;
  let socialAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let aliadaAgent!: Awaited<ReturnType<typeof loginStaff>>;
  const createdPostIds: string[] = [];
  const productImageKeys: string[] = [];
  const originalEnv: Record<string, string | undefined> = {};

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    return agent;
  }

  async function generatePost(productId: string) {
    const response = await socialAgent
      .post(`${api}/ai/social-posts`)
      .send({
        catalogId,
        platform: 'INSTAGRAM',
        tone: 'CERCANO',
        goal: 'VENTAS',
        productIds: [productId],
      })
      .expect(201);
    createdPostIds.push(response.body.id);
    return response.body as { id: string; imageUrl: string | null; imageProvider: string | null };
  }

  async function download(
    url: string,
  ): Promise<{ status: number; contentType: string; text: string }> {
    const response = await fetch(url);
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      text: await response.text(),
    };
  }

  beforeAll(async () => {
    originalEnv.AI_PROVIDER = process.env.AI_PROVIDER;
    originalEnv.IMAGE_PROVIDER = process.env.IMAGE_PROVIDER;
    process.env.AI_PROVIDER = 'mock';
    process.env.IMAGE_PROVIDER = 'mock';

    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Fotos IA', slug: uniqueSlug('qa-photo'), plan: 'STARTER' },
    });
    organizationId = organization.id;

    socialStaff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'social_manager',
      emailPrefix: 'qa-photo-social',
    });
    vendedorStaff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-photo-vendedor',
    });
    aliadaStaff = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'social_manager',
      emailPrefix: 'qa-photo-aliada',
    });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo Fotos IA',
      slugPrefix: 'qa-photo-cat',
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
        productCount: 3,
        createdByUserId: socialStaff.userId,
        activatedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    versionId = version.id;
    await prisma.catalog.update({ where: { id: catalogId }, data: { activeVersionId: versionId } });

    const photoKeyRed = `ai-posts-qa/${Date.now()}-rojo.png`;
    const photoKeyBlue = `ai-posts-qa/${Date.now()}-azul.png`;
    await storage.putObject(photoKeyRed, RED_PNG, 'image/png');
    await storage.putObject(photoKeyBlue, BLUE_PNG, 'image/png');
    productImageKeys.push(photoKeyRed, photoKeyBlue);

    photoProduct = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: versionId,
        sku: 'PHOTO-1',
        name: 'Café de altura con foto',
        priceMinor: 6_000n,
        currency: 'CRC',
        stock: 10,
        imageKey: photoKeyRed,
      },
    });
    otherPhotoProduct = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: versionId,
        sku: 'PHOTO-2',
        name: 'Miel de abeja con foto',
        priceMinor: 8_000n,
        currency: 'CRC',
        stock: 5,
        imageKey: photoKeyBlue,
      },
    });
    noPhotoProduct = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: versionId,
        sku: 'PHOTO-3',
        name: 'Vela sin foto',
        priceMinor: 4_000n,
        currency: 'CRC',
        stock: 8,
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
    for (const key of productImageKeys) {
      await storage.removeObject(key).catch(() => undefined);
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

  it('genera la imagen con la foto del producto como data:image base64', async () => {
    const post = await generatePost(photoProduct.id);
    expect(post.imageProvider).toBe('mock');
    expect(post.imageUrl).toBeTruthy();

    const image = await download(post.imageUrl!);
    expect(image.status).toBe(200);
    expect(image.contentType).toContain('image/svg+xml');
    expect(image.text).toContain('data:image/png;base64,');
    expect(image.text).toContain(RED_PNG.toString('base64'));
    expect(image.text).toContain('data-photo="true"');
    expect(image.text).toContain('Café de altura con foto');
    expect(image.text).toContain(formatMoney(6_000n, 'CRC'));
  });

  it('dos productos con fotos distintas producen imágenes distintas', async () => {
    const first = await generatePost(photoProduct.id);
    const second = await generatePost(otherPhotoProduct.id);
    const firstImage = await download(first.imageUrl!);
    const secondImage = await download(second.imageUrl!);

    expect(firstImage.text).toContain(RED_PNG.toString('base64'));
    expect(secondImage.text).toContain(BLUE_PNG.toString('base64'));
    expect(firstImage.text).not.toBe(secondImage.text);
  });

  it('regenerar con prompt custom cambia la imagen', async () => {
    const post = await generatePost(photoProduct.id);
    const before = await download(post.imageUrl!);

    const regenerated = await socialAgent
      .post(`${api}/ai/social-posts/${post.id}/image`)
      .send({ prompt: 'Fondo crema, estilo editorial y sombras suaves' })
      .expect(200);
    expect(regenerated.body.imagePrompt).toContain('estilo editorial');

    const after = await download(regenerated.body.imageUrl!);
    expect(after.text).toContain('data:image/png;base64,');
    expect(after.text).not.toBe(before.text);
  });

  it('sin foto del producto cae al degradado de marca', async () => {
    const post = await generatePost(noPhotoProduct.id);
    const image = await download(post.imageUrl!);
    expect(image.status).toBe(200);
    expect(image.text).toContain('data-photo="false"');
    expect(image.text).not.toContain('data:image/');
    expect(image.text).toContain('Vela sin foto');
  });

  it('403 sin social:generate y 404 cross-org al regenerar', async () => {
    const post = await generatePost(photoProduct.id);

    const forbidden = await vendedorAgent
      .post(`${api}/ai/social-posts/${post.id}/image`)
      .send({})
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const crossOrg = await aliadaAgent
      .post(`${api}/ai/social-posts/${post.id}/image`)
      .send({})
      .expect(404);
    expect(crossOrg.body.code).toBe('NOT_FOUND');
  });
});
