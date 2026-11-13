'use client';

import Link from 'next/link';
import { useState, useEffect, type CSSProperties } from 'react';
import { formatMoney, taxLabel } from '@/lib/format';
import type { PublicCatalog, ProductSummary } from '@/lib/types';
import { AddToCartButton } from '@/components/store/add-to-cart-button';
import { ProductDetailModal } from '@/components/store/product-detail-modal';
import { ShareCatalogModal } from '@/components/store/share-catalog-modal';

interface CatalogViewProps {
  catalog: PublicCatalog;
  category?: string;
  basePath: string;
}

export function CatalogView({ catalog, category, basePath }: CatalogViewProps) {
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'original' | 'price-asc' | 'price-desc' | 'name-asc'>('original');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}${basePath}`);
    }
  }, [basePath]);

  const categories = [...new Set(catalog.products.map((product) => product.category ?? 'General'))];
  const categoryCounts = catalog.products.reduce<Record<string, number>>((acc, product) => {
    const key = product.category ?? 'General';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // 1. Filtrado base por categoría
  const categoryProducts = category
    ? catalog.products.filter((product) => (product.category ?? 'General') === category)
    : catalog.products;

  // 2. Filtro rápido de disponibilidad
  const stockFiltered = onlyAvailable
    ? categoryProducts.filter((product) => product.stock === null || product.stock > 0)
    : categoryProducts;

  // 3. Búsqueda instantánea en vivo
  const q = searchQuery.trim().toLowerCase();
  const searchFiltered = q
    ? stockFiltered.filter((product) => {
        const name = product.name.toLowerCase();
        const sku = product.sku.toLowerCase();
        const brand = (product.brand ?? '').toLowerCase();
        const cat = (product.category ?? '').toLowerCase();
        const desc = (product.description ?? '').toLowerCase();
        return (
          name.includes(q) ||
          sku.includes(q) ||
          brand.includes(q) ||
          cat.includes(q) ||
          desc.includes(q)
        );
      })
    : stockFiltered;

  // 4. Ordenamiento
  const processedProducts = [...searchFiltered].sort((a, b) => {
    if (sortBy === 'price-asc') {
      const diff = BigInt(a.priceMinor) - BigInt(b.priceMinor);
      return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    }
    if (sortBy === 'price-desc') {
      const diff = BigInt(b.priceMinor) - BigInt(a.priceMinor);
      return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    }
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    }
    return 0; // 'original'
  });

  const words = catalog.name.trim().split(/\s+/);
  const lastWord = words.length > 1 ? words.pop() : null;
  const firstPart = words.join(' ');

  return (
    <>
      <section className="store-hero">
        <div className="stack rise" style={{ '--i': 0 } as CSSProperties}>
          <span className="eyebrow">{catalog.organizationName} · catálogo publicado</span>
          <h1 className="store-hero__title display">
            {firstPart ? (
              <>
                {firstPart}
                <br />
                <em>{lastWord}</em>
              </>
            ) : (
              <em>{catalog.name}</em>
            )}
          </h1>
        </div>
        <aside className="store-hero__aside rise" style={{ '--i': 1 } as CSSProperties}>
          <p>
            {catalog.description ??
              'Una selección curada de productos, contada con calma y precio claro.'}
          </p>
          <div className="store-hero__stamp drift">
            <span>Versión activa</span>
            <strong>v{catalog.versionNumber}</strong>
            <span>{catalog.products.length} piezas</span>
          </div>
        </aside>
      </section>

      <div className="store-strip">
        <span>Precios en {catalog.currency}</span>
        <span>{taxLabel(catalog.taxRateBp, catalog.taxIncluded)}</span>
        <span>Stock actualizado</span>
        <span>Pedidos y pagos llegan en F1–F2</span>
      </div>

      <section className="catalog-section">
        <div className="catalog-section__head">
          <div className="stack" style={{ gap: '0.35rem' }}>
            <span className="eyebrow">La colección</span>
            <h2>
              {category ? category : 'Todo lo que hay'} <em>/</em> {categoryProducts.length}
            </h2>
          </div>
          <div className="stack" style={{ gap: '0.7rem', justifyItems: 'end' }}>
            <p>
              Cada producto pertenece a esta versión del catálogo. El precio es el que ve el
              cliente, sin sorpresas al final.
            </p>
            {categories.length > 1 ? (
              <div
                className="filter-row filter-row--categories"
                role="tablist"
                aria-label="Subcarpetas del catálogo"
              >
                <Link
                  className="filter-chip filter-chip--category"
                  data-active={!category}
                  href={basePath}
                  role="tab"
                  aria-selected={!category}
                  style={{ '--chip-index': 0 } as CSSProperties}
                >
                  <span>Todos</span>
                  <span className="filter-chip__count">{catalog.products.length}</span>
                </Link>
                {categories.map((item, index) => (
                  <Link
                    className="filter-chip filter-chip--category"
                    data-active={category === item}
                    href={`${basePath}?categoria=${encodeURIComponent(item)}`}
                    key={item}
                    role="tab"
                    aria-selected={category === item}
                    style={{ '--chip-index': index + 1 } as CSSProperties}
                  >
                    <span>{item}</span>
                    <span className="filter-chip__count">{categoryCounts[item] ?? 0}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Barra de Controles y Búsqueda en vivo */}
        <div className="catalog-controls">
          <div className="catalog-controls__top">
            <div className="catalog-search">
              <span className="catalog-search__icon" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </span>
              <input
                type="text"
                className="catalog-search__input"
                placeholder="Buscar por nombre, SKU, marca, categoría o descripción…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Buscar en el catálogo"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="catalog-search__clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              ) : null}
            </div>

            <button
              type="button"
              className="btn btn--secondary catalog-controls__share-btn"
              onClick={() => setShowShareModal(true)}
              title="Compartir catálogo con código QR y enlace"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Compartir catálogo
            </button>
          </div>

          <div className="catalog-controls__bottom">
            <div className="catalog-controls__filters">
              <div className="catalog-sort-wrap">
                <label htmlFor="catalog-sort-select" className="sr-only">
                  Ordenar por
                </label>
                <select
                  id="catalog-sort-select"
                  className="catalog-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Ordenar productos por"
                >
                  <option value="original">Orden original</option>
                  <option value="price-asc">Menor precio</option>
                  <option value="price-desc">Mayor precio</option>
                  <option value="name-asc">Nombre A-Z</option>
                </select>
              </div>

              <button
                type="button"
                className="catalog-toggle-btn"
                data-active={onlyAvailable}
                onClick={() => setOnlyAvailable(!onlyAvailable)}
                role="switch"
                aria-checked={onlyAvailable}
              >
                <span className="catalog-toggle-btn__indicator" aria-hidden="true">
                  {onlyAvailable ? '✓' : '○'}
                </span>
                Solo disponibles
              </button>
            </div>

            <div className="catalog-controls__right">
              <span className="catalog-controls__counter">
                {q || onlyAvailable ? (
                  <>
                    Mostrando <strong>{processedProducts.length}</strong> de {categoryProducts.length}
                  </>
                ) : (
                  <>
                    <strong>{processedProducts.length}</strong> {processedProducts.length === 1 ? 'producto' : 'productos'}
                  </>
                )}
              </span>

              <div className="catalog-view-toggle" role="group" aria-label="Modo de visualización">
                <button
                  type="button"
                  className="catalog-view-toggle__btn"
                  data-active={viewMode === 'grid'}
                  onClick={() => setViewMode('grid')}
                  aria-label="Vista cuadrícula"
                  title="Vista en cuadrícula"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  <span className="catalog-view-toggle__label">Cuadrícula</span>
                </button>
                <button
                  type="button"
                  className="catalog-view-toggle__btn"
                  data-active={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                  aria-label="Vista lista"
                  title="Vista en lista"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  <span className="catalog-view-toggle__label">Lista</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {processedProducts.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="product-grid">
              {processedProducts.map((product, index) => (
                <article
                  className="product-card rise"
                  key={product.id}
                  style={{ '--i': Math.min(index, 8) } as CSSProperties}
                >
                  <div
                    className="product-card__media product-card__media--clickable"
                    onClick={() => setSelectedProduct(product)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedProduct(product);
                      }
                    }}
                    aria-label={`Ver detalle de ${product.name}`}
                  >
                    {product.imageUrl ? (
                      <img
                        className="product-card__img"
                        src={product.imageUrl}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="product-card__placeholder" aria-hidden>
                        {(product.name.trim()[0] ?? '·').toUpperCase()}
                      </span>
                    )}
                    <span className="product-card__media-hint" aria-hidden>
                      Ver detalle ↗
                    </span>
                  </div>
                  <div className="product-card__top">
                    <span className="product-card__index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="product-card__cat">{product.category ?? 'General'}</span>
                  </div>
                  <div
                    className="product-card__body product-card__body--clickable"
                    onClick={() => setSelectedProduct(product)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedProduct(product);
                      }
                    }}
                    aria-label={`Ver detalle de ${product.name}`}
                  >
                    <h3 className="product-card__name">{product.name}</h3>
                    <p className="product-card__desc">
                      {product.description ?? 'Selección de la casa.'}
                    </p>
                    <span className="product-card__detail-link">Ver detalle ↗</span>
                  </div>
                  <div className="product-card__foot">
                    <div
                      onClick={() => setSelectedProduct(product)}
                      style={{ cursor: 'pointer' }}
                      title="Ver detalle"
                    >
                      <span className="product-card__price">
                        {formatMoney(product.priceMinor, product.currency)}
                      </span>
                      <span className="product-card__stock">
                        {product.stock === null
                          ? 'Disponible'
                          : product.stock > 0
                            ? `${product.stock} en stock`
                            : 'Agotado'}
                      </span>
                    </div>
                  </div>
                  <div className="product-card__actions">
                    <AddToCartButton
                      product={{
                        id: product.id,
                        sku: product.sku,
                        name: product.name,
                        priceMinor: product.priceMinor,
                        currency: product.currency,
                        imageUrl: product.imageUrl ?? null,
                      }}
                      catalog={{ slug: catalog.slug, name: catalog.name }}
                      disabled={product.stock !== null && product.stock <= 0}
                    />
                  </div>
                  <span className="product-card__sku">{product.sku}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="product-list">
              {processedProducts.map((product, index) => (
                <article
                  className="product-list-card rise"
                  key={product.id}
                  style={{ '--i': Math.min(index, 8) } as CSSProperties}
                >
                  <div
                    className="product-list-card__media"
                    onClick={() => setSelectedProduct(product)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedProduct(product);
                      }
                    }}
                    aria-label={`Ver detalle de ${product.name}`}
                  >
                    {product.imageUrl ? (
                      <img
                        className="product-list-card__img"
                        src={product.imageUrl}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="product-list-card__placeholder" aria-hidden>
                        {(product.name.trim()[0] ?? '·').toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div
                    className="product-list-card__main"
                    onClick={() => setSelectedProduct(product)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedProduct(product);
                      }
                    }}
                  >
                    <div className="product-list-card__tags">
                      <span className="product-card__index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="product-card__cat">{product.category ?? 'General'}</span>
                      {product.brand ? (
                        <span className="product-modal__brand">· {product.brand}</span>
                      ) : null}
                      <span className="product-card__sku">SKU: {product.sku}</span>
                    </div>
                    <h3 className="product-list-card__title">{product.name}</h3>
                    {product.description ? (
                      <p className="product-list-card__desc">{product.description}</p>
                    ) : null}
                  </div>

                  <div className="product-list-card__pricing">
                    <span className="product-list-card__price">
                      {formatMoney(product.priceMinor, product.currency)}
                    </span>
                    <span
                      className="product-list-card__stock"
                      data-state={product.stock !== null && product.stock <= 0 ? 'out-of-stock' : 'in-stock'}
                    >
                      {product.stock === null
                        ? 'Disponible'
                        : product.stock > 0
                          ? `${product.stock} en stock`
                          : 'Agotado'}
                    </span>
                  </div>

                  <div className="product-list-card__actions">
                    <AddToCartButton
                      product={{
                        id: product.id,
                        sku: product.sku,
                        name: product.name,
                        priceMinor: product.priceMinor,
                        currency: product.currency,
                        imageUrl: product.imageUrl ?? null,
                      }}
                      catalog={{ slug: catalog.slug, name: catalog.name }}
                      disabled={product.stock !== null && product.stock <= 0}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() => setSelectedProduct(product)}
                    >
                      Ver detalle ↗
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : q || onlyAvailable ? (
          <div className="empty">
            <span className="empty__mark">🔍</span>
            <h3>No se encontraron productos</h3>
            <p>
              No encontramos coincidencias para{' '}
              {q ? <strong>&ldquo;{searchQuery}&rdquo;</strong> : ''}
              {q && onlyAvailable ? ' con ' : ''}
              {onlyAvailable ? 'el filtro de solo disponibles' : ''}.
            </p>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setSearchQuery('');
                setOnlyAvailable(false);
              }}
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>No hay piezas en esta categoría</h3>
            <p>Probá con otra categoría o volvé al catálogo completo.</p>
            <Link className="btn btn--secondary" href={basePath}>
              Ver todo
            </Link>
          </div>
        )}
      </section>

      {selectedProduct ? (
        <ProductDetailModal
          product={selectedProduct}
          catalog={{
            slug: catalog.slug,
            name: catalog.name,
            currency: catalog.currency,
            taxRateBp: catalog.taxRateBp,
            taxIncluded: catalog.taxIncluded,
          }}
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}

      {showShareModal ? (
        <ShareCatalogModal
          catalogName={catalog.name}
          organizationName={catalog.organizationName}
          versionNumber={catalog.versionNumber}
          shareUrl={shareUrl}
          onClose={() => setShowShareModal(false)}
        />
      ) : null}
    </>
  );
}
