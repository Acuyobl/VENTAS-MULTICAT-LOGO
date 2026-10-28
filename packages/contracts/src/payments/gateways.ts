import { z } from 'zod';
import { paymentProviderSchema } from '../payments/schemas';

export const gatewayModeSchema = z.enum(['TEST', 'LIVE']);
export type GatewayMode = z.infer<typeof gatewayModeSchema>;

export const gatewayConfigSchema = z.object({
  provider: paymentProviderSchema,
  mode: gatewayModeSchema,
  enabled: z.boolean(),
  publicKey: z.string().nullable(),
  maskedKey: z.string().nullable(),
  hasSecret: z.boolean(),
  updatedAt: z.string(),
});

export type GatewayConfig = z.infer<typeof gatewayConfigSchema>;

export const gatewayConfigListResponseSchema = z.object({
  items: z.array(gatewayConfigSchema),
});

export type GatewayConfigListResponse = z.infer<typeof gatewayConfigListResponseSchema>;

export const gatewayConfigUpdateSchema = z
  .object({
    mode: gatewayModeSchema.default('TEST'),
    enabled: z.boolean().default(false),
    publicKey: z.string().trim().max(200).optional(),
    secretKey: z.string().trim().max(300).optional(),
    webhookSecret: z.string().trim().max(300).optional(),
  })
  .strict();

export type GatewayConfigUpdateInput = z.infer<typeof gatewayConfigUpdateSchema>;
