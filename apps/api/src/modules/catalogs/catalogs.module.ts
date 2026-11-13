import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ImportTemplatesRepository } from './import-templates.repository';
import { AdaptiveImportService } from './adaptive-import.service';
import { CatalogsRepository } from './catalogs.repository';
import { CatalogsService } from './catalogs.service';
import { CatalogsController, PublicCatalogsController } from './catalogs.controller';
import { CatalogVersionsController } from './catalog-versions.controller';
import { CatalogVersionsRepository } from './catalog-versions.repository';
import { CatalogVersionsService } from './catalog-versions.service';
import { CatalogImportsController } from './imports.controller';
import { FolderImportController } from './folder-import.controller';
import { FolderImportService } from './folder-import.service';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';
import { OcrService } from './import/ocr/ocr.service';

@Module({
  imports: [AiModule],
  controllers: [
    CatalogsController,
    PublicCatalogsController,
    CatalogVersionsController,
    CatalogImportsController,
    FolderImportController,
  ],
  providers: [
    CatalogsRepository,
    CatalogsService,
    CatalogVersionsRepository,
    CatalogVersionsService,
    ImportsRepository,
    ImportsService,
    ImportTemplatesRepository,
    AdaptiveImportService,
    OcrService,
    FolderImportService,
  ],
  exports: [CatalogsRepository, CatalogsService, AdaptiveImportService, ImportsService],
})
export class CatalogsModule {}
