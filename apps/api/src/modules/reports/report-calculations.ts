export interface OrderTotalsRow {
  status: string;
  totalMinor: bigint;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  paidMinor: bigint;
  refundedMinor: bigint;
}

export interface OrderTotals {
  orders: number;
  byStatus: Record<string, number>;
  grossMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  netMinor: bigint;
  paidMinor: bigint;
  refundedMinor: bigint;
}

/** Totales de ventas del rango (sumas en BigInt, nunca floats). */
export function computeOrderTotals(rows: OrderTotalsRow[]): OrderTotals {
  const totals: OrderTotals = {
    orders: rows.length,
    byStatus: {},
    grossMinor: 0n,
    discountMinor: 0n,
    taxMinor: 0n,
    netMinor: 0n,
    paidMinor: 0n,
    refundedMinor: 0n,
  };
  for (const row of rows) {
    totals.byStatus[row.status] = (totals.byStatus[row.status] ?? 0) + 1;
    // Bruto = lo que costaría sin descuentos; neto = lo que paga el cliente.
    totals.grossMinor += row.totalMinor + row.discountMinor;
    totals.discountMinor += row.discountMinor;
    totals.taxMinor += row.taxMinor;
    totals.netMinor += row.totalMinor;
    totals.paidMinor += row.paidMinor;
    totals.refundedMinor += row.refundedMinor;
  }
  return totals;
}

export interface ReceivableRow {
  status: string;
  totalMinor: bigint;
  paidMinor: bigint;
  createdAt: Date;
}

export interface Receivables {
  openOrders: number;
  openBalanceMinor: bigint;
  overdueOrders: number;
  overdueBalanceMinor: bigint;
}

const NON_RECEIVABLE_STATUSES = new Set(['CANCELLED', 'REFUNDED']);
export const OVERDUE_DAYS = 30;

/**
 * Cuentas por cobrar a la fecha de corte: pedidos con saldo abierto (no
 * cancelados/reembolsados). Vencidas = creadas hace más de 30 días.
 */
export function computeReceivables(rows: ReceivableRow[], reference: Date): Receivables {
  const overdueBefore = new Date(reference.getTime() - OVERDUE_DAYS * 24 * 60 * 60 * 1000);
  const result: Receivables = {
    openOrders: 0,
    openBalanceMinor: 0n,
    overdueOrders: 0,
    overdueBalanceMinor: 0n,
  };
  for (const row of rows) {
    if (NON_RECEIVABLE_STATUSES.has(row.status)) continue;
    const balance = row.totalMinor - row.paidMinor;
    if (balance <= 0n) continue;
    result.openOrders += 1;
    result.openBalanceMinor += balance;
    if (row.createdAt.getTime() < overdueBefore.getTime()) {
      result.overdueOrders += 1;
      result.overdueBalanceMinor += balance;
    }
  }
  return result;
}

export interface ProductRevenueRow {
  productId: string;
  name: string;
  quantity: number;
  revenueMinor: bigint;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenueMinor: bigint;
}

/** Agrupa ítems por producto y devuelve el top 10 por ingreso. */
export function buildTopProducts(rows: ProductRevenueRow[], limit = 10): TopProduct[] {
  const grouped = new Map<string, TopProduct>();
  for (const row of rows) {
    const current = grouped.get(row.productId);
    if (current) {
      current.quantity += row.quantity;
      current.revenueMinor += row.revenueMinor;
    } else {
      grouped.set(row.productId, { ...row });
    }
  }
  return [...grouped.values()]
    .sort((a, b) => {
      if (b.revenueMinor === a.revenueMinor) return a.name.localeCompare(b.name);
      return b.revenueMinor > a.revenueMinor ? 1 : -1;
    })
    .slice(0, limit);
}
