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

  const linesSummary = cart.items
    .map((line, idx) => {
      const unit = formatMoney(line.priceMinor, line.currency);
      const total = formatMoney(BigInt(line.priceMinor) * BigInt(line.quantity), line.currency);
      return `${idx + 1}. *${line.name}*\n   • Cantidad: ${line.quantity} unid. × ${unit}\n   • Subtotal: ${total}\n   • SKU: ${line.sku}`;
    })
    .join('\n\n');

  const totalQty = cart.items.reduce((total, line) => total + line.quantity, 0);
  const totalAmount = formatMoney(subtotalMinor, cart.currency);

  const waOrderMessage = encodeURIComponent(
    `¡Hola! Deseo realizar el siguiente pedido del catálogo *${cart.catalogName}*:\n\n` +
    `🛒 *RESUMEN DEL PEDIDO:*\n` +
    `${linesSummary}\n\n` +
    `────────────────────────\n` +
    `📦 *Total de artículos:* ${totalQty}\n` +
    `💰 *Subtotal estimado:* ${totalAmount}\n` +
    `────────────────────────\n\n` +
    `¿Podrían confirmarme la disponibilidad y los pasos para el pago y la entrega? ¡Muchas gracias!`
  );
  const waOrderUrl = `https://wa.me/?text=${waOrderMessage}`;

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
          <a
            href={waOrderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--whatsapp btn--wide"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.08l-.29-.17-3.12.82.83-3.04-.19-.3a8.17 8.17 0 0 1-1.25-4.47c0-4.54 3.7-8.23 8.24-8.23m4.52 11.63c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.01-1.24-.74-.66-1.25-1.48-1.39-1.73-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.18-.47-.3" />
            </svg>
            Pedir directo por WhatsApp
          </a>
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
