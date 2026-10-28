'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/store/cart-provider';
import { formatMoney } from '@/lib/format';
import type { StorefrontCheckoutResponse } from '@ventascatalogo/contracts';

export default function CheckoutPage() {
  const { cart, hydrated, subtotalMinor, clear } = useCart();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/storefront/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalogSlug: cart.catalogSlug,
          items: cart.items.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
          customer: {
            fullName: fullName.trim(),
            ...(phone.trim() ? { phone: phone.trim() } : {}),
            ...(email.trim() ? { email: email.trim() } : {}),
          },
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | StorefrontCheckoutResponse
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ?? 'No pudimos crear el pedido.',
        );
      }
      const result = payload as StorefrontCheckoutResponse;
      clear();
      router.push(`/pedido/${encodeURIComponent(result.token)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return (
      <section className="catalog-section">
        <p className="mono faint">Cargando…</p>
      </section>
    );
  }

  if (cart.items.length === 0) {
    return (
      <section className="catalog-section">
        <div className="empty">
          <span className="empty__mark">∅</span>
          <h3>No hay nada para pagar todavía</h3>
          <p>Agregá productos al carrito antes de continuar.</p>
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
          <span className="eyebrow">Checkout · invitado</span>
          <h2>
            Casi <em>listo</em>.
          </h2>
        </div>
      </div>

      <form className="cart-layout" onSubmit={submit}>
        <div className="panel">
          <div className="panel__head">
            <h2>Tus datos</h2>
            <span className="mono faint">Sin crear cuenta</span>
          </div>
          <div className="panel__body form-grid">
            <label className="field">
              <span className="field__label">Nombre completo</span>
              <input
                className="input"
                required
                minLength={2}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="María Fernández"
              />
            </label>
            <label className="field">
              <span className="field__label">Teléfono</span>
              <input
                className="input"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+506 8888 8888"
              />
            </label>
            <label className="field">
              <span className="field__label">Correo (para reclamar el pedido)</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vos@correo.com"
              />
            </label>
            <label className="field">
              <span className="field__label">Notas para el negocio</span>
              <input
                className="input"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Entrega, dirección, referencias…"
              />
            </label>

            {error ? <div className="alert">{error}</div> : null}

            <button className="btn btn--wide" type="submit" disabled={loading}>
              {loading ? 'Creando pedido…' : 'Confirmar pedido'}
            </button>
            <p className="mono faint" style={{ fontSize: '0.72rem' }}>
              No se cobra en este paso: el pedido queda «por cobrar» y el negocio envía el link de
              pago. Se guarda un enlace privado para que consultes el estado.
            </p>
          </div>
        </div>

        <aside className="cart-summary">
          <h3>Tu pedido</h3>
          <ul className="cart-summary__lines">
            {cart.items.map((line) => (
              <li key={line.productId}>
                <span>
                  {line.quantity} × {line.name}
                </span>
                <span>{formatMoney(BigInt(line.priceMinor) * BigInt(line.quantity), line.currency)}</span>
              </li>
            ))}
          </ul>
          <dl className="kv">
            <dt>Suma de líneas</dt>
            <dd>{formatMoney(subtotalMinor, cart.currency)}</dd>
            <dt>IVA</dt>
            <dd>Lo calcula el servidor</dd>
          </dl>
          <Link className="btn btn--ghost" href="/carrito">
            ← Volver al carrito
          </Link>
        </aside>
      </form>
    </section>
  );
}
