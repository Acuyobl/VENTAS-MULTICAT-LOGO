'use client';

import Link from 'next/link';
import { useCart } from '@/components/store/cart-provider';
import { formatMoney } from '@/lib/format';

export default function CartPage() {
  const { cart, hydrated, subtotalMinor, setQuantity, remove, clear } = useCart();

  if (!hydrated) {
    return (
      <section className="catalog-section">
        <p className="mono faint">Cargando carrito…</p>
      </section>
    );
  }

  if (cart.items.length === 0) {
    return (
      <section className="catalog-section">
        <div className="empty">
          <span className="empty__mark">∅</span>
          <h3>Tu carrito está vacío</h3>
          <p>Sumá productos del catálogo y volvé a esta página.</p>
          <Link className="btn" href="/tienda">
            Ver el catálogo
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="catalog-section">
      <div className="catalog-section__head">
        <div className="stack" style={{ gap: '0.35rem' }}>
          <span className="eyebrow">Carrito · {cart.catalogName}</span>
          <h2>
            Lo que estás <em>llevando</em>.
          </h2>
        </div>
        <button type="button" className="thumb-remove" onClick={clear}>
          Vaciar carrito
        </button>
      </div>

      <div className="cart-layout">
        <div className="cart-lines">
          {cart.items.map((line) => (
            <article className="cart-line" key={line.productId}>
              {line.imageUrl ? (
                <img className="thumb" src={line.imageUrl} alt={line.name} loading="lazy" />
              ) : (
                <span className="thumb thumb--empty" aria-hidden>
                  —
                </span>
              )}
              <div className="cart-line__body">
                <strong>{line.name}</strong>
                <span className="mono faint">{line.sku}</span>
              </div>
              <div className="cart-line__qty">
                <label className="mono faint" htmlFor={`qty-${line.productId}`}>
                  Cantidad
                </label>
                <input
                  id={`qty-${line.productId}`}
                  className="input"
                  type="number"
                  min={1}
                  max={999}
                  value={line.quantity}
                  onChange={(event) => setQuantity(line.productId, Number(event.target.value))}
                />
              </div>
              <span className="cart-line__price">
                {formatMoney(BigInt(line.priceMinor) * BigInt(line.quantity), line.currency)}
              </span>
              <button
                type="button"
                className="thumb-remove"
                onClick={() => remove(line.productId)}
                aria-label={`Quitar ${line.name}`}
              >
                Quitar
              </button>
            </article>
          ))}
        </div>

        <aside className="cart-summary">
          <h3>Resumen</h3>
          <dl className="kv">
            <dt>Productos</dt>
            <dd>{cart.items.reduce((total, line) => total + line.quantity, 0)}</dd>
            <dt>Suma de líneas</dt>
            <dd>{formatMoney(subtotalMinor, cart.currency)}</dd>
            <dt>IVA</dt>
            <dd>Se calcula al confirmar</dd>
          </dl>
          <p className="mono faint" style={{ fontSize: '0.72rem' }}>
            El precio final lo confirma el servidor con el IVA del catálogo.
          </p>
          <Link className="btn btn--wide" href="/checkout">
            Continuar al checkout
          </Link>
          <Link className="btn btn--ghost" href="/tienda">
            Seguir comprando
          </Link>
        </aside>
      </div>
    </section>
  );
}
