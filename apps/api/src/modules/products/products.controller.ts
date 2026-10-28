import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { cursorPageSchema, type CursorPageQuery } from '@ventascatalogo/contracts';
import { ProductsService } from './products.service';
import { CatalogScopeGuard } from '../../common/guards/catalog-scope.guard';
import { CatalogScope } from '../../common/decorators/catalog-scope.decorator';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { CatalogScope as CatalogScopeType } from '../../common/catalog/catalog-scope.types';

@Controller('products')
@Audience('staff')
@RequirePermissions('product:read')
@UseGuards(CatalogScopeGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @CatalogScope() scope: CatalogScopeType,
    @Query(new ZodValidationPipe(cursorPageSchema)) query: CursorPageQuery,
  ) {
    return this.products.list(scope, query);
  }
}
