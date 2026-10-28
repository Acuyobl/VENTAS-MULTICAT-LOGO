export interface ReconciliationCsvRow {
  orderNumber: string;
  date: string;
  method: string;
  provider: string;
  amountMinor: string;
  status: string;
  reference: string | null;
}

const HEADER = ['pedido', 'fecha', 'metodo', 'proveedor', 'monto_minor', 'estado', 'referencia'];

function escapeCell(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/** CSV (RFC 4180) de conciliación: cabecera + filas + totales al final. */
export function buildReconciliationCsv(
  rows: ReconciliationCsvRow[],
  totals: { registeredMinor: string; refundedMinor: string; netMinor: string },
): string {
  const lines = [HEADER.join(',')];
  for (const row of rows) {
    lines.push(
      [
        escapeCell(row.orderNumber),
        escapeCell(row.date),
        escapeCell(row.method),
        escapeCell(row.provider),
        escapeCell(row.amountMinor),
        escapeCell(row.status),
        escapeCell(row.reference ?? ''),
      ].join(','),
    );
  }
  lines.push(['TOTAL', '', '', '', escapeCell(totals.registeredMinor), '', ''].join(','));
  lines.push(['REEMBOLSADO', '', '', '', escapeCell(totals.refundedMinor), '', ''].join(','));
  lines.push(['NETO', '', '', '', escapeCell(totals.netMinor), '', ''].join(','));
  return `${lines.join('\r\n')}\r\n`;
}
