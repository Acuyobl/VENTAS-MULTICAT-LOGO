import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEvent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async append(input: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<OutboxEvent> {
    return this.prisma.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload as never,
      },
    });
  }

  /** Obtiene eventos pendientes listos para despachar según `availableAt`. */
  async fetchPending(limit = 50): Promise<OutboxEvent[]> {
    return this.prisma.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        availableAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /** Marca el evento como publicado exitosamente. */
  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        lastError: null,
      },
    });
  }

  /** Registra un reintento fallido con backoff exponencial. */
  async markFailed(id: string, error: string, currentAttempts: number): Promise<void> {
    const nextAttempts = currentAttempts + 1;
    const isExhausted = nextAttempts >= 5;
    // Backoff exponencial: 5s, 25s, 125s, 625s...
    const backoffMs = Math.min(Math.pow(5, nextAttempts) * 1000, 3600 * 1000);
    const availableAt = new Date(Date.now() + backoffMs);

    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: isExhausted ? 'FAILED' : 'PENDING',
        attempts: nextAttempts,
        availableAt,
        lastError: error.slice(0, 500),
      },
    });
    this.logger.warn({ id, nextAttempts, isExhausted }, 'outbox_event_attempt_failed');
  }
}
