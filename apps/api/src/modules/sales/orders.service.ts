import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  OrderCancelInput,
  OrderStatus,
  OrderSummary,
} from '@ventascatalogo/contracts';
import { OrdersRepository, type OrderListQuery } from './orders.repository';
import { toOrderSummary } from './sales.mappers';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

/** Estados desde los que se puede cancelar un pedido (máquina de estados). */
const CANCELLABLE_STATUSES: OrderStatus[] = ['DRAFT', 'PENDING_PAYMENT', 'PARTIALLY_PAID'];
/** Estados desde los que se puede marcar cumplido. */
const FULFILLABLE_STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID'];

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: OrderListQuery,
  ): Promise<{ items: OrderSummary[]; nextCursor: string | null }> {
    const page = await this.repo.list(user.organizationId, query);
    return {
      items: page.items.map((order) => toOrderSummary(order)),
      nextCursor: page.nextCursor,
    };
  }

  async get(user: AuthenticatedUser, orderId: string): Promise<OrderSummary> {
    const order = await this.repo.find(user.organizationId, orderId);
    if (!order) throw new AppException('NOT_FOUND', 404, { resource: 'order' });
    return toOrderSummary(order, { includeItems: true });
  }

  async cancel(
    user: AuthenticatedUser,
    orderId: string,
    input: OrderCancelInput,
    meta: AuditMeta,
  ): Promise<OrderSummary> {
    const order = await this.repo.find(user.organizationId, orderId);
    if (!order) throw new AppException('NOT_FOUND', 404, { resource: 'order' });

    // Un pedido con pagos registrados nunca se cancela: el código de negocio manda
    // sobre la transición de estado (409 ORDER_HAS_PAYMENTS).
    const payments = await this.repo.countPayments(order.id);
    if (payments > 0) {
      throw new AppException('ORDER_HAS_PAYMENTS', 409, {
        orderId: order.id,
        payments,
      });
    }

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new AppException('ORDER_INVALID_TRANSITION', 409, {
        from: order.status,
        to: 'CANCELLED',
        allowed: CANCELLABLE_STATUSES,
      });
    }

    const updated = await this.repo.cancel(order.id, input.reason);

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'order.cancelled',
      entityType: 'order',
      entityId: order.id,
      before: { status: order.status },
      after: { status: 'CANCELLED', reason: input.reason },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return toOrderSummary(updated, { includeItems: true });
  }

  async fulfill(user: AuthenticatedUser, orderId: string, meta: AuditMeta): Promise<OrderSummary> {
    const order = await this.repo.find(user.organizationId, orderId);
    if (!order) throw new AppException('NOT_FOUND', 404, { resource: 'order' });

    if (!FULFILLABLE_STATUSES.includes(order.status)) {
      throw new AppException('ORDER_INVALID_TRANSITION', 409, {
        from: order.status,
        to: 'FULFILLED',
        allowed: FULFILLABLE_STATUSES,
      });
    }

    const updated = await this.repo.updateStatus(order.id, 'FULFILLED');
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'order.fulfilled',
      entityType: 'order',
      entityId: order.id,
      before: { status: order.status },
      after: { status: 'FULFILLED' },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return toOrderSummary(updated, { includeItems: true });
  }
}
