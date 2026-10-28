import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type {
  OrderSummary,
  PaymentListResponse,
  RefundListResponse,
} from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatMoney } from '@/lib/format';
import { OrderRefundsPanel } from '@/components/backoffice/order-refunds-panel';

export const metadata: Metadata = {
  title: 'Detalle del pedido',
};

export const dynamic = 'force-dynamic';

interface OrderDetailPageProps {
  params: Promise<{ orderId: string }>;
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

export default async function BackofficeOrderPage({ params }: OrderDetailPageProps) {
  const { orderId } = await params;
  const session = await getSession();
  if (!session || session.audience !== 'staff') {
    redirect(`/login?next=${encodeURIComponent(`/panel/pedidos/${orderId}`)}`);
  }

  const [order, payments, refunds] = await Promise.all([
    tryApiFetch<OrderSummary>(`/orders/${orderId}`),
    tryApiFetch<PaymentListResponse>(`/orders/${orderId}/payments`),
    tryApiFetch<RefundListResponse>(`/orders/${orderId}/refunds`),
  ]);
  if (!order) notFound();

  const canRequest =
    session.permissions.includes('payment:refund_request') ||
    session.permissions.includes('payment:write');
  const canApprove = session.permissions.includes('payment:refund_approve');
  const currency = order.currency;
  const refundedMinor = refunds?.refundedMinor ?? '0';
  const balanceMinor = payments?.balanceMinor ?? '0';

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Pedido · {order.number}</span>
          <h1 className="display">
            {STATUS_LABEL[order.status] ?? order.status}.
          </h1>
          <p>
            {order.customerName} · creado el {order.createdAt.slice(0, 10)} ·{' '}
            {order.items?.length ?? 0} productos.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{formatMoney(balanceMinor, currency)}</strong>
          <span>saldo pendiente</span>
        </div>
      </header>

      <div className="bo-grid">
        <section className="panel">
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
                  <th>Unitario</th>
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
                      {formatMoney(item.unitPriceMinor, currency)}
                    </td>
                    <td className="table__num">{formatMoney(item.lineTotalMinor, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel__foot">
            {order.notes ? `Nota: ${order.notes}` : 'Sin notas del pedido.'}
          </div>
        </section>

        <aside className="panel">
          <div className="panel__head">
            <h2>Saldos</h2>
          </div>
          <div className="panel__body">
            <dl className="kv">
              <dt>Total</dt>
              <dd>{formatMoney(order.totalMinor, currency)}</dd>
              <dt>Pagado</dt>
              <dd>{formatMoney(order.paidMinor, currency)}</dd>
              <dt>Reembolsado</dt>
              <dd>{formatMoney(refundedMinor, currency)}</dd>
              <dt>Saldo</dt>
              <dd>
                <strong>{formatMoney(balanceMinor, currency)}</strong>
              </dd>
              <dt>Subtotal / IVA</dt>
              <dd>
                {formatMoney(order.subtotalMinor, currency)} /{' '}
                {formatMoney(order.taxMinor, currency)}
              </dd>
            </dl>
            <Link className="btn btn--ghost" href="/panel/pedidos">
              ← Volver a pedidos
            </Link>
          </div>
        </aside>
      </div>

      <div style={{ marginTop: '1.2rem' }}>
        <OrderRefundsPanel
          orderNumber={order.number}
          currency={currency}
          payments={payments?.items ?? []}
          refunds={refunds?.items ?? []}
          canRequest={canRequest}
          canApprove={canApprove}
        />
      </div>
    </div>
  );
}
