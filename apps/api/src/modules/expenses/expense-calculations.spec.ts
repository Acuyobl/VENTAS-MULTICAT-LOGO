import { describe, expect, it } from 'vitest';
import { aggregateExpenses, computeProfit, maskSecret } from './expense-calculations';

describe('aggregateExpenses', () => {
  it('suma montos e impuestos y agrupa por categoría', () => {
    const totals = aggregateExpenses([
      { category: 'MARKETING', amountMinor: 20_000n, taxMinor: 0n },
      { category: 'TRANSPORTE', amountMinor: 8_500n, taxMinor: 500n },
      { category: 'MARKETING', amountMinor: 5_000n, taxMinor: 0n },
      { category: 'INSUMOS', amountMinor: 12_000n, taxMinor: 0n },
    ]);

    expect(totals.count).toBe(4);
    expect(totals.amountMinor).toBe(45_500n);
    expect(totals.taxMinor).toBe(500n);
    expect(totals.byCategory).toEqual([
      { category: 'MARKETING', count: 2, amountMinor: 25_000n },
      { category: 'INSUMOS', count: 1, amountMinor: 12_000n },
      { category: 'TRANSPORTE', count: 1, amountMinor: 8_500n },
    ]);
  });

  it('lista vacía devuelve ceros', () => {
    expect(aggregateExpenses([])).toEqual({
      count: 0,
      amountMinor: 0n,
      taxMinor: 0n,
      byCategory: [],
    });
  });
});

describe('computeProfit', () => {
  it('utilidad = neto − reembolsos − gastos y margen en puntos base', () => {
    const result = computeProfit({
      netMinor: 100_000n,
      refundedMinor: 10_000n,
      expensesMinor: 40_000n,
    });
    expect(result.profitMinor).toBe(50_000n);
    expect(result.marginBp).toBe(5_000);
  });

  it('sin ingresos el margen es 0 aunque la utilidad sea negativa', () => {
    const result = computeProfit({
      netMinor: 0n,
      refundedMinor: 0n,
      expensesMinor: 12_000n,
    });
    expect(result.profitMinor).toBe(-12_000n);
    expect(result.marginBp).toBe(0);
  });

  it('redondea el margen al punto base más cercano', () => {
    const result = computeProfit({
      netMinor: 3n,
      refundedMinor: 0n,
      expensesMinor: 2n,
    });
    expect(result.profitMinor).toBe(1n);
    expect(result.marginBp).toBe(3_333);
  });
});

describe('maskSecret', () => {
  it('deja visibles solo los últimos 4 caracteres', () => {
    expect(maskSecret('sk_live_123456789')).toBe('****6789');
    expect(maskSecret('corta')).toBe('****orta');
    expect(maskSecret('   ')).toBe('****');
  });
});
