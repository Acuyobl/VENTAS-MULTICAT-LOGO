'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ExpenseListResponse, ExpenseSummary } from '@ventascatalogo/contracts';
import type { CatalogSummary } from '@/lib/types';
import { formatMoney } from '@/lib/format';

interface ExpensesPanelProps {
  catalogs: CatalogSummary[];
  initial: ExpenseListResponse;
}

const CATEGORIES = [
  'INSUMOS',
  'TRANSPORTE',
  'SERVICIOS',
  'MARKETING',
  'PLANILLA',
  'IMPUESTOS',
  'OTROS',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  INSUMOS: 'Insumos',
  TRANSPORTE: 'Transporte',
  SERVICIOS: 'Servicios',
  MARKETING: 'Marketing',
  PLANILLA: 'Planilla',
  IMPUESTOS: 'Impuestos',
  OTROS: 'Otros',
};

export function ExpensesPanel({ catalogs, initial }: ExpensesPanelProps) {
  const [catalogId, setCatalogId] = useState(catalogs[0]?.id ?? '');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('INSUMOS');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('CRC');
  const [incurredAt, setIncurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('SINPE');
  const [from, setFrom] = useState(initial.items[0]?.incurredAt.slice(0, 10) ?? '');
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ExpenseListResponse>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (queryFrom: string, queryTo: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (queryFrom) params.set('from', queryFrom);
      if (queryTo) params.set('to', queryTo);
      const response = await fetch(`/api/v1/expenses?${params.toString()}`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'No pudimos cargar los gastos.');
      }
      setData((await response.json()) as ExpenseListResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('', '');
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numeric = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('El monto debe ser mayor que cero.');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const factor = currency === 'USD' ? 100 : 1;
      const response = await fetch('/api/v1/expenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalogId,
          category,
          description: description.trim(),
          amountMinor: String(Math.round(numeric * factor)),
          currency,
          incurredAt: new Date(`${incurredAt}T12:00:00-06:00`).toISOString(),
          ...(paymentMethod.trim() ? { paymentMethod: paymentMethod.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        ExpenseSummary | { message?: string } | null;
      if (!response.ok) {
        throw new Error((payload as { message?: string } | null)?.message ?? 'No pudimos guardar.');
      }
      setDescription('');
      setAmount('');
      setNotice('Gasto registrado.');
      await load(from, to);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function remove(expense: ExpenseSummary) {
    if (!window.confirm(`¿Borrar el gasto "${expense.description}"?`)) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/expenses/${expense.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'No pudimos borrar el gasto.');
      }
      setNotice('Gasto eliminado.');
      await load(from, to);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bo-grid">
      <section className="panel">
        <div className="panel__head">
          <h2>Registrar gasto</h2>
          <span className="mono faint">expense:write</span>
        </div>
        <form className="panel__body form-grid" onSubmit={create}>
          <label className="field">
            <span className="field__label">Catálogo</span>
            <select
              className="select"
              value={catalogId}
              onChange={(event) => setCatalogId(event.target.value)}
            >
              {catalogs.map((catalog) => (
                <option key={catalog.id} value={catalog.id}>
                  {catalog.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field">
              <span className="field__label">Categoría</span>
              <select
                className="select"
                value={category}
                onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {CATEGORY_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Fecha</span>
              <input
                className="input"
                type="date"
                value={incurredAt}
                onChange={(event) => setIncurredAt(event.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span className="field__label">Descripción</span>
            <input
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Compra de insumos, flete, publicidad…"
              required
              minLength={3}
              maxLength={200}
            />
          </label>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 6rem' }}>
            <label className="field">
              <span className="field__label">Monto</span>
              <input
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field__label">Moneda</span>
              <select
                className="select"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as 'CRC' | 'USD')}
              >
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field__label">Método de pago</span>
            <select
              className="select"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              <option value="SINPE">SINPE</option>
              <option value="TRANSFER">Transferencia</option>
              <option value="CASH">Efectivo</option>
              <option value="CARD">Tarjeta</option>
            </select>
          </label>

          {error ? <div className="alert">{error}</div> : null}
          {notice ? <div className="alert alert--ok">{notice}</div> : null}

          <button type="submit" className="btn btn--wide" disabled={loading || !catalogId}>
            {loading ? 'Guardando…' : 'Registrar gasto'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Gastos del rango</h2>
          <span className="mono faint">
            {data.totals.count} · {formatMoney(data.totals.amountMinor, 'CRC')}
          </span>
        </div>
        <div className="panel__body">
          <form
            className="filter-row"
            onSubmit={(event) => {
              event.preventDefault();
              void load(from, to);
            }}
          >
            <label className="field" style={{ maxWidth: '10rem' }}>
              <span className="field__label">Desde</span>
              <input
                className="input"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="field" style={{ maxWidth: '10rem' }}>
              <span className="field__label">Hasta</span>
              <input
                className="input"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <button className="btn btn--small" type="submit" disabled={loading}>
              Filtrar
            </button>
          </form>

          {data.totals.byCategory.length > 0 ? (
            <p className="mono faint" style={{ fontSize: '0.72rem', marginTop: '0.6rem' }}>
              {data.totals.byCategory
                .map(
                  (row) =>
                    `${CATEGORY_LABEL[row.category] ?? row.category}: ${formatMoney(row.amountMinor, 'CRC')}`,
                )
                .join(' · ')}
            </p>
          ) : null}
        </div>

        {data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((expense) => (
                  <tr key={expense.id}>
                    <td className="mono faint">{expense.incurredAt.slice(0, 10)}</td>
                    <td>{CATEGORY_LABEL[expense.category] ?? expense.category}</td>
                    <td>{expense.description}</td>
                    <td className="table__num">
                      {formatMoney(expense.amountMinor, expense.currency)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="thumb-remove"
                        disabled={loading}
                        onClick={() => void remove(expense)}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>Sin gastos en el rango</h3>
            <p>Registrá el primero con el formulario.</p>
          </div>
        )}
        <div className="panel__foot">
          Los gastos se suman al reporte de utilidad y se pueden exportar con la conciliación.
        </div>
      </section>
    </div>
  );
}
