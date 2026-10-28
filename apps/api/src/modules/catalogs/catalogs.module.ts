import { Module } from '@nestjs/common';
import { CatalogsRepository } from './catalogs.repository';
import { CatalogsService } from './catalogs.service';
import { CatalogsController, PublicCatalogsController } from './catalogs.controller';

@Module({
  controllers: [CatalogsController, PublicCatalogsController],
  providers: [CatalogsRepository, CatalogsService],
  exports: [CatalogsRepository, CatalogsService],
})
export class CatalogsModule {}
