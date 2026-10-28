import { z } from 'zod';
import { orderStatusSchema } from '../sales/schemas';
import { paymentStatusSchema } from './schemas';

export const refundStatusSchema = z.enum(['REQUESTED', 'PROCESSED', 'REJECTED']);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

export const refundRequestSchema = z
  .object({
    amountMinor: z.coerce.bigint().positive(),
    reason: z.string().trim().min(3).max(300),
    method: z.string().trim().max(40).optional(),
  })
  .strict();

export type RefundRequestInput = z.infer<typeof refundRequestSchema>;

export const refundSummarySchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
  amountMinor: z.string(),
  currency: z.enum(['CRC', 'USD']),
  reason: z.string(),
  method: z.string().nullable(),
  status: refundStatusSchema,
  requestedByUserId: z.string().uuid(),
  approvedByUserId: z.string().uuid().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type RefundSummary = z.infer<typeof refundSummarySchema>;

export const refundListResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  totalMinor: z.string(),
  paidMinor: z.string(),
  refundedMinor: z.string(),
  balanceMinor: z.string(),
  orderStatus: orderStatusSchema,
  items: z.array(refundSummarySchema),
});

export type RefundListResponse = z.infer<typeof refundListResponseSchema>;

export const refundDecisionSchema = z
  .object({
    note: z.string().trim().max(300).optional(),
    confirmSelfApproval: z.boolean().optional(),
  })
  .strict();

export type RefundDecisionInput = z.infer<typeof refundDecisionSchema>;

export const orderRefundedStateSchema = z.object({
  paymentStatus: paymentStatusSchema,
  orderStatus: orderStatusSchema,
  paidMinor: z.string(),
  refundedMinor: z.string(),
  balanceMinor: z.string(),
});

export type OrderRefundedState = z.infer<typeof orderRefundedStateSchema>;
