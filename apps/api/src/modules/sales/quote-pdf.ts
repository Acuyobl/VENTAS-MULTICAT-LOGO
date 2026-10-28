import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatMoney, type Currency } from '@ventascatalogo/contracts';

export interface QuotePdfItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: bigint;
  discountMinor: bigint;
  lineTotalMinor: bigint;
}

export interface QuotePdfData {
  number: string;
  organizationName: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  currency: Currency;
  createdAt: Date;
  validUntil: Date;
  items: QuotePdfItem[];
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  taxRateBp: number;
  taxIncluded: boolean;
  notes?: string | null;
}

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

const BLACK = rgb(0.09, 0.12, 0.16);
const GRAY = rgb(0.42, 0.46, 0.52);
const ACCENT = rgb(0.06, 0.36, 0.53);
const LIGHT = rgb(0.93, 0.95, 0.97);

/**
 * Las fuentes estándar de PDF usan WinAnsi (cp1252). El colón costarricense `₡`
 * no existe ahí, así que los montos se imprimen con el código ISO (`CRC`) y
 * cualquier carácter fuera de cp1252 se reemplaza para que el PDF no falle.
 */
export function pdfSafeText(value: string): string {
  return [...value]
    .map((char) => {
      if (char === '\u20a1') return 'CRC';
      if (char === '\u202f' || char === '\u2009') return ' ';
      return /[^\x20-\x7E\u00A0-\u00FF]/.test(char) ? '?' : char;
    })
    .join('');
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Costa_Rica',
  }).format(value);
}

function formatMoneySafe(amountMinor: bigint, currency: Currency): string {
  return pdfSafeText(formatMoney(amountMinor, currency));
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  // Sanitizar ANTES de medir: `widthOfTextAtSize` también intenta codificar en
  // WinAnsi y falla con caracteres como ₡.
  const words = pdfSafeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Construye el PDF de una cotización (A4) con cabecera de la organización,
 * cliente, número, vencimiento, tabla de ítems y desglose Subtotal/IVA/Total.
 * Es un documento comercial: incluye la leyenda "Documento no fiscal".
 */
export async function buildQuotePdf(data: QuotePdfData): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const left = MARGIN;
  const right = PAGE_WIDTH - MARGIN;

  const text = (
    pageRef: PDFPage,
    value: string,
    x: number,
    yPos: number,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    pageRef.drawText(pdfSafeText(value), {
      x,
      y: yPos,
      size: options.size ?? 10,
      font: options.font ?? regular,
      color: options.color ?? BLACK,
    });
  };

  const textRight = (
    pageRef: PDFPage,
    value: string,
    xRight: number,
    yPos: number,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? 10;
    const safe = pdfSafeText(value);
    pageRef.drawText(safe, {
      x: xRight - font.widthOfTextAtSize(safe, size),
      y: yPos,
      size,
      font,
      color: options.color ?? BLACK,
    });
  };

  // Cabecera
  text(page, data.organizationName, left, y, { size: 16, font: bold });
  textRight(page, 'COTIZACIÓN', right, y, { size: 20, font: bold, color: ACCENT });
  y -= 14;
  text(page, `N.º ${data.number}`, left, y, { size: 11, color: GRAY });
  y -= 10;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1.2,
    color: ACCENT,
  });
  y -= 26;

  // Cliente y fechas
  text(page, 'CLIENTE', left, y, { size: 9, font: bold, color: GRAY });
  textRight(page, 'FECHAS', right, y, { size: 9, font: bold, color: GRAY });
  y -= 15;
  text(page, data.customerName, left, y, { size: 11, font: bold });
  textRight(page, `Emisión: ${formatDate(data.createdAt)}`, right, y, { size: 9 });
  y -= 14;
  const contact = [data.customerEmail, data.customerPhone].filter(Boolean).join('  ·  ');
  if (contact) text(page, contact, left, y, { size: 9, color: GRAY });
  textRight(page, `Válida hasta: ${formatDate(data.validUntil)}`, right, y, { size: 9 });
  y -= 28;

  // Tabla de ítems
  const columns = [
    { key: 'sku', label: 'SKU', width: 62, align: 'left' as const },
    { key: 'name', label: 'Producto', width: 168, align: 'left' as const },
    { key: 'quantity', label: 'Cant.', width: 36, align: 'right' as const },
    { key: 'unit', label: 'P. unitario', width: 84, align: 'right' as const },
    { key: 'discount', label: 'Descuento', width: 62, align: 'right' as const },
    { key: 'total', label: 'Total', width: 87, align: 'right' as const },
  ];

  const drawTableHeader = (target: PDFPage, headerY: number): number => {
    target.drawRectangle({
      x: left,
      y: headerY - 5,
      width: right - left,
      height: 18,
      color: LIGHT,
    });
    let x = left + 4;
    for (const column of columns) {
      if (column.align === 'right') {
        textRight(target, column.label, x + column.width - 4, headerY, {
          size: 8,
          font: bold,
          color: GRAY,
        });
      } else {
        text(target, column.label, x, headerY, { size: 8, font: bold, color: GRAY });
      }
      x += column.width;
    }
    return headerY - 20;
  };

  y = drawTableHeader(page, y);
  const rowsPerPage = 20;
  let rowCount = 0;
  let currentPage = page;

  for (const item of data.items) {
    if (rowCount >= rowsPerPage) {
      currentPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN - 10;
      text(currentPage, `${data.organizationName} · ${data.number}`, left, y, {
        size: 9,
        color: GRAY,
      });
      y -= 18;
      y = drawTableHeader(currentPage, y);
      rowCount = 0;
    }

    const cells: Record<string, string> = {
      sku: item.sku,
      name: wrapText(item.name, regular, 9, columns[1]!.width - 8)[0] ?? item.name,
      quantity: String(item.quantity),
      unit: formatMoneySafe(item.unitPriceMinor, data.currency),
      discount: item.discountMinor > 0n ? formatMoneySafe(item.discountMinor, data.currency) : '—',
      total: formatMoneySafe(item.lineTotalMinor, data.currency),
    };

    let x = left + 4;
    for (const column of columns) {
      const value = cells[column.key] ?? '';
      if (column.align === 'right') {
        textRight(currentPage, value, x + column.width - 4, y, { size: 9 });
      } else {
        text(currentPage, value, x, y, { size: 9 });
      }
      x += column.width;
    }

    y -= 16;
    rowCount += 1;
  }

  y -= 8;
  const lastPage = currentPage;
  lastPage.drawLine({
    start: { x: left, y: y + 6 },
    end: { x: right, y: y + 6 },
    thickness: 0.8,
    color: LIGHT,
  });
  y -= 6;

  // Desglose de totales (alineado a la derecha)
  const totalsLeft = right - 230;
  const taxLabel = data.taxIncluded
    ? `IVA incluido (${(data.taxRateBp / 100).toFixed(0)} %)`
    : `IVA (${(data.taxRateBp / 100).toFixed(0)} %)`;
  const totalRows: Array<[string, bigint, boolean]> = [['Subtotal', data.subtotalMinor, false]];
  if (data.discountMinor > 0n) totalRows.push(['Descuento', data.discountMinor, false]);
  totalRows.push([taxLabel, data.taxMinor, false]);
  totalRows.push(['Total', data.totalMinor, true]);

  for (const [label, amount, emphasized] of totalRows) {
    text(lastPage, label, totalsLeft, y, {
      size: emphasized ? 11 : 9,
      font: emphasized ? bold : regular,
      color: emphasized ? BLACK : GRAY,
    });
    textRight(lastPage, formatMoneySafe(amount, data.currency), right, y, {
      size: emphasized ? 12 : 9,
      font: emphasized ? bold : regular,
    });
    y -= emphasized ? 18 : 14;
  }

  if (data.notes) {
    y -= 8;
    text(lastPage, 'Notas', left, y, { size: 9, font: bold, color: GRAY });
    y -= 13;
    for (const line of wrapText(data.notes, regular, 9, right - left).slice(0, 4)) {
      text(lastPage, line, left, y, { size: 9 });
      y -= 12;
    }
  }

  // Pie
  const footerY = MARGIN - 18;
  for (const pageRef of document.getPages()) {
    text(pageRef, 'Documento no fiscal', left, footerY, { size: 9, color: GRAY });
    textRight(
      pageRef,
      `${data.number} · página ${document.getPages().indexOf(pageRef) + 1}`,
      right,
      footerY,
      {
        size: 8,
        color: GRAY,
      },
    );
  }

  return document.save();
}
