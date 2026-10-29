import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createStaffFixture,
  deleteUserFixture,
  uniqueSlug,
  type StaffFixture,
} from './helpers/fixtures';

describe('Tema visual de la app (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let otherSlug: string;
  let admin: StaffFixture;
  let vendedor: StaffFixture;
  let adminAgent!: Awaited<ReturnType<typeof loginStaff>>;
  let vendedorAgent!: Awaited<ReturnType<typeof loginStaff>>;

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

  beforeAll(async () => {
    process.env.DEV_AUTH_HELPERS = 'true';
    const harness = await import('./helpers/test-harness');
    app = await harness.createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = harness.apiBaseUrl(app);

    const slug = uniqueSlug('qa-theme');
    const organization = await prisma.organization.create({
      data: { name: 'QA Tema Visual', slug, plan: 'STARTER' },
    });
    organizationId = organization.id;
    admin = await createStaffFixture(prisma, {
      organizationSlug: slug,
      roleKey: 'org_admin',
      emailPrefix: 'qa-theme-admin',
    });
    vendedor = await createStaffFixture(prisma, {
      organizationSlug: slug,
      roleKey: 'vendedor',
      emailPrefix: 'qa-theme-vendedor',
    });

    otherSlug = uniqueSlug('qa-theme-other');
    const other = await prisma.organization.create({
      data: { name: 'QA Tema Otro', slug: otherSlug, plan: 'STARTER', appTheme: 'MODERNO' },
    });
    otherOrganizationId = other.id;

    adminAgent = await loginStaff(admin);
    vendedorAgent = await loginStaff(vendedor);
  });

  afterAll(async () => {
    for (const fixture of [admin, vendedor]) {
      if (fixture) await deleteUserFixture(prisma, fixture.userId);
    }
    if (prisma) {
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: [organizationId, otherOrganizationId] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationId, otherOrganizationId] } },
      });
    }
    if (app) await app.close();
  });

  it('GET settings incluye appTheme CLASICO por defecto y PATCH lo actualiza', async () => {
    const initial = await adminAgent.get(`${api}/organizations/settings`).expect(200);
    expect(initial.body).toMatchObject({ appTheme: 'CLASICO' });

    const patched = await adminAgent
      .patch(`${api}/organizations/settings`)
      .send({ appTheme: 'MODERNO' })
      .expect(200);
    expect(patched.body).toMatchObject({ appTheme: 'MODERNO' });

    const current = await adminAgent.get(`${api}/organizations/settings`).expect(200);
    expect(current.body).toMatchObject({ appTheme: 'MODERNO' });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'organization.settings_updated', organizationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after).toMatchObject({ appTheme: 'MODERNO' });
    expect(audit?.before).toMatchObject({ appTheme: 'CLASICO' });
  });

  it('PATCH combinado (allowSelfApproval + imageDesign + appTheme) funciona', async () => {
    const combined = await adminAgent
      .patch(`${api}/organizations/settings`)
      .send({ allowSelfApproval: true, imageDesign: 'PROMO', appTheme: 'COMPACTO' })
      .expect(200);
    expect(combined.body).toEqual({
      allowSelfApproval: true,
      imageDesign: 'PROMO',
      appTheme: 'COMPACTO',
    });
  });

  it('un tema inválido responde 422', async () => {
    const response = await adminAgent
      .patch(`${api}/organizations/settings`)
      .send({ appTheme: 'NEON' })
      .expect(422);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('GET /public/app-settings es público, cacheable y acepta ?orgSlug=', async () => {
    const anonymous = request(server);
    const defaults = await anonymous.get(`${api}/public/app-settings`).expect(200);
    expect(defaults.body).toMatchObject({
      appTheme: expect.stringMatching(/^(CLASICO|MODERNO|COMPACTO)$/),
      organizationName: expect.any(String),
      organizationSlug: expect.any(String),
    });
    expect(defaults.headers['cache-control']).toContain('max-age=');

    const other = await anonymous
      .get(`${api}/public/app-settings?orgSlug=${otherSlug}`)
      .expect(200);
    expect(other.body).toMatchObject({
      appTheme: 'MODERNO',
      organizationName: 'QA Tema Otro',
      organizationSlug: otherSlug,
    });

    const missing = await anonymous
      .get(`${api}/public/app-settings?orgSlug=no-existe-${Date.now()}`)
      .expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('403 sin settings:manage', async () => {
    await vendedorAgent.get(`${api}/organizations/settings`).expect(403);
    const patch = await vendedorAgent
      .patch(`${api}/organizations/settings`)
      .send({ appTheme: 'COMPACTO' })
      .expect(403);
    expect(patch.body.code).toBe('FORBIDDEN');
  });
});
