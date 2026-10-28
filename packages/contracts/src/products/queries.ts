import { z } from 'zod';
import { cursorPageSchema } from '../common/pagination';

/**
 * Filtros del listado de productos. `catalogId` es obligatorio y `versionId` es opcional:
 * si se omite se usa la versión activa. El listado nunca mezcla versiones (regla R2).
 */
export const productListQuerySchema = cursorPageSchema.extend({
  catalogId: z.string().uuid(),
  versionId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(120).optional(),
  includeInactive: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => value === true || value === 'true' || value === '1')
    .default(false),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const versionedProductSummarySchema = z.object({
  id: z.string().uuid(),
  catalogId: z.string().uuid(),
  catalogVersionId: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  priceMinor: z.string(),
  costMinor: z.string().nullable(),
  currency: z.enum(['CRC', 'USD']),
  stock: z.number().int().nullable(),
  imageKey: z.string().nullable(),
  /** URL firmada de descarga (MinIO). null si el producto no tiene imagen o el storage no está configurado. */
  imageUrl: z.string().nullable(),
  isActive: z.boolean(),
  attributes: z.record(z.unknown()).nullable().optional(),
});

export type VersionedProductSummary = z.infer<typeof versionedProductSummarySchema>;

export const productListResponseSchema = z.object({
  items: z.array(versionedProductSummarySchema),
  nextCursor: z.string().uuid().nullable(),
  catalogId: z.string().uuid(),
  versionId: z.string().uuid(),
  versionNumber: z.number().int(),
});

export type ProductListResponse = z.infer<typeof productListResponseSchema>;
