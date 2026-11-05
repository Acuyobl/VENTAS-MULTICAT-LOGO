import type { Metadata } from 'next';
import type { OrderListResponse, QuoteListResponse } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import type { CatalogSummary } from '@/lib/types';
import { SalesBoard } from '@/components/backoffice/sales-board';

export const metadata: Metadata = {
  title: 'Pedidos',
};

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const [catalogs, quotes, orders] = await Promise.all([
    tryApiFetch<{ items: CatalogSummary[] }>('/catalogs'),
    tryApiFetch<QuoteListResponse>('/quotes?limit=20'),
    tryApiFetch<OrderListResponse>('/orders?limit=20'),
  ]);

  const catalogItems = catalogs?.items ?? [];

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Ventas · pedidos</span>
          <h1 className="display">
            Del sí al <em>papel</em>.
          </h1>
          <p>
            El pedido conserva los precios con los que se cotizó. Registrar la entrega y cancelar
            quedan auditados con su transición de estado.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{orders?.items.length ?? 0}</strong>
          <span>pedidos recientes</span>
        </div>
      </header>

      <SalesBoard
        mode="orders"
        catalogs={catalogItems}
        initialQuotes={quotes ?? { items: [], nextCursor: null }}
        initialOrders={orders ?? { items: [], nextCursor: null }}
      />
    </div>
  );
}
