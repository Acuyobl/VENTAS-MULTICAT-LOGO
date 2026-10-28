import { z } from 'zod';

export const catalogVersionStatusSchema = z.enum(['DRAFT', 'VALIDATED', 'ACTIVE', 'ARCHIVED']);

export type CatalogVersionStatus = z.infer<typeof catalogVersionStatusSchema>;

export const catalogVersionSummarySchema = z.object({
  id: z.string().uuid(),
  catalogId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  status: catalogVersionStatusSchema,
  currency: z.enum(['CRC', 'USD']),
  taxRateBp: z.number().int(),
  taxIncluded: z.boolean(),
  productCount: z.number().int(),
  sourceChecksum: z.string().nullable(),
  importedAt: z.string().nullable(),
  validatedAt: z.string().nullable(),
  activatedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  isActive: z.boolean(),
});

export type CatalogVersionSummary = z.infer<typeof catalogVersionSummarySchema>;

/** Columnas del archivo de origen que el importador sabe mapear. */
export const columnMappingSchema = z
  .object({
    sku: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    price: z.string().min(1).optional(),
    cost: z.string().optional(),
    stock: z.string().optional(),
    image: z.string().optional(),
  })
  .strict();

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const importOptionsSchema = z
  .object({
    mapping: columnMappingSchema.optional(),
    currency: z.enum(['CRC', 'USD']).default('CRC'),
    taxRateBp: z.coerce.number().int().min(0).max(3000).default(1300),
    taxIncluded: z
      .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
      .transform((value) => value === true || value === 'true' || value === '1')
      .default(true),
    delimiter: z.string().max(1).optional(),
    updateDraftVersionId: z.string().uuid().optional(),
  })
  .strict();

export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const importQuarantineRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  severity: z.string(),
  code: z.string(),
  message: z.string(),
  rawData: z.record(z.unknown()),
});

export type ImportQuarantineRow = z.infer<typeof importQuarantineRowSchema>;

export const importResultSchema = z.object({
  importJobId: z.string().uuid(),
  catalogVersionId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  status: catalogVersionStatusSchema,
  idempotent: z.boolean(),
  totalRows: z.number().int(),
  importedRows: z.number().int(),
  quarantineRows: z.number().int(),
  issues: z.array(importQuarantineRowSchema),
});

export type ImportResult = z.infer<typeof importResultSchema>;
