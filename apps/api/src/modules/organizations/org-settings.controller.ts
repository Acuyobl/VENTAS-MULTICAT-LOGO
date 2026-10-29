import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import {
  orgSettingsUpdateSchema,
  type AuthenticatedUser,
  type OrgSettings,
  type OrgSettingsUpdateInput,
} from '@ventascatalogo/contracts';
import { OrgSettingsService } from './org-settings.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { AppException } from '../../common/errors/app-exception';
import type { PipeTransform } from '@nestjs/common';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/** El ajuste inválido se responde 422 (no 400) por contrato de la UI de Ajustes. */
class OrgSettingsUpdatePipe implements PipeTransform {
  transform(value: unknown): unknown {
    const result = orgSettingsUpdateSchema.safeParse(value);
    if (!result.success) {
      throw new AppException('VALIDATION_FAILED', 422, result.error.flatten());
    }
    return result.data;
  }
}

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
    @Body(new OrgSettingsUpdatePipe()) body: OrgSettingsUpdateInput,
    @Req() req: RequestWithTrace,
  ): Promise<OrgSettings> {
    return this.settings.update(user, body, salesMetaFrom(req));
  }
}
