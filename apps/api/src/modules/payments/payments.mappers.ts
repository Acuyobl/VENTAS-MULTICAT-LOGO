import type {
  PaymentLinkResponse,
  PaymentListResponse,
  PaymentSummary,
} from '@ventascatalogo/contracts';
import type { Payment, PaymentLink } from '@prisma/client';
import { computePaymentProgress } from './payment-calculations';

export function toPaymentSummary(payment: Payment): PaymentSummary {
  return {
    id: payment.id,
    provider: payment.provider,
    status: payment.status,
    amountMinor: payment.amountMinor.toString(),
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

export function toPaymentListResponse(
  order: {
    id: string;
    number: string;
    currency: 'CRC' | 'USD';
    totalMinor: bigint;
    paidMinor: bigint;
    status: PaymentListResponse['orderStatus'];
  },
  payments: Payment[],
): PaymentListResponse {
  const progress = computePaymentProgress(order.totalMinor, order.paidMinor);
  return {
    orderId: order.id,
    orderNumber: order.number,
    currency: order.currency,
    totalMinor: order.totalMinor.toString(),
    paidMinor: progress.paidMinor.toString(),
    balanceMinor: progress.balanceMinor.toString(),
    orderStatus: order.status,
    items: payments.map(toPaymentSummary),
  };
}

export function toPaymentLinkResponse(link: PaymentLink, orderNumber: string): PaymentLinkResponse {
  return {
    id: link.id,
    orderId: link.orderId,
    orderNumber,
    provider: link.provider,
    status: link.status,
    url: link.url,
    amountMinor: link.amountMinor.toString(),
    currency: link.currency,
    expiresAt: link.expiresAt.toISOString(),
  };
}
