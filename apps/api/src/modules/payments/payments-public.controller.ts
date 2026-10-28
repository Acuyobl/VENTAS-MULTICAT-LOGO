import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { PublicPaymentLink, SandboxConfirmResponse } from '@ventascatalogo/contracts';
import { PaymentsService } from './payments.service';
import { salesMetaFrom } from '../sales/sales-meta';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const tokenSchema = z.string().min(10).max(200);
const providerSchema = z.string().min(3).max(30);

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/** Cara pública de cobros: link del cliente, confirmación sandbox y webhooks. */
@Controller('payments')
export class PublicPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('public/link/:token')
  publicLink(
    @Param('token', new ZodValidationPipe(tokenSchema)) token: string,
  ): Promise<PublicPaymentLink> {
    return this.payments.getPublicLink(token);
  }

  @Public()
  @Post('sandbox/:token/confirm')
  @HttpCode(200)
  confirmSandbox(
    @Param('token', new ZodValidationPipe(tokenSchema)) token: string,
    @Req() req: RawBodyRequest,
  ): Promise<SandboxConfirmResponse> {
    return this.payments.confirmSandbox(token, salesMetaFrom(req));
  }

  @Public()
  @Post('webhooks/:provider')
  @HttpCode(200)
  webhook(
    @Param('provider', new ZodValidationPipe(providerSchema)) provider: string,
    @Req() req: RawBodyRequest,
  ) {
    return this.payments.handleWebhook(provider, req.rawBody, req.headers);
  }
}
