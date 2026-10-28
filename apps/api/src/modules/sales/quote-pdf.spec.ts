import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildQuotePdf, pdfSafeText, type QuotePdfData } from './quote-pdf';

/**
 * pdf-lib escribe los textos como cadenas hex (`<436F74…>`) dentro de los content
 * streams, que van comprimidos con FlateDecode. Para verificar el contenido se
 * inflan los streams de texto y se decodifican las cadenas hex en cp1252.
 */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const textStreams: string[] = [];
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
    if (content.includes('BT')) textStreams.push(content);
    index = end + 'endstream'.length;
  }

  const decoded: string[] = [];
  for (const content of textStreams) {
    for (const match of content.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const hex = match[1] ?? '';
      if (hex.length % 2 !== 0) continue;
      decoded.push(Buffer.from(hex, 'hex').toString('latin1'));
    }
  }
  return decoded.join(' ').replace(/\u00a0/g, ' ');
}

function quoteData(overrides: Partial<QuotePdfData> = {}): QuotePdfData {
  return {
    number: 'COT-2026-000001',
    organizationName: 'Organización Demo',
    customerName: 'María Solís Vega',
    customerEmail: 'maria.solis@ventascatalogo.local',
    customerPhone: '+506 8888-1111',
    currency: 'CRC',
    createdAt: new Date('2026-10-28T15:00:00Z'),
    validUntil: new Date('2026-11-12T15:00:00Z'),
    items: [
      {
        sku: 'DEMO-001',
        name: 'Café de altura',
        quantity: 2,
        unitPriceMinor: 11_300n,
        discountMinor: 0n,
        lineTotalMinor: 22_600n,
      },
    ],
    subtotalMinor: 20_000n,
    discountMinor: 0n,
    taxMinor: 2_600n,
    totalMinor: 22_600n,
    taxRateBp: 1300,
    taxIncluded: true,
    notes: 'Pago a 30 días. Documento de prueba.',
    ...overrides,
  };
}

describe('pdfSafeText', () => {
  it('reemplaza el colón ₡ (fuera de WinAnsi) por el código ISO', () => {
    expect(pdfSafeText('₡ 11.300')).toBe('CRC 11.300');
    expect(pdfSafeText('Cotización ñandú')).toBe('Cotización ñandú');
    expect(pdfSafeText('emoji 🙂')).toBe('emoji ?');
  });
});

describe('buildQuotePdf', () => {
  it('genera un PDF A4 real con número, cliente, ítems y totales', async () => {
    const bytes = await buildQuotePdf(quoteData());
    const buffer = Buffer.from(bytes);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1_000);

    const text = extractPdfText(buffer);
    expect(text).toContain('COT-2026-000001');
    expect(text).toContain('COTIZACIÓN');
    expect(text).toContain('Organización Demo');
    expect(text).toContain('María Solís Vega');
    expect(text).toContain('Café de altura');
    expect(text).toContain('DEMO-001');
    expect(text).toContain('Documento no fiscal');
    expect(text).toContain('CRC 22 600');
    expect(text).toContain('IVA incluido');
    expect(text).toContain('Pago a 30 días');

    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const { width, height } = document.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it('agrega páginas y repite la cabecera cuando hay muchos ítems', async () => {
    const items = Array.from({ length: 45 }, (_, index) => ({
      sku: `SKU-${String(index + 1).padStart(3, '0')}`,
      name: `Producto de prueba número ${index + 1}`,
      quantity: 1,
      unitPriceMinor: 1_000n,
      discountMinor: 0n,
      lineTotalMinor: 1_000n,
    }));

    const bytes = await buildQuotePdf(quoteData({ items }));
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);

    const text = extractPdfText(Buffer.from(bytes));
    expect(text).toContain('Producto de prueba número 45');
  });

  it('soporta USD, descuentos y notas largas sin romper el PDF', async () => {
    const bytes = await buildQuotePdf(
      quoteData({
        currency: 'USD',
        subtotalMinor: 1_999n,
        taxMinor: 0n,
        totalMinor: 1_999n,
        discountMinor: 500n,
        notes:
          'Nota muy larga que debería recortarse para no desbordar el pie del documento. '.repeat(
            4,
          ),
      }),
    );
    const text = extractPdfText(Buffer.from(bytes));
    expect(text).toContain('USD');
    expect(text).toContain('Descuento');
    expect(text).toContain('Documento no fiscal');
    await expect(PDFDocument.load(bytes)).resolves.toBeDefined();
  });
});
