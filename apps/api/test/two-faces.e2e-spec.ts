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
  setCookieHeaders,
  type CustomerFixture,
} from './helpers/fixtures';

/**
 * Criterio §4.1.2 — dos audiencias: login de cliente con `aud=customer` y
 * rechazo `403 AUTH_WRONG_AUDIENCE` cuando un token de cliente toca la
 * superficie de staff (A-R9 / AUTHZ-T09).
 */
describe('Dos audiencias: login de cliente y cruce a superficie staff (e2e)', () => {
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

  it('login de cliente devuelve aud=customer, permisos self:* y cookies separadas', async () => {
    const agent = request.agent(server);
    const response = await agent
      .post(`${api}/auth/login`)
      .send({
        email: customer.email,
        password: customer.password,
        audience: 'customer',
        deviceName: 'qa-e2e',
      })
      .expect(200);

    expect(response.body.status).toBe('authenticated');
    expect(response.body.user.audience).toBe('customer');
    expect(response.body.user.organizationId).toBe(customer.organizationId);
    expect(response.body.user.roleKeys).toEqual(['customer']);
    expect(response.body.user.permissions.length).toBeGreaterThan(0);
    expect(response.body.user.permissions.every((p: string) => p.startsWith('self:'))).toBe(true);
    expect(response.body.accessTokenExpiresAt).toBeTruthy();

    const cookies = setCookieHeaders(response);
    const names = cookies.map((cookie) => cookie.split('=')[0]);
    expect(names).toContain(AUTH_COOKIES.customer.access);
    expect(names).toContain(AUTH_COOKIES.customer.refresh);
    expect(names).not.toContain(AUTH_COOKIES.staff.access);

    const accessCookie = cookies.find((cookie) =>
      cookie.startsWith(`${AUTH_COOKIES.customer.access}=`),
    );
    expect(accessCookie).toMatch(/HttpOnly/i);
    expect(accessCookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get(`${api}/auth/me`).expect(200);
    expect(me.body).toMatchObject({
      audience: 'customer',
      organizationId: customer.organizationId,
      roleKeys: ['customer'],
    });
    expect(me.body.permissions).not.toContain('catalog:read');
    expect(cookieValue(me, AUTH_COOKIES.customer.access)).toBeUndefined();
  });

  it('un token de cliente contra /users responde 403 AUTH_WRONG_AUDIENCE con expected/received', async () => {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ email: customer.email, password: customer.password, audience: 'customer' })
      .expect(200);

    const response = await agent.get(`${api}/users`).expect(403);
    expect(response.body.code).toBe('AUTH_WRONG_AUDIENCE');
    expect(response.body.details).toEqual({ expected: 'staff', received: 'customer' });
    expect(response.body.traceId).toBeTruthy();
    expect(response.headers['x-request-id']).toBe(response.body.traceId);
  });

  it('un token de cliente contra /catalogs (staff) responde 403 AUTH_WRONG_AUDIENCE', async () => {
    const agent = request.agent(server);
    await agent
      .post(`${api}/auth/login`)
      .send({ email: customer.email, password: customer.password, audience: 'customer' })
      .expect(200);

    const response = await agent.get(`${api}/catalogs`).expect(403);
    expect(response.body.code).toBe('AUTH_WRONG_AUDIENCE');
    expect(response.body.details).toEqual({ expected: 'staff', received: 'customer' });
  });

  it('sin cookie de sesión, una ruta protegida responde 401 UNAUTHORIZED', async () => {
    const response = await request(server).get(`${api}/catalogs`).expect(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('un body inválido en login responde 400 con code VALIDATION_FAILED y detalles', async () => {
    const response = await request(server)
      .post(`${api}/auth/login`)
      .send({ email: 'no-es-un-email', password: '', audience: 'staff' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details).toBeTruthy();
    expect(response.body.details.fieldErrors).toMatchObject({
      email: expect.any(Array),
    });
    expect(response.body.traceId).toBeTruthy();
  });

  it('credenciales incorrectas responden 401 sin revelar si el email existe', async () => {
    const unknown = await request(server)
      .post(`${api}/auth/login`)
      .send({ email: 'nadie@qa.ventascatalogo.test', password: 'Demo1234!' })
      .expect(401);
    expect(unknown.body.code).toBe('UNAUTHORIZED');

    const wrongPassword = await request(server)
      .post(`${api}/auth/login`)
      .send({ email: customer.email, password: 'OtraClave123!' })
      .expect(401);
    expect(wrongPassword.body.code).toBe('UNAUTHORIZED');
  });
});
