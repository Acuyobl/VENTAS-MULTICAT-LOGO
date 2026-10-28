import { Injectable } from '@nestjs/common';
import type { CatalogVersion, ImportJob, ImportRowIssue, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Currency } from '@ventascatalogo/contracts';
import type { ResolvedMapping } from './import/normalize-header';
import type { ImportRowIssueData } from './import/row-validator';
import type { ResolvedImportProduct } from './import/import-images';

export type ImportJobWithIssues = ImportJob & { issues: ImportRowIssue[] };

export interface ExistingImport {
  job: ImportJobWithIssues;
  version: CatalogVersion;
}

export interface PersistImportInput {
  catalogId: string;
  /** Id de la versión generado antes de subir imágenes: su key las incluye. */
  versionId: string;
  createdByUserId: string;
  currency: Currency;
  taxRateBp: number;
  taxIncluded: boolean;
  checksum: string;
  sourceFileId: string | null;
  fileName: string | null;
  mapping: ResolvedMapping;
  totalRows: number;
  quarantineRows: number;
  products: ResolvedImportProduct[];
  issues: ImportRowIssueData[];
}

export interface PersistedImport {
  job: ImportJob;
  version: CatalogVersion;
}

@Injectable()
export class ImportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Búsqueda de idempotencia: el mismo SHA-256 en el mismo catálogo devuelve la
   * importación ya hecha (por `ImportJob.fileChecksum` y, como respaldo, por
   * `CatalogVersion.sourceChecksum`).
   */
  async findExisting(catalogId: string, checksum: string): Promise<ExistingImport | null> {
    const job = await this.prisma.importJob.findUnique({
      where: { catalogId_fileChecksum: { catalogId, fileChecksum: checksum } },
      include: {
        issues: { orderBy: { rowNumber: 'asc' } },
        catalogVersion: true,
      },
    });
    if (job?.catalogVersion) return { job, version: job.catalogVersion };

    const version = await this.prisma.catalogVersion.findUnique({
      where: { catalogId_sourceChecksum: { catalogId, sourceChecksum: checksum } },
      include: {
        importJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { issues: { orderBy: { rowNumber: 'asc' } } },
        },
      },
    });
    const fallbackJob = version?.importJobs[0];
    if (version && fallbackJob) return { job: fallbackJob, version };

    return null;
  }

  async findJob(catalogId: string, jobId: string): Promise<ExistingImport | null> {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, catalogId },
      include: {
        issues: { orderBy: { rowNumber: 'asc' } },
        catalogVersion: true,
      },
    });
    if (!job?.catalogVersion) return null;
    return { job, version: job.catalogVersion };
  }

  /**
   * Crea, en una sola transacción, la versión validada, el job `READY`, la
   * cuarentena y los productos. Si cualquier paso falla no queda versión "a
   * medias" ni productos huérfanos.
   */
  async persist(input: PersistImportInput): Promise<PersistedImport> {
    const columnMapping = Object.fromEntries(
      Object.entries(input.mapping).filter(([, value]) => value !== undefined),
    );

    return this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.catalogVersion.aggregate({
        where: { catalogId: input.catalogId },
        _max: { versionNumber: true },
      });
      const versionNumber = (aggregate._max.versionNumber ?? 0) + 1;
      const now = new Date();

      const version = await tx.catalogVersion.create({
        data: {
          id: input.versionId,
          catalogId: input.catalogId,
          versionNumber,
          status: 'VALIDATED',
          currency: input.currency,
          taxRateBp: input.taxRateBp,
          taxIncluded: input.taxIncluded,
          productCount: input.products.length,
          sourceFileId: input.sourceFileId,
          sourceChecksum: input.checksum,
          importedAt: now,
          validatedAt: now,
          createdByUserId: input.createdByUserId,
        },
      });

      const job = await tx.importJob.create({
        data: {
          catalogId: input.catalogId,
          catalogVersionId: version.id,
          status: 'READY',
          sourceType: 'upload',
          fileName: input.fileName,
          fileChecksum: input.checksum,
          columnMapping: columnMapping as Prisma.InputJsonValue,
          totalRows: input.totalRows,
          importedRows: input.products.length,
          quarantineRows: input.quarantineRows,
          createdByUserId: input.createdByUserId,
          startedAt: now,
          finishedAt: now,
        },
      });

      if (input.issues.length > 0) {
        await tx.importRowIssue.createMany({
          data: input.issues.map((issue) => ({
            importJobId: job.id,
            rowNumber: issue.rowNumber,
            severity: issue.severity,
            code: issue.code,
            message: issue.message,
            rawData: issue.rawData as Prisma.InputJsonValue,
          })),
        });
      }

      if (input.products.length > 0) {
        await tx.product.createMany({
          data: input.products.map((product) => ({
            id: product.id,
            catalogId: input.catalogId,
            catalogVersionId: version.id,
            sku: product.sku,
            name: product.name,
            description: product.description,
            category: product.category,
            brand: product.brand,
            priceMinor: product.priceMinor,
            costMinor: product.costMinor,
            currency: input.currency,
            stock: product.stock,
            imageKey: product.imageKey,
          })),
        });
      }

      return { job, version };
    });
  }
}
