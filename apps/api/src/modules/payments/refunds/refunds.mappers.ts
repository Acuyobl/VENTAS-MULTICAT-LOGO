import type {
  OrderRefundedState,
  RefundListResponse,
  RefundSummary,
} from '@ventascatalogo/contracts';
import type { Order, Payment, Refund } from '@prisma/client';
import { orderBalanceMinor } from '../payment-calculations';

export function toRefundSummary(refund: Refund): RefundSummary {
  return {
    id: refund.id,
    paymentId: refund.paymentId,
    orderId: refund.orderId,
    amountMinor: refund.amountMinor.toString(),
    currency: refund.currency,
    reason: refund.reason,
    method: refund.method,
    status: refund.status,
    requestedByUserId: refund.requestedByUserId,
    approvedByUserId: refund.approvedByUserId,
    processedAt: refund.processedAt?.toISOString() ?? null,
    createdAt: refund.createdAt.toISOString(),
  };
}

export function toRefundListResponse(order: Order, refunds: Refund[]): RefundListResponse {
  return {
    orderId: order.id,
    orderNumber: order.number,
    totalMinor: order.totalMinor.toString(),
    paidMinor: order.paidMinor.toString(),
    refundedMinor: order.refundedMinor.toString(),
    // Saldo reembolsable pendiente: lo pagado menos lo ya reembolsado.
    balanceMinor: orderBalanceMinor(order.paidMinor, order.refundedMinor).toString(),
    orderStatus: order.status,
    items: refunds.map(toRefundSummary),
  };
}

export function toOrderRefundedState(payment: Payment, order: Order): OrderRefundedState {
  return {
    paymentStatus: payment.status,
    orderStatus: order.status,
    paidMinor: order.paidMinor.toString(),
    refundedMinor: order.refundedMinor.toString(),
    balanceMinor: orderBalanceMinor(order.paidMinor, order.refundedMinor).toString(),
  };
}
