import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  storefrontCheckoutSchema,
  type AuthenticatedUser,
  type StorefrontCheckoutInput,
  type StorefrontCheckoutResponse,
  type StorefrontClaimResponse,
  type StorefrontOrder,
} from '@ventascatalogo/contracts';
import { StorefrontService } from './storefront.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { Public } from '../../common/decorators/public.decorator';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const tokenSchema = z.string().min(20).max(200);

@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('checkout')
  checkout(
    @Body(new ZodValidationPipe(storefrontCheckoutSchema)) body: StorefrontCheckoutInput,
    @Req() req: RequestWithTrace,
  ): Promise<StorefrontCheckoutResponse> {
    return this.storefront.checkout(body, salesMetaFrom(req));
  }

  @Public()
  @Get('orders/:token')
  order(
    @Param('token', new ZodValidationPipe(tokenSchema)) token: string,
  ): Promise<StorefrontOrder> {
    return this.storefront.getByToken(token);
  }

  @Post('orders/:token/claim')
  @HttpCode(200)
  @Audience('customer')
  @RequirePermissions('self:order:read')
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token', new ZodValidationPipe(tokenSchema)) token: string,
    @Req() req: RequestWithTrace,
  ): Promise<StorefrontClaimResponse> {
    return this.storefront.claim(user, token, salesMetaFrom(req));
  }
}
