'use client';

import { useState, type FormEvent } from 'react';
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
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const categories = Array.from(
    new Set(initialPage.items.map((item) => item.category).filter((value): value is string => Boolean(value))),
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
        throw new Error((payload as { message?: string } | null)?.message ?? 'No pudimos leer los productos.');
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

  async function uploadImage(productId: string, file: File) {
    setUploadingId(productId);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`/api/v1/products/${productId}/image`, {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as {
        imageKey?: string | null;
        imageUrl?: string | null;
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? 'No pudimos subir la imagen.');
      }
      setItems((current) =>
        current.map((item) =>
          item.id === productId
            ? { ...item, imageKey: payload?.imageKey ?? item.imageKey, imageUrl: payload?.imageUrl ?? null }
            : item,
        ),
      );
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setUploadingId(null);
    }
  }

  async function removeImage(productId: string) {
    setUploadingId(productId);
    setUploadError(null);
    try {
      const response = await fetch(`/api/v1/products/${productId}/image`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'No pudimos quitar la imagen.');
      }
      setItems((current) =>
        current.map((item) => (item.id === productId ? { ...item, imageKey: null, imageUrl: null } : item)),
      );
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2>Productos por versión</h2>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Mostrando v{versionNumber} · nunca se mezclan versiones.
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
            <select className="select" value={versionId} onChange={(event) => setVersionId(event.target.value)}>
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

        <div aria-live="polite">
          {error ? <div className="alert">{error}</div> : null}
          {uploadError ? <div className="alert">{uploadError}</div> : null}
        </div>
      </div>

      {items.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Imagen</th>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Marca</th>
                  <th>Precio</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="thumb-cell">
                        {product.imageUrl ? (
                          <img
                            className="thumb"
                            src={product.imageUrl}
                            alt={`Imagen de ${product.name}`}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="thumb thumb--empty" aria-hidden>
                            —
                          </span>
                        )}
                        <span className="thumb-cell__actions">
                          <input
                            className="thumb-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/svg+xml"
                            aria-label={`Subir imagen de ${product.name}`}
                            disabled={uploadingId !== null}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadImage(product.id, file);
                              event.target.value = '';
                            }}
                          />
                          {product.imageUrl ? (
                            <button
                              type="button"
                              className="thumb-remove"
                              disabled={uploadingId !== null}
                              onClick={() => void removeImage(product.id)}
                            >
                              Quitar
                            </button>
                          ) : null}
                          {uploadingId === product.id ? (
                            <span className="mono faint">Subiendo…</span>
                          ) : null}
                        </span>
                      </div>
                    </td>
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
                    <td>{product.brand ?? '—'}</td>
                    <td className="table__num">
                      {formatMoney(product.priceMinor, product.currency)}
                    </td>
                    <td className="table__num">{product.stock ?? '∞'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
