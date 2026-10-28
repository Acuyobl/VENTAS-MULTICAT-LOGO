import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { FinanceReport, ProfitReport, ReconciliationReport } from '@ventascatalogo/contracts';
import { buildFinancePdf, financePdfFilename, type FinancePdfData } from './finance-pdf';

/** Extrae texto de los content streams (mismo helper que quote-pdf.spec). */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const parts: string[] = [];
  let index = 0;
  while (true) {
    const start = raw.indexOf('stream', index);
    if (start === -1) break;
    let dataStart = start + 'stream'.length;
    if (raw[dataStart] === '\r') dataStart += 1;
    if (raw[dataStart] === '\n') dataStart += 1;
    const end = raw.indexOf('endstream', dataStart);
    if (end === -1) break;
    const chunk = buffer.subarray(dataStart, end);
    let content: string;
    try {
      content = inflateSync(chunk).toString('latin1');
    } catch {
      content = chunk.toString('latin1');
    }
    if (content.includes('BT')) parts.push(content);
    index = end + 'endstream'.length;
  }
  const decoded: string[] = [];
  for (const part of parts) {
    for (const match of part.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const hex = match[1] ?? '';
      if (hex.length % 2 === 0) decoded.push(Buffer.from(hex, 'hex').toString('latin1'));
    }
  }
  return decoded.join(' ').replace(/\u00a0/g, ' ');
}

function finance(): FinanceReport {
  return {
    range: { from: '2026-10-01', to: '2026-10-31' },
    currency: 'CRC',
    sales: {
      orders: 3,
      byStatus: { PAID: 2, FULFILLED: 1 },
      grossMinor: '30000',
      discountMinor: '1000',
      taxMinor: '3900',
      netMinor: '29000',
      paidMinor: '29000',
      refundedMinor: '0',
    },
    payments: {
      count: 2,
      totalMinor: '29000',
      byMethod: [{ method: 'SANDBOX', count: 2, totalMinor: '29000' }],
    },
    refunds: { requestedCount: 1, processedCount: 0, requestedMinor: '5000', processedMinor: '0' },
    receivables: {
      openOrders: 1,
      openBalanceMinor: '29000',
      overdueOrders: 0,
      overdueBalanceMinor: '0',
    },
    topProducts: [],
  };
}

function profit(): ProfitReport {
  return {
    range: { from: '2026-10-01', to: '2026-10-31' },
    currency: 'CRC',
    income: { netMinor: '29000', grossMinor: '30000', taxMinor: '3900', refundedMinor: '0' },
    expenses: { totalMinor: '9000', taxMinor: '0', count: 2, byCategory: [] },
    profitMinor: '20000',
    marginBp: 6896,
  };
}

function reconciliation(rows = 2): ReconciliationReport {
  return {
    range: { from: '2026-10-01', to: '2026-10-31' },
    currency: 'CRC',
    rows: Array.from({ length: rows }, (_, index) => ({
      paymentId: `01920000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
      orderNumber: `PED-2026-${String(index + 1).padStart(6, '0')}`,
      date: '2026-10-15T12:00:00.000Z',
      method: 'SANDBOX',
      provider: 'SANDBOX',
      amountMinor: '14500',
      status: 'CONFIRMED',
      reference: null,
    })),
    totals: {
      count: rows,
      registeredMinor: String(rows * 14500),
      refundedMinor: '0',
      netMinor: String(rows * 14500),
    },
  };
}

function data(overrides: Partial<FinancePdfData> = {}): FinancePdfData {
  return {
    organizationName: 'Ferretería Central',
    finance: finance(),
    profit: profit(),
    reconciliation: reconciliation(),
    ...overrides,
  };
}

describe('financePdfFilename', () => {
  it('usa el rango en el nombre', () => {
    expect(financePdfFilename('2026-10-01', '2026-10-31')).toBe(
      'reporte-financiero-2026-10-01-2026-10-31.pdf',
    );
  });
});

describe('buildFinancePdf', () => {
  it('genera un PDF A4 con las secciones del reporte', async () => {
    const bytes = await buildFinancePdf(data());
    const buffer = Buffer.from(bytes);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const { width, height } = document.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);

    const text = extractPdfText(buffer);
    expect(text).toContain('REPORTE FINANCIERO');
    expect(text).toContain('Ferretería Central');
    expect(text).toContain('Ventas');
    expect(text).toContain('Pagos por método');
    expect(text).toContain('Reembolsos');
    expect(text).toContain('Gastos y utilidad');
    expect(text).toContain('Conciliación de pagos');
    expect(text).toContain('Utilidad');
    expect(text).toContain('CRC 20 000');
    expect(text).toContain('PED-2026-000001');
    expect(text).toContain('68.96%');
  });

  it('pagina la conciliación cuando supera 50 filas y avisa del recorte', async () => {
    const bytes = await buildFinancePdf(data({ reconciliation: reconciliation(60) }));
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
    const text = extractPdfText(Buffer.from(bytes));
    expect(text).toContain('Se muestran 50 de 60 movimientos');
  });
});
