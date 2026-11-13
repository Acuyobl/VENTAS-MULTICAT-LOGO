import { z } from 'zod';

/** Estado de una solicitud de aprobación. */
export const approvalStatusSchema = z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED']);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

/** Decisión que puede tomar un aprobador. */
export const approvalDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(500).optional(),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

/** Alta de una solicitud de aprobación. */
export const approvalCreateSchema = z.object({
  entityType: z.string().trim().min(1).max(60),
  entityId: z.string().trim().min(1).max(120),
  action: z.string().trim().min(1).max(80),
  payload: z.record(z.unknown()).optional(),
});
export type ApprovalCreateInput = z.infer<typeof approvalCreateSchema>;

export const approvalRequestSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  payload: z.unknown().nullable(),
  status: approvalStatusSchema,
  requestedByUserId: z.string(),
  decidedByUserId: z.string().nullable(),
  decisionNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const approvalListResponseSchema = z.object({
  items: z.array(approvalRequestSchema),
  total: z.number().int(),
});
export type ApprovalListResponse = z.infer<typeof approvalListResponseSchema>;

/** Umbral por defecto (en unidades menores) sobre el que se exige aprobación. */
export const approvalPolicySchema = z.object({
  amountThresholdMinor: z.number().int().min(0).default(0),
  currency: z.enum(['CRC', 'USD']).optional(),
});
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;
