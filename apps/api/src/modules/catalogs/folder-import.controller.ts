import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuditMeta } from '../../common/audit/audit.types';
import { FolderImportService, type FolderImportResult } from './folder-import.service';
import { resolveRemoteLink } from './import/remote-source';

const linkListSchema = z.object({ url: z.string().url() });

const linkCatalogSchema = z.object({
  url: z.string().url(),
  name: z.string().trim().min(2).max(120),
});

const importFolderSchema = z.object({
  url: z.string().url(),
  name: z.string().min(2).max(120).optional(),
  maxImages: z.number().int().min(1).max(300).optional(),
  catalogId: z.string().uuid().optional(),
});

type RequestWithTrace = Request & { traceId?: string };

function metaFrom(req: RequestWithTrace): AuditMeta {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    traceId: req.traceId ?? '',
  };
}

@Controller('catalogs')
@Audience('staff')
@ApiTags('catalogs')
export class FolderImportController {
  constructor(private readonly folders: FolderImportService) {}

  /**
   * Convierte una carpeta pública de Drive en un catálogo.
   * - Carpeta con imágenes → catálogo con productos en borrador (precio 1.00).
   * - Carpeta con planilla/PDF → se importa con el pipeline normal.
   * - Carpeta que solo tiene subcarpetas → devuelve `container` con la lista.
   */
  /** Lista el contenido de un link de Drive (archivos y subcarpetas). */
  @Post('link-list')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  listLink(
    @Body(new ZodValidationPipe(linkListSchema)) body: z.infer<typeof linkListSchema>,
  ) {
    return resolveRemoteLink(body.url);
  }

  /**
   * Obtiene el catálogo de un link: si ya se cargó antes lo reutiliza
   * (no descarga nada); si no, lo crea.
   */
  @Post('link-catalog')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  linkCatalog(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(linkCatalogSchema))
    body: z.infer<typeof linkCatalogSchema>,
    @Req() req: RequestWithTrace,
  ) {
    return this.folders.obtenerOCrearCatalogo(user, body.url, body.name, metaFrom(req));
  }

  @Post('import-folder')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  importFolder(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(importFolderSchema))
    body: z.infer<typeof importFolderSchema>,
    @Req() req: RequestWithTrace,
  ): Promise<FolderImportResult> {
    return this.folders.importar({
      user,
      url: body.url,
      name: body.name,
      maxImages: body.maxImages,
      catalogId: body.catalogId,
      meta: metaFrom(req),
    });
  }
}
