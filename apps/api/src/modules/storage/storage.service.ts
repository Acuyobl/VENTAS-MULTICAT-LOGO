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

  /** Nombre del bucket privado de imágenes de producto. */
  get productBucketName(): string {
    return this.productsBucket;
  }

  /** Nombre del bucket público (`vc-public`). */
  get publicBucketName(): string {
    return this.publicBucket;
  }

  /**
   * Lee un objeto de cualquier bucket como Buffer (o `null` si no existe o
   * MinIO falla). Se usa para componer las imágenes de contenido con la foto
   * del producto.
   */
  async getObjectBuffer(bucket: string, key: string): Promise<Buffer | null> {
    try {
      const stream = await this.client.getObject(bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'NoSuchKey' || code === 'NoSuchBucket' || code === 'NotFound') return null;
      this.logger.warn({ err: error, bucket, key }, 'storage_get_object_failed');
      return null;
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

  private formatPublicUrl(url: string): string {
    const publicBase = this.config.get<string>('STORAGE_PUBLIC_URL', '').trim();
    if (!publicBase) return url;
    try {
      const parsed = new URL(url);
      const target = new URL(publicBase);
      parsed.protocol = target.protocol;
      parsed.hostname = target.hostname;
      parsed.port = target.port;
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /** URL firmada de descarga (bucket privado) con TTL en segundos. */
  async presignGetObject(
    key: string,
    ttlSeconds = DEFAULT_PRODUCT_IMAGE_URL_TTL_SECONDS,
  ): Promise<string> {
    try {
      const presigned = await this.client.presignedGetObject(this.productsBucket, key, ttlSeconds);
      return this.formatPublicUrl(presigned);
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

  /** Sube un documento (p. ej. el PDF de una cotización) al bucket privado `vc-docs`. */
  async putDocument(key: string, buffer: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.putObject(this.docsBucket, key, buffer, buffer.length, {
        'Content-Type': contentType,
      });
    } catch (error) {
      throw this.storageException('put_document', key, error);
    }
  }

  /** URL firmada de descarga de un documento de `vc-docs`. */
  async presignDocument(key: string, ttlSeconds = 300): Promise<string> {
    try {
      const presigned = await this.client.presignedGetObject(this.docsBucket, key, ttlSeconds);
      return this.formatPublicUrl(presigned);
    } catch (error) {
      throw this.storageException('presign_document', key, error);
    }
  }

  /** Igual que `presignDocument`, pero `null` si MinIO no responde. */
  async presignDocumentSafe(key: string, ttlSeconds = 300): Promise<string | null> {
    try {
      return await this.presignDocument(key, ttlSeconds);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'storage_presign_document_failed');
      return null;
    }
  }

  /** Borra un documento de `vc-docs` (limpieza best-effort). */
  async removeDocument(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.docsBucket, key);
    } catch (error) {
      throw this.storageException('remove_document', key, error);
    }
  }

  /** Sube un objeto al bucket público (`vc-public`) para assets servibles por URL firmada. */
  async putPublicObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.putObject(this.publicBucket, key, buffer, buffer.length, {
        'Content-Type': contentType,
      });
    } catch (error) {
      throw this.storageException('put_public_object', key, error);
    }
  }

  /** URL firmada de descarga de `vc-public` (TTL 3600 s por defecto). */
  async presignPublicObject(
    key: string,
    ttlSeconds = PUBLIC_PRODUCT_IMAGE_URL_TTL_SECONDS,
  ): Promise<string> {
    try {
      return await this.client.presignedGetObject(this.publicBucket, key, ttlSeconds);
    } catch (error) {
      throw this.storageException('presign_public_object', key, error);
    }
  }

  /** Igual que `presignPublicObject`, pero `null` si MinIO no responde. */
  async presignPublicObjectSafe(key: string, ttlSeconds?: number): Promise<string | null> {
    try {
      return await this.presignPublicObject(key, ttlSeconds);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'storage_presign_public_failed');
      return null;
    }
  }

  /** Borra un objeto de `vc-public` (limpieza best-effort). */
  async removePublicObject(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.publicBucket, key);
    } catch (error) {
      throw this.storageException('remove_public_object', key, error);
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
