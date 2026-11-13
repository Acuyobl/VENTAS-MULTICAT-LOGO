import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import type {
  AuthenticatedUser,
  BulkPriceAdjustmentInput,
  BulkPriceApplyResponse,
  BulkPricePreviewResponse,
  CatalogCategoriesResponse,
  CatalogCreateInput,
  CatalogDuplicateInput,
  CatalogSummary,
  CatalogUpdateInput,
  Currency,
} from '@ventascatalogo/contracts';
import { formatMoney, MINOR_FACTOR } from '@ventascatalogo/contracts';
import { CatalogsRepository } from './catalogs.repository';
import { AppException } from '../../common/errors/app-exception';
import { PUBLIC_PRODUCT_IMAGE_URL_TTL_SECONDS, StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

@Injectable()
export class CatalogsService {
  constructor(
    private readonly repo: CatalogsRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser) {
    const rows = await this.repo.listForMember(user.organizationId, user.id, user.audience);
    return {
      items: rows.map(({ catalog, productCount, latestVersion }) => ({
        id: catalog.id,
        name: catalog.name,
        slug: catalog.slug,
        description: catalog.description,
        activeVersionId: catalog.activeVersionId,
        activeVersionNumber:
          catalog.activeVersion?.versionNumber ?? latestVersion?.versionNumber ?? null,
        productCount,
        currency: catalog.activeVersion?.currency ?? latestVersion?.currency ?? 'CRC',
        updatedAt: catalog.updatedAt.toISOString(),
      })),
    };
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    input: CatalogUpdateInput,
    meta: AuditMeta,
  ): Promise<CatalogSummary> {
    const catalog = await this.repo.findForMember(id, user.id, user.audience, user.organizationId);
    if (!catalog) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }

    let slug = catalog.slug;
    if (input.slug && input.slug !== catalog.slug) {
      const existing = await this.repo.findCatalogBySlug(user.organizationId, input.slug);
      if (existing && existing.id !== id) {
        throw new AppException(
          'VALIDATION_FAILED',
          409,
          { reason: 'catalog_slug_taken', slug: input.slug },
          'Ya existe un catálogo con ese nombre. Elegí otro nombre o actualizá el catálogo existente.',
        );
      }
      slug = input.slug;
    } else if (input.name && !input.slug && input.name !== catalog.name) {
      const newSlug = slugifyName(input.name);
      const existing = await this.repo.findCatalogBySlug(user.organizationId, newSlug);
      if (!existing || existing.id === id) {
        slug = newSlug;
      }
    }

    const updated = await this.repo.updateCatalog(id, {
      name: input.name ?? catalog.name,
      slug,
      description: input.description !== undefined ? input.description : catalog.description,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'catalog.updated',
      entityType: 'catalog',
      entityId: catalog.id,
      before: { name: catalog.name, slug: catalog.slug, description: catalog.description },
      after: { name: updated.name, slug: updated.slug, description: updated.description },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    const activeVersion = catalog.activeVersion;
    const productCount = activeVersion
      ? await this.repo.countActiveProducts(activeVersion.id)
      : 0;

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      activeVersionId: updated.activeVersionId,
      activeVersionNumber: activeVersion?.versionNumber ?? null,
      productCount,
      currency: activeVersion?.currency ?? 'CRC',
      updatedAt: updated.updatedAt.toISOString(),
    } as CatalogSummary;
  }

  /** Subcarpetas (categorías) del catálogo con su conteo de productos. */
  async subcatalogs(
    user: AuthenticatedUser,
    catalogId: string,
  ): Promise<Array<{ name: string; count: number }>> {
    const catalog = await this.repo.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }
    if (!catalog.activeVersionId) return [];
    const filas = await this.repo.listCategories(catalogId, catalog.activeVersionId);
    return filas
      .filter((fila) => Boolean(fila.category))
      .map((fila) => ({ name: fila.category as string, count: fila._count._all }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  }

  async create(
    user: AuthenticatedUser,
    input: CatalogCreateInput,
    meta: AuditMeta,
  ): Promise<CatalogSummary> {
    const slug = input.slug ?? slugifyName(input.name);
    const existing = await this.repo.findCatalogBySlug(user.organizationId, slug);
    if (existing) {
      throw new AppException(
        'VALIDATION_FAILED',
        409,
        { reason: 'catalog_slug_taken', slug },
        'Ya existe un catálogo con ese nombre. Elegí otro nombre o actualizá el catálogo existente.',
      );
    }
    const catalog = await this.repo.createCatalog({
      organizationId: user.organizationId,
      name: input.name,
      slug,
      description: input.description ?? null,
    });
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'catalog.created',
      entityType: 'catalog',
      entityId: catalog.id,
      after: { name: catalog.name, slug: catalog.slug, description: catalog.description },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return {
      id: catalog.id,
      name: catalog.name,
      slug: catalog.slug,
      description: catalog.description,
      activeVersionId: catalog.activeVersionId,
      activeVersionNumber: null,
      productCount: 0,
      currency: 'CRC',
      updatedAt: catalog.updatedAt.toISOString(),
    } as CatalogSummary;
  }
  async getPublic(slug: string) {
    const catalog = await this.repo.findPublicBySlug(slug);
    if (!catalog || !catalog.activeVersion) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }
    const products = await Promise.all(
      catalog.activeVersion.products.map(async (product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        category: product.category,
        brand: product.brand,
        priceMinor: product.priceMinor.toString(),
        currency: product.currency,
        stock: product.stock,
        attributes: product.attributes,
        imageKey: product.imageKey,
        // El catálogo público es una cara de solo lectura: la URL firmada dura 1 h
        // para que la página no dependa de recargar el listado cada 15 minutos.
        imageUrl: product.imageKey
          ? await this.storage.presignGetObjectSafe(
              product.imageKey,
              PUBLIC_PRODUCT_IMAGE_URL_TTL_SECONDS,
            )
          : null,
      })),
    );

    return {
      id: catalog.id,
      name: catalog.name,
      slug: catalog.slug,
      description: catalog.description,
      organizationName: catalog.organization.name,
      versionId: catalog.activeVersion.id,
      versionNumber: catalog.activeVersion.versionNumber,
      currency: catalog.activeVersion.currency,
      taxRateBp: catalog.activeVersion.taxRateBp,
      taxIncluded: catalog.activeVersion.taxIncluded,
      products,
    };
  }

  /** Soft delete: 409 si hay pedidos abiertos y archiva la versión activa. */
  async delete(user: AuthenticatedUser, catalogId: string, meta: AuditMeta): Promise<void> {
    const catalog = await this.repo.findCatalogForDelete(user.organizationId, catalogId);
    if (!catalog) {
      throw new AppException('NOT_FOUND', 404, { resource: 'catalog' });
    }
    const openOrders = await this.repo.countOpenOrders(catalog.id);
    if (openOrders > 0) {
      throw new AppException('VALIDATION_FAILED', 409, {
        reason: 'catalog_has_open_orders',
        catalogId: catalog.id,
        openOrders,
      });
    }
    const deletedSlug = deletedCatalogSlug(catalog.slug);
    await this.repo.softDeleteCatalog(catalog.id, catalog.activeVersionId, deletedSlug);
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'catalog.deleted',
      entityType: 'catalog',
      entityId: catalog.id,
      before: {
        name: catalog.name,
        slug: catalog.slug,
        activeVersionId: catalog.activeVersionId,
      },
      after: {
        deletedAt: new Date().toISOString(),
        activeVersionId: null,
        slug: deletedSlug,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
  }

  async duplicate(
    user: AuthenticatedUser,
    catalogId: string,
    input: CatalogDuplicateInput,
    meta: AuditMeta,
  ): Promise<CatalogSummary> {
    const original = await this.repo.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!original) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }

    let slug = input.slug?.trim() || slugifyName(input.name);
    const existing = await this.repo.findCatalogBySlug(user.organizationId, slug);
    if (existing) {
      if (input.slug) {
        throw new AppException(
          'VALIDATION_FAILED',
          409,
          { reason: 'catalog_slug_taken', slug: input.slug },
          'Ya existe un catálogo con ese nombre. Elegí otro nombre o actualizá el catálogo existente.',
        );
      }
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const result = await this.repo.duplicateCatalog(catalogId, user.organizationId, user.id, {
      name: input.name,
      slug,
      description: input.description,
    });

    if (!result) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'catalog.duplicated',
      entityType: 'catalog',
      entityId: result.catalog.id,
      after: {
        sourceCatalogId: catalogId,
        newCatalogId: result.catalog.id,
        name: result.catalog.name,
        slug: result.catalog.slug,
        productCount: result.productCount,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return {
      id: result.catalog.id,
      name: result.catalog.name,
      slug: result.catalog.slug,
      description: result.catalog.description,
      activeVersionId: result.catalog.activeVersionId,
      activeVersionNumber: result.activeVersionNumber,
      productCount: result.productCount,
      currency: result.currency,
      updatedAt: result.catalog.updatedAt.toISOString(),
    } as CatalogSummary;
  }

  async export(
    user: AuthenticatedUser,
    catalogId: string,
    format: 'xlsx' | 'csv' = 'xlsx',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const catalog = await this.repo.findCatalogWithActiveProducts(catalogId, user.organizationId);
    if (!catalog) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }
    if (!catalog.activeVersion) {
      throw new AppException('NO_ACTIVE_VERSION', 409, {
        reason: 'catalog_has_no_active_version',
        catalogId,
      });
    }

    const version = catalog.activeVersion;
    const currency = version.currency as Currency;
    const factor = MINOR_FACTOR[currency] ?? 1;

    const rows = await Promise.all(
      version.products.map(async (p) => {
        const imageUrl = p.imageKey
          ? await this.storage.presignGetObjectSafe(
              p.imageKey,
              PUBLIC_PRODUCT_IMAGE_URL_TTL_SECONDS,
            )
          : '';
        const price = Number(p.priceMinor) / factor;

        let attrString = '';
        if (p.attributes) {
          attrString =
            typeof p.attributes === 'object'
              ? JSON.stringify(p.attributes)
              : String(p.attributes);
        }

        return {
          SKU: p.sku,
          Nombre: p.name,
          Categoría: p.category ?? '',
          Marca: p.brand ?? '',
          Precio: price,
          Moneda: p.currency,
          Stock: p.stock !== null ? p.stock : '',
          Descripción: p.description ?? '',
          'URL de Imagen': imageUrl ?? '',
          Atributos: attrString,
        };
      }),
    );

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [
        'SKU',
        'Nombre',
        'Categoría',
        'Marca',
        'Precio',
        'Moneda',
        'Stock',
        'Descripción',
        'URL de Imagen',
        'Atributos',
      ],
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const buffer = Buffer.from('\uFEFF' + csv, 'utf-8');
      return {
        buffer,
        filename: `${catalog.slug}-productos.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    return {
      buffer,
      filename: `${catalog.slug}-productos.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async getCategories(
    user: AuthenticatedUser,
    catalogId: string,
  ): Promise<CatalogCategoriesResponse> {
    const catalog = await this.repo.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }
    if (!catalog.activeVersionId) {
      return { categories: [] };
    }
    const categories = await this.repo.getActiveCategories(catalogId, catalog.activeVersionId);
    return { categories };
  }

  async previewBulkPriceAdjustment(
    user: AuthenticatedUser,
    catalogId: string,
    input: BulkPriceAdjustmentInput,
  ): Promise<BulkPricePreviewResponse> {
    const catalog = await this.repo.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }
    if (!catalog.activeVersionId || !catalog.activeVersion) {
      throw new AppException('NO_ACTIVE_VERSION', 409, {
        reason: 'catalog_has_no_active_version',
        catalogId,
      });
    }

    const version = catalog.activeVersion;
    const currency = version.currency as Currency;
    const products = await this.repo.getActiveProductsForPriceAdjustment(
      catalogId,
      version.id,
      input.scope,
      input.category,
    );

    const sampleItems = products.map((product) => {
      const newPriceMinor = calculateAdjustedPrice(
        product.priceMinor,
        currency,
        input,
      );
      const differenceMinor = newPriceMinor - product.priceMinor;

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        currentPriceMinor: product.priceMinor.toString(),
        newPriceMinor: newPriceMinor.toString(),
        differenceMinor: differenceMinor.toString(),
        currentPriceFormatted: formatMoney(product.priceMinor, currency),
        newPriceFormatted: formatMoney(newPriceMinor, currency),
      };
    });

    return {
      totalProducts: products.length,
      currency,
      sampleItems: sampleItems.slice(0, 50),
    };
  }

  async applyBulkPriceAdjustment(
    user: AuthenticatedUser,
    catalogId: string,
    input: BulkPriceAdjustmentInput,
    meta: AuditMeta,
  ): Promise<BulkPriceApplyResponse> {
    const catalog = await this.repo.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }
    if (!catalog.activeVersionId || !catalog.activeVersion) {
      throw new AppException('NO_ACTIVE_VERSION', 409, {
        reason: 'catalog_has_no_active_version',
        catalogId,
      });
    }

    const version = catalog.activeVersion;
    const currency = version.currency as Currency;
    const products = await this.repo.getActiveProductsForPriceAdjustment(
      catalogId,
      version.id,
      input.scope,
      input.category,
    );

    const updates: Array<{ id: string; priceMinor: bigint }> = [];
    for (const p of products) {
      const newPriceMinor = calculateAdjustedPrice(p.priceMinor, currency, input);
      if (newPriceMinor !== p.priceMinor) {
        updates.push({ id: p.id, priceMinor: newPriceMinor });
      }
    }

    const updatedCount = await this.repo.applyBulkProductPriceUpdates(updates);

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'catalog.bulk_price_adjustment',
      entityType: 'catalog',
      entityId: catalog.id,
      after: {
        scope: input.scope,
        category: input.category ?? null,
        type: input.type,
        direction: input.direction,
        value: input.value,
        totalProducts: products.length,
        updatedCount,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return {
      updatedCount,
      message: `Se actualizaron ${updatedCount} productos correctamente.`,
    };
  }
}

export function calculateAdjustedPrice(
  currentMinor: bigint,
  currency: Currency,
  input: {
    type: 'PERCENTAGE' | 'FIXED';
    direction: 'INCREASE' | 'DECREASE';
    value: number;
  },
): bigint {
  const factor = MINOR_FACTOR[currency] ?? 1;
  let newMinor: bigint;

  if (input.type === 'PERCENTAGE') {
    const bp = BigInt(Math.round(input.value * 100));
    const delta = (currentMinor * bp + 5000n) / 10000n;
    newMinor = input.direction === 'INCREASE' ? currentMinor + delta : currentMinor - delta;
  } else {
    const deltaMinor = BigInt(Math.round(input.value * factor));
    newMinor = input.direction === 'INCREASE' ? currentMinor + deltaMinor : currentMinor - deltaMinor;
  }

  if (newMinor <= 0n) {
    newMinor = 1n;
  }

  return newMinor;
}

/** Slug URL-safe a partir del nombre (sin acentos, guiones simples). */
export function slugifyName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'catalogo'
  );
}

/**
 * Slug del catálogo borrado: libera el original para poder recrearlo y deja
 * rastro estable (`<slug>-eliminado-<sufijo>`, ≤80, solo [a-z0-9-]).
 */
export function deletedCatalogSlug(originalSlug: string, suffix?: string): string {
  const marker = '-eliminado-';
  const rawSuffix = (suffix ?? `${Date.now().toString(36)}${randomUUID().slice(0, 4)}`)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);
  const safeSuffix = rawSuffix || 'x';
  const base = originalSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, Math.max(1, 80 - marker.length - safeSuffix.length))
    .replace(/-+$/g, '');
  return `${base || 'catalogo'}${marker}${safeSuffix}`;
}
