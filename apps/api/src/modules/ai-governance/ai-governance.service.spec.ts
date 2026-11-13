import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';
import {
  AiGovernanceService,
  computeForecastMicroUsd,
  computePercentUsed,
  currentPeriod,
} from './ai-governance.service';

interface PolicyRow {
  id: string;
  organizationId: string;
  monthlyBudgetMicroUsd: number;
  alertPercent: number;
  hardStop: boolean;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface IncidentRow {
  id: string;
  organizationId: string;
  period: string;
  kind: 'WARNING' | 'HARD_STOP';
  spentMicroUsd: number;
  limitMicroUsd: number;
  createdAt: Date;
  acknowledgedAt: Date | null;
}

interface PrismaMockOptions {
  totals?: { tokensIn: number; tokensOut: number; costMicroUsd: number };
  requests?: number;
  byFeature?: Array<{
    feature: string;
    tokensIn: number;
    tokensOut: number;
    costMicroUsd: number;
    requests: number;
  }>;
  images?: number;
  policy?: PolicyRow | null;
  policyError?: boolean;
  incidents?: IncidentRow[];
  quotaTokens?: number | null;
}

function policyRow(overrides: Partial<PolicyRow> = {}): PolicyRow {
  return {
    id: 'policy-1',
    organizationId: 'org-1',
    monthlyBudgetMicroUsd: 10_000,
    alertPercent: 80,
    hardStop: true,
    updatedByUserId: null,
    createdAt: new Date(Date.UTC(2026, 0, 1)),
    updatedAt: new Date(Date.UTC(2026, 0, 2)),
    ...overrides,
  };
}

/** PrismaService mockeado con objetos planos (sin base de datos). */
function createPrismaMock(options: PrismaMockOptions = {}) {
  const totals = options.totals ?? { tokensIn: 0, tokensOut: 0, costMicroUsd: 0 };
  const policy = options.policy ?? null;
  const upserted = policy ?? policyRow({ monthlyBudgetMicroUsd: 0 });

  const prisma = {
    aiUsageLedger: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: {
          tokensIn: totals.tokensIn,
          tokensOut: totals.tokensOut,
          costMicroUsd: totals.costMicroUsd,
        },
        _count: options.requests ?? 0,
      }),
      groupBy: vi.fn().mockResolvedValue(
        (options.byFeature ?? []).map((row) => ({
          feature: row.feature,
          _sum: {
            tokensIn: row.tokensIn,
            tokensOut: row.tokensOut,
            costMicroUsd: row.costMicroUsd,
          },
          _count: row.requests,
        })),
      ),
      count: vi.fn().mockResolvedValue(options.images ?? 0),
      create: vi.fn().mockResolvedValue({ id: 'ledger-row' }),
    },
    aiBudgetPolicy: {
      findUnique: options.policyError
        ? vi.fn().mockRejectedValue(new Error('relation does not exist'))
        : vi.fn().mockResolvedValue(policy),
      upsert: vi
        .fn()
        .mockImplementation(
          async (args: { create?: Partial<PolicyRow>; update?: Partial<PolicyRow> }) => ({
            ...upserted,
            ...(args.update ?? args.create ?? {}),
          }),
        ),
    },
    aiBudgetIncident: {
      findMany: vi.fn().mockResolvedValue(options.incidents ?? []),
      upsert: vi.fn().mockResolvedValue({ id: 'incident-1' }),
    },
    organization: {
      findUnique: vi.fn().mockResolvedValue(
        options.quotaTokens === undefined || options.quotaTokens === null
          ? null
          : { aiMonthlyQuotaTokens: options.quotaTokens },
      ),
    },
  };

  const service = new AiGovernanceService(prisma as unknown as PrismaService);
  return { prisma, service };
}

async function captureError(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('Se esperaba una AppException y la promesa se resolvió.');
}

describe('computePercentUsed', () => {
  it('redondea a un decimal y devuelve 0 sin presupuesto', () => {
    expect(computePercentUsed(2_500, 10_000)).toBe(25);
    expect(computePercentUsed(8_500, 10_000)).toBe(85);
    expect(computePercentUsed(1, 3)).toBe(33.3);
    expect(computePercentUsed(10_000, 10_000)).toBe(100);
    expect(computePercentUsed(500, 0)).toBe(0);
    expect(computePercentUsed(0, 0)).toBe(0);
  });
});

describe('computeForecastMicroUsd', () => {
  it('proyecta al ritmo de días transcurridos del mes', () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const now = new Date(Date.UTC(2026, 0, 11));
    // 1.000 µUSD en 10 días de un mes de 31 días.
    expect(computeForecastMicroUsd(1_000, start, now)).toBe(3_100);
  });

  it('cuenta el primer día completo y evita proyección sin gasto', () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const early = new Date(Date.UTC(2026, 0, 1, 3, 0, 0));
    expect(computeForecastMicroUsd(1_000, start, early)).toBe(31_000);
    expect(computeForecastMicroUsd(0, start, early)).toBe(0);
  });
});

describe('AiGovernanceService.assertCanSpend', () => {
  it('lanza 429 y registra HARD_STOP cuando el gasto proyectado alcanza el límite', async () => {
    const { prisma, service } = createPrismaMock({
      totals: { tokensIn: 1_000, tokensOut: 500, costMicroUsd: 9_500 },
      policy: policyRow({ monthlyBudgetMicroUsd: 10_000 }),
    });

    const error = await captureError(
      service.assertCanSpend('org-1', 1_000, { feature: 'social_post' }),
    );

    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe('AI_QUOTA_EXCEEDED');
    expect(error.getStatus()).toBe(429);
    expect(error.details).toEqual({ spentMicroUsd: 10_500, limitMicroUsd: 10_000 });

    const period = currentPeriod().period;
    expect(prisma.aiBudgetIncident.upsert).toHaveBeenCalledWith({
      where: { organizationId_period_kind: { organizationId: 'org-1', period, kind: 'HARD_STOP' } },
      create: {
        organizationId: 'org-1',
        period,
        kind: 'HARD_STOP',
        spentMicroUsd: 10_500,
        limitMicroUsd: 10_000,
      },
      update: { spentMicroUsd: 10_500, limitMicroUsd: 10_000 },
    });
  });

  it('al cruzar el umbral de alerta registra WARNING y deja pasar', async () => {
    const { prisma, service } = createPrismaMock({
      totals: { tokensIn: 1_000, tokensOut: 500, costMicroUsd: 8_500 },
      policy: policyRow({ monthlyBudgetMicroUsd: 10_000, alertPercent: 80 }),
    });

    await expect(service.assertCanSpend('org-1')).resolves.toBeUndefined();

    const period = currentPeriod().period;
    expect(prisma.aiBudgetIncident.upsert).toHaveBeenCalledWith({
      where: { organizationId_period_kind: { organizationId: 'org-1', period, kind: 'WARNING' } },
      create: {
        organizationId: 'org-1',
        period,
        kind: 'WARNING',
        spentMicroUsd: 8_500,
        limitMicroUsd: 10_000,
      },
      update: { spentMicroUsd: 8_500, limitMicroUsd: 10_000 },
    });
  });

  it('sin policy no bloquea y no registra incidentes', async () => {
    const { prisma, service } = createPrismaMock({
      totals: { tokensIn: 1_000, tokensOut: 500, costMicroUsd: 5_000 },
      policy: null,
      quotaTokens: 2_000_000,
    });

    await expect(service.assertCanSpend('org-1')).resolves.toBeUndefined();
    expect(prisma.aiBudgetIncident.upsert).not.toHaveBeenCalled();
  });

  it('sin policy respeta la cuota de tokens del plan', async () => {
    const { service } = createPrismaMock({
      totals: { tokensIn: 1_400_000, tokensOut: 600_000, costMicroUsd: 0 },
      policy: null,
      quotaTokens: 2_000_000,
    });

    const error = await captureError(service.assertCanSpend('org-1'));

    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe('AI_QUOTA_EXCEEDED');
    expect(error.getStatus()).toBe(429);
    expect(error.details).toMatchObject({ consumedTokens: 2_000_000, quotaTokens: 2_000_000 });
  });

  it('con hardStop apagado no corta aunque supere el límite', async () => {
    const { service } = createPrismaMock({
      totals: { tokensIn: 0, tokensOut: 0, costMicroUsd: 20_000 },
      policy: policyRow({ monthlyBudgetMicroUsd: 10_000, hardStop: false }),
    });

    await expect(service.assertCanSpend('org-1')).resolves.toBeUndefined();
  });

  it('si la tabla de presupuesto no existe, no falla por ella', async () => {
    const { service } = createPrismaMock({
      totals: { tokensIn: 10, tokensOut: 10, costMicroUsd: 100 },
      policy: null,
      policyError: true,
      quotaTokens: 0,
    });

    await expect(service.assertCanSpend('org-1')).resolves.toBeUndefined();
  });
});

describe('AiGovernanceService.getUsage', () => {
  it('agrega tokens, costo, features, imágenes e incidentes del período', async () => {
    const now = new Date(Date.UTC(2026, 4, 11));
    const incident: IncidentRow = {
      id: 'incident-1',
      organizationId: 'org-1',
      period: '2026-05',
      kind: 'WARNING',
      spentMicroUsd: 8_500,
      limitMicroUsd: 10_000,
      createdAt: new Date(Date.UTC(2026, 4, 5)),
      acknowledgedAt: null,
    };
    const { service } = createPrismaMock({
      totals: { tokensIn: 1_200, tokensOut: 800, costMicroUsd: 2_500 },
      requests: 3,
      byFeature: [
        { feature: 'image', tokensIn: 0, tokensOut: 0, costMicroUsd: 500, requests: 1 },
        {
          feature: 'social_post',
          tokensIn: 1_200,
          tokensOut: 800,
          costMicroUsd: 2_000,
          requests: 2,
        },
      ],
      images: 1,
      policy: policyRow({ monthlyBudgetMicroUsd: 10_000 }),
      incidents: [incident],
      quotaTokens: 2_000_000,
    });

    const usage = await service.getUsage('org-1', now);

    expect(usage.periodStart).toBe('2026-05-01T00:00:00.000Z');
    expect(usage.periodEnd).toBe('2026-06-01T00:00:00.000Z');
    expect(usage.tokensIn).toBe(1_200);
    expect(usage.tokensOut).toBe(800);
    expect(usage.tokensTotal).toBe(2_000);
    expect(usage.quotaTokens).toBe(2_000_000);
    expect(usage.remainingTokens).toBe(1_998_000);
    expect(usage.costMicroUsd).toBe(2_500);
    expect(usage.budgetMicroUsd).toBe(10_000);
    expect(usage.remainingMicroUsd).toBe(7_500);
    expect(usage.percentUsed).toBe(25);
    // 2.500 µUSD en 10 días de un mes de 31 días.
    expect(usage.forecastMicroUsd).toBe(7_750);
    expect(usage.hardStop).toBe(true);
    expect(usage.imagesGenerated).toBe(1);
    expect(usage.byFeature).toEqual([
      { feature: 'image', tokensTotal: 0, requests: 1, costMicroUsd: 500 },
      { feature: 'social_post', tokensTotal: 2_000, requests: 2, costMicroUsd: 2_000 },
    ]);
    expect(usage.incidents).toEqual([
      {
        id: 'incident-1',
        period: '2026-05',
        kind: 'WARNING',
        spentMicroUsd: 8_500,
        limitMicroUsd: 10_000,
        createdAt: '2026-05-05T00:00:00.000Z',
        acknowledgedAt: null,
      },
    ]);
  });

  it('sin presupuesto ni policy devuelve defaults sin romper', async () => {
    const { service } = createPrismaMock({
      totals: { tokensIn: 100, tokensOut: 50, costMicroUsd: 40 },
      policy: null,
      quotaTokens: 1_000,
    });

    const usage = await service.getUsage('org-1');

    expect(usage.budgetMicroUsd).toBe(0);
    expect(usage.remainingMicroUsd).toBe(0);
    expect(usage.percentUsed).toBe(0);
    expect(usage.hardStop).toBe(false);
    expect(usage.incidents).toEqual([]);
    expect(usage.remainingTokens).toBe(850);
  });
});

describe('AiGovernanceService.record', () => {
  it('crea una fila en ai_usage_ledger con todos los datos', async () => {
    const { prisma, service } = createPrismaMock();

    await service.record({
      organizationId: 'org-1',
      feature: 'social_post',
      provider: 'deepseek',
      model: 'deepseek-chat',
      promptTemplateKey: 'social-post.v3',
      promptVersion: 3,
      tokensIn: 120,
      tokensOut: 80,
      costMicroUsd: 150,
      latencyMs: 900,
      requestHash: 'hash-1',
      userId: 'user-1',
      socialPostId: 'post-1',
    });

    expect(prisma.aiUsageLedger.create).toHaveBeenCalledTimes(1);
    expect(prisma.aiUsageLedger.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        feature: 'social_post',
        provider: 'deepseek',
        model: 'deepseek-chat',
        promptTemplateKey: 'social-post.v3',
        promptVersion: 3,
        tokensIn: 120,
        tokensOut: 80,
        costMicroUsd: 150,
        latencyMs: 900,
        cacheHit: false,
        requestHash: 'hash-1',
        userId: 'user-1',
        socialPostId: 'post-1',
      },
    });
  });

  it('completa defaults cuando faltan campos opcionales', async () => {
    const { prisma, service } = createPrismaMock();

    await service.record({
      organizationId: 'org-1',
      feature: 'image',
      provider: 'mock',
      model: 'mock-social-1080',
      tokensIn: 0,
      tokensOut: 0,
      costMicroUsd: 0,
    });

    expect(prisma.aiUsageLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        promptTemplateKey: '',
        promptVersion: 0,
        latencyMs: 0,
        requestHash: '',
        userId: null,
        socialPostId: null,
      }),
    });
  });
});

describe('AiGovernanceService presupuesto', () => {
  it('getBudget devuelve defaults cuando no hay policy', async () => {
    const { service } = createPrismaMock({ policy: null });

    await expect(service.getBudget('org-1')).resolves.toEqual({
      monthlyBudgetMicroUsd: 0,
      alertPercent: 80,
      hardStop: true,
      updatedAt: null,
    });
  });

  it('updateBudget hace upsert con los valores validados', async () => {
    const { prisma, service } = createPrismaMock({ policy: policyRow() });

    const updated = await service.updateBudget(
      'org-1',
      { monthlyBudgetMicroUsd: 25_000, alertPercent: 70, hardStop: false },
      'user-1',
    );

    const data = {
      monthlyBudgetMicroUsd: 25_000,
      alertPercent: 70,
      hardStop: false,
      updatedByUserId: 'user-1',
    };
    expect(prisma.aiBudgetPolicy.upsert).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      create: { organizationId: 'org-1', ...data },
      update: data,
    });
    expect(updated).toEqual({
      monthlyBudgetMicroUsd: 25_000,
      alertPercent: 70,
      hardStop: false,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });
});
