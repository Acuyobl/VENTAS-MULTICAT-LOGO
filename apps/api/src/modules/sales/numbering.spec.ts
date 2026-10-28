import { describe, expect, it } from 'vitest';
import {
  businessNumberLockKey,
  businessYear,
  formatBusinessNumber,
  formatOrderNumber,
  formatQuoteNumber,
  numberPrefix,
  parseBusinessNumber,
} from './numbering';

describe('numeración de documentos', () => {
  it('formatea cotización y pedido con ceros a la izquierda', () => {
    expect(formatQuoteNumber(2026, 1)).toBe('COT-2026-000001');
    expect(formatQuoteNumber(2026, 42)).toBe('COT-2026-000042');
    expect(formatOrderNumber(2026, 7)).toBe('PED-2026-000007');
  });

  it('no trunca la secuencia al pasar de 999 999', () => {
    expect(formatQuoteNumber(2026, 1_000_001)).toBe('COT-2026-1000001');
  });

  it('rechaza año o secuencia inválidos', () => {
    expect(() => formatBusinessNumber('COT', 1999, 1)).toThrow('invalid_business_year');
    expect(() => formatBusinessNumber('COT', 2026, 0)).toThrow('invalid_business_sequence');
    expect(() => formatBusinessNumber('COT', 2026, 1.5)).toThrow('invalid_business_sequence');
  });

  it('parsea un número y valida el año', () => {
    expect(parseBusinessNumber('COT-2026-000001', 'COT')).toEqual({ year: 2026, sequence: 1 });
    expect(parseBusinessNumber('COT-2026-000001', 'COT', 2026)).toEqual({
      year: 2026,
      sequence: 1,
    });
    expect(parseBusinessNumber('COT-2025-000001', 'COT', 2026)).toBeNull();
    expect(parseBusinessNumber('PED-2026-000001', 'COT')).toBeNull();
    expect(parseBusinessNumber('COT-2026-ABC', 'COT')).toBeNull();
  });

  it('el año comercial usa la zona de Costa Rica (UTC-6)', () => {
    // 2027-01-01T03:00Z = 2026-12-31 21:00 en Costa Rica.
    expect(businessYear(new Date('2027-01-01T03:00:00Z'))).toBe(2026);
    // 2027-01-01T07:00Z = 2027-01-01 01:00 en Costa Rica.
    expect(businessYear(new Date('2027-01-01T07:00:00Z'))).toBe(2027);
  });

  it('construye prefijo y clave de advisory lock estables', () => {
    expect(numberPrefix('COT', 2026)).toBe('COT-2026-');
    expect(businessNumberLockKey('quote', 'org-1', 2026)).toBe('business_number:quote:org-1:2026');
    expect(businessNumberLockKey('order', 'org-1', 2026)).not.toBe(
      businessNumberLockKey('quote', 'org-1', 2026),
    );
  });
});
