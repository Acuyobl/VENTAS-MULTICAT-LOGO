import { z } from 'zod';
import { cursorPageSchema } from '../common/pagination';

export const expenseCategorySchema = z.enum([
  'INSUMOS',
  'TRANSPORTE',
  'SERVICIOS',
  'MARKETING',
  'PLANILLA',
  'IMPUESTOS',
  'OTROS',
]);

export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const expenseCreateSchema = z
  .object({
    catalogId: z.string().uuid(),
    category: expenseCategorySchema,
    description: z.string().trim().min(3).max(200),
    amountMinor: z.coerce.bigint().positive(),
    currency: z.enum(['CRC', 'USD']).default('CRC'),
    taxMinor: z.coerce.bigint().nonnegative().optional(),
    incurredAt: z.string().datetime({ offset: true }).optional(),
    paymentMethod: z.string().trim().max(40).optional(),
  })
  .strict();

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const expenseSummarySchema = z.object({
  id: z.string().uuid(),
  catalogId: z.string().uuid(),
  category: expenseCategorySchema,
  description: z.string(),
  amountMinor: z.string(),
  currency: z.enum(['CRC', 'USD']),
  taxMinor: z.string(),
  incurredAt: z.string(),
  paymentMethod: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
});

export type ExpenseSummary = z.infer<typeof expenseSummarySchema>;

export const expenseListQuerySchema = cursorPageSchema.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  catalogId: z.string().uuid().optional(),
  category: expenseCategorySchema.optional(),
});

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

export const expenseListResponseSchema = z.object({
  items: z.array(expenseSummarySchema),
  nextCursor: z.string().uuid().nullable(),
  totals: z.object({
    count: z.number().int(),
    amountMinor: z.string(),
    taxMinor: z.string(),
    byCategory: z.array(
      z.object({ category: expenseCategorySchema, count: z.number().int(), amountMinor: z.string() }),
    ),
  }),
});

export type ExpenseListResponse = z.infer<typeof expenseListResponseSchema>;

export const profitReportSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  currency: z.enum(['CRC', 'USD']),
  income: z.object({
    netMinor: z.string(),
    grossMinor: z.string(),
    taxMinor: z.string(),
    refundedMinor: z.string(),
  }),
  expenses: z.object({
    totalMinor: z.string(),
    taxMinor: z.string(),
    count: z.number().int(),
    byCategory: z.array(
      z.object({ category: expenseCategorySchema, count: z.number().int(), amountMinor: z.string() }),
    ),
  }),
  profitMinor: z.string(),
  marginBp: z.number().int(),
});

export type ProfitReport = z.infer<typeof profitReportSchema>;
