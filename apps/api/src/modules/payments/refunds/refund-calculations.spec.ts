import { describe, expect, it } from 'vitest';
import {
  nextOrderRefundStatus,
  nextPaymentRefundStatus,
  refundableMinor,
} from './refund-calculations';

describe('refund-calculations', () => {
  it('el disponible es el monto del pago menos los reembolsos procesados', () => {
    expect(refundableMinor(11_300n, 0n)).toBe(11_300n);
    expect(refundableMinor(11_300n, 5_000n)).toBe(6_300n);
    expect(refundableMinor(11_300n, 11_300n)).toBe(0n);
    expect(refundableMinor(11_300n, 13_000n)).toBe(0n);
  });

  it('el estado del pago pasa a parcial y luego a reembolsado', () => {
    expect(nextPaymentRefundStatus(11_300n, 0n)).toBe('SUCCEEDED');
    expect(nextPaymentRefundStatus(11_300n, 5_000n)).toBe('PARTIALLY_REFUNDED');
    expect(nextPaymentRefundStatus(11_300n, 11_300n)).toBe('REFUNDED');
    expect(nextPaymentRefundStatus(11_300n, 12_000n)).toBe('REFUNDED');
  });

  it('el pedido solo pasa a REFUNDED con el reembolso total', () => {
    expect(nextOrderRefundStatus('PAID', 11_300n, 5_000n)).toBe('PAID');
    expect(nextOrderRefundStatus('PAID', 11_300n, 11_300n)).toBe('REFUNDED');
    expect(nextOrderRefundStatus('PARTIALLY_PAID', 5_000n, 5_000n)).toBe('REFUNDED');
    // Sin pagos registrados no hay nada que reembolsar: conserva el estado.
    expect(nextOrderRefundStatus('PENDING_PAYMENT', 0n, 0n)).toBe('PENDING_PAYMENT');
  });
});
