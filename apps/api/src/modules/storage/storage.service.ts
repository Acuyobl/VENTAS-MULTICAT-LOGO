import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';

/**
 * Cliente MinIO compartido. Crea los buckets de la aplicación al arrancar para que
 * el entorno de desarrollo no dependa de un contenedor `minio/mc` adicional.
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
}
