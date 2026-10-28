import { Injectable } from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import type { CatalogScope } from '../../common/catalog/catalog-scope.types';
import type { CursorPageQuery } from '@ventascatalogo/contracts';

@Injectable()
export class ProductsService {
  constructor(private readonly repo: ProductsRepository) {}

  list(scope: CatalogScope, query: CursorPageQuery) {
    return this.repo.listPage(scope.catalogId, scope.catalogVersionId, query);
  }
}
