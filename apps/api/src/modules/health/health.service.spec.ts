import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';

/**
 * La readiness real abre una conexión a Redis y consulta MinIO/Postgres.
 * Aquí se sustituye ioredis por un doble para probar la lógica de agregación
 * sin infraestructura: el objetivo es el contrato `checks` del endpoint.
 */
const redisMock = vi.hoisted(() => ({
  connect: vi.fn(),
  ping: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: class MockRedis {
    connect = redisMock.connect;
    ping = redisMock.ping;
    disconnect = redisMock.disconnect;
  },
}));

function createService(options: {
  database?: () => Promise<boolean>;
  storage?: () => Promise<boolean>;
}) {
  const prisma = { ping: vi.fn(options.database ?? (async () => true)) };
  const storage = { ping: vi.fn(options.storage ?? (async () => true)) };
  const config = { getOrThrow: vi.fn(() => 'redis://localhost:6379') };
  const service = new HealthService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    storage as unknown as StorageService,
  );
  return { service, prisma, storage };
}

describe('HealthService', () => {
  it('liveness devuelve status ok, versión y uptime numérico', () => {
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue('PONG');
    const { service } = createService({});

    const result = service.liveness();
    expect(result.status).toBe('ok');
    expect(result.version).toBe('0.1.0');
    expect(typeof result.uptimeSeconds).toBe('number');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('readiness con database, redis y storage arriba devuelve status ok', async () => {
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue('PONG');
    const { service } = createService({});

    const result = await service.readiness();
    expect(result.status).toBe('ok');
    expect(result.checks).toEqual({
      database: 'up',
      redis: 'up',
      storage: 'up',
      queues: 'up',
    });
  });

  it('readiness marca database down si Postgres falla y agrega status degradado', async () => {
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue('PONG');
    const { service } = createService({
      database: async () => {
        throw new Error('postgres caído');
      },
    });

    const result = await service.readiness();
    expect(result.status).toBe('degraded');
    expect(result.checks.database).toBe('down');
    expect(result.checks.redis).toBe('up');
  });

  it('readiness marca redis y queues down si Redis no responde PONG', async () => {
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue('NOAUTH');
    const { service } = createService({});

    const result = await service.readiness();
    expect(result.status).toBe('degraded');
    expect(result.checks.redis).toBe('down');
    expect(result.checks.queues).toBe('down');
    expect(result.checks.database).toBe('up');
    expect(redisMock.disconnect).toHaveBeenCalled();
  });

  it('readiness marca storage down si MinIO falla', async () => {
    redisMock.connect.mockResolvedValue(undefined);
    redisMock.ping.mockResolvedValue('PONG');
    const { service } = createService({ storage: async () => false });

    const result = await service.readiness();
    expect(result.status).toBe('degraded');
    expect(result.checks.storage).toBe('down');
  });

  it('readiness tolera que la conexión a Redis rechace (no lanza)', async () => {
    redisMock.connect.mockRejectedValue(new Error('ECONNREFUSED'));
    redisMock.ping.mockResolvedValue('PONG');
    const { service } = createService({});

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'degraded',
      checks: { database: 'up', redis: 'down', storage: 'up', queues: 'down' },
    });
  });
});
