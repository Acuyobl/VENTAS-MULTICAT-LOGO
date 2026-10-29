import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import {
  catalogCreateSchema,
  catalogUpdateSchema,
  type AuthenticatedUser,
  type CatalogCreateInput,
  type CatalogSummary,
  type CatalogUpdateInput,
} from '@ventascatalogo/contracts';
import { CatalogsService } from './catalogs.service';
import { Public } from '../../common/decorators/public.decorator';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';

@Controller('catalogs')
@Audience('staff')
@RequirePermissions('catalog:read')
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogs.list(user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('catalog:write')
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: RequestWithTrace,
  ): Promise<void> {
    await this.catalogs.delete(user, id, salesMetaFrom(req));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('catalog:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(catalogCreateSchema)) body: CatalogCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<CatalogSummary> {
    return this.catalogs.create(user, body, salesMetaFrom(req));
  }

  @Patch(':id')
  @RequirePermissions('catalog:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(catalogUpdateSchema)) body: CatalogUpdateInput,
    @Req() req: RequestWithTrace,
  ): Promise<CatalogSummary> {
    return this.catalogs.update(user, id, body, salesMetaFrom(req));
  }
}

@Controller('catalogs/public')
@Public()
export class PublicCatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.catalogs.getPublic(slug);
  }
}
