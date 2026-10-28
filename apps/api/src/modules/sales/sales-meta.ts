import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { AuditMeta } from '../../common/audit/audit.types';

export type RequestWithTrace = Request & { traceId?: string };

/** Metadatos de auditoría comunes a clientes, cotizaciones y pedidos. */
export function salesMetaFrom(req: RequestWithTrace): AuditMeta {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    traceId: req.traceId ?? randomUUID(),
  };
}
