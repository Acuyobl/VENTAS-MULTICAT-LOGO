'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FinanceReport, ProfitReport, ReconciliationReport } from '@ventascatalogo/contracts';
import { formatMoney } from '@/lib/format';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoDate(from), to: isoDate(now) };
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING_PAYMENT: 'Por cobrar',
  PARTIALLY_PAID: 'Abonada',
  PAID: 'Pagada',
  FULFILLED: 'Entregada',
  CANCELLED: 'Cancelada',
  REFUNDED: 'Reembolsada',
};

export function FinanceReportView() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [finance, setFinance] = useState<FinanceReport | null>(null);
  const [profit, setProfit] = useState<ProfitReport | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (rangeFrom: string, rangeTo: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = `from=${rangeFrom}&to=${rangeTo}`;
      const [financeResponse, reconciliationResponse, profitResponse] = await Promise.all([
        fetch(`/api/v1/reports/finance?${query}`, { headers: { accept: 'application/json' } }),
        fetch(`/api/v1/reports/reconciliation?${query}`, { headers: { accept: 'application/json' } }),
        fetch(`/api/v1/reports/profit?${query}`, { headers: { accept: 'application/json' } }),
      ]);
      if (!financeResponse.ok || !reconciliationResponse.ok || !profitResponse.ok) {
        const payload = (await financeResponse.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? 'No pudimos cargar el reporte.');
      }
      setFinance((await financeResponse.json()) as FinanceReport);
      setReconciliation((await reconciliationResponse.json()) as ReconciliationReport);
      setProfit((await profitResponse.json()) as ProfitReport);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(initial.from, initial.to);
  }, [load, initial.from, initial.to]);

  const currency = finance?.currency ?? 'CRC';

  function exportCsv() {
    if (!reconciliation) return;
    const header = 'fecha,pedido,metodo,proveedor,referencia,monto,estado';
    const lines = reconciliation.rows.map((row) =>
      [
        row.date,
        row.orderNumber,
        row.method,
        row.provider,
        row.reference ?? '',
        row.amountMinor,
        row.status,
      ].join(','),
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `conciliacion-${from}-a-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack" style={{ gap: '1.2rem' }}>
      <form
        className="filter-row"
        onSubmit={(event) => {
          event.preventDefault();
          void load(from, to);
        }}
      >
        <label className="field" style={{ maxWidth: '12rem' }}>
          <span className="field__label">Desde</span>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field" style={{ maxWidth: '12rem' }}>
          <span className="field__label">Hasta</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" className="btn btn--small" disabled={loading}>
          {loading ? 'Calculando…' : 'Actualizar'}
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          onClick={exportCsv}
          disabled={!reconciliation}
        >
          Exportar conciliación CSV
        </button>
        <a
          className="btn btn--small btn--ghost"
          href={`/api/v1/reports/finance/export.csv?from=${from}&to=${to}`}
          target="_blank"
          rel="noreferrer"
        >
          Exportar desde el servidor
        </a>
        <a
          className="btn btn--small btn--ghost"
          href={`/api/v1/reports/finance/pdf?from=${from}&to=${to}`}
          target="_blank"
          rel="noreferrer"
        >
          Reporte PDF
        </a>
      </form>

      {error ? <div className="alert">{error}</div> : null}

      {profit ? (
        <section className="panel">
          <div className="panel__head">
            <h2>Utilidad del rango</h2>
            <span className="mono faint">{profit.marginBp / 100} % de margen</span>
          </div>
          <div className="metrics">
            <article className="metric">
              <span className="metric__label">Ingresos netos</span>
              <strong className="metric__value">
                {formatMoney(profit.income.netMinor, currency)}
              </strong>
              <span className="metric__hint">
                reembolsos {formatMoney(profit.income.refundedMinor, currency)}
              </span>
            </article>
            <article className="metric">
              <span className="metric__label">Gastos</span>
              <strong className="metric__value">
                {formatMoney(profit.expenses.totalMinor, currency)}
              </strong>
              <span className="metric__hint">{profit.expenses.count} registros</span>
            </article>
            <article className="metric">
              <span className="metric__label">Utilidad</span>
              <strong className="metric__value">
                {formatMoney(profit.profitMinor, currency)}
              </strong>
              <span className="metric__hint">ingresos − reembolsos − gastos</span>
            </article>
            <article className="metric">
              <span className="metric__label">Margen</span>
              <strong className="metric__value">{(profit.marginBp / 100).toFixed(1)} %</strong>
              <span className="metric__hint">sobre ingresos netos</span>
            </article>
          </div>
          {profit.expenses.byCategory.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Categoría de gasto</th>
                    <th>Registros</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {profit.expenses.byCategory.map((row) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td className="table__num">{row.count}</td>
                      <td className="table__num">{formatMoney(row.amountMinor, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {finance ? (
        <>
          <div className="metrics">
            <article className="metric">
              <span className="metric__label">Ventas netas</span>
              <strong className="metric__value">{formatMoney(finance.sales.netMinor, currency)}</strong>
              <span className="metric__hint">{finance.sales.orders} pedidos en el rango</span>
            </article>
            <article className="metric">
              <span className="metric__label">Cobrado</span>
              <strong className="metric__value">{formatMoney(finance.sales.paidMinor, currency)}</strong>
              <span className="metric__hint">{finance.payments.count} pagos registrados</span>
            </article>
            <article className="metric">
              <span className="metric__label">Reembolsado</span>
              <strong className="metric__value">
                {formatMoney(finance.refunds.processedMinor, currency)}
              </strong>
              <span className="metric__hint">
                {finance.refunds.processedCount} procesados · {finance.refunds.requestedCount}{' '}
                solicitados
              </span>
            </article>
            <article className="metric">
              <span className="metric__label">Por cobrar</span>
              <strong className="metric__value">
                {formatMoney(finance.receivables.openBalanceMinor, currency)}
              </strong>
              <span className="metric__hint">
                {finance.receivables.openOrders} pedidos · {finance.receivables.overdueOrders}{' '}
                vencidos ({formatMoney(finance.receivables.overdueBalanceMinor, currency)})
              </span>
            </article>
          </div>

          <div className="bo-grid">
            <section className="panel">
              <div className="panel__head">
                <h2>Pedidos por estado</h2>
                <span className="mono faint">{finance.range.from} → {finance.range.to}</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th>Pedidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(finance.sales.byStatus).map(([status, count]) => (
                      <tr key={status}>
                        <td>{STATUS_LABEL[status] ?? status}</td>
                        <td className="table__num">{count}</td>
                      </tr>
                    ))}
                    {Object.keys(finance.sales.byStatus).length === 0 ? (
                      <tr>
                        <td colSpan={2} className="mono faint">
                          Sin pedidos en el rango.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="panel__foot">
                Bruto {formatMoney(finance.sales.grossMinor, currency)} · descuentos{' '}
                {formatMoney(finance.sales.discountMinor, currency)} · IVA{' '}
                {formatMoney(finance.sales.taxMinor, currency)}
              </div>
            </section>

            <section className="panel">
              <div className="panel__head">
                <h2>Cobros por método</h2>
                <span className="mono faint">{formatMoney(finance.payments.totalMinor, currency)}</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Método</th>
                      <th>Pagos</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finance.payments.byMethod.map((row) => (
                      <tr key={row.method}>
                        <td>{row.method}</td>
                        <td className="table__num">{row.count}</td>
                        <td className="table__num">{formatMoney(row.totalMinor, currency)}</td>
                      </tr>
                    ))}
                    {finance.payments.byMethod.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="mono faint">
                          Sin pagos en el rango.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel__head">
              <h2>Top productos</h2>
              <span className="mono faint">por ingreso del rango</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {finance.topProducts.map((product) => (
                    <tr key={product.productId}>
                      <td>{product.name}</td>
                      <td className="table__num">{product.quantity}</td>
                      <td className="table__num">{formatMoney(product.revenueMinor, currency)}</td>
                    </tr>
                  ))}
                  {finance.topProducts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="mono faint">
                        Sin ventas pagadas en el rango.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {reconciliation ? (
        <section className="panel">
          <div className="panel__head">
            <h2>Conciliación</h2>
            <span className="mono faint">
              registrado {formatMoney(reconciliation.totals.registeredMinor, currency)} · reembolsado{' '}
              {formatMoney(reconciliation.totals.refundedMinor, currency)} · neto{' '}
              {formatMoney(reconciliation.totals.netMinor, currency)}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pedido</th>
                  <th>Método</th>
                  <th>Referencia</th>
                  <th>Monto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.rows.map((row) => (
                  <tr key={row.paymentId}>
                    <td className="mono faint">{row.date}</td>
                    <td className="table__num">{row.orderNumber}</td>
                    <td>{row.method}</td>
                    <td className="mono faint">{row.reference ?? '—'}</td>
                    <td className="table__num">{formatMoney(row.amountMinor, currency)}</td>
                    <td>
                      <span className="badge">{row.status}</span>
                    </td>
                  </tr>
                ))}
                {reconciliation.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="mono faint">
                      Sin pagos para conciliar en el rango.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="panel__foot">
            Cada fila es un pago confirmado; el neto descuenta los reembolsos procesados del rango.
          </div>
        </section>
      ) : null}
    </div>
  );
}
