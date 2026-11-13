import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ApprovalCreateInput,
  ApprovalDecisionInput,
  ApprovalListResponse,
  ApprovalRequest,
  ApprovalStatus,
  AuthenticatedUser,
} from '@ventascatalogo/contracts';
import type { ApprovalRequest as ApprovalRequestRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

/** Metadatos de auditoría para llamadas internas sin request HTTP. */
function fallbackMeta(): AuditMeta {
  return { traceId: randomUUID() };
}

/** Mapea la fila de Prisma al contrato público (fechas ISO). */
export function toApprovalRequest(row: ApprovalRequestRow): ApprovalRequest {
  return {
    id: row.id,
    organizationId: row.organizationId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    payload: row.payload ?? null,
    status: row.status,
    requestedByUserId: row.requestedByUserId,
    decidedByUserId: row.decidedByUserId ?? null,
    decisionNote: row.decisionNote ?? null,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Alta de la solicitud: nace REQUESTED y queda auditada. */
  async create(
    organizationId: string,
    userId: string,
    input: ApprovalCreateInput,
    meta: AuditMeta = fallbackMeta(),
  ): Promise<ApprovalRequest> {
    const created = await this.prisma.approvalRequest.create({
      data: {
        organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        payload: (input.payload ?? null) as never,
        status: 'REQUESTED',
        requestedByUserId: userId,
      },
    });

    await this.audit.write({
      organizationId,
      actorUserId: userId,
      action: 'approval.requested',
      entityType: 'approval_request',
      entityId: created.id,
      after: {
        status: created.status,
        entityType: created.entityType,
        entityId: created.entityId,
        action: created.action,
        payloadKeys: input.payload ? Object.keys(input.payload) : [],
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toApprovalRequest(created);
  }

  /** Listado scoped por organización, opcionalmente filtrado por estado. */
  async list(organizationId: string, status?: ApprovalStatus): Promise<ApprovalListResponse> {
    const where = {
      organizationId,
      ...(status ? { status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return {
      items: rows.map(toApprovalRequest),
      total,
    };
  }

  /**
   * Decisión de un aprobador. Segregación de funciones: quien solicitó no
   * puede decidir su propia solicitud salvo que la organización habilite
   * `allowSelfApproval`. Una solicitud ya decidida no se puede volver a tocar.
   */
  async decide(
    organizationId: string,
    user: AuthenticatedUser,
    id: string,
    input: ApprovalDecisionInput,
    meta: AuditMeta = fallbackMeta(),
  ): Promise<ApprovalRequest> {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id, organizationId },
    });
    if (!approval) throw new AppException('NOT_FOUND', 404, { resource: 'approval_request' });

    if (approval.status !== 'REQUESTED') {
      throw new AppException(
        'CONFLICT',
        409,
        { status: approval.status },
        'La solicitud ya fue decidida.',
      );
    }

    const selfApproval = approval.requestedByUserId === user.id;
    if (selfApproval) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { allowSelfApproval: true },
      });
      if (!organization?.allowSelfApproval) {
        throw new AppException('FORBIDDEN', 403, { reason: 'self_approval' });
      }
    }

    // Se captura antes de mutar: algunos clientes/ORM devuelven la misma
    // referencia que se leyó, y el `before` de auditoría quedaría pisado.
    const previousStatus = approval.status;

    const decided = await this.prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: input.decision,
        decidedByUserId: user.id,
        decisionNote: input.note ?? null,
        decidedAt: new Date(),
      },
    });

    await this.audit.write({
      organizationId,
      actorUserId: user.id,
      action: 'approval.decided',
      entityType: 'approval_request',
      entityId: decided.id,
      before: { status: previousStatus },
      after: {
        status: decided.status,
        decisionNote: decided.decisionNote,
        decidedByUserId: decided.decidedByUserId,
        selfApproval,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toApprovalRequest(decided);
  }

  /** Cancelación: solo el solicitante y solo mientras siga pendiente. */
  async cancel(
    organizationId: string,
    user: AuthenticatedUser,
    id: string,
    meta: AuditMeta = fallbackMeta(),
  ): Promise<ApprovalRequest> {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id, organizationId },
    });
    if (!approval) throw new AppException('NOT_FOUND', 404, { resource: 'approval_request' });

    if (approval.requestedByUserId !== user.id) {
      throw new AppException('FORBIDDEN', 403, { reason: 'not_requester' });
    }

    if (approval.status !== 'REQUESTED') {
      throw new AppException(
        'CONFLICT',
        409,
        { status: approval.status },
        'La solicitud ya fue decidida.',
      );
    }

    const cancelled = await this.prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { status: 'CANCELLED' },
    });

    await this.audit.write({
      organizationId,
      actorUserId: user.id,
      action: 'approval.cancelled',
      entityType: 'approval_request',
      entityId: cancelled.id,
      before: { status: approval.status },
      after: { status: cancelled.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toApprovalRequest(cancelled);
  }
}
