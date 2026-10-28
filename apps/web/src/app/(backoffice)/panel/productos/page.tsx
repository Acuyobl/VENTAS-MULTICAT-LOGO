import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, tryApiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { CatalogSummary, ProductSummary } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Productos',
};

export const dynamic = 'force-dynamic';

interface ProductsPageProps {
  searchParams: Promise<{ catalogo?: string }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const catalogs = await tryApiFetch<{ items: CatalogSummary[] }>('/catalogs');
  const items = catalogs?.items ?? [];
  const selected = items.find((catalog) => catalog.id === params.catalogo) ?? items[0] ?? null;

  let products: ProductSummary[] = [];
  let loadError: string | null = null;
  if (selected) {
    try {
      const page = await apiFetch<{ items: ProductSummary[]; nextCursor: string | null }>(
        '/products?limit=50',
        { headers: { 'X-Catalog-Id': selected.id } },
      );
      products = page.items;
    } catch (caught) {
      loadError = caught instanceof Error ? caught.message : 'No pudimos leer los productos.';
    }
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Productos · versión activa</span>
          <h1 className="display">
            El estante <em>real</em>.
          </h1>
          <p>
            {selected
              ? `Leyendo ${selected.name} · versión ${selected.activeVersionNumber ?? '—'} · ${selected.currency}.`
              : 'Elegí un catálogo para ver sus productos.'}
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{products.length}</strong>
          <span>productos en esta página</span>
        </div>
      </header>

      {items.length > 1 ? (
        <div className="filter-row" style={{ marginBottom: '1.2rem' }}>
          {items.map((catalog) => (
            <Link
              className="filter-chip"
              data-active={catalog.id === selected?.id}
              href={`/panel/productos?catalogo=${catalog.id}`}
              key={catalog.id}
            >
              {catalog.name} · {catalog.productCount}
            </Link>
          ))}
        </div>
      ) : null}

      <section className="panel">
        <div className="panel__head">
          <h2>{selected?.name ?? 'Sin catálogo'}</h2>
          <span className="mono faint">
            {selected ? `X-Catalog-Id ${selected.id.slice(0, 8)}…` : '—'}
          </span>
        </div>

        {loadError ? (
          <div className="panel__body">
            <div className="alert">{loadError}</div>
          </div>
        ) : products.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Precio</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="table__num">{product.sku}</td>
                    <td>
                      <span className="table__primary">
                        <strong>{product.name}</strong>
                        <span>{product.description ?? 'Sin descripción'}</span>
                      </span>
                    </td>
                    <td>
                      <span className="badge">{product.category ?? 'General'}</span>
                    </td>
                    <td className="table__num">
                      {formatMoney(product.priceMinor, product.currency)}
                    </td>
                    <td className="table__num">{product.stock ?? '∞'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>No hay productos para mostrar</h3>
            <p>
              {selected
                ? 'La versión activa está vacía o el catálogo no tiene una versión publicada. Corré el seed para cargar los 12 productos demo.'
                : 'Primero necesitás un catálogo con una versión activa.'}
            </p>
          </div>
        )}

        <div className="panel__foot">
          Paginación por cursor lista para F1 · límite 50 en esta vista.
        </div>
      </section>
    </div>
  );
}
