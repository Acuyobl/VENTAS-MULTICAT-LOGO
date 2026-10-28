import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { CatalogVersionsService } from './catalog-versions.service';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();

type RequestWithTrace = Request & { traceId?: string };

/**
 * Versionado de catálogo (F1). Las lecturas usan `catalog:read` y las mutaciones
 * `catalog:write`, ambos permisos ya sembrados por organización.
 */
@Controller('catalogs')
@Audience('staff')
@ApiTags('catalogs')
export class CatalogVersionsController {
  constructor(private readonly versions: CatalogVersionsService) {}

  @Get(':catalogId/versions')
  @RequirePermissions('catalog:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
  ) {
    return this.versions.list(user, catalogId);
  }

  @Post(':catalogId/versions/:versionId/activate')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @Param('versionId', new ZodValidationPipe(idSchema)) versionId: string,
    @Req() req: RequestWithTrace,
  ) {
    return this.versions.activate(user, catalogId, versionId, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      traceId: req.traceId ?? randomUUID(),
    });
  }

  @Post(':catalogId/versions/:versionId/validate')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  validate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @Param('versionId', new ZodValidationPipe(idSchema)) versionId: string,
  ) {
    return this.versions.validate(user, catalogId, versionId);
  }

  @Post(':catalogId/versions/:versionId/archive')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @Param('versionId', new ZodValidationPipe(idSchema)) versionId: string,
  ) {
    return this.versions.archive(user, catalogId, versionId);
  }
}
