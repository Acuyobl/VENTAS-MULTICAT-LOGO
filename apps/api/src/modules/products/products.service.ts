import { Injectable, Logger } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ProductListQuery,
  ProductListResponse,
} from '@ventascatalogo/contracts';
import { ProductsRepository } from './products.repository';
import { CatalogsRepository } from '../catalogs/catalogs.repository';
import { AppException } from '../../common/errors/app-exception';
import { apiException } from '../../common/errors/api-error-codes';
import { DEFAULT_PRODUCT_IMAGE_URL_TTL_SECONDS, StorageService } from '../storage/storage.service';
import { productImageKey, validateProductImageFile } from '../storage/image-utils';
import { sha256 } from '../../common/utils/crypto';

export interface ProductImageUploadResult {
  imageKey: string;
  imageUrl: string;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly repo: ProductsRepository,
    private readonly catalogs: CatalogsRepository,
    private readonly storage: StorageService,
  ) {}

  /**
   * Lista productos de una versión. Sin `versionId` usa la versión activa; si el
   * catálogo no tiene ninguna responde `409 NO_ACTIVE_VERSION`. Un catálogo de
   * otra organización responde `404 CATALOG_NOT_FOUND` (nunca 403).
   */
  async list(user: AuthenticatedUser, query: ProductListQuery): Promise<ProductListResponse> {
    const catalog = await this.catalogs.findForMember(
      query.catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) throw new AppException('CATALOG_NOT_FOUND', 404);

    const version = query.versionId
      ? await this.resolveVersion(query.catalogId, query.versionId)
      : this.activeVersion(catalog.activeVersion, query.catalogId);

    const page = await this.repo.listPage(query.catalogId, version.id, query);
    const items = await Promise.all(
      page.items.map(async (item) => ({
        ...item,
        imageUrl: item.imageKey
          ? await this.storage.presignGetObjectSafe(
              item.imageKey,
              DEFAULT_PRODUCT_IMAGE_URL_TTL_SECONDS,
            )
          : null,
      })),
    );

    return {
      items,
      nextCursor: page.nextCursor,
      catalogId: query.catalogId,
      versionId: version.id,
      versionNumber: version.versionNumber,
    };
  }

  /**
   * Sube (o reemplaza) la imagen de un producto. El objeto anterior se borra
   * best-effort: si MinIO falla al borrar no se pierde la subida.
   */
  async uploadImage(
    user: AuthenticatedUser,
    productId: string,
    file: Express.Multer.File | undefined,
  ): Promise<ProductImageUploadResult> {
    const product = await this.assertProductForMember(user, productId);

    if (!file?.buffer) {
      throw new AppException(
        'VALIDATION_FAILED',
        400,
        { field: 'file', reason: 'missing' },
        'Falta el archivo de imagen.',
      );
    }

    const validation = validateProductImageFile(file);
    if (!validation.ok) {
      throw new AppException(
        'VALIDATION_FAILED',
        400,
        { field: 'file', reason: validation.reason },
        validation.message,
      );
    }

    const checksum = sha256(file.buffer);
    const imageKey = productImageKey({
      catalogId: product.catalogId,
      catalogVersionId: product.catalogVersionId,
      productId: product.id,
      checksum,
      ext: validation.ext,
    });

    await this.storage.putObject(imageKey, file.buffer, validation.contentType);
    const previousKey = product.imageKey;
    await this.repo.updateImageKey(product.id, imageKey);
    if (previousKey && previousKey !== imageKey) await this.removeImageBestEffort(previousKey);

    return {
      imageKey,
      imageUrl: await this.storage.presignGetObject(
        imageKey,
        DEFAULT_PRODUCT_IMAGE_URL_TTL_SECONDS,
      ),
    };
  }

  /** Quita la imagen del producto y borra el objeto best-effort. */
  async removeImage(user: AuthenticatedUser, productId: string): Promise<{ imageKey: null }> {
    const product = await this.assertProductForMember(user, productId);
    const previousKey = product.imageKey;

    await this.repo.updateImageKey(product.id, null);
    if (previousKey) await this.removeImageBestEffort(previousKey);

    return { imageKey: null };
  }

  private async assertProductForMember(user: AuthenticatedUser, productId: string) {
    const product = await this.repo.findProductForImage(productId);
    if (
      !product ||
      product.catalog.deletedAt ||
      product.catalog.organizationId !== user.organizationId
    ) {
      throw new AppException('NOT_FOUND', 404, { resource: 'product' });
    }
    return product;
  }

  private async removeImageBestEffort(imageKey: string): Promise<void> {
    try {
      await this.storage.removeObject(imageKey);
    } catch (error) {
      this.logger.warn({ err: error, imageKey }, 'product_image_remove_failed');
    }
  }

  private async resolveVersion(catalogId: string, versionId: string) {
    const version = await this.repo.findVersion(catalogId, versionId);
    if (!version) throw new AppException('NOT_FOUND', 404, { resource: 'catalogVersion' });
    return version;
  }

  private activeVersion(
    activeVersion: { id: string; versionNumber: number } | null,
    catalogId: string,
  ) {
    if (!activeVersion) {
      throw apiException(
        'NO_ACTIVE_VERSION',
        409,
        { catalogId },
        'El catálogo todavía no tiene una versión activa.',
      );
    }
    return activeVersion;
  }
}
