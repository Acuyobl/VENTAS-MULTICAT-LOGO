import { Injectable, Logger } from '@nestjs/common';
import {
  type AuthenticatedUser,
  type Routine as RoutineDto,
  type RoutineKey,
  type RoutineListResponse,
  type RoutineRun as RoutineRunDto,
  type RoutineRunStatus,
  type RoutineUpdateInput,
} from '@ventascatalogo/contracts';
import {
  QuoteStatus,
  type Prisma,
  type Routine as RoutineRow,
  type RoutineRun as RoutineRunRow,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DIGEST_WINDOW_MS = DAY_MS;
const STALE_IMPORT_DAYS = 30;
/** La primera ejecución se agenda a los 5 minutos para que la rutina sea visible. */
const FIRST_RUN_DELAY_MS = 5 * MINUTE_MS;
const RUN_ERROR_MAX_LENGTH = 500;

interface RoutineDefinition {
  key: RoutineKey;
  name: string;
  intervalMinutes: number;
}

/** Rutinas sembradas por organización en el primer listado. */
export const ROUTINE_DEFINITIONS: readonly RoutineDefinition[] = [
  {
    key: 'AI_USAGE_DIGEST',
    name: 'Resumen diario de consumo IA',
    intervalMinutes: 1440,
  },
  {
    key: 'STALE_IMPORT_CLEANUP',
    name: 'Limpieza de importaciones viejas',
    intervalMinutes: 1440,
  },
  {
    key: 'QUOTE_EXPIRY',
    name: 'Vencimiento de cotizaciones',
    intervalMinutes: 1440,
  },
];

interface RoutineExecutionResult {
  status: Extract<RoutineRunStatus, 'SUCCEEDED' | 'SKIPPED'>;
  output: Prisma.InputJsonValue;
}

type RoutineWithLastRun = RoutineRow & { runs: RoutineRunRow[] };

/**
 * Rutinas programadas por organización: resumen de consumo de IA, limpieza de
 * importaciones viejas y vencimiento de cotizaciones.
 *
 * El scheduler no tiene cola ni worker: el propio proceso HTTP ejecuta la
 * rutina cuando vence. Para que dos instancias no la corran a la vez, cada
 * ejecución se toma con un `updateMany` condicionado por `nextRunAt` (claim
 * optimista); la que pierde el claim se saltea la rutina.
 */
@Injectable()
export class RoutinesService {
  private readonly logger = new Logger(RoutinesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Crea las rutinas que falten; nunca pisa la configuración existente. */
  async ensureDefaults(organizationId: string): Promise<void> {
    const now = new Date();
    const nextRunAt = new Date(now.getTime() + FIRST_RUN_DELAY_MS);

    await Promise.all(
      ROUTINE_DEFINITIONS.map((definition) =>
        this.prisma.routine.upsert({
          where: { organizationId_key: { organizationId, key: definition.key } },
          create: {
            organizationId,
            key: definition.key,
            name: definition.name,
            enabled: true,
            intervalMinutes: definition.intervalMinutes,
            nextRunAt,
          },
          update: {},
        }),
      ),
    );
  }

  /** Rutinas de la organización con su última ejecución. */
  async list(organizationId: string): Promise<RoutineListResponse> {
    await this.ensureDefaults(organizationId);

    const rows = await this.prisma.routine.findMany({
      where: { organizationId },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
      orderBy: [{ nextRunAt: 'asc' }, { name: 'asc' }],
    });

    return { items: rows.map((row) => this.toRoutineDto(row)) };
  }

  /** Activa, pausa o cambia la frecuencia de una rutina de la organización. */
  async update(
    organizationId: string,
    id: string,
    input: RoutineUpdateInput,
  ): Promise<RoutineDto> {
    const routine = await this.findOwned(organizationId, id);
    const now = new Date();
    const intervalMinutes = input.intervalMinutes ?? routine.intervalMinutes;
    const intervalChanged =
      input.intervalMinutes !== undefined && input.intervalMinutes !== routine.intervalMinutes;
    const reactivated = input.enabled === true && !routine.enabled;

    const updated = await this.prisma.routine.update({
      where: { id: routine.id },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.intervalMinutes !== undefined ? { intervalMinutes: input.intervalMinutes } : {}),
        ...(intervalChanged || reactivated
          ? { nextRunAt: new Date(now.getTime() + intervalMinutes * MINUTE_MS) }
          : {}),
      },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
    });

    return this.toRoutineDto(updated);
  }

  /** Ejecuta la rutina en el acto (botón "Ejecutar ahora"). */
  async runNow(
    organizationId: string,
    user: AuthenticatedUser,
    id: string,
  ): Promise<RoutineRunDto> {
    const routine = await this.findOwned(organizationId, id);
    const startedAt = new Date();
    const run = await this.execute(routine, startedAt);

    await this.prisma.routine.update({
      where: { id: routine.id },
      data: {
        lastRunAt: startedAt,
        nextRunAt: new Date(startedAt.getTime() + routine.intervalMinutes * MINUTE_MS),
      },
    });

    this.logger.log(
      {
        routineId: routine.id,
        routineKey: routine.key,
        runId: run.id,
        status: run.status,
        requestedBy: user.id,
      },
      'routine_manual_run',
    );

    return this.toRoutineRunDto(run);
  }

  /**
   * Ejecuta las rutinas vencidas (hasta `limit`) y devuelve cuántas corrieron.
   * Pensado para el tick del scheduler, pero también se puede invocar desde un
   * script de operación.
   */
  async runDue(limit = 10): Promise<number> {
    const now = new Date();
    const due = await this.prisma.routine.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: Math.max(1, limit),
    });

    let executed = 0;
    for (const routine of due) {
      const claimedNextRunAt = new Date(now.getTime() + routine.intervalMinutes * MINUTE_MS);
      const claim = await this.prisma.routine.updateMany({
        where: { id: routine.id, nextRunAt: routine.nextRunAt },
        data: { nextRunAt: claimedNextRunAt },
      });
      if (claim.count !== 1) {
        this.logger.debug({ routineId: routine.id, routineKey: routine.key }, 'routine_claim_lost');
        continue;
      }

      await this.execute(routine, now);
      await this.prisma.routine.update({
        where: { id: routine.id },
        data: { lastRunAt: now },
      });
      executed += 1;
    }

    return executed;
  }

  private async findOwned(organizationId: string, id: string): Promise<RoutineRow> {
    const routine = await this.prisma.routine.findFirst({ where: { id, organizationId } });
    if (!routine) {
      throw new AppException('NOT_FOUND', 404, { resource: 'routine' });
    }
    return routine;
  }

  private async execute(routine: RoutineRow, startedAt = new Date()): Promise<RoutineRunRow> {
    const run = await this.prisma.routineRun.create({
      data: { routineId: routine.id, status: 'RUNNING', startedAt },
    });

    try {
      const result = await this.runHandler(routine);
      return await this.prisma.routineRun.update({
        where: { id: run.id },
        data: { status: result.status, output: result.output, finishedAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { routineId: routine.id, routineKey: routine.key, runId: run.id, err: error },
        'routine_run_failed',
      );
      return await this.prisma.routineRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          error: message.slice(0, RUN_ERROR_MAX_LENGTH),
          finishedAt: new Date(),
        },
      });
    }
  }

  private runHandler(routine: RoutineRow): Promise<RoutineExecutionResult> {
    switch (routine.key) {
      case 'AI_USAGE_DIGEST':
        return this.runAiUsageDigest(routine.organizationId);
      case 'STALE_IMPORT_CLEANUP':
        return this.runStaleImportCleanup(routine.organizationId);
      case 'QUOTE_EXPIRY':
        return this.runQuoteExpiry(routine.organizationId);
      default:
        throw new AppException('VALIDATION_FAILED', 400, { routineKey: routine.key });
    }
  }

  /** Agrega el consumo de IA de las últimas 24 horas de la organización. */
  private async runAiUsageDigest(organizationId: string): Promise<RoutineExecutionResult> {
    const since = new Date(Date.now() - DIGEST_WINDOW_MS);
    const usage = await this.prisma.aiUsageLedger.aggregate({
      where: { organizationId, createdAt: { gte: since } },
      _sum: { tokensIn: true, tokensOut: true, costMicroUsd: true },
      _count: { _all: true },
    });

    const tokensIn = usage._sum.tokensIn ?? 0;
    const tokensOut = usage._sum.tokensOut ?? 0;

    return {
      status: 'SUCCEEDED',
      output: {
        requests: usage._count._all,
        tokens: tokensIn + tokensOut,
        costMicroUsd: usage._sum.costMicroUsd ?? 0,
      },
    };
  }

  /**
   * Borra importaciones en estado terminal (READY/FAILED) con más de 30 días.
   * `ImportJob` no tiene `organizationId`: se acota por los catálogos de la org.
   */
  private async runStaleImportCleanup(organizationId: string): Promise<RoutineExecutionResult> {
    const cutoff = new Date(Date.now() - STALE_IMPORT_DAYS * DAY_MS);
    const catalogs = await this.prisma.catalog.findMany({
      where: { organizationId },
      select: { id: true },
    });

    if (catalogs.length === 0) {
      return { status: 'SUCCEEDED', output: { deleted: 0 } };
    }

    const result = await this.prisma.importJob.deleteMany({
      where: {
        catalogId: { in: catalogs.map((catalog) => catalog.id) },
        status: { in: ['READY', 'FAILED'] },
        createdAt: { lt: cutoff },
      },
    });

    return { status: 'SUCCEEDED', output: { deleted: result.count } };
  }

  /** Marca EXPIRED las cotizaciones SENT vencidas y no borradas. */
  private async runQuoteExpiry(organizationId: string): Promise<RoutineExecutionResult> {
    const statuses = Object.values(QuoteStatus) as string[];
    if (!statuses.includes('EXPIRED')) {
      return { status: 'SKIPPED', output: { reason: 'QuoteStatus no expone EXPIRED' } };
    }

    const now = new Date();
    const result = await this.prisma.quote.updateMany({
      where: {
        organizationId,
        status: 'SENT',
        validUntil: { lt: now },
        deletedAt: null,
      },
      data: { status: 'EXPIRED', updatedAt: now },
    });

    return { status: 'SUCCEEDED', output: { expired: result.count } };
  }

  private toRoutineDto(routine: RoutineWithLastRun): RoutineDto {
    const [lastRun] = routine.runs;
    return {
      id: routine.id,
      key: routine.key as RoutineKey,
      name: routine.name,
      enabled: routine.enabled,
      intervalMinutes: routine.intervalMinutes,
      nextRunAt: routine.nextRunAt.toISOString(),
      lastRunAt: routine.lastRunAt?.toISOString() ?? null,
      lastRun: lastRun ? this.toRoutineRunDto(lastRun) : null,
    };
  }

  private toRoutineRunDto(run: RoutineRunRow): RoutineRunDto {
    return {
      id: run.id,
      status: run.status as RoutineRunStatus,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      output: run.output ?? null,
      error: run.error ?? null,
    };
  }
}
