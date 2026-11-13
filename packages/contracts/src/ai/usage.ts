import { z } from 'zod';

/** Incidente de presupuesto: aviso por umbral o corte por límite alcanzado. */
export const aiBudgetIncidentSchema = z.object({
  id: z.string(),
  period: z.string(),
  kind: z.enum(['WARNING', 'HARD_STOP']),
  spentMicroUsd: z.number().int(),
  limitMicroUsd: z.number().int(),
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable(),
});
export type AiBudgetIncident = z.infer<typeof aiBudgetIncidentSchema>;

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
  /** Presupuesto mensual configurado (0 = sin límite explícito). */
  budgetMicroUsd: z.number().int(),
  /** Costo restante antes del corte (0 si no hay presupuesto explícito). */
  remainingMicroUsd: z.number().int(),
  /** Porcentaje del presupuesto consumido, redondeado a un decimal. */
  percentUsed: z.number(),
  /** Proyección de cierre de mes al ritmo actual. */
  forecastMicroUsd: z.number().int(),
  hardStop: z.boolean(),
  imagesGenerated: z.number().int(),
  incidents: z.array(aiBudgetIncidentSchema),
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

/** Actualización del presupuesto de IA de la organización. */
export const aiBudgetUpdateSchema = z.object({
  monthlyBudgetMicroUsd: z.number().int().min(0),
  alertPercent: z.number().int().min(1).max(100).default(80),
  hardStop: z.boolean().default(true),
});
export type AiBudgetUpdateInput = z.infer<typeof aiBudgetUpdateSchema>;
