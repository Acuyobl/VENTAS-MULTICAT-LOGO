import { z } from 'zod';
import { orderStatusSchema, quoteItemSchema } from '../sales/schemas';

export const storefrontCustomerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    phone: z
      .string()
      .trim()
      .max(32)
      .regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido')
      .optional(),
    email: z.string().trim().email().max(160).optional(),
  })
  .strict();

export type StorefrontCustomer = z.infer<typeof storefrontCustomerSchema>;

export const storefrontItemSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().int().min(1).max(999),
  })
  .strict();

export type StorefrontItem = z.infer<typeof storefrontItemSchema>;

export const storefrontCheckoutSchema = z
  .object({
    catalogSlug: z.string().trim().min(1).max(120),
    items: z.array(storefrontItemSchema).min(1).max(50),
    customer: storefrontCustomerSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type StorefrontCheckoutInput = z.infer<typeof storefrontCheckoutSchema>;

export const storefrontCheckoutResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  status: orderStatusSchema,
  totalMinor: z.string(),
  currency: z.enum(['CRC', 'USD']),
  token: z.string().min(20),
  expiresAt: z.string(),
});

export type StorefrontCheckoutResponse = z.infer<typeof storefrontCheckoutResponseSchema>;

export const storefrontOrderSchema = z.object({
  orderNumber: z.string(),
  status: orderStatusSchema,
  currency: z.enum(['CRC', 'USD']),
  subtotalMinor: z.string(),
  discountMinor: z.string(),
  taxMinor: z.string(),
  totalMinor: z.string(),
  taxRateBp: z.number().int(),
  taxIncluded: z.boolean(),
  customerName: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  items: z.array(quoteItemSchema),
});

export type StorefrontOrder = z.infer<typeof storefrontOrderSchema>;

export const storefrontClaimResponseSchema = z.object({
  orderId: z.string().uuid(),
  claimed: z.boolean(),
});

export type StorefrontClaimResponse = z.infer<typeof storefrontClaimResponseSchema>;

export const storefrontClaimSchema = z
  .object({
    token: z.string().min(20),
  })
  .strict();

export type StorefrontClaimInput = z.infer<typeof storefrontClaimSchema>;
