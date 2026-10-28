import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

const minioMock = vi.hoisted(() => ({
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
}));

vi.mock('minio', () => ({
  Client: class MockMinioClient {
    bucketExists = minioMock.bucketExists;
    makeBucket = minioMock.makeBucket;
  },
}));

function configWith(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: 9000,
    MINIO_USE_SSL: false,
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin',
    MINIO_BUCKET_PRODUCTS: 'vc-products',
    MINIO_BUCKET_DOCS: 'vc-docs',
    MINIO_BUCKET_PUBLIC: 'vc-public',
    ...overrides,
  };
  return {
    get: (key: string, defaultValue?: unknown) => values[key] ?? defaultValue,
  } as unknown as ConfigService;
}

describe('StorageService', () => {
  it('expone los tres buckets de la aplicación', () => {
    const service = new StorageService(configWith());
    expect(service.buckets).toEqual(['vc-products', 'vc-docs', 'vc-public']);
  });

  it('respeta nombres de bucket personalizados por configuración', () => {
    const service = new StorageService(
      configWith({
        MINIO_BUCKET_PRODUCTS: 'qa-products',
        MINIO_BUCKET_DOCS: 'qa-docs',
        MINIO_BUCKET_PUBLIC: 'qa-public',
      }),
    );
    expect(service.buckets).toEqual(['qa-products', 'qa-docs', 'qa-public']);
  });

  it('onModuleInit crea solo los buckets que no existen', async () => {
    minioMock.bucketExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    minioMock.makeBucket.mockResolvedValue(undefined);
    const service = new StorageService(configWith());

    await service.onModuleInit();

    expect(minioMock.bucketExists).toHaveBeenCalledTimes(3);
    expect(minioMock.makeBucket).toHaveBeenCalledTimes(2);
    expect(minioMock.makeBucket).toHaveBeenNthCalledWith(1, 'vc-docs');
    expect(minioMock.makeBucket).toHaveBeenNthCalledWith(2, 'vc-public');
  });

  it('onModuleInit no lanza si MinIO no está disponible (readiness lo reporta)', async () => {
    minioMock.bucketExists.mockRejectedValue(new Error('MinIO caído'));
    const service = new StorageService(configWith());

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('ping devuelve true cuando el bucket existe', async () => {
    minioMock.bucketExists.mockResolvedValue(true);
    const service = new StorageService(configWith());
    await expect(service.ping()).resolves.toBe(true);
  });

  it('ping devuelve false cuando MinIO falla', async () => {
    minioMock.bucketExists.mockRejectedValue(new Error('sin conexión'));
    const service = new StorageService(configWith());
    await expect(service.ping()).resolves.toBe(false);
  });
});
