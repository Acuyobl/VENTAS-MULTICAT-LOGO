import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AppException } from '../errors/app-exception';
import type { CatalogScope as CatalogScopeType } from '../catalog/catalog-scope.types';

export const CatalogScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CatalogScopeType => {
    const req = ctx.switchToHttp().getRequest<{ catalogScope?: CatalogScopeType }>();
    if (!req.catalogScope) throw new AppException('CATALOG_SCOPE_REQUIRED', 400);
    return req.catalogScope;
  },
);
