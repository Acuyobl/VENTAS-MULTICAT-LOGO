import { describe, expect, it } from 'vitest';
import { calculateTotals, formatMoney, toMinorAmount } from './money';

describe('money', () => {
  it('convierte CRC sin decimales', () => {
    expect(toMinorAmount('5000', 'CRC')).toBe(5000n);
    expect(toMinorAmount('5.000', 'CRC')).toBe(5000n);
    expect(toMinorAmount('1.234.567', 'CRC')).toBe(1234567n);
  });

  it('convierte CRC con decimales redondeando al colón', () => {
    expect(toMinorAmount('1.234,56', 'CRC')).toBe(1235n);
    expect(toMinorAmount('1.234,4', 'CRC')).toBe(1234n);
  });

  it('convierte USD a centavos', () => {
    expect(toMinorAmount('19.99', 'USD')).toBe(1999n);
    expect(toMinorAmount('19,9', 'USD')).toBe(1990n);
    expect(toMinorAmount('1,234.56', 'USD')).toBe(123456n);
    expect(toMinorAmount('1.234,56', 'USD')).toBe(123456n);
    expect(toMinorAmount('-19.99', 'USD')).toBe(-1999n);
  });

  it('calcula IVA 13% incluido por línea', () => {
    // Convención de docs/03 §3.4: con IVA incluido el subtotal es el neto (sin IVA)
    // y `totalMinor = subtotalMinor + taxMinor`.
    const totals = calculateTotals([{ unitPriceMinor: 11300n, quantity: 2 }], 1300, true);
    expect(totals.subtotalMinor).toBe(20000n);
    expect(totals.taxMinor).toBe(2600n);
    expect(totals.totalMinor).toBe(22600n);
  });

  it('calcula IVA 13% agregado y descuentos', () => {
    const totals = calculateTotals(
      [{ unitPriceMinor: 10000n, quantity: 1, discountMinor: 1000n }],
      1300,
      false,
    );
    // Convención adoptada: el descuento reduce la base imponible, por lo que el subtotal
    // es neto del descuento y `totalMinor = subtotalMinor + taxMinor`. El descuento se
    // informa aparte para el desglose del PDF.
    expect(totals.subtotalMinor).toBe(9000n);
    expect(totals.discountMinor).toBe(1000n);
    expect(totals.taxMinor).toBe(1170n);
    expect(totals.totalMinor).toBe(10170n);
  });

  it('formatea con código ISO para que el PDF no dependa de ₡', () => {
    expect(formatMoney(11300n, 'CRC')).toContain('CRC');
    expect(formatMoney(1999n, 'USD')).toContain('USD');
  });
});
