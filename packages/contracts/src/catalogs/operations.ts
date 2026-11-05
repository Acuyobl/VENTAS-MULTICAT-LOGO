import { z } from 'zod';

export const catalogDuplicateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .optional(),
    description: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export type CatalogDuplicateInput = z.infer<typeof catalogDuplicateSchema>;

export const catalogExportQuerySchema = z.object({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
});

export type CatalogExportQuery = z.infer<typeof catalogExportQuerySchema>;

export const bulkPriceScopeSchema = z.enum(['ALL', 'CATEGORY']);
export type BulkPriceScope = z.infer<typeof bulkPriceScopeSchema>;

export const bulkPriceTypeSchema = z.enum(['PERCENTAGE', 'FIXED']);
export type BulkPriceType = z.infer<typeof bulkPriceTypeSchema>;

export const bulkPriceDirectionSchema = z.enum(['INCREASE', 'DECREASE']);
export type BulkPriceDirection = z.infer<typeof bulkPriceDirectionSchema>;

export const bulkPriceAdjustmentSchema = z
  .object({
    scope: bulkPriceScopeSchema,
    category: z.string().trim().max(120).optional(),
    type: bulkPriceTypeSchema,
    direction: bulkPriceDirectionSchema,
    value: z.coerce.number().positive().max(10_000_000),
  })
  .strict()
  .refine(
    (data) => {
      if (data.scope === 'CATEGORY') {
        return !!data.category && data.category.trim().length > 0;
      }
      return true;
    },
    { message: 'La categoría es requerida cuando el alcance es CATEGORY', path: ['category'] },
  );

export type BulkPriceAdjustmentInput = z.infer<typeof bulkPriceAdjustmentSchema>;

export const bulkPricePreviewItemSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  currentPriceMinor: z.string(),
  newPriceMinor: z.string(),
  differenceMinor: z.string(),
  currentPriceFormatted: z.string(),
  newPriceFormatted: z.string(),
});

export type BulkPricePreviewItem = z.infer<typeof bulkPricePreviewItemSchema>;

export const bulkPricePreviewResponseSchema = z.object({
  totalProducts: z.number().int(),
  currency: z.enum(['CRC', 'USD']),
  sampleItems: z.array(bulkPricePreviewItemSchema),
});

export type BulkPricePreviewResponse = z.infer<typeof bulkPricePreviewResponseSchema>;

export const bulkPriceApplyResponseSchema = z.object({
  updatedCount: z.number().int(),
  message: z.string(),
});

export type BulkPriceApplyResponse = z.infer<typeof bulkPriceApplyResponseSchema>;

export const catalogCategoriesResponseSchema = z.object({
  categories: z.array(z.string()),
});

export type CatalogCategoriesResponse = z.infer<typeof catalogCategoriesResponseSchema>;
