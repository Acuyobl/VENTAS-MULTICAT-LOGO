import { z } from 'zod';

/** Rutinas disponibles en esta versión. */
export const routineKeySchema = z.enum([
  'AI_USAGE_DIGEST',
  'STALE_IMPORT_CLEANUP',
  'QUOTE_EXPIRY',
]);
export type RoutineKey = z.infer<typeof routineKeySchema>;

export const routineRunStatusSchema = z.enum(['RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED']);
export type RoutineRunStatus = z.infer<typeof routineRunStatusSchema>;

export const routineRunSchema = z.object({
  id: z.string(),
  status: routineRunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  output: z.unknown().nullable(),
  error: z.string().nullable(),
});
export type RoutineRun = z.infer<typeof routineRunSchema>;

export const routineSchema = z.object({
  id: z.string(),
  key: routineKeySchema,
  name: z.string(),
  enabled: z.boolean(),
  intervalMinutes: z.number().int(),
  nextRunAt: z.string(),
  lastRunAt: z.string().nullable(),
  lastRun: routineRunSchema.nullable().optional(),
});
export type Routine = z.infer<typeof routineSchema>;

export const routineListResponseSchema = z.object({ items: z.array(routineSchema) });
export type RoutineListResponse = z.infer<typeof routineListResponseSchema>;

export const routineUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  intervalMinutes: z.number().int().min(5).max(43_200).optional(),
});
export type RoutineUpdateInput = z.infer<typeof routineUpdateSchema>;
