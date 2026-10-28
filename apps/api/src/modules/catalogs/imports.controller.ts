import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthenticatedUser, ImportResult } from '@ventascatalogo/contracts';
import { ImportsService, MAX_IMPORT_FILE_BYTES } from './imports.service';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuditMeta } from '../../common/audit/audit.types';

const idSchema = z.string().uuid();

type RequestWithTrace = Request & { traceId?: string };

function metaFrom(req: RequestWithTrace): AuditMeta {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    traceId: req.traceId ?? randomUUID(),
  };
}

/**
 * Importación de catálogo (F1). Multipart con campo `file` + opciones
 * `currency`, `taxRateBp`, `taxIncluded`, `mapping` (JSON) y `delimiter`.
 *
 * Respuestas: `201` cuando se crea una versión nueva, `200` cuando el mismo
 * SHA-256 ya se importó en este catálogo (`idempotent: true`).
 */
@Controller('catalogs')
@Audience('staff')
@ApiTags('catalogs')
export class CatalogImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post(':catalogId/imports')
  @RequirePermissions('catalog:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'CSV o XLSX (≤10 MB).' },
        currency: { type: 'string', enum: ['CRC', 'USD'], default: 'CRC' },
        taxRateBp: { type: 'integer', default: 1300 },
        taxIncluded: { type: 'boolean', default: true },
        mapping: { type: 'string', description: 'JSON de `columnMappingSchema`.' },
        delimiter: { type: 'string', maxLength: 1 },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 } }),
  )
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ImportResult> {
    const result = await this.imports.importFile({
      user,
      catalogId,
      file,
      body: body ?? {},
      meta: metaFrom(req),
    });
    res.status(result.idempotent ? 200 : 201);
    return result;
  }

  @Get(':catalogId/imports/:jobId')
  @RequirePermissions('catalog:read')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @Param('jobId', new ZodValidationPipe(idSchema)) jobId: string,
  ): Promise<ImportResult> {
    return this.imports.getJob(user, catalogId, jobId);
  }
}
