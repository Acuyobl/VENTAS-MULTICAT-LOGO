import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { OrderListResponse } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Mis pedidos',
};

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING_PAYMENT: 'Por cobrar',
  PARTIALLY_PAID: 'Abonada',
  PAID: 'Pagada',
  FULFILLED: 'Entregada',
  CANCELLED: 'Cancelada',
  REFUNDED: 'Reembolsada',
};

export default async function MyOrdersPage() {
  const user = await getSession();
  if (!user || user.audience !== 'customer') {
    redirect('/mi-cuenta/entrar?next=/mi-cuenta/pedidos');
  }

  const orders = await tryApiFetch<OrderListResponse>('/me/orders?limit=50');
  const items = orders?.items ?? [];

  return (
    <section className="stack">
      <span className="eyebrow">Portal de cliente · pedidos</span>
      <h1 className="portal__title display">
        Tus <em>pedidos</em>.
      </h1>
      <p className="portal__lead">
        Todo lo que compraste con {user.email}. Solo ves tus propios pedidos: el filtro se aplica en
        el repositorio, no en la pantalla.
      </p>

      {items.length > 0 ? (
        <div className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr key={order.id}>
                    <td className="table__num">
                      <strong>{order.number}</strong>
                    </td>
                    <td className="mono faint">{order.createdAt.slice(0, 10)}</td>
                    <td>
                      <span className="badge">{STATUS_LABEL[order.status] ?? order.status}</span>
                    </td>
                    <td className="table__num">{formatMoney(order.totalMinor, order.currency)}</td>
                    <td>
                      <Link
                        className="btn btn--small btn--ghost"
                        href={`/mi-cuenta/pedidos/${order.id}`}
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel__foot">Los pedidos hechos como invitado se vinculan con tu correo.</div>
        </div>
      ) : (
        <div className="empty">
          <span className="empty__mark">∅</span>
          <h3>Todavía no hay pedidos</h3>
          <p>Cuando compres, aparecerán acá con su estado y total.</p>
          <Link className="btn" href="/tienda">
            Ver el catálogo
          </Link>
        </div>
      )}

      <Link className="btn btn--ghost" href="/mi-cuenta">
        ← Volver a mi cuenta
      </Link>
    </section>
  );
}
