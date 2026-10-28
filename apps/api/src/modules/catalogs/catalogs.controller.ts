import { Controller, Get, Param } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { Public } from '../../common/decorators/public.decorator';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';

@Controller('catalogs')
@Audience('staff')
@RequirePermissions('catalog:read')
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogs.list(user);
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
