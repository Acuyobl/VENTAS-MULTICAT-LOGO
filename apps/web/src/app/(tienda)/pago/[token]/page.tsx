import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { PublicPaymentLink } from '@ventascatalogo/contracts';
import { ApiError, apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { SandboxPayButton } from '@/components/store/sandbox-pay-button';

export const metadata: Metadata = {
  title: 'Pagar pedido',
};

export const dynamic = 'force-dynamic';

interface PayPageProps {
  params: Promise<{ token: string }>;
}

async function loadLink(token: string): Promise<{ link: PublicPaymentLink | null; expired: boolean }> {
  try {
    const link = await apiFetch<PublicPaymentLink>(
      `/payments/public/link/${encodeURIComponent(token)}`,
      { authenticated: false },
    );
    return { link, expired: false };
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) notFound();
    if (caught instanceof ApiError && caught.status === 409) return { link: null, expired: true };
    throw caught;
  }
}

export default async function PayPage({ params }: PayPageProps) {
  const { token } = await params;
  const { link, expired } = await loadLink(token);

  if (expired || !link) {
    return (
      <section className="catalog-section">
        <div className="empty">
          <span className="empty__mark">∅</span>
          <h3>Este link de pago expiró</h3>
          <p>Pedile al negocio que genere uno nuevo desde el pedido.</p>
          <Link className="btn" href="/tienda">
            Volver a la tienda
          </Link>
        </div>
      </section>
    );
  }

  const alreadyPaid = link.status === 'USED';

  return (
    <section className="catalog-section">
      <div className="catalog-section__head">
        <div className="stack" style={{ gap: '0.35rem' }}>
          <span className="eyebrow">Pago del pedido</span>
          <h2>
            {link.order.orderNumber} <em>/</em> {formatMoney(link.amountMinor, link.currency)}
          </h2>
          <p>
            {link.order.customerName} · vence {link.expiresAt.slice(0, 10)} ·{' '}
            {link.provider === 'SANDBOX' ? 'pasarela de prueba' : link.provider}
          </p>
        </div>
      </div>

      <div className="cart-layout">
        <div className="panel">
          <div className="panel__head">
            <h2>Resumen</h2>
            <span className="badge">{link.order.status}</span>
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
                {link.order.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="table__primary">
                        <strong>{item.nameSnapshot}</strong>
                        <span>{item.skuSnapshot}</span>
                      </span>
                    </td>
                    <td className="table__num">{item.quantity}</td>
                    <td className="table__num">
                      {formatMoney(item.lineTotalMinor, link.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel__foot">
            Total del pedido {formatMoney(link.order.totalMinor, link.currency)} · IVA{' '}
            {formatMoney(link.order.taxMinor, link.currency)}
          </div>
        </div>

        <aside className="cart-summary">
          <h3>Pagar</h3>
          <dl className="kv">
            <dt>Monto del link</dt>
            <dd>
              <strong>{formatMoney(link.amountMinor, link.currency)}</strong>
            </dd>
            <dt>Estado del link</dt>
            <dd>{alreadyPaid ? 'Usado' : 'Activo'}</dd>
          </dl>

          {alreadyPaid ? (
            <div className="alert alert--ok">Este link ya fue usado. El pago está registrado.</div>
          ) : link.provider === 'SANDBOX' ? (
            <SandboxPayButton
              token={token}
              amountLabel={formatMoney(link.amountMinor, link.currency)}
            />
          ) : (
            <p className="mono faint" style={{ fontSize: '0.72rem' }}>
              Esta pasarela se abre en su propio sitio seguro.
            </p>
          )}

          <Link className="btn btn--ghost" href="/mi-cuenta/pedidos">
            Ver mis pedidos
          </Link>
        </aside>
      </div>
    </section>
  );
}
