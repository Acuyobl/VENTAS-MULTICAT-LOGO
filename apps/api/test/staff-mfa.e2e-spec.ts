import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { authenticator } from 'otplib';
import { PrismaService } from '../src/prisma/prisma.service';
import { AUTH_COOKIES } from '../src/modules/auth/cookies';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';
import {
  createStaffFixture,
  deleteUserFixture,
  setCookieHeaders,
  type StaffFixture,
} from './helpers/fixtures';

/**
 * Criterio §4.1.4 — MFA obligatorio para `org_admin`: el primer login pide
 * enrolamiento, el segundo exige TOTP, y solo entonces se opera el backoffice
 * (aquí `GET /users`, que además debe estar acotado a la organización).
 */
describe('MFA de staff y acceso al backoffice (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let admin: StaffFixture;
  let otherOrgStaff: StaffFixture;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = apiBaseUrl(app);
    admin = await createStaffFixture(prisma, {
      organizationSlug: 'demo',
      roleKey: 'org_admin',
      emailPrefix: 'qa-org-admin',
    });
    // Usuario de OTRA organización: no debe aparecer en el listado de /users.
    otherOrgStaff = await createStaffFixture(prisma, {
      organizationSlug: 'aliada',
      roleKey: 'agente_chat',
      emailPrefix: 'qa-aliada-agent',
    });
  });

  afterAll(async () => {
    if (admin) await deleteUserFixture(prisma, admin.userId);
    if (otherOrgStaff) await deleteUserFixture(prisma, otherOrgStaff.userId);
    if (app) await app.close();
  });

  it('un org_admin sin MFA enrola, verifica TOTP, opera /users y el segundo login exige TOTP', async () => {
    const agent = request.agent(server);

    // 1) Primer login: sin segundo factor configurado → enrolamiento obligatorio.
    const login = await agent
      .post(`${api}/auth/login`)
      .send({
        email: admin.email,
        password: admin.password,
        audience: 'staff',
        deviceName: 'qa-e2e-mfa',
      })
      .expect(200);
    expect(login.body.status).toBe('mfa_enrollment_required');
    expect(login.body.mfaToken).toEqual(expect.any(String));
    expect(login.body.user).toBeUndefined();
    // Sin sesión todavía: no hay cookies de staff.
    expect(setCookieHeaders(login).map((cookie) => cookie.split('=')[0])).not.toContain(
      AUTH_COOKIES.staff.access,
    );

    // 2) Enrolamiento: devuelve el secreto TOTP.
    const enroll = await agent
      .post(`${api}/auth/mfa/enroll`)
      .send({ mfaToken: login.body.mfaToken })
      .expect(200);
    expect(enroll.body.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(enroll.body.otpauthUrl).toContain('otpauth://totp/');

    // 3) Un OTP inválido no emite sesión.
    const invalidOtp = await agent
      .post(`${api}/auth/mfa/verify`)
      .send({ mfaToken: login.body.mfaToken, code: '000000' })
      .expect(401);
    expect(invalidOtp.body.code).toBe('AUTH_MFA_INVALID');

    // 4) OTP válido (otplib) → sesión staff con cookies HttpOnly.
    const code = authenticator.generate(enroll.body.secret);
    const verify = await agent
      .post(`${api}/auth/mfa/verify`)
      .send({ mfaToken: login.body.mfaToken, code })
      .expect(200);
    expect(verify.body.status).toBe('authenticated');
    expect(verify.body.user).toMatchObject({
      audience: 'staff',
      organizationId: admin.organizationId,
    });
    expect(verify.body.user.roleKeys).toContain('org_admin');
    expect(verify.body.user.permissions).toContain('user:manage');
    expect(verify.body.user.mfaEnabled).toBe(true);

    const staffCookies = setCookieHeaders(verify);
    const cookieNames = staffCookies.map((cookie) => cookie.split('=')[0]);
    expect(cookieNames).toContain(AUTH_COOKIES.staff.access);
    expect(cookieNames).toContain(AUTH_COOKIES.staff.refresh);
    expect(cookieNames).not.toContain(AUTH_COOKIES.customer.access);
    expect(
      staffCookies.find((cookie) => cookie.startsWith(`${AUTH_COOKIES.staff.access}=`)),
    ).toMatch(/HttpOnly/i);

    // 5) Ya puede operar el backoffice y solo ve los miembros de su organización.
    const me = await agent.get(`${api}/auth/me`).expect(200);
    expect(me.body).toMatchObject({ audience: 'staff', organizationId: admin.organizationId });

    const users = await agent.get(`${api}/users`).expect(200);
    const listedEmails = users.body.items.map((item: { email: string }) => item.email);
    expect(listedEmails).toContain(admin.email);
    expect(listedEmails).not.toContain(otherOrgStaff.email);
    const self = users.body.items.find((item: { email: string }) => item.email === admin.email) as {
      roleKeys: string[];
    };
    expect(self.roleKeys).toContain('org_admin');
    expect(users.body.roles.length).toBeGreaterThan(0);

    // 6) Segundo login: el MFA ya está activo, así que exige TOTP antes de la sesión.
    const secondAgent = request.agent(server);
    const secondLogin = await secondAgent
      .post(`${api}/auth/login`)
      .send({ email: admin.email, password: admin.password, audience: 'staff' })
      .expect(200);
    expect(secondLogin.body.status).toBe('mfa_required');
    expect(secondLogin.body.mfaToken).toEqual(expect.any(String));

    const secondCode = authenticator.generate(enroll.body.secret);
    const secondVerify = await secondAgent
      .post(`${api}/auth/mfa/verify`)
      .send({ mfaToken: secondLogin.body.mfaToken, code: secondCode })
      .expect(200);
    expect(secondVerify.body.status).toBe('authenticated');
    expect(secondVerify.body.user.audience).toBe('staff');
    await secondAgent.get(`${api}/users`).expect(200);
  });

  it('un mfaToken inválido no permite verificar MFA', async () => {
    const response = await request(server)
      .post(`${api}/auth/mfa/verify`)
      .send({ mfaToken: 'token-invalido-de-prueba', code: '123456' })
      .expect(401);
    expect(response.body.code).toBe('AUTH_MFA_REQUIRED');
  });
});
