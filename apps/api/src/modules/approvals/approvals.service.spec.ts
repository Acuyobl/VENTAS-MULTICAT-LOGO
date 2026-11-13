import { describe, expect, it, vi } from 'vitest';
import type { ApprovalRequest as ApprovalRequestRow } from '@prisma/client';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { AppException } from '../../common/errors/app-exception';
import { ApprovalsService } from './approvals.service';

// El cliente de Prisma no se genera en el runner unitario: el servicio recibe
// dobles inyectados a mano, así que alcanza con neutralizar el módulo real.
vi.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const ORG_A = '01920000-0000-7000-8000-00000000000a';
const ORG_B = '01920000-0000-7000-8000-00000000000b';
const USER_REQUESTER = '01920000-0000-7000-8000-000000000001';
const USER_APPROVER = '01920000-0000-7000-8000-000000000002';

function staffUser(id: string, organizationId = ORG_A): AuthenticatedUser {
  return {
    id,
    email: `${id.slice(-4)}@demo.local`,
    fullName: 'Usuario Demo',
    audience: 'staff',
    organizationId,
    organizationName: 'Demo',
    organizationSlug: 'demo',
    roleKeys: ['org_admin'],
    permissions: ['approval:read', 'approval:decide'],
    mfaEnabled: true,
    mfaEnrollmentRequired: false,
  };
}

let nextId = 0;

function approvalRow(overrides: Partial<ApprovalRequestRow> = {}): ApprovalRequestRow {
  nextId += 1;
  return {
    id: `01920000-0000-7000-8000-0000000001${String(nextId).padStart(2, '0')}`,
    organizationId: ORG_A,
    entityType: 'order',
    entityId: '01920000-0000-7000-8000-000000000020',
    action: 'order.cancel',
    payload: null,
    status: 'REQUESTED',
    requestedByUserId: USER_REQUESTER,
    decidedByUserId: null,
    decisionNote: null,
    decidedAt: null,
    createdAt: new Date('2026-11-07T12:00:00.000Z'),
    ...overrides,
  } as ApprovalRequestRow;
}

interface Harness {
  service: ApprovalsService;
  state: { rows: ApprovalRequestRow[]; allowSelfApproval: boolean };
  audits: Array<Record<string, unknown>>;
}

function buildService(
  options: {
    rows?: ApprovalRequestRow[];
    allowSelfApproval?: boolean;
  } = {},
): Harness {
  const state = {
    rows: [...(options.rows ?? [])],
    allowSelfApproval: options.allowSelfApproval ?? false,
  };
  const audits: Array<Record<string, unknown>> = [];

  const matchesWhere = (row: ApprovalRequestRow, where: Record<string, unknown>): boolean => {
    if (where.organizationId !== undefined && row.organizationId !== where.organizationId) {
      return false;
    }
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.status !== undefined && row.status !== where.status) return false;
    return true;
  };

  const prisma = {
    approvalRequest: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const row = {
          id: `01920000-0000-7000-8000-0000000003${String(state.rows.length + 1).padStart(2, '0')}`,
          organizationId: args.data.organizationId,
          entityType: args.data.entityType,
          entityId: args.data.entityId,
          action: args.data.action,
          payload: args.data.payload ?? null,
          status: 'REQUESTED',
          requestedByUserId: args.data.requestedByUserId,
          decidedByUserId: null,
          decisionNote: null,
          decidedAt: null,
          createdAt: new Date('2026-11-07T15:00:00.000Z'),
        } as ApprovalRequestRow;
        state.rows.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async (args: { where: Record<string, unknown> }) =>
          state.rows.find((row) => matchesWhere(row, args.where)) ?? null,
      ),
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
        state.rows.filter((row) => matchesWhere(row, args.where)),
      ),
      count: vi.fn(
        async (args: { where: Record<string, unknown> }) =>
          state.rows.filter((row) => matchesWhere(row, args.where)).length,
      ),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<ApprovalRequestRow> }) => {
        const row = state.rows.find((item) => item.id === args.where.id);
        if (!row) throw new Error('approval not found');
        Object.assign(row, args.data);
        return { ...row };
      }),
    },
    organization: {
      findUnique: vi.fn(async () => ({ allowSelfApproval: state.allowSelfApproval })),
    },
  } as unknown as PrismaService;

  const audit = {
    write: vi.fn(async (entry: Record<string, unknown>) => {
      audits.push(entry);
    }),
  } as unknown as AuditService;

  return { service: new ApprovalsService(prisma, audit), state, audits };
}

async function captureError(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    return error as AppException;
  }
  throw new Error('Se esperaba un AppException y la promesa resolvió.');
}

describe('ApprovalsService', () => {
  it('crea la solicitud en REQUESTED y deja auditoría approval.requested', async () => {
    const { service, state, audits } = buildService();

    const created = await service.create(ORG_A, USER_REQUESTER, {
      entityType: 'order',
      entityId: '01920000-0000-7000-8000-000000000020',
      action: 'order.cancel',
      payload: { reason: 'cliente desiste' },
    });

    expect(created.status).toBe('REQUESTED');
    expect(created.requestedByUserId).toBe(USER_REQUESTER);
    expect(created.createdAt).toBe('2026-11-07T15:00:00.000Z');
    expect(state.rows).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      organizationId: ORG_A,
      actorUserId: USER_REQUESTER,
      action: 'approval.requested',
      entityType: 'approval_request',
      entityId: created.id,
      after: { status: 'REQUESTED', payloadKeys: ['reason'] },
    });
  });

  it('decide felizmente: actualiza estado, aprobador y fecha, y audita approval.decided', async () => {
    const row = approvalRow();
    const { service, audits } = buildService({ rows: [row] });

    const decided = await service.decide(ORG_A, staffUser(USER_APPROVER), row.id, {
      decision: 'APPROVED',
      note: 'Aprobado por el encargado',
    });

    expect(decided.status).toBe('APPROVED');
    expect(decided.decidedByUserId).toBe(USER_APPROVER);
    expect(decided.decisionNote).toBe('Aprobado por el encargado');
    expect(decided.decidedAt).not.toBeNull();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'approval.decided',
      entityType: 'approval_request',
      entityId: row.id,
      before: { status: 'REQUESTED' },
      after: { status: 'APPROVED', selfApproval: false },
    });
  });

  it('no permite aprobar dos veces: la segunda decisión da 409 CONFLICT', async () => {
    const row = approvalRow();
    const { service, audits } = buildService({ rows: [row] });

    await service.decide(ORG_A, staffUser(USER_APPROVER), row.id, { decision: 'APPROVED' });
    const error = await captureError(
      service.decide(ORG_A, staffUser(USER_APPROVER), row.id, { decision: 'REJECTED' }),
    );

    expect(error.code).toBe('CONFLICT');
    expect(error.getStatus()).toBe(409);
    expect(error.details).toEqual({ status: 'APPROVED' });
    expect(row.status).toBe('APPROVED');
    expect(audits).toHaveLength(1);
  });

  it('bloquea la autoaprobación cuando la organización tiene allowSelfApproval=false', async () => {
    const row = approvalRow({ requestedByUserId: USER_APPROVER });
    const { service, audits } = buildService({ rows: [row], allowSelfApproval: false });

    const error = await captureError(
      service.decide(ORG_A, staffUser(USER_APPROVER), row.id, { decision: 'APPROVED' }),
    );

    expect(error.code).toBe('FORBIDDEN');
    expect(error.getStatus()).toBe(403);
    expect(error.details).toEqual({ reason: 'self_approval' });
    expect(row.status).toBe('REQUESTED');
    expect(audits).toHaveLength(0);
  });

  it('permite la autoaprobación cuando la organización la habilita', async () => {
    const row = approvalRow({ requestedByUserId: USER_APPROVER });
    const { service } = buildService({ rows: [row], allowSelfApproval: true });

    const decided = await service.decide(ORG_A, staffUser(USER_APPROVER), row.id, {
      decision: 'APPROVED',
    });

    expect(decided.status).toBe('APPROVED');
    expect(decided.decidedByUserId).toBe(USER_APPROVER);
  });

  it('devuelve 404 cuando la solicitud es de otra organización o no existe', async () => {
    const row = approvalRow({ organizationId: ORG_B });
    const { service } = buildService({ rows: [row] });

    const crossOrg = await captureError(
      service.decide(ORG_A, staffUser(USER_APPROVER, ORG_A), row.id, { decision: 'APPROVED' }),
    );
    const missing = await captureError(
      service.decide(ORG_A, staffUser(USER_APPROVER, ORG_A), '01920000-0000-7000-8000-999999999999', {
        decision: 'APPROVED',
      }),
    );

    expect(crossOrg.code).toBe('NOT_FOUND');
    expect(crossOrg.getStatus()).toBe(404);
    expect(missing.code).toBe('NOT_FOUND');
  });

  it('lista solo las solicitudes de la organización, con total y filtro por estado', async () => {
    const ownPending = approvalRow({ createdAt: new Date('2026-11-07T12:00:00.000Z') });
    const ownApproved = approvalRow({
      status: 'APPROVED',
      decidedByUserId: USER_APPROVER,
      decidedAt: new Date('2026-11-07T13:00:00.000Z'),
      createdAt: new Date('2026-11-07T11:00:00.000Z'),
    });
    const foreign = approvalRow({ organizationId: ORG_B });
    const { service } = buildService({ rows: [ownPending, ownApproved, foreign] });

    const all = await service.list(ORG_A);
    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.id).sort()).toEqual(
      [ownPending.id, ownApproved.id].sort(),
    );
    expect(all.items.every((item) => item.organizationId === ORG_A)).toBe(true);
    expect(all.items[0]?.createdAt).toBe('2026-11-07T12:00:00.000Z');

    const pending = await service.list(ORG_A, 'REQUESTED');
    expect(pending.total).toBe(1);
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]?.id).toBe(ownPending.id);
  });

  it('cancela solo el solicitante y solo si sigue en REQUESTED', async () => {
    const row = approvalRow();
    const { service, audits } = buildService({ rows: [row] });

    const cancelled = await service.cancel(ORG_A, staffUser(USER_REQUESTER), row.id);

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.decidedByUserId).toBeNull();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'approval.cancelled', entityId: row.id });

    const alreadyCancelled = await captureError(
      service.cancel(ORG_A, staffUser(USER_REQUESTER), row.id),
    );
    expect(alreadyCancelled.code).toBe('CONFLICT');
    expect(alreadyCancelled.getStatus()).toBe(409);
  });

  it('rechaza la cancelación de alguien que no es el solicitante', async () => {
    const row = approvalRow();
    const { service, audits } = buildService({ rows: [row] });

    const error = await captureError(
      service.cancel(ORG_A, staffUser(USER_APPROVER, ORG_A), row.id),
    );

    expect(error.code).toBe('FORBIDDEN');
    expect(error.getStatus()).toBe(403);
    expect(error.details).toEqual({ reason: 'not_requester' });
    expect(row.status).toBe('REQUESTED');
    expect(audits).toHaveLength(0);
  });

  it('rechaza decidir o cancelar una solicitud fuera de la organización (404)', async () => {
    const row = approvalRow({ organizationId: ORG_B });
    const { service } = buildService({ rows: [row] });

    const decideError = await captureError(
      service.decide(ORG_A, staffUser(USER_APPROVER, ORG_A), row.id, { decision: 'APPROVED' }),
    );
    const cancelError = await captureError(
      service.cancel(ORG_A, staffUser(USER_REQUESTER, ORG_A), row.id),
    );

    expect(decideError.code).toBe('NOT_FOUND');
    expect(decideError.getStatus()).toBe(404);
    expect(cancelError.code).toBe('NOT_FOUND');
    expect(cancelError.getStatus()).toBe(404);
  });
});
