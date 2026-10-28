import { Module } from '@nestjs/common';
import { CatalogsRepository } from './catalogs.repository';
import { CatalogsService } from './catalogs.service';
import { CatalogsController, PublicCatalogsController } from './catalogs.controller';
import { CatalogVersionsController } from './catalog-versions.controller';
import { CatalogVersionsRepository } from './catalog-versions.repository';
import { CatalogVersionsService } from './catalog-versions.service';
import { CatalogImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

@Module({
  controllers: [
    CatalogsController,
    PublicCatalogsController,
    CatalogVersionsController,
    CatalogImportsController,
  ],
  providers: [
    CatalogsRepository,
    CatalogsService,
    CatalogVersionsRepository,
    CatalogVersionsService,
    ImportsRepository,
    ImportsService,
  ],
  exports: [CatalogsRepository, CatalogsService],
})
export class CatalogsModule {}
