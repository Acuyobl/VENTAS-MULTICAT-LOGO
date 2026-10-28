import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AuthenticatedUser,
  type ManualPaymentCreateInput,
  type PaymentLinkCreateInput,
  type PaymentLinkResponse,
  type PaymentListResponse,
  type PaymentProvider,
  type PaymentSummary,
  type PublicPaymentLink,
  type SandboxConfirmResponse,
} from '@ventascatalogo/contracts';
import type { OrderStatus } from '@ventascatalogo/contracts';
import type { Payment, PaymentLink } from '@prisma/client';
import { PaymentsRepository, type OrderForPayment } from './payments.repository';
import { PaymentGatewayRegistry, providerFromKey } from './payment-gateway';
import {
  assertPaymentWithinBalance,
  computePaymentProgress,
  isPaymentLinkExpired,
} from './payment-calculations';
import { toPaymentLinkResponse, toPaymentListResponse, toPaymentSummary } from './payments.mappers';
import { toStorefrontOrder } from '../storefront/storefront.mappers';
import { randomToken } from '../../common/utils/crypto';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

const MINUTE_MS = 60 * 1000;

/** Estados en los que todavía se puede cobrar el pedido. */
const PAYABLE_STATUSES: OrderStatus[] = ['DRAFT', 'PENDING_PAYMENT', 'PARTIALLY_PAID'];
const MANUAL_METHOD_PROVIDERS: Record<string, PaymentProvider> = {
  CASH: 'CASH',
  TRANSFER: 'TRANSFER',
  SINPE: 'SINPE',
};

export interface WebhookResult {
  received: boolean;
  idempotent: boolean;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly repo: PaymentsRepository,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Crea el link de pago (sandbox o Stripe) con monto por defecto = saldo. */
  async createLink(
    user: AuthenticatedUser,
    orderId: string,
    input: PaymentLinkCreateInput,
    meta: AuditMeta,
  ): Promise<PaymentLinkResponse> {
    const order = await this.requireOrder(user.organizationId, orderId);
    this.assertPayable(order);

    const progress = computePaymentProgress(order.totalMinor, order.paidMinor);
    const amountMinor = input.amountMinor ?? progress.balanceMinor;
    if (amountMinor <= 0n) {
      throw new AppException('VALIDATION_FAILED', 422, {
        reason: 'no_balance',
        balanceMinor: progress.balanceMinor.toString(),
      });
    }
    assertPaymentWithinBalance(order.totalMinor, order.paidMinor, amountMinor);

    const providerKey = input.provider
      ? input.provider
      : this.config.get<string>('PAYMENTS_DEFAULT_PROVIDER', 'sandbox');
    const provider = providerFromKey(providerKey ?? 'sandbox');
    if (!provider) {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
        provider: providerKey,
        reason: 'gateway_not_configured',
      });
    }
    const gateway = this.gateways.require(provider);

    const ttlMinutes =
      input.expiresInMinutes ?? this.config.get<number>('PAYMENTS_LINK_TTL_MINUTES', 60);
    const expiresAt = new Date(Date.now() + ttlMinutes * MINUTE_MS);
    const token = randomToken(24);

    const created = await gateway.createLink({
      orderId: order.id,
      orderNumber: order.number,
      amountMinor,
      currency: order.currency,
      token,
      expiresAt,
    });

    const link = await this.repo.createLink({
      organizationId: order.organizationId,
      catalogId: order.catalogId,
      orderId: order.id,
      provider,
      token,
      url: created.url,
      amountMinor,
      currency: order.currency,
      externalId: created.externalId,
      expiresAt,
      createdByUserId: user.id,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'payment.link_created',
      entityType: 'payment_link',
      entityId: link.id,
      after: {
        orderId: order.id,
        provider,
        amountMinor: amountMinor.toString(),
        expiresAt: link.expiresAt.toISOString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toPaymentLinkResponse(link, order.number);
  }

  async listOrderPayments(organizationId: string, orderId: string): Promise<PaymentListResponse> {
    const order = await this.requireOrder(organizationId, orderId);
    const payments = await this.repo.listPayments(order.id);
    return toPaymentListResponse(order, payments);
  }

  /** Pago manual (efectivo/transferencia/SINPE) con regla de sobrepago 422. */
  async registerManualPayment(
    user: AuthenticatedUser,
    orderId: string,
    input: ManualPaymentCreateInput,
    meta: AuditMeta,
  ): Promise<PaymentSummary> {
    const order = await this.requireOrder(user.organizationId, orderId);
    this.assertPayable(order);
    assertPaymentWithinBalance(order.totalMinor, order.paidMinor, input.amountMinor);

    const provider = MANUAL_METHOD_PROVIDERS[input.method];
    if (!provider) {
      throw new AppException('VALIDATION_FAILED', 400, {
        reason: 'unsupported_manual_method',
        method: input.method,
      });
    }
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    const nextPaid = order.paidMinor + input.amountMinor;
    const progress = computePaymentProgress(order.totalMinor, nextPaid);

    const { payment } = await this.repo.registerManualPayment({
      payment: {
        organizationId: order.organizationId,
        catalogId: order.catalogId,
        catalogVersionId: order.catalogVersionId,
        orderId: order.id,
        provider,
        providerPaymentId: null,
        amountMinor: input.amountMinor,
        currency: order.currency,
        method: input.method,
        reference: input.reference ?? null,
        paidAt,
      },
      nextStatus: progress.status,
      nextPaidMinor: progress.paidMinor,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'payment.manual_registered',
      entityType: 'payment',
      entityId: payment.id,
      after: {
        orderId: order.id,
        orderStatus: progress.status,
        amountMinor: input.amountMinor.toString(),
        paidMinor: progress.paidMinor.toString(),
        method: input.method,
        reference: input.reference ?? null,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toPaymentSummary(payment);
  }

  /**
   * Confirmación sandbox (solo dev). Idempotente: la segunda confirmación
   * devuelve `alreadyProcessed=true` sin duplicar el `Payment`.
   */
  async confirmSandbox(token: string, meta: AuditMeta): Promise<SandboxConfirmResponse> {
    const sandboxGateway = this.gateways.get('SANDBOX');
    const enabled =
      sandboxGateway &&
      'isEnabled' in sandboxGateway &&
      (sandboxGateway as { isEnabled: () => boolean }).isEnabled();
    if (!enabled) throw new AppException('NOT_FOUND', 404);

    const link = await this.repo.findLinkByToken(token);
    if (!link) throw new AppException('NOT_FOUND', 404, { resource: 'paymentLink' });
    this.assertLinkUsable(link);

    const order = link.order;
    const baseProgress = computePaymentProgress(order.totalMinor, order.paidMinor);
    const nextPaid = order.paidMinor + link.amountMinor;
    const progress = computePaymentProgress(order.totalMinor, nextPaid);

    const result = await this.repo.applySandboxPayment({
      link,
      payment: {
        organizationId: link.organizationId,
        catalogId: link.catalogId,
        catalogVersionId: order.catalogVersionId,
        orderId: order.id,
        provider: 'SANDBOX',
        providerPaymentId: null,
        amountMinor: link.amountMinor,
        currency: link.currency,
        method: 'SANDBOX',
        reference: `sandbox:${link.token.slice(0, 8)}`,
        paidAt: new Date(),
      },
      nextStatus: progress.status,
      nextPaidMinor: progress.paidMinor,
    });

    if (!result.applied) {
      // Otra confirmación ganó la carrera (link ya USED).
      const current = await this.repo.findLinkByToken(token);
      const currentOrder = current?.order ?? order;
      return {
        paymentStatus: 'SUCCEEDED',
        orderStatus: currentOrder.status,
        paidMinor: currentOrder.paidMinor.toString(),
        totalMinor: currentOrder.totalMinor.toString(),
        alreadyProcessed: true,
      };
    }

    await this.audit.write({
      organizationId: link.organizationId,
      actorUserId: null,
      action: 'payment.sandbox_confirmed',
      entityType: 'payment',
      entityId: result.payment?.id ?? link.id,
      after: {
        orderId: order.id,
        amountMinor: link.amountMinor.toString(),
        paidMinor: progress.paidMinor.toString(),
        orderStatus: progress.status,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return {
      paymentStatus: 'SUCCEEDED',
      orderStatus: progress.status,
      paidMinor: progress.paidMinor.toString(),
      totalMinor: order.totalMinor.toString(),
      alreadyProcessed: false,
    };
  }

  /** Link público con el resumen del pedido; expirado → 409. */
  async getPublicLink(token: string): Promise<PublicPaymentLink> {
    const link = await this.repo.findLinkByToken(token);
    if (!link) throw new AppException('NOT_FOUND', 404, { resource: 'paymentLink' });
    this.assertLinkUsable(link);

    return {
      token: link.token,
      status: link.status,
      provider: link.provider,
      amountMinor: link.amountMinor.toString(),
      currency: link.currency,
      expiresAt: link.expiresAt.toISOString(),
      order: toStorefrontOrder(link.order),
    };
  }

  /** Webhook idempotente por `(provider, externalEventId)` + firma verificada. */
  async handleWebhook(
    providerKey: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookResult> {
    const gateway = this.gateways.findByKey(providerKey);
    if (!gateway) throw new AppException('NOT_FOUND', 404, { resource: 'paymentProvider' });
    if (!rawBody || rawBody.length === 0) {
      throw new AppException('PAYMENT_SIGNATURE_INVALID', 400);
    }
    if (!gateway.verifyWebhook(rawBody, headers)) {
      throw new AppException('PAYMENT_SIGNATURE_INVALID', 400);
    }

    const event = gateway.parseWebhook(rawBody);
    if (!event.externalEventId) {
      throw new AppException('VALIDATION_FAILED', 400, { reason: 'missing_event_id' });
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    const record = await this.repo.createWebhookEvent({
      provider: gateway.provider,
      externalEventId: event.externalEventId,
      eventType: event.type,
      payload: payload as never,
      signatureValid: true,
    });
    if (!record) return { received: true, idempotent: true };

    if (event.kind !== 'payment_succeeded' || !event.orderId || event.amountMinor === null) {
      await this.repo.markWebhookEvent(record.id, {
        error: event.kind === 'ignored' ? 'event_ignored' : 'missing_order_or_amount',
        processedAt: new Date(),
      });
      return { received: true, idempotent: false };
    }

    const order = await this.repo.findOrderById(event.orderId);
    if (!order) {
      await this.repo.markWebhookEvent(record.id, {
        error: 'order_not_found',
        processedAt: new Date(),
      });
      this.logger.warn({ orderId: event.orderId }, 'payment_webhook_order_not_found');
      return { received: true, idempotent: false };
    }
    const nextPaid = order.paidMinor + event.amountMinor;
    const progress = computePaymentProgress(order.totalMinor, nextPaid);

    await this.repo.applyWebhookEvent({
      eventId: record.id,
      payment: {
        organizationId: order.organizationId,
        catalogId: order.catalogId,
        catalogVersionId: order.catalogVersionId,
        orderId: order.id,
        provider: gateway.provider,
        providerPaymentId: event.providerPaymentId,
        amountMinor: event.amountMinor,
        currency: event.currency ?? order.currency,
        method: 'WEBHOOK',
        reference: event.providerPaymentId ?? event.externalEventId,
        paidAt: new Date(),
        rawPayload: payload as never,
      },
      nextStatus: progress.status,
      nextPaidMinor: progress.paidMinor,
    });

    return { received: true, idempotent: false };
  }
  private assertPayable(order: OrderForPayment): void {
    if (!PAYABLE_STATUSES.includes(order.status)) {
      throw new AppException('ORDER_INVALID_TRANSITION', 409, {
        from: order.status,
        allowed: PAYABLE_STATUSES,
      });
    }
  }

  private async requireOrder(organizationId: string, orderId: string): Promise<OrderForPayment> {
    const order = await this.repo.findOrder(organizationId, orderId);
    if (!order) throw new AppException('NOT_FOUND', 404, { resource: 'order' });
    return order;
  }

  private assertLinkUsable(link: PaymentLink): void {
    if (link.status === 'USED') return;
    if (link.status === 'EXPIRED' || isPaymentLinkExpired(link.expiresAt)) {
      throw new AppException(
        'VALIDATION_FAILED',
        409,
        { reason: 'payment_link_expired' },
        'El link de pago expiró. Generá uno nuevo.',
      );
    }
  }
}
