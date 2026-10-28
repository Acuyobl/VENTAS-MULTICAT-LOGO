import type { Metadata } from 'next';
import type { OrderListResponse, QuoteListResponse } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import type { CatalogSummary } from '@/lib/types';
import { SalesBoard } from '@/components/backoffice/sales-board';

export const metadata: Metadata = {
  title: 'Cotizaciones',
};

export const dynamic = 'force-dynamic';

export default async function QuotesPage() {
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
          <span className="eyebrow">Ventas · cotizaciones y pedidos</span>
          <h1 className="display">
            Cotizar es <em>prometer</em>.
          </h1>
          <p>
            Cada cotización congela el precio de la versión activa del catálogo y genera un PDF
            compartible. Convertirla crea el pedido sin recapturar nada.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{catalogItems.length}</strong>
          <span>catálogos disponibles para cotizar</span>
        </div>
      </header>

      <SalesBoard
        mode="quotes"
        catalogs={catalogItems}
        initialQuotes={quotes ?? { items: [], nextCursor: null }}
        initialOrders={orders ?? { items: [], nextCursor: null }}
      />
    </div>
  );
}
