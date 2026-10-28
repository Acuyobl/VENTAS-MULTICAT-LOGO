import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { StorefrontOrder } from '@ventascatalogo/contracts';
import { ApiError, apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatMoney } from '@/lib/format';
import { ClaimOrderButton } from '@/components/store/claim-order-button';

export const metadata: Metadata = {
  title: 'Tu pedido',
};

export const dynamic = 'force-dynamic';

interface OrderConfirmationPageProps {
  params: Promise<{ token: string }>;
}

async function loadOrder(token: string): Promise<{ order: StorefrontOrder | null; expired: boolean }> {
  try {
    const order = await apiFetch<StorefrontOrder>(
      `/storefront/orders/${encodeURIComponent(token)}`,
      { authenticated: false },
    );
    return { order, expired: false };
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) notFound();
    if (caught instanceof ApiError && caught.status === 409) return { order: null, expired: true };
    throw caught;
  }
}

export default async function OrderConfirmationPage({ params }: OrderConfirmationPageProps) {
  const { token } = await params;
  const { order, expired } = await loadOrder(token);
  const session = await getSession();
  const isCustomer = session?.audience === 'customer';

  if (expired || !order) {
    return (
      <section className="catalog-section">
        <div className="empty">
          <span className="empty__mark">∅</span>
          <h3>Este enlace de pedido venció</h3>
          <p>Pedile al negocio un enlace nuevo o consultá desde tu cuenta.</p>
          <Link className="btn" href="/mi-cuenta/entrar">
            Entrar a mi cuenta
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="catalog-section">
      <div className="catalog-section__head">
        <div className="stack" style={{ gap: '0.35rem' }}>
          <span className="eyebrow">Pedido confirmado</span>
          <h2>
            Gracias, <em>{order.customerName.split(' ')[0]}</em>.
          </h2>
          <p>
            Guardá este enlace: es tu comprobante de consulta. El negocio se pondrá en contacto para
            coordinar el pago y la entrega.
          </p>
        </div>
        <div className="store-hero__stamp">
          <span>Pedido</span>
          <strong>{order.orderNumber}</strong>
          <span>{order.status === 'PENDING_PAYMENT' ? 'por cobrar' : order.status}</span>
        </div>
      </div>

      <div className="cart-layout">
        <div className="panel">
          <div className="panel__head">
            <h2>Detalle</h2>
            <span className="mono faint">{order.createdAt.slice(0, 10)}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="table__primary">
                        <strong>{item.nameSnapshot}</strong>
                        <span>{item.skuSnapshot}</span>
                      </span>
                    </td>
                    <td className="table__num">{item.quantity}</td>
                    <td className="table__num">
                      {formatMoney(item.lineTotalMinor, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel__foot">
            {order.notes ? `Nota: ${order.notes}` : 'El pago y la entrega se coordinan por separado.'}
          </div>
        </div>

        <aside className="cart-summary">
          <h3>Totales</h3>
          <dl className="kv">
            <dt>Subtotal</dt>
            <dd>{formatMoney(order.subtotalMinor, order.currency)}</dd>
            <dt>Descuento</dt>
            <dd>{formatMoney(order.discountMinor, order.currency)}</dd>
            <dt>IVA</dt>
            <dd>{formatMoney(order.taxMinor, order.currency)}</dd>
            <dt>Total</dt>
            <dd>
              <strong>{formatMoney(order.totalMinor, order.currency)}</strong>
            </dd>
          </dl>

          {isCustomer ? (
            <ClaimOrderButton token={token} />
          ) : (
            <p className="mono faint" style={{ fontSize: '0.72rem' }}>
              ¿Querés verlo siempre?{' '}
              <Link href="/mi-cuenta/entrar">Entrá con el correo del pedido</Link> y vinculalo a tu
              cuenta.
            </p>
          )}

          <Link className="btn btn--ghost" href="/tienda">
            Seguir mirando
          </Link>
        </aside>
      </div>
    </section>
  );
}
