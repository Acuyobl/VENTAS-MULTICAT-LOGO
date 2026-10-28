import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AuthenticatedUser,
  ProductDetail,
  ProductListQuery,
  ProductListResponse,
  ProductUpdateInput,
} from '@ventascatalogo/contracts';
import { ProductsRepository, type ProductDetailRow } from './products.repository';
import { CatalogsRepository } from '../catalogs/catalogs.repository';
import { AppException } from '../../common/errors/app-exception';
import { apiException } from '../../common/errors/api-error-codes';
import {
  DEFAULT_PRODUCT_IMAGE_URL_TTL_SECONDS,
  PUBLIC_PRODUCT_IMAGE_URL_TTL_SECONDS,
  StorageService,
} from '../storage/storage.service';
import { productImageKey, validateProductImageFile } from '../storage/image-utils';
import { sha256 } from '../../common/utils/crypto';
import { canViewProductCost } from './product-permissions';
import { buildProductUpdateDiff, isProductVersionEditable } from './product-update';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

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
    private readonly audit: AuditService,
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

  /** Detalle de producto con imagen firmada, atributos y versión (A-R6 en costo). */
  async detail(user: AuthenticatedUser, productId: string): Promise<ProductDetail> {
    const row = await this.requireDetail(user, productId);
    const imageUrl = row.imageKey
      ? await this.storage.presignGetObjectSafe(row.imageKey, PUBLIC_PRODUCT_IMAGE_URL_TTL_SECONDS)
      : null;
    return this.toDetail(row, user, imageUrl);
  }

  /**
   * Edición de producto: solo campos enviados, solo en la versión activa del
   * catálogo (inmutabilidad histórica) y con audit before/after.
   */
  async update(
    user: AuthenticatedUser,
    productId: string,
    input: ProductUpdateInput,
    meta: AuditMeta,
  ): Promise<ProductDetail> {
    if (Object.keys(input).length === 0) {
      throw new AppException('VALIDATION_FAILED', 422, {
        reason: 'empty_body',
        fieldErrors: { body: ['Enviá al menos un campo para editar.'] },
      });
    }

    const row = await this.requireDetail(user, productId);
    if (
      !isProductVersionEditable({
        versionId: row.catalogVersion.id,
        versionStatus: row.catalogVersion.status,
        activeVersionId: row.catalog.activeVersionId,
      })
    ) {
      throw new AppException('CATALOG_ARCHIVED', 409, {
        reason: 'version_not_editable',
        versionId: row.catalogVersion.id,
        versionStatus: row.catalogVersion.status,
        versionNumber: row.catalogVersion.versionNumber,
      });
    }

    const diff = buildProductUpdateDiff(row, input);
    if (Object.keys(diff.data).length > 0) {
      await this.repo.updateProduct(row.id, this.toPrismaUpdate(diff.data));
      await this.audit.write({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: 'product.updated',
        entityType: 'product',
        entityId: row.id,
        before: diff.before,
        after: diff.after,
        ip: meta.ip,
        userAgent: meta.userAgent,
        traceId: meta.traceId,
      });
    }

    const updated = await this.requireDetail(user, productId);
    const imageUrl = updated.imageKey
      ? await this.storage.presignGetObjectSafe(
          updated.imageKey,
          PUBLIC_PRODUCT_IMAGE_URL_TTL_SECONDS,
        )
      : null;
    return this.toDetail(updated, user, imageUrl);
  }

  private toPrismaUpdate(
    data: Partial<
      Record<
        'name' | 'description' | 'category' | 'brand' | 'priceMinor' | 'costMinor' | 'stock',
        string | bigint | number | null
      >
    >,
  ): Prisma.ProductUpdateInput {
    const update: Prisma.ProductUpdateInput = {};
    if ('name' in data) update.name = data.name as string;
    if ('description' in data) update.description = data.description as string | null;
    if ('category' in data) update.category = data.category as string | null;
    if ('brand' in data) update.brand = data.brand as string | null;
    if ('priceMinor' in data) update.priceMinor = data.priceMinor as bigint;
    if ('costMinor' in data) update.costMinor = data.costMinor as bigint | null;
    if ('stock' in data) update.stock = data.stock as number | null;
    return update;
  }
  private async requireDetail(
    user: AuthenticatedUser,
    productId: string,
  ): Promise<ProductDetailRow> {
    const row = await this.repo.findDetail(productId);
    // Otra organización o producto borrado: 404 sin revelar existencia.
    if (!row || row.catalog.organizationId !== user.organizationId) {
      throw new AppException('NOT_FOUND', 404, { resource: 'product' });
    }
    return row;
  }

  private toDetail(
    row: ProductDetailRow,
    user: AuthenticatedUser,
    imageUrl: string | null,
  ): ProductDetail {
    return {
      id: row.id,
      catalogId: row.catalogId,
      catalogVersionId: row.catalogVersionId,
      sku: row.sku,
      name: row.name,
      description: row.description,
      category: row.category,
      brand: row.brand,
      priceMinor: row.priceMinor.toString(),
      // A-R6: el costo no se serializa para vendedor/social_manager/agente_chat.
      costMinor:
        canViewProductCost(user) && row.costMinor !== null ? row.costMinor.toString() : null,
      currency: row.currency,
      stock: row.stock,
      attributes: (row.attributes ?? null) as Record<string, unknown> | null,
      imageKey: row.imageKey,
      imageUrl,
      isActive: row.isActive,
      catalogName: row.catalog.name,
      versionNumber: row.catalogVersion.versionNumber,
      versionStatus: row.catalogVersion.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
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
