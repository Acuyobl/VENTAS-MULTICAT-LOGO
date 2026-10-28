import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  cursorPageSchema,
  orderCancelSchema,
  orderStatusSchema,
  type AuthenticatedUser,
  type OrderCancelInput,
  type OrderSummary,
} from '@ventascatalogo/contracts';
import { OrdersService } from './orders.service';
import { salesMetaFrom, type RequestWithTrace } from './sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();

const orderListQuerySchema = cursorPageSchema.extend({
  catalogId: z.string().uuid().optional(),
  status: orderStatusSchema.optional(),
});

type OrderListQueryInput = z.infer<typeof orderListQuerySchema>;

@Controller('orders')
@Audience('staff')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('order:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQueryInput,
  ): Promise<{ items: OrderSummary[]; nextCursor: string | null }> {
    return this.orders.list(user, query);
  }

  @Get(':orderId')
  @RequirePermissions('order:read')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
  ): Promise<OrderSummary> {
    return this.orders.get(user, orderId);
  }

  @Post(':orderId/cancel')
  @HttpCode(200)
  @RequirePermissions('order:cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
    @Body(new ZodValidationPipe(orderCancelSchema)) body: OrderCancelInput,
    @Req() req: RequestWithTrace,
  ): Promise<OrderSummary> {
    return this.orders.cancel(user, orderId, body, salesMetaFrom(req));
  }

  @Post(':orderId/fulfill')
  @HttpCode(200)
  @RequirePermissions('order:create')
  fulfill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
    @Req() req: RequestWithTrace,
  ): Promise<OrderSummary> {
    return this.orders.fulfill(user, orderId, salesMetaFrom(req));
  }
}
