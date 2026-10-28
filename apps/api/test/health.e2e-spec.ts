import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { apiBaseUrl, createTestApp } from './helpers/test-harness';

/**
 * Criterio §4.1.6 — `/health/ready` responde 200 con database, redis y storage
 * en `up` y sin autenticación (es @Public). Requiere infra Docker arriba.
 */
describe('Health de la API (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let api: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    api = apiBaseUrl(app);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /health responde 200 y no exige autenticación', async () => {
    const response = await request(server).get(`${api}/health`).expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.version).toBe('0.1.0');
    expect(typeof response.body.uptimeSeconds).toBe('number');
  });

  it('GET /health/ready responde 200 con database, redis, storage y queues en up', async () => {
    const response = await request(server).get(`${api}/health/ready`).expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.checks).toEqual({
      database: 'up',
      redis: 'up',
      storage: 'up',
      queues: 'up',
    });
  });
});
