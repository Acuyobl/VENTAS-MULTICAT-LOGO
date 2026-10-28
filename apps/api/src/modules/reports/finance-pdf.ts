import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  formatMoney,
  type Currency,
  type FinanceReport,
  type ProfitReport,
  type ReconciliationReport,
} from '@ventascatalogo/contracts';
import { pdfSafeText } from '../sales/quote-pdf';

export interface FinancePdfData {
  organizationName: string;
  finance: FinanceReport;
  profit: ProfitReport;
  reconciliation: ReconciliationReport;
}

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const LINE = 16;
const MAX_TABLE_ROWS = 50;

const BLACK = rgb(0.09, 0.12, 0.16);
const GRAY = rgb(0.42, 0.46, 0.52);
const ACCENT = rgb(0.06, 0.36, 0.53);
const LIGHT = rgb(0.93, 0.95, 0.97);

function money(amountMinor: string, currency: Currency): string {
  return pdfSafeText(formatMoney(BigInt(amountMinor), currency));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Costa_Rica',
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** Construye el PDF financiero A4 (resumen, pagos, reembolsos, gastos y conciliación). */
export async function buildFinancePdf(data: FinancePdfData): Promise<Uint8Array> {
  const { finance, profit, reconciliation } = data;
  const currency = finance.currency;
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const left = MARGIN;
  const right = PAGE_WIDTH - MARGIN;

  const ensureSpace = (needed = LINE): void => {
    if (y - needed < MARGIN) {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const text = (
    value: string,
    x: number,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ): void => {
    page.drawText(pdfSafeText(value), {
      x,
      y,
      size: options.size ?? 10,
      font: options.font ?? regular,
      color: options.color ?? BLACK,
    });
  };

  const textRight = (
    value: string,
    xRight: number,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ): void => {
    const font = options.font ?? regular;
    const size = options.size ?? 10;
    const safe = pdfSafeText(value);
    page.drawText(safe, {
      x: xRight - font.widthOfTextAtSize(safe, size),
      y,
      size,
      font,
      color: options.color ?? BLACK,
    });
  };

  const section = (title: string): void => {
    ensureSpace(LINE * 2);
    y -= 8;
    page.drawRectangle({
      x: left,
      y: y - 4,
      width: right - left,
      height: 18,
      color: LIGHT,
    });
    text(title, left + 6, { size: 11, font: bold, color: ACCENT });
    y -= LINE;
  };

  const row = (label: string, value: string): void => {
    ensureSpace();
    text(label, left + 6, { size: 10 });
    textRight(value, right - 6, { size: 10 });
    y -= LINE;
  };

  const columns = (
    values: [string, string, string, string, string],
    options: { header?: boolean; rightX?: number } = {},
  ): void => {
    ensureSpace();
    const fontSize = options.header ? 8.5 : 8.5;
    const font = options.header ? bold : regular;
    const safe = values.map((value) => pdfSafeText(value));
    page.drawText(safe[0]!, { x: left + 6, y, size: fontSize, font, color: GRAY });
    page.drawText(safe[1]!, { x: left + 112, y, size: fontSize, font, color: GRAY });
    page.drawText(safe[2]!, { x: left + 214, y, size: fontSize, font, color: GRAY });
    page.drawText(safe[3]!, { x: left + 330, y, size: fontSize, font, color: GRAY });
    const amountFont = options.header ? bold : regular;
    page.drawText(safe[4]!, {
      x: (options.rightX ?? right - 6) - amountFont.widthOfTextAtSize(safe[4]!, fontSize),
      y,
      size: fontSize,
      font: amountFont,
      color: options.header ? GRAY : BLACK,
    });
    y -= options.header ? LINE : LINE - 2;
  };

  // Cabecera
  text(data.organizationName, left, { size: 16, font: bold });
  textRight('REPORTE FINANCIERO', right, { size: 18, font: bold, color: ACCENT });
  y -= 22;
  text(`Rango: ${formatDate(finance.range.from)} al ${formatDate(finance.range.to)}`, left, {
    size: 10,
    color: GRAY,
  });
  y -= LINE;
  text(`Moneda: ${currency}`, left, { size: 10, color: GRAY });
  y -= LINE;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1,
    color: ACCENT,
  });

  // Ventas
  section('Ventas');
  row('Pedidos', String(finance.sales.orders));
  row('Bruto', money(finance.sales.grossMinor, currency));
  row('Descuentos', money(finance.sales.discountMinor, currency));
  row('IVA', money(finance.sales.taxMinor, currency));
  row('Neto', money(finance.sales.netMinor, currency));
  row('Cobrado', money(finance.sales.paidMinor, currency));
  row('Reembolsado', money(finance.sales.refundedMinor, currency));

  // Pagos por método
  section('Pagos por método');
  columns(['Método', 'Cantidad', '', '', 'Total'], { header: true });
  for (const payment of finance.payments.byMethod) {
    columns([payment.method, String(payment.count), '', '', money(payment.totalMinor, currency)]);
  }
  columns(
    ['Total', String(finance.payments.count), '', '', money(finance.payments.totalMinor, currency)],
    {
      header: true,
    },
  );

  // Reembolsos
  section('Reembolsos');
  row(
    'Solicitados',
    `${finance.refunds.requestedCount} · ${money(finance.refunds.requestedMinor, currency)}`,
  );
  row(
    'Procesados',
    `${finance.refunds.processedCount} · ${money(finance.refunds.processedMinor, currency)}`,
  );

  // Gastos y utilidad
  section('Gastos y utilidad');
  row('Gastos', money(profit.expenses.totalMinor, currency));
  row('IVA de gastos', money(profit.expenses.taxMinor, currency));
  row('Utilidad', money(profit.profitMinor, currency));
  row('Margen', `${(profit.marginBp / 100).toFixed(2)}%`);

  // Conciliación
  section('Conciliación de pagos');
  columns(['Fecha', 'Pedido', 'Método', 'Estado', 'Monto'], { header: true });
  const rows = reconciliation.rows.slice(0, MAX_TABLE_ROWS);
  for (const item of rows) {
    columns([
      formatDate(item.date.slice(0, 10)),
      item.orderNumber || '—',
      item.method,
      item.status,
      money(item.amountMinor, currency),
    ]);
  }
  columns(
    [
      'Totales',
      `${reconciliation.totals.count} pagos`,
      '',
      '',
      money(reconciliation.totals.netMinor, currency),
    ],
    {
      header: true,
    },
  );
  if (reconciliation.rows.length > MAX_TABLE_ROWS) {
    ensureSpace();
    text(
      `Se muestran ${MAX_TABLE_ROWS} de ${reconciliation.rows.length} movimientos; el resto está en el CSV.`,
      left + 6,
      { size: 8, color: GRAY },
    );
    y -= LINE;
  }

  ensureSpace(LINE * 2);
  y -= 8;
  text('Documento generado por VentasCatálogo. Montos en la moneda de la organización.', left, {
    size: 8,
    color: GRAY,
  });

  return document.save();
}

export function financePdfFilename(from: string, to: string): string {
  return `reporte-financiero-${from}-${to}.pdf`;
}
