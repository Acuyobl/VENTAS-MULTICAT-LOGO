'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { CatalogVersionSummary, ProductListResponse } from '@ventascatalogo/contracts';
import { formatMoney } from '@/lib/format';

interface ProductsBrowserProps {
  catalogId: string;
  versions: CatalogVersionSummary[];
  initialPage: ProductListResponse;
}

const PAGE_SIZE = 20;

export function ProductsBrowser({ catalogId, versions, initialPage }: ProductsBrowserProps) {
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor);
  const [versionNumber, setVersionNumber] = useState(initialPage.versionNumber);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [versionId, setVersionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = Array.from(
    new Set(
      initialPage.items
        .map((item) => item.category)
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 30);

  async function load(reset: boolean, cursor?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ catalogId, limit: String(PAGE_SIZE) });
      if (versionId) params.set('versionId', versionId);
      if (query.trim()) params.set('q', query.trim());
      if (category.trim()) params.set('category', category.trim());
      const effectiveCursor = reset ? null : (cursor ?? null);
      if (effectiveCursor) params.set('cursor', effectiveCursor);

      const response = await fetch(`/api/v1/products?${params.toString()}`, {
        headers: { accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => null)) as
        | ProductListResponse
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ?? 'No pudimos leer los productos.',
        );
      }
      const page = payload as ProductListResponse;
      setItems((current) => (reset ? page.items : [...current, ...page.items]));
      setNextCursor(page.nextCursor);
      setVersionNumber(page.versionNumber);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(true);
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2>Productos por versión</h2>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Mostrando v{versionNumber} · tocá una tarjeta para abrir el detalle.
          </p>
        </div>
        <span className="mono faint">{items.length} cargados</span>
      </div>

      <div className="panel__body">
        <form className="filter-row" onSubmit={handleSubmit} style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
          <label className="field" style={{ minWidth: '220px' }}>
            <span className="field__label">Buscar</span>
            <input
              className="input"
              type="search"
              value={query}
              placeholder="SKU o nombre"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="field" style={{ minWidth: '180px' }}>
            <span className="field__label">Categoría</span>
            <input
              className="input"
              value={category}
              list="product-categories"
              placeholder="Todas"
              onChange={(event) => setCategory(event.target.value)}
            />
            <datalist id="product-categories">
              {categories.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>

          <label className="field" style={{ minWidth: '200px' }}>
            <span className="field__label">Versión</span>
            <select
              className="select"
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
            >
              <option value="">Versión activa</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.versionNumber} · {version.status}
                </option>
              ))}
            </select>
          </label>

          <button className="btn btn--small" type="submit" disabled={loading}>
            {loading ? 'Buscando…' : 'Aplicar filtros'}
          </button>
        </form>

        {error ? <div className="alert">{error}</div> : null}
      </div>

      {items.length > 0 ? (
        <>
          <div className="bo-product-grid">
            {items.map((product) => (
              <Link
                className="bo-product-tile"
                key={product.id}
                href={`/panel/productos/${product.id}`}
              >
                <span className="bo-bo-product-tile__media">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={`Imagen de ${product.name}`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="mono faint">Sin imagen</span>
                  )}
                </span>
                <span className="bo-bo-product-tile__body">
                  <span className="badge">{product.category ?? 'General'}</span>
                  <strong>{product.name}</strong>
                  <span className="mono faint" style={{ fontSize: '0.7rem' }}>
                    {product.sku} · {product.brand ?? 'Sin marca'}
                  </span>
                  <span className="bo-bo-product-tile__price">
                    {formatMoney(product.priceMinor, product.currency)}
                  </span>
                  <span className="mono faint" style={{ fontSize: '0.7rem' }}>
                    Stock {product.stock ?? '∞'} · ver detalle →
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <div className="panel__body inline" style={{ justifyContent: 'space-between' }}>
            <span className="mono faint">
              {nextCursor ? 'Hay más resultados' : 'Fin del listado'}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              disabled={loading || !nextCursor}
              onClick={() => void load(false, nextCursor)}
            >
              {loading ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>
        </>
      ) : (
        <div className="empty">
          <span className="empty__mark">∅</span>
          <h3>Sin productos para este filtro</h3>
          <p>Probá con otro término o importá una versión nueva del catálogo.</p>
        </div>
      )}

      <div className="panel__foot">
        Paginación por cursor ({PAGE_SIZE} por página) directa contra la versión seleccionada.
      </div>
    </section>
  );
}
