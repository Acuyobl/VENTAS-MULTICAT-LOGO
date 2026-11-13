import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import type { PrismaService } from '../../prisma/prisma.service';
import { ROUTINE_DEFINITIONS, RoutinesService } from './routines.service';

const ORG_ID = '00000000-0000-7000-8000-000000000001';
const ROUTINE_ID = '11111111-1111-7111-8111-111111111111';
const RUN_ID = '22222222-2222-7222-8222-222222222222';
const NOW = new Date('2026-11-08T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const USER = {
  id: '33333333-3333-7333-8333-333333333333',
  email: 'staff@example.com',
  fullName: 'Staff Uno',
  audience: 'staff',
  organizationId: ORG_ID,
  organizationName: 'Demo',
  organizationSlug: 'demo',
  roleKeys: ['org_admin'],
  permissions: ['routine:read', 'routine:manage'],
  mfaEnabled: true,
  mfaEnrollmentRequired: false,
} as unknown as AuthenticatedUser;

interface RoutineFixture {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  enabled: boolean;
  intervalMinutes: number;
  config: null;
  nextRunAt: Date;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RunFixture {
  id: string;
  routineId: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  output: unknown;
  error: string | null;
}

type RoutineWithRuns = RoutineFixture & { runs: RunFixture[] };

function routineRow(overrides: Partial<RoutineWithRuns> = {}): RoutineWithRuns {
  return {
    id: ROUTINE_ID,
    organizationId: ORG_ID,
    key: 'AI_USAGE_DIGEST',
    name: 'Resumen diario de consumo IA',
    enabled: true,
    intervalMinutes: 1440,
    config: null,
    nextRunAt: new Date(NOW.getTime() - 60_000),
    lastRunAt: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    runs: [],
    ...overrides,
  };
}

function runRow(overrides: Partial<RunFixture> = {}): RunFixture {
  return {
    id: RUN_ID,
    routineId: ROUTINE_ID,
    status: 'RUNNING',
    startedAt: NOW,
    finishedAt: null,
    output: null,
    error: null,
    ...overrides,
  };
}

function createHarness() {
  const prisma = {
    routine: {
      upsert: vi.fn(async (_args: unknown) => ({})),
      findMany: vi.fn(async (_args: unknown) => [] as RoutineWithRuns[]),
      findFirst: vi.fn(async (_args: unknown) => null as RoutineWithRuns | null),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...routineRow(),
        ...data,
      })),
      updateMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
    },
    routineRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...runRow(),
        ...data,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...runRow(),
        ...data,
      })),
    },
    aiUsageLedger: {
      aggregate: vi.fn(async (_args: unknown) => ({
        _sum: { tokensIn: 10, tokensOut: 5, costMicroUsd: 7 },
        _count: { _all: 2 },
      })),
    },
    catalog: {
      findMany: vi.fn(async (_args: unknown) => [{ id: 'cat-1' }]),
    },
    importJob: {
      deleteMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
    },
    quote: {
      updateMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
    },
  };

  const service = new RoutinesService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('RoutinesService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ensureDefaults siembra las 3 rutinas con upsert y no duplica al repetir', async () => {
    const { prisma, service } = createHarness();

    await service.ensureDefaults(ORG_ID);
    await service.ensureDefaults(ORG_ID);

    expect(prisma.routine.upsert).toHaveBeenCalledTimes(ROUTINE_DEFINITIONS.length * 2);
    const calls = prisma.routine.upsert.mock.calls.map(([arg]) => {
      const typed = arg as {
        where: { organizationId_key: { organizationId: string; key: string } };
        create: { nextRunAt: Date; intervalMinutes: number };
        update: Record<string, never>;
      };
      return typed;
    });
    const keys = calls.map((call) => call.where.organizationId_key.key);
    expect(new Set(keys)).toEqual(new Set(ROUTINE_DEFINITIONS.map((item) => item.key)));
    for (const call of calls) {
      expect(call.where.organizationId_key.organizationId).toBe(ORG_ID);
      expect(call.update).toEqual({});
      expect(call.create.intervalMinutes).toBe(1440);
      expect(call.create.nextRunAt).toEqual(new Date(NOW.getTime() + 5 * 60_000));
    }
  });

  it('runDue no ejecuta una rutina cuando otra instancia ganó el claim', async () => {
    const { prisma, service } = createHarness();
    const row = routineRow();
    prisma.routine.findMany.mockResolvedValue([row]);
    prisma.routine.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.runDue()).resolves.toBe(0);

    expect(prisma.routine.updateMany).toHaveBeenCalledWith({
      where: { id: row.id, nextRunAt: row.nextRunAt },
      data: { nextRunAt: new Date(NOW.getTime() + row.intervalMinutes * 60_000) },
    });
    expect(prisma.routineRun.create).not.toHaveBeenCalled();
  });

  it('runDue ejecuta una vez cuando gana el claim y deja el run SUCCEEDED', async () => {
    const { prisma, service } = createHarness();
    const row = routineRow();
    prisma.routine.findMany.mockResolvedValue([row]);
    prisma.routine.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.runDue(5)).resolves.toBe(1);

    expect(prisma.routine.findMany).toHaveBeenCalledWith({
      where: { enabled: true, nextRunAt: { lte: NOW } },
      orderBy: { nextRunAt: 'asc' },
      take: 5,
    });
    expect(prisma.routineRun.create).toHaveBeenCalledTimes(1);
    expect(prisma.routineRun.create).toHaveBeenCalledWith({
      data: { routineId: row.id, status: 'RUNNING', startedAt: NOW },
    });
    expect(prisma.routineRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: {
        status: 'SUCCEEDED',
        output: { requests: 2, tokens: 15, costMicroUsd: 7 },
        finishedAt: NOW,
      },
    });
    expect(prisma.routine.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { lastRunAt: NOW },
    });
  });

  it('STALE_IMPORT_CLEANUP borra solo importaciones terminales de más de 30 días', async () => {
    const { prisma, service } = createHarness();
    const row = routineRow({ key: 'STALE_IMPORT_CLEANUP', intervalMinutes: 1440 });
    prisma.routine.findFirst.mockResolvedValue(row);
    prisma.importJob.deleteMany.mockResolvedValue({ count: 4 });

    const run = await service.runNow(ORG_ID, USER, row.id);

    const [deleteArgs] = prisma.importJob.deleteMany.mock.calls;
    expect(deleteArgs?.[0]).toMatchObject({
      where: {
        catalogId: { in: ['cat-1'] },
        status: { in: ['READY', 'FAILED'] },
        createdAt: { lt: expect.any(Date) },
      },
    });
    const cutoff = (deleteArgs?.[0] as { where: { createdAt: { lt: Date } } }).where.createdAt.lt;
    expect((NOW.getTime() - cutoff.getTime()) / DAY_MS).toBeCloseTo(30, 5);
    expect(run.status).toBe('SUCCEEDED');
    expect(run.output).toEqual({ deleted: 4 });
  });

  it('runNow ejecuta en el acto y reprograma lastRunAt/nextRunAt según el intervalo', async () => {
    const { prisma, service } = createHarness();
    const row = routineRow({ intervalMinutes: 720 });
    prisma.routine.findFirst.mockResolvedValue(row);

    const run = await service.runNow(ORG_ID, USER, row.id);

    expect(prisma.routine.findFirst).toHaveBeenCalledWith({
      where: { id: row.id, organizationId: ORG_ID },
    });
    expect(prisma.routine.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: {
        lastRunAt: NOW,
        nextRunAt: new Date(NOW.getTime() + 720 * 60_000),
      },
    });
    expect(run.startedAt).toBe(NOW.toISOString());
    expect(run.finishedAt).toBe(NOW.toISOString());
  });

  it('si el handler falla, el run queda FAILED con el error acotado a 500 caracteres', async () => {
    const { prisma, service } = createHarness();
    const row = routineRow();
    prisma.routine.findFirst.mockResolvedValue(row);
    prisma.aiUsageLedger.aggregate.mockRejectedValue(new Error('x'.repeat(900)));

    const run = await service.runNow(ORG_ID, USER, row.id);

    expect(prisma.routineRun.update).toHaveBeenCalledTimes(1);
    expect(prisma.routineRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: {
        status: 'FAILED',
        error: 'x'.repeat(500),
        finishedAt: NOW,
      },
    });
    expect(run.status).toBe('FAILED');
    expect(run.error).toHaveLength(500);
  });

  it('QUOTE_EXPIRY marca EXPIRED solo las cotizaciones SENT vencidas y no borradas', async () => {
    const { prisma, service } = createHarness();
    const row = routineRow({ key: 'QUOTE_EXPIRY', intervalMinutes: 1440 });
    prisma.routine.findFirst.mockResolvedValue(row);
    prisma.quote.updateMany.mockResolvedValue({ count: 2 });

    const run = await service.runNow(ORG_ID, USER, row.id);

    expect(prisma.quote.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        status: 'SENT',
        validUntil: { lt: NOW },
        deletedAt: null,
      },
      data: { status: 'EXPIRED', updatedAt: NOW },
    });
    expect(run.output).toEqual({ expired: 2 });
  });

  it('list devuelve el contrato con la última ejecución', async () => {
    const { prisma, service } = createHarness();
    const lastRun = runRow({
      status: 'SUCCEEDED',
      finishedAt: new Date(NOW.getTime() - 60_000),
      output: { deleted: 1 },
    });
    prisma.routine.findMany.mockResolvedValue([
      routineRow({ lastRunAt: new Date(NOW.getTime() - 60_000), runs: [lastRun] }),
    ]);

    const result = await service.list(ORG_ID);

    expect(prisma.routine.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
      orderBy: [{ nextRunAt: 'asc' }, { name: 'asc' }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: ROUTINE_ID,
      key: 'AI_USAGE_DIGEST',
      intervalMinutes: 1440,
      nextRunAt: routineRow().nextRunAt.toISOString(),
      lastRunAt: new Date(NOW.getTime() - 60_000).toISOString(),
      lastRun: {
        id: RUN_ID,
        status: 'SUCCEEDED',
        startedAt: NOW.toISOString(),
        finishedAt: new Date(NOW.getTime() - 60_000).toISOString(),
        output: { deleted: 1 },
      },
    });
  });
});
