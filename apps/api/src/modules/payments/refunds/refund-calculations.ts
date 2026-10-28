import type { OrderStatus, PaymentStatus } from '@ventascatalogo/contracts';

/** Disponible para reembolsar de un pago: monto − reembolsos ya aprobados. */
export function refundableMinor(
  paymentAmountMinor: bigint,
  processedRefundedMinor: bigint,
): bigint {
  const available = paymentAmountMinor - processedRefundedMinor;
  return available > 0n ? available : 0n;
}

/** Estado del pago según lo reembolsado: parcial, total o intacto. */
export function nextPaymentRefundStatus(
  paymentAmountMinor: bigint,
  totalRefundedMinor: bigint,
): Extract<PaymentStatus, 'SUCCEEDED' | 'PARTIALLY_REFUNDED' | 'REFUNDED'> {
  if (totalRefundedMinor <= 0n) return 'SUCCEEDED';
  if (totalRefundedMinor >= paymentAmountMinor) return 'REFUNDED';
  return 'PARTIALLY_REFUNDED';
}

/**
 * Un pedido pasa a `REFUNDED` solo cuando lo reembolsado cubre lo pagado; si es
 * un reembolso parcial conserva su estado actual (p. ej. `PAID`).
 */
export function nextOrderRefundStatus(
  currentStatus: OrderStatus,
  paidMinor: bigint,
  refundedMinor: bigint,
): OrderStatus {
  if (paidMinor > 0n && refundedMinor >= paidMinor) return 'REFUNDED';
  return currentStatus;
}
