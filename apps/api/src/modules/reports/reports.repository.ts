import { Injectable } from '@nestjs/common';
import type { Payment, Refund } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const CONFIRMED_PAYMENT_STATUSES = ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrganization(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, defaultCurrency: true },
    });
  }

  salesOrders(organizationId: string, range: { start: Date; end: Date }, catalogId?: string) {
    return this.prisma.order.findMany({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: range.start, lte: range.end },
        ...(catalogId ? { catalogId } : {}),
      },
      select: {
        status: true,
        totalMinor: true,
        subtotalMinor: true,
        discountMinor: true,
        taxMinor: true,
        paidMinor: true,
        refundedMinor: true,
      },
    });
  }

  confirmedPayments(
    organizationId: string,
    range: { start: Date; end: Date },
  ): Promise<
    Array<
      Payment & {
        order: { number: string; catalogId: string } | null;
      }
    >
  > {
    return this.prisma.payment.findMany({
      where: {
        organizationId,
        status: { in: [...CONFIRMED_PAYMENT_STATUSES] },
        paidAt: { gte: range.start, lte: range.end },
      },
      include: { order: { select: { number: true, catalogId: true } } },
      orderBy: { paidAt: 'asc' },
    });
  }

  refundsInRange(organizationId: string, range: { start: Date; end: Date }) {
    return this.prisma.refund.findMany({
      where: {
        organizationId,
        createdAt: { gte: range.start, lte: range.end },
      },
      select: {
        id: true,
        paymentId: true,
        orderId: true,
        amountMinor: true,
        status: true,
        processedAt: true,
      },
    });
  }

  orderBalances(organizationId: string, range: { end: Date }) {
    return this.prisma.order.findMany({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { lte: range.end },
      },
      select: { status: true, totalMinor: true, paidMinor: true, createdAt: true },
    });
  }

  paidOrderItems(organizationId: string, range: { start: Date; end: Date }) {
    return this.prisma.orderItem.findMany({
      where: {
        order: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: range.start, lte: range.end },
          paidMinor: { gt: 0n },
        },
      },
      select: {
        productId: true,
        nameSnapshot: true,
        quantity: true,
        lineTotalMinor: true,
      },
    });
  }

  expensesInRange(organizationId: string, range: { start: Date; end: Date }, catalogId?: string) {
    return this.prisma.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        incurredAt: { gte: range.start, lte: range.end },
        ...(catalogId ? { catalogId } : {}),
      },
      select: { category: true, amountMinor: true, taxMinor: true },
    });
  }

  async processedRefundsByPayment(
    organizationId: string,
    paymentIds: string[],
  ): Promise<Map<string, bigint>> {
    const result = new Map<string, bigint>();
    if (paymentIds.length === 0) return result;
    const grouped = await this.prisma.refund.groupBy({
      by: ['paymentId'],
      where: {
        organizationId,
        paymentId: { in: paymentIds },
        status: 'PROCESSED',
      },
      _sum: { amountMinor: true },
    });
    for (const row of grouped) {
      result.set(row.paymentId, row._sum.amountMinor ?? 0n);
    }
    return result;
  }
}

export type ConfirmedPaymentRow = Payment & { order: { number: string } | null };
export type RefundRow = Pick<
  Refund,
  'id' | 'paymentId' | 'orderId' | 'amountMinor' | 'status' | 'processedAt'
>;
