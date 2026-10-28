import { describe, expect, it } from 'vitest';
import { AppException } from '../../common/errors/app-exception';
import {
  assertPaymentWithinBalance,
  computePaymentProgress,
  isPaymentLinkExpired,
  orderBalanceMinor,
} from './payment-calculations';

describe('payment-calculations', () => {
  it('calcula saldo y estado pendiente/parcial/pagado', () => {
    expect(orderBalanceMinor(22_600n, 0n)).toBe(22_600n);
    expect(computePaymentProgress(22_600n, 0n)).toEqual({
      paidMinor: 0n,
      balanceMinor: 22_600n,
      status: 'PENDING_PAYMENT',
    });
    expect(computePaymentProgress(22_600n, 10_000n)).toEqual({
      paidMinor: 10_000n,
      balanceMinor: 12_600n,
      status: 'PARTIALLY_PAID',
    });
    expect(computePaymentProgress(22_600n, 22_600n)).toEqual({
      paidMinor: 22_600n,
      balanceMinor: 0n,
      status: 'PAID',
    });
  });

  it('el saldo nunca es negativo', () => {
    expect(orderBalanceMinor(10_000n, 12_000n)).toBe(0n);
  });

  it('permite igualar el saldo y rechaza sobrepago con 422', () => {
    expect(() => assertPaymentWithinBalance(22_600n, 10_000n, 12_600n)).not.toThrow();

    const error = (() => {
      try {
        assertPaymentWithinBalance(22_600n, 10_000n, 12_601n);
      } catch (caught) {
        return caught;
      }
      return null;
    })();

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('VALIDATION_FAILED');
    expect((error as AppException).getStatus()).toBe(422);
    expect((error as AppException).getResponse()).toMatchObject({
      details: { reason: 'payment_exceeds_balance', balanceMinor: '12600' },
    });
  });

  it('detecta la expiración del link de pago', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    expect(isPaymentLinkExpired(new Date('2026-01-01T11:59:59.000Z'), now)).toBe(true);
    expect(isPaymentLinkExpired(new Date('2026-01-01T12:00:01.000Z'), now)).toBe(false);
    expect(isPaymentLinkExpired(new Date('2026-01-01T12:00:00.000Z'), now)).toBe(true);
  });
});
