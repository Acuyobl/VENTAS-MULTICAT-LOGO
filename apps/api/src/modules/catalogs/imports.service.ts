import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import {
  importOptionsSchema,
  type AuthenticatedUser,
  type ColumnMapping,
  type ExtraFieldProposal,
  type ImportMode,
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
import { parseAdaptiveImportOptions } from './import/adaptive/import-plan';
import { headersSignature } from './import/adaptive/heuristic-mapping';
import { coerceExtraAttributes } from './import/adaptive/attribute-coercion';
import { ImportTemplatesRepository } from './import-templates.repository';

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export const BLOCKED_EXTENSIONS = new Set(['exe', 'dll', 'bin', 'zip', 'tar', 'gz', 'iso', 'so']);

const ACCEPTED_EXTENSIONS: Record<string, ImportFileExtension> = {
  csv: 'csv',
  tsv: 'tsv',
  tab: 'tsv',
  xlsx: 'xlsx',
  xlsm: 'xlsx',
  xlsb: 'xlsx',
  xls: 'xls',
  ods: 'ods',
  txt: 'txt',
  text: 'txt',
  json: 'json',
  pdf: 'pdf',
  prn: 'txt',
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
const IMPORT_OPTION_KEYS = new Set([
  'currency',
  'taxRateBp',
  'taxIncluded',
  'mapping',
  'delimiter',
  'updateDraftVersionId',
]);

export function parseImportOptions(body: Record<string, unknown>): ImportOptions {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!IMPORT_OPTION_KEYS.has(key)) continue;
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

/** Resuelve la extensión del archivo para importación universal o rechaza ejecutables. */
export function resolveImportExtension(originalName: string | undefined): ImportFileExtension {
  const name = (originalName ?? '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const extension = dot === -1 ? '' : name.slice(dot + 1);
  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw apiException(
      'UNSUPPORTED_FILE_TYPE',
      400,
      { extension, accepted: Object.keys(ACCEPTED_EXTENSIONS) },
      'Formato no soportado: los archivos ejecutables o comprimidos no son válidos como catálogo.',
    );
  }
  return ACCEPTED_EXTENSIONS[extension] ?? 'unknown';
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
    private readonly templates: ImportTemplatesRepository,
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
    const plan = parseAdaptiveImportOptions(input.body);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    // Idempotencia real por SHA-256: mismo archivo ⇒ misma versión, cero productos
    // duplicados. Se responde 200 con el resultado existente.
    const existing = await this.repo.findExisting(catalogId, checksum);
    if (existing) {
      const base = toImportResult(existing.job, existing.version, true, storedIssues(existing.job));
      return withPlan(base, (existing.job.mode as ImportMode) ?? 'REPLACE', 0);
    }

    const parsed = this.parse(file.buffer, extension, options);

    // C (aprendizaje): si el archivo coincide con una plantilla y no se envió
    // mapping explícito, se usa la plantilla como base del plan.
    const signature = headersSignature(parsed.headers);
    const matchedTemplate = options.mapping
      ? null
      : await this.templates.findBestMatch(
          user.organizationId,
          catalogId,
          parsed.headers,
          signature,
        );
    const baseMapping = options.mapping ?? (matchedTemplate?.mapping as ColumnMapping | undefined);
    const extraFields: ExtraFieldProposal[] =
      plan.extraFields.length > 0
        ? plan.extraFields
        : ((matchedTemplate?.extraFields as ExtraFieldProposal[] | undefined) ?? []);

    const { mapping, unmatchedColumns } = resolveHeaderMapping(parsed.headers, baseMapping);
    if (unmatchedColumns.length > 0) {
      throw new AppException('VALIDATION_FAILED', 400, {
        fieldErrors: { mapping: [`No existen en el archivo: ${unmatchedColumns.join(', ')}`] },
        unmatchedColumns,
      });
    }

    const validation = validateImportRows(parsed.rows, {
      mapping,
      currency: options.currency,
      extraFieldColumns: extraFields.map((field) => field.column),
    });
    if (validation.totalRows === 0) {
      throw apiException(
        'EMPTY_IMPORT',
        400,
        { fileName: file.originalname },
        'El archivo no tiene filas de datos.',
      );
    }

    // Extra fields → atributos con el tipo coaccionado (las celdas vacías no van).
    const productsWithAttributes = validation.products.map((product) => ({
      ...product,
      attributes: coerceExtraAttributes(product.rawData, extraFields, options.currency),
    }));

    const sourceFileId = await this.snapshot(catalogId, checksum, extension, file.buffer);

    // Las imágenes se suben antes de persistir porque la key incluye el id de la
    // versión y el del producto, que se generan aquí y se reutilizan en la
    // transacción. Un fallo de imagen nunca bloquea la fila: queda como warning.
    const versionId = randomUUID();
    const images = await resolveImportImages(productsWithAttributes, {
      catalogId,
      catalogVersionId: versionId,
      download: downloadImage,
      upload: (key, buffer, contentType) => this.storage.putObject(key, buffer, contentType),
      generateMockupFallback: true,
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
      mode: plan.mode,
      extraFields,
      templateId: matchedTemplate?.id ?? null,
    });

    if (matchedTemplate) {
      await this.templates.incrementUsage(matchedTemplate.id).catch(() => undefined);
    }

    let savedTemplateId: string | null = matchedTemplate?.id ?? null;
    // El mapeo es independiente de las filas malas: se guarda aunque haya cuarentena.
    if (plan.saveTemplate) {
      const template = await this.templates.upsert({
        organizationId: user.organizationId,
        catalogId,
        name: plan.templateName ?? `Plantilla ${new Date().toISOString().slice(0, 10)}`,
        headers: parsed.headers,
        headersSignature: signature,
        mapping: Object.fromEntries(
          Object.entries(mapping).filter(([, value]) => value !== undefined),
        ) as ColumnMapping,
        extraFields,
        createdByUserId: user.id,
      });
      savedTemplateId = template.id;
      await this.audit.write({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: 'import.template_saved',
        entityType: 'import_mapping_template',
        entityId: template.id,
        after: { catalogId, name: template.name, headersSignature: signature, mode: plan.mode },
        ip: meta.ip,
        userAgent: meta.userAgent,
        traceId: meta.traceId,
      });
    }

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
        mode: plan.mode,
        carriedOver: persisted.carriedOver,
        templateId: savedTemplateId,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'import.completed',
      entityType: 'catalog_version',
      entityId: persisted.version.id,
      after: {
        catalogId,
        mode: plan.mode,
        carriedOver: persisted.carriedOver,
        templateId: savedTemplateId,
        importedRows: images.products.length,
        quarantineRows: validation.quarantineRows,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return withPlan(
      toImportResult(persisted.job, persisted.version, false, issues),
      plan.mode,
      persisted.carriedOver,
    );
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
    let contentType = 'application/octet-stream';
    if (extension === 'csv' || extension === 'tsv' || extension === 'txt') {
      contentType = 'text/csv; charset=utf-8';
    } else if (extension === 'xlsx' || extension === 'xls' || extension === 'ods') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (extension === 'json') {
      contentType = 'application/json';
    } else if (extension === 'pdf') {
      contentType = 'application/pdf';
    }

    try {
      await this.storage.client.putObject(this.docsBucket, objectKey, buffer, buffer.length, {
        'Content-Type': contentType,
      });
      return objectKey;
    } catch (error) {
      this.logger.warn({ err: error, catalogId, objectKey }, 'import_snapshot_upload_failed');
      return null;
    }
  }
}

/** El resultado del import incluye el plan aplicado (extra al contrato). */
export type ImportResultWithPlan = ImportResult & {
  mode: ImportMode;
  carriedOver: number;
};

export function withPlan(
  result: ImportResult,
  mode: ImportMode,
  carriedOver: number,
): ImportResultWithPlan {
  return { ...result, mode, carriedOver };
}
