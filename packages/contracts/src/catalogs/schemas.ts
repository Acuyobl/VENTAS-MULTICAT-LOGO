import { z } from 'zod';

export const catalogSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  activeVersionId: z.string().uuid().nullable(),
  activeVersionNumber: z.number().int().nullable(),
  productCount: z.number().int(),
  currency: z.enum(['CRC', 'USD']),
  updatedAt: z.string(),
});

export type CatalogSummary = z.infer<typeof catalogSummarySchema>;

export const productSummarySchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  priceMinor: z.string(),
  currency: z.enum(['CRC', 'USD']),
  stock: z.number().int().nullable(),
  imageKey: z.string().nullable(),
  attributes: z.record(z.unknown()).nullable().optional(),
});

export type ProductSummary = z.infer<typeof productSummarySchema>;

export const memberSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  status: z.string(),
  roleKeys: z.array(z.string()),
  joinedAt: z.string().nullable(),
});

export type MemberSummary = z.infer<typeof memberSummarySchema>;
