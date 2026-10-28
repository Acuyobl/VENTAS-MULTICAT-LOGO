import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD');

export const reportRangeQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
    catalogId: z.string().uuid().optional(),
  })
  .strict();

export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const financeReportSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  currency: z.enum(['CRC', 'USD']),
  sales: z.object({
    orders: z.number().int(),
    byStatus: z.record(z.number().int()),
    grossMinor: z.string(),
    discountMinor: z.string(),
    taxMinor: z.string(),
    netMinor: z.string(),
    paidMinor: z.string(),
    refundedMinor: z.string(),
  }),
  payments: z.object({
    count: z.number().int(),
    totalMinor: z.string(),
    byMethod: z.array(
      z.object({ method: z.string(), count: z.number().int(), totalMinor: z.string() }),
    ),
  }),
  refunds: z.object({
    requestedCount: z.number().int(),
    processedCount: z.number().int(),
    requestedMinor: z.string(),
    processedMinor: z.string(),
  }),
  receivables: z.object({
    openOrders: z.number().int(),
    openBalanceMinor: z.string(),
    overdueOrders: z.number().int(),
    overdueBalanceMinor: z.string(),
  }),
  topProducts: z.array(
    z.object({
      productId: z.string().uuid(),
      name: z.string(),
      quantity: z.number().int(),
      revenueMinor: z.string(),
    }),
  ),
});

export type FinanceReport = z.infer<typeof financeReportSchema>;

export const reconciliationReportSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  currency: z.enum(['CRC', 'USD']),
  rows: z.array(
    z.object({
      paymentId: z.string().uuid(),
      orderNumber: z.string(),
      date: z.string(),
      method: z.string(),
      provider: z.string(),
      amountMinor: z.string(),
      status: z.string(),
      reference: z.string().nullable(),
    }),
  ),
  totals: z.object({
    count: z.number().int(),
    registeredMinor: z.string(),
    refundedMinor: z.string(),
    netMinor: z.string(),
  }),
});

export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;

export const reminderChannelSchema = z.enum(['EMAIL', 'WHATSAPP']);
export type ReminderChannel = z.infer<typeof reminderChannelSchema>;

export const reminderCreateSchema = z
  .object({
    channel: reminderChannelSchema.default('EMAIL'),
  })
  .strict();

export type ReminderCreateInput = z.infer<typeof reminderCreateSchema>;

export const reminderSummarySchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  channel: reminderChannelSchema,
  to: z.string(),
  status: z.enum(['SENT', 'FAILED']),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ReminderSummary = z.infer<typeof reminderSummarySchema>;

export const reminderListResponseSchema = z.object({
  orderId: z.string().uuid(),
  items: z.array(reminderSummarySchema),
});

export type ReminderListResponse = z.infer<typeof reminderListResponseSchema>;
