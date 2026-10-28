export interface ExpenseRow {
  category: string;
  amountMinor: bigint;
  taxMinor: bigint;
}

export interface ExpenseCategoryTotal {
  category: string;
  count: number;
  amountMinor: bigint;
}

export interface ExpenseTotals {
  count: number;
  amountMinor: bigint;
  taxMinor: bigint;
  byCategory: ExpenseCategoryTotal[];
}

/** Totales de gastos agrupados por categoría (sumas BigInt). */
export function aggregateExpenses(rows: ExpenseRow[]): ExpenseTotals {
  const totals: ExpenseTotals = {
    count: rows.length,
    amountMinor: 0n,
    taxMinor: 0n,
    byCategory: [],
  };
  const byCategory = new Map<string, ExpenseCategoryTotal>();
  for (const row of rows) {
    totals.amountMinor += row.amountMinor;
    totals.taxMinor += row.taxMinor;
    const current = byCategory.get(row.category) ?? {
      category: row.category,
      count: 0,
      amountMinor: 0n,
    };
    current.count += 1;
    current.amountMinor += row.amountMinor;
    byCategory.set(row.category, current);
  }
  totals.byCategory = [...byCategory.values()].sort((a, b) =>
    b.amountMinor === a.amountMinor
      ? a.category.localeCompare(b.category)
      : b.amountMinor > a.amountMinor
        ? 1
        : -1,
  );
  return totals;
}

export interface ProfitInput {
  netMinor: bigint;
  refundedMinor: bigint;
  expensesMinor: bigint;
}

export interface ProfitResult {
  profitMinor: bigint;
  /** Puntos base sobre el ingreso neto; 0 si no hay ingresos. */
  marginBp: number;
}

/** Utilidad = ingreso neto − reembolsos − gastos. */
export function computeProfit(input: ProfitInput): ProfitResult {
  const profitMinor = input.netMinor - input.refundedMinor - input.expensesMinor;
  let marginBp = 0;
  if (input.netMinor > 0n) {
    // round(profit / net * 10000) con aritmética entera (half-up).
    const numerator = profitMinor * 10_000n * 2n + input.netMinor;
    marginBp = Number(numerator / (2n * input.netMinor));
  }
  return { profitMinor, marginBp };
}

/** Enmascara un secreto dejando visibles solo los últimos 4 caracteres. */
export function maskSecret(plain: string): string {
  const trimmed = plain.trim();
  if (trimmed.length === 0) return '****';
  const visible = trimmed.slice(-4);
  return `****${visible}`;
}
