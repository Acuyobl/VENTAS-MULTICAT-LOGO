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

describe('Renombrar catálogo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let staff: StaffFixture;
  let agent!: Awaited<ReturnType<typeof loginStaff>>;
  const createdCatalogIds: string[] = [];

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
      data: { name: 'QA Rename', slug: uniqueSlug('qa-rename'), plan: 'STARTER' },
    });
    organizationId = organization.id;
    staff = await createStaffFixture(prisma, {
      organizationSlug: organization.slug,
      roleKey: 'catalog_admin',
      emailPrefix: 'qa-rename-staff',
    });
    agent = await loginStaff(staff);
  });

  afterAll(async () => {
    if (prisma) await prisma.auditLog.deleteMany({ where: { organizationId } });
    for (const id of createdCatalogIds) {
      await deleteCatalogFixture(prisma, id).catch(() => undefined);
    }
    if (staff) await deleteUserFixture(prisma, staff.userId);
    if (prisma) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (app) await app.close();
  });

  it('cambia nombre y slug, y rechaza un slug ya usado', async () => {
    const originalSlug = uniqueSlug('qa-original');
    const created = await agent
      .post(`${api}/catalogs`)
      .send({ name: 'Catálogo Original', slug: originalSlug })
      .expect(201);
    createdCatalogIds.push(created.body.id);

    const newSlug = uniqueSlug('qa-renombrado');
    const renamed = await agent
      .patch(`${api}/catalogs/${created.body.id}`)
      .send({ name: 'Catálogo Renombrado', slug: newSlug })
      .expect(200);
    expect(renamed.body).toMatchObject({ id: created.body.id, name: 'Catálogo Renombrado', slug: newSlug });

    const stored = await prisma.catalog.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.slug).toBe(newSlug);

    const list = await agent.get(`${api}/catalogs`).expect(200);
    const listed = list.body.items.find((item: { id: string }) => item.id === created.body.id);
    expect(listed).toMatchObject({ name: 'Catálogo Renombrado', slug: newSlug });

    const other = await agent
      .post(`${api}/catalogs`)
      .send({ name: 'Otro Catálogo', slug: uniqueSlug('qa-otro') })
      .expect(201);
    createdCatalogIds.push(other.body.id);

    const conflict = await agent
      .patch(`${api}/catalogs/${other.body.id}`)
      .send({ slug: newSlug })
      .expect(409);
    expect(conflict.body.code).toBe('VALIDATION_FAILED');
    expect(conflict.body.details).toMatchObject({ reason: 'catalog_slug_taken', slug: newSlug });

    const invalid = await agent
      .patch(`${api}/catalogs/${created.body.id}`)
      .send({ slug: 'Slug Inválido!!' })
      .expect((response) => {
        if (![400, 422].includes(response.status)) {
          throw new Error(`esperaba 400/422, recibió ${response.status}`);
        }
      });
    expect(invalid.body.code).toBe('VALIDATION_FAILED');
  });
});
