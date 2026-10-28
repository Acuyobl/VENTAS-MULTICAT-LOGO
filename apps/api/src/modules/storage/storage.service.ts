import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { AppException } from '../../common/errors/app-exception';

export const DEFAULT_PRODUCT_IMAGE_URL_TTL_SECONDS = 900;
export const PUBLIC_PRODUCT_IMAGE_URL_TTL_SECONDS = 3600;

/**
 * Cliente MinIO compartido. Crea los buckets de la aplicación al arrancar para que
 * el entorno de desarrollo no dependa de un contenedor `minio/mc` adicional.
 *
 * Las imágenes de producto viven en el bucket privado (`vc-products`) y se sirven
 * con URLs firmadas de corta vida (`presignGetObject`).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly productsBucket: string;
  private readonly docsBucket: string;
  private readonly publicBucket: string;
  readonly client: MinioClient;

  constructor(private readonly config: ConfigService) {
    this.client = new MinioClient({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: this.config.get<number>('MINIO_PORT', 9000),
      useSSL: this.config.get<boolean>('MINIO_USE_SSL', false),
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.productsBucket = this.config.get<string>('MINIO_BUCKET_PRODUCTS', 'vc-products');
    this.docsBucket = this.config.get<string>('MINIO_BUCKET_DOCS', 'vc-docs');
    this.publicBucket = this.config.get<string>('MINIO_BUCKET_PUBLIC', 'vc-public');
  }

  get buckets(): string[] {
    return [this.productsBucket, this.docsBucket, this.publicBucket];
  }

  async onModuleInit(): Promise<void> {
    try {
      for (const bucket of this.buckets) {
        const exists = await this.client.bucketExists(bucket);
        if (!exists) await this.client.makeBucket(bucket);
      }
      this.logger.log({ buckets: this.buckets }, 'storage_buckets_ready');
    } catch (error) {
      // La API debe arrancar aunque MinIO no esté disponible: readiness lo reportará.
      this.logger.warn({ err: error }, 'storage_unavailable_at_boot');
    }
  }

  async ping(): Promise<boolean> {
    try {
      return await this.client.bucketExists(this.productsBucket);
    } catch {
      return false;
    }
  }

  /** Sube un objeto al bucket privado de productos. */
  async putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.putObject(this.productsBucket, key, buffer, buffer.length, {
        'Content-Type': contentType,
      });
    } catch (error) {
      throw this.storageException('put_object', key, error);
    }
  }

  /** URL firmada de descarga (bucket privado) con TTL en segundos. */
  async presignGetObject(
    key: string,
    ttlSeconds = DEFAULT_PRODUCT_IMAGE_URL_TTL_SECONDS,
  ): Promise<string> {
    try {
      return await this.client.presignedGetObject(this.productsBucket, key, ttlSeconds);
    } catch (error) {
      throw this.storageException('presign_get_object', key, error);
    }
  }

  /**
   * Igual que `presignGetObject`, pero devuelve `null` en vez de romper un
   * listado si MinIO no responde: la API sigue sirviendo los productos y la UI
   * cae al placeholder.
   */
  async presignGetObjectSafe(key: string, ttlSeconds?: number): Promise<string | null> {
    try {
      return await this.presignGetObject(key, ttlSeconds);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'storage_presign_failed');
      return null;
    }
  }

  /** Borra un objeto del bucket privado de productos. */
  async removeObject(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.productsBucket, key);
    } catch (error) {
      throw this.storageException('remove_object', key, error);
    }
  }

  private storageException(operation: string, key: string, error: unknown): AppException {
    this.logger.error({ err: error, operation, key }, 'storage_operation_failed');
    return new AppException(
      'INTERNAL_ERROR',
      503,
      { reason: 'storage_unavailable', operation, key },
      'El almacenamiento de archivos no está disponible. Intentá de nuevo en unos segundos.',
    );
  }
}
