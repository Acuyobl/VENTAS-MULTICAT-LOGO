import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { authenticator } from 'otplib';
import { PrismaService } from '../src/prisma/prisma.service';
import { AUTH_COOKIES } from '../src/modules/auth/cookies';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';
import { deleteSeedActivitySince, setCookieHeaders } from './helpers/fixtures';

const ADMIN_EMAIL = process.env.SEED_STAFF_EMAIL ?? 'admin@ventascatalogo.local';
const ADMIN_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? 'Demo1234!';

/**
 * Tarea 10 — helper de MFA solo para desarrollo.
 *
 * Con `DEV_AUTH_HELPERS=true`, `POST /auth/dev/totp` entrega el TOTP vigente a
 * partir del `mfaToken` para que el login staff se autocomplete; con el flag
 * apagado la ruta responde 404. El TOTP se sigue validando en
 * `POST /auth/mfa/verify` (no se salta la verificación).
 */
describe('Dev auth helpers: autocompletar TOTP en desarrollo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let startedAt: Date;
  let adminId: string;
  let originalFlag: string | undefined;
  let originalMfa: { mfaEnabled: boolean; mfaSecretEnc: string | null };

  /**
   * Un TOTP puede rotar entre generarlo y verificarlo (ventana de 30 s). Se
   * reintenta una vez con un código nuevo para que el E2E no sea flaky en el
   * borde exacto de la ventana.
   */
  async function devCodeAndVerify(agent: ReturnType<typeof request.agent>, mfaToken: string) {
    let lastVerify: request.Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const devTotp = await agent.post(`${api}/auth/dev/totp`).send({ mfaToken }).expect(200);
      expect(devTotp.body.code).toMatch(/^\d{6}$/);
      expect(devTotp.body.expiresInSeconds).toBeGreaterThanOrEqual(1);
      expect(devTotp.body.expiresInSeconds).toBeLessThanOrEqual(30);

      const verify = await agent
        .post(`${api}/auth/mfa/verify`)
        .send({ mfaToken, code: devTotp.body.code });
      if (verify.status === 200) return verify;
      lastVerify = verify;
    }
    return lastVerify as request.Response;
  }

  beforeAll(async () => {
    startedAt = new Date();
    originalFlag = process.env.DEV_AUTH_HELPERS;
    process.env.DEV_AUTH_HELPERS = 'true';

    app = await createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = apiBaseUrl(app);

    const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!admin) {
      throw new Error(`Falta el admin sembrado (${ADMIN_EMAIL}): ejecutá "pnpm db:seed".`);
    }
    adminId = admin.id;
    originalMfa = { mfaEnabled: admin.mfaEnabled, mfaSecretEnc: admin.mfaSecretEnc };

    // Estado determinista para recorrer el enrolamiento.
    await prisma.user.update({
      where: { id: adminId },
      data: { mfaEnabled: false, mfaSecretEnc: null },
    });
  });

  afterAll(async () => {
    if (prisma && adminId) {
      // El seed queda como estaba (normalmente sin MFA enrolado).
      await prisma.user.update({
        where: { id: adminId },
        data: {
          mfaEnabled: originalMfa.mfaEnabled,
          mfaSecretEnc: originalMfa.mfaSecretEnc,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await deleteSeedActivitySince(prisma, adminId, startedAt);
    }
    if (originalFlag === undefined) delete process.env.DEV_AUTH_HELPERS;
    else process.env.DEV_AUTH_HELPERS = originalFlag;
    if (app) await app.close();
  });

  it('entrega el TOTP para el enrolamiento y para el siguiente login del admin sembrado', async () => {
    const agent = request.agent(server);

    // 1) Primer login del admin: pide enrolar el segundo factor.
    const login = await agent
      .post(`${api}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, audience: 'staff' })
      .expect(200);
    expect(login.body.status).toBe('mfa_enrollment_required');
    expect(login.body.mfaToken).toEqual(expect.any(String));
    const enrollToken = login.body.mfaToken as string;

    // 2) Enrolamiento: devuelve el secreto que la web puede usar para generar el
    //    primer código por su cuenta.
    const enroll = await agent
      .post(`${api}/auth/mfa/enroll`)
      .send({ mfaToken: enrollToken })
      .expect(200);
    expect(enroll.body.secret).toMatch(/^[A-Z2-7]+=*$/);

    // 3) El helper devuelve un TOTP válido para ese secreto y los segundos que le
    //    quedan de vida, sin que la web conozca el secreto.
    const devTotp = await agent
      .post(`${api}/auth/dev/totp`)
      .send({ mfaToken: enrollToken })
      .expect(200);
    expect(devTotp.body.code).toMatch(/^\d{6}$/);
    expect(devTotp.body.expiresInSeconds).toBeGreaterThanOrEqual(1);
    expect(devTotp.body.expiresInSeconds).toBeLessThanOrEqual(30);
    expect(authenticator.check(devTotp.body.code, enroll.body.secret)).toBe(true);

    // 4) El código del helper pasa la verificación real de MFA.
    const verify = await devCodeAndVerify(agent, enrollToken);
    expect(verify.status).toBe(200);
    expect(verify.body.status).toBe('authenticated');
    expect(verify.body.user).toMatchObject({ audience: 'staff', mfaEnabled: true });
    expect(setCookieHeaders(verify).map((cookie) => cookie.split('=')[0])).toContain(
      AUTH_COOKIES.staff.access,
    );

    // 5) Login posterior: la web ya no tiene el secreto, pero el helper sigue
    //    resolviendo el TOTP con el nuevo mfaToken.
    const secondAgent = request.agent(server);
    const secondLogin = await secondAgent
      .post(`${api}/auth/login`)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, audience: 'staff' })
      .expect(200);
    expect(secondLogin.body.status).toBe('mfa_required');

    const secondVerify = await devCodeAndVerify(secondAgent, secondLogin.body.mfaToken as string);
    expect(secondVerify.status).toBe(200);
    expect(secondVerify.body.status).toBe('authenticated');
    await secondAgent.get(`${api}/auth/me`).expect(200);
  });

  it('un mfaToken inválido responde 401 AUTH_MFA_REQUIRED', async () => {
    const response = await request(server)
      .post(`${api}/auth/dev/totp`)
      .send({ mfaToken: 'token-invalido-de-desarrollo' })
      .expect(401);
    expect(response.body.code).toBe('AUTH_MFA_REQUIRED');
  });

  it('con el flag apagado el endpoint responde 404 NOT_FOUND (no existe)', async () => {
    process.env.DEV_AUTH_HELPERS = 'false';

    // `ConfigModule.forRoot()` valida el entorno al evaluar `AppModule` (una sola
    // vez por registro de módulos), así que para una app realmente "sin flag" hay
    // que reiniciar el registro y volver a importar el arnés.
    vi.resetModules();
    const freshHarness = await import('./helpers/test-harness');
    const appWithoutHelpers = await freshHarness.createTestApp();
    const apiWithoutHelpers = freshHarness.apiBaseUrl(appWithoutHelpers);
    try {
      const response = await request(appWithoutHelpers.getHttpServer())
        .post(`${apiWithoutHelpers}/auth/dev/totp`)
        .send({ mfaToken: 'token-invalido-de-desarrollo' })
        .expect(404);
      expect(response.body.code).toBe('NOT_FOUND');

      // El resto de la autenticación sigue funcionando sin el helper.
      await request(appWithoutHelpers.getHttpServer())
        .post(`${apiWithoutHelpers}/auth/login`)
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, audience: 'staff' })
        .expect(200);
    } finally {
      await appWithoutHelpers.close();
    }
  });
});
