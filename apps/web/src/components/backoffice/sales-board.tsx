'use client';

import { useEffect, useState } from 'react';
import type {
  CustomerSummary,
  OrderListResponse,
  OrderSummary,
  ProductListResponse,
  QuoteListResponse,
  QuoteSummary,
} from '@ventascatalogo/contracts';
import type { CatalogSummary } from '@/lib/types';
import { formatMoney } from '@/lib/format';

type Tab = 'quotes' | 'orders';

interface SalesBoardProps {
  mode: Tab;
  catalogs: CatalogSummary[];
  initialQuotes: QuoteListResponse;
  initialOrders: OrderListResponse;
}

interface DraftLine {
  productId: string;
  quantity: number;
}

const QUOTE_BADGE: Record<QuoteSummary['status'], string> = {
  DRAFT: 'badge',
  SENT: 'badge badge--warn',
  ACCEPTED: 'badge badge--ok',
  REJECTED: 'badge badge--danger',
  EXPIRED: 'badge badge--danger',
  CONVERTED: 'badge badge--ink',
};

const ORDER_BADGE: Record<OrderSummary['status'], string> = {
  DRAFT: 'badge',
  PENDING_PAYMENT: 'badge badge--warn',
  PARTIALLY_PAID: 'badge badge--warn',
  PAID: 'badge badge--ok',
  FULFILLED: 'badge badge--ok',
  CANCELLED: 'badge badge--danger',
  REFUNDED: 'badge badge--ink',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Expirada',
  CONVERTED: 'Convertida',
  PENDING_PAYMENT: 'Por cobrar',
  PARTIALLY_PAID: 'Abonada',
  PAID: 'Pagada',
  FULFILLED: 'Entregada',
  CANCELLED: 'Cancelada',
  REFUNDED: 'Reembolsada',
};

function defaultValidUntil(): string {
  const date = new Date();
  date.setDate(date.getDate() + 15);
  return date.toISOString().slice(0, 10);
}

export function SalesBoard({ mode, catalogs, initialQuotes, initialOrders }: SalesBoardProps) {
  const [tab, setTab] = useState<Tab>(mode);
  const [catalogId, setCatalogId] = useState(catalogs[0]?.id ?? '');
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [products, setProducts] = useState<ProductListResponse['items']>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [notes, setNotes] = useState('');
  const [quotes, setQuotes] = useState<QuoteSummary[]>(initialQuotes.items);
  const [orders, setOrders] = useState<OrderSummary[]>(initialOrders.items);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const extraHeaders = (init?.headers ?? {}) as Record<string, string>;
    const response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', accept: 'application/json', ...extraHeaders },
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; details?: unknown }
      | null;
    if (!response.ok) {
      throw new Error(payload?.message ?? `Error HTTP ${response.status}`);
    }
    return payload as T;
  }

  useEffect(() => {
    void (async () => {
      try {
        const page = await api<{ items: CustomerSummary[] }>('/customers?limit=50');
        setCustomers(page.items);
        if (page.items[0]) setCustomerId(page.items[0].id);
      } catch {
        setCustomers([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!catalogId) return;
    void (async () => {
      try {
        const page = await api<ProductListResponse>(`/products?catalogId=${catalogId}&limit=100`);
        setProducts(page.items);
        setSelectedProduct(page.items[0]?.id ?? '');
      } catch {
        setProducts([]);
      }
    })();
  }, [catalogId]);

  function addLine(productId: string) {
    if (!productId) return;
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) {
        return current.map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { productId, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, quantity: number) {
    setLines((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, quantity: Math.max(1, quantity) } : line,
      ),
    );
  }

  function removeLine(productId: string) {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }

  async function createCustomer() {
    if (customerName.trim().length < 2) {
      setError('El nombre del cliente debe tener al menos 2 caracteres.');
      return;
    }
    setBusy('customer');
    setError(null);
    try {
      const created = await api<CustomerSummary>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          fullName: customerName.trim(),
          ...(customerPhone.trim() ? { phone: customerPhone.trim() } : {}),
        }),
      });
      setCustomers((current) => [created, ...current]);
      setCustomerId(created.id);
      setCustomerName('');
      setCustomerPhone('');
      setNotice(`Cliente ${created.fullName} creado.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos crear el cliente.');
    } finally {
      setBusy(null);
    }
  }

  async function createQuote() {
    if (!catalogId || !customerId || lines.length === 0) {
      setError('Elegí catálogo, cliente y al menos un producto.');
      return;
    }
    setBusy('quote');
    setError(null);
    setNotice(null);
    try {
      const created = await api<QuoteSummary>('/quotes', {
        method: 'POST',
        body: JSON.stringify({
          catalogId,
          customerId,
          items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          validUntil: new Date(`${validUntil}T23:59:59-06:00`).toISOString(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      setQuotes((current) => [created, ...current]);
      setLines([]);
      setNotes('');
      setTab('quotes');
      setNotice(`Cotización ${created.number} creada por ${formatMoney(created.totalMinor, created.currency)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos crear la cotización.');
    } finally {
      setBusy(null);
    }
  }

  async function sendQuote(quote: QuoteSummary) {
    setBusy(`send-${quote.id}`);
    setError(null);
    try {
      const updated = await api<QuoteSummary>(`/quotes/${quote.id}/send`, { method: 'POST' });
      setQuotes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`Cotización ${updated.number} enviada${updated.pdfUrl ? ' con PDF' : ''}.`);
      if (updated.pdfUrl) window.open(updated.pdfUrl, '_blank', 'noopener');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos enviar la cotización.');
    } finally {
      setBusy(null);
    }
  }

  async function convertQuote(quote: QuoteSummary) {
    setBusy(`convert-${quote.id}`);
    setError(null);
    try {
      const order = await api<OrderSummary>(`/quotes/${quote.id}/convert`, { method: 'POST' });
      setOrders((current) => [order, ...current]);
      setQuotes((current) =>
        current.map((item) => (item.id === quote.id ? { ...item, status: 'CONVERTED' } : item)),
      );
      setTab('orders');
      setNotice(`Pedido ${order.number} creado desde ${quote.number}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos convertir la cotización.');
    } finally {
      setBusy(null);
    }
  }

  async function cancelOrder(order: OrderSummary) {
    const reason = window.prompt(`Motivo para cancelar ${order.number}:`);
    if (!reason || reason.trim().length < 3) return;
    setBusy(`cancel-${order.id}`);
    setError(null);
    try {
      const updated = await api<OrderSummary>(`/orders/${order.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`Pedido ${updated.number} cancelado.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos cancelar el pedido.');
    } finally {
      setBusy(null);
    }
  }

  async function fulfillOrder(order: OrderSummary) {
    setBusy(`fulfill-${order.id}`);
    setError(null);
    try {
      const updated = await api<OrderSummary>(`/orders/${order.id}/fulfill`, { method: 'POST' });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`Pedido ${updated.number} marcado como entregado.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos marcar la entrega.');
    } finally {
      setBusy(null);
    }
  }

  const selectedCatalog = catalogs.find((catalog) => catalog.id === catalogId) ?? null;
  const draftTotal = lines.reduce((sum, line) => {
    const product = products.find((item) => item.id === line.productId);
    return product ? sum + BigInt(product.priceMinor) * BigInt(line.quantity) : sum;
  }, 0n);

  return (
    <div>
      <div className="filter-row" style={{ marginBottom: '1.2rem' }}>
        <button
          type="button"
          className="filter-chip"
          data-active={tab === 'quotes'}
          onClick={() => setTab('quotes')}
        >
          Cotizaciones · {quotes.length}
        </button>
        <button
          type="button"
          className="filter-chip"
          data-active={tab === 'orders'}
          onClick={() => setTab('orders')}
        >
          Pedidos · {orders.length}
        </button>
      </div>

      <div aria-live="polite">
        {error ? <div className="alert">{error}</div> : null}
        {notice ? <div className="alert alert--ok">{notice}</div> : null}
      </div>

      {tab === 'quotes' ? (
        <div className="bo-grid">
          <section className="panel">
            <div className="panel__head">
              <div>
                <h2>Nueva cotización</h2>
                <p className="muted" style={{ fontSize: '0.8rem' }}>
                  Los precios se congelan desde la versión activa.
                </p>
              </div>
            </div>
            <div className="panel__body">
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">Catálogo</span>
                  <select
                    className="select"
                    value={catalogId}
                    onChange={(event) => setCatalogId(event.target.value)}
                  >
                    {catalogs.map((catalog) => (
                      <option key={catalog.id} value={catalog.id}>
                        {catalog.name} · v{catalog.activeVersionNumber ?? '—'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">Cliente</span>
                  <select
                    className="select"
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                  >
                    {customers.length === 0 ? <option value="">Sin clientes aún</option> : null}
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.fullName}
                        {customer.phone ? ` · ${customer.phone}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">Vigencia hasta</span>
                  <input
                    className="input"
                    type="date"
                    value={validUntil}
                    onChange={(event) => setValidUntil(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="field__label">Notas (opcional)</span>
                  <input
                    className="input"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Entrega, condiciones, referencias…"
                  />
                </label>
              </div>

              <div className="panel__body" style={{ paddingInline: 0 }}>
                <h3 style={{ marginBottom: '0.5rem' }}>Productos</h3>
                <div className="inline" style={{ gap: '0.5rem', alignItems: 'flex-end' }}>
                  <label className="field" style={{ flex: 1 }}>
                    <span className="field__label">Agregar del catálogo</span>
                    <select
                      className="select"
                      value={selectedProduct}
                      onChange={(event) => setSelectedProduct(event.target.value)}
                    >
                      {products.length === 0 ? <option value="">Sin productos</option> : null}
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.sku} · {product.name} · {formatMoney(product.priceMinor, product.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn--small btn--secondary"
                    onClick={() => addLine(selectedProduct)}
                    disabled={!selectedProduct}
                  >
                    Agregar
                  </button>
                </div>

                {lines.length > 0 ? (
                  <div className="table-wrap" style={{ marginTop: '0.8rem' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cantidad</th>
                          <th>Subtotal</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => {
                          const product = products.find((item) => item.id === line.productId);
                          if (!product) return null;
                          return (
                            <tr key={line.productId}>
                              <td>
                                <span className="table__primary">
                                  <strong>{product.name}</strong>
                                  <span>{product.sku}</span>
                                </span>
                              </td>
                              <td>
                                <input
                                  className="input"
                                  style={{ width: '5rem' }}
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={line.quantity}
                                  onChange={(event) =>
                                    changeQuantity(line.productId, Number(event.target.value))
                                  }
                                />
                              </td>
                              <td className="table__num">
                                {formatMoney(
                                  BigInt(product.priceMinor) * BigInt(line.quantity),
                                  product.currency,
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="thumb-remove"
                                  onClick={() => removeLine(line.productId)}
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mono faint" style={{ marginTop: '0.8rem' }}>
                    Todavía no agregaste productos.
                  </p>
                )}

                <p className="mono faint" style={{ marginTop: '0.8rem' }}>
                  {selectedCatalog
                    ? `${selectedCatalog.name} · precios con IVA ${selectedCatalog.currency}`
                    : 'Elegí un catálogo'}
                  {' · '}suma de líneas {formatMoney(draftTotal, selectedCatalog?.currency ?? 'CRC')}
                  {' · '}el IVA y el total se calculan en el servidor.
                </p>

                <button
                  type="button"
                  className="btn btn--wide"
                  disabled={busy !== null || lines.length === 0 || !customerId}
                  onClick={() => void createQuote()}
                >
                  {busy === 'quote' ? 'Creando…' : 'Crear cotización'}
                </button>
              </div>

              <details style={{ marginTop: '1rem' }}>
                <summary className="mono faint" style={{ cursor: 'pointer' }}>
                  Crear cliente rápido
                </summary>
                <div className="form-grid" style={{ marginTop: '0.6rem' }}>
                  <label className="field">
                    <span className="field__label">Nombre</span>
                    <input
                      className="input"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="María Fernández"
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Teléfono</span>
                    <input
                      className="input"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="+506 8888 8888"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn--small btn--secondary"
                    disabled={busy !== null}
                    onClick={() => void createCustomer()}
                  >
                    {busy === 'customer' ? 'Guardando…' : 'Guardar cliente'}
                  </button>
                </div>
              </details>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Cotizaciones</h2>
              <span className="mono faint">{quotes.length} registradas</span>
            </div>
            {quotes.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Cliente</th>
                      <th>Estado</th>
                      <th>Total</th>
                      <th>Vence</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((quote) => (
                      <tr key={quote.id}>
                        <td className="table__num">
                          <strong>{quote.number}</strong>
                        </td>
                        <td>{quote.customerName}</td>
                        <td>
                          <span className={QUOTE_BADGE[quote.status]}>
                            {STATUS_LABEL[quote.status] ?? quote.status}
                          </span>
                        </td>
                        <td className="table__num">
                          {formatMoney(quote.totalMinor, quote.currency)}
                        </td>
                        <td className="mono faint">{quote.validUntil.slice(0, 10)}</td>
                        <td>
                          <span className="inline" style={{ gap: '0.35rem' }}>
                            {quote.status === 'DRAFT' ? (
                              <button
                                type="button"
                                className="btn btn--small btn--secondary"
                                disabled={busy !== null}
                                onClick={() => void sendQuote(quote)}
                              >
                                {busy === `send-${quote.id}` ? 'Enviando…' : 'Enviar'}
                              </button>
                            ) : null}
                            {quote.pdfUrl ? (
                              <a
                                className="btn btn--small btn--ghost"
                                href={quote.pdfUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                PDF
                              </a>
                            ) : null}
                            {quote.status === 'SENT' || quote.status === 'ACCEPTED' ? (
                              <button
                                type="button"
                                className="btn btn--small"
                                disabled={busy !== null}
                                onClick={() => void convertQuote(quote)}
                              >
                                {busy === `convert-${quote.id}` ? 'Convirtiendo…' : 'A pedido'}
                              </button>
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <span className="empty__mark">∅</span>
                <h3>Sin cotizaciones</h3>
                <p>Creá la primera con el formulario de la izquierda.</p>
              </div>
            )}
            <div className="panel__foot">
              Cotizar no descuenta stock. El número es secuencial por organización y año.
            </div>
          </section>
        </div>
      ) : (
        <section className="panel">
          <div className="panel__head">
            <h2>Pedidos</h2>
            <span className="mono faint">{orders.length} registrados</span>
          </div>
          {orders.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Total</th>
                    <th>Pagado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="table__num">
                        <strong>{order.number}</strong>
                      </td>
                      <td>{order.customerName}</td>
                      <td>
                        <span className={ORDER_BADGE[order.status]}>
                          {STATUS_LABEL[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="table__num">{formatMoney(order.totalMinor, order.currency)}</td>
                      <td className="table__num">{formatMoney(order.paidMinor, order.currency)}</td>
                      <td>
                        <span className="inline" style={{ gap: '0.35rem' }}>
                          {order.status === 'PENDING_PAYMENT' ||
                          order.status === 'PARTIALLY_PAID' ||
                          order.status === 'PAID' ? (
                            <button
                              type="button"
                              className="btn btn--small btn--secondary"
                              disabled={busy !== null}
                              onClick={() => void fulfillOrder(order)}
                            >
                              {busy === `fulfill-${order.id}` ? 'Marcando…' : 'Entregar'}
                            </button>
                          ) : null}
                          {order.status !== 'CANCELLED' &&
                          order.status !== 'FULFILLED' &&
                          order.status !== 'REFUNDED' ? (
                            <button
                              type="button"
                              className="thumb-remove"
                              disabled={busy !== null}
                              onClick={() => void cancelOrder(order)}
                            >
                              Cancelar
                            </button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <span className="empty__mark">∅</span>
              <h3>Sin pedidos</h3>
              <p>Convertí una cotización o creá un pedido directo (siguiente incremento).</p>
            </div>
          )}
          <div className="panel__foot">
            El pedido copia los precios de la cotización y no se recalcula al cambiar de versión.
          </div>
        </section>
      )}
    </div>
  );
}
