import { z } from 'zod';

/** Uso de IA de la organización en el mes en curso. */
export const aiUsageSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  tokensTotal: z.number().int(),
  quotaTokens: z.number().int(),
  remainingTokens: z.number().int(),
  costMicroUsd: z.number().int(),
  byFeature: z.array(
    z.object({
      feature: z.string(),
      tokensTotal: z.number().int(),
      requests: z.number().int(),
      costMicroUsd: z.number().int(),
    }),
  ),
});

export type AiUsage = z.infer<typeof aiUsageSchema>;
