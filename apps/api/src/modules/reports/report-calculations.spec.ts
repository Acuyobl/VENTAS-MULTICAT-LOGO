import { describe, expect, it } from 'vitest';
import { buildTopProducts, computeOrderTotals, computeReceivables } from './report-calculations';

const baseRow = {
  totalMinor: 11_300n,
  subtotalMinor: 10_000n,
  discountMinor: 0n,
  taxMinor: 1_300n,
  paidMinor: 11_300n,
  refundedMinor: 0n,
};

describe('computeOrderTotals', () => {
  it('suma montos y agrupa pedidos por estado', () => {
    const totals = computeOrderTotals([
      { ...baseRow, status: 'PAID' },
      {
        ...baseRow,
        status: 'PAID',
        totalMinor: 5_000n,
        subtotalMinor: 5_000n,
        taxMinor: 0n,
        paidMinor: 5_000n,
      },
      { ...baseRow, status: 'PENDING_PAYMENT', paidMinor: 0n },
    ]);

    expect(totals.orders).toBe(3);
    expect(totals.byStatus).toEqual({ PAID: 2, PENDING_PAYMENT: 1 });
    expect(totals.netMinor).toBe(16_300n + 11_300n);
    expect(totals.grossMinor).toBe(totals.netMinor);
    expect(totals.paidMinor).toBe(16_300n);
    expect(totals.taxMinor).toBe(2_600n);
  });

  it('el bruto incluye el descuento: bruto = neto + descuento', () => {
    const totals = computeOrderTotals([
      { ...baseRow, status: 'PAID', discountMinor: 1_000n, totalMinor: 10_300n },
    ]);
    expect(totals.grossMinor).toBe(11_300n);
    expect(totals.discountMinor).toBe(1_000n);
    expect(totals.netMinor).toBe(10_300n);
  });
});

describe('computeReceivables', () => {
  const reference = new Date('2026-10-28T12:00:00.000Z');
  const daysAgo = (days: number) => new Date(reference.getTime() - days * 24 * 60 * 60 * 1000);

  it('suma saldo abierto y separa vencidas (>30 días)', () => {
    const receivables = computeReceivables(
      [
        { status: 'PENDING_PAYMENT', totalMinor: 11_300n, paidMinor: 0n, createdAt: daysAgo(2) },
        {
          status: 'PARTIALLY_PAID',
          totalMinor: 11_300n,
          paidMinor: 5_000n,
          createdAt: daysAgo(45),
        },
        { status: 'PAID', totalMinor: 11_300n, paidMinor: 11_300n, createdAt: daysAgo(60) },
        { status: 'CANCELLED', totalMinor: 11_300n, paidMinor: 0n, createdAt: daysAgo(90) },
      ],
      reference,
    );

    expect(receivables.openOrders).toBe(2);
    expect(receivables.openBalanceMinor).toBe(17_600n);
    expect(receivables.overdueOrders).toBe(1);
    expect(receivables.overdueBalanceMinor).toBe(6_300n);
  });

  it('el borde de 30 días no cuenta como vencido', () => {
    const receivables = computeReceivables(
      [{ status: 'PENDING_PAYMENT', totalMinor: 1_000n, paidMinor: 0n, createdAt: daysAgo(30) }],
      reference,
    );
    expect(receivables.overdueOrders).toBe(0);
  });
});

describe('buildTopProducts', () => {
  it('agrupa por producto y ordena por ingreso, con tope de 10', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      productId: `product-${index}`,
      name: `Producto ${index}`,
      quantity: index + 1,
      revenueMinor: BigInt((index + 1) * 100),
    }));
    rows.push({ productId: 'product-0', name: 'Producto 0', quantity: 5, revenueMinor: 5_000n });

    const top = buildTopProducts(rows);
    expect(top).toHaveLength(10);
    expect(top[0]).toEqual({
      productId: 'product-0',
      name: 'Producto 0',
      quantity: 6,
      revenueMinor: 5_100n,
    });
    expect(top.at(-1)!.revenueMinor >= 300n).toBe(true);
  });
});
