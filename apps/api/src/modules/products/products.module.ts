import { Module } from '@nestjs/common';
import { CatalogsModule } from '../catalogs/catalogs.module';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CatalogScopeGuard } from '../../common/guards/catalog-scope.guard';

@Module({
  imports: [CatalogsModule],
  controllers: [ProductsController],
  providers: [ProductsRepository, ProductsService, CatalogScopeGuard],
})
export class ProductsModule {}
