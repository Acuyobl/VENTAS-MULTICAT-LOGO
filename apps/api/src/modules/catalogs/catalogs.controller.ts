import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  bulkPriceAdjustmentSchema,
  catalogCreateSchema,
  catalogDuplicateSchema,
  catalogExportQuerySchema,
  catalogUpdateSchema,
  type AuthenticatedUser,
  type BulkPriceAdjustmentInput,
  type BulkPriceApplyResponse,
  type BulkPricePreviewResponse,
  type CatalogCategoriesResponse,
  type CatalogCreateInput,
  type CatalogDuplicateInput,
  type CatalogExportQuery,
  type CatalogSummary,
  type CatalogUpdateInput,
} from '@ventascatalogo/contracts';
import { CatalogsService } from './catalogs.service';
import { Public } from '../../common/decorators/public.decorator';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';

@Controller('catalogs')
@Audience('staff')
@RequirePermissions('catalog:read')
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogs.list(user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('catalog:write')
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: RequestWithTrace,
  ): Promise<void> {
    await this.catalogs.delete(user, id, salesMetaFrom(req));
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('catalog:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(catalogCreateSchema)) body: CatalogCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<CatalogSummary> {
    return this.catalogs.create(user, body, salesMetaFrom(req));
  }

  @Patch(':id')
  @RequirePermissions('catalog:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(catalogUpdateSchema)) body: CatalogUpdateInput,
    @Req() req: RequestWithTrace,
  ): Promise<CatalogSummary> {
    return this.catalogs.update(user, id, body, salesMetaFrom(req));
  }

  @Post(':id/duplicate')
  @HttpCode(201)
  @RequirePermissions('catalog:write')
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(catalogDuplicateSchema)) body: CatalogDuplicateInput,
    @Req() req: RequestWithTrace,
  ): Promise<CatalogSummary> {
    return this.catalogs.duplicate(user, id, body, salesMetaFrom(req));
  }

  @Get(':id/export')
  @RequirePermissions('catalog:read')
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(catalogExportQuerySchema)) query: CatalogExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename, contentType } = await this.catalogs.export(user, id, query.format);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }

  @Get(':id/categories')
  @RequirePermissions('catalog:read')
  categories(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CatalogCategoriesResponse> {
    return this.catalogs.getCategories(user, id);
  }

  @Post(':id/bulk-price/preview')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  previewBulkPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(bulkPriceAdjustmentSchema)) body: BulkPriceAdjustmentInput,
  ): Promise<BulkPricePreviewResponse> {
    return this.catalogs.previewBulkPriceAdjustment(user, id, body);
  }

  @Post(':id/bulk-price/apply')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  applyBulkPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(bulkPriceAdjustmentSchema)) body: BulkPriceAdjustmentInput,
    @Req() req: RequestWithTrace,
  ): Promise<BulkPriceApplyResponse> {
    return this.catalogs.applyBulkPriceAdjustment(user, id, body, salesMetaFrom(req));
  }
}

@Controller('catalogs/public')
@Public()
export class PublicCatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.catalogs.getPublic(slug);
  }
}
