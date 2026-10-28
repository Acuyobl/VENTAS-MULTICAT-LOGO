import { Injectable } from '@nestjs/common';
import type { Customer, Order, PaymentLink, PaymentReminder } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type OrderForReminder = Order & { customer: Customer };

export interface CreateReminderInput {
  organizationId: string;
  catalogId: string | null;
  orderId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  to: string;
  status: 'SENT' | 'FAILED';
  providerMessageId: string | null;
  error: string | null;
  sentAt: Date | null;
  createdByUserId: string;
}

@Injectable()
export class RemindersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrder(organizationId: string, orderId: string): Promise<OrderForReminder | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, organizationId, deletedAt: null },
      include: { customer: true },
    });
  }

  findActivePaymentLink(orderId: string): Promise<PaymentLink | null> {
    return this.prisma.paymentLink.findFirst({
      where: { orderId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(input: CreateReminderInput): Promise<PaymentReminder> {
    return this.prisma.paymentReminder.create({ data: input });
  }

  listByOrder(organizationId: string, orderId: string): Promise<PaymentReminder[]> {
    return this.prisma.paymentReminder.findMany({
      where: { organizationId, orderId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
