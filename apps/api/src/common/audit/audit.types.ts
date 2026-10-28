export interface AuditMeta {
  actorUserId?: string | null;
  organizationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  traceId: string;
}

export interface AuditEntry extends AuditMeta {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}
