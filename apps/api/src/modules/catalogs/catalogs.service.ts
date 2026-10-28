import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { CatalogsRepository } from './catalogs.repository';
import { AppException } from '../../common/errors/app-exception';

@Injectable()
export class CatalogsService {
  constructor(private readonly repo: CatalogsRepository) {}

  async list(user: AuthenticatedUser) {
    const rows = await this.repo.listForMember(user.organizationId, user.id, user.audience);
    return {
      items: rows.map(({ catalog, productCount }) => ({
        id: catalog.id,
        name: catalog.name,
        slug: catalog.slug,
        description: catalog.description,
        activeVersionId: catalog.activeVersionId,
        activeVersionNumber: catalog.activeVersion?.versionNumber ?? null,
        productCount,
        currency: catalog.activeVersion?.currency ?? 'CRC',
        updatedAt: catalog.updatedAt.toISOString(),
      })),
    };
  }

  async getPublic(slug: string) {
    const catalog = await this.repo.findPublicBySlug(slug);
    if (!catalog || !catalog.activeVersion) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }
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
      products: catalog.activeVersion.products.map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        category: product.category,
        brand: product.brand,
        priceMinor: product.priceMinor.toString(),
        currency: product.currency,
        stock: product.stock,
        imageKey: product.imageKey,
      })),
    };
  }
}
