import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  OrderRefundedState,
  RefundDecisionInput,
  RefundListResponse,
  RefundRequestInput,
  RefundSummary,
} from '@ventascatalogo/contracts';
import { RefundsRepository } from './refunds.repository';
import { refundableMinor } from './refund-calculations';
import { toOrderRefundedState, toRefundListResponse, toRefundSummary } from './refunds.mappers';
import { AppException } from '../../../common/errors/app-exception';
import { AuditService } from '../../audit/audit.service';
import type { AuditMeta } from '../../../common/audit/audit.types';

const REFUNDABLE_PAYMENT_STATUSES = new Set(['SUCCEEDED', 'PARTIALLY_REFUNDED']);

@Injectable()
export class RefundsService {
  constructor(
    private readonly repo: RefundsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Solicita el reembolso: solo pagos cobrados y monto ≤ disponible. */
  async request(
    user: AuthenticatedUser,
    paymentId: string,
    input: RefundRequestInput,
    meta: AuditMeta,
  ): Promise<RefundSummary> {
    const payment = await this.repo.findPayment(user.organizationId, paymentId);
    if (!payment) throw new AppException('NOT_FOUND', 404, { resource: 'payment' });

    if (!REFUNDABLE_PAYMENT_STATUSES.has(payment.status)) {
      throw new AppException('PAYMENT_NOT_REFUNDABLE', 409, {
        paymentId: payment.id,
        status: payment.status,
      });
    }

    const processed = await this.repo.sumProcessedForPayment(payment.id);
    const available = refundableMinor(payment.amountMinor, processed);
    if (input.amountMinor > available) {
      throw new AppException('REFUND_EXCEEDS_PAID', 422, {
        availableMinor: available.toString(),
        requestedMinor: input.amountMinor.toString(),
      });
    }

    const refund = await this.repo.create({
      organizationId: user.organizationId,
      catalogId: payment.catalogId,
      paymentId: payment.id,
      orderId: payment.orderId,
      amountMinor: input.amountMinor,
      currency: payment.currency,
      reason: input.reason,
      method: input.method ?? null,
      requestedByUserId: user.id,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'payment.refund_requested',
      entityType: 'refund',
      entityId: refund.id,
      after: {
        paymentId: payment.id,
        orderId: payment.orderId,
        amountMinor: refund.amountMinor.toString(),
        availableMinor: available.toString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toRefundSummary(refund);
  }

  /**
   * Aprobación con segregación de funciones: quien solicita no puede aprobar.
   * La aprobación es idempotente-negativa: si ya fue decidida → 409.
   */
  async approve(
    user: AuthenticatedUser,
    refundId: string,
    input: RefundDecisionInput,
    meta: AuditMeta,
  ): Promise<OrderRefundedState> {
    const refund = await this.repo.findRefund(user.organizationId, refundId);
    if (!refund) throw new AppException('NOT_FOUND', 404, { resource: 'refund' });

    if (refund.requestedByUserId === user.id) {
      throw new AppException('REFUND_SEGREGATION_REQUIRED', 409, {
        requestedByUserId: refund.requestedByUserId,
        decidedByUserId: user.id,
      });
    }
    if (refund.status !== 'REQUESTED') {
      throw new AppException('VALIDATION_FAILED', 409, {
        reason: 'refund_already_decided',
        status: refund.status,
      });
    }

    const before = await this.repo.findPayment(user.organizationId, refund.paymentId);
    const approved = await this.repo.approve(refund.id, {
      approvedByUserId: user.id,
      decisionNote: input.note ?? null,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'payment.refund_approved',
      entityType: 'refund',
      entityId: approved.refund.id,
      before: {
        refundStatus: 'REQUESTED',
        paymentStatus: before?.status ?? null,
        orderRefundedMinor: (approved.order.refundedMinor - approved.refund.amountMinor).toString(),
      },
      after: {
        refundStatus: 'PROCESSED',
        paymentStatus: approved.payment.status,
        orderStatus: approved.order.status,
        orderRefundedMinor: approved.order.refundedMinor.toString(),
        amountMinor: approved.refund.amountMinor.toString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toOrderRefundedState(approved.payment, approved.order);
  }

  async reject(
    user: AuthenticatedUser,
    refundId: string,
    input: RefundDecisionInput,
    meta: AuditMeta,
  ): Promise<RefundSummary> {
    const refund = await this.repo.findRefund(user.organizationId, refundId);
    if (!refund) throw new AppException('NOT_FOUND', 404, { resource: 'refund' });
    if (refund.status !== 'REQUESTED') {
      throw new AppException('VALIDATION_FAILED', 409, {
        reason: 'refund_already_decided',
        status: refund.status,
      });
    }

    const rejected = await this.repo.reject(refund.id, user.id, input.note ?? null);
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'payment.refund_rejected',
      entityType: 'refund',
      entityId: rejected.id,
      before: { refundStatus: 'REQUESTED' },
      after: { refundStatus: 'REJECTED', note: input.note ?? null },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return toRefundSummary(rejected);
  }

  async listOrderRefunds(organizationId: string, orderId: string): Promise<RefundListResponse> {
    const order = await this.repo.findOrder(organizationId, orderId);
    if (!order) throw new AppException('NOT_FOUND', 404, { resource: 'order' });
    const refunds = await this.repo.listByOrder(organizationId, order.id);
    return toRefundListResponse(order, refunds);
  }

  async listPaymentRefunds(
    organizationId: string,
    paymentId: string,
  ): Promise<{ items: RefundSummary[] }> {
    const payment = await this.repo.findPayment(organizationId, paymentId);
    if (!payment) throw new AppException('NOT_FOUND', 404, { resource: 'payment' });
    const refunds = await this.repo.listByPayment(organizationId, payment.id);
    return { items: refunds.map(toRefundSummary) };
  }
}
