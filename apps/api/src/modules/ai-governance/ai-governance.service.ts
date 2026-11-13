import { Injectable, Logger } from '@nestjs/common';
import {
  aiBudgetUpdateSchema,
  type AiBudgetIncident as AiBudgetIncidentDto,
  type AiBudgetUpdateInput,
  type AiUsage,
} from '@ventascatalogo/contracts';
import type {
  AiBudgetIncident as AiBudgetIncidentRow,
  AiBudgetPolicy as AiBudgetPolicyRow,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';

const DAY_MS = 86_400_000;

/** Presupuesto mensual configurado por la organización. */
export interface AiBudgetPolicyDto {
  monthlyBudgetMicroUsd: number;
  alertPercent: number;
  hardStop: boolean;
  updatedAt: string | null;
}

/** Período contable de consumo: siempre mes calendario en UTC. */
export interface AiUsagePeriod {
  start: Date;
  end: Date;
  /** Clave estable del período, formato `YYYY-MM`. */
  period: string;
}

/** Fila a registrar en el libro de uso de IA. */
export interface AiUsageRecordInput {
  organizationId: string;
  /** `social_post`, `image` o cualquier feature futura. */
  feature: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  promptTemplateKey?: string;
  promptVersion?: number;
  requestHash?: string;
  userId?: string;
  socialPostId?: string;
  latencyMs?: number;
  cacheHit?: boolean;
}

/** Contexto opcional para trazabilidad de un gasto estimado. */
export interface AiSpendMeta {
  feature?: string;
  userId?: string;
  socialPostId?: string;
}

type IncidentKind = 'WARNING' | 'HARD_STOP';

interface PeriodTotals {
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  requests: number;
}

/** Período UTC (mes calendario) que contiene `now`. */
export function currentPeriod(now: Date = new Date()): AiUsagePeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const month = String(start.getUTCMonth() + 1).padStart(2, '0');
  return { start, end, period: `${start.getUTCFullYear()}-${month}` };
}

/** Porcentaje consumido del presupuesto, con un decimal. 0 si no hay presupuesto. */
export function computePercentUsed(spentMicroUsd: number, budgetMicroUsd: number): number {
  if (budgetMicroUsd <= 0) return 0;
  return Math.round((spentMicroUsd / budgetMicroUsd) * 1000) / 10;
}

/**
 * Proyección de cierre de mes al ritmo actual: costo / días transcurridos ×
 * días del mes. El primer día se cuenta completo para no inflar la proyección.
 */
export function computeForecastMicroUsd(
  spentMicroUsd: number,
  start: Date,
  now: Date = new Date(),
): number {
  if (spentMicroUsd <= 0) return 0;
  const daysInMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const elapsedDays = Math.max(1, (now.getTime() - start.getTime()) / DAY_MS);
  return Math.round((spentMicroUsd / elapsedDays) * daysInMonth);
}

/**
 * Gobernanza de IA por organización: consumo del mes, presupuesto con corte
 * duro (% de alerta), libro de uso y freno previo a llamar a un proveedor.
 *
 * El control de dinero es opcional (`AiBudgetPolicy.monthlyBudgetMicroUsd = 0`
 * significa "sin límite explícito"). Si la tabla de presupuesto no existe o no
 * hay policy se cae al control de cuota de tokens del plan, nunca a un error
 * de base de datos.
 */
@Injectable()
export class AiGovernanceService {
  private readonly logger = new Logger(AiGovernanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Consumo del mes en curso, presupuesto, proyección e incidentes. */
  async getUsage(organizationId: string, now: Date = new Date()): Promise<AiUsage> {
    const period = currentPeriod(now);
    const [totals, byFeatureRows, imagesGenerated, organization, policy, incidents] =
      await Promise.all([
        this.readPeriodTotals(organizationId, period),
        this.prisma.aiUsageLedger.groupBy({
          by: ['feature'],
          where: { organizationId, createdAt: { gte: period.start, lt: period.end } },
          _sum: { tokensIn: true, tokensOut: true, costMicroUsd: true },
          _count: true,
          orderBy: { feature: 'asc' },
        }),
        this.prisma.aiUsageLedger.count({
          where: {
            organizationId,
            feature: 'image',
            createdAt: { gte: period.start, lt: period.end },
          },
        }),
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { aiMonthlyQuotaTokens: true },
        }),
        this.findPolicy(organizationId),
        this.findIncidents(organizationId, period.period),
      ]);

    const tokensTotal = totals.tokensIn + totals.tokensOut;
    const quotaTokens = organization?.aiMonthlyQuotaTokens ?? 0;
    const budgetMicroUsd = policy?.monthlyBudgetMicroUsd ?? 0;

    return {
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      tokensIn: totals.tokensIn,
      tokensOut: totals.tokensOut,
      tokensTotal,
      quotaTokens,
      remainingTokens: Math.max(0, quotaTokens - tokensTotal),
      costMicroUsd: totals.costMicroUsd,
      budgetMicroUsd,
      remainingMicroUsd: budgetMicroUsd > 0 ? Math.max(0, budgetMicroUsd - totals.costMicroUsd) : 0,
      percentUsed: computePercentUsed(totals.costMicroUsd, budgetMicroUsd),
      forecastMicroUsd: computeForecastMicroUsd(totals.costMicroUsd, period.start, now),
      hardStop: policy?.hardStop ?? false,
      imagesGenerated,
      incidents,
      byFeature: byFeatureRows.map((row) => ({
        feature: row.feature,
        tokensTotal: (row._sum.tokensIn ?? 0) + (row._sum.tokensOut ?? 0),
        requests: row._count,
        costMicroUsd: row._sum.costMicroUsd ?? 0,
      })),
    };
  }

  /** Presupuesto de IA configurado (defaults si todavía no hay policy). */
  async getBudget(organizationId: string): Promise<AiBudgetPolicyDto> {
    return toBudgetDto(await this.findPolicy(organizationId));
  }

  /** Crea o actualiza la policy de la organización. */
  async updateBudget(
    organizationId: string,
    input: AiBudgetUpdateInput,
    userId?: string,
  ): Promise<AiBudgetPolicyDto> {
    const parsed = aiBudgetUpdateSchema.parse(input);
    const data = {
      monthlyBudgetMicroUsd: parsed.monthlyBudgetMicroUsd,
      alertPercent: parsed.alertPercent,
      hardStop: parsed.hardStop,
      updatedByUserId: userId ?? null,
    };
    const policy = await this.prisma.aiBudgetPolicy.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    });
    return toBudgetDto(policy);
  }

  /**
   * Freno previo a una llamada a proveedor. Con presupuesto explícito y
   * `hardStop`, lanza 429 cuando el gasto proyectado alcanza el límite y
   * registra el incidente HARD_STOP; al cruzar `alertPercent` registra un
   * incidente WARNING y deja pasar. Sin presupuesto explícito aplica solo la
   * cuota de tokens del plan (si el plan define una) y no corta por dinero.
   */
  async assertCanSpend(
    organizationId: string,
    estimatedMicroUsd = 0,
    meta: AiSpendMeta = {},
  ): Promise<void> {
    const period = currentPeriod();
    const [policy, totals] = await Promise.all([
      this.findPolicy(organizationId),
      this.readPeriodTotals(organizationId, period),
    ]);
    const budgetMicroUsd = policy?.monthlyBudgetMicroUsd ?? 0;

    if (budgetMicroUsd > 0) {
      const estimated = Number.isFinite(estimatedMicroUsd)
        ? Math.max(0, Math.trunc(estimatedMicroUsd))
        : 0;
      const projectedMicroUsd = totals.costMicroUsd + estimated;

      if ((policy?.hardStop ?? false) && projectedMicroUsd >= budgetMicroUsd) {
        await this.safeUpsertIncident(
          organizationId,
          period.period,
          'HARD_STOP',
          projectedMicroUsd,
          budgetMicroUsd,
        );
        this.logger.warn(
          { organizationId, feature: meta.feature, projectedMicroUsd, budgetMicroUsd },
          'ai_budget_hard_stop',
        );
        throw new AppException(
          'AI_QUOTA_EXCEEDED',
          429,
          { spentMicroUsd: projectedMicroUsd, limitMicroUsd: budgetMicroUsd },
          'Se alcanzó el presupuesto mensual de IA de la organización.',
        );
      }

      const percent = computePercentUsed(projectedMicroUsd, budgetMicroUsd);
      if (percent >= (policy?.alertPercent ?? 80)) {
        await this.safeUpsertIncident(
          organizationId,
          period.period,
          'WARNING',
          projectedMicroUsd,
          budgetMicroUsd,
        );
        this.logger.warn(
          { organizationId, feature: meta.feature, percent, budgetMicroUsd },
          'ai_budget_alert_threshold',
        );
      }
      return;
    }

    await this.assertPlanTokenQuota(
      organizationId,
      totals.tokensIn + totals.tokensOut,
      meta,
    );
  }

  /**
   * Registra una llamada real en `ai_usage_ledger`. Nunca interrumpe la
   * operación: si la escritura falla solo se loguea.
   */
  async record(entry: AiUsageRecordInput): Promise<void> {
    try {
      await this.prisma.aiUsageLedger.create({
        data: {
          organizationId: entry.organizationId,
          feature: entry.feature,
          provider: entry.provider,
          model: entry.model,
          promptTemplateKey: entry.promptTemplateKey ?? '',
          promptVersion: entry.promptVersion ?? 0,
          tokensIn: Math.max(0, Math.trunc(entry.tokensIn)),
          tokensOut: Math.max(0, Math.trunc(entry.tokensOut)),
          costMicroUsd: Math.max(0, Math.trunc(entry.costMicroUsd)),
          latencyMs: Math.max(0, Math.trunc(entry.latencyMs ?? 0)),
          cacheHit: entry.cacheHit ?? false,
          requestHash: entry.requestHash ?? '',
          userId: entry.userId ?? null,
          socialPostId: entry.socialPostId ?? null,
        },
      });
    } catch (error) {
      this.logger.error({ err: error, feature: entry.feature }, 'ai_usage_record_failed');
    }
  }

  /** Totales del período, sin desagregado por feature. */
  private async readPeriodTotals(
    organizationId: string,
    period: AiUsagePeriod,
  ): Promise<PeriodTotals> {
    const aggregate = await this.prisma.aiUsageLedger.aggregate({
      where: { organizationId, createdAt: { gte: period.start, lt: period.end } },
      _sum: { tokensIn: true, tokensOut: true, costMicroUsd: true },
      _count: true,
    });
    return {
      tokensIn: aggregate._sum.tokensIn ?? 0,
      tokensOut: aggregate._sum.tokensOut ?? 0,
      costMicroUsd: aggregate._sum.costMicroUsd ?? 0,
      requests: aggregate._count,
    };
  }

  /** Policy de presupuesto; null si no existe o si la tabla no está disponible. */
  private async findPolicy(organizationId: string): Promise<AiBudgetPolicyRow | null> {
    try {
      return await this.prisma.aiBudgetPolicy.findUnique({ where: { organizationId } });
    } catch (error) {
      this.logger.warn({ err: error, organizationId }, 'ai_budget_policy_unavailable');
      return null;
    }
  }

  /** Incidentes del período; lista vacía si la tabla no está disponible. */
  private async findIncidents(
    organizationId: string,
    period: string,
  ): Promise<AiBudgetIncidentDto[]> {
    try {
      const rows = await this.prisma.aiBudgetIncident.findMany({
        where: { organizationId, period },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toIncidentDto);
    } catch (error) {
      this.logger.warn({ err: error, organizationId, period }, 'ai_budget_incidents_unavailable');
      return [];
    }
  }

  /** Upsert idempotente (organizationId + period + kind) de un incidente. */
  private async safeUpsertIncident(
    organizationId: string,
    period: string,
    kind: IncidentKind,
    spentMicroUsd: number,
    limitMicroUsd: number,
  ): Promise<void> {
    try {
      await this.prisma.aiBudgetIncident.upsert({
        where: { organizationId_period_kind: { organizationId, period, kind } },
        create: { organizationId, period, kind, spentMicroUsd, limitMicroUsd },
        update: { spentMicroUsd, limitMicroUsd },
      });
    } catch (error) {
      this.logger.warn({ err: error, organizationId, period, kind }, 'ai_budget_incident_failed');
    }
  }

  /** Cuota de tokens del plan: último freno cuando no hay presupuesto en dinero. */
  private async assertPlanTokenQuota(
    organizationId: string,
    consumedTokens: number,
    meta: AiSpendMeta,
  ): Promise<void> {
    let quotaTokens = 0;
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { aiMonthlyQuotaTokens: true },
      });
      quotaTokens = organization?.aiMonthlyQuotaTokens ?? 0;
    } catch (error) {
      this.logger.warn({ err: error, organizationId }, 'ai_plan_quota_unavailable');
      return;
    }
    if (quotaTokens <= 0 || consumedTokens < quotaTokens) return;

    this.logger.warn(
      { organizationId, feature: meta.feature, consumedTokens, quotaTokens },
      'ai_monthly_token_quota_exceeded',
    );
    throw new AppException(
      'AI_QUOTA_EXCEEDED',
      429,
      { reason: 'ai_monthly_quota_exceeded', consumedTokens, quotaTokens },
      'Se alcanzó la cuota mensual de tokens de IA del plan.',
    );
  }
}

function toBudgetDto(policy: AiBudgetPolicyRow | null): AiBudgetPolicyDto {
  return {
    monthlyBudgetMicroUsd: policy?.monthlyBudgetMicroUsd ?? 0,
    alertPercent: policy?.alertPercent ?? 80,
    hardStop: policy?.hardStop ?? true,
    updatedAt: policy?.updatedAt.toISOString() ?? null,
  };
}

function toIncidentDto(row: AiBudgetIncidentRow): AiBudgetIncidentDto {
  return {
    id: row.id,
    period: row.period,
    kind: row.kind,
    spentMicroUsd: row.spentMicroUsd,
    limitMicroUsd: row.limitMicroUsd,
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt ? row.acknowledgedAt.toISOString() : null,
  };
}
