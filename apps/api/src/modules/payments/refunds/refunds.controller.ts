import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  refundDecisionSchema,
  refundRequestSchema,
  type AuthenticatedUser,
  type OrderRefundedState,
  type RefundDecisionInput,
  type RefundListResponse,
  type RefundRequestInput,
  type RefundSummary,
} from '@ventascatalogo/contracts';
import { RefundsService } from './refunds.service';
import { salesMetaFrom, type RequestWithTrace } from '../../sales/sales-meta';
import { Audience } from '../../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();

/** Reembolsos sobre un pago (solicitud y listado). */
@Controller('payments')
@Audience('staff')
export class PaymentRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post(':paymentId/refunds')
  @HttpCode(201)
  @RequirePermissions('payment:refund_request')
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', new ZodValidationPipe(idSchema)) paymentId: string,
    @Body(new ZodValidationPipe(refundRequestSchema)) body: RefundRequestInput,
    @Req() req: RequestWithTrace,
  ): Promise<RefundSummary> {
    return this.refunds.request(user, paymentId, body, salesMetaFrom(req));
  }

  @Get(':paymentId/refunds')
  @RequirePermissions('payment:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', new ZodValidationPipe(idSchema)) paymentId: string,
  ): Promise<{ items: RefundSummary[] }> {
    return this.refunds.listPaymentRefunds(user.organizationId, paymentId);
  }
}

/** Decisión de un reembolso (aprobar/rechazar) con permiso de aprobación. */
@Controller('refunds')
@Audience('staff')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post(':refundId/approve')
  @HttpCode(200)
  @RequirePermissions('payment:refund_approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('refundId', new ZodValidationPipe(idSchema)) refundId: string,
    @Body(new ZodValidationPipe(refundDecisionSchema)) body: RefundDecisionInput,
    @Req() req: RequestWithTrace,
  ): Promise<OrderRefundedState> {
    return this.refunds.approve(user, refundId, body, salesMetaFrom(req));
  }

  @Post(':refundId/reject')
  @HttpCode(200)
  @RequirePermissions('payment:refund_approve')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('refundId', new ZodValidationPipe(idSchema)) refundId: string,
    @Body(new ZodValidationPipe(refundDecisionSchema)) body: RefundDecisionInput,
    @Req() req: RequestWithTrace,
  ): Promise<RefundSummary> {
    return this.refunds.reject(user, refundId, body, salesMetaFrom(req));
  }
}

/** Listado de reembolsos de un pedido (con saldos). */
@Controller('orders')
@Audience('staff')
export class OrderRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get(':orderId/refunds')
  @RequirePermissions('payment:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
  ): Promise<RefundListResponse> {
    return this.refunds.listOrderRefunds(user.organizationId, orderId);
  }
}
