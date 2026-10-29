import { Injectable } from '@nestjs/common';
import type { Currency, PaymentProvider, PaymentStatus } from '@ventascatalogo/contracts';
import type {
  Customer,
  Order,
  OrderItem,
  Payment,
  PaymentGatewayConfig,
  PaymentLink,
  PaymentLinkStatus,
  PaymentWebhookEvent,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type OrderForPayment = Pick<
  Order,
  | 'id'
  | 'organizationId'
  | 'catalogId'
  | 'catalogVersionId'
  | 'number'
  | 'status'
  | 'currency'
  | 'totalMinor'
  | 'paidMinor'
>;

export interface PaymentLinkWithOrder extends PaymentLink {
  order: Order & { customer: Customer; items: OrderItem[] };
}

export interface CreatePaymentLinkInput {
  organizationId: string;
  catalogId: string;
  orderId: string;
  provider: PaymentProvider;
  token: string;
  url: string;
  amountMinor: bigint;
  currency: Currency;
  externalId: string | null;
  expiresAt: Date;
  createdByUserId: string;
}

export interface RegisteredPaymentInput {
  organizationId: string;
  catalogId: string;
  catalogVersionId: string;
  orderId: string;
  provider: PaymentProvider;
  providerPaymentId: string | null;
  amountMinor: bigint;
  currency: Currency;
  method: string | null;
  reference: string | null;
  paidAt: Date;
  rawPayload?: Prisma.InputJsonValue;
}

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrder(organizationId: string, orderId: string): Promise<OrderForPayment | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        catalogId: true,
        catalogVersionId: true,
        number: true,
        status: true,
        currency: true,
        totalMinor: true,
        paidMinor: true,
      },
    });
  }

  /** Solo para webhooks firmados: el pedido llega por id en el payload. */
  findOrderById(orderId: string): Promise<OrderForPayment | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        catalogId: true,
        catalogVersionId: true,
        number: true,
        status: true,
        currency: true,
        totalMinor: true,
        paidMinor: true,
      },
    });
  }

  markWebhookEvent(
    eventId: string,
    data: { error?: string | null; processedAt?: Date },
  ): Promise<PaymentWebhookEvent> {
    return this.prisma.paymentWebhookEvent.update({
      where: { id: eventId },
      data: {
        ...(data.error !== undefined ? { error: data.error } : {}),
        ...(data.processedAt ? { processedAt: data.processedAt } : {}),
      },
    });
  }

  createLink(input: CreatePaymentLinkInput): Promise<PaymentLink> {
    return this.prisma.paymentLink.create({
      data: {
        organizationId: input.organizationId,
        catalogId: input.catalogId,
        orderId: input.orderId,
        provider: input.provider,
        token: input.token,
        url: input.url,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: 'ACTIVE',
        externalId: input.externalId,
        expiresAt: input.expiresAt,
        createdByUserId: input.createdByUserId,
      },
    });
  }

  findLinkByToken(token: string): Promise<PaymentLinkWithOrder | null> {
    return this.prisma.paymentLink.findUnique({
      where: { token },
      include: { order: { include: { customer: true, items: true } } },
    });
  }

  updateLinkStatus(
    linkId: string,
    status: PaymentLinkStatus,
    usedAt?: Date | null,
  ): Promise<PaymentLink> {
    return this.prisma.paymentLink.update({
      where: { id: linkId },
      data: { status, ...(usedAt !== undefined ? { usedAt } : {}) },
    });
  }

  listPayments(orderId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Registra un pago y recalcula `Order.paidMinor`/estado en una transacción.
   * Idempotencia del sandbox: solo se aplica si el link sigue `ACTIVE`.
   */
  async applySandboxPayment(input: {
    link: PaymentLinkWithOrder;
    payment: RegisteredPaymentInput;
    nextStatus: Order['status'];
    nextPaidMinor: bigint;
  }): Promise<{ applied: boolean; payment: Payment | null; order: Order }> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentLink.updateMany({
        where: { id: input.link.id, status: 'ACTIVE' },
        data: { status: 'USED', usedAt: input.payment.paidAt },
      });
      const order = await tx.order.findUniqueOrThrow({ where: { id: input.link.orderId } });
      if (claimed.count === 0) {
        return { applied: false, payment: null, order };
      }

      const payment = await tx.payment.create({
        data: {
          organizationId: input.payment.organizationId,
          catalogId: input.payment.catalogId,
          catalogVersionId: input.payment.catalogVersionId,
          orderId: input.payment.orderId,
          provider: input.payment.provider,
          providerPaymentId: input.payment.providerPaymentId,
          status: 'SUCCEEDED' as PaymentStatus,
          amountMinor: input.payment.amountMinor,
          currency: input.payment.currency,
          method: input.payment.method,
          reference: input.payment.reference,
          paidAt: input.payment.paidAt,
        },
      });
      const updated = await tx.order.update({
        where: { id: input.payment.orderId },
        data: { paidMinor: input.nextPaidMinor, status: input.nextStatus },
      });
      return { applied: true, payment, order: updated };
    });
  }

  async registerManualPayment(input: {
    payment: RegisteredPaymentInput;
    nextStatus: Order['status'];
    nextPaidMinor: bigint;
  }): Promise<{ payment: Payment; order: Order }> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          organizationId: input.payment.organizationId,
          catalogId: input.payment.catalogId,
          catalogVersionId: input.payment.catalogVersionId,
          orderId: input.payment.orderId,
          provider: input.payment.provider,
          providerPaymentId: input.payment.providerPaymentId,
          status: 'SUCCEEDED',
          amountMinor: input.payment.amountMinor,
          currency: input.payment.currency,
          method: input.payment.method,
          reference: input.payment.reference,
          paidAt: input.payment.paidAt,
          rawPayload: input.payment.rawPayload,
        },
      });
      const order = await tx.order.update({
        where: { id: input.payment.orderId },
        data: { paidMinor: input.nextPaidMinor, status: input.nextStatus },
      });
      return { payment, order };
    });
  }

  findWebhookEvent(
    provider: PaymentProvider,
    externalEventId: string,
  ): Promise<PaymentWebhookEvent | null> {
    return this.prisma.paymentWebhookEvent.findUnique({
      where: { provider_externalEventId: { provider, externalEventId } },
    });
  }

  /** Devuelve `null` si el evento ya estaba registrado (idempotencia por unique). */
  async createWebhookEvent(input: {
    provider: PaymentProvider;
    externalEventId: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
    signatureValid: boolean;
  }): Promise<PaymentWebhookEvent | null> {
    try {
      return await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: input.provider,
          externalEventId: input.externalEventId,
          eventType: input.eventType,
          payload: input.payload,
          signatureValid: input.signatureValid,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  /**
   * Procesa un evento ya verificado: crea el `Payment` y actualiza el pedido.
   * El evento queda con `paymentId` y `processedAt` (o `error`).
   */
  async applyWebhookEvent(input: {
    eventId: string;
    payment: RegisteredPaymentInput;
    nextStatus: Order['status'];
    nextPaidMinor: bigint;
  }): Promise<{ payment: Payment; order: Order } | null> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: input.payment.orderId } });
      if (!order || order.deletedAt) {
        await tx.paymentWebhookEvent.update({
          where: { id: input.eventId },
          data: { error: 'order_not_found', processedAt: new Date() },
        });
        return null;
      }

      const payment = await tx.payment.create({
        data: {
          organizationId: order.organizationId,
          catalogId: order.catalogId,
          catalogVersionId: order.catalogVersionId,
          orderId: order.id,
          provider: input.payment.provider,
          providerPaymentId: input.payment.providerPaymentId,
          status: 'SUCCEEDED',
          amountMinor: input.payment.amountMinor,
          currency: input.payment.currency,
          method: input.payment.method,
          reference: input.payment.reference,
          paidAt: input.payment.paidAt,
          rawPayload: input.payment.rawPayload,
        },
      });
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { paidMinor: input.nextPaidMinor, status: input.nextStatus },
      });
      await tx.paymentWebhookEvent.update({
        where: { id: input.eventId },
        data: { paymentId: payment.id, processedAt: new Date() },
      });
      return { payment, order: updated };
    });
  }

  async findGatewayConfig(
    organizationId: string,
    provider: PaymentProvider,
  ): Promise<PaymentGatewayConfig | null> {
    return this.prisma.paymentGatewayConfig.findUnique({
      where: {
        organizationId_provider: { organizationId, provider },
      },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
