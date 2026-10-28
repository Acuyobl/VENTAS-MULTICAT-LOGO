import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import {
  importOptionsSchema,
  type AuthenticatedUser,
  type ImportOptions,
  type ImportResult,
} from '@ventascatalogo/contracts';
import type { CatalogVersion, ImportJob, ImportRowIssue } from '@prisma/client';
import { CatalogsRepository } from './catalogs.repository';
import { ImportsRepository } from './imports.repository';
import { AppException } from '../../common/errors/app-exception';
import { apiException } from '../../common/errors/api-error-codes';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';
import {
  parseImportFile,
  ImportParseError,
  type ImportFileExtension,
} from './import/parse-import-file';
import { resolveHeaderMapping } from './import/normalize-header';
import { validateImportRows } from './import/row-validator';
import { resolveImportImages } from './import/import-images';
import { downloadImage } from './import/image-downloader';

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPTED_EXTENSIONS: Record<string, ImportFileExtension> = {
  csv: 'csv',
  xlsx: 'xlsx',
};

export interface ImportFileInput {
  user: AuthenticatedUser;
  catalogId: string;
  file: Express.Multer.File | undefined;
  body: Record<string, unknown>;
  meta: AuditMeta;
}

/**
 * Convierte los campos multipart (todos string) al contrato `ImportOptions`.
 * `mapping` llega como JSON serializado; los campos vacíos se descartan para que
 * el formulario web pueda enviar inputs sin completar.
 */
export function parseImportOptions(body: Record<string, unknown>): ImportOptions {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null || value === '') continue;
    cleaned[key] = value;
  }

  if (typeof cleaned.mapping === 'string' && cleaned.mapping.trim().length > 0) {
    try {
      cleaned.mapping = JSON.parse(cleaned.mapping);
    } catch {
      throw new AppException('VALIDATION_FAILED', 400, {
        fieldErrors: { mapping: ['El mapeo debe ser un JSON válido.'] },
      });
    }
  }

  const parsed = importOptionsSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new AppException('VALIDATION_FAILED', 400, parsed.error.flatten());
  }
  return parsed.data;
}

/** Resuelve la extensión aceptada (`.csv`/`.xlsx`) o lanza `UNSUPPORTED_FILE_TYPE`. */
export function resolveImportExtension(originalName: string | undefined): ImportFileExtension {
  const name = (originalName ?? '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const extension = dot === -1 ? '' : name.slice(dot + 1);
  const resolved = ACCEPTED_EXTENSIONS[extension];
  if (!resolved) {
    throw apiException(
      'UNSUPPORTED_FILE_TYPE',
      400,
      { extension, accepted: Object.keys(ACCEPTED_EXTENSIONS) },
      'Formato no soportado: subí un archivo .csv o .xlsx.',
    );
  }
  return resolved;
}

export interface ImportResultIssue {
  rowNumber: number;
  severity: string;
  code: string;
  message: string;
  rawData: unknown;
}

function toImportResult(
  job: ImportJob,
  version: CatalogVersion,
  idempotent: boolean,
  issues: ImportResultIssue[],
): ImportResult {
  return {
    importJobId: job.id,
    catalogVersionId: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    idempotent,
    totalRows: job.totalRows,
    importedRows: job.importedRows,
    quarantineRows: job.quarantineRows,
    issues: issues.map((issue) => ({
      rowNumber: issue.rowNumber,
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      rawData: (issue.rawData ?? {}) as Record<string, unknown>,
    })),
  };
}

function storedIssues(job: ImportJob & { issues: ImportRowIssue[] }): ImportResultIssue[] {
  return job.issues.map((issue) => ({
    rowNumber: issue.rowNumber,
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    rawData: issue.rawData ?? {},
  }));
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);
  private readonly docsBucket: string;

  constructor(
    private readonly catalogs: CatalogsRepository,
    private readonly repo: ImportsRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.docsBucket = config.get<string>('MINIO_BUCKET_DOCS', 'vc-docs');
  }

  async importFile(input: ImportFileInput): Promise<ImportResult> {
    const { user, catalogId, file, meta } = input;

    // Mismo criterio que el resto de F1: catálogo ajeno → 404, nunca 403.
    const catalog = await this.catalogs.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) throw new AppException('CATALOG_NOT_FOUND', 404);

    if (!file) {
      throw apiException(
        'INVALID_IMPORT_FILE',
        400,
        { field: 'file' },
        'Falta el archivo en el campo "file".',
      );
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw apiException(
        'INVALID_IMPORT_FILE',
        400,
        { maxBytes: MAX_IMPORT_FILE_BYTES, size: file.size },
        'El archivo supera el límite de 10 MB.',
      );
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw apiException(
        'INVALID_IMPORT_FILE',
        400,
        { fileName: file.originalname },
        'El archivo está vacío.',
      );
    }

    const extension = resolveImportExtension(file.originalname);
    const options = parseImportOptions(input.body);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    // Idempotencia real por SHA-256: mismo archivo ⇒ misma versión, cero productos
    // duplicados. Se responde 200 con el resultado existente.
    const existing = await this.repo.findExisting(catalogId, checksum);
    if (existing)
      return toImportResult(existing.job, existing.version, true, storedIssues(existing.job));

    const parsed = this.parse(file.buffer, extension, options);

    const { mapping, unmatchedColumns } = resolveHeaderMapping(parsed.headers, options.mapping);
    if (unmatchedColumns.length > 0) {
      throw new AppException('VALIDATION_FAILED', 400, {
        fieldErrors: { mapping: [`No existen en el archivo: ${unmatchedColumns.join(', ')}`] },
        unmatchedColumns,
      });
    }

    const validation = validateImportRows(parsed.rows, { mapping, currency: options.currency });
    if (validation.totalRows === 0) {
      throw apiException(
        'EMPTY_IMPORT',
        400,
        { fileName: file.originalname },
        'El archivo no tiene filas de datos.',
      );
    }

    const sourceFileId = await this.snapshot(catalogId, checksum, extension, file.buffer);

    // Las imágenes se suben antes de persistir porque la key incluye el id de la
    // versión y el del producto, que se generan aquí y se reutilizan en la
    // transacción. Un fallo de imagen nunca bloquea la fila: queda como warning.
    const versionId = randomUUID();
    const images = await resolveImportImages(validation.products, {
      catalogId,
      catalogVersionId: versionId,
      download: downloadImage,
      upload: (key, buffer, contentType) => this.storage.putObject(key, buffer, contentType),
    });
    const issues = [...validation.issues, ...images.warnings];

    const persisted = await this.repo.persist({
      catalogId,
      versionId,
      createdByUserId: user.id,
      currency: options.currency,
      taxRateBp: options.taxRateBp,
      taxIncluded: options.taxIncluded,
      checksum,
      sourceFileId,
      fileName: file.originalname ?? null,
      mapping,
      totalRows: validation.totalRows,
      quarantineRows: validation.quarantineRows,
      products: images.products,
      issues,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'catalog.imported',
      entityType: 'catalog_version',
      entityId: persisted.version.id,
      after: {
        catalogId,
        versionNumber: persisted.version.versionNumber,
        sourceChecksum: checksum,
        sourceFileId,
        totalRows: validation.totalRows,
        importedRows: images.products.length,
        quarantineRows: validation.quarantineRows,
        warnings: images.warnings.length,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toImportResult(persisted.job, persisted.version, false, issues);
  }

  async getJob(user: AuthenticatedUser, catalogId: string, jobId: string): Promise<ImportResult> {
    const catalog = await this.catalogs.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) throw new AppException('CATALOG_NOT_FOUND', 404);

    const existing = await this.repo.findJob(catalogId, jobId);
    if (!existing) throw new AppException('NOT_FOUND', 404);
    // Es una lectura del job, no un replay del mismo archivo: `idempotent` es false.
    return toImportResult(existing.job, existing.version, false, storedIssues(existing.job));
  }

  private parse(
    buffer: Buffer,
    extension: ImportFileExtension,
    options: ImportOptions,
  ): ReturnType<typeof parseImportFile> {
    let parsed: ReturnType<typeof parseImportFile>;
    try {
      parsed = parseImportFile(buffer, extension, options.delimiter);
    } catch (error) {
      if (error instanceof ImportParseError) {
        if (error.reason === 'empty_file') {
          throw apiException('EMPTY_IMPORT', 400, undefined, error.message);
        }
        throw apiException('INVALID_IMPORT_FILE', 400, undefined, error.message);
      }
      throw error;
    }

    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      throw apiException(
        'EMPTY_IMPORT',
        400,
        { headers: parsed.headers.length, rows: parsed.rows.length },
        'El archivo no tiene filas de datos.',
      );
    }
    return parsed;
  }

  /**
   * Snapshot inmutable en MinIO (`imports/{catalogId}/{checksum}.{ext}`). Si
   * MinIO no responde la importación continúa: el checksum y la idempotencia ya
   * están garantizados por la base de datos y el snapshot es trazabilidad.
   */
  private async snapshot(
    catalogId: string,
    checksum: string,
    extension: ImportFileExtension,
    buffer: Buffer,
  ): Promise<string | null> {
    const objectKey = `imports/${catalogId}/${checksum}.${extension}`;
    try {
      await this.storage.client.putObject(this.docsBucket, objectKey, buffer, buffer.length, {
        'Content-Type':
          extension === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      return objectKey;
    } catch (error) {
      this.logger.warn({ err: error, catalogId, objectKey }, 'import_snapshot_upload_failed');
      return null;
    }
  }
}
