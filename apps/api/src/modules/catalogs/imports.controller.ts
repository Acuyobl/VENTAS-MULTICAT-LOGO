import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import {
  mappingTemplateCreateSchema,
  type AuthenticatedUser,
  type ImportPreview,
  type ImportResult,
  type MappingTemplate,
  type MappingTemplateCreateInput,
  type MappingTemplateListResponse,
} from '@ventascatalogo/contracts';
import {
  ImportsService,
  MAX_UPLOAD_GUARD_BYTES,
  maxImportFileMb,
} from './imports.service';
import {
  RemoteImportError,
  downloadRemoteFile,
  elegirArchivoDeCatalogo,
  resolveRemoteLink,
} from './import/remote-source';
import { AdaptiveImportService } from './adaptive-import.service';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { apiException } from '../../common/errors/api-error-codes';
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

const linkBodySchema = z.object({
  url: z.string().url(),
  fileUrl: z.string().url().optional(),
  name: z.string().min(1).max(255).optional(),
}).passthrough();

type LinkBody = z.infer<typeof linkBodySchema> & Record<string, unknown>;

function opcionesDeLink(body: LinkBody): Record<string, unknown> {
  const { url: _url, fileUrl: _fileUrl, name: _name, ...resto } = body;
  return resto as Record<string, unknown>;
}

/** Convierte un link (archivo o carpeta de Drive) en un archivo tipo Multer. */
async function archivoDesdeLink(body: LinkBody): Promise<Express.Multer.File> {
  try {
    const nombre = body.name;
    if (body.fileUrl) {
      const descargado = await downloadRemoteFile(body.fileUrl);
      return multerFile(descargado, nombre);
    }
    const listado = await resolveRemoteLink(body.url);
    const archivo = elegirArchivoDeCatalogo(listado.entries);
    if (!archivo) {
      throw new RemoteImportError(
        'Esa carpeta no tiene archivos importables. AbrÃƒÂ­ una subcarpeta o pegÃƒÂ¡ el link del archivo.',
        'REMOTE_NO_FILES',
      );
    }
    const descargado = await downloadRemoteFile(archivo.url);
    return multerFile(descargado, nombre ?? archivo.name);
  } catch (error) {
    if (error instanceof RemoteImportError) {
      throw apiException('INVALID_IMPORT_FILE', 400, { remoteCode: error.code }, error.message);
    }
    throw error;
  }
}

function multerFile(
  descargado: { buffer: Buffer; originalname: string; mimetype: string },
  nombre?: string,
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: nombre ?? descargado.originalname,
    encoding: '7bit',
    mimetype: descargado.mimetype,
    size: descargado.buffer.byteLength,
    buffer: descargado.buffer,
    destination: '',
    filename: descargado.originalname,
    path: '',
    stream: undefined,
  } as unknown as Express.Multer.File;
}

/**
 * ImportaciÃ³n de catÃ¡logo (F1). Multipart con campo `file` + opciones
 * `currency`, `taxRateBp`, `taxIncluded`, `mapping` (JSON) y `delimiter`.
 *
 * Respuestas: `201` cuando se crea una versiÃ³n nueva, `200` cuando el mismo
 * SHA-256 ya se importÃ³ en este catÃ¡logo (`idempotent: true`).
 */
@Controller('catalogs')
@Audience('staff')
@ApiTags('catalogs')
export class CatalogImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly adaptive: AdaptiveImportService,
  ) {}

  @Post(':catalogId/imports')
  @RequirePermissions('catalog:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'CSV, XLSX, PDF o imagen (límite en IMPORT_MAX_MB, 300 MB por defecto).' },
        currency: { type: 'string', enum: ['CRC', 'USD'], default: 'CRC' },
        taxRateBp: { type: 'integer', default: 1300 },
        taxIncluded: { type: 'boolean', default: true },
        mapping: { type: 'string', description: 'JSON de `columnMappingSchema`.' },
        delimiter: { type: 'string', maxLength: 1 },
        mode: { type: 'string', enum: ['REPLACE', 'MERGE'], default: 'REPLACE' },
        extraFields: { type: 'string', description: 'JSON de campos extra propuestos.' },
        saveTemplate: { type: 'boolean', default: false },
        templateName: { type: 'string' },
        useAgent: { type: 'boolean', default: false },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_GUARD_BYTES, files: 1 } }),
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

  @Post(':catalogId/imports/preview')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_GUARD_BYTES, files: 1 } }),
  )
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithTrace,
  ): Promise<ImportPreview> {
    return this.adaptive.preview({
      user,
      catalogId,
      file,
      body: body ?? {},
      meta: metaFrom(req),
    });
  }

  /** Lista el contenido de un link (carpeta de Drive) o el archivo apuntado. */
  @Post(':catalogId/imports/link/list')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  async listFromLink(
    @Param('catalogId', new ZodValidationPipe(idSchema)) _catalogId: string,
    @Body(new ZodValidationPipe(linkBodySchema)) body: LinkBody,
  ) {
    try {
      return await resolveRemoteLink(body.url);
    } catch (error) {
      if (error instanceof RemoteImportError) {
        throw apiException('INVALID_IMPORT_FILE', 400, { remoteCode: error.code }, error.message);
      }
      throw error;
    }
  }

  /** Analiza (preview) un catÃ¡logo descargado desde un link. */
  @Post(':catalogId/imports/from-link/preview')
  @HttpCode(200)
  @RequirePermissions('catalog:write')
  async previewFromLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @Body(new ZodValidationPipe(linkBodySchema)) body: LinkBody,
    @Req() req: RequestWithTrace,
  ): Promise<ImportPreview> {
    const file = await archivoDesdeLink(body);
    return this.adaptive.preview({
      user,
      catalogId,
      file,
      body: opcionesDeLink(body),
      meta: metaFrom(req),
    });
  }

  /** Importa un catÃ¡logo descargado desde un link. */
  @Post(':catalogId/imports/from-link')
  @RequirePermissions('catalog:write')
  async createFromLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @Body(new ZodValidationPipe(linkBodySchema)) body: LinkBody,
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ImportResult> {
    const file = await archivoDesdeLink(body);
    const result = await this.imports.importFile({
      user,
      catalogId,
      file,
      body: opcionesDeLink(body),
      meta: metaFrom(req),
    });
    res.status(result.idempotent ? 200 : 201);
    return result;
  }

  @Get(':catalogId/import-templates')
  @RequirePermissions('catalog:read')
  listTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
  ): Promise<MappingTemplateListResponse> {
    return this.adaptive.listTemplates(user.organizationId, catalogId);
  }

  @Post(':catalogId/import-templates')
  @HttpCode(201)
  @RequirePermissions('catalog:write')
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @Body(new ZodValidationPipe(mappingTemplateCreateSchema)) body: MappingTemplateCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<MappingTemplate> {
    return this.adaptive.createTemplate(user, catalogId, body, metaFrom(req));
  }

  @Delete(':catalogId/import-templates/:templateId')
  @RequirePermissions('catalog:write')
  removeTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('catalogId', new ZodValidationPipe(idSchema)) catalogId: string,
    @Param('templateId', new ZodValidationPipe(idSchema)) templateId: string,
    @Req() req: RequestWithTrace,
  ): Promise<{ id: string; deleted: true }> {
    return this.adaptive.removeTemplate(user, catalogId, templateId, metaFrom(req));
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
