import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  cursorPageSchema,
  type AuthenticatedUser,
  type OrderSummary,
} from '@ventascatalogo/contracts';
import { StorefrontService } from './storefront.service';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();
type MyOrdersQuery = z.infer<typeof cursorPageSchema>;

/**
 * Portal del cliente (aud=customer). El filtro por `customerId` se resuelve en el
 * repositorio con el `CustomerAccount` de la sesión: nunca por query param.
 */
@Controller('me/orders')
@Audience('customer')
@RequirePermissions('self:order:read')
export class MeOrdersController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(cursorPageSchema)) query: MyOrdersQuery,
  ): Promise<{ items: OrderSummary[]; nextCursor: string | null }> {
    return this.storefront.listMyOrders(user, query);
  }

  @Get(':orderId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
  ): Promise<OrderSummary> {
    return this.storefront.getMyOrder(user, orderId);
  }
}
