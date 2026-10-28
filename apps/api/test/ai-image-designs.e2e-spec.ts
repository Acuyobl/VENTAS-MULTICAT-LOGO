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

describe('Diseños de imagen configurables (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let catalogId: string;
  let versionId: string;
  let product: Product;
  let admin: StaffFixture;
  let vendedor: StaffFixture;
  let adminAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;
  const createdPostIds: string[] = [];
  const productImageKeys: string[] = [];
  const originalEnv: Record<string, string | undefined> = {};

  async function loginStaff(fixture: { email: string; password: string }) {
    const agent = request.agent(server);
    const login = await agent
      .post(`${api}/auth/login`)
      .send({ ...fixture, audience: 'staff' })
      .expect(200);
    if (login.body.status === 'authenticated') return agent;
    const mfaToken = login.body.mfaToken as string;
    if (login.body.status === 'mfa_enrollment_required') {
      await agent.post(`${api}/auth/mfa/enroll`).send({ mfaToken }).expect(200);
    }
    const totp = await agent.post(`${api}/auth/dev/totp`).send({ mfaToken }).expect(200);
    await agent.post(`${api}/auth/mfa/verify`).send({ mfaToken, code: totp.body.code }).expect(200);
    return agent;
  }

  async function download(url: string): Promise<string> {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    return response.text();
  }

  beforeAll(async () => {
    originalEnv.DEV_AUTH_HELPERS = process.env.DEV_AUTH_HELPERS;
    originalEnv.AI_PROVIDER = process.env.AI_PROVIDER;
    originalEnv.IMAGE_PROVIDER = process.env.IMAGE_PROVIDER;
    process.env.DEV_AUTH_HELPERS = 'true';
    process.env.AI_PROVIDER = 'mock';
    process.env.IMAGE_PROVIDER = 'mock';

    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const organization = await prisma.organization.create({
      data: { name: 'QA Diseños IA', slug: uniqueSlug('qa-design'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    admin = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'org_admin',
      emailPrefix: 'qa-design-admin',
    });
    vendedor = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-design-vendedor',
    });

    const catalog = await createCatalogFixture(prisma, {
      organizationId,
      name: 'Catálogo Diseños',
      slugPrefix: 'qa-design-cat',
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
        createdByUserId: admin.userId,
        activatedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    versionId = version.id;
    await prisma.catalog.update({ where: { id: catalogId }, data: { activeVersionId: versionId } });

    const imageKey = `qa-designs/${Date.now()}-foto.png`;
    await storage.putObject(imageKey, PNG, 'image/png');
    productImageKeys.push(imageKey);
    product = await prisma.product.create({
      data: {
        catalogId,
        catalogVersionId: versionId,
        sku: 'DESIGN-1',
        name: 'Café de altura',
        priceMinor: 6_000n,
        currency: 'CRC',
        stock: 10,
        imageKey,
      },
    });

    adminAgent = await loginStaff(admin);
    vendedorAgent = await loginStaff(vendedor);
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
    for (const fixture of [admin, vendedor]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (app) await app.close();
  });

  it('GET /ai/image-designs devuelve 3 diseños con previews data:image/svg+xml', async () => {
    const response = await adminAgent.get(`${api}/ai/image-designs`).expect(200);
    expect(response.body.items.map((item: { key: string }) => item.key)).toEqual([
      'CLASICA',
      'EDITORIAL',
      'PROMO',
    ]);
    for (const item of response.body.items as Array<{
      key: string;
      label: string;
      description: string;
      previewDataUri: string;
    }>) {
      expect(item.previewDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
      const svg = Buffer.from(item.previewDataUri.split(',')[1]!, 'base64').toString('utf8');
      expect(svg).toContain(`data-design="${item.key}"`);
      expect(svg).toContain('data-photo="false"');
    }
  });

  it('PATCH /organizations/settings cambia imageDesign y sigue aceptando allowSelfApproval', async () => {
    const initial = await adminAgent.get(`${api}/organizations/settings`).expect(200);
    expect(initial.body).toEqual({ allowSelfApproval: false, imageDesign: 'CLASICA' });

    const patched = await adminAgent
      .patch(`${api}/organizations/settings`)
      .send({ imageDesign: 'PROMO' })
      .expect(200);
    expect(patched.body).toEqual({ allowSelfApproval: false, imageDesign: 'PROMO' });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'organization.settings_updated', organizationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after).toMatchObject({ imageDesign: 'PROMO' });

    const onlyApproval = await adminAgent
      .patch(`${api}/organizations/settings`)
      .send({ allowSelfApproval: true })
      .expect(200);
    expect(onlyApproval.body).toEqual({ allowSelfApproval: true, imageDesign: 'PROMO' });
  });

  it('crear publicación usa el diseño de la organización (PROMO)', async () => {
    const response = await adminAgent
      .post(`${api}/ai/social-posts`)
      .send({
        catalogId,
        platform: 'INSTAGRAM',
        tone: 'CERCANO',
        goal: 'VENTAS',
        productIds: [product.id],
      })
      .expect(201);
    createdPostIds.push(response.body.id);
    expect(response.body.imageDesign).toBe('PROMO');
    expect(response.body.imageUrl).toBeTruthy();

    const svg = await download(response.body.imageUrl);
    expect(svg).toContain('data-design="PROMO"');
    expect(svg).toContain('data-photo="true"');
    expect(svg).toContain('OFERTA');
    expect(svg).toContain(PNG.toString('base64'));
  });

  it('regenerar con design=EDITORIAL produce otro SVG y guarda el diseño', async () => {
    const [postId] = createdPostIds;
    const before = await prisma.socialPost.findUniqueOrThrow({ where: { id: postId } });
    const beforeSvg = await download(before.imageKey ? await presign(before.imageKey) : '');

    const regenerated = await adminAgent
      .post(`${api}/ai/social-posts/${postId}/image`)
      .send({ design: 'EDITORIAL', prompt: 'Estilo revista con fondo crema' })
      .expect(200);
    expect(regenerated.body.imageDesign).toBe('EDITORIAL');

    const afterSvg = await download(regenerated.body.imageUrl);
    expect(afterSvg).toContain('data-design="EDITORIAL"');
    expect(afterSvg).toContain('Georgia, serif');
    expect(afterSvg).not.toBe(beforeSvg);

    const after = await prisma.socialPost.findUniqueOrThrow({ where: { id: postId } });
    expect(after.imageDesign).toBe('EDITORIAL');
    expect(after.imageKey).toBe(before.imageKey);
  });

  it('403 sin social:generate ni settings:manage', async () => {
    const designs = await vendedorAgent.get(`${api}/ai/image-designs`).expect(403);
    expect(designs.body.code).toBe('FORBIDDEN');

    const settings = await vendedorAgent
      .patch(`${api}/organizations/settings`)
      .send({ imageDesign: 'PROMO' })
      .expect(403);
    expect(settings.body.code).toBe('FORBIDDEN');
  });

  async function presign(key: string): Promise<string> {
    return storage.presignPublicObject(key, 3600);
  }
});
