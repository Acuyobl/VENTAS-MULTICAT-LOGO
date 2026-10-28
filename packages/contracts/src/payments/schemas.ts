import { z } from 'zod';
import { orderStatusSchema } from '../sales/schemas';
import { storefrontOrderSchema } from '../storefront/schemas';

export const paymentProviderSchema = z.enum([
  'STRIPE',
  'MERCADOPAGO',
  'PAYPAL',
  'CASH',
  'TRANSFER',
  'SINPE',
  'SANDBOX',
]);

export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const paymentStatusSchema = z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentLinkStatusSchema = z.enum(['ACTIVE', 'USED', 'EXPIRED']);
export type PaymentLinkStatus = z.infer<typeof paymentLinkStatusSchema>;

export const paymentLinkCreateSchema = z
  .object({
    provider: paymentProviderSchema.optional(),
    amountMinor: z.coerce.bigint().positive().optional(),
    expiresInMinutes: z.coerce.number().int().min(5).max(10080).optional(),
  })
  .strict();

export type PaymentLinkCreateInput = z.infer<typeof paymentLinkCreateSchema>;

export const paymentLinkResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  provider: paymentProviderSchema,
  status: paymentLinkStatusSchema,
  url: z.string(),
  amountMinor: z.string(),
  currency: z.enum(['CRC', 'USD']),
  expiresAt: z.string(),
});

export type PaymentLinkResponse = z.infer<typeof paymentLinkResponseSchema>;

export const publicPaymentLinkSchema = z.object({
  token: z.string(),
  status: paymentLinkStatusSchema,
  provider: paymentProviderSchema,
  amountMinor: z.string(),
  currency: z.enum(['CRC', 'USD']),
  expiresAt: z.string(),
  order: storefrontOrderSchema,
});

export type PublicPaymentLink = z.infer<typeof publicPaymentLinkSchema>;

export const manualPaymentCreateSchema = z
  .object({
    amountMinor: z.coerce.bigint().positive(),
    method: z.enum(['CASH', 'TRANSFER', 'SINPE']),
    reference: z.string().trim().max(120).optional(),
    paidAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .strict();

export type ManualPaymentCreateInput = z.infer<typeof manualPaymentCreateSchema>;

export const paymentSummarySchema = z.object({
  id: z.string().uuid(),
  provider: paymentProviderSchema,
  status: paymentStatusSchema,
  amountMinor: z.string(),
  currency: z.enum(['CRC', 'USD']),
  method: z.string().nullable(),
  reference: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});

export type PaymentSummary = z.infer<typeof paymentSummarySchema>;

export const paymentListResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  currency: z.enum(['CRC', 'USD']),
  totalMinor: z.string(),
  paidMinor: z.string(),
  balanceMinor: z.string(),
  orderStatus: orderStatusSchema,
  items: z.array(paymentSummarySchema),
});

export type PaymentListResponse = z.infer<typeof paymentListResponseSchema>;

export const sandboxConfirmResponseSchema = z.object({
  paymentStatus: paymentStatusSchema,
  orderStatus: orderStatusSchema,
  paidMinor: z.string(),
  totalMinor: z.string(),
  alreadyProcessed: z.boolean(),
});

export type SandboxConfirmResponse = z.infer<typeof sandboxConfirmResponseSchema>;
