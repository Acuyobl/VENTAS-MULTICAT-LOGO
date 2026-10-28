import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  reminderCreateSchema,
  type AuthenticatedUser,
  type ReminderCreateInput,
  type ReminderListResponse,
  type ReminderSummary,
  type WhatsappReminderResponse,
} from '@ventascatalogo/contracts';
import { RemindersService } from './reminders.service';
import { salesMetaFrom, type RequestWithTrace } from '../../sales/sales-meta';
import { Audience } from '../../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();

/** Recordatorios de cobro por pedido (EMAIL real / WhatsApp Cloud API). */
@Controller('orders')
@Audience('staff')
export class OrderRemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Post(':orderId/reminders')
  @HttpCode(201)
  @RequirePermissions('payment:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
    @Body(new ZodValidationPipe(reminderCreateSchema)) body: ReminderCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<ReminderSummary | WhatsappReminderResponse> {
    return this.reminders.create(user, orderId, body, salesMetaFrom(req));
  }

  @Get(':orderId/reminders')
  @RequirePermissions('payment:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
  ): Promise<ReminderListResponse> {
    return this.reminders.list(user.organizationId, orderId);
  }
}
