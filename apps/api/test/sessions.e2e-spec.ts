import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AUTH_COOKIES } from '../src/modules/auth/cookies';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';
import {
  cookieValue,
  createCustomerFixture,
  deleteUserFixture,
  type CustomerFixture,
} from './helpers/fixtures';

/**
 * Criterio §4.1.5 — rotación de refresh con detección de reutilización y
 * revocación de sesión: el siguiente refresh de una sesión revocada responde
 * `401 AUTH_SESSION_REVOKED` (RF-USR-03).
 */
describe('Sesiones: rotación de refresh, reutilización y revocación (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let api: string;
  let customer: CustomerFixture;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
    api = apiBaseUrl(app);
    customer = await createCustomerFixture(prisma, { organizationSlug: 'demo' });
  });

  afterAll(async () => {
    if (customer) await deleteUserFixture(prisma, customer.userId);
    if (app) await app.close();
  });

  async function loginAgent() {
    const agent = request.agent(server);
    const login = await agent
      .post(`${api}/auth/login`)
      .send({ email: customer.email, password: customer.password, audience: 'customer' })
      .expect(200);
    return { agent, login };
  }

  it('refresh rota el par de tokens y detecta la reutilización del refresh anterior', async () => {
    const { agent, login } = await loginAgent();
    const originalRefresh = cookieValue(login, AUTH_COOKIES.customer.refresh);
    expect(originalRefresh).toBeTruthy();

    const refreshed = await agent
      .post(`${api}/auth/refresh`)
      .send({ audience: 'customer' })
      .expect(200);
    expect(refreshed.body.status).toBe('authenticated');
    expect(refreshed.body.user.audience).toBe('customer');

    const rotatedRefresh = cookieValue(refreshed, AUTH_COOKIES.customer.refresh);
    expect(rotatedRefresh).toBeTruthy();
    expect(rotatedRefresh).not.toBe(originalRefresh);
    // El access token se reemite con TTL nueva (dos JWT iguales en el mismo
    // segundo son deterministas: la rotación se prueba con el refresh).
    expect(cookieValue(refreshed, AUTH_COOKIES.customer.access)).toBeTruthy();
    expect(refreshed.body.accessTokenExpiresAt).toBeTruthy();

    // El refresh ya rotado no se puede reutilizar: se revoca toda la familia.
    const reuse = await request(server)
      .post(`${api}/auth/refresh`)
      .set('Cookie', `${AUTH_COOKIES.customer.refresh}=${originalRefresh}`)
      .send({ audience: 'customer' })
      .expect(401);
    expect(reuse.body.code).toBe('AUTH_SESSION_REVOKED');

    // La familia completa quedó revocada, incluido el token rotado vigente.
    const afterReuse = await agent
      .post(`${api}/auth/refresh`)
      .send({ audience: 'customer' })
      .expect(401);
    expect(afterReuse.body.code).toBe('AUTH_SESSION_REVOKED');
  });

  it('revocar la sesión desde /auth/sessions invalida el refresh (401 AUTH_SESSION_REVOKED)', async () => {
    const { agent } = await loginAgent();

    const sessions = await agent.get(`${api}/auth/sessions`).expect(200);
    expect(sessions.body.items.length).toBeGreaterThan(0);
    const current = sessions.body.items[0] as { id: string; audience: string };
    expect(current.audience).toBe('CUSTOMER');

    const revoked = await agent.delete(`${api}/auth/sessions/${current.id}`).expect(200);
    expect(revoked.body.status).toBe('revoked');

    const refresh = await agent
      .post(`${api}/auth/refresh`)
      .send({ audience: 'customer' })
      .expect(401);
    expect(refresh.body.code).toBe('AUTH_SESSION_REVOKED');
  });

  it('refresh sin cookie responde 401 y explica el motivo', async () => {
    const response = await request(server)
      .post(`${api}/auth/refresh`)
      .send({ audience: 'customer' })
      .expect(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
    expect(response.body.details).toEqual({ reason: 'refresh_cookie_missing' });
  });

  it('un refresh de cliente no sirve en la audiencia staff (cookie separada por cara)', async () => {
    const { login } = await loginAgent();
    const customerRefresh = cookieValue(login, AUTH_COOKIES.customer.refresh);
    expect(customerRefresh).toBeTruthy();

    const crossAudience = await request(server)
      .post(`${api}/auth/refresh`)
      .set('Cookie', `${AUTH_COOKIES.staff.refresh}=${customerRefresh}`)
      .send({ audience: 'staff' })
      .expect(401);
    expect(crossAudience.body.code).toBe('UNAUTHORIZED');
  });
});
