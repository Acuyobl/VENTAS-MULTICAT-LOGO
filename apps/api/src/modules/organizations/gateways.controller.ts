import { Body, Controller, Get, Param, Patch, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  gatewayConfigUpdateSchema,
  paymentProviderSchema,
  type AuthenticatedUser,
  type GatewayConfig,
  type GatewayConfigListResponse,
  type GatewayConfigUpdateInput,
} from '@ventascatalogo/contracts';
import { GatewaysService } from './gateways.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const enabledSchema = z.object({ enabled: z.boolean() }).strict();

@Controller('organizations/payment-gateways')
@Audience('staff')
@RequirePermissions('settings:manage')
export class GatewaysController {
  constructor(private readonly gateways: GatewaysService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<GatewayConfigListResponse> {
    return this.gateways.list(user.organizationId);
  }

  @Put(':provider')
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider', new ZodValidationPipe(paymentProviderSchema))
    provider: GatewayConfig['provider'],
    @Body(new ZodValidationPipe(gatewayConfigUpdateSchema)) body: GatewayConfigUpdateInput,
    @Req() req: RequestWithTrace,
  ): Promise<GatewayConfig> {
    return this.gateways.upsert(user, provider, body, salesMetaFrom(req));
  }

  @Patch(':provider')
  setEnabled(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider', new ZodValidationPipe(paymentProviderSchema))
    provider: GatewayConfig['provider'],
    @Body(new ZodValidationPipe(enabledSchema)) body: { enabled: boolean },
    @Req() req: RequestWithTrace,
  ): Promise<GatewayConfig> {
    return this.gateways.setEnabled(user, provider, body.enabled, salesMetaFrom(req));
  }
}
