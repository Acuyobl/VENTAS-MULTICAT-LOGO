import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { AppException } from '../errors/app-exception';
import type { CatalogScope } from '../catalog/catalog-scope.types';
import { CatalogsRepository } from '../../modules/catalogs/catalogs.repository';

@Injectable()
export class CatalogScopeGuard implements CanActivate {
  constructor(private readonly catalogs: CatalogsRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
      catalogScope?: CatalogScope;
    }>();
    const user = request.user;
    if (!user) throw new AppException('UNAUTHORIZED', 401);

    const catalogIdHeader = request.headers['x-catalog-id'];
    const catalogId = Array.isArray(catalogIdHeader) ? catalogIdHeader[0] : catalogIdHeader;
    if (!catalogId) throw new AppException('CATALOG_SCOPE_REQUIRED', 400);

    const catalog = await this.catalogs.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) throw new AppException('CATALOG_NOT_FOUND', 404);

    const versionHeader = request.headers['x-catalog-version-id'];
    const requestedVersionId = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;
    const version = requestedVersionId
      ? await this.catalogs.findVersion(catalog.id, requestedVersionId)
      : catalog.activeVersion
        ? { id: catalog.activeVersion.id, status: catalog.activeVersion.status }
        : null;

    if (!version) throw new AppException('CATALOG_VERSION_NOT_ACTIVE', 409);

    request.catalogScope = {
      organizationId: catalog.organizationId,
      catalogId: catalog.id,
      catalogVersionId: version.id,
      userId: user.id,
      audience: user.audience,
      roleKeys: user.roleKeys,
      permissions: user.permissions,
    };
    return true;
  }
}
