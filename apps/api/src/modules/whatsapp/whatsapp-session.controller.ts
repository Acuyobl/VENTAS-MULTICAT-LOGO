import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser, WhatsappSessionInfo } from '@ventascatalogo/contracts';
import { Audience } from '../../common/decorators/audience.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WhatsappBaileysService } from './whatsapp-baileys.service';

const simulateSchema = z.object({
  phone: z.string().optional().default('+506 8888-8888'),
});

@Controller('whatsapp/session')
@Audience('staff')
export class WhatsappSessionController {
  constructor(private readonly baileys: WhatsappBaileysService) {}

  @Get('status')
  @RequirePermissions('chat:write')
  getStatus(@CurrentUser() user: AuthenticatedUser): WhatsappSessionInfo {
    return this.baileys.getStatus(user.organizationId);
  }

  @Post('connect')
  @HttpCode(200)
  @RequirePermissions('chat:write')
  async connect(@CurrentUser() user: AuthenticatedUser): Promise<WhatsappSessionInfo> {
    return this.baileys.startSession(user.organizationId);
  }

  @Post('disconnect')
  @HttpCode(200)
  @RequirePermissions('chat:write')
  disconnect(@CurrentUser() user: AuthenticatedUser): WhatsappSessionInfo {
    return this.baileys.disconnectSession(user.organizationId);
  }

  @Post('simulate')
  @HttpCode(200)
  @RequirePermissions('chat:write')
  simulate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(simulateSchema)) body: z.infer<typeof simulateSchema>,
  ): WhatsappSessionInfo {
    return this.baileys.simulateConnect(user.organizationId, body.phone);
  }
}
