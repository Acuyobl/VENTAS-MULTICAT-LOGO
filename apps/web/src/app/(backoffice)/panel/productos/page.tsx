import type { Metadata } from 'next';
import Link from 'next/link';
import type { CatalogVersionSummary, ProductListResponse } from '@ventascatalogo/contracts';
import { ApiError, apiFetch, tryApiFetch } from '@/lib/api';
import type { CatalogSummary } from '@/lib/types';
import { ProductsBrowser } from '@/components/backoffice/products-browser';

export const metadata: Metadata = {
  title: 'Productos',
};

export const dynamic = 'force-dynamic';

interface ProductsPageProps {
  searchParams: Promise<{ catalogo?: string; version?: string; q?: string; categoria?: string }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const catalogs = await tryApiFetch<{ items: CatalogSummary[] }>('/catalogs');
  const items = catalogs?.items ?? [];
  const selected = items.find((catalog) => catalog.id === params.catalogo) ?? items[0] ?? null;

  if (!selected) {
    return (
      <div>
        <header className="page-head">
          <div>
            <span className="eyebrow">Productos</span>
            <h1 className="display">
              El estante <em>real</em>.
            </h1>
            <p>Necesitás un catálogo con al menos una versión importada.</p>
          </div>
        </header>
        <div className="empty">
          <span className="empty__mark">∅</span>
          <h3>No hay catálogos visibles</h3>
          <p>
            Corré el seed o importá un catálogo desde{' '}
            <Link className="mono" href="/panel/catalogos">
              Catálogos
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const versionsPage = await tryApiFetch<{ items: CatalogVersionSummary[] }>(
    `/catalogs/${selected.id}/versions`,
  );
  const versions = versionsPage?.items ?? [];

  const query = new URLSearchParams({ catalogId: selected.id, limit: '20' });
  if (params.version) query.set('versionId', params.version);
  if (params.q) query.set('q', params.q);
  if (params.categoria) query.set('category', params.categoria);

  let initialPage: ProductListResponse | null = null;
  let loadError: string | null = null;
  try {
    initialPage = await apiFetch<ProductListResponse>(`/products?${query.toString()}`);
  } catch (caught) {
    if (caught instanceof ApiError) {
      loadError =
        caught.code === 'NO_ACTIVE_VERSION'
          ? 'Este catálogo no tiene versión activa. Importá y activá una versión.'
          : caught.message;
    } else {
      loadError = caught instanceof Error ? caught.message : 'No pudimos leer los productos.';
    }
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Productos · por versión</span>
          <h1 className="display">
            El estante <em>real</em>.
          </h1>
          <p>
            Leyendo {selected.name} · {selected.currency}. Los productos siempre pertenecen a una
            versión; activar otra no reescribe el pasado.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{initialPage?.items.length ?? 0}</strong>
          <span>productos en esta página</span>
        </div>
      </header>

      {items.length > 1 ? (
        <div className="filter-row" style={{ marginBottom: '1.2rem' }}>
          {items.map((catalog) => (
            <Link
              className="filter-chip"
              data-active={catalog.id === selected.id}
              href={`/panel/productos?catalogo=${catalog.id}`}
              key={catalog.id}
            >
              {catalog.name} · {catalog.productCount}
            </Link>
          ))}
        </div>
      ) : null}

      {loadError ? (
        <section className="panel">
          <div className="panel__body">
            <div className="alert">{loadError}</div>
            <Link className="btn btn--small btn--secondary" href={`/panel/catalogos/${selected.id}`}>
              Importar o activar una versión
            </Link>
          </div>
        </section>
      ) : initialPage ? (
        <ProductsBrowser
          key={selected.id}
          catalogId={selected.id}
          versions={versions}
          initialPage={initialPage}
        />
      ) : (
        <div className="empty">
          <span className="empty__mark">∅</span>
          <h3>Sin productos</h3>
          <p>Importá una versión del catálogo para empezar.</p>
        </div>
      )}
    </div>
  );
}
