import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  manualPaymentCreateSchema,
  paymentLinkCreateSchema,
  type AuthenticatedUser,
  type ManualPaymentCreateInput,
  type PaymentLinkCreateInput,
  type PaymentLinkResponse,
  type PaymentListResponse,
  type PaymentSummary,
} from '@ventascatalogo/contracts';
import { PaymentsService } from './payments.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();

/** Cobros staff sobre pedidos (link de pago, listado y pago manual). */
@Controller('orders')
@Audience('staff')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':orderId/payment-link')
  @RequirePermissions('payment:write')
  createLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
    @Body(new ZodValidationPipe(paymentLinkCreateSchema)) body: PaymentLinkCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<PaymentLinkResponse> {
    return this.payments.createLink(user, orderId, body, salesMetaFrom(req));
  }

  @Get(':orderId/payments')
  @RequirePermissions('payment:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
  ): Promise<PaymentListResponse> {
    return this.payments.listOrderPayments(user.organizationId, orderId);
  }

  @Post(':orderId/payments/manual')
  @HttpCode(201)
  @RequirePermissions('payment:write')
  registerManual(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
    @Body(new ZodValidationPipe(manualPaymentCreateSchema)) body: ManualPaymentCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<PaymentSummary> {
    return this.payments.registerManualPayment(user, orderId, body, salesMetaFrom(req));
  }
}
