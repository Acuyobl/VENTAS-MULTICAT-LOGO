import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AuthenticatedUser,
  CatalogCreateInput,
  CatalogSummary,
  CatalogUpdateInput,
} from '@ventascatalogo/contracts';
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
        throw new AppException('VALIDATION_FAILED', 409, {
          reason: 'catalog_slug_taken',
          slug: input.slug,
        });
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

  async create(
    user: AuthenticatedUser,
    input: CatalogCreateInput,
    meta: AuditMeta,
  ): Promise<CatalogSummary> {
    const slug = input.slug ?? slugifyName(input.name);
    const existing = await this.repo.findCatalogBySlug(user.organizationId, slug);
    if (existing) {
      throw new AppException('VALIDATION_FAILED', 409, {
        reason: 'catalog_slug_taken',
        slug,
      });
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
