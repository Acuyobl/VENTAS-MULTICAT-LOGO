import { describe, expect, it } from 'vitest';
import { buildReconciliationCsv } from './reconciliation-csv';

describe('buildReconciliationCsv', () => {
  it('incluye cabecera, filas y totales con CRLF', () => {
    const csv = buildReconciliationCsv(
      [
        {
          orderNumber: 'PED-2026-000001',
          date: '2026-10-28T18:00:00.000Z',
          method: 'TRANSFER',
          provider: 'CASH',
          amountMinor: '22600',
          status: 'SUCCEEDED',
          reference: 'REC-001',
        },
      ],
      { registeredMinor: '22600', refundedMinor: '0', netMinor: '22600' },
    );

    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('pedido,fecha,metodo,proveedor,monto_minor,estado,referencia');
    expect(lines[1]).toContain('PED-2026-000001');
    expect(lines[1]).toContain('REC-001');
    expect(lines.at(-3)).toBe('TOTAL,,,,22600,,');
    expect(lines.at(-2)).toBe('REEMBOLSADO,,,,0,,');
    expect(lines.at(-1)).toBe('NETO,,,,22600,,');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('escapa comas, comillas y saltos de línea', () => {
    const csv = buildReconciliationCsv(
      [
        {
          orderNumber: 'PED-1',
          date: '2026-10-28',
          method: 'CASH, "efectivo"',
          provider: 'CASH',
          amountMinor: '1000',
          status: 'SUCCEEDED',
          reference: 'linea1\nlinea2',
        },
      ],
      { registeredMinor: '1000', refundedMinor: '0', netMinor: '1000' },
    );
    expect(csv).toContain('"CASH, ""efectivo"""');
    expect(csv).toContain('"linea1\nlinea2"');
  });
});
