import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import {
  orgSettingsUpdateSchema,
  type AuthenticatedUser,
  type OrgSettings,
  type OrgSettingsUpdateInput,
} from '@ventascatalogo/contracts';
import { OrgSettingsService } from './org-settings.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('organizations/settings')
@Audience('staff')
@RequirePermissions('settings:manage')
export class OrgSettingsController {
  constructor(private readonly settings: OrgSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<OrgSettings> {
    return this.settings.get(user);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(orgSettingsUpdateSchema)) body: OrgSettingsUpdateInput,
    @Req() req: RequestWithTrace,
  ): Promise<OrgSettings> {
    return this.settings.update(user, body, salesMetaFrom(req));
  }
}
