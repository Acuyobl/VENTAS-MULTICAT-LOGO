import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { OrderSummary } from '@ventascatalogo/contracts';
import { ApiError, apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Detalle del pedido',
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

interface OrderDetailPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function CustomerOrderPage({ params }: OrderDetailPageProps) {
  const { orderId } = await params;
  const user = await getSession();
  if (!user || user.audience !== 'customer') {
    redirect(`/mi-cuenta/entrar?next=${encodeURIComponent(`/mi-cuenta/pedidos/${orderId}`)}`);
  }

  let order: OrderSummary;
  try {
    order = await apiFetch<OrderSummary>(`/me/orders/${encodeURIComponent(orderId)}`);
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) notFound();
    throw caught;
  }

  return (
    <section className="stack">
      <span className="eyebrow">Pedido · {order.number}</span>
      <h1 className="portal__title display">
        {STATUS_LABEL[order.status] ?? order.status}.
      </h1>
      <p className="portal__lead">
        Creado el {order.createdAt.slice(0, 10)} · {order.items?.length ?? 0} productos · total{' '}
        {formatMoney(order.totalMinor, order.currency)}.
      </p>

      <div className="panel">
        <div className="panel__head">
          <h2>Productos</h2>
          <span className="badge">{STATUS_LABEL[order.status] ?? order.status}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(order.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="table__primary">
                      <strong>{item.nameSnapshot}</strong>
                      <span>{item.skuSnapshot}</span>
                    </span>
                  </td>
                  <td className="table__num">{item.quantity}</td>
                  <td className="table__num">
                    {formatMoney(item.unitPriceMinor, order.currency)}
                  </td>
                  <td className="table__num">{formatMoney(item.lineTotalMinor, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel__foot">
          Pagado: {formatMoney(order.paidMinor, order.currency)} · Subtotal{' '}
          {formatMoney(order.subtotalMinor, order.currency)} · IVA{' '}
          {formatMoney(order.taxMinor, order.currency)}
        </div>
      </div>

      <Link className="btn btn--ghost" href="/mi-cuenta/pedidos">
        ← Todos mis pedidos
      </Link>
    </section>
  );
}
