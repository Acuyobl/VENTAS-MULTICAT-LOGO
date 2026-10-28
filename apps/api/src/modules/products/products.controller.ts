import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  productListQuerySchema,
  productUpdateSchema,
  type ProductDetail,
  type ProductListQuery,
  type ProductUpdateInput,
} from '@ventascatalogo/contracts';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { ProductsService } from './products.service';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MAX_PRODUCT_IMAGE_BYTES } from '../storage/image-utils';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';

const idSchema = z.string().uuid();

/** Margen por encima del límite de negocio: el 400 lo da `validateProductImageFile`. */
const MULTER_IMAGE_LIMIT_BYTES = MAX_PRODUCT_IMAGE_BYTES + 1024 * 1024;

@Controller('products')
@Audience('staff')
@RequirePermissions('catalog:read')
@ApiTags('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery,
  ) {
    return this.products.list(user, query);
  }

  @Get(':productId')
  @RequirePermissions('product:read')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ZodValidationPipe(idSchema)) productId: string,
  ): Promise<ProductDetail> {
    return this.products.detail(user, productId);
  }

  @Patch(':productId')
  @RequirePermissions('product:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ZodValidationPipe(idSchema)) productId: string,
    @Body(new ZodValidationPipe(productUpdateSchema)) body: ProductUpdateInput,
    @Req() req: RequestWithTrace,
  ): Promise<ProductDetail> {
    return this.products.update(user, productId, body, salesMetaFrom(req));
  }
  @Post(':productId/image')
  @RequirePermissions('product:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'JPEG, PNG, WebP o SVG de hasta 5 MB.',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MULTER_IMAGE_LIMIT_BYTES, files: 1 },
    }),
  )
  uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ZodValidationPipe(idSchema)) productId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.products.uploadImage(user, productId, file);
  }

  @Delete(':productId/image')
  @RequirePermissions('product:write')
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', new ZodValidationPipe(idSchema)) productId: string,
  ) {
    return this.products.removeImage(user, productId);
  }
}
