import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  quoteCreateSchema,
  quoteListQuerySchema,
  type AuthenticatedUser,
  type QuoteCreateInput,
  type QuoteListQuery,
  type QuoteSummary,
} from '@ventascatalogo/contracts';
import { QuotesService } from './quotes.service';
import { salesMetaFrom, type RequestWithTrace } from './sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();

@Controller('quotes')
@Audience('staff')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @RequirePermissions('quote:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(quoteCreateSchema)) body: QuoteCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<QuoteSummary> {
    return this.quotes.create(user, body, salesMetaFrom(req));
  }

  @Get()
  @RequirePermissions('quote:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(quoteListQuerySchema)) query: QuoteListQuery,
  ): Promise<{ items: QuoteSummary[]; nextCursor: string | null }> {
    return this.quotes.list(user, query);
  }

  @Get(':quoteId')
  @RequirePermissions('quote:read')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId', new ZodValidationPipe(idSchema)) quoteId: string,
  ): Promise<QuoteSummary> {
    return this.quotes.get(user, quoteId);
  }

  @Post(':quoteId/send')
  @HttpCode(200)
  @RequirePermissions('quote:send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId', new ZodValidationPipe(idSchema)) quoteId: string,
    @Req() req: RequestWithTrace,
  ): Promise<QuoteSummary> {
    return this.quotes.send(user, quoteId, salesMetaFrom(req));
  }

  @Get(':quoteId/pdf')
  @RequirePermissions('quote:read')
  pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId', new ZodValidationPipe(idSchema)) quoteId: string,
  ): Promise<{ url: string }> {
    return this.quotes.pdf(user, quoteId);
  }

  @Post(':quoteId/accept')
  @HttpCode(200)
  @RequirePermissions('quote:send')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId', new ZodValidationPipe(idSchema)) quoteId: string,
    @Req() req: RequestWithTrace,
  ): Promise<QuoteSummary> {
    return this.quotes.accept(user, quoteId, salesMetaFrom(req));
  }

  @Post(':quoteId/convert')
  @HttpCode(201)
  @RequirePermissions('quote:convert')
  convert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId', new ZodValidationPipe(idSchema)) quoteId: string,
    @Req() req: RequestWithTrace,
  ) {
    return this.quotes.convert(user, quoteId, salesMetaFrom(req));
  }
}
