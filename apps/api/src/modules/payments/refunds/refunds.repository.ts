import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Payment, Order, Refund } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  nextOrderRefundStatus,
  nextPaymentRefundStatus,
  refundableMinor,
} from './refund-calculations';
import { AppException } from '../../../common/errors/app-exception';

export type PaymentWithOrder = Payment & { order: Order };

export interface CreateRefundInput {
  organizationId: string;
  catalogId: string;
  paymentId: string;
  orderId: string;
  amountMinor: bigint;
  currency: 'CRC' | 'USD';
  reason: string;
  method: string | null;
  requestedByUserId: string;
}

export interface ApproveRefundInput {
  approvedByUserId: string;
  decisionNote: string | null;
}

export interface ApprovedRefund {
  refund: Refund;
  payment: Payment;
  order: Order;
}

@Injectable()
export class RefundsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPayment(organizationId: string, paymentId: string): Promise<PaymentWithOrder | null> {
    return this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: { order: true },
    });
  }

  findOrder(organizationId: string, orderId: string): Promise<Order | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, organizationId, deletedAt: null },
    });
  }

  findRefund(organizationId: string, refundId: string): Promise<Refund | null> {
    return this.prisma.refund.findFirst({
      where: { id: refundId, organizationId },
    });
  }

  listByPayment(organizationId: string, paymentId: string): Promise<Refund[]> {
    return this.prisma.refund.findMany({
      where: { organizationId, paymentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listByOrder(organizationId: string, orderId: string): Promise<Refund[]> {
    return this.prisma.refund.findMany({
      where: { organizationId, orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(input: CreateRefundInput): Promise<Refund> {
    return this.prisma.refund.create({
      data: {
        organizationId: input.organizationId,
        catalogId: input.catalogId,
        paymentId: input.paymentId,
        orderId: input.orderId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        reason: input.reason,
        method: input.method,
        status: 'REQUESTED',
        requestedByUserId: input.requestedByUserId,
      },
    });
  }

  /**
   * Aprobación transaccional: revalida el disponible, marca el reembolso como
   * `PROCESSED`, actualiza `Payment.status` y `Order.refundedMinor`/estado. La
   * segunda aprobación falla por el `updateMany` sobre `REQUESTED`.
   */
  async approve(refundId: string, input: ApproveRefundInput): Promise<ApprovedRefund> {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: refund.orderId } });

      const processedSum = await this.sumProcessed(tx, refund.paymentId);
      const available = refundableMinor(payment.amountMinor, processedSum);
      if (refund.amountMinor > available) {
        throw new AppException('REFUND_EXCEEDS_PAID', 422, {
          availableMinor: available.toString(),
          requestedMinor: refund.amountMinor.toString(),
        });
      }

      const claimed = await tx.refund.updateMany({
        where: { id: refund.id, status: 'REQUESTED' },
        data: {
          status: 'PROCESSED',
          approvedByUserId: input.approvedByUserId,
          decidedByUserId: input.approvedByUserId,
          decisionNote: input.decisionNote,
          processedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new AppException('VALIDATION_FAILED', 409, {
          reason: 'refund_already_decided',
        });
      }

      const totalRefunded = processedSum + refund.amountMinor;
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { status: nextPaymentRefundStatus(payment.amountMinor, totalRefunded) },
      });
      const nextRefundedMinor = order.refundedMinor + refund.amountMinor;
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          refundedMinor: nextRefundedMinor,
          status: nextOrderRefundStatus(order.status, order.paidMinor, nextRefundedMinor),
        },
      });
      const updatedRefund = await tx.refund.findUniqueOrThrow({ where: { id: refund.id } });

      return { refund: updatedRefund, payment: updatedPayment, order: updatedOrder };
    });
  }

  async reject(
    refundId: string,
    decidedByUserId: string,
    decisionNote: string | null,
  ): Promise<Refund> {
    const updated = await this.prisma.refund.updateMany({
      where: { id: refundId, status: 'REQUESTED' },
      data: { status: 'REJECTED', decidedByUserId, decisionNote },
    });
    if (updated.count === 0) {
      throw new AppException('VALIDATION_FAILED', 409, { reason: 'refund_already_decided' });
    }
    return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
  }

  sumProcessedForPayment(paymentId: string): Promise<bigint> {
    return this.sumProcessed(this.prisma, paymentId);
  }

  async sumProcessed(
    client: Prisma.TransactionClient | PrismaService,
    paymentId: string,
  ): Promise<bigint> {
    const aggregate = await client.refund.aggregate({
      where: { paymentId, status: 'PROCESSED' },
      _sum: { amountMinor: true },
    });
    return aggregate._sum.amountMinor ?? 0n;
  }
}
