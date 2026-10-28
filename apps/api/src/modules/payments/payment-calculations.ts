import type { OrderStatus } from '@ventascatalogo/contracts';
import { AppException } from '../../common/errors/app-exception';

/** Estado de cobro derivado de los montos del pedido (nunca floats). */
export interface PaymentProgress {
  paidMinor: bigint;
  balanceMinor: bigint;
  status: Extract<OrderStatus, 'PENDING_PAYMENT' | 'PARTIALLY_PAID' | 'PAID'>;
}

export function orderBalanceMinor(totalMinor: bigint, paidMinor: bigint): bigint {
  const balance = totalMinor - paidMinor;
  return balance > 0n ? balance : 0n;
}

export function computePaymentProgress(totalMinor: bigint, paidMinor: bigint): PaymentProgress {
  const balanceMinor = orderBalanceMinor(totalMinor, paidMinor);
  if (totalMinor > 0n && paidMinor >= totalMinor) {
    return { paidMinor, balanceMinor, status: 'PAID' };
  }
  if (paidMinor > 0n) {
    return { paidMinor, balanceMinor, status: 'PARTIALLY_PAID' };
  }
  return { paidMinor, balanceMinor, status: 'PENDING_PAYMENT' };
}

/**
 * Regla de sobrepago (422): registrar un pago mayor al saldo pendiente se
 * rechaza; igualar el saldo sí se permite (queda `PAID`).
 */
export function assertPaymentWithinBalance(
  totalMinor: bigint,
  paidMinor: bigint,
  amountMinor: bigint,
): void {
  const balanceMinor = orderBalanceMinor(totalMinor, paidMinor);
  if (amountMinor > balanceMinor) {
    throw new AppException(
      'VALIDATION_FAILED',
      422,
      { reason: 'payment_exceeds_balance', balanceMinor: balanceMinor.toString() },
      'El pago supera el saldo pendiente del pedido.',
    );
  }
}

export function isPaymentLinkExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
