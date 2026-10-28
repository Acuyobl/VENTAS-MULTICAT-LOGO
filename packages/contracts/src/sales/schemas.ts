import { z } from 'zod';
import { cursorPageSchema } from '../common/pagination';

export const quoteStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED',
]);

export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const orderStatusSchema = z.enum([
  'DRAFT',
  'PENDING_PAYMENT',
  'PARTIALLY_PAID',
  'PAID',
  'FULFILLED',
  'CANCELLED',
  'REFUNDED',
]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const customerTypeSchema = z.enum(['PERSON', 'COMPANY']);

export const customerCreateSchema = z
  .object({
    type: customerTypeSchema.default('PERSON'),
    fullName: z.string().trim().min(2).max(160),
    phone: z
      .string()
      .trim()
      .max(32)
      .regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido')
      .optional(),
    email: z.string().trim().email().max(160).optional(),
    idNumber: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

export const customerSummarySchema = z.object({
  id: z.string().uuid(),
  type: customerTypeSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  idNumber: z.string().nullable(),
  createdAt: z.string(),
});

export type CustomerSummary = z.infer<typeof customerSummarySchema>;

export const quoteItemInputSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().int().min(1).max(999),
    discountMinor: z.coerce.bigint().nonnegative().optional(),
  })
  .strict();

export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;

export const quoteCreateSchema = z
  .object({
    catalogId: z.string().uuid(),
    customerId: z.string().uuid(),
    items: z.array(quoteItemInputSchema).min(1).max(50),
    validUntil: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;

export const quoteListQuerySchema = cursorPageSchema.extend({
  catalogId: z.string().uuid().optional(),
  status: quoteStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
});

export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;

export const quoteItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  skuSnapshot: z.string(),
  nameSnapshot: z.string(),
  unitPriceMinor: z.string(),
  quantity: z.number().int(),
  discountMinor: z.string(),
  lineTotalMinor: z.string(),
});

export type QuoteItem = z.infer<typeof quoteItemSchema>;

export const quoteSummarySchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  status: quoteStatusSchema,
  catalogId: z.string().uuid(),
  catalogVersionId: z.string().uuid(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  currency: z.enum(['CRC', 'USD']),
  subtotalMinor: z.string(),
  discountMinor: z.string(),
  taxMinor: z.string(),
  totalMinor: z.string(),
  taxRateBp: z.number().int(),
  taxIncluded: z.boolean(),
  validUntil: z.string(),
  notes: z.string().nullable(),
  pdfUrl: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(quoteItemSchema).optional(),
});

export type QuoteSummary = z.infer<typeof quoteSummarySchema>;

export const quoteListResponseSchema = z.object({
  items: z.array(quoteSummarySchema),
  nextCursor: z.string().uuid().nullable(),
});

export type QuoteListResponse = z.infer<typeof quoteListResponseSchema>;

export const orderCreateFromQuoteSchema = z.object({}).strict();

export const orderSummarySchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  status: orderStatusSchema,
  catalogId: z.string().uuid(),
  catalogVersionId: z.string().uuid(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  quoteId: z.string().uuid().nullable(),
  currency: z.enum(['CRC', 'USD']),
  subtotalMinor: z.string(),
  discountMinor: z.string(),
  taxMinor: z.string(),
  totalMinor: z.string(),
  paidMinor: z.string(),
  taxRateBp: z.number().int(),
  taxIncluded: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(quoteItemSchema).optional(),
});

export type OrderSummary = z.infer<typeof orderSummarySchema>;

export const orderListResponseSchema = z.object({
  items: z.array(orderSummarySchema),
  nextCursor: z.string().uuid().nullable(),
});

export type OrderListResponse = z.infer<typeof orderListResponseSchema>;

export const orderCancelSchema = z
  .object({
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

export type OrderCancelInput = z.infer<typeof orderCancelSchema>;
