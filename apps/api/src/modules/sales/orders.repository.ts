import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { OrderStatus } from '@ventascatalogo/contracts';
import type { OrderWithRelations } from './sales.mappers';

export interface OrderListQuery {
  catalogId?: string;
  status?: OrderStatus;
  cursor?: string;
  limit: number;
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    query: OrderListQuery,
  ): Promise<{ items: OrderWithRelations[]; nextCursor: string | null }> {
    const where: Prisma.OrderWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.catalogId ? { catalogId: query.catalogId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
    };

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      include: { customer: true, items: true },
    });
    const hasNext = rows.length > query.limit;
    const page = hasNext ? rows.slice(0, query.limit) : rows;
    return {
      items: page,
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  find(organizationId: string, orderId: string): Promise<OrderWithRelations | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, organizationId, deletedAt: null },
      include: { customer: true, items: true },
    });
  }

  countPayments(orderId: string): Promise<number> {
    return this.prisma.payment.count({ where: { orderId } });
  }

  updateStatus(orderId: string, status: OrderStatus) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { customer: true, items: true },
    });
  }

  /** Cancela guardando el motivo en su columna (ya no se concatena en `notes`). */
  cancel(orderId: string, reason: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelReason: reason },
      include: { customer: true, items: true },
    });
  }
}
