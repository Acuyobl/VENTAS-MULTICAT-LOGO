import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  catalogCreateSchema,
  type AuthenticatedUser,
  type CatalogCreateInput,
  type CatalogSummary,
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
