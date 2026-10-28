import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ProductListQuery,
  ProductListResponse,
} from '@ventascatalogo/contracts';
import { ProductsRepository } from './products.repository';
import { CatalogsRepository } from '../catalogs/catalogs.repository';
import { AppException } from '../../common/errors/app-exception';
import { apiException } from '../../common/errors/api-error-codes';

@Injectable()
export class ProductsService {
  constructor(
    private readonly repo: ProductsRepository,
    private readonly catalogs: CatalogsRepository,
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
    return {
      items: page.items,
      nextCursor: page.nextCursor,
      catalogId: query.catalogId,
      versionId: version.id,
      versionNumber: version.versionNumber,
    };
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
