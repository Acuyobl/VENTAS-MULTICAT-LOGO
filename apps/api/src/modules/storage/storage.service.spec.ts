import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { AppException } from '../../common/errors/app-exception';

const minioMock = vi.hoisted(() => ({
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
  putObject: vi.fn(),
  presignedGetObject: vi.fn(),
  removeObject: vi.fn(),
}));

vi.mock('minio', () => ({
  Client: class MockMinioClient {
    bucketExists = minioMock.bucketExists;
    makeBucket = minioMock.makeBucket;
    putObject = minioMock.putObject;
    presignedGetObject = minioMock.presignedGetObject;
    removeObject = minioMock.removeObject;
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

describe('StorageService · imágenes de producto', () => {
  it('putObject sube al bucket privado con el content-type indicado', async () => {
    minioMock.putObject.mockResolvedValue(undefined);
    const service = new StorageService(configWith());
    const buffer = Buffer.from([0x89, 0x50]);

    await service.putObject('products/c/v/p-abcd12345678.png', buffer, 'image/png');

    expect(minioMock.putObject).toHaveBeenCalledWith(
      'vc-products',
      'products/c/v/p-abcd12345678.png',
      buffer,
      2,
      { 'Content-Type': 'image/png' },
    );
  });

  it('putObject fallido se traduce a INTERNAL_ERROR 503 storage_unavailable', async () => {
    minioMock.putObject.mockRejectedValue(new Error('MinIO caído'));
    const service = new StorageService(configWith());

    const error = await service
      .putObject('products/c/v/p.png', Buffer.from('x'), 'image/png')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect((error as AppException).getStatus()).toBe(503);
    expect((error as AppException).getResponse()).toMatchObject({
      details: { reason: 'storage_unavailable', operation: 'put_object' },
    });
  });

  it('presignGetObject firma contra el bucket privado con el TTL pedido', async () => {
    minioMock.presignedGetObject.mockResolvedValue('http://localhost:9000/vc-products/k?sign');
    const service = new StorageService(configWith());

    const url = await service.presignGetObject('products/k.png', 900);

    expect(url).toContain('http://localhost:9000/vc-products/k');
    expect(minioMock.presignedGetObject).toHaveBeenCalledWith('vc-products', 'products/k.png', 900);
  });

  it('presignGetObjectSafe devuelve null si MinIO no responde (el listado no se rompe)', async () => {
    minioMock.presignedGetObject.mockRejectedValue(new Error('sin conexión'));
    const service = new StorageService(configWith());

    await expect(service.presignGetObjectSafe('products/k.png')).resolves.toBeNull();
  });

  it('removeObject borra del bucket privado y propaga 503 si falla', async () => {
    minioMock.removeObject.mockResolvedValue(undefined);
    const service = new StorageService(configWith());
    await service.removeObject('products/k.png');
    expect(minioMock.removeObject).toHaveBeenCalledWith('vc-products', 'products/k.png');

    minioMock.removeObject.mockRejectedValue(new Error('MinIO caído'));
    const error = await service.removeObject('products/k.png').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(503);
  });
});
