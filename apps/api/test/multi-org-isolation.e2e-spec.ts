import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';
import {
  createCatalogFixture,
  deleteCatalogFixture,
  deleteSeedActivitySince,
  requireOrgId,
  type CatalogFixture,
} from './helpers/fixtures';

const MIXTO_EMAIL = process.env.SEED_DUAL_EMAIL ?? 'mixto@ventascatalogo.local';
const MIXTO_PASSWORD = process.env.SEED_DUAL_PASSWORD ?? 'Demo1234!';

/**
 * Criterio §4.1.2 + AUTHZ-T11 — el usuario `mixto` es staff (vendedor) en la
 * organización Demo y cliente en Aliada: ningún endpoint de staff puede
 * devolver datos de la organización donde solo es cliente, y la audiencia
 * customer no puede consumir la superficie de backoffice.
 */
describe('Aislamiento multi-org del usuario mixto (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let startedAt: Date;
  let demoOrgId: string;
  let aliadaOrgId: string;
  let mixtoUserId: string;
  let aliadaCatalog: CatalogFixture;

  beforeAll(async () => {
    startedAt = new Date();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = apiBaseUrl(app);

    demoOrgId = await requireOrgId(prisma, 'demo');
    aliadaOrgId = await requireOrgId(prisma, 'aliada');

    const mixto = await prisma.user.findUnique({ where: { email: MIXTO_EMAIL } });
    if (!mixto) throw new Error(`Falta el usuario mixto (${MIXTO_EMAIL}): ejecutá "pnpm db:seed".`);
    mixtoUserId = mixto.id;

    // Catálogo con un nombre inconfundible en la org donde mixto es solo cliente.
    aliadaCatalog = await createCatalogFixture(prisma, {
      organizationId: aliadaOrgId,
      name: 'Catálogo Aliada QA (no visible para staff de Demo)',
      slugPrefix: 'qa-aliada',
    });
  });

  afterAll(async () => {
    if (aliadaCatalog) await deleteCatalogFixture(prisma, aliadaCatalog.catalogId);
    if (mixtoUserId) await deleteSeedActivitySince(prisma, mixtoUserId, startedAt);
    if (app) await app.close();
  });

  it('como staff de Demo solo lista catálogos de Demo y no de Aliada', async () => {
    const agent = request.agent(server);
    const login = await agent
      .post(`${api}/auth/login`)
      .send({ email: MIXTO_EMAIL, password: MIXTO_PASSWORD, audience: 'staff' })
      .expect(200);

    // Es vendedor: no exige MFA y entra directo.
    expect(login.body.status).toBe('authenticated');
    expect(login.body.user).toMatchObject({
      audience: 'staff',
      organizationId: demoOrgId,
      organizationSlug: 'demo',
    });
    expect(login.body.user.roleKeys).toEqual(['vendedor']);
    expect(login.body.user.permissions).toContain('catalog:read');
    expect(login.body.user.permissions.some((p: string) => p.startsWith('self:'))).toBe(false);

    const catalogs = await agent.get(`${api}/catalogs`).expect(200);
    const ids = catalogs.body.items.map((item: { id: string }) => item.id);
    const slugs = catalogs.body.items.map((item: { slug: string }) => item.slug);

    // Todo lo devuelto pertenece a la organización Demo.
    const demoCatalogs = await prisma.catalog.findMany({
      where: { organizationId: demoOrgId, deletedAt: null },
      select: { id: true, slug: true },
    });
    const demoIds = new Set(demoCatalogs.map((catalog) => catalog.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id: string) => demoIds.has(id))).toBe(true);
    expect(slugs).not.toContain(aliadaCatalog.slug);
    expect(ids).not.toContain(aliadaCatalog.catalogId);
    expect(slugs).toContain('catalogo-demo');

    // El vendedor no administra usuarios: 403 por permiso faltante (RBAC).
    const forbidden = await agent.get(`${api}/users`).expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    expect(forbidden.body.details).toEqual({ missing: ['user:manage'] });
  });

  it('como cliente de Aliada no mezcla la audiencia staff ni ve permisos de backoffice', async () => {
    const agent = request.agent(server);
    const login = await agent
      .post(`${api}/auth/login`)
      .send({ email: MIXTO_EMAIL, password: MIXTO_PASSWORD, audience: 'customer' })
      .expect(200);

    expect(login.body.status).toBe('authenticated');
    expect(login.body.user.audience).toBe('customer');
    expect(login.body.user.organizationId).toBe(aliadaOrgId);
    expect(login.body.user.organizationSlug).toBe('aliada');
    expect(login.body.user.roleKeys).toEqual(['customer']);
    expect(login.body.user.permissions.every((p: string) => p.startsWith('self:'))).toBe(true);
    expect(login.body.user.permissions).not.toContain('catalog:read');

    const me = await agent.get(`${api}/auth/me`).expect(200);
    expect(me.body).toMatchObject({
      audience: 'customer',
      organizationId: aliadaOrgId,
      roleKeys: ['customer'],
    });

    // La misma persona no arrastra su rol de vendedor de Demo a la cara cliente.
    expect(me.body.permissions).not.toContain('catalog:read');
    expect(me.body.permissions).not.toContain('user:manage');
    expect(me.body.roleKeys).not.toContain('vendedor');

    // Superficie staff desde token de cliente → rechazo de audiencia.
    const wrongAudience = await agent.get(`${api}/catalogs`).expect(403);
    expect(wrongAudience.body.code).toBe('AUTH_WRONG_AUDIENCE');
    expect(wrongAudience.body.details).toEqual({ expected: 'staff', received: 'customer' });
  });
});
